import React, { useState } from 'react';
import {
  X,
  Search,
  Sparkles,
  Globe,
  Film,
  Tv,
  Check,
  Plus,
  Play,
  FileCode,
  Tag,
  Star,
  Calendar,
  Clock,
  HardDrive,
  CheckCircle2,
  FolderPlus,
  Compass,
  ArrowRight,
  ListFilter,
  AlertCircle,
  FileQuestion,
  ImageOff,
  RefreshCw,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import { MediaMetadata, MediaType } from '../types';

interface WebSearchCategorizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCategorizedMedia: (media: MediaMetadata) => void;
  onPlayMedia?: (media: MediaMetadata) => void;
  onOpenInNfoStudio?: (media: MediaMetadata) => void;
  onOpenManualMatch?: (media: MediaMetadata) => void;
  initialQuery?: string;
  initialType?: MediaType | 'all';
  mediaLibrary?: MediaMetadata[];
}

const POPULAR_SEARCH_PRESETS = [
  { name: 'Breaking Bad', type: 'series', category: 'Crime / Drama' },
  { name: '24', type: 'series', category: 'Action / Thriller' },
  { name: 'Severance', type: 'series', category: 'Sci-Fi' },
  { name: 'The Bear', type: 'series', category: 'Drama / Comedy' },
  { name: 'Ted Lasso', type: 'series', category: 'Comedy' },
  { name: 'Dune: Part Two', type: 'movie', category: 'Sci-Fi' },
  { name: 'Interstellar', type: 'movie', category: 'Sci-Fi' },
  { name: 'Succession', type: 'series', category: 'Drama' },
  { name: 'Oppenheimer', type: 'movie', category: 'Drama / Biography' },
  { name: 'Stranger Things', type: 'series', category: 'Sci-Fi / Horror' },
  { name: 'Arcane', type: 'series', category: 'Animation / Sci-Fi' },
  { name: 'The Office', type: 'series', category: 'Comedy' },
];

export const WebSearchCategorizerModal: React.FC<WebSearchCategorizerModalProps> = ({
  isOpen,
  onClose,
  onSaveCategorizedMedia,
  onPlayMedia,
  onOpenInNfoStudio,
  onOpenManualMatch,
  initialQuery = '',
  initialType = 'all',
  mediaLibrary = [],
}) => {
  const [activeTabFilter, setActiveTabFilter] = useState<'search' | 'uncategorized'>('search');
  const [uncatSubFilter, setUncatSubFilter] = useState<'all' | 'synopsis' | 'artwork' | 'series' | 'movie'>('all');
  const [uncatSearchQuery, setUncatSearchQuery] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchMessage, setBatchMessage] = useState<string | null>(null);

  const [query, setQuery] = useState(initialQuery);
  const [mediaType, setMediaType] = useState<MediaType | 'all'>(initialType);
  const [yearHint, setYearHint] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultData, setResultData] = useState<MediaMetadata | null>(null);
  const [detectedCategories, setDetectedCategories] = useState<string[]>([]);
  const [selectedPrimaryCategory, setSelectedPrimaryCategory] = useState<string>('Drama');
  const [isSaved, setIsSaved] = useState(false);
  const [showIncompleteList, setShowIncompleteList] = useState(false);

  // Synchronize when initialQuery or initialType changes
  React.useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
    if (initialType) {
      setMediaType(initialType);
    }
  }, [initialQuery, initialType]);

  const isMissingSynopsis = (m: MediaMetadata): boolean => {
    const text = (m.overview || (m as any).synopsis || '').trim();
    return !text || text.toLowerCase().includes('placeholder') || text.toLowerCase().includes('no synopsis');
  };

  const isMissingArtwork = (m: MediaMetadata): boolean => {
    return !m.posterUrl || m.posterUrl.trim() === '';
  };

  const incompleteItems = mediaLibrary.filter(
    (m) => isMissingSynopsis(m) || isMissingArtwork(m)
  );

  const missingSynopsisCount = incompleteItems.filter(isMissingSynopsis).length;
  const missingArtworkCount = incompleteItems.filter(isMissingArtwork).length;

  const seriesIncompleteCount = incompleteItems.filter((m) => m.type === 'series').length;
  const movieIncompleteCount = incompleteItems.filter((m) => m.type === 'movie').length;

  const filteredUncategorized = incompleteItems.filter((item) => {
    // Text search filter
    if (uncatSearchQuery.trim()) {
      const matchText = item.title.toLowerCase().includes(uncatSearchQuery.toLowerCase());
      if (!matchText) return false;
    }

    // Sub-category filter
    if (uncatSubFilter === 'synopsis') {
      return isMissingSynopsis(item);
    }
    if (uncatSubFilter === 'artwork') {
      return isMissingArtwork(item);
    }
    if (uncatSubFilter === 'series') {
      return item.type === 'series';
    }
    if (uncatSubFilter === 'movie') {
      return item.type === 'movie';
    }
    return true;
  });

  const handleBatchCategorizeAll = async () => {
    if (incompleteItems.length === 0 || batchProcessing) return;
    setBatchProcessing(true);
    setBatchProgress({ current: 0, total: incompleteItems.length });
    setBatchMessage(null);

    let successCount = 0;
    for (let i = 0; i < incompleteItems.length; i++) {
      const item = incompleteItems[i];
      setBatchProgress({ current: i + 1, total: incompleteItems.length });
      try {
        const res = await fetch('/api/metadata/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.title,
            type: item.type,
            year: item.year,
          }),
        });
        const text = await res.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        if (res.ok && data?.success && data?.data) {
          onSaveCategorizedMedia(data.data);
          successCount++;
        }
      } catch (e) {
        console.warn(`Failed to auto-categorize ${item.title}:`, e);
      }
    }

    setBatchProcessing(false);
    setBatchMessage(`Batch categorization complete! Updated ${successCount} of ${incompleteItems.length} items.`);
    setTimeout(() => setBatchMessage(null), 5000);
  };

  if (!isOpen) return null;

  const handleSearch = async (targetQuery?: string, targetType?: MediaType | 'all') => {
    const q = (targetQuery || query).trim();
    if (!q) {
      setErrorMsg('Please enter a movie or series title to categorize.');
      return;
    }

    setIsSearching(true);
    setErrorMsg(null);
    setIsSaved(false);

    try {
      const res = await fetch('/api/metadata/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: q,
          type: targetType || mediaType,
          year: yearHint ? parseInt(yearHint, 10) : undefined,
        }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseErr) {
        console.warn('Response parsing error:', parseErr);
      }

      if (!res.ok || !data?.success || !data?.data) {
        // Safe instant fallback: Check if query exists in media library or matching item
        const local = mediaLibrary.find(
          (m) => m.title.toLowerCase() === q.toLowerCase() || m.title.toLowerCase().includes(q.toLowerCase())
        );
        if (local) {
          setResultData(local);
          setDetectedCategories(local.genres || ['Drama']);
          setSelectedPrimaryCategory(local.genres?.[0] || 'Drama');
          return;
        }
        const errorString = data?.message || data?.error || 'Unable to retrieve media details';
        throw new Error(errorString);
      }

      const media: MediaMetadata = data.data;
      setResultData(media);
      setDetectedCategories(media.genres || ['Drama']);
      setSelectedPrimaryCategory(media.genres?.[0] || 'Drama');
    } catch (err: any) {
      console.error('Web categorization search error:', err);
      // Safe fallback if network/parsing failed: Check local library
      const local = mediaLibrary.find(
        (m) => m.title.toLowerCase() === q.toLowerCase() || m.title.toLowerCase().includes(q.toLowerCase())
      );
      if (local) {
        setResultData(local);
        setDetectedCategories(local.genres || ['Drama']);
        setSelectedPrimaryCategory(local.genres?.[0] || 'Drama');
      } else {
        const msg = typeof err?.message === 'string' ? err.message : 'Failed to perform web categorization';
        setErrorMsg(msg);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = async () => {
    if (!resultData) return;

    // Build finalized media metadata with assigned categories
    const updatedMedia: MediaMetadata = {
      ...resultData,
      genres: Array.from(new Set([selectedPrimaryCategory, ...(resultData.genres || [])])),
    };

    try {
      await fetch('/api/db/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: updatedMedia.id,
          media_type: updatedMedia.type,
          title: updatedMedia.title,
          original_title: updatedMedia.originalTitle || updatedMedia.title,
          synopsis: updatedMedia.overview,
          year: updatedMedia.year,
          rating: updatedMedia.rating,
          poster_url: updatedMedia.posterUrl,
          fanart_url: updatedMedia.fanartUrl,
          genres: JSON.stringify(updatedMedia.genres),
          cast: updatedMedia.cast ? JSON.stringify(updatedMedia.cast) : null,
          recommended_folder: updatedMedia.recommendedFolderStructure,
          raw_data: updatedMedia.source || 'web-categorizer'
        })
      });
    } catch (e) {
      console.error('Failed to save media asset to SQLite vault:', e);
    }

    onSaveCategorizedMedia(updatedMedia);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 2500);
  };

  const handleCategorizeAndPlay = () => {
    if (!resultData) return;
    const updatedMedia: MediaMetadata = {
      ...resultData,
      genres: Array.from(new Set([selectedPrimaryCategory, ...(resultData.genres || [])])),
    };
    onSaveCategorizedMedia(updatedMedia);
    if (onPlayMedia) {
      onPlayMedia(updatedMedia);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Web Search & Media Categorizer</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-950 border border-indigo-700/60 text-indigo-300">
                  AI Web Grounded
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Discover official genres, synopsis & Kodi/Plex file structures, or inspect uncategorized files.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Top View Switcher Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2.5 bg-slate-900/90 border-b border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTabFilter('search')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTabFilter === 'search'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search & Categorize</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabFilter('uncategorized')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTabFilter === 'uncategorized'
                ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-400/50'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5 text-amber-400" />
            <span>Uncategorized Media</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTabFilter === 'uncategorized'
                  ? 'bg-amber-950 text-amber-200'
                  : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
              }`}
            >
              {incompleteItems.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* TAB 1: DEDICATED UNCATEGORIZED MEDIA VIEW */}
          {activeTabFilter === 'uncategorized' && (
            <div className="space-y-4">
              {/* Header explanation & summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-950/20 border border-amber-800/40 rounded-xl">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Dedicated View Filter: Uncategorized Media</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    These {incompleteItems.length} files currently lack an official synopsis or artwork. Use one-click triggers to re-categorize or manually match.
                  </p>
                </div>

                {incompleteItems.length > 0 && (
                  <button
                    type="button"
                    disabled={batchProcessing}
                    onClick={handleBatchCategorizeAll}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {batchProcessing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing ({batchProgress.current}/{batchProgress.total})...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Auto-Categorize All ({incompleteItems.length})</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Batch feedback message */}
              {batchMessage && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{batchMessage}</span>
                </div>
              )}

              {/* Sub-Filters & Quick Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setUncatSubFilter('all')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      uncatSubFilter === 'all'
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    All ({incompleteItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setUncatSubFilter('synopsis')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      uncatSubFilter === 'synopsis'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    No Synopsis ({missingSynopsisCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setUncatSubFilter('artwork')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      uncatSubFilter === 'artwork'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    No Artwork ({missingArtworkCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setUncatSubFilter('series')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      uncatSubFilter === 'series'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Series ({seriesIncompleteCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setUncatSubFilter('movie')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      uncatSubFilter === 'movie'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Movies ({movieIncompleteCount})
                  </button>
                </div>

                {/* Search in uncategorized */}
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={uncatSearchQuery}
                    onChange={(e) => setUncatSearchQuery(e.target.value)}
                    placeholder="Filter by title..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Items List */}
              {filteredUncategorized.length === 0 ? (
                <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-xl space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div className="text-xs font-bold text-white">No items found matching this filter!</div>
                  <p className="text-[11px] text-slate-400">
                    All scanned library media have complete synopsis and artwork metadata.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {filteredUncategorized.map((item) => {
                    const isMissingSynopsis =
                      !item.synopsis ||
                      item.synopsis.trim() === '' ||
                      item.synopsis.toLowerCase().includes('placeholder') ||
                      item.synopsis.toLowerCase().includes('no synopsis');
                    const isMissingArtwork = !item.posterUrl || item.posterUrl.trim() === '';

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition"
                      >
                        {/* Media Item Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Thumbnail / Artwork Placeholder */}
                          <div className="w-11 h-14 rounded-lg bg-slate-950 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center relative">
                            {item.posterUrl && !isMissingArtwork ? (
                              <img
                                src={item.posterUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-slate-600">
                                <ImageOff className="w-4 h-4 text-amber-500/70 mb-0.5" />
                                <span className="text-[8px] font-mono">No Art</span>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white truncate max-w-xs sm:max-w-sm">
                                {item.title}
                              </span>
                              {item.year && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  ({item.year})
                                </span>
                              )}
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase ${
                                item.type === 'series'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                              }`}>
                                {item.type}
                              </span>
                            </div>

                            {/* Defect Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isMissingSynopsis && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950/80 border border-red-800/70 text-red-300 flex items-center gap-1 font-medium">
                                  <FileQuestion className="w-3 h-3" />
                                  <span>Missing Synopsis</span>
                                </span>
                              )}
                              {isMissingArtwork && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/80 border border-amber-800/70 text-amber-300 flex items-center gap-1 font-medium">
                                  <ImageOff className="w-3 h-3" />
                                  <span>Missing Artwork</span>
                                </span>
                              )}
                              {item.recommendedFolderStructure && (
                                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[200px] hidden md:inline">
                                  {item.recommendedFolderStructure}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* One-Click Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                          {/* 1. One-Click Re-Categorization flow */}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTabFilter('search');
                              setQuery(item.title);
                              setMediaType(item.type);
                              if (item.year) setYearHint(item.year.toString());
                              handleSearch(item.title, item.type);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                            title="One-click AI Web Search & Categorize"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Web Categorize</span>
                          </button>

                          {/* 2. One-Click Manual Match flow */}
                          {onOpenManualMatch && (
                            <button
                              type="button"
                              onClick={() => onOpenManualMatch(item)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-semibold transition border border-slate-700 flex items-center gap-1 cursor-pointer"
                              title="Manual TMDB Match & AI Synopsis"
                            >
                              <Tag className="w-3.5 h-3.5 text-amber-400" />
                              <span>Manual Match</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WEB SEARCH & CATEGORIZE VIEW */}
          {activeTabFilter === 'search' && (
            <>
              {/* Reminder banner for uncategorized media if any */}
              {incompleteItems.length > 0 && (
                <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span>{incompleteItems.length} library item(s) currently lack a synopsis or artwork</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('uncategorized')}
                    className="px-2.5 py-1 rounded-md bg-amber-900/60 hover:bg-amber-800/80 border border-amber-700/60 text-amber-200 text-xs font-bold transition cursor-pointer"
                  >
                    View Uncategorized Media →
                  </button>
                </div>
              )}

              {/* Search Inputs */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Severance, Ted Lasso, The Matrix, Dune, Succession..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">Auto Detect</option>
                  <option value="movie">Movie</option>
                  <option value="series">TV Series</option>
                  <option value="album">Music Album</option>
                </select>

                <input
                  type="number"
                  value={yearHint}
                  onChange={(e) => setYearHint(e.target.value)}
                  placeholder="Year (opt)"
                  className="w-24 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-center"
                />

                <button
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {isSearching ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Searching Web...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Search & Categorize</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Preset Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
              <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                <span>Try:</span>
              </span>
              {POPULAR_SEARCH_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setQuery(preset.name);
                    setMediaType(preset.type as any);
                    handleSearch(preset.name, preset.type as any);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[11px] font-medium transition cursor-pointer flex items-center gap-1"
                >
                  <span>{preset.name}</span>
                  <span className="text-[10px] text-indigo-400 opacity-80">({preset.category})</span>
                </button>
              ))}
            </div>
          </form>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
                ×
              </button>
            </div>
          )}

          {/* Search Result Card & Category Breakdown */}
          {resultData && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5 animate-in fade-in zoom-in-95 duration-200 shadow-xl">
              <div className="flex flex-col sm:flex-row gap-5">
                {/* Poster Artwork */}
                <div className="w-28 sm:w-36 h-40 sm:h-52 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 shadow-lg relative group">
                  <img
                    src={resultData.posterUrl}
                    alt={resultData.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-white font-bold text-[10px] uppercase">
                    {resultData.type}
                  </div>
                </div>

                {/* Details & Discovered Categories */}
                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                        <span>{resultData.title}</span>
                        <span className="text-sm text-slate-400 font-normal">({resultData.year})</span>
                      </h3>
                      {resultData.tagline && (
                        <p className="text-xs italic text-indigo-400 mt-0.5">"{resultData.tagline}"</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{resultData.rating?.toFixed(1) || '8.5'} / 10</span>
                    </div>
                  </div>

                  {/* Discovered Categories Section */}
                  <div className="space-y-1.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Discovered Categories & Genres:</span>
                      </span>
                      <span className="text-[11px] text-slate-400">Click to set primary</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {detectedCategories.map((genre) => {
                        const isPrimary = selectedPrimaryCategory === genre;
                        return (
                          <button
                            key={genre}
                            type="button"
                            onClick={() => setSelectedPrimaryCategory(genre)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                              isPrimary
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            <span>{genre}</span>
                            {isPrimary && <Check className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Synopsis */}
                  <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                    {resultData.overview}
                  </p>

                  {/* Meta Tags */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                    {resultData.directors && resultData.directors.length > 0 && (
                      <div>
                        <span className="text-slate-500">Director/Creator: </span>
                        <span className="text-slate-300 font-medium">{resultData.directors.join(', ')}</span>
                      </div>
                    )}
                    {resultData.studio && (
                      <div>
                        <span className="text-slate-500">Studio: </span>
                        <span className="text-slate-300 font-medium">{resultData.studio}</span>
                      </div>
                    )}
                    {resultData.certification && (
                      <div>
                        <span className="text-slate-500">Rating: </span>
                        <span className="text-slate-300 font-medium">{resultData.certification}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommended File & Directory Structure */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
                  <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Recommended Samba Share Path:</span>
                </div>
                <div className="font-mono text-emerald-400 text-[11px] truncate bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  {resultData.recommendedFolderStructure}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                      isSaved
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                    }`}
                  >
                    {isSaved ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Saved to Media Library!</span>
                      </>
                    ) : (
                      <>
                        <FolderPlus className="w-4 h-4" />
                        <span>Save & Download Assets to Vault</span>
                      </>
                    )}
                  </button>

                  {onPlayMedia && (
                    <button
                      onClick={handleCategorizeAndPlay}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-cyan-600/30 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Categorize & Play</span>
                    </button>
                  )}
                </div>

                {onOpenInNfoStudio && (
                  <button
                    onClick={() => {
                      onOpenInNfoStudio(resultData);
                      onClose();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Open in NFO Studio</span>
                  </button>
                )}
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
