import { MediaMetadata } from '../types';
import { apiCall, isTauri, resolveBackendUrl } from '../lib/api';

export interface QueuedMediaItem {
  id: string;
  media: MediaMetadata;
  action: 'upsert' | 'delete';
  timestamp: number;
}

export interface SqliteQueueStatus {
  pendingCount: number;
  secondsUntilNextFlush: number;
  isFlushing: boolean;
  lastFlushTime: number | null;
  lastFlushCount: number;
  cacheSize: number;
}

const CACHE_STORAGE_KEY = 'sambavault_sqlite_persistent_cache_v2';
const BATCH_INTERVAL_SECONDS = 30;

class SqliteBatchWriterService {
  private queue: Map<string, QueuedMediaItem> = new Map();
  private cache: Map<string, MediaMetadata> = new Map();
  private timer: any = null;
  private countdownTimer: any = null;
  private secondsRemaining: number = BATCH_INTERVAL_SECONDS;
  private isFlushing: boolean = false;
  private isLocked: boolean = false;
  private cacheSaveTimer: any = null;
  private lastFlushTime: number | null = null;
  private lastFlushCount: number = 0;
  private subscribers: Set<(status: SqliteQueueStatus) => void> = new Set();

  constructor() {
    this.initPersistentCache();

    // Flush automatically before page unload to prevent any data loss
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.cacheSaveTimer) {
          clearTimeout(this.cacheSaveTimer);
          this.cacheSaveTimer = null;
          this.saveCacheToDiskSync();
        }
        this.flushNowSync();
      });
    }
  }

  /**
   * Lock all incoming writes, clear queue and timers during database reset operations
   */
  public lockWrites(): void {
    this.isLocked = true;
    this.stopBatchTimer();
    if (this.cacheSaveTimer) {
      clearTimeout(this.cacheSaveTimer);
      this.cacheSaveTimer = null;
    }
    this.queue.clear();
    this.cache.clear();
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(CACHE_STORAGE_KEY);
      } catch (e) {
        console.warn('Failed clearing SQLite cache from localStorage:', e);
      }
    }
    this.notifySubscribers();
  }

  /**
   * Unlock write operations after reset completion
   */
  public unlockWrites(): void {
    this.isLocked = false;
    if (this.queue.size > 0) {
      this.startBatchTimer();
    }
    this.notifySubscribers();
  }

  public isWriteLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Initialize and hydrate persistent cache from localStorage
   */
  private initPersistentCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(CACHE_STORAGE_KEY);
      if (stored) {
        const parsed: MediaMetadata[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (item && item.id) {
              this.cache.set(item.id, item);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not read persistent SQLite cache from localStorage:', e);
    }
  }

  /**
   * Persist current in-memory cache to localStorage synchronously
   */
  private saveCacheToDiskSync(): void {
    if (typeof window === 'undefined') return;
    try {
      const items = Array.from(this.cache.values());
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to write persistent SQLite cache to localStorage:', e);
    }
  }

  /**
   * Debounced disk cache write to prevent main-thread JSON.stringify freezes
   */
  private saveCacheToDisk(): void {
    if (typeof window === 'undefined') return;
    if (this.cacheSaveTimer) clearTimeout(this.cacheSaveTimer);
    this.cacheSaveTimer = setTimeout(() => {
      this.cacheSaveTimer = null;
      this.saveCacheToDiskSync();
    }, 600);
  }

  /**
   * Get all items currently in persistent cache (0ms latency, zero I/O)
   */
  public getCachedMedia(): MediaMetadata[] {
    return Array.from(this.cache.values());
  }

  /**
   * Synchronously update the persistent cache
   */
  public updateCache(items: MediaMetadata[]): void {
    if (this.isLocked || !items || items.length === 0) return;
    items.forEach((item) => {
      if (item && item.id) {
        this.cache.set(item.id, item);
      }
    });
    this.saveCacheToDisk();
    this.notifySubscribers();
  }

  /**
   * Completely clear memory cache, pending queue, and persistent disk cache
   */
  public clear(): void {
    this.cache.clear();
    this.queue.clear();
    this.stopBatchTimer();
    if (this.cacheSaveTimer) {
      clearTimeout(this.cacheSaveTimer);
      this.cacheSaveTimer = null;
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(CACHE_STORAGE_KEY);
      } catch (e) {
        console.warn('Failed clearing SQLite cache from localStorage:', e);
      }
    }
    this.notifySubscribers();
  }

  /**
   * Enqueue a single media item for the 30-second SQLite batch write
   */
  public enqueue(media: MediaMetadata): void {
    if (this.isLocked || !media || !media.id) return;

    // Update persistent cache immediately for instant UI availability
    this.cache.set(media.id, media);
    this.saveCacheToDisk();

    // Add to batch queue
    this.queue.set(media.id, {
      id: media.id,
      media,
      action: 'upsert',
      timestamp: Date.now(),
    });

    this.ensureBatchTimerRunning();
    this.notifySubscribers();
  }

  /**
   * Enqueue multiple media items (e.g. from large Samba sync operations)
   */
  public enqueueMany(mediaList: MediaMetadata[]): void {
    if (this.isLocked || !mediaList || mediaList.length === 0) return;

    mediaList.forEach((media) => {
      if (media && media.id) {
        this.cache.set(media.id, media);
        this.queue.set(media.id, {
          id: media.id,
          media,
          action: 'upsert',
          timestamp: Date.now(),
        });
      }
    });

    this.saveCacheToDisk();
    this.ensureBatchTimerRunning();
    this.notifySubscribers();
  }

  private stopBatchTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.secondsRemaining = BATCH_INTERVAL_SECONDS;
  }

  private ensureBatchTimerRunning(): void {
    if (this.isLocked || this.queue.size === 0 || this.countdownTimer) return;
    this.startBatchTimer();
  }

  /**
   * Start the recurring 30-second batch timer and 1-second countdown (only while items are queued)
   */
  private startBatchTimer(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.isLocked || this.queue.size === 0) {
      this.countdownTimer = null;
      this.secondsRemaining = BATCH_INTERVAL_SECONDS;
      return;
    }

    this.secondsRemaining = BATCH_INTERVAL_SECONDS;

    this.countdownTimer = setInterval(() => {
      if (this.queue.size === 0 || this.isLocked) {
        this.stopBatchTimer();
        this.notifySubscribers();
        return;
      }
      this.secondsRemaining -= 1;
      if (this.secondsRemaining <= 0) {
        this.secondsRemaining = BATCH_INTERVAL_SECONDS;
        this.flushNow();
      } else {
        this.notifySubscribers();
      }
    }, 1000);
  }

  /**
   * Flush all queued media changes to SQLite database in a single batch call
   */
  public async flushNow(): Promise<{ success: boolean; count: number }> {
    if (this.isLocked || this.isFlushing || this.queue.size === 0) {
      return { success: true, count: 0 };
    }

    this.isFlushing = true;
    this.notifySubscribers();

    // Snapshot queued items and clear queue buffer
    const itemsToFlush = Array.from(this.queue.values()).map((q) => q.media);
    const flushCount = itemsToFlush.length;

    try {
      await apiCall('/api/db/media/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToFlush }),
      });

      this.lastFlushTime = Date.now();
      this.lastFlushCount = flushCount;

      // Remove successfully written items from queue
      itemsToFlush.forEach((item) => this.queue.delete(item.id));

      if (this.queue.size === 0) {
        this.stopBatchTimer();
      } else {
        this.secondsRemaining = BATCH_INTERVAL_SECONDS;
      }
      return { success: true, count: flushCount };
    } catch (err) {
      console.error('Error during SQLite batch write flush:', err);
      // Items remain in queue to be retried on next 30s cycle
      return { success: false, count: 0 };
    } finally {
      this.isFlushing = false;
      this.notifySubscribers();
    }
  }

  /**
   * Synchronous beacon flush for page unload
   */
  private flushNowSync(): void {
    if (this.isLocked || this.queue.size === 0) return;
    const itemsToFlush = Array.from(this.queue.values()).map((q) => q.media);
    try {
      const targetUrl = resolveBackendUrl('/api/db/media/batch');
      if (isTauri) {
        fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsToFlush }),
          keepalive: true,
        }).catch(() => {});
        return;
      }
      const blob = new Blob([JSON.stringify({ items: itemsToFlush })], {
        type: 'application/json',
      });
      navigator.sendBeacon(targetUrl, blob);
    } catch (e) {
      console.warn('Failed to sendBeacon on unload:', e);
    }
  }

  /**
   * Subscribe to queue and cache status changes
   */
  public subscribe(callback: (status: SqliteQueueStatus) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getStatus());
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get current queue status
   */
  public getStatus(): SqliteQueueStatus {
    return {
      pendingCount: this.queue.size,
      secondsUntilNextFlush: this.secondsRemaining,
      isFlushing: this.isFlushing,
      lastFlushTime: this.lastFlushTime,
      lastFlushCount: this.lastFlushCount,
      cacheSize: this.cache.size,
    };
  }

  private notifySubscribers(): void {
    const status = this.getStatus();
    this.subscribers.forEach((cb) => {
      try {
        cb(status);
      } catch (e) {
        console.error('Error in SqliteBatchWriter subscriber:', e);
      }
    });
  }
}

// Export singleton instance
export const sqliteBatchWriter = new SqliteBatchWriterService();
