/// <reference lib="webworker" />
import { MediaExtensionCategory, MediaScanExtensionConfig } from '../types';
import {
  DEFAULT_MEDIA_SCAN_CONFIG,
  detectMediaType,
  getDirectPlaybackUrl,
  isMediaFile,
  parseTitleAndYear,
} from '../utils/mediaParserCore';

export interface BackgroundSyncWorkerConfig {
  enabled: boolean;
  mountPath: string;
  sharePath: string;
  shareName: string;
  maxDepth: number;
  intervalMs: number;
  paused: boolean;
  isPageVisible: boolean;
  extensionConfig: MediaScanExtensionConfig;
}

export interface DiscoveredBackgroundMediaEntry {
  id: string;
  name: string;
  relPath: string;
  fullPath: string;
  parentFolder: string;
  title: string;
  year: number;
  season?: number;
  episode?: number;
  mediaType: 'movie' | 'series' | 'album';
  playbackUrl: string;
  sizeStr?: string;
}

export type BackgroundSyncWorkerMessage =
  | { type: 'START'; config: BackgroundSyncWorkerConfig }
  | { type: 'UPDATE_CONFIG'; config: Partial<BackgroundSyncWorkerConfig> }
  | { type: 'SEED_KNOWN_PATHS'; paths: string[]; replace?: boolean }
  | { type: 'RUN_CHECK_NOW' }
  | { type: 'STOP' };

export type BackgroundSyncWorkerEvent =
  | {
      type: 'NEW_FILES_FOUND';
      entries: DiscoveredBackgroundMediaEntry[];
      scannedCount: number;
      durationMs: number;
      resolvedPath: string;
    }
  | {
      type: 'NO_CHANGES';
      scannedCount: number;
      durationMs: number;
    }
  | {
      type: 'SYNC_SKIPPED';
      reason: string;
    }
  | {
      type: 'SYNC_ERROR';
      error: string;
      consecutiveFailures: number;
    };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 300_000;

let currentConfig: BackgroundSyncWorkerConfig = {
  enabled: false,
  mountPath: '/Volumes/media',
  sharePath: '/Volumes/media',
  shareName: 'media',
  maxDepth: 20,
  intervalMs: DEFAULT_INTERVAL_MS,
  paused: false,
  isPageVisible: true,
  extensionConfig: DEFAULT_MEDIA_SCAN_CONFIG,
};

let knownPaths = new Set<string>();
let timerId: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let isCheckInFlight = false;
let consecutiveFailures = 0;

function normalizePathKey(p: string): string {
  return (p || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function clearScheduledTimer(): void {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function getEffectiveIntervalMs(): number {
  const base = Math.max(MIN_INTERVAL_MS, currentConfig.intervalMs || DEFAULT_INTERVAL_MS);
  if (consecutiveFailures === 0) return base;
  const multiplier = Math.min(5, Math.pow(2, consecutiveFailures - 1));
  return Math.min(MAX_BACKOFF_MS, base * multiplier);
}

function scheduleNextCheck(): void {
  clearScheduledTimer();
  if (!isRunning) return;
  if (currentConfig.paused || !currentConfig.isPageVisible) return;

  const delay = getEffectiveIntervalMs();
  timerId = setTimeout(() => {
    void runSyncCheck(false);
  }, delay);
}

function getAllowedExtensionsArray(cfg: MediaScanExtensionConfig): string[] | undefined {
  if (!cfg || cfg.searchAllExtensions) return undefined;
  const exts: string[] = [];
  const map: Record<MediaExtensionCategory, string[]> = {
    video: ['mkv', 'mp4', 'm4v', 'avi', 'mov', 'wmv', 'webm', 'ts', 'm2ts'],
    disc_images: ['iso', 'img', 'bin'],
    audio: ['flac', 'mp3', 'm4a', 'm4b', 'aac', 'ogg', 'opus', 'wav', 'alac'],
    books: ['epub', 'pdf', 'mobi', 'cbz', 'cbr'],
    subtitles: ['srt', 'vtt', 'ass', 'ssa'],
    artwork: ['jpg', 'jpeg', 'png', 'webp'],
    metadata: ['nfo', 'xml'],
  };
  for (const [cat, enabled] of Object.entries(cfg.enabledCategories || {})) {
    if (enabled && map[cat as MediaExtensionCategory]) {
      exts.push(...map[cat as MediaExtensionCategory]);
    }
  }
  if (Array.isArray(cfg.customExtensions)) {
    for (const c of cfg.customExtensions) {
      const clean = c.toLowerCase().replace(/^\./, '').trim();
      if (clean) exts.push(clean);
    }
  }
  return exts.length > 0 ? exts : undefined;
}

async function runSyncCheck(force: boolean): Promise<void> {
  if (!isRunning || isCheckInFlight) return;

  if (!force && (currentConfig.paused || !currentConfig.isPageVisible)) {
    ctx.postMessage({ type: 'SYNC_SKIPPED', reason: 'paused-or-hidden' } satisfies BackgroundSyncWorkerEvent);
    scheduleNextCheck();
    return;
  }

  const targetPath = (currentConfig.mountPath || currentConfig.sharePath || '').trim();
  if (!targetPath) {
    ctx.postMessage({ type: 'SYNC_SKIPPED', reason: 'no-mount-path' } satisfies BackgroundSyncWorkerEvent);
    scheduleNextCheck();
    return;
  }

  isCheckInFlight = true;
  const startedAt = performance.now();

  try {
    const allowedExtensions = getAllowedExtensionsArray(currentConfig.extensionConfig);
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch('/api/samba/scan-volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        mountPath: targetPath,
        sharePath: currentConfig.sharePath || targetPath,
        safeScan: true,
        max_depth: Math.min(30, Math.max(4, currentConfig.maxDepth || 20)),
        concurrency: 6,
        maxItems: 25_000,
        extensions: allowedExtensions,
      }),
    }).finally(() => clearTimeout(abortTimer));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawItems: Array<{ name?: string; path?: string; rel_path?: string; is_dir?: boolean; size_str?: string }> =
      Array.isArray(data?.items) ? data.items : [];
    const resolvedPath: string = (data?.resolvedPath || targetPath).replace(/\\/g, '/').replace(/\/+$/, '');

    const newlyDiscovered: DiscoveredBackgroundMediaEntry[] = [];
    const extCfg = currentConfig.extensionConfig || DEFAULT_MEDIA_SCAN_CONFIG;

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      if (!item || item.is_dir) continue;

      const cleanRel = (item.rel_path || item.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const fullPath = (item.path || (resolvedPath ? `${resolvedPath}/${cleanRel}` : cleanRel)).replace(/\\/g, '/');
      const fileName = item.name || cleanRel.split('/').pop() || cleanRel;
      if (!fileName) continue;

      if (extCfg.ignoreHiddenFiles && (fileName.startsWith('.') || fileName.startsWith('._'))) {
        continue;
      }

      if (!isMediaFile(fileName, extCfg)) continue;

      const fullKey = normalizePathKey(fullPath);
      const relKey = normalizePathKey(cleanRel);
      if (knownPaths.has(fullKey) || (relKey && knownPaths.has(relKey))) {
        continue;
      }

      knownPaths.add(fullKey);
      if (relKey) knownPaths.add(relKey);

      const parsed = parseTitleAndYear(fileName);
      const mediaType = detectMediaType(fullPath);
      const lastSlash = fullPath.lastIndexOf('/');
      const parentFolder = lastSlash > 0 ? fullPath.slice(0, lastSlash) : resolvedPath;

      newlyDiscovered.push({
        id: `bgsync-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: fileName,
        relPath: cleanRel,
        fullPath,
        parentFolder,
        title: parsed.title,
        year: parsed.year,
        season: parsed.season,
        episode: parsed.episode,
        mediaType,
        playbackUrl: getDirectPlaybackUrl(fullPath),
        sizeStr: item.size_str,
      });
    }

    consecutiveFailures = 0;
    const durationMs = Math.round(performance.now() - startedAt);

    if (newlyDiscovered.length > 0) {
      ctx.postMessage({
        type: 'NEW_FILES_FOUND',
        entries: newlyDiscovered,
        scannedCount: rawItems.length,
        durationMs,
        resolvedPath,
      } satisfies BackgroundSyncWorkerEvent);
    } else {
      ctx.postMessage({
        type: 'NO_CHANGES',
        scannedCount: rawItems.length,
        durationMs,
      } satisfies BackgroundSyncWorkerEvent);
    }
  } catch (err: any) {
    consecutiveFailures += 1;
    ctx.postMessage({
      type: 'SYNC_ERROR',
      error: err?.message || 'Background sync check failed',
      consecutiveFailures,
    } satisfies BackgroundSyncWorkerEvent);
  } finally {
    isCheckInFlight = false;
    scheduleNextCheck();
  }
}

ctx.onmessage = (event: MessageEvent<BackgroundSyncWorkerMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'START': {
      currentConfig = { ...currentConfig, ...msg.config };
      isRunning = true;
      consecutiveFailures = 0;
      clearScheduledTimer();
      // Delay initial check slightly so app startup hydration finishes cleanly first
      timerId = setTimeout(() => {
        void runSyncCheck(false);
      }, 8_000);
      break;
    }

    case 'UPDATE_CONFIG': {
      const wasPausedOrHidden = currentConfig.paused || !currentConfig.isPageVisible;
      currentConfig = { ...currentConfig, ...msg.config };
      const isNowActive = !currentConfig.paused && currentConfig.isPageVisible;
      if (isRunning) {
        if (!isNowActive) {
          clearScheduledTimer();
        } else if (wasPausedOrHidden && isNowActive) {
          scheduleNextCheck();
        } else {
          scheduleNextCheck();
        }
      }
      break;
    }

    case 'SEED_KNOWN_PATHS': {
      if (msg.replace) {
        knownPaths = new Set<string>();
      }
      if (Array.isArray(msg.paths)) {
        for (let i = 0; i < msg.paths.length; i++) {
          const norm = normalizePathKey(msg.paths[i]);
          if (norm) knownPaths.add(norm);
        }
      }
      break;
    }

    case 'RUN_CHECK_NOW': {
      if (isRunning) {
        clearScheduledTimer();
        void runSyncCheck(true);
      }
      break;
    }

    case 'STOP': {
      isRunning = false;
      clearScheduledTimer();
      knownPaths.clear();
      break;
    }
  }
};
