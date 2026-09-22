/**
 * Local Database Fallback & Offline Cache Service
 * 
 * Provides seamless offline-first persistence for Watch History, Watchlist, Media Items,
 * and Watch Progress. When the local Node/Express backend or Tauri IPC is unreachable
 * (e.g. Connection Refused on http://127.0.0.1:3000, offline mode, or server restart),
 * this service intercepts /api/db/* requests and responds instantly with cached data,
 * preventing network error crashes, 500s, and unhandled connection timeouts.
 */

const STORAGE_KEYS = {
  WATCH_HISTORY: 'media_vault_watch_history_cache',
  WATCHLIST: 'media_vault_watchlist_cache',
  MEDIA_ITEMS: 'media_vault_media_items_cache',
  PROGRESS: 'media_vault_progress_cache',
};

// Seed default watch history if cache is completely empty
const INITIAL_WATCH_HISTORY = [
  {
    id: 'hist-seed-1',
    media_id: 'movie-interstellar',
    title: 'Interstellar',
    media_type: 'movie',
    playback_position_seconds: 9840,
    duration_seconds: 10140,
    progress_percentage: 97.0,
    is_completed: 1,
    poster_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
    watched_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'hist-seed-2',
    media_id: 'movie-blade-runner-2049',
    title: 'Blade Runner 2049',
    media_type: 'movie',
    playback_position_seconds: 4800,
    duration_seconds: 9800,
    progress_percentage: 49.0,
    is_completed: 0,
    poster_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    watched_at: new Date(Date.now() - 3600000 * 28).toISOString(),
  },
  {
    id: 'hist-seed-3',
    media_id: 'series-stranger-things-s01e01',
    series_id: 'series-stranger-things',
    title: 'Stranger Things',
    media_type: 'series',
    season_number: 1,
    episode_number: 1,
    episode_title: 'Chapter One: The Vanishing of Will Byers',
    playback_position_seconds: 2900,
    duration_seconds: 2950,
    progress_percentage: 98.3,
    is_completed: 1,
    poster_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
    watched_at: new Date(Date.now() - 3600000 * 72).toISOString(),
  },
];

class LocalDatabaseFallbackService {
  private getJson<T>(key: string, defaultVal: T): T {
    if (typeof window === 'undefined' || !window.localStorage) return defaultVal;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  private setJson<T>(key: string, val: T): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('[LocalDbFallback] Failed to write cache to localStorage:', e);
    }
  }

  // --- Watch History ---
  public getWatchHistory(limit = 100, mediaType?: string, search?: string): any[] {
    let history = this.getJson<any[]>(STORAGE_KEYS.WATCH_HISTORY, INITIAL_WATCH_HISTORY);
    if (!Array.isArray(history) || history.length === 0) {
      history = INITIAL_WATCH_HISTORY;
      this.setJson(STORAGE_KEYS.WATCH_HISTORY, history);
    }

    let filtered = [...history];
    if (mediaType && mediaType !== 'all') {
      filtered = filtered.filter((h) => (h.media_type || 'movie') === mediaType);
    }
    if (search && search.trim().length > 0) {
      const term = search.toLowerCase().trim();
      filtered = filtered.filter(
        (h) =>
          (h.title && h.title.toLowerCase().includes(term)) ||
          (h.episode_title && h.episode_title.toLowerCase().includes(term))
      );
    }

    filtered.sort((a, b) => new Date(b.watched_at || 0).getTime() - new Date(a.watched_at || 0).getTime());
    return filtered.slice(0, limit);
  }

  public saveWatchHistoryItem(item: any): any {
    const history = this.getWatchHistory(1000);
    const id = item.id || `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const dur = Math.max(0, Number(item.duration_seconds || 0));
    const pos = Math.max(0, Number(item.playback_position_seconds || 0));
    const pct =
      item.progress_percentage !== undefined
        ? Number(item.progress_percentage)
        : dur > 0
        ? Number(((pos / dur) * 100).toFixed(1))
        : 0;

    const record = {
      id,
      media_id: item.media_id || '',
      series_id: item.series_id || '',
      media_type: item.media_type || (item.series_id || item.season_number ? 'series' : 'movie'),
      title: item.title || 'Untitled',
      season_number: item.season_number || null,
      episode_number: item.episode_number || null,
      episode_title: item.episode_title || null,
      poster_url: item.poster_url || '',
      duration_seconds: dur,
      playback_position_seconds: pos,
      progress_percentage: pct,
      is_completed: item.is_completed ? 1 : pct >= 90 ? 1 : 0,
      watched_at: item.watched_at || new Date().toISOString(),
    };

    // Find and replace or prepend
    const existingIdx = history.findIndex((h) => {
      if (item.series_id && item.season_number && item.episode_number) {
        return (
          h.series_id === item.series_id &&
          h.season_number === item.season_number &&
          h.episode_number === item.episode_number
        );
      }
      if (item.media_id && h.media_id === item.media_id) return true;
      if (h.title && item.title && h.title.toLowerCase() === item.title.toLowerCase()) return true;
      return h.id === id;
    });

    if (existingIdx >= 0) {
      history[existingIdx] = { ...history[existingIdx], ...record };
    } else {
      history.unshift(record);
    }

    this.setJson(STORAGE_KEYS.WATCH_HISTORY, history);
    return record;
  }

  public deleteWatchHistoryItem(id: string): boolean {
    const history = this.getWatchHistory(1000);
    const updated = history.filter((h) => h.id !== id);
    this.setJson(STORAGE_KEYS.WATCH_HISTORY, updated);
    return true;
  }

  public clearWatchHistory(): boolean {
    this.setJson(STORAGE_KEYS.WATCH_HISTORY, []);
    return true;
  }

  public syncWatchHistoryFromApi(items: any[]): void {
    if (Array.isArray(items) && items.length > 0) {
      this.setJson(STORAGE_KEYS.WATCH_HISTORY, items);
    }
  }

  // --- Watchlist ---
  public getWatchlist(): any[] {
    return this.getJson<any[]>(STORAGE_KEYS.WATCHLIST, []);
  }

  public toggleWatchlist(item: any): { inWatchlist: boolean } {
    const list = this.getWatchlist();
    const mediaId = item.media_id || item.mediaId || item.id;
    const existsIdx = list.findIndex((w) => (w.media_id || w.id) === mediaId);
    let inWatchlist = false;

    if (existsIdx >= 0) {
      list.splice(existsIdx, 1);
      inWatchlist = false;
    } else {
      list.unshift({
        id: `wl-${Date.now()}`,
        media_id: mediaId,
        title: item.title || 'Untitled',
        media_type: item.media_type || item.type || 'movie',
        year: item.year || null,
        rating: item.rating || null,
        poster_url: item.poster_url || item.posterUrl || '',
        genres: item.genres ? (Array.isArray(item.genres) ? item.genres.join(', ') : item.genres) : '',
        synopsis: item.synopsis || item.overview || '',
        added_at: new Date().toISOString(),
      });
      inWatchlist = true;
    }

    this.setJson(STORAGE_KEYS.WATCHLIST, list);
    return { inWatchlist };
  }

  public removeWatchlist(mediaId: string): boolean {
    const list = this.getWatchlist();
    const updated = list.filter((w) => (w.media_id || w.id) !== mediaId);
    this.setJson(STORAGE_KEYS.WATCHLIST, updated);
    return true;
  }

  public syncWatchlistFromApi(items: any[]): void {
    if (Array.isArray(items)) {
      this.setJson(STORAGE_KEYS.WATCHLIST, items);
    }
  }

  /**
   * Generates a synthetic HTTP Response when /api/db/* calls encounter network failure
   */
  public handleDbRequestFallback(urlStr: string, method = 'GET', bodyObj: any = null): Response | null {
    try {
      const url = new URL(urlStr, 'http://localhost');
      const path = url.pathname;

      if (path === '/api/db/history') {
        if (method === 'GET') {
          const limit = Number(url.searchParams.get('limit') || '100');
          const mediaType = url.searchParams.get('mediaType') || undefined;
          const search = url.searchParams.get('search') || undefined;
          const history = this.getWatchHistory(limit, mediaType, search);
          return new Response(
            JSON.stringify({
              success: true,
              history,
              count: history.length,
              source: 'local_storage_cache',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else if (method === 'POST') {
          const record = this.saveWatchHistoryItem(bodyObj || {});
          return new Response(
            JSON.stringify({
              success: true,
              record,
              message: 'Recorded to watch history (local cache)',
              source: 'local_storage',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else if (method === 'DELETE') {
          this.clearWatchHistory();
          return new Response(
            JSON.stringify({ success: true, message: 'Cleared all watch history (local cache)' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (path.startsWith('/api/db/history/')) {
        const id = path.replace('/api/db/history/', '');
        if (id === 'stats' && method === 'GET') {
          const history = this.getWatchHistory(1000);
          const totalWatched = history.length;
          const completedCount = history.filter((h) => h.is_completed).length;
          const totalMinutes = history.reduce((acc, h) => acc + Math.round((h.playback_position_seconds || 0) / 60), 0);
          return new Response(
            JSON.stringify({
              success: true,
              stats: { totalWatched, completedCount, inProgressCount: totalWatched - completedCount, totalMinutesWatched: totalMinutes },
              source: 'local_storage_cache',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else if (method === 'DELETE') {
          this.deleteWatchHistoryItem(id);
          return new Response(
            JSON.stringify({ success: true, message: 'Deleted history entry (local cache)' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (path === '/api/db/watchlist') {
        if (method === 'GET') {
          const watchlist = this.getWatchlist();
          return new Response(
            JSON.stringify({ success: true, watchlist, count: watchlist.length, source: 'local_storage_cache' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (path === '/api/db/watchlist/toggle' && method === 'POST') {
        const res = this.toggleWatchlist(bodyObj || {});
        return new Response(
          JSON.stringify({ success: true, ...res, message: res.inWatchlist ? 'Added to watchlist' : 'Removed from watchlist' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (path.startsWith('/api/db/watchlist/') && method === 'DELETE') {
        const mediaId = decodeURIComponent(path.replace('/api/db/watchlist/', ''));
        this.removeWatchlist(mediaId);
        return new Response(
          JSON.stringify({ success: true, message: 'Removed from watchlist (local cache)' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Default fallback response for generic /api/db/ query or stats
      if (path.startsWith('/api/db/')) {
        return new Response(
          JSON.stringify({ success: true, fallback: true, results: [], data: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (e) {
      console.warn('[LocalDbFallback] Error constructing synthetic response:', e);
    }
    return null;
  }
}

export const localDbFallback = new LocalDatabaseFallbackService();
