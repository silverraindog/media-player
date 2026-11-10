import type { MediaMetadata } from '../types';

export function isExcludedPicturesPath(path?: string): boolean {
  if (!path) return false;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const root = '/Volumes/media/Pictures';
  return normalized === root || normalized.startsWith(`${root}/`);
}

export function isExcludedPicturesMedia(item: MediaMetadata): boolean {
  return [item.path, item.folderPath, item.recommendedFolderStructure].some(isExcludedPicturesPath);
}

export function isGenericDownloadFolder(name: string): boolean {
  return /^(?:drive-download(?:-|$)|new folder(?:\s*\(\d+\))?$|downloads?$)/i.test(name.trim());
}

export function isGenericDownloadMedia(item: MediaMetadata): boolean {
  if (!isGenericDownloadFolder(item.title)) return false;
  const file = item.path?.replace(/\\/g, '/').split('/').pop() || '';
  const mediaFile = file.match(/^(.+)\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|flv)$/i);
  if (mediaFile?.[1].toLowerCase() === item.title.toLowerCase()) return false;
  const folder = item.folderPath || item.recommendedFolderStructure || item.path;
  if (!folder) return true;
  const name = folder.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || '';
  return isGenericDownloadFolder(name);
}
