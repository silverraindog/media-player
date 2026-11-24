import {
  MediaMetadata,
  MediaType,
  SambaShareNode,
  MediaExtensionCategory,
  MediaScanExtensionConfig,
  EpisodeMetadata,
} from '../types';

// Comprehensive Media Extension Definitions (pure, DOM-free for both Main Thread & Web Workers)
export const SUPPORTED_VIDEO_EXTENSIONS = [
  'mkv', 'mp4', 'm4v', 'avi', 'mov', 'wmv', 'webm', 'flv', 'f4v',
  'ts', 'm2ts', 'mts', 'vob', 'ogv', '3gp', 'rm', 'rmvb', 'divx', 'asf',
];

export const SUPPORTED_DISC_EXTENSIONS = [
  'iso', 'img', 'bin', 'nrg',
];

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'flac', 'mp3', 'm4a', 'm4b', 'aac', 'ogg', 'oga', 'opus', 'wav',
  'aiff', 'aif', 'alac', 'wma', 'ape', 'wv', 'dsf', 'dff', 'mid', 'midi',
];

export const SUPPORTED_BOOK_EXTENSIONS = [
  'epub', 'pdf', 'mobi', 'azw', 'azw3', 'cbr', 'cbz', 'djvu', 'fb2',
];

export const SUPPORTED_SUBTITLE_EXTENSIONS = [
  'srt', 'vtt', 'ass', 'ssa', 'sub', 'idx', 'sup',
];

export const SUPPORTED_ARTWORK_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'svg', 'tbn',
];

export const SUPPORTED_METADATA_EXTENSIONS = [
  'nfo', 'xml', 'json', 'm3u', 'm3u8', 'cue', 'pls',
];

export const ALL_MEDIA_EXTENSIONS_LIST = [
  ...SUPPORTED_VIDEO_EXTENSIONS,
  ...SUPPORTED_DISC_EXTENSIONS,
  ...SUPPORTED_AUDIO_EXTENSIONS,
  ...SUPPORTED_BOOK_EXTENSIONS,
  ...SUPPORTED_SUBTITLE_EXTENSIONS,
  ...SUPPORTED_ARTWORK_EXTENSIONS,
  ...SUPPORTED_METADATA_EXTENSIONS,
];

const VIDEO_EXT_SET = new Set(SUPPORTED_VIDEO_EXTENSIONS);
const DISC_EXT_SET = new Set(SUPPORTED_DISC_EXTENSIONS);
const AUDIO_EXT_SET = new Set(SUPPORTED_AUDIO_EXTENSIONS);
const BOOK_EXT_SET = new Set(SUPPORTED_BOOK_EXTENSIONS);
const SUBTITLE_EXT_SET = new Set(SUPPORTED_SUBTITLE_EXTENSIONS);
const ARTWORK_EXT_SET = new Set(SUPPORTED_ARTWORK_EXTENSIONS);
const METADATA_EXT_SET = new Set(SUPPORTED_METADATA_EXTENSIONS);

export const ROOT_CONTAINER_NAMES = new Set([
  'movies', 'series', 'franchises', 'collections', 'collection', 'universes', 'sagas',
  'audio books', 'books', 'music', 'sort', 'unsorted', 'staging', 'incoming', 'temp',
  'scratch', 'misc', 'lost+found', 'anime', 'documentaries', 'tv shows', 'tv', 'shows',
  'downloads', 'share', 'storage', 'comedy', "comedy's", "comedy’s", 'series-tv',
  'tv-series', 'drama', 'dramas', 'accion', 'action', 'thriller', 'terror', 'horror',
  'scifi', 'sci-fi', 'media', 'videos', 'complete', 'video', 'nas', 'public', 'disk1', 'disk2',
  'franchise', 'box sets', 'box sets & collections', 'box sets and collections',
]);

export const DEFAULT_MEDIA_SCAN_CONFIG: MediaScanExtensionConfig = {
  searchAllExtensions: true,
  enabledCategories: {
    video: true,
    audio: true,
    books: true,
    disc_images: true,
    subtitles: true,
    artwork: true,
    metadata: true,
  },
  customExtensions: [],
  includeSubtitlesAndNfo: true,
  ignoreHiddenFiles: true,
};

export function getFileExtension(filePath: string): string {
  const clean = filePath.split('?')[0].split('#')[0];
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1 || lastDot === clean.length - 1) return '';
  return clean.slice(lastDot + 1).toLowerCase();
}

export function getFileCategory(filePath: string): MediaExtensionCategory | null {
  const ext = getFileExtension(filePath);
  if (!ext) return null;
  if (VIDEO_EXT_SET.has(ext)) return 'video';
  if (DISC_EXT_SET.has(ext)) return 'disc_images';
  if (AUDIO_EXT_SET.has(ext)) return 'audio';
  if (BOOK_EXT_SET.has(ext)) return 'books';
  if (SUBTITLE_EXT_SET.has(ext)) return 'subtitles';
  if (ARTWORK_EXT_SET.has(ext)) return 'artwork';
  if (METADATA_EXT_SET.has(ext)) return 'metadata';
  return null;
}

export function isMediaFile(
  fileNameOrPath: string,
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG
): boolean {
  const ext = getFileExtension(fileNameOrPath);
  if (!ext) return false;

  if (config.customExtensions && config.customExtensions.some((ce) => ce.toLowerCase().replace(/^\./, '') === ext)) {
    return true;
  }

  if (config.searchAllExtensions) {
    return (
      VIDEO_EXT_SET.has(ext) ||
      DISC_EXT_SET.has(ext) ||
      AUDIO_EXT_SET.has(ext) ||
      BOOK_EXT_SET.has(ext) ||
      (config.includeSubtitlesAndNfo && (SUBTITLE_EXT_SET.has(ext) || METADATA_EXT_SET.has(ext)))
    );
  }

  const cat = getFileCategory(fileNameOrPath);
  if (!cat) return false;
  return !!config.enabledCategories[cat];
}

export function getDirectPlaybackUrl(path?: string): string | undefined {
  if (!path) return undefined;
  const trimmed = path.trim();
  if (/^(https?|blob|data):/i.test(trimmed) || trimmed.includes('https:/') || trimmed.includes('http:/')) {
    const match = trimmed.match(/https?:\/\/.+/i) || trimmed.match(/https?:.+/i);
    return match ? match[0].replace(/^(https?):\/+([^\/])/i, '$1://$2') : trimmed;
  }
  if (trimmed.includes('/api/samba/stream')) {
    try {
      const qIdx = trimmed.indexOf('?');
      if (qIdx !== -1) {
        const search = new URLSearchParams(trimmed.substring(qIdx));
        const unwrapped = search.get('path') || search.get('file');
        if (unwrapped) return decodeURIComponent(unwrapped);
      }
    } catch {}
  }
  return trimmed;
}

function findFirstMediaFilePath(node: SambaShareNode, parentPath: string = ''): string | undefined {
  const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
  if (node.type === 'file' && isMediaFile(node.name)) return node.sourcePath || fullPath;
  for (const child of node.children || []) {
    const filePath = findFirstMediaFilePath(child, fullPath);
    if (filePath) return filePath;
  }
  return undefined;
}

export function isSeasonDirectory(folderName: string): boolean {
  const clean = folderName.trim().toLowerCase();
  return (
    /^(?:season|staffel|saison|temporada|stagione|series)[\s._-]?\d+/i.test(clean) ||
    /^s\d{1,2}(?:[\s._-].*)?$/i.test(clean) ||
    /^(?:specials?|extras?|bonus|featurettes?|behind\s*the\s*(?:scenes?|truth|mask|curtain)|making\s*of|trailers?|interviews?|deleted\s*scenes?|shorts?|sp|other|samples?)(?:[\s._-].*)?$/i.test(clean) ||
    /^(?:disc|disk|cd|dvd|part|volume|vol|side)[\s._-]?\d+/i.test(clean) ||
    /^\d{1,3}$/.test(clean) ||
    /^s\d{1,2}$/i.test(clean) ||
    /^season\s*\d+/i.test(clean)
  );
}

export function detectMediaType(filePath: string): MediaType {
  const lower = filePath.toLowerCase().replace(/\\/g, '/');
  const ext = getFileExtension(filePath);

  if (
    AUDIO_EXT_SET.has(ext) ||
    lower.startsWith('music/') ||
    lower.includes('/music/') ||
    lower.startsWith('audio books/') ||
    lower.includes('/audio books/') ||
    lower.includes('audiobook') ||
    lower.includes('album') ||
    lower.includes('soundtrack') ||
    lower.includes('discography')
  ) {
    return 'album';
  }

  if (
    BOOK_EXT_SET.has(ext) ||
    lower.startsWith('books/') ||
    lower.includes('/books/') ||
    lower.includes('comic') ||
    lower.includes('manga')
  ) {
    return 'album';
  }

  if (
    lower.startsWith('series/') ||
    lower.includes('/series/') ||
    lower.startsWith('tv shows/') ||
    lower.includes('/tv shows/') ||
    lower.startsWith('tv/') ||
    lower.includes('/tv/') ||
    lower.startsWith('shows/') ||
    lower.includes('/shows/') ||
    lower.startsWith('anime/') ||
    lower.includes('/anime/') ||
    lower.startsWith('documentaries/') ||
    lower.includes('/documentaries/') ||
    /(?:^|\/|[._ -])(?:season|staffel|saison|temporada|stagione|series)[\s._-]?\d+/i.test(lower) ||
    /(?:^|\/|[._ -])s\d{1,2}(?:e\d{1,2}|[\s._\-\/\[\]]|$)/i.test(lower) ||
    /s\d{1,2}e\d{1,2}/i.test(lower) ||
    /\d{1,2}x\d{1,2}/i.test(lower) ||
    /(?:^|\/)(?:specials|special|extras|bonus)(?:\/|$)/i.test(lower) ||
    /(?:^|\/|[._ -])ep[\s._-]?\d{1,3}/i.test(lower) ||
    /(?:^|\/|[._ -])episode[\s._-]?\d+/i.test(lower) ||
    /\b(series|serien|show|shows|tvshow|tvshows|television|kdrama|docus|miniseries)\b/i.test(lower)
  ) {
    return 'series';
  }

  return 'movie';
}

export function parseTitleAndYear(rawName: string): { title: string; year: number; season?: number; episode?: number } {
  const clean = rawName.replace(/\.[a-zA-Z0-9]{2,4}$/, '');

  let season: number | undefined;
  let episode: number | undefined;
  const sMatch = clean.match(/s(\d{1,2})e(\d{1,2})/i);
  if (sMatch) {
    season = parseInt(sMatch[1], 10);
    episode = parseInt(sMatch[2], 10);
  } else {
    const xMatch = clean.match(/(\d{1,2})x(\d{1,2})/i);
    if (xMatch) {
      season = parseInt(xMatch[1], 10);
      episode = parseInt(xMatch[2], 10);
    }
  }

  const yearMatch = clean.match(/[\(\[\.]?(19\d{2}|20\d{2})[\)\]\.]?/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  let title = clean
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/(1080p|2160p|4k|720p|bluray|web-dl|hdr|dts|x264|x265|hevc|aac|remux|extended)/gi, '')
    .replace(/s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2}/gi, '')
    .replace(/[\._]/g, ' ')
    .trim();

  const trackMatch = title.match(/^\d{1,2}\s*[-–]\s*(.+)/);
  if (trackMatch) {
    title = trackMatch[1].trim();
  }

  if (!title) {
    title = rawName.replace(/\.[^/.]+$/, '');
  }

  return { title, year, season, episode };
}

export function extractSeasonNumberFromPath(folderOrPath: string): number | undefined {
  const normalized = folderOrPath.replace(/\\/g, '/');
  const segments = normalized.split('/').map((s) => s.trim());

  const hasExtras = segments.some((seg) =>
    /^(?:specials?|extras?|bonus|featurettes?|behind\s*the\s*scenes|trailers?|interviews?|deleted\s*scenes?|shorts?|sp|other|samples?)(?:[\s._-].*)?$/i.test(seg)
  );
  if (hasExtras) {
    return 0;
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const match =
      seg.match(/(?:season|staffel|saison|temporada|stagione|series)[\s._-]?(\d{1,2})/i) ||
      seg.match(/^s(\d{1,2})(?:[\s._-].*)?$/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}

export function extractEpisodeInfoFromFilename(filename: string): {
  season?: number;
  episode?: number;
  episodeTitle?: string;
} {
  const clean = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
  let season: number | undefined;
  let episode: number | undefined;
  let episodeTitle: string | undefined;

  const sMatch = clean.match(/s(\d{1,2})e(\d{1,2})(?:[\s._-]+(.+))?/i);
  if (sMatch) {
    season = parseInt(sMatch[1], 10);
    episode = parseInt(sMatch[2], 10);
    if (sMatch[3]) {
      episodeTitle = sMatch[3]
        .replace(/(1080p|2160p|720p|bluray|web-dl|x264|x265|hevc|aac)/gi, '')
        .replace(/[\._]/g, ' ')
        .trim();
    }
  } else {
    const xMatch = clean.match(/(\d{1,2})x(\d{1,2})(?:[\s._-]+(.+))?/i);
    if (xMatch) {
      season = parseInt(xMatch[1], 10);
      episode = parseInt(xMatch[2], 10);
      if (xMatch[3]) {
        episodeTitle = xMatch[3]
          .replace(/(1080p|2160p|720p|bluray|web-dl|x264|x265|hevc|aac)/gi, '')
          .replace(/[\._]/g, ' ')
          .trim();
      }
    } else {
      const epMatch = clean.match(/(?:ep|episode)[\s._-]?(\d{1,3})(?:[\s._-]+(.+))?/i);
      if (epMatch) {
        episode = parseInt(epMatch[1], 10);
        if (epMatch[2]) {
          episodeTitle = epMatch[2]
            .replace(/(1080p|2160p|720p|bluray|web-dl|x264|x265|hevc|aac)/gi, '')
            .replace(/[\._]/g, ' ')
            .trim();
        }
      }
    }
  }

  return { season, episode, episodeTitle };
}

export function nodeToMediaMetadata(node: SambaShareNode, parentPath: string = ''): MediaMetadata | null {
  const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
  const filePath = findFirstMediaFilePath(node, parentPath) || fullPath;

  if (node.matchedMedia) {
    return {
      ...node.matchedMedia,
      folderPath: fullPath,
      path: filePath,
      recommendedFolderStructure: fullPath,
      matchedFilename: node.type === 'file' ? node.name : node.matchedMedia.matchedFilename,
      playbackUrl: getDirectPlaybackUrl(filePath) || node.matchedMedia.playbackUrl,
    };
  }

  const mediaType = node.mediaType || detectMediaType(fullPath);
  const parsedFile = parseTitleAndYear(node.name);
  const epInfo = extractEpisodeInfoFromFilename(node.name);
  const seasonFromFolder = extractSeasonNumberFromPath(fullPath);

  let title = parsedFile.title;
  let year = parsedFile.year;
  const season = epInfo.season ?? seasonFromFolder ?? parsedFile.season ?? (fullPath.toLowerCase().includes('season 00') || fullPath.toLowerCase().includes('s00') ? 0 : 1);
  const episode = epInfo.episode ?? parsedFile.episode ?? 1;
  const episodeTitle = epInfo.episodeTitle;

  if (mediaType === 'series') {
    const segments = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
    let seriesFolderName = '';
    for (let i = segments.length - (node.type === 'file' ? 2 : 1); i >= 0; i--) {
      const seg = segments[i].trim();
      const isSeasonSeg = isSeasonDirectory(seg);
      const isRootSeg = ROOT_CONTAINER_NAMES.has(seg.toLowerCase());
      if (!isSeasonSeg && !isRootSeg) {
        seriesFolderName = seg;
        break;
      }
    }

    if (seriesFolderName) {
      const parsedFolder = parseTitleAndYear(seriesFolderName);
      title = parsedFolder.title || seriesFolderName;
      if (parsedFolder.year && parsedFolder.year !== new Date().getFullYear()) {
        year = parsedFolder.year;
      }
    }
  }

  const actualPlaybackUrl = filePath;

  let posterUrl = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80';
  let defaultPlayback = actualPlaybackUrl;

  if (mediaType === 'series') {
    posterUrl = 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80';
    defaultPlayback = actualPlaybackUrl;
  } else if (mediaType === 'album') {
    posterUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80';
    defaultPlayback = actualPlaybackUrl;
  }

  const childMediaFiles = node.children ? node.children.filter((c) => c.type === 'file' && isMediaFile(c.name)) : [];
  let seasonsData = undefined;

  if (mediaType === 'series') {
    if (childMediaFiles.length > 0) {
      const seasonMap = new Map<number, EpisodeMetadata[]>();
      childMediaFiles.forEach((file) => {
        const fileEpInfo = extractEpisodeInfoFromFilename(file.name);
        const fileSeason = fileEpInfo.season ?? seasonFromFolder ?? (file.path && extractSeasonNumberFromPath(file.path)) ?? season;
        const fileEpNum = fileEpInfo.episode || 1;
        const epTitle = fileEpInfo.episodeTitle || `${title} S${String(fileSeason).padStart(2, '0')}E${String(fileEpNum).padStart(2, '0')}`;

        const epFilePath = file.sourcePath || file.path || `${fullPath}/${file.name}`;
        if (!seasonMap.has(fileSeason)) {
          seasonMap.set(fileSeason, []);
        }
        seasonMap.get(fileSeason)!.push({
          episodeNumber: fileEpNum,
          seasonNumber: fileSeason,
          title: epTitle,
          plot: `File on disk: ${file.name}`,
          rating: 8.5,
          playbackUrl: epFilePath,
          filePath: epFilePath,
          filename: file.name,
        });
      });

      seasonsData = Array.from(seasonMap.entries()).map(([sNum, eps]) => ({
        seasonNumber: sNum,
        name: sNum === 0 ? 'Specials & Extras' : `Season ${sNum}`,
        episodeCount: eps.length,
        episodes: eps.sort((a, b) => a.episodeNumber - b.episodeNumber),
      }));
    } else {
      seasonsData = [
        {
          seasonNumber: season ?? 1,
          name: (season === 0 || fullPath.toLowerCase().includes('extras') || fullPath.toLowerCase().includes('specials')) ? 'Specials & Extras' : `Season ${season ?? 1}`,
          episodeCount: 1,
          episodes: [
            {
              episodeNumber: episode || 1,
              seasonNumber: season ?? 1,
              title: episodeTitle || (season === 0 ? `Extra: ${node.name.replace(/\.[^/.]+$/, '')}` : `${title} S${String(season ?? 1).padStart(2, '0')}E${String(episode || 1).padStart(2, '0')}`),
              plot: season === 0
                ? `Special feature and bonus material for ${title} (${node.name}).`
                : `Synopsis for ${title} Season ${season ?? 1} Episode ${episode || 1}. Tagged from Samba network share (${node.name}).`,
              rating: 8.5,
              playbackUrl: actualPlaybackUrl,
              filePath,
              filename: node.name,
            },
          ],
        },
      ];
    }
  }

  const tracksData =
    mediaType === 'album'
      ? [
          {
            trackNumber: 1,
            title: title,
            duration: '3:45',
            artist: fullPath.split('/')[1] || 'Imported Artist',
            playbackUrl: actualPlaybackUrl,
          },
        ]
      : undefined;

  return {
    id: `imported-${node.id || Math.random().toString(36).substring(2, 9)}`,
    type: mediaType,
    title: title,
    year: year,
    overview: `${title} (${year}) cataloged from Samba network storage at "${fullPath}". Full metadata manifest and media streams ready.`,
    genres: fullPath.toLowerCase().includes('audio books')
      ? ['Audiobook', 'Spoken Word', 'Literature']
      : fullPath.toLowerCase().includes('franchises')
      ? ['Franchise', 'Action', 'Sci-Fi']
      : mediaType === 'series'
      ? ['series', 'Imported']
      : mediaType === 'album'
      ? ['Music', 'Lossless Audio']
      : ['Feature Film', 'Imported'],
    rating: 8.4,
    posterUrl: posterUrl,
    playbackUrl: defaultPlayback,
    folderPath: fullPath,
    path: filePath,
    recommendedFolderStructure: fullPath,
    recommendedFilenames: [node.name, mediaType === 'series' ? 'tvshow.nfo' : mediaType === 'album' ? 'album.nfo' : 'movie.nfo', 'poster.jpg'],
    matchedFilename: node.name,
    seasons: seasonsData,
    tracks: tracksData,
    source: 'curated-database',
  };
}

export function mergeMediaMetadataIntoMap(mediaMap: Map<string, MediaMetadata>, item: MediaMetadata): void {
  const key = `${item.type}:${item.title.toLowerCase()}`;
  if (!mediaMap.has(key)) {
    mediaMap.set(key, item);
    return;
  }

  const existing = mediaMap.get(key)!;
  if (item.folderPath && !existing.folderPath) {
    existing.folderPath = item.folderPath;
    existing.path = item.path || item.folderPath;
    existing.recommendedFolderStructure = item.folderPath;
  }
  if (item.matchedFilename && !existing.matchedFilename) {
    existing.matchedFilename = item.matchedFilename;
  }

  if (item.type === 'series' && item.seasons && item.seasons.length > 0) {
    const existingSeasons = existing.seasons ? [...existing.seasons] : [];
    for (const newSeason of item.seasons) {
      const matchedSeason = existingSeasons.find((s) => s.seasonNumber === newSeason.seasonNumber);
      if (matchedSeason) {
        if (newSeason.episodes && newSeason.episodes.length > 0) {
          for (const newEp of newSeason.episodes) {
            const existingEp = matchedSeason.episodes.find(
              (e) =>
                (e.episodeNumber === newEp.episodeNumber && (!e.title || !newEp.title || e.title === newEp.title)) ||
                (e.title && newEp.title && e.title.toLowerCase() === newEp.title.toLowerCase()) ||
                (e.filePath && newEp.filePath && e.filePath === newEp.filePath)
            );
            if (existingEp) {
              if (newEp.filePath && !existingEp.filePath) existingEp.filePath = newEp.filePath;
              if (newEp.filename && !existingEp.filename) existingEp.filename = newEp.filename;
              if (newEp.playbackUrl && !existingEp.playbackUrl) existingEp.playbackUrl = newEp.playbackUrl;
            } else {
              const finalEp = { ...newEp };
              if (matchedSeason.episodes.some((e) => e.episodeNumber === finalEp.episodeNumber)) {
                const maxEp = Math.max(...matchedSeason.episodes.map((e) => e.episodeNumber), 0);
                finalEp.episodeNumber = maxEp + 1;
              }
              matchedSeason.episodes.push(finalEp);
            }
          }
          matchedSeason.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
          matchedSeason.episodeCount = matchedSeason.episodes.length;
        }
      } else {
        existingSeasons.push({
          ...newSeason,
          episodes: Array.isArray(newSeason.episodes) ? [...newSeason.episodes] : [],
        });
      }
    }
    existingSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
    existing.seasons = existingSeasons;
  }
}

export interface NodeExtractionTaskEntry {
  node: SambaShareNode;
  parentPath: string;
}

export function extractMediaFromNodeEntries(
  entries: NodeExtractionTaskEntry[],
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG
): MediaMetadata[] {
  const mediaMap = new Map<string, MediaMetadata>();

  for (const { node, parentPath } of entries) {
    const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);

    if (node.matchedMedia) {
      const item = nodeToMediaMetadata(node, parentPath);
      if (item) mergeMediaMetadataIntoMap(mediaMap, item);
    } else if (node.type === 'folder') {
      const hasMediaChildren = node.children?.some(
        (c) => c.type === 'file' && isMediaFile(c.name, config)
      );
      const hasSeasonFolderChildren = node.children?.some(
        (c) => c.type === 'folder' && isSeasonDirectory(c.name)
      );

      const isRootContainer = ROOT_CONTAINER_NAMES.has(node.name.toLowerCase());
      const isSeasonFolder = isSeasonDirectory(node.name);

      if (!isRootContainer && !isSeasonFolder && (node.hasNfo || node.mediaType || hasMediaChildren || hasSeasonFolderChildren)) {
        const item = nodeToMediaMetadata(node, parentPath);
        if (item) {
          mergeMediaMetadataIntoMap(mediaMap, item);
        }
      }
    } else if (node.type === 'file') {
      if (isMediaFile(node.name, config)) {
        const item = nodeToMediaMetadata(node, parentPath);
        if (item) {
          mergeMediaMetadataIntoMap(mediaMap, item);
        }
      }
    }

    // Also inspect immediate file children if node is a folder not already collapsed into a single entry,
    // or let flattenTreeToEntries push all nodes in the chunk.
    void fullPath;
  }

  return Array.from(mediaMap.values());
}

export function flattenTreeToEntries(nodes: SambaShareNode[], parentPath: string = ''): NodeExtractionTaskEntry[] {
  const result: NodeExtractionTaskEntry[] = [];
  const stack: Array<{ node: SambaShareNode; parentPath: string }> = [];

  for (let i = nodes.length - 1; i >= 0; i--) {
    stack.push({ node: nodes[i], parentPath });
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    const { node, parentPath: pPath } = current;
    const fullPath = node.path || (pPath ? `${pPath}/${node.name}` : node.name);

    // Strip deep descendants from each task payload so worker messages stay flat,
    // while keeping direct child stubs for episode aggregation and season-folder detection.
    const shallowNode: SambaShareNode =
      node.type === 'folder' && node.children
        ? {
            ...node,
            children: node.children.map((c) => ({ ...c, children: undefined })),
          }
        : { ...node, children: undefined };

    result.push({ node: shallowNode, parentPath: pPath });

    if (node.children && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], parentPath: fullPath });
      }
    }
  }

  return result;
}
