import type { CastMember, MediaMetadata } from '../types';
import { isTauri } from '../lib/api';
import { getFileCategory, parseTitleAndYear, SUPPORTED_AUDIO_EXTENSIONS } from './mediaExtractor';
import { cleanUniverseTitle, metadataTitleVariants, normalizeUniverseTitle } from '../shared/universeMatcher';
import { isGenericDownloadMedia } from './excludedMedia';

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
  matchMode?: 'ranked' | 'unique-title' | 'unique-variant';
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

export class MetadataReviewRequiredError extends Error {
  constructor(message = 'Provider results are ambiguous or too numerous to verify; review manually.') {
    super(message);
    this.name = 'MetadataReviewRequiredError';
  }
}

const CATEGORY_FOLDER_NAMES = new Set([
  'pictures', 'collections', 'collection', 'comedy', 'animation', 'horror',
  'horror - supernatural', 'scifi', 'scify', 'sci-fi', 'drama', 'reality',
  'movies', 'series', 'franchises', 'franchise', 'documentary', 'documentaries',
  'documentory', 'sort', 'lost+found',
]);

export function isCategorizerFolderLabel(media: MediaMetadata): boolean {
  if (isGenericDownloadMedia(media)) return true;
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

function collectionBase(title: string): string | undefined {
  const match = title.match(/^\s*(.+?)\s+(?:collection|trilogy|complete)(?:\s+[\[(]?(?:19|20)\d{2}(?:\s*-\s*(?:19|20)\d{2})?[\])]?)?(?:\s+(?:mkvking|yify|bone|rarbg))?\s*$/i);
  return match && !/^the$/i.test(match[1]) ? match[1] : undefined;
}

export function isSingleFilmCollectionLookup(media: Pick<MediaMetadata, 'title' | 'type'>): boolean {
  return media.type === 'movie' && !!collectionBase(media.title);
}

function hasNumberedSeriesContext(media: Pick<MediaMetadata, 'title' | 'type'> & Partial<Pick<MediaMetadata, 'folderPath' | 'path' | 'matchedFilename'>>): boolean {
  const match = media.title.match(/^(.+?)\s+(?:0[1-9]|[1-9]\d)$/);
  if (!match) return false;
  const paths = [media.folderPath, media.path].filter((path): path is string => !!path);
  return paths.some(path => {
    const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.some(segment => /^(?:tv|tv shows?|television|shows?|series|anime|сериалы)$/i.test(segment))) return true;
    return segments.slice(0, -1).some(segment => normalizedTitle(segment) === normalizedTitle(match[1])) &&
      normalizedTitle(segments[segments.length - 1].replace(/\.[^.]+$/, '')) === normalizedTitle(media.title);
  });
}

export function libraryLookupTitle(media: Pick<MediaMetadata, 'title' | 'type'> & Partial<Pick<MediaMetadata, 'folderPath' | 'path' | 'matchedFilename'>>): string {
  if (media.type === 'album') return media.title;
  const original = media.title;
  let title = collectionBase(original) || original;
  title = title.replace(/\s{2,}(?:BONE|YIFY|RARBG|ETRG|JYK|OFT|KATRG)\s*$/i, '');
  const taggedCollection = title.match(/^\s*0[1-9]\s+(.+?)\s+-\s+(?:(?:(?:unrated|extended|theatrical|directors[\s-]cut)\s+)?(?:(?:action|adventure|animation|comedy|crime|documentary|drama|fantasy|horror|mystery|romance|sci[\s-]?fi|thriller)\s+)*)?((?:19|20)\d{2})(?:\s+(?:(?:eng|english|ita|italian|rus|russian)\s+)*(?:multi[\s-]*)?subs?)?\s*$/i);
  if (taggedCollection) title = `${taggedCollection[1]} ${taggedCollection[2]}`;
  if (media.type === 'series') {
    if (hasNumberedSeriesContext(media)) {
      title = title.replace(/\s+(?:0[1-9]|[1-9]\d)$/, '');
    }
    title = title.replace(/(\b(?:19|20)\d{2}\b)\s+specials\s+-[a-z0-9][a-z0-9._-]*\s*$/i, '$1');
  }
  title = title.replace(/\s+ac3\s+[57][ .]1(?:\s+(?:ita|italian|eng|english))*\s+(?=h[ ._-]?265\b)/i, ' ');
  title = title.replace(/(\b(?:19|20)\d{2}\b)\s+(?:(?:amzn|nf|dsnp|dc|repack|cd[12])\s+)*(?:brrip|bdrip|dvdrip|webrip|web[\s.-]?(?:dl|rip)|hdtv|vhsrip)\b.*$/i, '$1');
  title = title.replace(/(\b(?:19|20)\d{2}\b)\s+(?!(?:amzn|nf|dsnp|dc|ip)\s*$)(?:[-\s]*(?:remastered|unrated|uncut|dc|assembly\s+cut|special\s+cut|amzn|nf|dsnp|ip|ddp?\+?\s*[257][ .]?[01]|[57][ .]1|[68]ch|ac3|h[ ._-]?26[45]|av1|xvid|10[\s-]?bit|8[\s-]?bit|\d{2,5}mb|hq|dual\s+audio|esub|anoxmous|bone|yify|etrg|jyk|oft|rbg|rarbg|mgb|mkvking|mkvcage|mmkv|katrg|shaanig|rmteam|galaxyrg265|galaxyrg|psa|flux|gprs|qoq|onlyweb|cmrg|fgt|saon|ws)(?=$|[\s-]))+[-\s]*$/i, '$1');
  title = title.replace(/(\b(?:19|20)\d{2}\b)\s+(?:yify|-(?:oft|jyk)?)\s*$/i, '$1');
  title = title.replace(
    /(\b(?:19|20)\d{2}\b)(?:\s+(?:10[\s-]?bit|8[\s-]?bit|5[ .]1|7[ .]1|(?:eng|english)\s+subs?))+\s*$/i,
    '$1',
  );
  title = title.replace(/(dvdrip)(?=[\s-]+(?:ac3[\s-]+)?(?:axxo|fxg|extratorrentrg)\s*$).*$/i, ' ');
  return cleanUniverseTitle(title).title || original;
}

export function trustedMediaYear(media: MediaMetadata): number | undefined {
  if (!Number.isInteger(media.year) || media.year <= 0) return undefined;
  if (media.yearSource === 'placeholder') return undefined;
  if (media.yearSource === 'user' || media.yearSource === 'provider') return media.year;
  if (collectionBase(media.title)) return undefined;

  if (media.yearSource === 'filename' || media.yearSource === 'folder') {
    const basename = (value?: string) => value?.replace(/\\/g, '/').split('/').filter(Boolean).pop();
    const names = [media.title, media.matchedFilename, basename(media.folderPath), basename(media.path), basename(media.recommendedFolderStructure)];
    if (media.yearSource === 'folder') {
      for (const path of [media.path, media.recommendedFolderStructure]) {
        const segments = path?.replace(/\\/g, '/').split('/').filter(Boolean) || [];
        names.push(...segments.slice(0, -1).filter(name =>
          normalizeUniverseTitle(cleanUniverseTitle(name).title) === normalizeUniverseTitle(cleanUniverseTitle(media.title).title)));
      }
    }
    return names.some(name => {
      if (!name) return false;
      if (/\b(?:19|20)\d{2}\s*-\s*(?:19|20)\d{2}\b/.test(name)) return false;
      const parsed = parseTitleAndYear(name);
      return parsed.hasYear && parsed.year === media.year;
    }) ? media.year : undefined;
  }

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

export function metadataLookupMedia(media: MediaMetadata): MediaMetadata {
  if (media.type === 'movie' && hasNumberedSeriesContext(media)) {
    return { ...media, type: 'series' };
  }
  return media;
}

export function isVerifiedMatch(media: MediaMetadata, result: FetchedLibraryMetadata): boolean {
  media = metadataLookupMedia(media);
  if (media.type === 'album') {
    const artist = trustedAlbumArtist(media);
    return result.source === 'musicbrainz-audiodb' && !!artist && !!result.artist && !!result.musicBrainzId &&
      normalizeUniverseTitle(artist) === normalizeUniverseTitle(result.artist) &&
      !!result.title && normalizedTitle(media.title) === normalizedTitle(result.title);
  }
  const year = trustedMediaYear(media);
  const lookupTitle = libraryLookupTitle(media);
  if (result.matchMode === 'unique-title' || result.matchMode === 'unique-variant') {
    const resultTitle = result.title;
    return (media.type === 'series' || isSingleFilmCollectionLookup(media)) &&
      !year && result.source === 'tmdb' && !!result.year &&
      !!resultTitle && (result.matchMode === 'unique-title'
        ? normalizeUniverseTitle(lookupTitle) === normalizeUniverseTitle(resultTitle)
        : metadataTitleVariants(lookupTitle).some(variant => normalizeUniverseTitle(variant) === normalizeUniverseTitle(resultTitle)));
  }
  if (result.matchMode === 'ranked') {
    const resultTitle = result.title;
    return result.source === 'tmdb' && !!resultTitle && !!year && !!result.year &&
      Math.abs(year - result.year) <= 1 &&
      metadataTitleVariants(lookupTitle).some(variant => normalizeUniverseTitle(variant) === normalizeUniverseTitle(resultTitle));
  }
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
  if (isVerifiedMatch(media, result)) updated.type = metadataLookupMedia(media).type;
  if ((result.matchMode === 'unique-title' || result.matchMode === 'unique-variant') && isVerifiedMatch(media, result) && result.year) {
    updated.year = result.year;
    updated.yearSource = 'provider';
  }
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
  }, 30000);
  try {
    const lookupMedia = metadataLookupMedia(media);
    const port = isTauri ? (window as Window & { __EXPRESS_PORT__?: number }).__EXPRESS_PORT__ || 3000 : undefined;
    const url = isTauri ? `http://127.0.0.1:${port}/api/media/fetch-art` : '/api/media/fetch-art';
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: libraryLookupTitle(lookupMedia), type: lookupMedia.type, year: trustedMediaYear(media), artist: media.type === 'album' ? trustedAlbumArtist(media) : undefined, requireProviderYear: true, allowRanked: true, allowUniqueMovie: isSingleFilmCollectionLookup(lookupMedia), diagnostics: true }),
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
    if (verified && (result.matchMode === 'unique-title' || result.matchMode === 'unique-variant')) reason = `Unique TMDB ${lookupMedia.type} title or variant; local year unverified${lookupMedia.type === 'movie' ? '; collection matched to one film' : ''}`;
    else if (verified && result.matchMode === 'ranked') reason = 'Ranked match using title variant or nearby year; verify manually';
    else if (!result.source || result.source === 'fallback') reason = 'No provider match returned';
    else if (!result.title) reason = 'Provider returned no title';
    else if (normalizedTitle(libraryLookupTitle(lookupMedia)) !== normalizedTitle(result.title)) reason = 'Title does not match the library item';
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
    if ((!result.source || result.source === 'fallback') && isSingleFilmCollectionLookup(lookupMedia) && !trustedMediaYear(media) &&
        providers?.some(({ provider, outcome }) => provider === 'TMDB' && outcome === 'No API token configured')) {
      throw new Error('A TMDB token is required to match a collection without a trusted year.');
    }
    if ((!result.source || result.source === 'fallback') && providers?.some(({ outcome }) =>
      /^(?:HTTP (?!404\b)\d+|Network error or timeout|Key, quota, or request rejected|No API key configured|Invalid provider response|Provider returned an error|Provider (?:queue is full|cooling down)|Response contained no title)/i.test(outcome))) {
      throw new Error('One or more metadata providers failed; check the provider details and retry.');
    }
    if ((!result.source || result.source === 'fallback') && providers?.some(({ outcome }) =>
      /^(?:Ambiguous results|Too many results)/i.test(outcome))) {
      throw new MetadataReviewRequiredError();
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
