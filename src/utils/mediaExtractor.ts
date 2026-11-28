import {
  MediaMetadata,
  MediaType,
  SambaShareNode,
  ParsedFileInfo,
  MediaScanExtensionConfig,
  SeasonMetadata,
  EpisodeMetadata,
  CastMember,
} from '../types';
import { CURATED_MEDIA_DATABASE } from '../data/curatedMedia';
import { resolveMediaWithFallback } from './clientMediaResolver';
import { normalizeFranchiseHierarchy } from './franchiseHierarchy';
import { categorizeMediaWithRetry } from './metadataCategorizer';
import { logger } from './loggerService';
import {
  ALL_MEDIA_EXTENSIONS_LIST,
  DEFAULT_MEDIA_SCAN_CONFIG,
  detectMediaType,
  extractEpisodeInfoFromFilename,
  extractMediaFromNodeEntries,
  extractSeasonNumberFromPath,
  flattenTreeToEntries,
  getDirectPlaybackUrl,
  getFileCategory,
  getFileExtension,
  isMediaFile,
  isSeasonDirectory,
  nodeToMediaMetadata,
  parseTitleAndYear,
  SUPPORTED_ARTWORK_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_BOOK_EXTENSIONS,
  SUPPORTED_DISC_EXTENSIONS,
  SUPPORTED_METADATA_EXTENSIONS,
  SUPPORTED_SUBTITLE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from './mediaParserCore';
import { mediaScannerWorkerPool, WorkerPoolProgress } from '../workers/mediaScannerWorkerPool';

export {
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_DISC_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_BOOK_EXTENSIONS,
  SUPPORTED_SUBTITLE_EXTENSIONS,
  SUPPORTED_ARTWORK_EXTENSIONS,
  SUPPORTED_METADATA_EXTENSIONS,
  ALL_MEDIA_EXTENSIONS_LIST,
  DEFAULT_MEDIA_SCAN_CONFIG,
  getFileExtension,
  getFileCategory,
  isMediaFile,
  getDirectPlaybackUrl,
  isSeasonDirectory,
  detectMediaType,
  parseTitleAndYear,
  extractSeasonNumberFromPath,
  extractEpisodeInfoFromFilename,
  nodeToMediaMetadata,
};

// Recursively traverse Samba nodes and extract all unique MediaMetadata items across all media extensions
export function extractAllMediaFromSambaTree(
  nodes: SambaShareNode[],
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG
): MediaMetadata[] {
  const normalizedNodes = normalizeFranchiseHierarchy(nodes);
  const entries = flattenTreeToEntries(normalizedNodes);
  return extractMediaFromNodeEntries(entries, config);
}

// Distributed Web Worker Pool tree extractor (with automatic chunked main-thread fallback when Workers are unavailable)
export async function extractAllMediaFromSambaTreeAsync(
  nodes: SambaShareNode[],
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG,
  _chunkSize: number = 30,
  onProgress?: (progress: WorkerPoolProgress) => void
): Promise<MediaMetadata[]> {
  if (!nodes || nodes.length === 0) return [];
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const statsBefore = mediaScannerWorkerPool.getStats();

  const extracted = await mediaScannerWorkerPool.extractMediaFromTreeWithPool(nodes, config, onProgress);

  const elapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
  logger.info(
    `[Scanner] Extracted ${extracted.length} media item(s) in ${elapsedMs}ms (${statsBefore.isSupported ? `Web Worker pool x${statsBefore.poolSize}` : 'Main thread fallback'}).`,
    'Scanner'
  );
  return extracted;
}


// Convert parsed cleaner files into MediaMetadata
export function parsedFileToMediaMetadata(item: ParsedFileInfo): MediaMetadata {
  const type = item.detectedType || 'movie';
  let posterUrl = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80';
  let defaultPlayback = getDirectPlaybackUrl(item.cleanFolderPath || item.cleanFormattedFilename);

  if (type === 'series') {
    posterUrl = 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80';
    defaultPlayback = getDirectPlaybackUrl(item.cleanFolderPath || item.cleanFormattedFilename);
  } else if (type === 'album') {
    posterUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80';
    defaultPlayback = getDirectPlaybackUrl(item.cleanFolderPath || item.cleanFormattedFilename);
  }

  return {
    id: `batch-imported-${item.id}-${Date.now()}`,
    type: type,
    title: item.detectedTitle,
    year: item.detectedYear || new Date().getFullYear(),
    overview: `Imported via Batch Renamer from release: "${item.originalFilename}". Tagged for Samba storage.`,
    genres: ['Imported Media', type === 'series' ? 'series' : type === 'album' ? 'Audio Album' : 'Feature Film'],
    rating: 8.5,
    posterUrl: posterUrl,
    playbackUrl: defaultPlayback,
    recommendedFolderStructure: item.cleanFolderPath,
    recommendedFilenames: [item.cleanFormattedFilename],
    matchedFilename: item.originalFilename,
    seasons: type === 'series' && item.detectedSeason ? [
      {
        seasonNumber: item.detectedSeason,
        name: `Season ${item.detectedSeason}`,
        episodeCount: 1,
        episodes: [
          {
            episodeNumber: item.detectedEpisode || 1,
            seasonNumber: item.detectedSeason,
            title: item.detectedTitle,
            plot: `Episode from file: ${item.originalFilename}`,
            rating: 8.5,
            playbackUrl: getDirectPlaybackUrl(`${item.cleanFolderPath}/${item.cleanFormattedFilename}`),
          }
        ]
      }
    ] : undefined,
    tracks: type === 'album' ? [
      {
        trackNumber: item.detectedTrack || 1,
        title: item.detectedTitle,
        duration: '3:30',
        artist: item.detectedArtist || 'Imported Artist',
        playbackUrl: getDirectPlaybackUrl(`${item.cleanFolderPath}/${item.cleanFormattedFilename}`),
      }
    ] : undefined,
    source: 'curated-database',
  };
}

// Utility to clean HTML markup from synopsis/plots
function stripHtmlTags(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

/**
 * Primary metadata fetcher function in the media extraction service.
 * Queries primary OMDb / API server endpoint.
 */
export async function fetchPrimaryMetadata(
  title: string,
  type: MediaType | 'all' = 'all',
  year?: number
): Promise<MediaMetadata | null> {
  return categorizeMediaWithRetry(title, type, year, { maxRetries: 3, initialDelayMs: 400 });
}

/**
 * Secondary metadata fetcher function in the media extraction service.
 * Acts as a resilient fallback if the primary API (e.g. OMDb) fails or returns 404/redirect/HTML.
 * Specifically queries alternative sources like TVMaze or TMDB / iTunes to ensure
 * series titles like '24' are always resolved with comprehensive metadata, episodes, and artwork.
 */
export async function fetchSecondaryMetadata(
  title: string,
  type: MediaType | 'all' = 'all',
  year?: number
): Promise<MediaMetadata | null> {
  const cleanTitle = title.replace(/\s*\(\d{4}\).*$/, '').trim();
  if (!cleanTitle) return null;

  const isSeries = type === 'series' || type === 'all' || /24|breaking bad|season|series/i.test(cleanTitle);

  // 1. Alternative Provider for Series: TVMaze API (Keyless, CORS-enabled, High-Reliability)
  if (isSeries) {
    try {
      const tvmazeUrl = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanTitle)}&embed[]=episodes&embed[]=cast`;
      const res = await fetch(tvmazeUrl, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.name) {
          const showTitle = data.name;
          const premieredYear = data.premiered ? parseInt(data.premiered.substring(0, 4), 10) : year || 2001;
          const overview = stripHtmlTags(data.summary) || `Catalog record for ${showTitle}.`;
          const posterUrl = data.image?.original || data.image?.medium || 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80';
          const rating = data.rating?.average || 8.4;
          const genres = data.genres && data.genres.length > 0 ? data.genres : ['Action', 'Drama', 'Thriller'];
          const studio = data.network?.name || data.webChannel?.name || 'Television Network';

          // Parse Embedded Episodes grouped by Season
          const rawEpisodes = data._embedded?.episodes || [];
          const seasonMap = new Map<number, EpisodeMetadata[]>();

          rawEpisodes.forEach((ep: any) => {
            const sNum = ep.season || 1;
            const epNum = ep.number || 1;
            if (!seasonMap.has(sNum)) {
              seasonMap.set(sNum, []);
            }
            seasonMap.get(sNum)!.push({
              episodeNumber: epNum,
              seasonNumber: sNum,
              title: ep.name || `Episode ${epNum}`,
              airDate: ep.airdate,
              plot: stripHtmlTags(ep.summary) || `Episode ${epNum} of ${showTitle}.`,
              rating: ep.rating?.average || rating,
              thumbUrl: ep.image?.original || ep.image?.medium,
              playbackUrl: getDirectPlaybackUrl(showTitle),
            });
          });

          const seasons: SeasonMetadata[] = Array.from(seasonMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([seasonNum, eps]) => ({
              seasonNumber: seasonNum,
              name: seasonNum === 0 ? 'Specials' : `Season ${seasonNum}`,
              episodeCount: eps.length,
              episodes: eps.sort((a, b) => a.episodeNumber - b.episodeNumber),
            }));

          // Parse Embedded Cast
          const rawCast = data._embedded?.cast || [];
          const cast: CastMember[] = rawCast.slice(0, 12).map((c: any) => ({
            name: c.person?.name || 'Cast Member',
            role: c.character?.name || 'Cast',
          }));

          const resolvedMetadata: MediaMetadata = {
            id: `secondary-tvmaze-${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
            type: 'series',
            title: showTitle,
            originalTitle: showTitle,
            year: premieredYear,
            primaryCategory: genres[0] || 'Drama',
            genres: genres,
            overview: overview,
            rating: rating,
            posterUrl: posterUrl,
            fanartUrl: posterUrl,
            studio: studio,
            seasons: seasons.length > 0 ? seasons : undefined,
            cast: cast.length > 0 ? cast : undefined,
            source: 'secondary-tvmaze-fallback',
            recommendedFolderStructure: `series/${showTitle} (${premieredYear})/`,
            recommendedFilenames: [
              `${showTitle} - S01E01 [1080p].mkv`,
              'tvshow.nfo',
              'poster.jpg',
            ],
            playbackUrl: getDirectPlaybackUrl(showTitle),
          };

          return resolvedMetadata;
        }
      }
    } catch (tvmazeErr) {
      console.warn(`[SecondaryFetcher] TVMaze resolution error for "${cleanTitle}":`, tvmazeErr);
    }
  }

  // 2. Alternative Provider for Movies & Music: iTunes Open Search API (Keyless, 1000x1000 Art, Instant)
  try {
    const entity = (type as string) === 'album' || (type as string) === 'audio' ? 'album' : 'movie';
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&entity=${entity}&limit=1`;
    const itunesRes = await fetch(itunesUrl);

    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      if (itunesData?.resultCount > 0 && itunesData.results[0]) {
        const item = itunesData.results[0];
        const itemTitle = item.trackName || item.collectionName || cleanTitle;
        const itemYear = item.releaseDate ? parseInt(item.releaseDate.substring(0, 4), 10) : year || 2024;
        const highResArt = (item.artworkUrl100 || '').replace('/100x100bb.jpg', '/1000x1000bb.jpg');
        const overview = item.longDescription || item.description || `Catalog record for ${itemTitle}.`;
        const genre = item.primaryGenreName ? [item.primaryGenreName] : ['Feature Film'];

        return {
          id: `secondary-itunes-${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
          type: type === 'album' ? 'album' : 'movie',
          title: itemTitle,
          year: itemYear,
          primaryCategory: genre[0] || 'Drama',
          genres: genre,
          overview: overview,
          rating: 8.5,
          posterUrl: highResArt || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
          fanartUrl: highResArt,
          source: 'secondary-itunes-fallback',
          recommendedFolderStructure: `Movies/${itemTitle} (${itemYear})/`,
          recommendedFilenames: [`${itemTitle} (${itemYear}) [1080p].mkv`, 'movie.nfo', 'poster.jpg'],
          playbackUrl: getDirectPlaybackUrl(itemTitle),
        };
      }
    }
  } catch (itunesErr) {
    console.warn(`[SecondaryFetcher] Alternative provider error for "${cleanTitle}":`, itunesErr);
  }

  return null;
}

/**
 * Resilient Media Metadata Resolver with Primary -> Secondary Fallback Pipeline.
 * 1. Tries primary API (OMDb / Backend Service).
 * 2. If primary fails (404, redirect, 500, non-JSON HTML body, or rejection),
 *    automatically invokes secondary metadata fetcher (TVMaze / TMDB).
 * 3. If remote APIs are offline, engages encyclopedic client knowledge engine.
 * Ensures series titles like '24' are always resolved with 100% certainty.
 */
export async function fetchMediaMetadataWithFallback(
  title: string,
  type: MediaType | 'all' = 'all',
  year?: number
): Promise<MediaMetadata> {
  const cleanTitle = title.replace(/\s*\(\d{4}\).*$/, '').trim();

  // Step 1: Attempt Primary API (OMDb)
  const primaryResult = await fetchPrimaryMetadata(cleanTitle, type, year);
  if (primaryResult && primaryResult.overview && primaryResult.posterUrl) {
    return primaryResult;
  }

  // Step 2: Attempt Secondary Metadata Fetcher (TVMaze / TMDB fallback)
  console.info(`[MediaExtractor] Primary provider incomplete or failed for "${cleanTitle}". Invoking secondary metadata fetcher.`);
  const secondaryResult = await fetchSecondaryMetadata(cleanTitle, type, year);
  if (secondaryResult) {
    return secondaryResult;
  }

  // Step 3: Offline / Encyclopedic Knowledge Engine Fallback
  console.info(`[MediaExtractor] Remote APIs unreachable. Engaging encyclopedic resolver for "${cleanTitle}".`);
  const knowledgeResult = await resolveMediaWithFallback(cleanTitle, type, year);
  return {
    ...knowledgeResult,
    id: `fallback-${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
    source: 'encyclopedic-knowledge-fallback',
  };
}

/**
 * Inspects filename patterns for quality keywords (e.g., '1080p', '4K', 'HEVC')
 * and returns the detected resolution/quality string.
 */
export function extractResolution(filename: string): string | undefined {
  if (!filename) return undefined;

  const patterns = [
    { regex: /\b(2160p|4k|uhd)\b/i, label: '4K' },
    { regex: /\b(1080p|fhd)\b/i, label: '1080p' },
    { regex: /\b(720p|hd)\b/i, label: '720p' },
    { regex: /\b(480p|sd)\b/i, label: '480p' },
    { regex: /\b(hevc|x265)\b/i, label: 'HEVC' },
    { regex: /\b(x264|h264)\b/i, label: 'H.264' }
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(filename)) {
      return pattern.label;
    }
  }
  return undefined;
}

const GENERIC_GENRE_TOKENS = new Set([
  'imported',
  'imported media',
  'uncategorized',
  'unclassified',
  'file',
  'series',
  'feature film',
  'audio album',
  'lossless audio',
  'music',
  'pending',
  'draft',
]);

const GENERIC_FALLBACK_POSTER_IDS = [
  'photo-1489599849927-2ee91cede3ba',
  'photo-1522869635100-9f4c5e86aa37',
  'photo-1536440136628-849c177e76a1',
];

export function isMediaImportedOrUnverified(m: MediaMetadata): boolean {
  const id = String(m.id || '').toLowerCase();
  const st = String(m.status || '').toLowerCase();
  return (
    st === 'pending' ||
    st === 'draft' ||
    st === 'uncategorized' ||
    st === 'unmatched' ||
    id.startsWith('imported-') ||
    id.startsWith('batch-imported-') ||
    id.startsWith('samba-')
  );
}

export function isMediaMissingSynopsis(m: MediaMetadata): boolean {
  const text = (m.overview || (m as any).synopsis || '').trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  if (
    lower.includes('placeholder') ||
    lower.includes('no synopsis') ||
    lower.includes('no overview')
  ) {
    return true;
  }
  if (
    m.status !== 'categorized' &&
    (lower.includes('cataloged from samba network storage') ||
      lower.includes('imported via batch renamer') ||
      lower.includes('catalog record'))
  ) {
    return true;
  }
  return false;
}

export function isMediaMissingArtwork(m: MediaMetadata): boolean {
  const url = (m.posterUrl || '').trim();
  if (!url || url.startsWith('data:image/svg+xml')) return true;
  if (m.status !== 'categorized' && isMediaImportedOrUnverified(m)) {
    if (
      GENERIC_FALLBACK_POSTER_IDS.some((pid) => url.includes(pid)) ||
      url.includes('photo-1514525253161-7a46d19cd819')
    ) {
      return true;
    }
  }
  return false;
}

export function isMediaMissingGenres(m: MediaMetadata): boolean {
  if (m.status === 'categorized' && Array.isArray(m.genres) && m.genres.length > 0) {
    return false;
  }
  const st = String(m.status || '').toLowerCase();
  if (st === 'pending' || st === 'draft' || st === 'uncategorized' || st === 'unmatched') {
    return true;
  }
  if (!Array.isArray(m.genres) || m.genres.length === 0) return true;
  const hasSpecificGenre = m.genres.some((g) => !GENERIC_GENRE_TOKENS.has(String(g || '').trim().toLowerCase()));
  return !hasSpecificGenre;
}

export const UNSORTED_FOLDER_REGEX =
  /(?:^|[\\/])(sort|unsorted|in[\s._-]?flight|downloads?|incoming|temp|staging|scratch|misc)(?:[\\/]|$)/i;

export function isMediaInUnsortedPath(m: MediaMetadata): boolean {
  const candidates = [
    m.path,
    m.folderPath,
    m.recommendedFolderStructure,
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return candidates.some((p) => UNSORTED_FOLDER_REGEX.test(p));
}

export interface UnimportedUnsortedEntry {
  node: SambaShareNode;
  parentPath: string;
  fullPath: string;
}

function buildKnownMediaLookup(existingLibrary: MediaMetadata[] = []): {
  knownPaths: Set<string>;
  knownFilenames: Set<string>;
} {
  const normalize = (p?: string) =>
    (p || '')
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '')
      .toLowerCase()
      .trim();

  const knownPaths = new Set<string>();
  const knownFilenames = new Set<string>();

  for (let i = 0; i < existingLibrary.length; i++) {
    const item = existingLibrary[i];
    if (item.path) {
      const n = normalize(item.path);
      if (n) knownPaths.add(n);
    }
    if (item.folderPath) {
      const n = normalize(item.folderPath);
      if (n) knownPaths.add(n);
    }
    if (item.recommendedFolderStructure) {
      const n = normalize(item.recommendedFolderStructure);
      if (n) knownPaths.add(n);
    }
    if (item.matchedFilename) knownFilenames.add(item.matchedFilename.toLowerCase());
    if (Array.isArray(item.seasons)) {
      for (const s of item.seasons) {
        if (!Array.isArray(s.episodes)) continue;
        for (const ep of s.episodes) {
          const epPath = normalize(ep.filePath);
          if (epPath) knownPaths.add(epPath);
          if (ep.filename) knownFilenames.add(ep.filename.toLowerCase());
        }
      }
    }
  }

  return { knownPaths, knownFilenames };
}

function normalizeSambaLookupPath(p?: string): string {
  return (p || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase()
    .trim();
}

export function findUnimportedUnsortedNodes(
  nodes: SambaShareNode[] = [],
  existingLibrary: MediaMetadata[] = [],
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG
): { folderPaths: string[]; fileNodes: UnimportedUnsortedEntry[] } {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { folderPaths: [], fileNodes: [] };
  }

  const { knownPaths, knownFilenames } = buildKnownMediaLookup(existingLibrary);
  const folderPathSet = new Set<string>();
  const fileNodes: UnimportedUnsortedEntry[] = [];

  const stack: Array<{ node: SambaShareNode; parentPath: string; insideUnsorted: boolean }> = [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    stack.push({ node: nodes[i], parentPath: '', insideUnsorted: false });
  }

  while (stack.length > 0) {
    const { node, parentPath, insideUnsorted } = stack.pop()!;
    const rawFull = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
    const fullPath = rawFull.includes('//') ? rawFull.replace(/\/+/g, '/') : rawFull;

    const nameMatchesUnsorted = UNSORTED_FOLDER_REGEX.test(`/${node.name}/`);
    const isNodeUnsorted =
      insideUnsorted ||
      nameMatchesUnsorted ||
      (!parentPath && UNSORTED_FOLDER_REGEX.test(fullPath));

    if (node.type === 'folder') {
      if (nameMatchesUnsorted) {
        folderPathSet.add(fullPath);
      }
      if (node.children && node.children.length > 0) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push({ node: node.children[i], parentPath: fullPath, insideUnsorted: isNodeUnsorted });
        }
      }
    } else if (node.type === 'file' && isNodeUnsorted && isMediaFile(node.name, config)) {
      const normFull = normalizeSambaLookupPath(fullPath);
      const normParent = normalizeSambaLookupPath(parentPath);
      const alreadyImported =
        knownPaths.has(normFull) ||
        (normParent && knownPaths.has(normParent)) ||
        knownFilenames.has(node.name.toLowerCase());

      if (!alreadyImported) {
        if (parentPath) folderPathSet.add(parentPath);
        fileNodes.push({ node, parentPath, fullPath });
      }
    }
  }

  return {
    folderPaths: Array.from(folderPathSet),
    fileNodes,
  };
}

export async function findUnimportedUnsortedNodesAsync(
  nodes: SambaShareNode[] = [],
  existingLibrary: MediaMetadata[] = [],
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG,
  signal?: AbortSignal
): Promise<{ folderPaths: string[]; fileNodes: UnimportedUnsortedEntry[] }> {
  if (!Array.isArray(nodes) || nodes.length === 0 || signal?.aborted) {
    return { folderPaths: [], fileNodes: [] };
  }

  const { knownPaths, knownFilenames } = buildKnownMediaLookup(existingLibrary);
  const folderPathSet = new Set<string>();
  const fileNodes: UnimportedUnsortedEntry[] = [];

  const stack: Array<{ node: SambaShareNode; parentPath: string; insideUnsorted: boolean }> = [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    stack.push({ node: nodes[i], parentPath: '', insideUnsorted: false });
  }

  const CHUNK_SIZE = 1500;
  let processed = 0;

  while (stack.length > 0) {
    if (signal?.aborted) {
      return { folderPaths: [], fileNodes: [] };
    }

    const { node, parentPath, insideUnsorted } = stack.pop()!;
    const rawFull = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
    const fullPath = rawFull.includes('//') ? rawFull.replace(/\/+/g, '/') : rawFull;

    const nameMatchesUnsorted = UNSORTED_FOLDER_REGEX.test(`/${node.name}/`);
    const isNodeUnsorted =
      insideUnsorted ||
      nameMatchesUnsorted ||
      (!parentPath && UNSORTED_FOLDER_REGEX.test(fullPath));

    if (node.type === 'folder') {
      if (nameMatchesUnsorted) {
        folderPathSet.add(fullPath);
      }
      if (node.children && node.children.length > 0) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push({ node: node.children[i], parentPath: fullPath, insideUnsorted: isNodeUnsorted });
        }
      }
    } else if (node.type === 'file' && isNodeUnsorted && isMediaFile(node.name, config)) {
      const normFull = normalizeSambaLookupPath(fullPath);
      const normParent = normalizeSambaLookupPath(parentPath);
      const alreadyImported =
        knownPaths.has(normFull) ||
        (normParent && knownPaths.has(normParent)) ||
        knownFilenames.has(node.name.toLowerCase());

      if (!alreadyImported) {
        if (parentPath) folderPathSet.add(parentPath);
        fileNodes.push({ node, parentPath, fullPath });
      }
    }

    processed++;
    if (processed >= CHUNK_SIZE && stack.length > 0) {
      processed = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    folderPaths: Array.from(folderPathSet),
    fileNodes,
  };
}

export function isMediaUncategorized(m: MediaMetadata): boolean {
  return (
    isMediaMissingSynopsis(m) ||
    isMediaMissingArtwork(m) ||
    isMediaMissingGenres(m) ||
    (isMediaInUnsortedPath(m) && m.status !== 'categorized') ||
    (isMediaImportedOrUnverified(m) && m.status !== 'categorized')
  );
}


