import { MediaMetadata } from '../types';

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
  private lastFlushTime: number | null = null;
  private lastFlushCount: number = 0;
  private subscribers: Set<(status: SqliteQueueStatus) => void> = new Set();

  constructor() {
    this.initPersistentCache();
    this.startBatchTimer();

    // Flush automatically before page unload to prevent any data loss
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushNowSync();
      });
    }
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
   * Persist current in-memory cache to localStorage
   */
  private saveCacheToDisk(): void {
    if (typeof window === 'undefined') return;
    try {
      const items = Array.from(this.cache.values());
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to write persistent SQLite cache to localStorage:', e);
    }
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
    items.forEach((item) => {
      if (item && item.id) {
        this.cache.set(item.id, item);
      }
    });
    this.saveCacheToDisk();
    this.notifySubscribers();
  }

  /**
   * Enqueue a single media item for the 30-second SQLite batch write
   */
  public enqueue(media: MediaMetadata): void {
    if (!media || !media.id) return;

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

    this.notifySubscribers();
  }

  /**
   * Enqueue multiple media items (e.g. from large Samba sync operations)
   */
  public enqueueMany(mediaList: MediaMetadata[]): void {
    if (!mediaList || mediaList.length === 0) return;

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
    this.notifySubscribers();
  }

  /**
   * Start the recurring 30-second batch timer and 1-second countdown
   */
  private startBatchTimer(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.secondsRemaining = BATCH_INTERVAL_SECONDS;

    this.countdownTimer = setInterval(() => {
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
    if (this.isFlushing || this.queue.size === 0) {
      return { success: true, count: 0 };
    }

    this.isFlushing = true;
    this.notifySubscribers();

    // Snapshot queued items and clear queue buffer
    const itemsToFlush = Array.from(this.queue.values()).map((q) => q.media);
    const flushCount = itemsToFlush.length;

    try {
      const response = await fetch('/api/db/media/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToFlush }),
      });

      if (!response.ok) {
        throw new Error(`Batch save returned HTTP ${response.status}`);
      }

      const result = await response.json();
      this.lastFlushTime = Date.now();
      this.lastFlushCount = flushCount;

      // Remove successfully written items from queue
      itemsToFlush.forEach((item) => this.queue.delete(item.id));

      this.secondsRemaining = BATCH_INTERVAL_SECONDS;
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
    if (this.queue.size === 0) return;
    const itemsToFlush = Array.from(this.queue.values()).map((q) => q.media);
    try {
      const blob = new Blob([JSON.stringify({ items: itemsToFlush })], {
        type: 'application/json',
      });
      navigator.sendBeacon('/api/db/media/batch', blob);
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
