import React, { useState } from 'react';
import {
  X,
  Star,
  Calendar,
  Clock,
  Download,
  Copy,
  Check,
  FolderPlus,
  Tv,
  Film,
  Music,
  HardDrive,
  FileCode2,
  Sparkles,
  Layers,
  ChevronRight,
  Database,
  Bookmark,
  Play,
  Edit3,
  Wand2,
  Info,
} from 'lucide-react';
import { MediaMetadata, SambaConfig, EpisodeMetadata, TrackMetadata } from '../types';
import { downloadMediaBundleZip, downloadTextFile } from '../utils/zipDownloader';
import { generateMetadataFile, generateEpisodeNfo } from '../utils/nfoGenerator';

interface MediaDetailModalProps {
  media: MediaMetadata | null;
  onClose: () => void;
  onPushToSamba: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
  onPlayMedia?: (media: MediaMetadata, episode?: EpisodeMetadata, track?: TrackMetadata) => void;
  onUpdateMedia?: (media: MediaMetadata) => void;
  onOpenManualMatcher?: (media: MediaMetadata) => void;
  sambaConfig: SambaConfig;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  media: initialMedia,
  onClose,
  onPushToSamba,
  onOpenInNfoStudio,
  onPlayMedia,
  onUpdateMedia,
  onOpenManualMatcher,
  sambaConfig,
}) => {
  if (!initialMedia) return null;

  const [media, setMedia] = useState<MediaMetadata>(initialMedia);
  const [activeSeasonTab, setActiveSeasonTab] = useState<number>(
    initialMedia.seasons && initialMedia.seasons.length > 0 ? initialMedia.seasons[0].seasonNumber : 1
  );
  const [copiedNfo, setCopiedNfo] = useState(false);
  const [isPushed, setIsPushed] = useState(false);
  const [isSavedSqlite, setIsSavedSqlite] = useState(false);
  const [trackedEpNum, setTrackedEpNum] = useState<number | null>(null);

  // Synopsis generator states
  const [isGeneratingSynopsis, setIsGeneratingSynopsis] = useState(false);
  const [generatingEpNum, setGeneratingEpNum] = useState<number | null>(null);
  const [editingEpNum, setEditingEpNum] = useState<number | null>(null);
  const [customEpPlot, setCustomEpPlot] = useState<string>('');

  const handleCopyNfo = () => {
    const xml = generateMetadataFile(media);
    navigator.clipboard.writeText(xml);
    setCopiedNfo(true);
    setTimeout(() => setCopiedNfo(false), 2000);
  };

  const handlePush = () => {
    onPushToSamba(media);
    setIsPushed(true);
    setTimeout(() => setIsPushed(false), 3000);
  };

  const handleSaveToSqlite = async () => {
    try {
      const res = await fetch('/api/db/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(media),
      });
      if (res.ok) {
        setIsSavedSqlite(true);
        setTimeout(() => setIsSavedSqlite(false), 3000);
      }
    } catch (err) {
      console.error('Error saving to SQLite:', err);
    }
  };

  const handleTrackEpisodeProgress = async (ep: EpisodeMetadata) => {
    try {
      const res = await fetch('/api/db/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          series_id: media.id,
          series_title: media.title,
          season_number: activeSeasonTab,
          episode_number: ep.episodeNumber,
          episode_title: ep.title,
          playback_position_seconds: 0,
          total_duration_seconds: 3000,
          progress_percentage: 0,
          is_completed: false,
          notes: `Watching Season ${activeSeasonTab}`,
        }),
      });

      // Also ensure series title and synopsis are saved in SQLite
      await handleSaveToSqlite();

      if (res.ok) {
        setTrackedEpNum(ep.episodeNumber);
        setTimeout(() => setTrackedEpNum(null), 3500);
      }
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  };

  // Generate or enrich main overview/synopsis with AI
  const handleRegenerateMainSynopsis = async () => {
    setIsGeneratingSynopsis(true);
    try {
      const res = await fetch('/api/metadata/generate-synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: media.title,
          type: media.type,
          year: media.year,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const updated: MediaMetadata = {
            ...media,
            overview: json.data.overview || media.overview,
            tagline: json.data.tagline || media.tagline,
            genres: json.data.genres || media.genres,
            rating: json.data.rating || media.rating,
          };
          setMedia(updated);
          if (onUpdateMedia) onUpdateMedia(updated);
        }
      }
    } catch (err) {
      console.error('Failed to regenerate main synopsis:', err);
    } finally {
      setIsGeneratingSynopsis(false);
    }
  };

  // Generate or enrich a specific episode synopsis
  const handleGenerateEpisodeSynopsis = async (ep: EpisodeMetadata) => {
    setGeneratingEpNum(ep.episodeNumber);
    try {
      const res = await fetch('/api/metadata/generate-synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: media.title,
          type: 'series',
          year: media.year,
          seasonNumber: activeSeasonTab,
          episodeNumber: ep.episodeNumber,
          episodeTitle: ep.title,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const newPlot = json.data.plot || json.data.overview;
          const updatedSeasons = media.seasons?.map((s) => {
            if (s.seasonNumber !== activeSeasonTab) return s;
            return {
              ...s,
              episodes: s.episodes?.map((e) => {
                if (e.episodeNumber !== ep.episodeNumber) return e;
                return {
                  ...e,
                  plot: newPlot,
                  title: json.data.episodeTitle || e.title,
                  rating: json.data.rating || e.rating,
                };
              }),
            };
          });

          const updated: MediaMetadata = {
            ...media,
            seasons: updatedSeasons,
          };
          setMedia(updated);
          if (onUpdateMedia) onUpdateMedia(updated);
        }
      }
    } catch (err) {
      console.error('Failed to generate episode synopsis:', err);
    } finally {
      setGeneratingEpNum(null);
    }
  };

  // Save manual edit for episode plot
  const handleSaveCustomEpisodePlot = (ep: EpisodeMetadata) => {
    const updatedSeasons = media.seasons?.map((s) => {
      if (s.seasonNumber !== activeSeasonTab) return s;
      return {
        ...s,
        episodes: s.episodes?.map((e) => {
          if (e.episodeNumber !== ep.episodeNumber) return e;
          return {
            ...e,
            plot: customEpPlot.trim() || e.plot,
          };
        }),
      };
    });

    const updated: MediaMetadata = {
      ...media,
      seasons: updatedSeasons,
    };
    setMedia(updated);
    if (onUpdateMedia) onUpdateMedia(updated);
    setEditingEpNum(null);
  };

  const currentSeason = media.seasons?.find((s) => s.seasonNumber === activeSeasonTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div
        id="media-detail-modal"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Close Button */}
        <button
          id="btn-close-detail-modal"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header with Backdrop */}
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
          </div>

          {/* Content inside header */}
          <div className="absolute bottom-4 left-6 right-6 flex items-end gap-5">
            {/* Poster Thumbnail */}
            <div className="w-24 sm:w-28 h-36 rounded-xl overflow-hidden border-2 border-slate-700 shadow-xl shrink-0 hidden xs:block bg-slate-950">
              <img
                src={media.posterUrl}
                alt={media.title}
                className="w-full h-full object-cover"
              />
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

        {/* Modal Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Overview & Synopsis Section */}
          <div className="space-y-2.5 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-400" />
                <span>{media.type === 'series' ? 'TV Show Synopsis & Overview' : media.type === 'movie' ? 'Movie Synopsis & Overview' : 'Album Overview'}</span>
              </span>

              <button
                type="button"
                disabled={isGeneratingSynopsis}
                onClick={handleRegenerateMainSynopsis}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30 transition cursor-pointer"
              >
                <Wand2 className={`w-3 h-3 ${isGeneratingSynopsis ? 'animate-spin' : ''}`} />
                <span>{isGeneratingSynopsis ? 'Generating Synopsis...' : 'Enrich Synopsis with AI'}</span>
              </button>
            </div>

            {media.tagline && (
              <p className="text-indigo-300 italic font-medium text-xs">
                "{media.tagline}"
              </p>
            )}

            <p className="text-slate-200 leading-relaxed text-xs sm:text-sm font-normal">
              {media.overview}
            </p>

            {/* Genres */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {media.genres.map((g, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 text-[11px]"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>

          {/* TV Series Seasons & Episodes Breakdown with Episode Synopses */}
          {media.type === 'series' && media.seasons && media.seasons.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Tv className="w-4 h-4 text-purple-400" />
                  <span>Seasons & Episode Synopsis Guide</span>
                </h3>

                {/* Season Tabs */}
                <div className="flex space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {media.seasons.map((s) => (
                    <button
                      key={s.seasonNumber}
                      onClick={() => setActiveSeasonTab(s.seasonNumber)}
                      className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                        activeSeasonTab === s.seasonNumber
                          ? 'bg-purple-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Season {s.seasonNumber}
                    </button>
                  ))}
                </div>
              </div>

              {/* Episode List with Detailed Synopses */}
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {currentSeason?.episodes?.map((ep) => {
                  const isTracked = trackedEpNum === ep.episodeNumber;
                  const isGen = generatingEpNum === ep.episodeNumber;
                  const isEditing = editingEpNum === ep.episodeNumber;

                  return (
                    <div
                      key={ep.episodeNumber}
                      className="p-3.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl space-y-2 transition"
                    >
                      <div className="flex items-center justify-between font-medium">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded bg-purple-950/80 border border-purple-800/80 text-purple-300 font-mono text-[11px] font-bold flex items-center justify-center">
                            {String(ep.episodeNumber).padStart(2, '0')}
                          </span>
                          <span className="text-white font-semibold text-xs sm:text-sm">
                            {ep.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {onPlayMedia && (
                            <button
                              onClick={() => onPlayMedia(media, ep)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition cursor-pointer shadow-sm"
                              title="Play this episode"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              <span>Play Ep</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isGen}
                            onClick={() => handleGenerateEpisodeSynopsis(ep)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
                            title="Generate/Refine AI episode synopsis"
                          >
                            <Sparkles className={`w-3 h-3 ${isGen ? 'animate-spin' : ''}`} />
                            <span>{isGen ? '...' : 'AI Synopsis'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                handleSaveCustomEpisodePlot(ep);
                              } else {
                                setEditingEpNum(ep.episodeNumber);
                                setCustomEpPlot(ep.plot || '');
                              }
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
                            title="Edit episode plot manually"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{isEditing ? 'Save' : 'Edit'}</span>
                          </button>

                          {ep.rating && (
                            <span className="text-amber-400 font-bold text-[11px]">
                              ★ {ep.rating}
                            </span>
                          )}

                          <button
                            id={`btn-track-ep-${ep.episodeNumber}`}
                            onClick={() => handleTrackEpisodeProgress(ep)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition ${
                              isTracked
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white'
                            }`}
                            title="Record in SQLite as where you left off in this series"
                          >
                            {isTracked ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Saved!</span>
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-3 h-3" />
                                <span>Left Off</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Episode Synopsis */}
                      {isEditing ? (
                        <div className="space-y-1.5 pt-1">
                          <textarea
                            rows={3}
                            value={customEpPlot}
                            onChange={(e) => setCustomEpPlot(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                            placeholder="Enter episode synopsis / plot summary..."
                          />
                        </div>
                      ) : (
                        <p className="text-slate-300 text-xs leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60">
                          {ep.plot || `Episode ${ep.episodeNumber} of ${media.title}. Click 'AI Synopsis' to generate detailed plot.`}
                        </p>
                      )}

                      <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                        <span>
                          File: {media.title} - S{String(activeSeasonTab).padStart(2, '0')}E
                          {String(ep.episodeNumber).padStart(2, '0')} - {ep.title}.mkv
                        </span>
                        {ep.airDate && <span>Air Date: {ep.airDate}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Music Album Tracks Breakdown */}
          {media.type === 'album' && media.tracks && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Music className="w-4 h-4 text-emerald-400" />
                <span>Tracklist ({media.tracks.length} Tracks)</span>
              </h3>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {media.tracks.map((t) => (
                  <div
                    key={t.trackNumber}
                    className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center font-mono text-slate-500 font-bold">
                        {String(t.trackNumber).padStart(2, '0')}
                      </span>
                      <span className="text-white font-medium">{t.title}</span>
                      {t.artist && (
                        <span className="text-slate-400 text-[11px] truncate">({t.artist})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {onPlayMedia && (
                        <button
                          onClick={() => onPlayMedia(media, undefined, t)}
                          className="p-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white transition cursor-pointer"
                          title="Play this track"
                        >
                          <Play className="w-3 h-3 fill-white" />
                        </button>
                      )}
                      <span className="font-mono text-slate-400">{t.duration}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Folder Structure & Samba Transfer Path */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
              <HardDrive className="w-4 h-4" />
              <span>Samba (SMB) Media Server Destination Structure:</span>
            </div>
            <pre className="font-mono text-slate-300 text-xs bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 overflow-x-auto">
              //{sambaConfig.server}/{sambaConfig.share}/{media.recommendedFolderStructure}
              {'\n'}├── {media.type === 'movie' ? 'movie.nfo' : media.type === 'series' ? 'tvshow.nfo' : 'album.nfo'}
              {'\n'}├── poster.jpg
              {'\n'}├── fanart.jpg
              {media.recommendedFilenames.map((fn) => `\n├── ${fn}`).join('')}
            </pre>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              id="modal-btn-copy-nfo"
              onClick={handleCopyNfo}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              {copiedNfo ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied NFO</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy XML NFO</span>
                </>
              )}
            </button>

            <button
              id="modal-btn-sqlite"
              onClick={handleSaveToSqlite}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isSavedSqlite
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
              }`}
              title="Persist title, synopsis, and metadata into SQLite database"
            >
              {isSavedSqlite ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved to SQLite!</span>
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" />
                  <span>Save to SQLite DB</span>
                </>
              )}
            </button>

            <button
              id="modal-btn-studio"
              onClick={() => {
                onOpenInNfoStudio(media);
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Edit in Studio</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="modal-btn-push-samba"
              onClick={handlePush}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isPushed
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-md shadow-emerald-700/20'
              }`}
            >
              {isPushed ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Pushed to Samba!</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Push to Samba Share</span>
                </>
              )}
            </button>

            <button
              id="modal-btn-download-bundle"
              onClick={() => downloadMediaBundleZip(media)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Bundle (ZIP)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
