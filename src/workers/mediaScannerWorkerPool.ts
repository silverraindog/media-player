import { MediaMetadata, MediaScanExtensionConfig, SambaShareNode } from '../types';
import { normalizeFranchiseHierarchy } from '../utils/franchiseHierarchy';
import {
  DEFAULT_MEDIA_SCAN_CONFIG,
  detectMediaType,
  extractMediaFromNodeEntries,
  flattenTreeToEntries,
  mergeMediaMetadataIntoMap,
  NodeExtractionTaskEntry,
  parseTitleAndYear,
} from '../utils/mediaParserCore';
import type { RawScannedItemInput, ScannerWorkerRequest, ScannerWorkerResponse } from './mediaScanner.worker';

export interface WorkerPoolProgress {
  processedNodes: number;
  totalNodes: number;
  completedChunks: number;
  totalChunks: number;
  activeWorkers: number;
  discoveredCount: number;
}

export interface WorkerPoolStats {
  poolSize: number;
  activeWorkers: number;
  queuedTasks: number;
  totalTasksCompleted: number;
  isSupported: boolean;
}

interface PooledWorker {
  id: number;
  worker: Worker;
  busy: boolean;
  currentRequestId: number | null;
}

interface QueuedTask {
  request: ScannerWorkerRequest;
  resolve: (response: ScannerWorkerResponse) => void;
  reject: (err: Error) => void;
}

const IDLE_TERMINATE_MS = 30_000;

class MediaScannerWorkerPool {
  private workers: PooledWorker[] = [];
  private taskQueue: QueuedTask[] = [];
  private pendingResolvers = new Map<
    number,
    { workerSlot: PooledWorker; resolve: (res: ScannerWorkerResponse) => void; reject: (err: Error) => void }
  >();
  private nextRequestId = 1;
  private totalTasksCompleted = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxWorkers: number;

  constructor() {
    const hwConcurrency =
      typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
        ? navigator.hardwareConcurrency
        : 4;
    this.maxWorkers = Math.min(4, Math.max(2, hwConcurrency - 1));
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && typeof Worker !== 'undefined';
  }

  public getStats(): WorkerPoolStats {
    return {
      poolSize: this.maxWorkers,
      activeWorkers: this.workers.filter((w) => w.busy).length,
      queuedTasks: this.taskQueue.length,
      totalTasksCompleted: this.totalTasksCompleted,
      isSupported: this.isSupported(),
    };
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleIdleShutdown(): void {
    this.clearIdleTimer();
    if (this.workers.length === 0) return;
    if (this.taskQueue.length > 0 || this.pendingResolvers.size > 0) return;

    this.idleTimer = setTimeout(() => {
      if (this.taskQueue.length === 0 && this.pendingResolvers.size === 0) {
        this.terminateAll();
      }
    }, IDLE_TERMINATE_MS);
  }

  private spawnWorkerIfNeeded(): PooledWorker | null {
    if (!this.isSupported()) return null;
    const idleSlot = this.workers.find((w) => !w.busy);
    if (idleSlot) return idleSlot;

    if (this.workers.length < this.maxWorkers) {
      try {
        const worker = new Worker(new URL('./mediaScanner.worker.ts', import.meta.url), {
          type: 'module',
        });
        const slot: PooledWorker = {
          id: this.workers.length + 1,
          worker,
          busy: false,
          currentRequestId: null,
        };

        worker.onmessage = (event: MessageEvent<ScannerWorkerResponse>) => {
          const response = event.data;
          const pending = this.pendingResolvers.get(response.id);
          if (!pending) return;

          this.pendingResolvers.delete(response.id);
          pending.workerSlot.busy = false;
          pending.workerSlot.currentRequestId = null;
          this.totalTasksCompleted += 1;

          if (response.ok) {
            pending.resolve(response);
          } else {
            const errMsg = 'error' in response ? response.error : undefined;
            pending.reject(new Error(errMsg || 'Worker processing error'));
          }

          this.pumpQueue();
        };

        worker.onerror = (err) => {
          const reqId = slot.currentRequestId;
          slot.busy = false;
          slot.currentRequestId = null;
          if (reqId !== null) {
            const pending = this.pendingResolvers.get(reqId);
            if (pending) {
              this.pendingResolvers.delete(reqId);
              pending.reject(new Error(err?.message || 'Worker crashed during media scan'));
            }
          }
          // Remove broken worker slot and pump queue
          this.workers = this.workers.filter((w) => w !== slot);
          try {
            worker.terminate();
          } catch {}
          this.pumpQueue();
        };

        this.workers.push(slot);
        return slot;
      } catch {
        return null;
      }
    }

    return null;
  }

  private pumpQueue(): void {
    while (this.taskQueue.length > 0) {
      const slot = this.spawnWorkerIfNeeded();
      if (!slot) break;

      const task = this.taskQueue.shift()!;
      slot.busy = true;
      slot.currentRequestId = task.request.id;
      this.pendingResolvers.set(task.request.id, {
        workerSlot: slot,
        resolve: task.resolve,
        reject: task.reject,
      });
      slot.worker.postMessage(task.request);
    }

    this.scheduleIdleShutdown();
  }

  private enqueueRequest(request: ScannerWorkerRequest): Promise<ScannerWorkerResponse> {
    this.clearIdleTimer();
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ request, resolve, reject });
      this.pumpQueue();
    });
  }

  public terminateAll(): void {
    this.clearIdleTimer();
    for (const slot of this.workers) {
      try {
        slot.worker.terminate();
      } catch {}
    }
    this.workers = [];
    for (const pending of this.pendingResolvers.values()) {
      pending.reject(new Error('Worker pool terminated'));
    }
    this.pendingResolvers.clear();
    while (this.taskQueue.length > 0) {
      const t = this.taskQueue.shift();
      t?.reject(new Error('Worker pool terminated'));
    }
  }

  /**
   * Distributes flattened Samba tree node extraction across the Web Worker pool in parallel chunks
   * and merges results cleanly back into deduplicated MediaMetadata[].
   */
  public async extractMediaFromTreeWithPool(
    nodes: SambaShareNode[],
    config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG,
    onProgress?: (progress: WorkerPoolProgress) => void
  ): Promise<MediaMetadata[]> {
    if (!nodes || nodes.length === 0) return [];

    const normalizedNodes = normalizeFranchiseHierarchy(nodes);
    const allEntries: NodeExtractionTaskEntry[] = flattenTreeToEntries(normalizedNodes);
    if (allEntries.length === 0) return [];

    // For tiny trees (< 40 nodes), extract directly in one fast call without worker overhead
    if (!this.isSupported() || allEntries.length < 40) {
      const items = extractMediaFromNodeEntries(allEntries, config);
      onProgress?.({
        processedNodes: allEntries.length,
        totalNodes: allEntries.length,
        completedChunks: 1,
        totalChunks: 1,
        activeWorkers: 1,
        discoveredCount: items.length,
      });
      return items;
    }

    // Partition entries into balanced chunks across worker pool (aiming for ~2-4 chunks per worker)
    const targetChunks = Math.min(allEntries.length, Math.max(this.maxWorkers * 2, Math.ceil(allEntries.length / 80)));
    const chunkSize = Math.max(25, Math.ceil(allEntries.length / targetChunks));
    const chunks: NodeExtractionTaskEntry[][] = [];
    for (let i = 0; i < allEntries.length; i += chunkSize) {
      chunks.push(allEntries.slice(i, i + chunkSize));
    }

    const mergedMap = new Map<string, MediaMetadata>();
    let completedChunks = 0;
    let processedNodes = 0;

    try {
      const promises = chunks.map(async (chunk) => {
        const reqId = this.nextRequestId++;
        const response = await this.enqueueRequest({
          id: reqId,
          type: 'EXTRACT_NODES_CHUNK',
          payload: {
            entries: chunk,
            config,
          },
        });

        if (response.ok && response.type === 'EXTRACT_RESULT') {
          for (const item of response.items) {
            mergeMediaMetadataIntoMap(mergedMap, item);
          }
          processedNodes += response.processedCount;
        }
        completedChunks += 1;
        onProgress?.({
          processedNodes,
          totalNodes: allEntries.length,
          completedChunks,
          totalChunks: chunks.length,
          activeWorkers: Math.min(this.maxWorkers, chunks.length),
          discoveredCount: mergedMap.size,
        });
      });

      await Promise.all(promises);
      return Array.from(mergedMap.values());
    } catch {
      // Safe fallback to chunked async main-thread extraction if worker fails (e.g. CSP restrictions)
      const fallbackMap = new Map<string, MediaMetadata>();
      for (let i = 0; i < chunks.length; i++) {
        const items = extractMediaFromNodeEntries(chunks[i], config);
        for (const item of items) {
          mergeMediaMetadataIntoMap(fallbackMap, item);
        }
        onProgress?.({
          processedNodes: Math.min(allEntries.length, (i + 1) * chunkSize),
          totalNodes: allEntries.length,
          completedChunks: i + 1,
          totalChunks: chunks.length,
          activeWorkers: 1,
          discoveredCount: fallbackMap.size,
        });
        await new Promise((r) => setTimeout(r, 0));
      }
      return Array.from(fallbackMap.values());
    }
  }

  /**
   * Parses large batches of raw scanned file paths / file names in parallel across the Web Worker pool.
   */
  public async parseRawFilesWithPool(
    files: RawScannedItemInput[],
    effectivePrefix: string = ''
  ): Promise<
    Array<{
      path: string;
      name: string;
      title: string;
      year: number;
      season?: number;
      episode?: number;
      mediaType: 'movie' | 'series' | 'album';
    }>
  > {
    if (!files || files.length === 0) return [];

    const parseLocally = (batch: RawScannedItemInput[]) =>
      batch.map((item) => {
        const cleanRel = (item.rel_path || item.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const fullPath = item.path || (effectivePrefix ? `${effectivePrefix}/${cleanRel}` : cleanRel);
        const name = item.name || cleanRel.split('/').pop() || cleanRel;
        const parsed = parseTitleAndYear(name);
        const mediaType = detectMediaType(fullPath);
        return {
          path: fullPath,
          name,
          title: parsed.title,
          year: parsed.year,
          season: parsed.season,
          episode: parsed.episode,
          mediaType,
        };
      });

    if (!this.isSupported() || files.length < 40) {
      return parseLocally(files);
    }

    const chunkSize = Math.max(40, Math.ceil(files.length / (this.maxWorkers * 2)));
    const chunks: RawScannedItemInput[][] = [];
    for (let i = 0; i < files.length; i += chunkSize) {
      chunks.push(files.slice(i, i + chunkSize));
    }

    try {
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const reqId = this.nextRequestId++;
          const response = await this.enqueueRequest({
            id: reqId,
            type: 'PARSE_RAW_FILES_CHUNK',
            payload: {
              files: chunk,
              effectivePrefix,
            },
          });
          if (response.ok && response.type === 'PARSE_RAW_RESULT') {
            return response.parsedEntries;
          }
          return parseLocally(chunk);
        })
      );
      return results.flat();
    } catch {
      return parseLocally(files);
    }
  }
}

export const mediaScannerWorkerPool = new MediaScannerWorkerPool();
