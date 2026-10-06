import { invoke } from '@tauri-apps/api/tauri';
import { localDbFallback } from '../utils/localDatabaseFallback';

export const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI__ || (window as any).__TAURI_IPC__);

export async function apiCall<T>(endpoint: string, options: any = {}): Promise<T> {
  if (isTauri) {
    // Map REST endpoints to native Tauri commands writing to ~/.media-player
    if (endpoint === '/api/db/media' && (!options.method || options.method === 'GET')) {
      const items = await invoke<any[]>('get_all_media').catch(() => []);
      return { success: true, items } as any;
    }
    if (endpoint === '/api/db/media' && options.method === 'POST') {
      const media = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return invoke<T>('save_media', { media });
    }
    if (endpoint === '/api/db/media/batch' && options.method === 'POST') {
      const payload = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      const items = payload?.items || [];
      const rustItems = items.map((m: any) => ({
        id: m.id,
        media_type: m.type || m.media_type || 'series',
        title: m.title,
        original_title: m.originalTitle || null,
        synopsis: m.overview || m.synopsis || '',
        year: m.year || null,
        rating: m.rating || null,
        poster_url: m.posterUrl || m.poster_url || null,
        fanart_url: m.fanartUrl || m.fanart_url || null,
        genres: typeof m.genres === 'string' ? m.genres : JSON.stringify(m.genres || []),
        cast: typeof m.cast === 'string' ? m.cast : JSON.stringify(m.cast || []),
        recommended_folder: m.recommendedFolderStructure || m.recommended_folder || null,
        raw_data: JSON.stringify(m),
        file_size_bytes: m.fileSizeBytes || null,
      }));
      await invoke('save_media_batch', { items: rustItems });
      return { success: true, count: rustItems.length } as any;
    }
    if (endpoint === '/api/vault/state' && (!options.method || options.method === 'GET')) {
      const stateJson = await invoke<string | null>('get_vault_state').catch(() => null);
      if (stateJson) {
        try {
          return { success: true, hasSavedState: true, state: JSON.parse(stateJson) } as any;
        } catch {}
      }
      // Check localStorage fallback
      try {
        const local = localStorage.getItem('sambavault_persistent_vault_state');
        if (local) {
          return { success: true, hasSavedState: true, state: JSON.parse(local) } as any;
        }
      } catch {}
      return { success: false, hasSavedState: false, state: null } as any;
    }
    if (endpoint === '/api/vault/state' && options.method === 'POST') {
      const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      try {
        localStorage.setItem('sambavault_persistent_vault_state', bodyStr);
      } catch {}
      await invoke('save_vault_state', { stateJson: bodyStr }).catch((err) => {
        console.warn('[apiCall] save_vault_state Tauri IPC error:', err);
      });
      return { success: true } as any;
    }
    if (endpoint === '/api/db/watchlist' && (!options.method || options.method === 'GET')) {
      const stored = localStorage.getItem('media_vault_watchlist_cache');
      const list = stored ? JSON.parse(stored) : [];
      return { success: true, watchlist: list, count: list.length } as any;
    }
    if (endpoint === '/api/db/reset') {
      await invoke('reset_database').catch(() => {});
      await invoke('save_vault_state', { stateJson: JSON.stringify({ mediaLibrary: [], sambaTree: [] }) }).catch(() => {});
      try {
        localStorage.removeItem('sambavault_persistent_vault_state');
      } catch {}
      return { success: true } as any;
    }
    if (endpoint === '/api/metadata/generate-synopsis') {
      const { title, type, year } = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return invoke<T>('generate_synopsis', { title, mediaType: type, year });
    }
    if (endpoint === '/api/db/progress/update') {
      const progress = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return invoke<T>('update_watch_progress', { progress });
    }
  }

  // Fallback to fetch for Node/Express dev server / web
  try {
    const res = await fetch(endpoint, options);
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return res.json();
  } catch (err) {
    // If backend fetch failed, use localDbFallback
    let bodyObj: any = null;
    if (options.body && typeof options.body === 'string') {
      try { bodyObj = JSON.parse(options.body); } catch {}
    }
    const fallbackResponse = localDbFallback.handleDbRequestFallback(
      endpoint,
      (options.method || 'GET').toUpperCase(),
      bodyObj
    );
    if (fallbackResponse) {
      return fallbackResponse.json();
    }
    throw err;
  }
}
