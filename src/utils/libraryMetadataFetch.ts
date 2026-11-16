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

// Fetch library metadata from external sources
export function fetchLibraryMetadata(lookupMedia: any): Promise<FetchedLibraryMetadata | null> {
  if (!lookupMedia) return Promise.resolve(null);
  
  // Simulate async fetch - in production, this would make an actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      const metadata = {
        title: lookupMedia.title || '',
        source: 'tmdb',
        year: parseInt(lookupMedia.year) || 0,
        overview: lookupMedia.overview || '',
        posterUrl: lookupMedia.posterUrl || '',
        fanartUrl: lookupMedia.fanartUrl || '',
        genres: [],
        rating: 0,
        cast: [],
        artist: lookupMedia.artist || '',
        musicBrainzId: lookupMedia.musicBrainzId || null,
        collectionName: lookupMedia.collectionName || null,
        franchiseOverview: null,
        collectionFilms: [],
        matchMode: 'manual',
        candidates: []
      };
      resolve(metadata);
    }, 100);
  });
}

// Helper functions for checking missing metadata
export function isMissingText(value?: string): boolean {
  return value === null || value === undefined || value.trim() === '';
}

export function isMissingArtwork(value?: string): boolean {
  return value === null || value === undefined || value.trim() === '';
}

export function isMissingSynopsis(value?: string): boolean {
  return value === null || value === undefined || value.trim() === '';
}

// Categorization helpers
export function isCategorizerFolderLabel(media: MediaMetadata): boolean {
  if (isGenericDownloadMedia(media)) return true;
  const title = media.title.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!CATEGORY_FOLDER_NAMES.has(title)) return false;
  const filename = media.path?.replace(/\\/g, '/').split('/').pop() || '';
  const file = filename.match(/^(.+)\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|flv|ts|m2ts|mp3|flac|m4a|wav|ogg)$/i);
  return !file || file[1].trim().toLowerCase() !== title;
}

const CATEGORY_FOLDER_NAMES = new Set([
  'pictures', 'collections', 'collection', 'comedy', 'animation', 'horror',
  'horror - supernatural', 'scifi', 'scify', 'sci-fi', 'drama', 'reality',
  'movies', 'series', 'franchises', 'franchise', 'documentary', 'documentaries',
  'documentory', 'sort', 'lost+found',
]);

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

// Metadata lookup helpers
export function libraryLookupTitle(lookupMedia: any): string {
  if (!lookupMedia.title) return '';
  const title = lookupMedia.title.trim();
  let normalized = title;
  normalized = normalized.replace(/^\s*\d{1,3}[\s._-]+/, '');
  return normalized;
}

export function metadataLookupMedia(lookupMedia: any): MediaMetadata | undefined {
  if (!lookupMedia || !lookupMedia.title) return undefined;
  const title = lookupMedia.title.trim();
  return {
    id: lookupMedia.id,
    title: title,
    year: parseInt(lookupMedia.year) || 0,
    type: 'movie',
    path: '',
    matchedFilename: null,
    folderPath: null,
    recommendedFolderStructure: null,
    category: 'movies'
  };
}

export function metadataLookupYear(lookupMedia: any): boolean {
  if (!lookupMedia?.year) return false;
  return typeof lookupMedia.year === 'number' && !isNaN(lookupMedia.year);
}

export function isCollectionLookup(lookupMedia: MediaMetadata): boolean {
  if (media.type === 'collection') return true;
  const title = lookupMedia.title.toLowerCase();
  return ['collection', 'collections'].some(category => title.includes(category));
}

// Error classes for metadata fetch operations
export class MetadataBackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataBackendUnavailableError';
  }
}

export class MetadataReviewRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataReviewRequiredError';
  }
}

// Merge fetched metadata from external sources with local metadata
export function mergeFetchedMetadata(mediaList: MediaMetadata[], fetchedMetadataMap: Record<string, FetchedLibraryMetadata>): FetchedLibraryMetadata[] {
  const result: FetchedLibraryMetadata[] = [];
  
  for (const media of mediaList) {
    if (!fetchedMetadataMap[media.id]) {
      // Fetch metadata from external sources
      fetchLibraryMetadata(media).then(fetched => {
        if (fetched) {
          fetchedMetadataMap[media.id] = fetched;
        }
      });
    }
    
    // Add any existing metadata to result
    const existing = fetchedMetadataMap[media.id];
    if (existing) {
      result.push({
        ...existing,
        matchMode: media.matchMode || 'manual',
        collectionFilms: media.collectionFilms
      });
    } else {
      // Default metadata for unmatched items
      result.push({
        id: media.id,
        title: media.title,
        year: parseInt(media.year) || 0,
        source: media.source || 'local',
        overview: media.overview || '',
        posterUrl: media.posterUrl || '',
        fanartUrl: media.fanartUrl || '',
        genres: media.genres || [],
        rating: media.rating || 0,
        cast: media.cast || [],
        artist: media.artist || '',
        musicBrainzId: media.musicBrainzId || null,
        collectionName: media.collectionName || null,
        matchMode: media.matchMode || 'manual',
      });
    }
  }
  
  return result;
}
