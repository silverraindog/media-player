import { MediaMetadata, MediaScanExtensionConfig, SambaConfig, SambaShareNode } from '../types';
import { DEFAULT_MEDIA_SCAN_CONFIG, parsedFileToMediaMetadata } from '../utils/mediaExtractor';
import type {
  BackgroundSyncWorkerConfig,
  BackgroundSyncWorkerEvent,
  BackgroundSyncWorkerMessage,
  DiscoveredBackgroundMediaEntry,
} from '../workers/backgroundSync.worker';

export interface BackgroundSyncCallbacks {
  onNewMediaDiscovered: (items: MediaMetadata[], rawEntries: DiscoveredBackgroundMediaEntry[], resolvedPath: string) => void;
  onSyncCheckCompleted?: (scannedCount: number, durationMs: number) => void;
  onSyncError?: (error: string) => void;
}

export interface BackgroundSyncStatus {
  isActive: boolean;
  isSupported: boolean;
  lastCheckedAt: number | null;
  lastDiscoveredCount: number;
  totalDiscoveredInSession: number;
}

function collectKnownPaths(sambaTree: SambaShareNode[], mediaLibrary: MediaMetadata[]): string[] {
  const paths = new Set<string>();

  const stack: SambaShareNode[] = [...(sambaTree || [])];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === 'file' && node.path) {
      paths.add(node.path);
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      for (let i = 0; i < node.children.length; i++) {
        stack.push(node.children[i]);
      }
    }
  }

  for (let i = 0; i < (mediaLibrary || []).length; i++) {
    const item = mediaLibrary[i];
    if (item.path) paths.add(item.path);
    if (item.playbackUrl && !item.playbackUrl.startsWith('http') && !item.playbackUrl.startsWith('blob:')) {
      paths.add(item.playbackUrl);
    }
    if (item.matchedFilename) paths.add(item.matchedFilename);
    if (Array.isArray(item.seasons)) {
      for (const season of item.seasons) {
        if (Array.isArray(season.episodes)) {
          for (const ep of season.episodes) {
            if (ep.filePath) paths.add(ep.filePath);
          }
        }
      }
    }
    if (Array.isArray(item.tracks)) {
      for (const tr of item.tracks) {
        if (tr.playbackUrl && !tr.playbackUrl.startsWith('http') && !tr.playbackUrl.startsWith('blob:')) {
          paths.add(tr.playbackUrl);
        }
      }
    }
  }

  return Array.from(paths);
}

function discoveredEntryToMediaMetadata(entry: DiscoveredBackgroundMediaEntry): MediaMetadata {
  const base = parsedFileToMediaMetadata({
    id: entry.id,
    originalFilename: entry.name,
    detectedType: entry.mediaType,
    detectedTitle: entry.title,
    detectedYear: entry.year,
    detectedSeason: entry.season,
    detectedEpisode: entry.episode,
    cleanFormattedFilename: entry.name,
    cleanFolderPath: entry.parentFolder,
    status: 'matched',
  });

  return {
    ...base,
    id: entry.id,
    path: entry.fullPath,
    folderPath: entry.parentFolder,
    playbackUrl: entry.playbackUrl,
    recommendedFolderStructure: entry.parentFolder || base.recommendedFolderStructure,
    source: 'samba-background-sync',
  };
}

class BackgroundSyncService {
  private worker: Worker | null = null;
  private callbacks: BackgroundSyncCallbacks | null = null;
  private visibilityListener: (() => void) | null = null;
  private lastCheckedAt: number | null = null;
  private lastDiscoveredCount = 0;
  private totalDiscoveredInSession = 0;
  private lastSeedSignature = '';

  public isSupported(): boolean {
    return typeof window !== 'undefined' && typeof Worker !== 'undefined';
  }

  public getStatus(): BackgroundSyncStatus {
    return {
      isActive: this.worker !== null,
      isSupported: this.isSupported(),
      lastCheckedAt: this.lastCheckedAt,
      lastDiscoveredCount: this.lastDiscoveredCount,
      totalDiscoveredInSession: this.totalDiscoveredInSession,
    };
  }

  public start(
    params: {
      sambaConfig: SambaConfig;
      extensionConfig?: MediaScanExtensionConfig;
      maxDepth?: number;
      intervalMs?: number;
      paused?: boolean;
      sambaTree?: SambaShareNode[];
      mediaLibrary?: MediaMetadata[];
    },
    callbacks: BackgroundSyncCallbacks
  ): void {
    this.callbacks = callbacks;
    if (!this.isSupported()) return;

    const workerConfig = this.buildWorkerConfig(params);

    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('../workers/backgroundSync.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = (event: MessageEvent<BackgroundSyncWorkerEvent>) => {
          this.handleWorkerEvent(event.data);
        };
        this.worker.onerror = (err) => {
          this.callbacks?.onSyncError?.(err?.message || 'Background sync worker encountered an error');
        };
        this.attachVisibilityListener();
      } catch {
        this.worker = null;
        return;
      }
    }

    if (params.sambaTree || params.mediaLibrary) {
      this.seedKnownPaths(params.sambaTree || [], params.mediaLibrary || [], true);
    }

    this.post({ type: 'START', config: workerConfig });
  }

  public updateConfig(params: {
    sambaConfig: SambaConfig;
    extensionConfig?: MediaScanExtensionConfig;
    maxDepth?: number;
    intervalMs?: number;
    paused?: boolean;
  }): void {
    if (!this.worker) return;
    this.post({ type: 'UPDATE_CONFIG', config: this.buildWorkerConfig(params) });
  }

  public seedKnownPaths(sambaTree: SambaShareNode[], mediaLibrary: MediaMetadata[], replace = false): void {
    if (!this.worker) return;
    const signature = `${sambaTree?.length || 0}:${mediaLibrary?.length || 0}`;
    if (!replace && signature === this.lastSeedSignature) return;
    this.lastSeedSignature = signature;

    const paths = collectKnownPaths(sambaTree, mediaLibrary);
    if (paths.length === 0 && !replace) return;
    this.post({ type: 'SEED_KNOWN_PATHS', paths, replace });
  }

  public triggerCheckNow(): void {
    if (!this.worker) return;
    this.post({ type: 'RUN_CHECK_NOW' });
  }

  public stop(): void {
    this.detachVisibilityListener();
    if (this.worker) {
      try {
        this.post({ type: 'STOP' });
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
    this.lastSeedSignature = '';
  }

  private buildWorkerConfig(params: {
    sambaConfig: SambaConfig;
    extensionConfig?: MediaScanExtensionConfig;
    maxDepth?: number;
    intervalMs?: number;
    paused?: boolean;
  }): BackgroundSyncWorkerConfig {
    const cfg = params.sambaConfig;
    return {
      enabled: Boolean(cfg.enabled),
      mountPath: cfg.hostPath || cfg.mountPath || cfg.baseMountPath || '/Volumes/media',
      sharePath: cfg.mountPath || cfg.hostPath || cfg.baseMountPath || '/Volumes/media',
      shareName: cfg.share || 'media',
      maxDepth: params.maxDepth || cfg.depthLimit || 20,
      intervalMs: params.intervalMs ?? 60_000,
      paused: Boolean(params.paused),
      isPageVisible: typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true,
      extensionConfig: params.extensionConfig || DEFAULT_MEDIA_SCAN_CONFIG,
    };
  }

  private post(message: BackgroundSyncWorkerMessage): void {
    try {
      this.worker?.postMessage(message);
    } catch {}
  }

  private handleWorkerEvent(event: BackgroundSyncWorkerEvent): void {
    if (!event) return;
    if (event.type === 'NEW_FILES_FOUND') {
      this.lastCheckedAt = Date.now();
      this.lastDiscoveredCount = event.entries.length;
      this.totalDiscoveredInSession += event.entries.length;

      const mediaItems = event.entries.map(discoveredEntryToMediaMetadata);
      this.callbacks?.onNewMediaDiscovered(mediaItems, event.entries, event.resolvedPath);
      this.callbacks?.onSyncCheckCompleted?.(event.scannedCount, event.durationMs);
    } else if (event.type === 'NO_CHANGES') {
      this.lastCheckedAt = Date.now();
      this.lastDiscoveredCount = 0;
      this.callbacks?.onSyncCheckCompleted?.(event.scannedCount, event.durationMs);
    } else if (event.type === 'SYNC_ERROR') {
      this.callbacks?.onSyncError?.(event.error);
    }
  }

  private attachVisibilityListener(): void {
    if (typeof document === 'undefined' || this.visibilityListener) return;
    this.visibilityListener = () => {
      const visible = document.visibilityState !== 'hidden';
      this.post({ type: 'UPDATE_CONFIG', config: { isPageVisible: visible } });
    };
    document.addEventListener('visibilitychange', this.visibilityListener);
  }

  private detachVisibilityListener(): void {
    if (typeof document !== 'undefined' && this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }
}

export const backgroundSyncService = new BackgroundSyncService();
