import React from 'react';
import { Play, Edit3, Star, Calendar, Clock, GitBranch, RefreshCw, Wand2, Download, Image as ImageIcon } from 'lucide-react';
import { MediaMetadata, EpisodeMetadata, TrackMetadata } from '../../types';
import { downloadMediaArtwork } from '../../utils/zipDownloader';

interface MediaDetailHeaderProps {
  media: MediaMetadata;
  onPlayMedia?: (media: MediaMetadata, ep?: EpisodeMetadata, track?: TrackMetadata) => void;
  onOpenManualMatcher?: (media: MediaMetadata) => void;
  onClose: () => void;
  handleSelectVersionBranch: (versionId: string) => void;
  onBulkRefresh?: () => void;
  isRefreshing?: boolean;
  onGenerateFanart?: () => void;
  isGeneratingFanart?: boolean;
  onFetchOfficialArt?: () => void;
  isFetchingArt?: boolean;
}

export const MediaDetailHeader: React.FC<MediaDetailHeaderProps> = ({
  media,
  onPlayMedia,
  onOpenManualMatcher,
  onClose,
  handleSelectVersionBranch,
  onBulkRefresh,
  isRefreshing = false,
  onGenerateFanart,
  isGeneratingFanart = false,
  onFetchOfficialArt,
  isFetchingArt = false,
}) => {
  return (
    <div className="relative h-64 bg-slate-950 shrink-0 overflow-hidden">
      <img
        src={media.fanartUrl || media.posterUrl}
        alt={media.title}
        className="w-full h-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent"></div>

      {/* Top action buttons */}
      <div className="absolute top-4 left-6 z-20 flex items-center gap-2">
        {onPlayMedia && (
          <button
            onClick={() => onPlayMedia(media)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{media.type === 'album' ? 'Play Album Audio' : 'Play Video Stream'}</span>
          </button>
        )}

        {onOpenManualMatcher && (
          <button
            onClick={() => {
              onOpenManualMatcher(media);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-purple-300 text-xs font-semibold border border-purple-500/40 backdrop-blur-sm transition cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Manual Match / Resolve</span>
          </button>
        )}

        {onGenerateFanart && (
          <button
            disabled={isGeneratingFanart}
            onClick={onGenerateFanart}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border backdrop-blur-sm transition cursor-pointer ${
              isGeneratingFanart
                ? 'bg-slate-800 text-slate-500 border-slate-700'
                : 'bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border-purple-500/40'
            }`}
            title="Generate custom cinematic fanart using AI"
          >
            <Wand2 className={`w-3.5 h-3.5 ${isGeneratingFanart ? 'animate-pulse' : ''}`} />
            <span>{isGeneratingFanart ? 'Designing Fanart...' : 'Generate AI Fanart'}</span>
          </button>
        )}

        {onFetchOfficialArt && (
          <button
            disabled={isFetchingArt}
            onClick={onFetchOfficialArt}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border backdrop-blur-sm transition cursor-pointer ${
              isFetchingArt
                ? 'bg-slate-800 text-slate-500 border-slate-700'
                : 'bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/40'
            }`}
            title="Fetch authentic official poster & backdrop from OMDb/TVMaze"
          >
            <ImageIcon className={`w-3.5 h-3.5 ${isFetchingArt ? 'animate-spin' : ''}`} />
            <span>{isFetchingArt ? 'Fetching Artwork...' : 'Fetch Official Art'}</span>
          </button>
        )}

        {onBulkRefresh && (
          <button
            disabled={isRefreshing}
            onClick={onBulkRefresh}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border backdrop-blur-sm transition cursor-pointer ${
              isRefreshing
                ? 'bg-slate-800 text-slate-500 border-slate-700'
                : 'bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 border-indigo-500/40'
            }`}
            title="Refresh metadata for entire series/folder from Gemini AI"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing Metadata...' : 'Bulk Refresh'}</span>
          </button>
        )}
      </div>

      {/* Content inside header */}
      <div className="absolute bottom-4 left-6 right-6 flex items-end gap-5">
        {/* Poster Thumbnail with direct download hover */}
        <div className="group/poster relative w-24 sm:w-28 h-36 rounded-xl overflow-hidden border-2 border-slate-700 shadow-xl shrink-0 hidden xs:block bg-slate-950">
          <img
            src={media.posterUrl}
            alt={media.title}
            className="w-full h-full object-cover"
          />
          {media.posterUrl && (
            <button
              onClick={() => {
                const filename = `${media.title.replace(/[/\\?%*:|"<>]/g, '_')}-${media.type === 'album' ? 'folder' : 'poster'}.jpg`;
                downloadMediaArtwork(media.posterUrl, filename);
              }}
              className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover/poster:opacity-100 flex flex-col items-center justify-center gap-1 text-white text-[10px] font-bold transition cursor-pointer"
              title="Click to download poster file directly"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span>Download Art</span>
            </button>
          )}
        </div>

        {/* Title & Metadata */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                media.type === 'series'
                  ? 'bg-purple-600 text-white'
                  : media.type === 'movie'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {media.type}
            </span>
            {media.certification && (
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-semibold">
                {media.certification}
              </span>
            )}
            <div className="flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-bold">
              <Star className="w-3 h-3 fill-amber-400" />
              <span>{media.rating.toFixed(1)}</span>
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight drop-shadow">
            {media.title}
          </h2>

          {/* Multi-Version Selector Dropdown */}
          {media.versions && media.versions.length > 1 && (
            <div className="flex items-center gap-2 pt-1 pb-0.5">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-950/80 border border-indigo-500/50 text-indigo-300 text-[11px] font-bold shrink-0">
                <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                <span>Multi-Version Branch:</span>
              </div>
              <select
                value={media.selectedVersionId || media.id}
                onChange={(e) => handleSelectVersionBranch(e.target.value)}
                className="bg-slate-900/90 border border-slate-700 hover:border-indigo-500 rounded-lg px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-indigo-400 cursor-pointer shadow-sm max-w-xs sm:max-w-md"
              >
                {media.versions.map((ver) => (
                  <option key={ver.id} value={ver.id}>
                    {ver.branchName || ver.title} {ver.year ? `(${ver.year})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {media.year}
            </span>
            {media.runtime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                {media.runtime}
              </span>
            )}
            {media.directors && (
              <span className="text-slate-400">
                Dir: <strong className="text-slate-200">{media.directors.join(', ')}</strong>
              </span>
            )}
            {media.artists && (
              <span className="text-slate-400">
                Artist: <strong className="text-slate-200">{media.artists.join(', ')}</strong>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
