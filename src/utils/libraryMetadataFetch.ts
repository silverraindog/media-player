import type { CastMember, MediaMetadata } from '../types';
import { isTauri } from '../lib/api';
import { getFileCategory, parseTitleAndYear, SUPPORTED_AUDIO_EXTENSIONS } from './mediaExtractor';
import { cleanUniverseTitle, normalizeUniverseTitle } from '../shared/universeMatcher';

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
  artist?: string;
  musicBrainzId?: string;
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

export class MetadataBackendUnavailableError extends Error {
  constructor() {
    super('Metadata backend is unavailable. Check that the backend is running and accessible, then retry Fetch All.');
    this.name = 'MetadataBackendUnavailableError';
  }
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

export function isMetadataSidecar(media: MediaMetadata): boolean {
  const isSidecar = (path?: string) => {
    if (!path) return false;
    const category = getFileCategory(path.replace(/\\/g, '/').split('/').pop() || '');
    return category === 'subtitles' || category === 'metadata' || category === 'artwork';
  };
  if (isSidecar(media.recommendedFolderStructure)) return true;
  if (media.folderPath || (media.recommendedFolderStructure && media.recommendedFolderStructure !== media.path && !isSidecar(media.path))) return false;
  return isSidecar(media.path) || isSidecar(media.matchedFilename);
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

export function libraryLookupTitle(media: Pick<MediaMetadata, 'title' | 'type'>): string {
  if (media.type === 'album') return media.title;
  const original = media.title;
  let title = original;
  const taggedCollection = title.match(/^\s*0[1-9]\s+(.+?)\s+-\s+(?:(?:(?:unrated|extended|theatrical|directors[\s-]cut)\s+)?(?:(?:action|adventure|animation|comedy|crime|documentary|drama|fantasy|horror|mystery|romance|sci[\s-]?fi|thriller)\s+)*)?((?:19|20)\d{2})(?:\s+(?:(?:eng|english|ita|italian|rus|russian)\s+)*(?:multi[\s-]*)?subs?)?\s*$/i);
  if (taggedCollection) title = `${taggedCollection[1]} ${taggedCollection[2]}`;
  title = title.replace(/(\b(?:19|20)\d{2}\b)\s+(?:brrip|bdrip|dvdrip|webrip|web[\s.-]?dl)\b.*$/i, '$1');
  title = title.replace(/(\b(?:19|20)\d{2}\b)\s+-oft\s*$/i, '$1');
  title = title.replace(
    /(\b(?:19|20)\d{2}\b)(?:\s+(?:10[\s-]?bit|8[\s-]?bit|5[ .]1|7[ .]1|(?:eng|english)\s+subs?))+\s*$/i,
    '$1',
  );
  return cleanUniverseTitle(title).title || original;
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
  if (media.type === 'album') {
    const artist = trustedAlbumArtist(media);
    return result.source === 'musicbrainz-audiodb' && !!artist && !!result.artist && !!result.musicBrainzId &&
      normalizeUniverseTitle(artist) === normalizeUniverseTitle(result.artist) &&
      !!result.title && normalizedTitle(media.title) === normalizedTitle(result.title);
  }
  const year = trustedMediaYear(media);
  const lookupTitle = libraryLookupTitle(media);
  return !!result.source && result.source !== 'fallback' && !!result.title &&
    !!lookupTitle && normalizedTitle(lookupTitle) === normalizedTitle(result.title) &&
    !!year && !!result.year && year === result.year;
}

export function trustedAlbumArtist(media: MediaMetadata): string | undefined {
  const artists = media.artists?.map(artist => artist.trim()).filter(Boolean) || [];
  if (artists.length !== 1 || /^(?:unknown|various artists|imported artist|artist)$/i.test(artists[0])) return undefined;
  return artists[0];
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
  if (!updated.musicBrainzId && result.musicBrainzId) updated.musicBrainzId = result.musicBrainzId;
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
    const url = isTauri ? `http://127.0.0.1:${port}/api/media/fetch-art` : '/api/media/fetch-art';
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: libraryLookupTitle(media), type: media.type, year: trustedMediaYear(media), artist: media.type === 'album' ? trustedAlbumArtist(media) : undefined, requireProviderYear: true, diagnostics: true }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new MetadataBackendUnavailableError();
    }
    if (!response.ok) throw new Error(`Metadata lookup failed (HTTP ${response.status})`);
    const result: FetchedLibraryMetadata & { success?: boolean; diagnostics?: unknown; fallback?: boolean } = await response.json();
    if (!result || !result.success) throw new Error('Metadata lookup returned an invalid response');
    if (result.fallback || result.source === 'local_storage_cache') throw new MetadataBackendUnavailableError();
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
    else if (normalizedTitle(libraryLookupTitle(media)) !== normalizedTitle(result.title)) reason = 'Title does not match the library item';
    else if (media.type === 'album' && !verified) reason = 'Album artist cannot be verified; review this result manually';
    else if (media.type === 'album') reason = 'Verified album and artist';
    else if (!trustedMediaYear(media)) reason = 'Library year is unverified; review this result manually';
    else if (!result.year) reason = 'Provider returned no year; review this result manually';
    else if (trustedMediaYear(media) !== result.year) reason = 'Year does not match the library item';
    const providers = Array.isArray(result.diagnostics)
      ? result.diagnostics.filter((entry): entry is MetadataFetchDiagnostic =>
        entry && typeof entry.provider === 'string' && typeof entry.outcome === 'string')
      : undefined;
    onDetails?.({ source: result.source, returnedTitle: result.title, returnedYear: result.year, reason, fields, providers });
    if ((!result.source || result.source === 'fallback') && providers?.some(({ outcome }) =>
      /^(?:HTTP (?!404\b)\d+|Network error or timeout|Key, quota, or request rejected|No API key configured|Invalid provider response|Provider returned an error|Provider (?:queue is full|cooling down)|Response contained no title|Ambiguous results|Too many results)/i.test(outcome))) {
      throw new Error('One or more metadata providers failed; check the provider details and retry.');
    }
    return verified ? result : null;
  } catch (error) {
    if (timedOut && !signal.aborted) throw new Error('Metadata lookup timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
