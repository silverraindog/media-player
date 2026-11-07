import type { CastMember, MediaMetadata } from '../types';
import { isTauri } from '../lib/api';

export interface FetchedLibraryMetadata {
  title?: string;
  source?: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  fanartUrl?: string;
  genres?: string[];
  rating?: number;
  cast?: CastMember[];
}

export function isMissingText(value?: string): boolean {
  const text = value?.trim().toLowerCase() || '';
  return !text || text.includes('placeholder') || text.includes('no synopsis') ||
    text.includes('cataloged from samba network storage') || text.startsWith('imported via batch renamer');
}

export function isMissingArtwork(value?: string): boolean {
  return !value?.trim() || /(?:images|source)\.unsplash\.com/i.test(value);
}

export function isMissingSynopsis(media: MediaMetadata): boolean {
  return isMissingText(media.overview) && isMissingText(media.synopsis);
}

function normalizedTitle(title: string): string {
  return title.toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

export function isVerifiedMatch(media: MediaMetadata, result: FetchedLibraryMetadata): boolean {
  return !!result.source && result.source !== 'fallback' && !!result.title &&
    normalizedTitle(media.title) === normalizedTitle(result.title) &&
    (!media.year || !result.year || media.year === result.year);
}

export function mergeFetchedMetadata(media: MediaMetadata, result: FetchedLibraryMetadata): MediaMetadata {
  const updated = { ...media };
  if (isMissingText(updated.overview) && !isMissingText(result.overview)) updated.overview = result.overview!;
  if (isMissingText(updated.synopsis) && !isMissingText(result.overview)) updated.synopsis = result.overview;
  if (isMissingArtwork(updated.posterUrl) && !isMissingArtwork(result.posterUrl)) updated.posterUrl = result.posterUrl!;
  if (isMissingArtwork(updated.fanartUrl) && !isMissingArtwork(result.fanartUrl)) updated.fanartUrl = result.fanartUrl;
  if (!updated.genres?.length && result.genres?.length) updated.genres = result.genres;
  if (!updated.rating && result.rating && Number.isFinite(result.rating)) updated.rating = result.rating;
  if (!updated.cast?.length && result.cast?.length) updated.cast = result.cast;
  return updated;
}

export async function fetchLibraryMetadata(media: MediaMetadata, signal: AbortSignal): Promise<FetchedLibraryMetadata | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20000);
  try {
    const port = isTauri ? (window as Window & { __EXPRESS_PORT__?: number }).__EXPRESS_PORT__ || 3000 : undefined;
    const url = isTauri ? `http://localhost:${port}/api/media/fetch-art` : '/api/media/fetch-art';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: media.title, type: media.type, year: media.year || undefined }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Metadata lookup failed (HTTP ${response.status})`);
    const result: FetchedLibraryMetadata & { success?: boolean } = await response.json();
    if (!result.success) throw new Error('Metadata lookup returned an invalid response');
    return isVerifiedMatch(media, result) ? result : null;
  } catch (error) {
    if (timedOut && !signal.aborted) throw new Error('Metadata lookup timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
