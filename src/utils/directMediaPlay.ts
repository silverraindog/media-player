import { isTauriEnvironment } from './tauriBridge';
import { SambaConfig } from '../types';

/**
 * Resolves a direct playable media URL directly from the given file path,
 * bypassing any backend /api/samba/stream proxy endpoints.
 * 
 * - In Tauri Desktop: uses Tauri's native custom asset protocol convertFileSrc()
 *   to stream the file directly from the filesystem without HTTP server overhead.
 * - In Web Browser: resolves to the direct static file path on the server
 *   (e.g., /samba_share/... or /<path>) or remote HTTP/blob URL directly.
 */
export function getDirectMediaPlayUrl(
  inputPath: string,
  sambaConfig?: SambaConfig
): string {
  if (!inputPath) return '';
  let clean = inputPath.trim();

  // If path is wrapped in an existing /api/samba/stream?path=... extract original path
  if (clean.includes('/api/samba/stream') || clean.includes('/api/samba/transcode')) {
    try {
      const qIdx = clean.indexOf('?');
      if (qIdx !== -1) {
        const search = new URLSearchParams(clean.substring(qIdx));
        const unwrapped = search.get('path') || search.get('file');
        if (unwrapped) {
          clean = decodeURIComponent(unwrapped);
        }
      }
    } catch {}
  }

  // If already an absolute web URL (http, https, blob, data), play directly
  if (/^(https?|blob|data):/i.test(clean)) {
    return clean;
  }

  // Normalize slashes
  clean = clean.replace(/\\/g, '/');

  // Tauri Desktop environment: direct native file playback via convertFileSrc
  if (isTauriEnvironment()) {
    try {
      const tauriGlobal = (window as any).__TAURI__;
      const convert = tauriGlobal?.convertFileSrc || (window as any).__TAURI_IPC__?.convertFileSrc;
      if (typeof convert === 'function') {
        let absPath = clean;
        // If relative, resolve to standard mounted volume path
        if (!absPath.startsWith('/') && !absPath.match(/^[a-zA-Z]:/)) {
          const share = sambaConfig?.share || 'media';
          absPath = `/Volumes/${share}/${clean.replace(/^\/+/, '')}`;
        }
        return convert(absPath);
      }
    } catch (e) {
      console.warn('[DirectPlay] Tauri convertFileSrc fallback:', e);
    }
  }

  // Web environment: strip redundant leading smb://, file://, or multiple slashes
  clean = clean.replace(/^(?:smb:|file:)\/\/*/i, '');
  clean = clean.replace(/^\/+/, '');

  // If absolute path like Volumes/media/Franchises/..., extract relative share path
  if (clean.startsWith('Volumes/') || clean.startsWith('mnt/') || clean.startsWith('media/')) {
    const parts = clean.split('/');
    if (parts.length > 2) {
      clean = parts.slice(2).join('/');
    }
  }

  // Encode each path segment for safe URI usage while keeping slashes intact
  const encodedSegments = clean.split('/').map((seg) => encodeURIComponent(seg)).join('/');

  // If it already points to samba_share/
  if (clean.startsWith('samba_share/')) {
    return `/${encodedSegments}`;
  }

  // Return direct static path (served by static file handler directly from the path)
  return `/samba_share/${encodedSegments}`;
}
