import type { CastMember, MediaMetadata } from '../types';
import { isTauri } from '../lib/api';
import { parseTitleAndYear, SUPPORTED_AUDIO_EXTENSIONS } from './mediaExtractor';

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

export interface MetadataFetchDiagnostic {
  provider: string;
  outcome: string;
}

export interface MetadataLookupDetails {
  source?: string;
  returnedTitle?: string;
  returnedYear?: number;
  reason: string;
  fields: string[];
  providers?: MetadataFetchDiagnostic[];
}

const CATEGORY_FOLDER_NAMES = new Set([
  'pictures', 'collections', 'collection', 'comedy', 'animation', 'horror',
  'horror - supernatural', 'scifi', 'scify', 'sci-fi', 'drama', 'reality',
  'movies', 'series', 'franchises', 'franchise', 'documentary', 'documentaries',
  'documentory', 'sort', 'lost+found',
]);

export function isCategorizerFolderLabel(media: MediaMetadata): boolean {
  const title = media.title.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!CATEGORY_FOLDER_NAMES.has(title)) return false;
  const filename = media.path?.replace(/\\/g, '/').split('/').pop() || '';
  const file = filename.match(/^(.+)\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|flv|ts|m2ts|mp3|flac|m4a|wav|ogg)$/i);
  return !file || file[1].trim().toLowerCase() !== title;
}

export function isIndividualAudioTrack(media: MediaMetadata): boolean {
  if (media.type !== 'album') return false;
  const isAudioFile = (value?: string) => {
    const name = value?.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
    const extension = name.split('.').pop() || '';
    return name.includes('.') && SUPPORTED_AUDIO_EXTENSIONS.includes(extension);
  };
  if (isAudioFile(media.recommendedFolderStructure) || isAudioFile(media.matchedFilename)) return true;
  if (media.folderPath || (media.recommendedFolderStructure && media.recommendedFolderStructure !== media.path)) return false;
  if (!isAudioFile(media.path)) return false;
  const filename = media.path!.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]+$/, '');
  const stripTrackNumber = (value: string) => value.replace(/^\s*\d{1,3}[\s._-]+/, '');
  return normalizedTitle(stripTrackNumber(filename)) === normalizedTitle(stripTrackNumber(media.title));
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

export function trustedMediaYear(media: MediaMetadata): number | undefined {
  if (!Number.isInteger(media.year) || media.year <= 0) return undefined;
  if (media.yearSource === 'placeholder') return undefined;
  if (media.yearSource) return media.year;

  // Legacy items have no provenance: only a matching original name is evidence.
  const names = [media.matchedFilename, media.folderPath?.replace(/\\/g, '/').split('/').filter(Boolean).pop()];
  for (const name of names) {
    if (!name) continue;
    const parsed = parseTitleAndYear(name);
    if (parsed.hasYear && parsed.year === media.year && normalizedTitle(parsed.title) === normalizedTitle(media.title)) {
      return media.year;
    }
  }
  return undefined;
}

export function isVerifiedMatch(media: MediaMetadata, result: FetchedLibraryMetadata): boolean {
  const year = trustedMediaYear(media);
  return !!result.source && result.source !== 'fallback' && !!result.title &&
    normalizedTitle(media.title) === normalizedTitle(result.title) &&
    !!year && !!result.year && year === result.year && media.type !== 'album';
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

export async function fetchLibraryMetadata(
  media: MediaMetadata,
  signal: AbortSignal,
  onDetails?: (details: MetadataLookupDetails) => void,
): Promise<FetchedLibraryMetadata | null> {
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
      body: JSON.stringify({ title: media.title, type: media.type, year: trustedMediaYear(media), requireProviderYear: true, ...(onDetails ? { diagnostics: true } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Metadata lookup failed (HTTP ${response.status})`);
    const result: FetchedLibraryMetadata & { success?: boolean; diagnostics?: unknown } = await response.json();
    if (!result || !result.success) throw new Error('Metadata lookup returned an invalid response');
    const verified = isVerifiedMatch(media, result);
    const fields = [
      !isMissingText(result.overview) ? 'synopsis' : '',
      !isMissingArtwork(result.posterUrl) ? 'poster' : '',
      !isMissingArtwork(result.fanartUrl) ? 'fanart' : '',
      result.genres?.length ? 'genres' : '',
      result.rating ? 'rating' : '',
      result.cast?.length ? 'cast' : '',
    ].filter(Boolean);
    let reason = 'Verified title and year';
    if (!result.source || result.source === 'fallback') reason = 'No provider match returned';
    else if (!result.title) reason = 'Provider returned no title';
    else if (normalizedTitle(media.title) !== normalizedTitle(result.title)) reason = 'Title does not match the library item';
    else if (media.type === 'album') reason = 'Album artist cannot be verified; review this result manually';
    else if (!trustedMediaYear(media)) reason = 'Library year is unverified; review this result manually';
    else if (!result.year) reason = 'Provider returned no year; review this result manually';
    else if (trustedMediaYear(media) !== result.year) reason = 'Year does not match the library item';
    const providers = Array.isArray(result.diagnostics)
      ? result.diagnostics.filter((entry): entry is MetadataFetchDiagnostic =>
        entry && typeof entry.provider === 'string' && typeof entry.outcome === 'string')
      : undefined;
    onDetails?.({ source: result.source, returnedTitle: result.title, returnedYear: result.year, reason, fields, providers });
    return verified ? result : null;
  } catch (error) {
    if (timedOut && !signal.aborted) throw new Error('Metadata lookup timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
