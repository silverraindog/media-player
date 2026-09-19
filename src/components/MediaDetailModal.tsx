import React, { useState, useEffect } from 'react';
import { apiCall } from '../lib/api';
import { X, Info, Wand2 } from 'lucide-react';
import { MediaMetadata, SambaConfig, EpisodeMetadata, TrackMetadata } from '../types';
import { RelatedContent } from './MediaDetailModal/RelatedContent';
import { EpisodeInspector } from './MediaDetailModal/EpisodeInspector';
import { MediaDetailHeader } from './MediaDetailModal/MediaDetailHeader';
import { MediaDetailFooter } from './MediaDetailModal/MediaDetailFooter';
import { TrackList } from './MediaDetailModal/TrackList';
import { VersionHub } from './MediaDetailModal/VersionHub';
import { generateMetadataFile } from '../utils/nfoGenerator';
import { sqliteBatchWriter } from '../services/sqliteBatchWriter';
import { downloadMediaBundleZip } from '../utils/zipDownloader';

interface MediaDetailModalProps {
  media: MediaMetadata | null;
  onClose: () => void;
  onPushToSamba: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
  onPlayMedia?: (media: MediaMetadata, episode?: EpisodeMetadata, track?: TrackMetadata) => void;
  onUpdateMedia?: (media: MediaMetadata) => void;
  onOpenManualMatcher?: (media: MediaMetadata) => void;
  sambaConfig: SambaConfig;
  mediaLibrary?: MediaMetadata[];
  onSelectMedia?: (media: MediaMetadata) => void;
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
  mediaLibrary,
  onSelectMedia,
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
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [isGeneratingFanart, setIsGeneratingFanart] = useState(false);
  const [isFetchingArt, setIsFetchingArt] = useState(false);
  const [generatingEpNum, setGeneratingEpNum] = useState<number | null>(null);
  const [editingEpNum, setEditingEpNum] = useState<number | null>(null);
  const [customEpPlot, setCustomEpPlot] = useState<string>('');

  const [autoRemoveWatchlist, setAutoRemoveWatchlist] = useState<boolean>(() => {
    return localStorage.getItem(`autoRemove_${media?.id}`) === 'true';
  });

  const handleToggleAutoRemove = () => {
    const next = !autoRemoveWatchlist;
    setAutoRemoveWatchlist(next);
    if (media?.id) {
      localStorage.setItem(`autoRemove_${media.id}`, String(next));
    }
  };

  const persistMediaChange = async (updated: MediaMetadata) => {
    try {
      await apiCall('/api/db/media', {
        method: 'POST',
        body: JSON.stringify({
          id: updated.id,
          media_type: updated.type,
          title: updated.title,
          original_title: updated.originalTitle || updated.title,
          synopsis: updated.overview,
          year: updated.year,
          rating: updated.rating,
          poster_url: updated.posterUrl,
          fanart_url: updated.fanartUrl,
          genres: JSON.stringify(updated.genres),
          cast: updated.cast ? JSON.stringify(updated.cast) : null,
          recommended_folder: updated.recommendedFolderStructure,
          raw_data: updated.source || 'gemini-ai'
        })
      });
    } catch (err) {
      console.error('Failed to persist media change to database:', err);
    }
  };

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
    currentSeason?.episodes?.[0] || null;

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

  const handleSelectVersionBranch = (versionId: string) => {
    const selectedBranch = media.versions?.find((v) => v.id === versionId);
    if (!selectedBranch) return;

    let targetMedia: MediaMetadata | undefined = selectedBranch.media;
    if (!targetMedia && mediaLibrary) {
      targetMedia = mediaLibrary.find(
        (m) => m.id === versionId || m.title.toLowerCase() === selectedBranch.title.toLowerCase()
      );
    }

    if (targetMedia) {
      const updatedMedia: MediaMetadata = {
        ...targetMedia,
        versions: media.versions,
        selectedVersionId: versionId,
        isMultiVersion: true,
      };
      setMedia(updatedMedia);
      setActiveSeasonTab(updatedMedia.seasons?.[0]?.seasonNumber || 1);
      if (updatedMedia.seasons?.[0]?.episodes?.[0]) {
        setSelectedEpisodeNumber(updatedMedia.seasons[0].episodes[0].episodeNumber);
      }
      if (onSelectMedia) onSelectMedia(updatedMedia);
      if (onUpdateMedia) onUpdateMedia(updatedMedia);
    }
  };

  const handleSaveToSqlite = async () => {
    try {
      sqliteBatchWriter.enqueue(media);
      const res = await sqliteBatchWriter.flushNow();
      if (res.success) {
        setIsSavedSqlite(true);
        setTimeout(() => setIsSavedSqlite(false), 3000);
      }
    } catch (err) {
      console.error('Error saving to SQLite:', err);
    }
  };

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
      const isComplete = markCompleted || percentage >= 95;

      if (isComplete && autoRemoveWatchlist) {
        await fetch('/api/db/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ media_id: media.id, title: media.title, type: media.type, year: media.year, poster_url: media.posterUrl }),
        }).catch(() => {});
        await fetch(`/api/db/watchlist/${encodeURIComponent(media.id)}`, {
          method: 'DELETE',
        }).catch(() => {});
      }

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

  const getEpisodeProgress = (epNum: number) => {
    const key = `s${activeSeasonTab}-e${epNum}`;
    return episodeProgressMap[key] || null;
  };

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
            posterUrl: json.data.posterUrl || media.posterUrl,
            fanartUrl: json.data.fanartUrl || media.fanartUrl,
            cast: json.data.cast || media.cast,
          };
          setMedia(updated);
          if (onUpdateMedia) onUpdateMedia(updated);
          persistMediaChange(updated);
        }
      }
    } catch (err) {
      console.error('Failed to regenerate main synopsis:', err);
    } finally {
      setIsGeneratingSynopsis(false);
    }
  };

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
          persistMediaChange(updated);
        }
      }
    } catch (err) {
      console.error('Failed to generate episode synopsis:', err);
    } finally {
      setGeneratingEpNum(null);
    }
  };

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
    persistMediaChange(updated);
    setEditingEpNum(null);
  };

  const handleGenerateFanart = async () => {
    setIsGeneratingFanart(true);
    try {
      const data = await apiCall<{ success: boolean; url: string }>('/api/media/generate-fanart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: media.title,
          overview: media.overview,
          mediaPath: media.path,
          type: media.type,
        }),
      });

      if (data && data.success) {
        const updated: MediaMetadata = {
          ...media,
          fanartUrl: data.url,
        };
        setMedia(updated);
        if (onUpdateMedia) onUpdateMedia(updated);
        persistMediaChange(updated);
      }
    } catch (err) {
      console.error('Fanart generation failed:', err);
    } finally {
      setIsGeneratingFanart(false);
    }
  };

  const handleFetchOfficialArt = async () => {
    setIsFetchingArt(true);
    try {
      const data = await apiCall<{ success: boolean; posterUrl?: string; fanartUrl?: string }>('/api/media/fetch-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: media.title,
          type: media.type,
          year: media.year,
        }),
      });

      if (data && data.success && data.posterUrl) {
        const updated: MediaMetadata = {
          ...media,
          posterUrl: data.posterUrl,
          fanartUrl: data.fanartUrl || media.fanartUrl || data.posterUrl,
        };
        setMedia(updated);
        if (onUpdateMedia) onUpdateMedia(updated);
        persistMediaChange(updated);
      }
    } catch (err) {
      console.error('Fetch official artwork failed:', err);
    } finally {
      setIsFetchingArt(false);
    }
  };

  const handleBulkRefresh = async () => {
    setIsBulkRefreshing(true);
    try {
      const data = await apiCall<any>('/api/metadata/generate-synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: media.title,
          type: media.type,
          year: media.year,
        }),
      });

      if (data) {
        const updated: MediaMetadata = {
          ...media,
          overview: data.overview || media.overview,
          tagline: data.tagline || media.tagline,
          genres: data.genres || media.genres,
          rating: data.rating || media.rating,
          runtime: data.runtime || media.runtime,
          certification: data.certification || media.certification,
          posterUrl: data.posterUrl || media.posterUrl,
          fanartUrl: data.fanartUrl || media.fanartUrl,
          cast: data.cast || media.cast,
          seasons: data.seasons || media.seasons,
        };
        setMedia(updated);
        if (onUpdateMedia) onUpdateMedia(updated);
        persistMediaChange(updated);
        
        // Reset season/episode selection if needed
        if (updated.seasons && updated.seasons.length > 0) {
          setActiveSeasonTab(updated.seasons[0].seasonNumber);
          if (updated.seasons[0].episodes && updated.seasons[0].episodes.length > 0) {
            setSelectedEpisodeNumber(updated.seasons[0].episodes[0].episodeNumber);
          }
        }
      }
    } catch (err) {
      console.error('Bulk refresh failed:', err);
    } finally {
      setIsBulkRefreshing(false);
    }
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

        <MediaDetailHeader 
          media={media}
          onPlayMedia={onPlayMedia}
          onOpenManualMatcher={onOpenManualMatcher}
          onClose={onClose}
          handleSelectVersionBranch={handleSelectVersionBranch}
          onBulkRefresh={handleBulkRefresh}
          isRefreshing={isBulkRefreshing}
          onGenerateFanart={handleGenerateFanart}
          isGeneratingFanart={isGeneratingFanart}
          onFetchOfficialArt={handleFetchOfficialArt}
          isFetchingArt={isFetchingArt}
        />

        {/* Modal Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Overview & Synopsis Section */}
          <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-400" />
                <span>Synopsis & Overview</span>
              </span>
              <button
                type="button"
                disabled={isGeneratingSynopsis}
                onClick={handleRegenerateMainSynopsis}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30 transition cursor-pointer"
              >
                <Wand2 className={`w-3 h-3 ${isGeneratingSynopsis ? 'animate-spin' : ''}`} />
                <span>{isGeneratingSynopsis ? 'Generating Synopsis...' : 'AI Enrich'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  className="form-checkbox rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-950 transition-all cursor-pointer"
                  checked={autoRemoveWatchlist}
                  onChange={handleToggleAutoRemove}
                />
                <span>Auto-remove from Watchlist after watching</span>
              </label>
            </div>

            {media.tagline && (
              <p className="text-indigo-300 italic font-medium text-xs">"{media.tagline}"</p>
            )}

            <p className="text-slate-200 leading-relaxed text-xs sm:text-sm font-normal">
              {media.overview}
            </p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {media.genres.map((g, i) => (
                <span key={i} className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 text-[11px]">
                  {g}
                </span>
              ))}
            </div>

            {media.cast && media.cast.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-800/40">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Featured Cast
                </span>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {media.cast.slice(0, 8).map((member, idx) => (
                    <div key={idx} className="flex flex-col min-w-[80px]">
                      <span className="text-slate-200 font-medium text-[12px]">{member.name}</span>
                      <span className="text-slate-500 text-[10px]">{member.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <VersionHub media={media} handleSelectVersionBranch={handleSelectVersionBranch} />

          <RelatedContent
            media={media}
            mediaLibrary={mediaLibrary}
            setMedia={setMedia}
            setActiveSeasonTab={setActiveSeasonTab}
            setSelectedEpisodeNumber={setSelectedEpisodeNumber}
            onSelectMedia={onSelectMedia}
          />

          {media.type === 'series' && media.seasons && media.seasons.length > 0 && (
            <EpisodeInspector
              media={media}
              activeSeasonTab={activeSeasonTab}
              setActiveSeasonTab={setActiveSeasonTab}
              setSelectedEpisodeNumber={setSelectedEpisodeNumber}
              selectedEpisode={selectedEpisode}
              trackedEpNum={trackedEpNum}
              getEpisodeProgress={getEpisodeProgress}
              onPlayMedia={onPlayMedia}
              handleGenerateEpisodeSynopsis={handleGenerateEpisodeSynopsis}
              handleSaveCustomEpisodePlot={handleSaveCustomEpisodePlot}
              handleUpdateEpisodeWatchProgress={handleUpdateEpisodeWatchProgress}
              handleTrackEpisodeProgress={handleTrackEpisodeProgress}
              handleCopyEpisodeNfo={handleCopyEpisodeNfo}
              editingEpNum={editingEpNum}
              setEditingEpNum={setEditingEpNum}
              customEpPlot={customEpPlot}
              setCustomEpPlot={setCustomEpPlot}
              generatingEpNum={generatingEpNum}
              copiedEpNfo={copiedEpNfo}
              sambaConfig={sambaConfig}
            />
          )}

          <TrackList media={media} onPlayMedia={onPlayMedia} />
        </div>

        <MediaDetailFooter 
          media={media}
          handleCopyNfo={handleCopyNfo}
          copiedNfo={copiedNfo}
          handleSaveToSqlite={handleSaveToSqlite}
          isSavedSqlite={isSavedSqlite}
          onOpenInNfoStudio={onOpenInNfoStudio}
          onClose={onClose}
          handlePush={handlePush}
          isPushed={isPushed}
          downloadMediaBundleZip={downloadMediaBundleZip}
        />
      </div>
    </div>
  );
};
