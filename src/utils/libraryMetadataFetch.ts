import type { CastMember, FranchiseOverview, MediaMetadata } from '../types';
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
  collectionName?: string;
  collectionOverview?: string;
  franchiseOverview?: FranchiseOverview;
  collectionFilms?: NonNullable<MediaMetadata['collectionFilms']>;
  matchMode?: 'ranked' | 'unique-title' | 'unique-variant' | 'manual' | 'unique-collection';
  candidates?: Array<{
    source: 'tmdb';
    title: string;
    year?: number;
    overview?: string;
    posterUrl?: string;
    collectionId?: number;
    candidateType?: 'movie' | 'collection';
    collectionName?: string;
  }>;
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
  candidates?: NonNullable<FetchedLibraryMetadata['candidates']>;
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
  const file = filename.match(/^(.+)\\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|flv|ts|m2ts|mp3|flac|m4a|wav|ogg)$/i);
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
  return normalizeTitle(stripTrackNumber(filename)) === normalizeTitle(stripTrackNumber(media.title));
}

export function isMetadataSidecar(media: MediaMetadata): boolean {
  const isSidecar = (path?: string) => {
    if (!path) return false;
    const name = path.replace(/\\/g, '/').split('/').pop() || '';
    const extensions = ['.nfo', '.srt', '.list', '.txt'];
    return extensions.includes(name.toLowerCase());
  };
  return isSidecar(media.path) || isSidecar(media.folderPath) || isSidecar(media.recommendedFolderStructure);
}

const supportedGenres = new Set([
  'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary',
  'drama', 'family', 'fantasy', 'film-noir', 'history', 'horror', 'musical',
  'romance', 'sci-fi', 'science fiction', 'thriller', 'war', 'western'
]);

export function isSupportedGenre(genre: string): boolean {
  return supportedGenres.has(genre.toLowerCase());
}

const mediaTypes = new Set(['movie', 'tv', 'album', 'music', 'book', 'series', 'docu-series']);

export function isSupportedMediaType(type: string): boolean {
  return mediaTypes.has(type.toLowerCase());
}
