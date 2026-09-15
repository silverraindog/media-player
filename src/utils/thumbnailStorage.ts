import { ThumbnailMetadata, ThumbnailCacheStats, SambaShareNode, MediaMetadata } from '../types';
import { CURATED_MEDIA_DATABASE } from '../data/curatedMedia';
import { parseTitleAndYear, detectMediaType, getFileCategory } from './mediaExtractor';

const LOCAL_STORAGE_KEY = 'samba_thumbnail_metadata_cache_v2';
const STATS_STORAGE_KEY = 'samba_thumbnail_cache_stats_v2';
const MAX_MEMORY_CACHE_SIZE = 500;

// Curated palette mapping for dominant colors to prevent layout shifts
const DOMINANT_COLORS_BY_GENRE: Record<string, string> = {
  scifi: '#1e1b4b', // deep indigo
  drama: '#1c1917', // warm charcoal
  action: '#1f2937', // dark slate
  music: '#164e63', // cyan
  book: '#451a03', // warm amber
  disc: '#4c0519', // rose wine
  series: '#0f172a', // slate navy
  default: '#0f172a',
};

// Fallback high-quality curated posters based on type
const DEFAULT_FALLBACK_POSTERS = {
  movie: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
  series: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80',
  album: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80',
  book: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
  disc: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80',
};

class ThumbnailStorageService {
  private memoryCache: Map<string, ThumbnailMetadata> = new Map();
  private listeners: Set<(stats: ThumbnailCacheStats) => void> = new Set();
  private hitCount: number = 0;
  private missCount: number = 0;
  private totalLookupDurationMs: number = 0;
  private isInitialized: boolean = false;
  private pendingBackendSync: ThumbnailMetadata[] = [];
  private syncTimer: any = null;

  constructor() {
    this.initFromLocalStorage();
  }

  // Initialize from LocalStorage and then sync with SQLite backend
  private initFromLocalStorage() {
    if (this.isInitialized) return;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed: Record<string, ThumbnailMetadata> = JSON.parse(stored);
          Object.entries(parsed).forEach(([key, value]) => {
            this.memoryCache.set(key, {
              ...value,
              cacheTier: 'persistent_local',
            });
          });
        }

        const savedStats = localStorage.getItem(STATS_STORAGE_KEY);
        if (savedStats) {
          const p = JSON.parse(savedStats);
          this.hitCount = p.hitCount || 0;
          this.missCount = p.missCount || 0;
          this.totalLookupDurationMs = p.totalLookupDurationMs || 0;
        }
      }
    } catch (err) {
      console.warn('Failed loading thumbnail cache from localStorage:', err);
    }
    this.isInitialized = true;

    // Asynchronously sync with SQLite backend
    this.syncFromBackend();
  }

  // Sync initial state from SQLite backend table
  public async syncFromBackend(): Promise<void> {
    try {
      const res = await fetch('/api/thumbnails/cache');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const key = item.media_path;
          if (!this.memoryCache.has(key)) {
            this.memoryCache.set(key, {
              id: item.id,
              mediaPath: item.media_path,
              title: item.title,
              mediaType: item.media_type as any,
              thumbnailUrl: item.thumbnail_url,
              fanartUrl: item.fanart_url,
              width: item.width || 600,
              height: item.height || 900,
              aspectRatio: (item.aspect_ratio || 'poster') as any,
              colorDominant: item.color_dominant || '#1e293b',
              source: (item.source || 'matched_media') as any,
              fileSizeBytes: item.file_size_bytes || 0,
              format: (item.format || 'jpg') as any,
              resolutionLabel: item.resolution_label || '600 × 900 (2:3)',
              cachedAt: item.cached_at || Date.now(),
              lastAccessedAt: item.last_accessed_at || Date.now(),
              hitCount: item.hit_count || 1,
              cacheTier: 'sqlite_backend',
            });
          }
        });
        this.notifyListeners();
      }
    } catch (e) {
      // Benign network fallback
    }
  }

  // Subscribe to changes in cache statistics
  public subscribe(callback: (stats: ThumbnailCacheStats) => void): () => void {
    this.listeners.add(callback);
    callback(this.getStats());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners() {
    const stats = this.getStats();
    this.listeners.forEach((cb) => cb(stats));
  }

  // Persist current cache to LocalStorage
  private persistToLocalStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const obj: Record<string, ThumbnailMetadata> = {};
        // Keep most recently accessed items up to 200 in localStorage
        const sorted = Array.from(this.memoryCache.values())
          .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
          .slice(0, 200);

        sorted.forEach((item) => {
          obj[item.mediaPath] = item;
        });

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(obj));
        localStorage.setItem(
          STATS_STORAGE_KEY,
          JSON.stringify({
            hitCount: this.hitCount,
            missCount: this.missCount,
            totalLookupDurationMs: this.totalLookupDurationMs,
          })
        );
      }
    } catch (err) {
      console.warn('LocalStorage quota or write error in thumbnail storage layer:', err);
    }
  }

  // Queue thumbnail metadata for persistence to SQLite backend
  private scheduleBackendSync(thumb: ThumbnailMetadata) {
    this.pendingBackendSync.push(thumb);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.flushPendingBackendSync();
    }, 1500);
  }

  private async flushPendingBackendSync() {
    if (this.pendingBackendSync.length === 0) return;
    const itemsToSync = [...this.pendingBackendSync];
    this.pendingBackendSync = [];

    try {
      const payload = itemsToSync.map((t) => ({
        id: t.id,
        media_path: t.mediaPath,
        title: t.title,
        media_type: t.mediaType,
        thumbnail_url: t.thumbnailUrl,
        fanart_url: t.fanartUrl,
        width: t.width,
        height: t.height,
        aspect_ratio: t.aspectRatio,
        color_dominant: t.colorDominant,
        source: t.source,
        file_size_bytes: t.fileSizeBytes,
        format: t.format,
        resolution_label: t.resolutionLabel,
        cached_at: t.cachedAt,
        last_accessed_at: t.lastAccessedAt,
        hit_count: t.hitCount,
      }));

      await fetch('/api/thumbnails/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn('Background sync to SQLite cache failed, will retry next turn:', e);
    }
  }

  // Normalize path for consistent cache keys
  private normalizeKey(mediaPath: string): string {
    return mediaPath.trim().replace(/^(\/\/|[\\/])+/, '').replace(/\\/g, '/');
  }

  // Instant synchronous lookup from memory / local cache
  public get(mediaPath: string): ThumbnailMetadata | null {
    const t0 = performance.now();
    const key = this.normalizeKey(mediaPath);

    if (this.memoryCache.has(key)) {
      const item = this.memoryCache.get(key)!;
      item.hitCount += 1;
      item.lastAccessedAt = Date.now();
      this.hitCount++;
      const duration = performance.now() - t0;
      this.totalLookupDurationMs += duration;
      this.notifyListeners();
      return item;
    }

    this.missCount++;
    const duration = performance.now() - t0;
    this.totalLookupDurationMs += duration;
    this.notifyListeners();
    return null;
  }

  // Store thumbnail metadata in memory, localStorage, and schedule SQLite sync
  public set(metadata: ThumbnailMetadata): void {
    const key = this.normalizeKey(metadata.mediaPath);

    // Evict oldest if exceeding max memory size
    if (this.memoryCache.size >= MAX_MEMORY_CACHE_SIZE && !this.memoryCache.has(key)) {
      const oldestKey = Array.from(this.memoryCache.entries()).sort(
        (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
      )[0]?.[0];
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    this.memoryCache.set(key, metadata);
    this.persistToLocalStorage();
    this.scheduleBackendSync(metadata);
    this.notifyListeners();
  }

  // Batch store multiple thumbnails
  public setBatch(items: ThumbnailMetadata[]): void {
    items.forEach((item) => {
      const key = this.normalizeKey(item.mediaPath);
      this.memoryCache.set(key, item);
      this.pendingBackendSync.push(item);
    });
    this.persistToLocalStorage();
    this.scheduleBackendSync(items[0]);
    this.notifyListeners();
  }

  // Intelligent resolution of thumbnail metadata for any Samba node
  public resolveForNode(
    node: SambaShareNode,
    parentPath: string = '',
    curatedList: MediaMetadata[] = CURATED_MEDIA_DATABASE
  ): ThumbnailMetadata {
    const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
    const cached = this.get(fullPath);
    if (cached) {
      return cached;
    }

    // Determine title & clean information
    const { title: parsedTitle, year: parsedYear } = parseTitleAndYear(node.name);
    const mediaType = node.mediaType || detectMediaType(fullPath);
    const category = getFileCategory(node.name);

    // 1. Check if node has matchedMedia
    if (node.matchedMedia && node.matchedMedia.posterUrl) {
      const meta: ThumbnailMetadata = {
        id: `thumb-${node.id || Math.random().toString(36).substring(2, 9)}`,
        mediaPath: fullPath,
        title: node.matchedMedia.title,
        mediaType: node.matchedMedia.type,
        thumbnailUrl: node.matchedMedia.posterUrl,
        fanartUrl: node.matchedMedia.fanartUrl,
        width: 800,
        height: 1200,
        aspectRatio: node.matchedMedia.type === 'album' ? 'square' : 'poster',
        colorDominant: DOMINANT_COLORS_BY_GENRE[node.matchedMedia.type] || '#1e1b4b',
        source: 'matched_media',
        fileSizeBytes: 420000,
        format: 'jpg',
        resolutionLabel: node.matchedMedia.type === 'album' ? '800 × 800 (1:1)' : '800 × 1200 (2:3)',
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
        hitCount: 1,
        cacheTier: 'memory_lru',
        isSidecarLocal: Boolean(node.hasPoster),
      };
      this.set(meta);
      return meta;
    }

    // 2. Check match against Curated Database
    const matchedCurated = curatedList.find((c) => {
      const lower = c.title.toLowerCase();
      const nodeLower = node.name.toLowerCase();
      return (
        nodeLower.includes(lower) ||
        lower.includes(parsedTitle.toLowerCase()) ||
        (parsedYear && c.year === parsedYear && nodeLower.includes(lower))
      );
    });

    if (matchedCurated && matchedCurated.posterUrl) {
      const meta: ThumbnailMetadata = {
        id: `thumb-curated-${matchedCurated.id}-${node.id}`,
        mediaPath: fullPath,
        title: matchedCurated.title,
        mediaType: matchedCurated.type,
        thumbnailUrl: matchedCurated.posterUrl,
        fanartUrl: matchedCurated.fanartUrl,
        width: 800,
        height: 1200,
        aspectRatio: matchedCurated.type === 'album' ? 'square' : 'poster',
        colorDominant: matchedCurated.type === 'album' ? '#164e63' : '#1e1b4b',
        source: 'curated_library',
        fileSizeBytes: 380000,
        format: 'jpg',
        resolutionLabel: matchedCurated.type === 'album' ? '800 × 800 (1:1)' : '800 × 1200 (2:3)',
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
        hitCount: 1,
        cacheTier: 'memory_lru',
        isSidecarLocal: Boolean(node.hasPoster),
      };
      this.set(meta);
      return meta;
    }

    // 3. Fallback based on format and category
    let chosenPoster = DEFAULT_FALLBACK_POSTERS.movie;
    let chosenAspect: 'poster' | 'fanart' | 'square' = 'poster';
    let chosenDominant = DOMINANT_COLORS_BY_GENRE.default;
    let label = '600 × 900 (2:3)';
    let thumbType: 'movie' | 'series' | 'album' | 'book' | 'disc_image' = 'movie';

    if (category === 'disc_images' || node.name.endsWith('.iso')) {
      chosenPoster = DEFAULT_FALLBACK_POSTERS.disc;
      chosenAspect = 'poster';
      chosenDominant = DOMINANT_COLORS_BY_GENRE.disc;
      label = '800 × 1200 (2:3)';
      thumbType = 'disc_image';
    } else if (category === 'books' || fullPath.toLowerCase().includes('book')) {
      chosenPoster = DEFAULT_FALLBACK_POSTERS.book;
      chosenAspect = 'poster';
      chosenDominant = DOMINANT_COLORS_BY_GENRE.book;
      label = '600 × 900 (2:3)';
      thumbType = 'book';
    } else if (category === 'audio' || mediaType === 'album') {
      chosenPoster = DEFAULT_FALLBACK_POSTERS.album;
      chosenAspect = 'square';
      chosenDominant = DOMINANT_COLORS_BY_GENRE.music;
      label = '600 × 600 (1:1)';
      thumbType = 'album';
    } else if (mediaType === 'series' || fullPath.toLowerCase().includes('series')) {
      chosenPoster = DEFAULT_FALLBACK_POSTERS.series;
      chosenAspect = 'poster';
      chosenDominant = DOMINANT_COLORS_BY_GENRE.series;
      label = '800 × 1200 (2:3)';
      thumbType = 'series';
    }

    const newThumb: ThumbnailMetadata = {
      id: `thumb-gen-${Math.random().toString(36).substring(2, 9)}`,
      mediaPath: fullPath,
      title: parsedTitle || node.name,
      mediaType: thumbType as any,
      thumbnailUrl: chosenPoster,
      width: chosenAspect === 'square' ? 600 : 800,
      height: chosenAspect === 'square' ? 600 : 1200,
      aspectRatio: chosenAspect,
      colorDominant: chosenDominant,
      source: node.hasPoster ? 'sidecar_poster' : 'generated_fallback',
      fileSizeBytes: 240000,
      format: 'jpg',
      resolutionLabel: label,
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
      hitCount: 1,
      cacheTier: 'memory_lru',
      isSidecarLocal: Boolean(node.hasPoster),
    };

    this.set(newThumb);
    return newThumb;
  }

  // Pre-warm thumbnail cache for all discovered media files and folders in the Samba share
  public prewarmSambaTree(
    tree: SambaShareNode[],
    curatedList: MediaMetadata[] = CURATED_MEDIA_DATABASE
  ): { cached: number; totalScanned: number } {
    let cachedCount = 0;
    let totalScanned = 0;

    const traverse = (nodes: SambaShareNode[], parentPath: string = '') => {
      nodes.forEach((node) => {
        totalScanned++;
        const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);

        // Pre-resolve media items or folders with posters / media children
        if (node.type === 'file' || node.matchedMedia || node.hasPoster || node.hasNfo) {
          const res = this.resolveForNode(node, parentPath, curatedList);
          if (res) cachedCount++;
        }

        if (node.children && node.children.length > 0) {
          traverse(node.children, fullPath);
        }
      });
    };

    traverse(tree);
    this.notifyListeners();
    return { cached: cachedCount, totalScanned };
  }

  // Evict single item or clear entire cache
  public async clearCache(targetPath?: string): Promise<void> {
    if (targetPath) {
      const key = this.normalizeKey(targetPath);
      this.memoryCache.delete(key);
      try {
        await fetch(`/api/thumbnails/cache?path=${encodeURIComponent(targetPath)}`, { method: 'DELETE' });
      } catch (e) {
        // ignore
      }
    } else {
      this.memoryCache.clear();
      this.hitCount = 0;
      this.missCount = 0;
      this.totalLookupDurationMs = 0;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
          localStorage.removeItem(STATS_STORAGE_KEY);
        }
        await fetch('/api/thumbnails/cache', { method: 'DELETE' });
      } catch (e) {
        // ignore
      }
    }
    this.persistToLocalStorage();
    this.notifyListeners();
  }

  // Telemetry statistics
  public getStats(): ThumbnailCacheStats {
    const totalHits = this.hitCount;
    const totalRequests = this.hitCount + this.missCount;
    const hitRatio = totalRequests > 0 ? totalHits / totalRequests : 1.0;
    const avgLoadTimeMs = totalRequests > 0 ? this.totalLookupDurationMs / totalRequests : 0.2;

    // Approximate size
    let storageSizeBytes = 0;
    this.memoryCache.forEach((item) => {
      storageSizeBytes += (item.mediaPath.length + item.thumbnailUrl.length + 150);
    });

    let memTier = 0;
    let localTier = 0;
    let sqlTier = 0;
    this.memoryCache.forEach((item) => {
      if (item.cacheTier === 'memory_lru') memTier++;
      else if (item.cacheTier === 'persistent_local') localTier++;
      else if (item.cacheTier === 'sqlite_backend') sqlTier++;
    });

    return {
      totalCached: this.memoryCache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRatio: Number(hitRatio.toFixed(3)),
      avgLoadTimeMs: Number(avgLoadTimeMs.toFixed(2)),
      storageSizeBytes,
      memoryTierCount: memTier || this.memoryCache.size,
      localTierCount: localTier,
      sqliteTierCount: sqlTier,
      lastSyncedAt: Date.now(),
    };
  }

  // Get all items in cache for inspection
  public getAllCachedItems(): ThumbnailMetadata[] {
    return Array.from(this.memoryCache.values()).sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  }
}

// Global Singleton Instance of the Thumbnail Storage Layer
export const thumbnailStorage = new ThumbnailStorageService();
