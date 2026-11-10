import { invoke } from '@tauri-apps/api/tauri';
import { localDbFallback } from '../utils/localDatabaseFallback';

export const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI__ || (window as any).__TAURI_IPC__);

export async function apiCall<T>(endpoint: string, options: any = {}): Promise<T> {
  if (isTauri) {
    // Never intercept streaming media endpoints with native database commands
    if (endpoint.startsWith('/api/media/stream') || endpoint.startsWith('/api/samba/stream') || endpoint.includes('/stream')) {
      const backendPort = (window as any).__EXPRESS_PORT__ || 3000;
      const url = endpoint.startsWith('/') ? `http://localhost:${backendPort}${endpoint}` : endpoint;
      return window.fetch(url, options).then((r) => r.json()) as any;
    }

    if (endpoint === '/api/metadata/generate-synopsis') {
      const { title, type, year } = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return invoke<T>('generate_synopsis', { title, mediaType: type, year });
    }
  }

  // Fallback to fetch for Node/Express dev server / web
  try {
    let effectiveUrl = endpoint === '/api/db/progress/update' ? '/api/db/progress' : endpoint;
    if (isTauri && effectiveUrl.startsWith('/')) {
      const backendPort = (window as any).__EXPRESS_PORT__ || 3000;
      effectiveUrl = `http://localhost:${backendPort}${effectiveUrl}`;
    }
    const res = await window.fetch(effectiveUrl, options);
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return res.json();
  } catch (err) {
    if (endpoint.startsWith('/api/db/') || endpoint.startsWith('/api/vault/state')) throw err;
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
