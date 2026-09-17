export type MediaType = 'movie' | 'series' | 'album';

export interface EpisodeMetadata {
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  airDate?: string;
  plot?: string;
  rating?: number;
  runtime?: string;
  thumbUrl?: string;
  playbackUrl?: string;
}

export interface SeasonMetadata {
  seasonNumber: number;
  name?: string;
  overview?: string;
  posterUrl?: string;
  episodeCount: number;
  episodes?: EpisodeMetadata[];
}

export interface TrackMetadata {
  trackNumber: number;
  discNumber?: number;
  title: string;
  duration: string;
  artist?: string;
  composer?: string;
  playbackUrl?: string;
}

export interface CastMember {
  name: string;
  role: string;
  thumb?: string;
}

export interface MediaMetadata {
  id: string;
  type: MediaType;
  title: string;
  originalTitle?: string;
  year: number;
  premiered?: string;
  overview: string;
  tagline?: string;
  genres: string[];
  rating: number; // 0 to 10
  votes?: number;
  runtime?: string; // e.g. "148 min" or "48 min/ep"
  directors?: string[];
  artists?: string[];
  studio?: string;
  recordLabel?: string;
  certification?: string; // e.g. "PG-13", "TV-MA", "Explicit"
  country?: string;
  language?: string;
  imdbId?: string;
  tmdbId?: string;
  musicBrainzId?: string;
  posterUrl: string;
  fanartUrl?: string;
  bannerUrl?: string;
  logoUrl?: string;
  playbackUrl?: string;
  localBlobUrl?: string;
  seasons?: SeasonMetadata[];
  tracks?: TrackMetadata[];
  nfoContent?: string;
  recommendedFolderStructure: string;
  recommendedFilenames: string[];
  matchedFilename?: string;
  source?: 'gemini-ai' | 'curated-database' | 'sqlite-watchlist' | 'sqlite-recent' | 'local-scan' | string;
  versions?: MediaVersionBranch[];
  selectedVersionId?: string;
  isMultiVersion?: boolean;
}

export interface MediaVersionBranch {
  id: string;
  title: string;
  branchName: string; // e.g. "Main Series", "Spin-off: Fear the Walking Dead", "1080p WebRip"
  year?: number;
  seasonsCount?: number;
  rating?: number;
  posterUrl?: string;
  overview?: string;
  folderPath?: string;
  media?: MediaMetadata;
}

export interface SambaConfig {
  server: string; // IP or hostname e.g. 192.168.1.150 or nas.local
  share: string; // share name e.g. "media" or "downloads"
  port: number; // 445 or 139
  workgroup: string; // WORKGROUP
  username: string;
  password: string;
  isGuest: boolean;
  targetPlatform: 'macos' | 'linux' | 'windows' | 'all';
  baseMountPath: string; // /Volumes/media (macOS), /mnt/media (Linux), Z: (Windows)
}

export interface ParsedFileInfo {
  id: string;
  originalFilename: string;
  detectedType: MediaType;
  detectedTitle: string;
  detectedYear?: number;
  detectedSeason?: number;
  detectedEpisode?: number;
  detectedResolution?: string;
  detectedCodec?: string;
  detectedAudio?: string;
  detectedArtist?: string;
  detectedTrack?: number;
  cleanFormattedFilename: string;
  cleanFolderPath: string;
  matchedMetadata?: MediaMetadata;
  status: 'pending' | 'matched' | 'synced' | 'error';
}

export interface SambaShareNode {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  size?: string;
  modified?: string;
  children?: SambaShareNode[];
  hasNfo?: boolean;
  hasPoster?: boolean;
  mediaType?: MediaType;
  matchedMedia?: MediaMetadata;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  type: 'metadata_created' | 'samba_pushed' | 'file_renamed' | 'nfo_downloaded' | 'mount_script_copied' | 'connected' | 'db_saved' | 'progress_updated';
  title: string;
  details: string;
  status: 'success' | 'pending' | 'warning' | 'error';
}

export interface SqliteMediaItem {
  id: string;
  media_type: MediaType;
  title: string;
  original_title?: string;
  synopsis: string;
  year?: number;
  rating?: number;
  poster_url?: string;
  fanart_url?: string;
  genres?: string; // JSON string
  recommended_folder?: string;
  raw_data?: string; // JSON string
  created_at?: string;
  updated_at?: string;
}

export interface SeriesWatchProgress {
  id: string;
  series_id: string;
  series_title: string;
  season_number: number;
  episode_number: number;
  episode_title: string;
  playback_position_seconds: number;
  total_duration_seconds: number;
  progress_percentage: number;
  is_completed: number | boolean;
  last_watched_at: string;
  notes?: string;
  poster_url?: string;
  rating?: number;
  synopsis?: string;
}

export interface SqliteStats {
  dbFilePath: string;
  fileSizeBytes: number;
  totalMediaItems: number;
  totalSeriesTracked: number;
  totalWatchedHistory: number;
}

export interface RegexCategoryRule {
  id: string;
  name: string;
  targetType: MediaType;
  pattern: string; // regex pattern string e.g. "^(series|tv[\\s_-]?shows?|anime|dramas?|shows?|television)"
  priority: number;
  confidenceScore: number; // 0.0 - 1.0 (e.g. 0.95)
  description?: string;
}

export interface FolderScanClassification {
  id: string;
  folderName: string;
  relativePath: string;
  itemCount: number;
  detectedType: MediaType;
  targetType: MediaType | 'ignore';
  confidence: number; // 0.0 to 1.0 (e.g. 0.95)
  isConfident: boolean; // confidence >= threshold
  matchedRuleName: string;
  matchedRegexPattern: string;
  sampleFiles: string[];
  selectedForImport: boolean;
}

export interface ClassifierSettings {
  confidenceThreshold: number; // default 0.85
  autoImportConfident: boolean; // default true
  alwaysPromptReview: boolean; // default false
  rules: RegexCategoryRule[];
}

export type MediaExtensionCategory =
  | 'video'
  | 'audio'
  | 'books'
  | 'disc_images'
  | 'subtitles'
  | 'artwork'
  | 'metadata';

export interface MediaScanExtensionConfig {
  searchAllExtensions: boolean;
  enabledCategories: {
    video: boolean;
    audio: boolean;
    books: boolean;
    disc_images: boolean;
    subtitles: boolean;
    artwork: boolean;
    metadata: boolean;
  };
  customExtensions: string[];
  includeSubtitlesAndNfo: boolean;
  ignoreHiddenFiles: boolean;
}

export type ThumbnailSource =
  | 'sidecar_poster'
  | 'embedded_nfo'
  | 'matched_media'
  | 'curated_library'
  | 'generated_fallback';

export type ThumbnailAspectRatio = 'poster' | 'fanart' | 'square' | 'banner';

export type ThumbnailCacheTier = 'memory_lru' | 'persistent_local' | 'sqlite_backend';

export interface ThumbnailMetadata {
  id: string; // unique key (path or sanitized id)
  mediaPath: string; // relative path in samba share
  title: string;
  mediaType: MediaType | 'book' | 'disc_image' | 'generic';
  thumbnailUrl: string;
  fanartUrl?: string;
  width: number;
  height: number;
  aspectRatio: ThumbnailAspectRatio;
  colorDominant: string; // Hex color code for layout-stable blur placeholder
  source: ThumbnailSource;
  fileSizeBytes: number;
  format: 'jpg' | 'png' | 'webp' | 'svg';
  cachedAt: number; // timestamp
  lastAccessedAt: number; // timestamp
  hitCount: number;
  cacheTier: ThumbnailCacheTier;
  resolutionLabel: string; // e.g. "800 × 1200 (2:3)"
  isSidecarLocal?: boolean;
}

export interface ThumbnailCacheStats {
  totalCached: number;
  hitCount: number;
  missCount: number;
  hitRatio: number; // 0.0 - 1.0 (e.g. 0.96)
  avgLoadTimeMs: number;
  storageSizeBytes: number;
  memoryTierCount: number;
  localTierCount: number;
  sqliteTierCount: number;
  lastSyncedAt?: number;
}

export type AppTab =
  | 'search'
  | 'music'
  | 'watchlist'
  | 'history'
  | 'dedup'
  | 'stats'
  | 'cleaner'
  | 'samba-mount'
  | 'explorer'
  | 'nfo-studio'
  | 'sqlite-vault';

export interface WatchHistoryItem {
  id: string;
  media_id?: string;
  series_id?: string;
  media_type: MediaType;
  title: string;
  season_number?: number;
  episode_number?: number;
  episode_title?: string;
  poster_url?: string;
  duration_seconds?: number;
  playback_position_seconds?: number;
  progress_percentage?: number;
  is_completed?: number | boolean;
  watched_at: string;
  formatted_date?: string;
}

export interface WatchHistoryStats {
  totalWatched: number;
  moviesWatched: number;
  seriesEpisodesWatched: number;
  albumsPlayed: number;
  completedCount: number;
  totalSecondsWatched: number;
  totalHoursWatched: number;
}

export interface WatchlistItem {
  id: string;
  media_id: string;
  title: string;
  media_type: MediaType;
  year?: number;
  rating?: number;
  poster_url?: string;
  genres?: string;
  synopsis?: string;
  added_at: string;
}

export interface GenreDistributionItem {
  genre: string;
  totalCount: number;
  movieCount: number;
  seriesCount: number;
  albumCount: number;
  totalBytes: number;
  totalGB: number;
  avgRating: number;
  percentOfStorage: number;
}

export interface MediaTypeDistributionItem {
  name: string;
  typeKey: MediaType;
  count: number;
  totalGB: number;
  percent: number;
  color: string;
}

export interface DecadeDistributionItem {
  decade: string;
  count: number;
  movieCount: number;
  seriesCount: number;
  albumCount: number;
  totalGB: number;
}

export interface LargestMediaItem {
  id: string;
  title: string;
  mediaType: MediaType;
  year?: number;
  rating?: number;
  totalGB: number;
  genres: string[];
  posterUrl?: string;
  folderPath?: string;
}

export interface LibraryStatsSummary {
  totalMediaItems: number;
  totalSizeBytes: number;
  totalSizeGB: number;
  movieCount: number;
  movieSizeGB: number;
  seriesCount: number;
  seriesSizeGB: number;
  albumCount: number;
  albumSizeGB: number;
  uniqueGenresCount: number;
  avgRating: number;
  dbFileSizeBytes: number;
  totalWatchProgressTracked: number;
}

export interface LibraryDistributionStatsResponse {
  success: boolean;
  summary: LibraryStatsSummary;
  genreDistribution: GenreDistributionItem[];
  mediaTypeDistribution: MediaTypeDistributionItem[];
  decadeDistribution: DecadeDistributionItem[];
  largestItems: LargestMediaItem[];
  cachedThumbnailsCount?: number;
}


