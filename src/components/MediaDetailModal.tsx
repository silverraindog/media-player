import React, { useState, useEffect } from 'react';
import { apiCall } from '../lib/api';
import { X, Info, Wand2, Users, Award, Star, Clapperboard, Loader2, Search, Check, Image as ImageIcon } from 'lucide-react';
import { MediaMetadata, SambaConfig, EpisodeMetadata, TrackMetadata } from '../types';
import { RelatedContent } from './MediaDetailModal/RelatedContent';
import { SimilarMediaSection } from './MediaDetailModal/SimilarMediaSection';
import { EpisodeInspector } from './MediaDetailModal/EpisodeInspector';
import { MediaDetailHeader } from './MediaDetailModal/MediaDetailHeader';
import { MediaDetailFooter } from './MediaDetailModal/MediaDetailFooter';
import { TrackList } from './MediaDetailModal/TrackList';
import { VersionHub } from './MediaDetailModal/VersionHub';
import { generateMetadataFile } from '../utils/nfoGenerator';
import { sqliteBatchWriter } from '../services/sqliteBatchWriter';
import { downloadMediaBundleZip } from '../utils/zipDownloader';
import { resolveMediaWithFallback } from '../utils/clientMediaResolver';
import { saveMediaToTauriDb } from '../utils/tauriBridge';

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
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const [generatingEpNum, setGeneratingEpNum] = useState<number | null>(null);
  const [editingEpNum, setEditingEpNum] = useState<number | null>(null);
  const [customEpPlot, setCustomEpPlot] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'cast' | 'versions' | 'episodes' | 'tracks'>('overview');
  const [omdbCastData, setOmdbCastData] = useState<any>(null);
  const [isLoadingCast, setIsLoadingCast] = useState<boolean>(false);

  useEffect(() => {
    if (activeTab === 'cast' && !omdbCastData && !isLoadingCast) {
      setIsLoadingCast(true);
      fetch('/api/media/omdb-cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: media.title,
          type: media.type,
          year: media.year,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setOmdbCastData(data);
          } else {
            setOmdbCastData({ error: 'No OMDb cast data available.' });
          }
        })
        .catch((err) => {
          console.error('Failed to fetch OMDb cast:', err);
          setOmdbCastData({ error: 'Failed to fetch OMDb cast data.' });
        })
        .finally(() => setIsLoadingCast(false));
    }
  }, [activeTab, media.title, media.type, media.year]);

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

  // Picture / Poster search & replacement modal state
  const [isPictureSearchOpen, setIsPictureSearchOpen] = useState(false);
  const [pictureQuery, setPictureQuery] = useState('');
  const [isSearchingPics, setIsSearchingPics] = useState(false);
  const [foundPics, setFoundPics] = useState<string[]>([]);
  const [selectedPicUrl, setSelectedPicUrl] = useState('');
  const [customPicUrlInput, setCustomPicUrlInput] = useState('');
  const [picSaveSuccess, setPicSaveSuccess] = useState(false);

  const handleOpenPictureSearch = () => {
    setPictureQuery(media.title);
    setSelectedPicUrl(media.posterUrl || '');
    setCustomPicUrlInput(media.posterUrl || '');
    setFoundPics(media.posterUrl ? [media.posterUrl] : []);
    setIsPictureSearchOpen(true);
  };

  const handleExecutePictureSearch = async () => {
    const q = pictureQuery.trim() || media.title;
    if (!q) return;
    setIsSearchingPics(true);
    try {
      const data = await apiCall<{ success: boolean; posterUrl?: string; fanartUrl?: string; posters?: string[] }>('/api/media/fetch-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: q,
          type: media.type,
          year: media.year,
        }),
      });
      const list: string[] = [];
      if (Array.isArray(data?.posters)) {
        list.push(...data.posters);
      }
      if (data?.posterUrl && !list.includes(data.posterUrl)) {
        list.unshift(data.posterUrl);
      }
      if (data?.fanartUrl && !list.includes(data.fanartUrl)) {
        list.push(data.fanartUrl);
      }
      setFoundPics(list);
      if (list.length > 0 && !selectedPicUrl) {
        setSelectedPicUrl(list[0]);
      }
    } catch (err) {
      console.error('Failed to search pictures:', err);
    } finally {
      setIsSearchingPics(false);
    }
  };

  const handleSavePictureChoice = async () => {
    const finalUrl = (customPicUrlInput.trim() || selectedPicUrl.trim()).trim();
    if (!finalUrl) return;

    const updated: MediaMetadata = {
      ...media,
      posterUrl: finalUrl,
    };
    setMedia(updated);
    if (onUpdateMedia) {
      onUpdateMedia(updated);
    }
    await persistMediaChange(updated);
    setPicSaveSuccess(true);
    setTimeout(() => {
      setPicSaveSuccess(false);
      setIsPictureSearchOpen(false);
    }, 800);
  };

  const persistMediaChange = async (updated: MediaMetadata) => {
    try {
      // 1. Immediately notify parent component / App.tsx
      if (onUpdateMedia) {
        onUpdateMedia(updated);
      }

      // 2. Persist to LocalStorage
      try {
        const stored = JSON.parse(localStorage.getItem('sambavault_media_library_v2') || '[]');
        const idx = stored.findIndex((m: any) => m.id === updated.id || m.title?.toLowerCase() === updated.title?.toLowerCase());
        if (idx >= 0) stored[idx] = updated;
        else stored.unshift(updated);
        localStorage.setItem('sambavault_media_library_v2', JSON.stringify(stored));
      } catch (e) {}

      // 3. Persist to Tauri SQLite
      saveMediaToTauriDb(updated).catch(() => {});

      // 4. Save to server SQLite vault
      await apiCall('/api/db/media', {
        method: 'POST',
        body: JSON.stringify({
          id: updated.id,
          media_type: updated.type,
          title: updated.title,
          original_title: updated.originalTitle || updated.title,
          synopsis: updated.overview || (updated as any).synopsis || '',
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
      let data: any = null;
      try {
        data = await apiCall<any>('/api/metadata/generate-synopsis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: media.title,
            type: media.type,
            year: media.year,
          }),
        });
      } catch (err) {
        console.warn('apiCall generate-synopsis failed, falling back to client resolver:', err);
      }

      if (!data || !data.overview) {
        const resolved = await resolveMediaWithFallback(media.title, media.type, media.year);
        if (resolved) {
          data = resolved;
        }
      }

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

  const handleForceRefresh = async () => {
    if (isForceRefreshing) return;
    setIsForceRefreshing(true);
    try {
      const cacheKey = media.recommendedFolderStructure || media.title;
      await fetch(`/api/thumbnails/cache?path=${encodeURIComponent(cacheKey)}`, {
        method: 'DELETE',
      }).catch(() => {});

      let refreshedData: any = null;

      try {
        let fetchUrl = '/api/metadata/categorize';
        if (window.location.origin.includes('tauri://') || (window as any).__TAURI__) {
          fetchUrl = 'http://127.0.0.1:3000/api/metadata/categorize';
        }

        const res = await fetch(fetchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: media.title,
            type: media.type,
            year: media.year,
            forceRefresh: true,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const json = await res.json();
          if (json && json.success && json.data) {
            refreshedData = json.data;
          }
        }
      } catch (directErr) {
        console.warn('Direct server force refresh failed, falling back to client media resolver:', directErr);
      }

      if (!refreshedData) {
        refreshedData = await resolveMediaWithFallback(media.title, media.type, media.year);
      }

      if (refreshedData) {
        const refreshed: MediaMetadata = {
          ...media,
          ...refreshedData,
          id: media.id,
        };
        setMedia(refreshed);
        if (onUpdateMedia) onUpdateMedia(refreshed);
        persistMediaChange(refreshed);
        setProgressSaveNotice('Cache bypassed & metadata forcefully refreshed from web!');
        setTimeout(() => setProgressSaveNotice(null), 4000);
      }
    } catch (err) {
      console.error('Force refresh failed:', err);
      setProgressSaveNotice('Force refresh failed.');
      setTimeout(() => setProgressSaveNotice(null), 4000);
    } finally {
      setIsForceRefreshing(false);
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
          onForceRefresh={handleForceRefresh}
          isForceRefreshing={isForceRefreshing}
          onSearchPicture={handleOpenPictureSearch}
        />

        {/* Picture Search & Custom Cover Selection Modal */}
        {isPictureSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Search & Select Picture for "{media.title}"</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPictureSearchOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pictureQuery}
                    onChange={(e) => setPictureQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleExecutePictureSearch();
                      }
                    }}
                    placeholder="Search by title or keyword..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    disabled={isSearchingPics || !pictureQuery.trim()}
                    onClick={handleExecutePictureSearch}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Search className={`w-3.5 h-3.5 ${isSearchingPics ? 'animate-spin' : ''}`} />
                    <span>{isSearchingPics ? 'Searching...' : 'Search'}</span>
                  </button>
                </div>

                {/* Picture options grid */}
                {foundPics.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Select a Picture:
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                      {foundPics.map((url, idx) => {
                        const isChosen = (selectedPicUrl === url) || (customPicUrlInput === url);
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setSelectedPicUrl(url);
                              setCustomPicUrlInput(url);
                            }}
                            className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition aspect-[2/3] bg-slate-900 group ${
                              isChosen
                                ? 'border-cyan-400 ring-2 ring-cyan-500/50 shadow-lg'
                                : 'border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            <img src={url} alt={`Option ${idx + 1}`} className="w-full h-full object-cover" />
                            {isChosen && (
                              <div className="absolute top-1.5 right-1.5 bg-cyan-500 text-black p-0.5 rounded-full">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Direct Custom Image URL Input */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 block">
                    Or paste direct image URL:
                  </label>
                  <input
                    type="text"
                    value={customPicUrlInput}
                    onChange={(e) => {
                      setCustomPicUrlInput(e.target.value);
                      setSelectedPicUrl(e.target.value);
                    }}
                    placeholder="https://... (direct image URL)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Selected Preview */}
                {(customPicUrlInput || selectedPicUrl) && (
                  <div className="flex items-center gap-3 p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                    <img
                      src={customPicUrlInput || selectedPicUrl}
                      alt="Chosen preview"
                      className="w-12 h-16 object-cover rounded-lg border border-slate-700 shrink-0"
                    />
                    <div className="text-xs text-slate-300 truncate">
                      <span className="text-cyan-400 font-semibold block">Selected Artwork</span>
                      <span className="text-[11px] text-slate-400 truncate block font-mono">{customPicUrlInput || selectedPicUrl}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsPictureSearchOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!customPicUrlInput.trim() && !selectedPicUrl.trim()}
                  onClick={handleSavePictureChoice}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-cyan-600/30 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{picSaveSuccess ? 'Saved Picture!' : 'Save Picture to Media'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 bg-slate-900 border-b border-slate-800 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('cast')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'cast'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>Cast & Crew</span>
          </button>
          <button
            onClick={() => setActiveTab('versions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'versions'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
            }`}
          >
            <Clapperboard className="w-3.5 h-3.5 text-purple-400" />
            <span>Versions</span>
          </button>
          {media.type === 'series' && media.seasons && media.seasons.length > 0 && (
            <button
              onClick={() => setActiveTab('episodes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'episodes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
              }`}
            >
              <span>Episodes</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('tracks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tracks'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
            }`}
          >
            <span>Audio & Subtitles</span>
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {activeTab === 'overview' && (
            <>
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

              <RelatedContent
                media={media}
                mediaLibrary={mediaLibrary}
                setMedia={setMedia}
                setActiveSeasonTab={setActiveSeasonTab}
                setSelectedEpisodeNumber={setSelectedEpisodeNumber}
                onSelectMedia={onSelectMedia}
              />

              <SimilarMediaSection
                media={media}
                mediaLibrary={mediaLibrary}
                setMedia={setMedia}
                setActiveSeasonTab={setActiveSeasonTab}
                setSelectedEpisodeNumber={setSelectedEpisodeNumber}
                onSelectMedia={onSelectMedia}
              />
            </>
          )}

          {activeTab === 'cast' && (
            <div className="space-y-5 bg-slate-950/60 p-5 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span>OMDb Cast, Director & Crew Directory</span>
                </span>
                <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950/60 px-2.5 py-1 rounded-md border border-indigo-800/40">
                  Live OMDb Feed
                </span>
              </div>

              {isLoadingCast && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <span className="text-xs font-medium">Querying OMDB API for cast and director records...</span>
                </div>
              )}

              {omdbCastData?.error && (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs">
                  {omdbCastData.error} (Displaying standard vault metadata cast list below)
                </div>
              )}

              {omdbCastData && !omdbCastData.error && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Director</span>
                    <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Clapperboard className="w-4 h-4 text-indigo-400" />
                      {omdbCastData.director || 'N/A'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Writer / Creator</span>
                    <span className="text-sm font-semibold text-white">
                      {omdbCastData.writer || 'N/A'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">IMDb Rating & Votes</span>
                    <span className="text-sm font-semibold text-amber-300 flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      {omdbCastData.imdbRating || 'N/A'} <span className="text-xs text-slate-400 font-normal">({omdbCastData.imdbVotes || '0'} votes)</span>
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Awards & Honors</span>
                    <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                      {omdbCastData.awards || 'None specified'}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Main Cast / Actors
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {((omdbCastData?.castMembers && omdbCastData.castMembers.filter((c: any) => c.role === 'Actor')) || media.cast || []).map((member: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-2 shadow-sm">
                      <div className="w-10 h-10 rounded-full bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-300 font-bold text-sm">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <span className="text-slate-100 font-semibold text-xs block truncate">{member.name}</span>
                        <span className="text-slate-400 text-[11px] block truncate">{member.role || 'Actor'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <VersionHub media={media} handleSelectVersionBranch={handleSelectVersionBranch} />
          )}

          {activeTab === 'episodes' && media.type === 'series' && media.seasons && media.seasons.length > 0 && (
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

          {activeTab === 'tracks' && (
            <TrackList media={media} onPlayMedia={onPlayMedia} />
          )}
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
