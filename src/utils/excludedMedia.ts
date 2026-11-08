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
