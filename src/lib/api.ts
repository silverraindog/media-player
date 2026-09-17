import { invoke } from '@tauri-apps/api/tauri';

export const isTauri = !!(window as any).__TAURI__;

export async function apiCall<T>(endpoint: string, options: any = {}): Promise<T> {
  if (isTauri) {
    // Map REST endpoints to Tauri commands
    if (endpoint === '/api/db/media' && options.method === 'GET') {
      return invoke<T>('get_all_media');
    }
    if (endpoint === '/api/db/media' && (options.method === 'POST' || !options.method)) {
      const media = JSON.parse(options.body);
      return invoke<T>('save_media', { media });
    }
    if (endpoint === '/api/metadata/generate-synopsis') {
      const { title, type, year } = JSON.parse(options.body);
      return invoke<T>('generate_synopsis', { title, mediaType: type, year });
    }
    if (endpoint === '/api/db/progress/update') {
      const progress = JSON.parse(options.body);
      return invoke<T>('update_watch_progress', { progress });
    }
    if (endpoint === '/api/media/generate-fanart') {
      // For now, if we are in Tauri, we might need a specific command or just let it fall back
      // Since I added the route to server.ts but not a Tauri command yet, let's just let it fall back
      // unless we want to move image generation to Rust too.
      // For simplicity, I'll let it fall back to the Express server for now as it's a heavy AI call.
    }
    // Add more mappings as needed...
  }

  // Fallback to fetch for dev server / web
  const res = await fetch(endpoint, options);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}
