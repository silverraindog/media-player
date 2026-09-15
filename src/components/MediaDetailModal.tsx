import React, { useState, useEffect } from 'react';
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
  CheckCircle2,
  RotateCcw,
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

interface EpisodeProgressRecord {
  playback_position_seconds: number;
  total_duration_seconds: number;
  progress_percentage: number;
  is_completed: number;
  last_watched_at: string;
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
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState<number | null>(
    (initialMedia.seasons && initialMedia.seasons[0]?.episodes?.[0]?.episodeNumber) ?? 1
  );
  const [copiedNfo, setCopiedNfo] = useState(false);
  const [copiedEpNfo, setCopiedEpNfo] = useState(false);
  const [isPushed, setIsPushed] = useState(false);
  const [isSavedSqlite, setIsSavedSqlite] = useState(false);
  const [trackedEpNum, setTrackedEpNum] = useState<number | null>(null);
  const [progressSaveNotice, setProgressSaveNotice] = useState<string | null>(null);

  // Map of "s{season}-e{episode}" -> EpisodeProgressRecord
  const [episodeProgressMap, setEpisodeProgressMap] = useState<Record<string, EpisodeProgressRecord>>({});

  // Synopsis generator states
  const [isGeneratingSynopsis, setIsGeneratingSynopsis] = useState(false);
  const [generatingEpNum, setGeneratingEpNum] = useState<number | null>(null);
  const [editingEpNum, setEditingEpNum] = useState<number | null>(null);
  const [customEpPlot, setCustomEpPlot] = useState<string>('');

  // Fetch SQLite watch progress on mount or when media changes
  useEffect(() => {
    if (media.type === 'series') {
      fetch(`/api/db/progress/${media.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.episodeMap) {
            setEpisodeProgressMap(data.episodeMap);
          }
        })
        .catch((err) => console.error('Error fetching episode progress:', err));
    }
  }, [media.id, media.type]);

  // Keep selected episode updated when active season changes
  const currentSeason = media.seasons?.find((s) => s.seasonNumber === activeSeasonTab);
  const selectedEpisode =
    currentSeason?.episodes?.find((e) => e.episodeNumber === selectedEpisodeNumber) ||
    currentSeason?.episodes?.[0];

  const handleCopyNfo = () => {
    const xml = generateMetadataFile(media);
    navigator.clipboard.writeText(xml);
    setCopiedNfo(true);
    setTimeout(() => setCopiedNfo(false), 2000);
  };

  const handleCopyEpisodeNfo = (ep: EpisodeMetadata) => {
    const epXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<episodedetails>
  <title>${ep.title}</title>
  <showtitle>${media.title}</showtitle>
  <season>${activeSeasonTab}</season>
  <episode>${ep.episodeNumber}</episode>
  <plot>${ep.plot || ''}</plot>
  <rating>${ep.rating || media.rating || 8.0}</rating>
  <aired>${ep.airDate || `${media.year}-01-01`}</aired>
</episodedetails>`;
    navigator.clipboard.writeText(epXml);
    setCopiedEpNfo(true);
    setTimeout(() => setCopiedEpNfo(false), 2000);
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

  // Helper to update watch progress and timestamp for an episode in SQLite
  const handleUpdateEpisodeWatchProgress = async (
    ep: EpisodeMetadata,
    minutesWatched: number,
    totalMinutes: number = 48,
    markCompleted: boolean = false
  ) => {
    try {
      const totalSec = totalMinutes * 60;
      const watchedSec = Math.min(minutesWatched * 60, totalSec);
      const percentage = Math.round((watchedSec / totalSec) * 100);
      const isComplete = markCompleted || percentage >= 90;

      const res = await fetch('/api/db/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          series_id: media.id,
          series_title: media.title,
          season_number: activeSeasonTab,
          episode_number: ep.episodeNumber,
          episode_title: ep.title,
          playback_position_seconds: isComplete ? totalSec : watchedSec,
          total_duration_seconds: totalSec,
          progress_percentage: isComplete ? 100 : percentage,
          is_completed: isComplete,
          notes: `Season ${activeSeasonTab} Episode ${ep.episodeNumber}`,
        }),
      });

      if (res.ok) {
        const key = `s${activeSeasonTab}-e${ep.episodeNumber}`;
        const updatedRecord: EpisodeProgressRecord = {
          playback_position_seconds: isComplete ? totalSec : watchedSec,
          total_duration_seconds: totalSec,
          progress_percentage: isComplete ? 100 : percentage,
          is_completed: isComplete ? 1 : 0,
          last_watched_at: new Date().toISOString(),
        };

        setEpisodeProgressMap((prev) => ({
          ...prev,
          [key]: updatedRecord,
        }));

        setTrackedEpNum(ep.episodeNumber);
        setProgressSaveNotice(`Saved progress (${isComplete ? '100% Watched' : `${minutesWatched}m / ${totalMinutes}m`}) & updated SQLite timestamp!`);
        setTimeout(() => {
          setTrackedEpNum(null);
          setProgressSaveNotice(null);
        }, 3000);
      }
    } catch (err) {
      console.error('Error updating episode progress in SQLite:', err);
    }
  };

  const handleTrackEpisodeProgress = async (ep: EpisodeMetadata) => {
    await handleUpdateEpisodeWatchProgress(ep, 0, 48, false);
  };

  // Helper to retrieve progress details for a given episode
  const getEpisodeProgress = (epNum: number) => {
    const key = `s${activeSeasonTab}-e${epNum}`;
    return episodeProgressMap[key] || null;
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

          {/* TV Series Seasons & Dedicated Episodes Guide */}
          {media.type === 'series' && media.seasons && media.seasons.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Tv className="w-4 h-4 text-purple-400" />
                  <span>Episodes & Synopsis Inspector</span>
                </h3>

                {/* Season Tabs */}
                <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {media.seasons.map((s) => (
                    <button
                      key={s.seasonNumber}
                      onClick={() => {
                        setActiveSeasonTab(s.seasonNumber);
                        if (s.episodes && s.episodes.length > 0) {
                          setSelectedEpisodeNumber(s.episodes[0].episodeNumber);
                        }
                      }}
                      className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                        activeSeasonTab === s.seasonNumber
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <span>Season {s.seasonNumber}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                        {s.episodes?.length || 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Master-Detail Layout for Episodes */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 min-h-[300px]">
                {/* Left Column: Episodes List with Watch Progress Indicator */}
                <div className="md:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex flex-col space-y-2">
                  <div className="flex items-center justify-between px-1.5 pb-1 border-b border-slate-800/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <span>Episodes ({currentSeason?.episodes?.length || 0})</span>
                    <span className="text-[10px] text-purple-400 font-mono lowercase">Watched / Duration</span>
                  </div>

                  <div className="space-y-1.5 overflow-y-auto max-h-80 pr-1 flex-1">
                    {currentSeason?.episodes?.map((ep) => {
                      const isSelected = selectedEpisode?.episodeNumber === ep.episodeNumber;
                      const isTracked = trackedEpNum === ep.episodeNumber;
                      const prog = getEpisodeProgress(ep.episodeNumber);
                      const percent = prog ? prog.progress_percentage : 0;
                      const isComplete = prog ? Boolean(prog.is_completed) : false;
                      const watchedMins = prog ? Math.round(prog.playback_position_seconds / 60) : 0;
                      const totalMins = prog && prog.total_duration_seconds ? Math.round(prog.total_duration_seconds / 60) : 48;

                      return (
                        <div
                          key={ep.episodeNumber}
                          id={`episode-row-${ep.episodeNumber}`}
                          onClick={() => setSelectedEpisodeNumber(ep.episodeNumber)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1.5 ${
                            isSelected
                              ? 'bg-purple-950/50 border-purple-600 text-white shadow-md'
                              : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span
                                className={`w-6 h-6 rounded flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                                  isSelected
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-slate-800 text-purple-300 border border-purple-800/40'
                                }`}
                              >
                                {String(ep.episodeNumber).padStart(2, '0')}
                              </span>
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-semibold block truncate">
                                  {ep.title}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  S{String(activeSeasonTab).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                                  {ep.airDate ? ` • ${ep.airDate}` : ''}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                              {isComplete ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800/60 text-emerald-300 font-bold flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>{totalMins}m</span>
                                </span>
                              ) : watchedMins > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-800/60 text-indigo-300 font-mono">
                                  {watchedMins}/{totalMins}m ({percent}%)
                                </span>
                              ) : (
                                <span className="text-slate-500 font-mono">{totalMins}m</span>
                              )}
                              {ep.rating && (
                                <span className="text-[10px] font-bold text-amber-400">
                                  ★ {ep.rating}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Visual Progress Bar under each episode item */}
                          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800/80">
                            <div
                              className={`h-full transition-all duration-300 ${
                                isComplete
                                  ? 'bg-emerald-500'
                                  : percent > 0
                                  ? 'bg-indigo-500'
                                  : 'bg-transparent'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, isComplete ? 100 : percent))}%` }}
                            />
                          </div>

                          {/* Last Play Timestamp preview if recorded */}
                          {prog?.last_watched_at && (
                            <div className="text-[9px] text-slate-500 font-mono flex items-center justify-between">
                              <span>Played: {new Date(prog.last_watched_at).toLocaleDateString()} {new Date(prog.last_watched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {isTracked && <span className="text-emerald-400 font-bold">Updated ✓</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {(!currentSeason?.episodes || currentSeason.episodes.length === 0) && (
                      <div className="text-center py-8 text-slate-500 text-xs">
                        No episodes cataloged for Season {activeSeasonTab}.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Dedicated Episode Synopsis, Metadata & Watch Progress Manager */}
                <div className="md:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  {selectedEpisode ? (
                    <>
                      <div className="space-y-3">
                        {/* Episode Title & Metadata Header */}
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded bg-purple-900/60 text-purple-300 font-mono text-[11px] font-bold border border-purple-700/50">
                                Season {activeSeasonTab} • Episode {selectedEpisode.episodeNumber}
                              </span>
                              {selectedEpisode.airDate && (
                                <span className="text-[11px] text-slate-400">
                                  Air Date: <strong className="text-slate-200">{selectedEpisode.airDate}</strong>
                                </span>
                              )}
                            </div>
                            <h4 className="text-base font-bold text-white">
                              {selectedEpisode.title}
                            </h4>
                          </div>

                          {selectedEpisode.rating && (
                            <div className="px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-400 font-bold text-xs flex items-center gap-1 shrink-0">
                              <span>★ {selectedEpisode.rating}</span>
                            </div>
                          )}
                        </div>

                        {/* Watch Progress & SQLite Last Play Timestamp Manager */}
                        {(() => {
                          const prog = getEpisodeProgress(selectedEpisode.episodeNumber);
                          const currentPosSec = prog ? prog.playback_position_seconds : 0;
                          const totalSec = prog && prog.total_duration_seconds ? prog.total_duration_seconds : 2880;
                          const currentMins = Math.round(currentPosSec / 60);
                          const totalMins = Math.round(totalSec / 60);
                          const percent = prog ? prog.progress_percentage : 0;
                          const isDone = prog ? Boolean(prog.is_completed) : false;

                          return (
                            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>Episode Watch Tracking (SQLite Vault)</span>
                                </div>
                                <span className="font-mono text-[11px] font-bold text-indigo-300">
                                  {isDone ? '✓ Completed (100%)' : `${currentMins}m / ${totalMins}m (${percent}%)`}
                                </span>
                              </div>

                              {/* Interactive Progress Bar */}
                              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                                  }`}
                                  style={{ width: `${Math.min(100, isDone ? 100 : percent)}%` }}
                                />
                              </div>

                              {/* Watch Minute Control Steppers & Action Buttons */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateEpisodeWatchProgress(
                                        selectedEpisode,
                                        Math.max(0, currentMins + 10),
                                        totalMins,
                                        false
                                      )
                                    }
                                    className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
                                  >
                                    +10 min
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateEpisodeWatchProgress(
                                        selectedEpisode,
                                        Math.round(totalMins / 2),
                                        totalMins,
                                        false
                                      )
                                    }
                                    className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
                                  >
                                    Halfway (50%)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateEpisodeWatchProgress(
                                        selectedEpisode,
                                        totalMins,
                                        totalMins,
                                        true
                                      )
                                    }
                                    className="px-2 py-1 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Mark Watched</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateEpisodeWatchProgress(
                                        selectedEpisode,
                                        0,
                                        totalMins,
                                        false
                                      )
                                    }
                                    className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                                    title="Reset Progress"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {prog?.last_watched_at ? (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Last Play: <strong className="text-slate-200">{new Date(prog.last_watched_at).toLocaleString()}</strong>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic">Not played yet</span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Action Buttons for this episode */}
                        <div className="flex flex-wrap items-center gap-2">
                          {onPlayMedia && (
                            <button
                              type="button"
                              onClick={() => {
                                const prog = getEpisodeProgress(selectedEpisode.episodeNumber);
                                const currentMins = prog ? Math.round(prog.playback_position_seconds / 60) : 10;
                                handleUpdateEpisodeWatchProgress(selectedEpisode, currentMins || 10, 48, false);
                                onPlayMedia(media, selectedEpisode);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer shadow-sm"
                              title="Play this episode & update SQLite timestamp"
                            >
                              <Play className="w-3.5 h-3.5 fill-white" />
                              <span>Play Episode</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={generatingEpNum === selectedEpisode.episodeNumber}
                            onClick={() => handleGenerateEpisodeSynopsis(selectedEpisode)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 text-xs font-medium border border-purple-500/30 transition cursor-pointer"
                            title="Generate/Refine AI episode synopsis using Gemini"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${generatingEpNum === selectedEpisode.episodeNumber ? 'animate-spin' : ''}`} />
                            <span>{generatingEpNum === selectedEpisode.episodeNumber ? 'Generating...' : 'AI Synopsis'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (editingEpNum === selectedEpisode.episodeNumber) {
                                handleSaveCustomEpisodePlot(selectedEpisode);
                              } else {
                                setEditingEpNum(selectedEpisode.episodeNumber);
                                setCustomEpPlot(selectedEpisode.plot || '');
                              }
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
                            title="Edit episode plot manually"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{editingEpNum === selectedEpisode.episodeNumber ? 'Save Plot' : 'Edit Plot'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTrackEpisodeProgress(selectedEpisode)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                              trackedEpNum === selectedEpisode.episodeNumber
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white'
                            }`}
                            title="Record in SQLite as where you left off in this series"
                          >
                            {trackedEpNum === selectedEpisode.episodeNumber ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Saved!</span>
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-3.5 h-3.5" />
                                <span>Left Off</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyEpisodeNfo(selectedEpisode)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
                            title="Copy single episode XML NFO"
                          >
                            {copiedEpNfo ? (
                              <span className="text-emerald-400">Copied!</span>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Ep NFO</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Dedicated Synopsis Display & Editor */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                            Episode Synopsis & Storyline
                          </label>

                          {editingEpNum === selectedEpisode.episodeNumber ? (
                            <div className="space-y-2">
                              <textarea
                                rows={4}
                                value={customEpPlot}
                                onChange={(e) => setCustomEpPlot(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs leading-relaxed focus:outline-none focus:border-purple-500"
                                placeholder="Enter full episode plot / synopsis..."
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingEpNum(null)}
                                  className="px-3 py-1 rounded bg-slate-800 text-slate-400 hover:text-white text-xs cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveCustomEpisodePlot(selectedEpisode)}
                                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                                >
                                  Save Synopsis
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 text-slate-200 text-xs leading-relaxed font-normal">
                              {selectedEpisode.plot ? (
                                <p className="italic">
                                  "{selectedEpisode.plot}"
                                </p>
                              ) : (
                                <div className="text-slate-500 italic py-2 flex flex-col items-center justify-center gap-1 text-center">
                                  <span>No plot synopsis saved yet for this episode.</span>
                                  <span className="text-[11px] text-purple-400 not-italic">
                                    Click 'AI Synopsis' above to fetch with Gemini or 'Edit Plot' to add manually.
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Technical File Metadata Pane */}
                      <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-1 text-[11px] font-mono text-slate-400">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">File Pattern:</span>
                          <span className="text-slate-300 truncate max-w-[280px]">
                            {media.title} - S{String(activeSeasonTab).padStart(2, '0')}E{String(selectedEpisode.episodeNumber).padStart(2, '0')}.mkv
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span>Samba Share: {sambaConfig.share}</span>
                          <span className="text-emerald-400">Ready to Stream</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 text-xs">
                      <Tv className="w-8 h-8 text-slate-700 mb-2" />
                      <span>Select an episode on the left to inspect its synopsis and details.</span>
                    </div>
                  )}
                </div>
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
