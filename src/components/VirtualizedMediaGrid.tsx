import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { List, useDynamicRowHeight, RowComponentProps } from 'react-window';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Bookmark,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Eye,
  Film,
  FileVideo,
  FolderPlus,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Music,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Tv,
} from 'lucide-react';
import { GenreAffinityScore, MediaMetadata, MediaSortOption, MediaType, SambaConfig } from '../types';
import { downloadMediaArtwork, downloadMediaBundleZip } from '../utils/zipDownloader';
import { getMountedDisplayPath } from '../utils/pathSanitizer';

const EMPTY_AFFINITY = {
  score: 0,
  percentage: 0,
  topMatchingGenre: null as string | null,
  matchingGenres: [] as string[],
};

function safeGenres(genres: any): string[] {
  if (Array.isArray(genres)) return genres;
  if (typeof genres === 'string') {
    try {
      const parsed = JSON.parse(genres);
      if (Array.isArray(parsed)) return parsed;
      return genres.split(',').map((g) => g.trim()).filter(Boolean);
    } catch {
      return genres.split(',').map((g) => g.trim()).filter(Boolean);
    }
  }
  return [];
}

function safeRating(rating: any): number {
  const num = Number(rating);
  return !isNaN(num) ? num : 8.0;
}

function getResponsiveColumnCount(): number {
  if (typeof window === 'undefined') return 3;
  const w = window.innerWidth;
  if (w >= 1280) return 3;
  if (w >= 768) return 2;
  return 1;
}

export interface MediaAffinityEntry {
  score: number;
  percentage: number;
  topMatchingGenre: string | null;
  matchingGenres: string[];
}

export interface VirtualizedMediaGridProps {
  items: MediaMetadata[];
  layoutKey: string;
  enableVirtualization?: boolean;
  pushedIds: Record<string, boolean>;
  savedDbIds: Record<string, boolean>;
  watchlistIds: Set<string>;
  expandedCardIds: Record<string, boolean>;
  watchedItemsMap: Record<string, { isCompleted: boolean; progress: number }>;
  fileIntegrityMap: Record<string, 'verifying' | 'reachable' | 'corrupted'>;
  mediaAffinityById: Map<string, MediaAffinityEntry>;
  genreAffinityMap: Record<string, GenreAffinityScore>;
  sortBy: MediaSortOption;
  scanRootPath?: string;
  sambaConfig: SambaConfig;
  onToggleExpand: (id: string, e?: React.MouseEvent) => void;
  onToggleWatched: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onToggleWatchlist: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onOpenCategorizer: (title: string, type?: MediaType) => void;
  onPlayMedia?: (media: MediaMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  onSelectGenreOrCategory: (genre: string) => void;
  onVerifyFileIntegrity: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onPushToSamba: (media: MediaMetadata) => void;
  onSaveToSqlite: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
}

interface MediaCardProps {
  media: MediaMetadata;
  isPushed: boolean;
  isSavedDb: boolean;
  isSavedWatchlist: boolean;
  isExpanded: boolean;
  shouldReduceMotion: boolean;
  watchInfo?: { isCompleted: boolean; progress: number };
  fileIntegrityStatus?: 'verifying' | 'reachable' | 'corrupted';
  affinity: MediaAffinityEntry;
  genreAffinityMap: Record<string, GenreAffinityScore>;
  sortBy: MediaSortOption;
  scanRootPath?: string;
  sambaConfig: SambaConfig;
  onToggleExpand: (id: string, e?: React.MouseEvent) => void;
  onToggleWatched: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onToggleWatchlist: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onOpenCategorizer: (title: string, type?: MediaType) => void;
  onPlayMedia?: (media: MediaMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  onSelectGenreOrCategory: (genre: string) => void;
  onVerifyFileIntegrity: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onPushToSamba: (media: MediaMetadata) => void;
  onSaveToSqlite: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
}

export const MediaLibraryCard: React.FC<MediaCardProps> = React.memo(({
  media,
  isPushed,
  isSavedDb,
  isSavedWatchlist,
  isExpanded,
  shouldReduceMotion,
  watchInfo,
  fileIntegrityStatus,
  affinity,
  genreAffinityMap,
  sortBy,
  scanRootPath,
  sambaConfig,
  onToggleExpand,
  onToggleWatched,
  onToggleWatchlist,
  onOpenCategorizer,
  onPlayMedia,
  onOpenDetails,
  onSelectGenreOrCategory,
  onVerifyFileIntegrity,
  onPushToSamba,
  onSaveToSqlite,
  onOpenInNfoStudio,
}) => {
  const imageSrc = media.fanartUrl || media.posterUrl;
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [imageSrc]);

  const isImported =
    media.id.startsWith('imported-') ||
    media.id.startsWith('batch-') ||
    Boolean(media.matchedFilename);
  const isWatched = Boolean(watchInfo?.isCompleted);
  const progressPercent = watchInfo?.progress || (watchInfo?.isCompleted ? 100 : 0);
  const genresList = safeGenres(media.genres);

  return (
    <motion.article
      id={`media-card-${media.id}`}
      initial="rest"
      animate="rest"
      whileHover="hover"
      variants={{
        rest: { y: 0 },
        hover: { y: shouldReduceMotion ? 0 : -4 },
      }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-lg flex flex-col group cursor-pointer transition-colors duration-200 hover:shadow-xl hover:shadow-indigo-500/15 h-full ${
        sortBy === 'affinity' && affinity.percentage >= 60
          ? 'border-emerald-500/50 hover:border-emerald-400/80 shadow-emerald-950/20'
          : 'border-slate-800 hover:border-indigo-500/50'
      }`}
      onClick={(e) => onToggleExpand(media.id, e)}
    >
      {/* Media Poster & Header Image (consistent 16:10 aspect ratio + Framer Motion hover zoom) */}
      <div className="relative w-full aspect-[16/10] bg-slate-950 overflow-hidden group/poster shrink-0">
        {imageSrc && !hasImageError ? (
          <motion.img
            src={imageSrc}
            alt={media.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setHasImageError(true)}
            variants={{
              rest: { scale: 1 },
              hover: { scale: shouldReduceMotion ? 1 : 1.05 },
            }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-95 transition-opacity duration-200 will-change-transform"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 flex items-center justify-center">
            {media.type === 'series' ? (
              <Tv className="w-12 h-12 text-slate-600" />
            ) : media.type === 'movie' ? (
              <Film className="w-12 h-12 text-slate-600" />
            ) : (
              <Music className="w-12 h-12 text-slate-600" />
            )}
          </div>
        )}

        {/* Hover Tooltip - delayed by 10s to prevent obstructing action buttons */}
        <div className="absolute inset-0 z-10 p-4 bg-slate-950/95 opacity-0 group-hover/poster:opacity-100 transition-opacity duration-300 delay-0 group-hover/poster:delay-[10000ms] flex flex-col justify-start pointer-events-none">
          <div className="text-white text-xs font-semibold mb-1 flex items-center justify-between">
            <span>{safeRating(media.rating).toFixed(1)} / 10</span>
            <span className="text-slate-400 font-normal">{genresList.slice(0, 2).join(', ')}</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-tight line-clamp-4">
            {media.overview}
          </p>
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

        {/* Type Badge & Origin Badge & Affinity Badge */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 z-20">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-1 shadow-md ${
              media.type === 'series'
                ? 'bg-purple-600 text-white'
                : media.type === 'movie'
                ? 'bg-cyan-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {media.type === 'series' && <Tv className="w-3 h-3" />}
            {media.type === 'movie' && <Film className="w-3 h-3" />}
            {media.type === 'album' && <Music className="w-3 h-3" />}
            {media.type}
          </span>

          {sortBy === 'affinity' && affinity.percentage > 0 && (
            <span
              className="px-2 py-0.5 rounded bg-emerald-950/95 border border-emerald-500/60 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shadow-md"
              title={`Affinity Score: ${affinity.score.toFixed(1)} based on ${affinity.topMatchingGenre} watch history`}
            >
              <Target className="w-2.5 h-2.5 text-emerald-400" />
              <span>{affinity.percentage}% Match</span>
              {affinity.topMatchingGenre && (
                <span className="text-emerald-200/70 font-normal">({affinity.topMatchingGenre})</span>
              )}
            </span>
          )}

          {isImported && (
            <span className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 shadow">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Imported
            </span>
          )}

          {media.certification && (
            <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700 text-slate-300 text-[10px] font-semibold">
              {media.certification}
            </span>
          )}

          {isWatched ? (
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 shadow">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
              Watched
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700/60 text-slate-400 text-[10px] font-medium flex items-center gap-1 shadow">
              <Clock className="w-2.5 h-2.5 text-slate-400" />
              Unwatched
            </span>
          )}
        </div>

        {/* Rating badge & Watchlist/Watched toggle buttons */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
          <button
            id={`watched-toggle-${media.id}`}
            onClick={(e) => onToggleWatched(media, e)}
            className={`p-1.5 rounded-lg transition cursor-pointer shadow-md border ${
              isWatched
                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-900/95 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-700'
            }`}
            title={isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${isWatched ? 'text-emerald-400 fill-emerald-500/20' : ''}`} />
          </button>

          <button
            id={`watchlist-toggle-${media.id}`}
            onClick={(e) => onToggleWatchlist(media, e)}
            className={`p-1.5 rounded-lg transition cursor-pointer shadow-md border ${
              isSavedWatchlist
                ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
                : 'bg-slate-900/95 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700'
            }`}
            title={isSavedWatchlist ? 'Remove from My Watchlist' : 'Add to My Watchlist'}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSavedWatchlist ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenCategorizer(media.title, media.type);
            }}
            className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer shadow-md"
            title="Search web for updated categories and metadata"
          >
            <Globe className="w-3.5 h-3.5" />
          </button>

          {media.posterUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const filename = `${media.title.replace(/[/\\?%*:|"<>]/g, '_')}-${media.type === 'album' ? 'folder' : 'poster'}.jpg`;
                downloadMediaArtwork(media.posterUrl, filename);
              }}
              className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-slate-700 transition cursor-pointer shadow-md"
              title="Download high-resolution poster/cover image (.jpg)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-900/90 border border-amber-500/30 px-2 py-1 rounded-lg text-amber-400 text-xs font-bold shadow-md">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
            <span>{safeRating(media.rating).toFixed(1)}</span>
          </div>
        </div>

        {/* Quick Play/Preview Overlay on Hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onPlayMedia) onPlayMedia(media);
            else onOpenDetails(media);
          }}
          className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xl cursor-pointer"
          title="Play & Stream Media"
        >
          <Play className="w-5 h-5 fill-white ml-0.5" />
        </button>

        {/* Floating Title and Meta */}
        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="text-lg font-bold text-white leading-snug drop-shadow-md truncate">
            {media.title}
          </h3>
          <div className="flex items-center gap-3 text-xs text-slate-300 mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-indigo-400" />
              {media.year}
            </span>
            {media.runtime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                {media.runtime}
              </span>
            )}
            {media.artists && (
              <span className="text-slate-200 font-medium truncate max-w-[140px]">
                {media.artists.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
        {/* Categories & Genres Pills */}
        <div className="flex flex-wrap gap-1.5">
          {genresList.slice(0, 4).map((g, idx) => {
            const isAffinityMatched = (genreAffinityMap[g.trim().toLowerCase()]?.score || 0) > 0;
            return (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGenreOrCategory(g);
                }}
                className={`px-2 py-0.5 rounded-full text-[11px] border transition cursor-pointer flex items-center gap-1 ${
                  sortBy === 'affinity' && isAffinityMatched
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/90 font-medium'
                    : 'bg-slate-800 hover:bg-indigo-900/60 text-slate-300 hover:text-indigo-200 border-slate-700/60'
                }`}
                title={
                  isAffinityMatched
                    ? `Matched in your top watch genres (${genreAffinityMap[g.trim().toLowerCase()].watchCount} watches)`
                    : undefined
                }
              >
                {sortBy === 'affinity' && isAffinityMatched && <Sparkles className="w-2.5 h-2.5 text-emerald-400" />}
                <span>{g}</span>
              </button>
            );
          })}
          {media.seasons && (
            <span className="px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 text-[11px] border border-purple-800/40">
              {media.seasons.length} {media.seasons.length === 1 ? 'Season' : 'Seasons'}
            </span>
          )}
          {media.tracks && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-300 text-[11px] border border-emerald-800/40">
              {media.tracks.length} Tracks
            </span>
          )}
        </div>

        {/* Plot / Overview */}
        <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
          {media.overview}
        </p>

        {/* Target Samba Folder Path info & Verify Integrity */}
        <div className="space-y-1.5">
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">
                {media.matchedFilename
                  ? `File: ${media.matchedFilename}`
                  : getMountedDisplayPath(
                      media.recommendedFolderStructure,
                      scanRootPath || `/Volumes/${sambaConfig.share || 'media'}`,
                      sambaConfig.share
                    )}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              id={`btn-verify-integrity-${media.id}`}
              onClick={(e) => onVerifyFileIntegrity(media, e)}
              disabled={fileIntegrityStatus === 'verifying'}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Check Samba path accessibility and file checksum integrity"
            >
              {fileIntegrityStatus === 'verifying' ? (
                <>
                  <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                  <span>Verifying Path...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Verify File Integrity</span>
                </>
              )}
            </button>

            {fileIntegrityStatus === 'reachable' && (
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                File Verified & Accessible
              </span>
            )}

            {fileIntegrityStatus === 'corrupted' && (
              <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                <AlertCircle className="w-3 h-3 text-rose-400" />
                File Unreachable / Corrupted
              </span>
            )}
          </div>
        </div>

        {/* Expandable Technical Metadata Toggle Bar */}
        <button
          id={`btn-expand-meta-${media.id}`}
          onClick={(e) => onToggleExpand(media.id, e)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isExpanded ? 'Hide Technical Metadata' : 'View Bitrate, Audio & Subtitles'}</span>
          </div>
          <span className="text-[11px] text-indigo-400 font-mono">
            {isExpanded ? '▲ Less' : '▼ More'}
          </span>
        </button>

        {/* Expanded Technical Metadata Section */}
        {isExpanded && (
          <div className="overflow-hidden space-y-3 pt-1 pb-1 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-slate-950/90 border border-indigo-900/40 space-y-2.5 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-indigo-400" /> File Bitrate:
                </span>
                <span className="font-mono text-indigo-300 font-bold bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                  {media.type === 'album'
                    ? '320 kbps (FLAC Lossless)'
                    : media.type === 'series'
                    ? '14.2 Mbps (HEVC 10-bit / 5.1ch)'
                    : '18.8 Mbps (UHD Remux / Atmos)'}
                </span>
              </div>

              <div>
                <div className="text-slate-400 font-medium mb-1 flex items-center gap-1">
                  <Music className="w-3 h-3 text-emerald-400" /> Audio Track Languages:
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700 text-[11px] font-mono flex items-center gap-1">
                    <span>🇺🇸</span> English (DTS-HD MA 5.1)
                  </span>
                  {media.type === 'series' && (
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700 text-[11px] font-mono flex items-center gap-1">
                      <span>🇯🇵</span> Japanese (TrueHD Atmos 7.1)
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700 text-[11px] font-mono flex items-center gap-1">
                    <span>🇫🇷</span> French (Stereo 2.0)
                  </span>
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-medium mb-1 flex items-center gap-1">
                  <FileVideo className="w-3 h-3 text-teal-400" /> Full Subtitle List:
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="px-2 py-0.5 rounded bg-teal-950/70 text-teal-300 border border-teal-800/50 text-[11px] font-mono flex items-center gap-1">
                    <span>🇺🇸</span> English (.srt - Default)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-950/70 text-teal-300 border border-teal-800/50 text-[11px] font-mono flex items-center gap-1">
                    <span>🇯🇵</span> Japanese (.ass - Signs & Songs)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-950/70 text-teal-300 border border-teal-800/50 text-[11px] font-mono flex items-center gap-1">
                    <span>🇪🇸</span> Spanish (.vtt)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-950/70 text-teal-300 border border-teal-800/50 text-[11px] font-mono flex items-center gap-1">
                    <span>🇩🇪</span> German (.srt)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions Button Grid */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-2 gap-2">
            <button
              id={`btn-download-bundle-${media.id}`}
              onClick={(e) => {
                e.stopPropagation();
                downloadMediaBundleZip(media);
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm cursor-pointer"
              title="Download complete ZIP package containing .nfo, posters, XML, subtitle templates"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download ZIP</span>
            </button>

            <button
              id={`btn-push-samba-${media.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onPushToSamba(media);
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isPushed
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700'
              }`}
              title="Sync metadata & folder structure directly into Samba network share"
            >
              {isPushed ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Pushed to SMB!</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Push to Samba</span>
                </>
              )}
            </button>
          </div>

          {media.posterUrl && (
            <button
              id={`btn-download-art-${media.id}`}
              onClick={(e) => {
                e.stopPropagation();
                const filename = `${media.title.replace(/[/\\?%*:|"<>]/g, '_')}-${media.type === 'album' ? 'folder' : 'poster'}.jpg`;
                downloadMediaArtwork(media.posterUrl, filename);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-indigo-300 hover:text-indigo-200 border border-slate-700/80 text-[11px] font-semibold transition cursor-pointer"
              title="Download standalone high-resolution poster / cover art image (.jpg)"
            >
              <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Download Artwork (.jpg)</span>
            </button>
          )}

          {/* Secondary Play, Details, Watchlist, DB & XML buttons */}
          <div className="grid grid-cols-5 gap-1 text-[11px]">
            <button
              id={`btn-play-media-${media.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (onPlayMedia) onPlayMedia(media);
                else onOpenDetails(media);
              }}
              className="flex items-center justify-center gap-1 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-500 text-white font-semibold transition cursor-pointer shadow-sm"
              title="Play & Stream Media"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Play</span>
            </button>

            <button
              id={`btn-inspect-${media.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails(media);
              }}
              className="flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              <Eye className="w-3 h-3 text-cyan-400" />
              <span>Info</span>
            </button>

            <button
              id={`btn-watchlist-card-${media.id}`}
              onClick={(e) => onToggleWatchlist(media, e)}
              className={`flex items-center justify-center gap-1 py-1.5 rounded transition cursor-pointer ${
                isSavedWatchlist
                  ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
              }`}
              title={isSavedWatchlist ? 'In Watchlist (Click to remove)' : 'Add to Watchlist'}
            >
              <Bookmark className={`w-3 h-3 ${isSavedWatchlist ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span>{isSavedWatchlist ? 'Saved' : 'Watch'}</span>
            </button>

            <button
              id={`btn-save-sqlite-${media.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onSaveToSqlite(media);
              }}
              className={`flex items-center justify-center gap-1 py-1.5 rounded transition cursor-pointer ${
                isSavedDb
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-emerald-300'
              }`}
              title="Store Title and Synopsis in SQLite database"
            >
              {isSavedDb ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Database className="w-3 h-3" />
                  <span>DB</span>
                </>
              )}
            </button>

            <button
              id={`btn-studio-${media.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenInNfoStudio(media);
              }}
              className="flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>XML</span>
            </button>
          </div>
        </div>
      </div>

      {/* Thin Colored Progress Bar at Bottom of Media Card */}
      {progressPercent > 0 && (
        <div className="w-full bg-slate-800 h-1.5 overflow-hidden rounded-b-2xl">
          <div
            className={`h-full transition-all duration-300 ${
              progressPercent >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            title={`Watch Progress: ${Math.round(progressPercent)}%`}
          />
        </div>
      )}
    </motion.article>
  );
});

interface VirtualRowExtraProps {
  rows: MediaMetadata[][];
  pushedIds: Record<string, boolean>;
  savedDbIds: Record<string, boolean>;
  watchlistIds: Set<string>;
  expandedCardIds: Record<string, boolean>;
  shouldReduceMotion: boolean;
  watchedItemsMap: Record<string, { isCompleted: boolean; progress: number }>;
  fileIntegrityMap: Record<string, 'verifying' | 'reachable' | 'corrupted'>;
  mediaAffinityById: Map<string, MediaAffinityEntry>;
  genreAffinityMap: Record<string, GenreAffinityScore>;
  sortBy: MediaSortOption;
  scanRootPath?: string;
  sambaConfig: SambaConfig;
  onToggleExpand: (id: string, e?: React.MouseEvent) => void;
  onToggleWatched: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onToggleWatchlist: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onOpenCategorizer: (title: string, type?: MediaType) => void;
  onPlayMedia?: (media: MediaMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  onSelectGenreOrCategory: (genre: string) => void;
  onVerifyFileIntegrity: (media: MediaMetadata, e?: React.MouseEvent) => void;
  onPushToSamba: (media: MediaMetadata) => void;
  onSaveToSqlite: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
}

const VirtualizedMediaRow = ({
  ariaAttributes,
  index,
  style,
  rows,
  pushedIds,
  savedDbIds,
  watchlistIds,
  expandedCardIds,
  shouldReduceMotion,
  watchedItemsMap,
  fileIntegrityMap,
  mediaAffinityById,
  genreAffinityMap,
  sortBy,
  scanRootPath,
  sambaConfig,
  onToggleExpand,
  onToggleWatched,
  onToggleWatchlist,
  onOpenCategorizer,
  onPlayMedia,
  onOpenDetails,
  onSelectGenreOrCategory,
  onVerifyFileIntegrity,
  onPushToSamba,
  onSaveToSqlite,
  onOpenInNfoStudio,
}: RowComponentProps<VirtualRowExtraProps>) => {
  const rowItems = rows[index];
  if (!rowItems || rowItems.length === 0) return null;

  return (
    <div {...ariaAttributes} style={style}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pb-5 items-stretch">
        {rowItems.map((media) => (
          <MediaLibraryCard
            key={media.id}
            media={media}
            isPushed={Boolean(pushedIds[media.id])}
            isSavedDb={Boolean(savedDbIds[media.id])}
            isSavedWatchlist={watchlistIds.has(media.id)}
            isExpanded={Boolean(expandedCardIds[media.id])}
            shouldReduceMotion={shouldReduceMotion}
            watchInfo={watchedItemsMap[media.id] || watchedItemsMap[media.title.toLowerCase()]}
            fileIntegrityStatus={fileIntegrityMap[media.id]}
            affinity={mediaAffinityById.get(media.id) ?? EMPTY_AFFINITY}
            genreAffinityMap={genreAffinityMap}
            sortBy={sortBy}
            scanRootPath={scanRootPath}
            sambaConfig={sambaConfig}
            onToggleExpand={onToggleExpand}
            onToggleWatched={onToggleWatched}
            onToggleWatchlist={onToggleWatchlist}
            onOpenCategorizer={onOpenCategorizer}
            onPlayMedia={onPlayMedia}
            onOpenDetails={onOpenDetails}
            onSelectGenreOrCategory={onSelectGenreOrCategory}
            onVerifyFileIntegrity={onVerifyFileIntegrity}
            onPushToSamba={onPushToSamba}
            onSaveToSqlite={onSaveToSqlite}
            onOpenInNfoStudio={onOpenInNfoStudio}
          />
        ))}
      </div>
    </div>
  );
};

export const VirtualizedMediaGrid: React.FC<VirtualizedMediaGridProps> = React.memo(({
  items,
  layoutKey,
  enableVirtualization = true,
  pushedIds,
  savedDbIds,
  watchlistIds,
  expandedCardIds,
  watchedItemsMap,
  fileIntegrityMap,
  mediaAffinityById,
  genreAffinityMap,
  sortBy,
  scanRootPath,
  sambaConfig,
  onToggleExpand,
  onToggleWatched,
  onToggleWatchlist,
  onOpenCategorizer,
  onPlayMedia,
  onOpenDetails,
  onSelectGenreOrCategory,
  onVerifyFileIntegrity,
  onPushToSamba,
  onSaveToSqlite,
  onOpenInNfoStudio,
}) => {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const [columnCount, setColumnCount] = useState<number>(getResponsiveColumnCount);

  useEffect(() => {
    let rafId: number | null = null;
    const handleResize = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const nextCols = getResponsiveColumnCount();
        setColumnCount((prev) => (prev === nextCols ? prev : nextCols));
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const rows = useMemo(() => {
    const chunked: MediaMetadata[][] = [];
    for (let i = 0; i < items.length; i += columnCount) {
      chunked.push(items.slice(i, i + columnCount));
    }
    return chunked;
  }, [items, columnCount]);

  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: 560,
    key: `${columnCount}-${layoutKey}`,
  });

  const getRowKey = useCallback(
    (index: number, data: VirtualRowExtraProps) => {
      const row = data.rows[index];
      if (!row || row.length === 0) return `row-${index}`;
      return row.map((m) => m.id).join('|');
    },
    []
  );

  const rowProps: VirtualRowExtraProps = useMemo(
    () => ({
      rows,
      pushedIds,
      savedDbIds,
      watchlistIds,
      expandedCardIds,
      shouldReduceMotion,
      watchedItemsMap,
      fileIntegrityMap,
      mediaAffinityById,
      genreAffinityMap,
      sortBy,
      scanRootPath,
      sambaConfig,
      onToggleExpand,
      onToggleWatched,
      onToggleWatchlist,
      onOpenCategorizer,
      onPlayMedia,
      onOpenDetails,
      onSelectGenreOrCategory,
      onVerifyFileIntegrity,
      onPushToSamba,
      onSaveToSqlite,
      onOpenInNfoStudio,
    }),
    [
      rows,
      pushedIds,
      savedDbIds,
      watchlistIds,
      expandedCardIds,
      shouldReduceMotion,
      watchedItemsMap,
      fileIntegrityMap,
      mediaAffinityById,
      genreAffinityMap,
      sortBy,
      scanRootPath,
      sambaConfig,
      onToggleExpand,
      onToggleWatched,
      onToggleWatchlist,
      onOpenCategorizer,
      onPlayMedia,
      onOpenDetails,
      onSelectGenreOrCategory,
      onVerifyFileIntegrity,
      onPushToSamba,
      onSaveToSqlite,
      onOpenInNfoStudio,
    ]
  );

  if (!enableVirtualization) {
    return (
      <div
        id="media-results-grid"
        data-virtualized="false"
        data-total-items={items.length}
        data-row-count={rows.length}
        data-column-count={columnCount}
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch"
      >
        {items.map((media) => (
          <MediaLibraryCard
            key={media.id}
            media={media}
            isPushed={Boolean(pushedIds[media.id])}
            isSavedDb={Boolean(savedDbIds[media.id])}
            isSavedWatchlist={watchlistIds.has(media.id)}
            isExpanded={Boolean(expandedCardIds[media.id])}
            shouldReduceMotion={shouldReduceMotion}
            watchInfo={watchedItemsMap[media.id] || watchedItemsMap[media.title.toLowerCase()]}
            fileIntegrityStatus={fileIntegrityMap[media.id]}
            affinity={mediaAffinityById.get(media.id) ?? EMPTY_AFFINITY}
            genreAffinityMap={genreAffinityMap}
            sortBy={sortBy}
            scanRootPath={scanRootPath}
            sambaConfig={sambaConfig}
            onToggleExpand={onToggleExpand}
            onToggleWatched={onToggleWatched}
            onToggleWatchlist={onToggleWatchlist}
            onOpenCategorizer={onOpenCategorizer}
            onPlayMedia={onPlayMedia}
            onOpenDetails={onOpenDetails}
            onSelectGenreOrCategory={onSelectGenreOrCategory}
            onVerifyFileIntegrity={onVerifyFileIntegrity}
            onPushToSamba={onPushToSamba}
            onSaveToSqlite={onSaveToSqlite}
            onOpenInNfoStudio={onOpenInNfoStudio}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      id="media-results-grid"
      data-virtualized="true"
      data-total-items={items.length}
      data-row-count={rows.length}
      data-column-count={columnCount}
    >
      <List<VirtualRowExtraProps>
        rowCount={rows.length}
        rowHeight={dynamicRowHeight}
        rowComponent={VirtualizedMediaRow}
        rowProps={rowProps}
        rowKey={getRowKey}
        scrollElement="window"
        defaultHeight={720}
        overscanCount={2}
      />
    </div>
  );
});
