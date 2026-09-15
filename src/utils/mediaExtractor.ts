import {
  MediaMetadata,
  MediaType,
  SambaShareNode,
  ParsedFileInfo,
  MediaExtensionCategory,
  MediaScanExtensionConfig,
} from '../types';
import { CURATED_MEDIA_DATABASE } from '../data/curatedMedia';

// Comprehensive Media Extension Definitions
export const SUPPORTED_VIDEO_EXTENSIONS = [
  'mkv', 'mp4', 'm4v', 'avi', 'mov', 'wmv', 'webm', 'flv', 'f4v',
  'ts', 'm2ts', 'mts', 'vob', 'ogv', '3gp', 'rm', 'rmvb', 'divx', 'asf'
];

export const SUPPORTED_DISC_EXTENSIONS = [
  'iso', 'img', 'bin', 'nrg'
];

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'flac', 'mp3', 'm4a', 'm4b', 'aac', 'ogg', 'oga', 'opus', 'wav',
  'aiff', 'aif', 'alac', 'wma', 'ape', 'wv', 'dsf', 'dff', 'mid', 'midi'
];

export const SUPPORTED_BOOK_EXTENSIONS = [
  'epub', 'pdf', 'mobi', 'azw', 'azw3', 'cbr', 'cbz', 'djvu', 'fb2'
];

export const SUPPORTED_SUBTITLE_EXTENSIONS = [
  'srt', 'vtt', 'ass', 'ssa', 'sub', 'idx', 'sup'
];

export const SUPPORTED_ARTWORK_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'svg', 'tbn'
];

export const SUPPORTED_METADATA_EXTENSIONS = [
  'nfo', 'xml', 'json', 'm3u', 'm3u8', 'cue', 'pls'
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
  if (SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (SUPPORTED_DISC_EXTENSIONS.includes(ext)) return 'disc_images';
  if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (SUPPORTED_BOOK_EXTENSIONS.includes(ext)) return 'books';
  if (SUPPORTED_SUBTITLE_EXTENSIONS.includes(ext)) return 'subtitles';
  if (SUPPORTED_ARTWORK_EXTENSIONS.includes(ext)) return 'artwork';
  if (SUPPORTED_METADATA_EXTENSIONS.includes(ext)) return 'metadata';
  return null;
}

export function isMediaFile(
  fileNameOrPath: string,
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG
): boolean {
  const ext = getFileExtension(fileNameOrPath);
  if (!ext) return false;

  // Custom extension match
  if (config.customExtensions && config.customExtensions.some((ce) => ce.toLowerCase().replace(/^\./, '') === ext)) {
    return true;
  }

  // If searchAllExtensions is enabled, match any playable or catalogable media
  if (config.searchAllExtensions) {
    return (
      SUPPORTED_VIDEO_EXTENSIONS.includes(ext) ||
      SUPPORTED_DISC_EXTENSIONS.includes(ext) ||
      SUPPORTED_AUDIO_EXTENSIONS.includes(ext) ||
      SUPPORTED_BOOK_EXTENSIONS.includes(ext) ||
      (config.includeSubtitlesAndNfo && (SUPPORTED_SUBTITLE_EXTENSIONS.includes(ext) || SUPPORTED_METADATA_EXTENSIONS.includes(ext)))
    );
  }

  const cat = getFileCategory(fileNameOrPath);
  if (!cat) return false;
  return !!config.enabledCategories[cat];
}

// Sample streaming URLs for in-app video & audio player
export const SAMPLE_VIDEO_STREAMS = {
  movie: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  scifi: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  series: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  action: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  nature: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
};

export const SAMPLE_AUDIO_STREAM = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

// Robust Season Directory Checker (e.g., 'Season 1', 'S01', 'Season_02', 'S02', 'Staffel 3', 'Series 1', 'Specials', etc.)
export function isSeasonDirectory(folderName: string): boolean {
  const clean = folderName.trim().toLowerCase();
  return (
    /^(?:season|staffel|saison|temporada|stagione|series)[\s._-]?\d+/i.test(clean) ||
    /^s\d{1,2}(?:[\s._-].*)?$/i.test(clean) ||
    /^(?:specials|special|extras|bonus|sp)$/i.test(clean) ||
    /^s\d{1,2}$/i.test(clean) ||
    /^season\s*\d+/i.test(clean)
  );
}

// Helper to determine media type from path and filename across all media extensions
export function detectMediaType(filePath: string): MediaType {
  const lower = filePath.toLowerCase().replace(/\\/g, '/');
  const ext = getFileExtension(filePath);

  // Audio & Audiobook formats
  if (
    SUPPORTED_AUDIO_EXTENSIONS.includes(ext) ||
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

  // Books & Comics formats (cataloged under album/media)
  if (
    SUPPORTED_BOOK_EXTENSIONS.includes(ext) ||
    lower.startsWith('books/') ||
    lower.includes('/books/') ||
    lower.includes('comic') ||
    lower.includes('manga')
  ) {
    return 'album';
  }

  // TV Series checks: Detect any series keyword, season folder, episode pattern, or TV terminology
  // Check for 'season', 'S01', 'S02', etc. anywhere in path segments even if root folder isn't standard
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

  // Default to movie for video files and disc images
  return 'movie';
}


// Clean title and year from path or filename
export function parseTitleAndYear(rawName: string): { title: string; year: number; season?: number; episode?: number } {
  // Strip extension
  let clean = rawName.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
  
  // Check for season/episode
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

  // Extract year
  const yearMatch = clean.match(/[\(\[\.]?(19\d{2}|20\d{2})[\)\]\.]?/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  // Clean dots, underscores, extra metadata
  let title = clean
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/(1080p|2160p|4k|720p|bluray|web-dl|hdr|dts|x264|x265|hevc|aac|remux|extended)/gi, '')
    .replace(/s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2}/gi, '')
    .replace(/[\._]/g, ' ')
    .trim();

  // Remove leading numbers for music tracks
  const trackMatch = title.match(/^\d{1,2}\s*[-–]\s*(.+)/);
  if (trackMatch) {
    title = trackMatch[1].trim();
  }

  if (!title) {
    title = rawName.replace(/\.[^/.]+$/, '');
  }

  return { title, year, season, episode };
}

// Extract Season number from directory or path string (e.g. "Season 1", "S01", "S02", "Staffel 3", "Series 2", "Specials")
export function extractSeasonNumberFromPath(folderOrPath: string): number | undefined {
  const normalized = folderOrPath.replace(/\\/g, '/');
  const segments = normalized.split('/').map((s) => s.trim());

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (/^(?:specials|special|extras|bonus|sp)$/i.test(seg)) {
      return 0;
    }
    // Check for 'Season 01', 'Season1', 'S01', 'S1', 'Staffel 2', 'Series 1', 'Temporada 3'
    const match =
      seg.match(/(?:season|staffel|saison|temporada|stagione|series)[\s._-]?(\d{1,2})/i) ||
      seg.match(/^s(\d{1,2})(?:[\s._-].*)?$/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}

// Extract Episode number and title from filename
export function extractEpisodeInfoFromFilename(filename: string): {
  season?: number;
  episode?: number;
  episodeTitle?: string;
} {
  const clean = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
  let season: number | undefined;
  let episode: number | undefined;
  let episodeTitle: string | undefined;

  // S01E02 or 1x02 or Episode 2
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

// Convert a Samba node or file path into a full MediaMetadata record
export function nodeToMediaMetadata(node: SambaShareNode, parentPath: string = ''): MediaMetadata | null {
  if (node.matchedMedia) {
    return {
      ...node.matchedMedia,
      playbackUrl: node.matchedMedia.playbackUrl || (node.matchedMedia.type === 'album' ? SAMPLE_AUDIO_STREAM : SAMPLE_VIDEO_STREAMS.movie),
    };
  }

  const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
  const mediaType = node.mediaType || detectMediaType(fullPath);
  const parsedFile = parseTitleAndYear(node.name);
  const epInfo = extractEpisodeInfoFromFilename(node.name);
  const seasonFromFolder = extractSeasonNumberFromPath(fullPath);

  // Derive candidate title & series hierarchy
  let title = parsedFile.title;
  let year = parsedFile.year;
  let season = epInfo.season ?? seasonFromFolder ?? parsedFile.season ?? 1;
  let episode = epInfo.episode ?? parsedFile.episode ?? 1;
  let episodeTitle = epInfo.episodeTitle;

  // For series files, check if parent folder represents the show title
  if (mediaType === 'series') {
    const segments = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const rootContainers = [
      'series', 'tv shows', 'tv', 'shows', 'anime', 'documentaries', 'media', 'videos', 'sort',
      'downloads', 'complete', 'share', 'storage', 'video', 'movies', 'nas', 'public', 'disk1', 'disk2'
    ];
    
    // Find the nearest folder that isn't a root container and isn't a season folder
    let seriesFolderName = '';
    for (let i = segments.length - (node.type === 'file' ? 2 : 1); i >= 0; i--) {
      const seg = segments[i].trim();
      const isSeasonSeg = isSeasonDirectory(seg);
      const isRootSeg = rootContainers.includes(seg.toLowerCase());
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

  // Check if curated database has a match
  const curatedMatch = CURATED_MEDIA_DATABASE.find(
    (m) =>
      m.title.toLowerCase() === title.toLowerCase() ||
      fullPath.toLowerCase().includes(m.title.toLowerCase())
  );

  if (curatedMatch) {
    return {
      ...curatedMatch,
      id: `imported-${curatedMatch.id}-${node.id || Math.random().toString(36).substring(2, 7)}`,
      recommendedFolderStructure: fullPath,
      matchedFilename: node.name,
      playbackUrl: curatedMatch.playbackUrl || (curatedMatch.type === 'album' ? SAMPLE_AUDIO_STREAM : SAMPLE_VIDEO_STREAMS.scifi),
    };
  }

  // Posters based on type
  let posterUrl = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80';
  let defaultPlayback = SAMPLE_VIDEO_STREAMS.movie;

  if (mediaType === 'series') {
    posterUrl = 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80';
    defaultPlayback = SAMPLE_VIDEO_STREAMS.series;
  } else if (mediaType === 'album') {
    posterUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80';
    defaultPlayback = SAMPLE_AUDIO_STREAM;
  }

  const seasonsData =
    mediaType === 'series'
      ? [
          {
            seasonNumber: season || 1,
            name: season === 0 ? 'Specials' : `Season ${season || 1}`,
            episodeCount: 1,
            episodes: [
              {
                episodeNumber: episode || 1,
                seasonNumber: season || 1,
                title: episodeTitle || `${title} S${String(season || 1).padStart(2, '0')}E${String(episode || 1).padStart(2, '0')}`,
                plot: `Synopsis for ${title} Season ${season || 1} Episode ${episode || 1}. Tagged from Samba network share (${node.name}).`,
                rating: 8.5,
                playbackUrl: SAMPLE_VIDEO_STREAMS.series,
              },
            ],
          },
        ]
      : undefined;

  const tracksData =
    mediaType === 'album'
      ? [
          {
            trackNumber: 1,
            title: title,
            duration: '3:45',
            artist: fullPath.split('/')[1] || 'Imported Artist',
            playbackUrl: SAMPLE_AUDIO_STREAM,
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
      ? ['TV Series', 'Imported'] 
      : mediaType === 'album' 
      ? ['Music', 'Lossless Audio'] 
      : ['Feature Film', 'Imported'],
    rating: 8.4,
    posterUrl: posterUrl,
    playbackUrl: defaultPlayback,
    recommendedFolderStructure: fullPath,
    recommendedFilenames: [node.name, mediaType === 'series' ? 'tvshow.nfo' : mediaType === 'album' ? 'album.nfo' : 'movie.nfo', 'poster.jpg'],
    matchedFilename: node.name,
    seasons: seasonsData,
    tracks: tracksData,
    source: 'curated-database',
  };
}

// Recursively traverse Samba nodes and extract all unique MediaMetadata items across all media extensions
export function extractAllMediaFromSambaTree(
  nodes: SambaShareNode[],
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG
): MediaMetadata[] {
  const mediaMap = new Map<string, MediaMetadata>();

  function mergeOrAdd(item: MediaMetadata) {
    const key = `${item.type}:${item.title.toLowerCase()}`;
    if (!mediaMap.has(key)) {
      mediaMap.set(key, item);
      return;
    }

    const existing = mediaMap.get(key)!;
    if (item.type === 'series' && item.seasons && item.seasons.length > 0) {
      const existingSeasons = existing.seasons || [];
      const newSeason = item.seasons[0];
      const matchedSeason = existingSeasons.find((s) => s.seasonNumber === newSeason.seasonNumber);

      if (matchedSeason) {
        if (newSeason.episodes && newSeason.episodes.length > 0) {
          const newEp = newSeason.episodes[0];
          if (!matchedSeason.episodes.some((e) => e.episodeNumber === newEp.episodeNumber)) {
            matchedSeason.episodes.push(newEp);
            matchedSeason.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
            matchedSeason.episodeCount = matchedSeason.episodes.length;
          }
        }
      } else {
        existingSeasons.push(newSeason);
        existingSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
      }
      existing.seasons = existingSeasons;
    }
  }

  function traverse(nodeList: SambaShareNode[], parentPath: string = '') {
    for (const node of nodeList) {
      const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
      
      if (node.matchedMedia) {
        mergeOrAdd({
          ...node.matchedMedia,
          playbackUrl: node.matchedMedia.playbackUrl || (node.matchedMedia.type === 'album' ? SAMPLE_AUDIO_STREAM : SAMPLE_VIDEO_STREAMS.movie),
        });
      } else if (node.type === 'folder') {
        const hasMediaChildren = node.children?.some(c => 
          c.type === 'file' && isMediaFile(c.name, config)
        );
        const hasSeasonFolderChildren = node.children?.some(c =>
          c.type === 'folder' && isSeasonDirectory(c.name)
        );

        const isRootContainer = ['movies', 'series', 'franchises', 'audio books', 'books', 'music', 'sort', 'lost+found', 'anime', 'documentaries', 'tv shows', 'tv', 'shows', 'downloads', 'share', 'storage'].includes(node.name.toLowerCase());
        const isSeasonFolder = isSeasonDirectory(node.name);

        if (!isRootContainer && !isSeasonFolder && (node.hasNfo || node.mediaType || hasMediaChildren || hasSeasonFolderChildren)) {
          const item = nodeToMediaMetadata(node, parentPath);
          if (item) {
            mergeOrAdd(item);
          }
        }
      } else if (node.type === 'file') {
        if (isMediaFile(node.name, config)) {
          const item = nodeToMediaMetadata(node, parentPath);
          if (item) {
            mergeOrAdd(item);
          }
        }
      }

      if (node.children && node.children.length > 0) {
        traverse(node.children, fullPath);
      }
    }
  }

  traverse(nodes);
  return Array.from(mediaMap.values());
}

// Asynchronous, time-sliced tree extractor using requestIdleCallback to guarantee zero UI lockup during large Samba share imports
export async function extractAllMediaFromSambaTreeAsync(
  nodes: SambaShareNode[],
  config: MediaScanExtensionConfig = DEFAULT_MEDIA_SCAN_CONFIG,
  chunkSize: number = 30
): Promise<MediaMetadata[]> {
  const mediaMap = new Map<string, MediaMetadata>();

  function mergeOrAdd(item: MediaMetadata) {
    const key = `${item.type}:${item.title.toLowerCase()}`;
    if (!mediaMap.has(key)) {
      mediaMap.set(key, item);
      return;
    }

    const existing = mediaMap.get(key)!;
    if (item.type === 'series' && item.seasons && item.seasons.length > 0) {
      const existingSeasons = existing.seasons || [];
      const newSeason = item.seasons[0];
      const matchedSeason = existingSeasons.find((s) => s.seasonNumber === newSeason.seasonNumber);

      if (matchedSeason) {
        if (newSeason.episodes && newSeason.episodes.length > 0) {
          const newEp = newSeason.episodes[0];
          if (!matchedSeason.episodes.some((e) => e.episodeNumber === newEp.episodeNumber)) {
            matchedSeason.episodes.push(newEp);
            matchedSeason.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
            matchedSeason.episodeCount = matchedSeason.episodes.length;
          }
        }
      } else {
        existingSeasons.push(newSeason);
        existingSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
      }
      existing.seasons = existingSeasons;
    }
  }

  // Iterative work queue avoids stack overflow and allows non-blocking slicing
  const queue: Array<{ node: SambaShareNode; parentPath: string }> = [];
  nodes.forEach((n) => queue.push({ node: n, parentPath: '' }));

  let processedCount = 0;

  while (queue.length > 0) {
    const { node, parentPath } = queue.shift()!;
    processedCount++;

    const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);

    if (node.matchedMedia) {
      mergeOrAdd({
        ...node.matchedMedia,
        playbackUrl:
          node.matchedMedia.playbackUrl ||
          (node.matchedMedia.type === 'album' ? SAMPLE_AUDIO_STREAM : SAMPLE_VIDEO_STREAMS.movie),
      });
    } else if (node.type === 'folder') {
      const hasMediaChildren = node.children?.some(
        (c) => c.type === 'file' && isMediaFile(c.name, config)
      );
      const hasSeasonFolderChildren = node.children?.some(
        (c) => c.type === 'folder' && isSeasonDirectory(c.name)
      );

      const isRootContainer = [
        'movies',
        'series',
        'franchises',
        'audio books',
        'books',
        'music',
        'sort',
        'lost+found',
        'anime',
        'documentaries',
        'tv shows',
        'tv',
        'shows',
        'downloads',
        'share',
        'storage',
      ].includes(node.name.toLowerCase());
      const isSeasonFolder = isSeasonDirectory(node.name);

      if (!isRootContainer && !isSeasonFolder && (node.hasNfo || node.mediaType || hasMediaChildren || hasSeasonFolderChildren)) {
        const item = nodeToMediaMetadata(node, parentPath);
        if (item) {
          mergeOrAdd(item);
        }
      }
    } else if (node.type === 'file') {
      if (isMediaFile(node.name, config)) {
        const item = nodeToMediaMetadata(node, parentPath);
        if (item) {
          mergeOrAdd(item);
        }
      }
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        queue.push({ node: child, parentPath: fullPath });
      }
    }

    // Yield to the browser main thread using requestIdleCallback / setTimeout after every chunk
    if (processedCount % chunkSize === 0) {
      await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(() => resolve(), { timeout: 30 });
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
  }

  return Array.from(mediaMap.values());
}


// Convert parsed cleaner files into MediaMetadata
export function parsedFileToMediaMetadata(item: ParsedFileInfo): MediaMetadata {
  const type = item.detectedType || 'movie';
  let posterUrl = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80';
  let defaultPlayback = SAMPLE_VIDEO_STREAMS.movie;

  if (type === 'series') {
    posterUrl = 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80';
    defaultPlayback = SAMPLE_VIDEO_STREAMS.series;
  } else if (type === 'album') {
    posterUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80';
    defaultPlayback = SAMPLE_AUDIO_STREAM;
  }

  return {
    id: `batch-imported-${item.id}-${Date.now()}`,
    type: type,
    title: item.detectedTitle,
    year: item.detectedYear || new Date().getFullYear(),
    overview: `Imported via Batch Renamer from release: "${item.originalFilename}". Tagged for Samba storage.`,
    genres: ['Imported Media', type === 'series' ? 'TV Series' : type === 'album' ? 'Audio Album' : 'Feature Film'],
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
            playbackUrl: SAMPLE_VIDEO_STREAMS.series,
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
        playbackUrl: SAMPLE_AUDIO_STREAM,
      }
    ] : undefined,
    source: 'curated-database',
  };
}
