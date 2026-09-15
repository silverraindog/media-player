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

// Helper to determine media type from path and filename across all media extensions
export function detectMediaType(filePath: string): MediaType {
  const lower = filePath.toLowerCase();
  const ext = getFileExtension(filePath);

  // Audio & Audiobook formats
  if (
    SUPPORTED_AUDIO_EXTENSIONS.includes(ext) ||
    lower.startsWith('music/') ||
    lower.includes('/music/') ||
    lower.startsWith('audio books/') ||
    lower.includes('/audio books/') ||
    lower.includes('audiobook') ||
    lower.includes('album')
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

  // TV Series checks
  if (
    lower.startsWith('series/') ||
    lower.includes('/series/') ||
    lower.startsWith('tv shows/') ||
    lower.includes('/tv shows/') ||
    lower.startsWith('tv/') ||
    lower.startsWith('anime/') ||
    lower.startsWith('documentaries/') ||
    lower.includes('/season ') ||
    lower.includes('/specials') ||
    /s\d{1,2}e\d{1,2}/i.test(lower) ||
    /season\s*\d+/i.test(lower) ||
    /ep\d{1,2}/i.test(lower)
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
  }

  // Extract year
  const yearMatch = clean.match(/[\(\[\.]?(19\d{2}|20\d{2})[\)\]\.]?/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  // Clean dots, underscores, extra metadata
  let title = clean
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/(1080p|2160p|4k|720p|bluray|web-dl|hdr|dts|x264|x265|hevc|aac|remux|extended)/gi, '')
    .replace(/s\d{1,2}e\d{1,2}/gi, '')
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

// Convert a Samba node or file path into a full MediaMetadata record
export function nodeToMediaMetadata(node: SambaShareNode, parentPath: string = ''): MediaMetadata | null {
  if (node.matchedMedia) {
    return {
      ...node.matchedMedia,
      playbackUrl: node.matchedMedia.playbackUrl || (node.matchedMedia.type === 'album' ? SAMPLE_AUDIO_STREAM : SAMPLE_VIDEO_STREAMS.movie),
    };
  }

  const fullPath = node.path || `${parentPath}/${node.name}`;
  const mediaType = node.mediaType || detectMediaType(fullPath);
  const { title, year, season, episode } = parseTitleAndYear(node.name);

  // Check if curated database has a match
  const curatedMatch = CURATED_MEDIA_DATABASE.find(
    (m) =>
      m.title.toLowerCase() === title.toLowerCase() ||
      fullPath.toLowerCase().includes(m.title.toLowerCase())
  );

  if (curatedMatch) {
    return {
      ...curatedMatch,
      id: `imported-${curatedMatch.id}-${node.id}`,
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
            name: `Season ${season || 1}`,
            episodeCount: 1,
            episodes: [
              {
                episodeNumber: episode || 1,
                seasonNumber: season || 1,
                title: title,
                plot: `Episode detected from imported file: ${node.name}`,
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
    overview: `Discovered on Samba network storage at "${fullPath}". Full metadata manifest, high-definition stream, and Kodi/Plex indexes ready.`,
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

  function traverse(nodeList: SambaShareNode[], parentPath: string = '') {
    for (const node of nodeList) {
      const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
      
      // If node itself has matchedMedia
      if (node.matchedMedia) {
        mediaMap.set(node.matchedMedia.title.toLowerCase(), {
          ...node.matchedMedia,
          playbackUrl: node.matchedMedia.playbackUrl || (node.matchedMedia.type === 'album' ? SAMPLE_AUDIO_STREAM : SAMPLE_VIDEO_STREAMS.movie),
        });
      } 
      // If node is a media folder with direct media files or NFO or marked as media
      else if (node.type === 'folder') {
        const hasMediaChildren = node.children?.some(c => 
          c.type === 'file' && isMediaFile(c.name, config)
        );

        // Don't treat top container roots (Movies, Series, Franchises, Audio books, Books, Music, sort) as single items
        const isRootContainer = ['movies', 'series', 'franchises', 'audio books', 'books', 'music', 'sort', 'lost+found', 'anime', 'documentaries', 'tv shows'].includes(node.name.toLowerCase());
        const isSeasonFolder = /^season\s*\d+$/i.test(node.name.trim());

        if (!isRootContainer && !isSeasonFolder && (node.hasNfo || node.mediaType || hasMediaChildren)) {
          const item = nodeToMediaMetadata(node, parentPath);
          if (item) {
            mediaMap.set(item.title.toLowerCase(), item);
          }
        }
      } 
      // If node is a standalone media file
      else if (node.type === 'file') {
        if (isMediaFile(node.name, config)) {
          const item = nodeToMediaMetadata(node, parentPath);
          if (item && !mediaMap.has(item.title.toLowerCase())) {
            mediaMap.set(item.title.toLowerCase(), item);
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
