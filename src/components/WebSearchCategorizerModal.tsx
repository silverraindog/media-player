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
  FolderOpen,
  FolderSync,
} from 'lucide-react';
import { MediaMetadata, MediaType, SambaShareNode } from '../types';
import { resolveMediaWithFallback } from '../utils/clientMediaResolver';
import {
  fetchSecondaryMetadata,
  findUnimportedUnsortedNodes,
  isMediaInUnsortedPath,
  isMediaMissingArtwork,
  isMediaMissingGenres,
  isMediaMissingSynopsis,
  isMediaUncategorized,
  nodeToMediaMetadata,
} from '../utils/mediaExtractor';
import { categorizeMediaWithRetry } from '../utils/metadataCategorizer';

interface WebSearchCategorizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCategorizedMedia: (media: MediaMetadata) => void;
  onImportMediaBatch?: (items: MediaMetadata[]) => void;
  onPlayMedia?: (media: MediaMetadata) => void;
  onOpenInNfoStudio?: (media: MediaMetadata) => void;
  onOpenManualMatch?: (media: MediaMetadata) => void;
  onOpenApiDebugger?: () => void;
  onOpenClassifierModal?: () => void;
  initialQuery?: string;
  initialType?: MediaType | 'all';
  mediaLibrary?: MediaMetadata[];
  sambaTree?: SambaShareNode[];
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
  onImportMediaBatch,
  onPlayMedia,
  onOpenInNfoStudio,
  onOpenManualMatch,
  onOpenApiDebugger,
  onOpenClassifierModal,
  initialQuery = '',
  initialType = 'all',
  mediaLibrary = [],
  sambaTree = [],
}) => {
  const [activeTabFilter, setActiveTabFilter] = useState<'search' | 'uncategorized'>('search');
  const [uncatSubFilter, setUncatSubFilter] = useState<'all' | 'unsorted' | 'synopsis' | 'artwork' | 'genres' | 'series' | 'movie' | 'album'>('all');
  const [uncatSearchQuery, setUncatSearchQuery] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [activeSourceItem, setActiveSourceItem] = useState<MediaMetadata | null>(null);
  const [showAllLibraryInUncat, setShowAllLibraryInUncat] = useState(false);

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

  interface ApiLogEntry {
    id: string;
    timestamp: string;
    method: string;
    url: string;
    requestBody?: any;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    responseBody?: any;
    error?: string;
  }
  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([]);
  const [showLogsPanel, setShowLogsPanel] = useState(false);

  const performLoggedFetch = async (url: string, options: RequestInit) => {
    const startTime = new Date().toISOString();
    const reqBody = options.body ? JSON.parse(options.body as string) : undefined;
    try {
      let targetUrl = url;
      // In Tauri desktop environment, check if local Node server is running on port 3000
      const isTauriEnv = window.location.protocol === 'tauri:' || 
                         window.location.origin.includes('tauri.localhost') || 
                         (window as any).__TAURI__;
      const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';

      if (url.startsWith('/api/') && isTauriEnv && !isHttp) {
        try {
          // Probe local port 3000
          const testRes = await fetch(`http://127.0.0.1:3000${url}`, { ...options, signal: AbortSignal.timeout(1000) });
          const contentType = testRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            targetUrl = `http://127.0.0.1:3000${url}`;
          }
        } catch {
          // Local server port 3000 not listening or timed out, fallback to current origin
        }
      }

      const res = await fetch(targetUrl, options);
      const status = res.status;
      const statusText = res.statusText;
      const headersObj: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headersObj[key] = val;
      });
      const text = await res.text();
      let parsedBody: any;
      try {
        parsedBody = text ? JSON.parse(text) : null;
      } catch {
        parsedBody = text;
      }

      setApiLogs((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: startTime,
          method: options.method || 'GET',
          url: targetUrl,
          requestBody: reqBody,
          status,
          statusText,
          headers: headersObj,
          responseBody: parsedBody,
        },
        ...prev.slice(0, 49),
      ]);

      return {
        ok: res.ok,
        status,
        statusText,
        headers: res.headers,
        text: () => Promise.resolve(text),
        json: () => Promise.resolve(parsedBody),
        data: parsedBody,
      };
    } catch (err: any) {
      setApiLogs((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: startTime,
          method: options.method || 'GET',
          url,
          requestBody: reqBody,
          status: 500,
          statusText: 'Network Error',
          headers: {},
          error: err?.message || String(err),
        },
        ...prev.slice(0, 49),
      ]);
      throw err;
    }
  };

  // Synchronize when initialQuery or initialType changes
  React.useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
    if (initialType) {
      setMediaType(initialType);
    }
  }, [initialQuery, initialType]);

  const incompleteItems = mediaLibrary.filter(isMediaUncategorized);
  const sourceUncatList = showAllLibraryInUncat ? mediaLibrary : incompleteItems;

  const unsortedPathCount = incompleteItems.filter(isMediaInUnsortedPath).length;
  const missingSynopsisCount = incompleteItems.filter(isMediaMissingSynopsis).length;
  const missingArtworkCount = incompleteItems.filter(isMediaMissingArtwork).length;
  const missingGenresCount = incompleteItems.filter(isMediaMissingGenres).length;

  const unimportedUnsorted = React.useMemo(
    () => findUnimportedUnsortedNodes(sambaTree, mediaLibrary),
    [sambaTree, mediaLibrary]
  );

  const handleImportUnsortedFromTree = () => {
    if (unimportedUnsorted.fileNodes.length === 0) return;
    const extracted: MediaMetadata[] = [];
    for (const entry of unimportedUnsorted.fileNodes) {
      const converted = nodeToMediaMetadata(entry.node, entry.parentPath);
      if (converted) {
        extracted.push({
          ...converted,
          status: 'uncategorized',
        });
      }
    }
    if (extracted.length > 0) {
      if (onImportMediaBatch) {
        onImportMediaBatch(extracted);
      } else {
        extracted.forEach((item) => onSaveCategorizedMedia(item));
      }
      setBatchMessage(`Imported ${extracted.length} media item(s) from Unsorted / Staging folders for categorization.`);
      setUncatSubFilter('unsorted');
      setShowAllLibraryInUncat(false);
    }
  };

  const seriesIncompleteCount = sourceUncatList.filter((m) => m.type === 'series').length;
  const movieIncompleteCount = sourceUncatList.filter((m) => m.type === 'movie').length;
  const albumIncompleteCount = sourceUncatList.filter((m) => m.type === 'album').length;

  const filteredUncategorized = sourceUncatList.filter((item) => {
    // Text search filter
    if (uncatSearchQuery.trim()) {
      const qLower = uncatSearchQuery.toLowerCase();
      const matchText =
        item.title.toLowerCase().includes(qLower) ||
        (item.folderPath || '').toLowerCase().includes(qLower) ||
        (item.recommendedFolderStructure || '').toLowerCase().includes(qLower);
      if (!matchText) return false;
    }

    // Sub-category filter
    if (uncatSubFilter === 'unsorted') {
      return isMediaInUnsortedPath(item);
    }
    if (uncatSubFilter === 'synopsis') {
      return isMediaMissingSynopsis(item);
    }
    if (uncatSubFilter === 'artwork') {
      return isMediaMissingArtwork(item);
    }
    if (uncatSubFilter === 'genres') {
      return isMediaMissingGenres(item);
    }
    if (uncatSubFilter === 'series') {
      return item.type === 'series';
    }
    if (uncatSubFilter === 'movie') {
      return item.type === 'movie';
    }
    if (uncatSubFilter === 'album') {
      return item.type === 'album';
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
        const itemData = await categorizeMediaWithRetry(
          item.title,
          item.type,
          item.year,
          { maxRetries: 2, timeoutMs: 7000 }
        ) || await resolveMediaWithFallback(item.title, item.type, item.year);

        if (itemData) {
          onSaveCategorizedMedia({
            ...item,
            ...itemData,
            id: item.id,
            title: item.title,
            folderPath: item.folderPath || itemData.recommendedFolderStructure,
            path: item.path || itemData.path,
            playbackUrl: item.playbackUrl || itemData.playbackUrl,
            collectionNames: item.collectionNames || itemData.collectionNames,
            status: 'categorized',
          });
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
      const parsedYear = yearHint ? parseInt(yearHint, 10) : undefined;
      let media: MediaMetadata | null = await categorizeMediaWithRetry(
        q,
        targetType || mediaType,
        parsedYear,
        { maxRetries: 3, timeoutMs: 9000 }
      );

      if (!media) {
        // Safe and resilient fallback: Primary API failed, returned 404/500, or HTML SPA redirect
        // Activate secondary metadata fetcher (TVMaze / TMDB fallback) to resolve titles
        console.info(`[Media Resolver] Primary endpoint returned non-JSON / HTML / incomplete for "${q}". Activating secondary metadata fetcher (TVMaze)...`);

        try {
          const secondary = await fetchSecondaryMetadata(
            q,
            targetType || mediaType,
            parsedYear
          );

          if (secondary) {
            media = secondary;
            setApiLogs((prev) => [
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toISOString(),
                method: 'SECONDARY_FALLBACK',
                url: `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(q)}`,
                requestBody: { name: q, type: targetType || mediaType, year: yearHint },
                status: 200,
                statusText: '200 OK (TVMaze Secondary Fallback)',
                headers: {
                  'content-type': 'application/json',
                  'x-fallback-provider': 'TVMaze API',
                },
                responseBody: { success: true, source: secondary.source, data: secondary },
              },
              ...prev.slice(0, 49),
            ]);
          } else {
            const resolved = await resolveMediaWithFallback(
              q,
              targetType || mediaType,
              parsedYear
            );
            if (resolved) {
              media = resolved;
            }
          }
        } catch (resolverErr) {
          console.warn('Secondary / universal resolver warning:', resolverErr);
          const resolved = await resolveMediaWithFallback(
            q,
            targetType || mediaType,
            parsedYear
          );
          if (resolved) {
            media = resolved;
          }
        }
      }

      if (!media) {
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
        throw new Error('Unable to retrieve media details after retries and fallbacks.');
      }

      const finalizedMedia: MediaMetadata = media;
      setResultData(finalizedMedia);
      setDetectedCategories(finalizedMedia.genres || ['Drama']);
      setSelectedPrimaryCategory(finalizedMedia.genres?.[0] || 'Drama');
    } catch (err: any) {
      console.error('Web categorization search error:', err);
      try {
        const resolved = await resolveMediaWithFallback(
          q,
          targetType || mediaType,
          yearHint ? parseInt(yearHint, 10) : undefined
        );
        if (resolved) {
          setResultData(resolved);
          setDetectedCategories(resolved.genres || ['Drama']);
          setSelectedPrimaryCategory(resolved.genres?.[0] || 'Drama');
          return;
        }
      } catch {}

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

  const buildUpdatedMediaRecord = (baseResult: MediaMetadata): MediaMetadata => {
    const mergedGenres = Array.from(new Set([selectedPrimaryCategory, ...(baseResult.genres || [])].filter(Boolean)));
    if (activeSourceItem) {
      return {
        ...activeSourceItem,
        ...baseResult,
        id: activeSourceItem.id,
        folderPath: activeSourceItem.folderPath || baseResult.recommendedFolderStructure,
        path: activeSourceItem.path || baseResult.path,
        playbackUrl: activeSourceItem.playbackUrl || baseResult.playbackUrl,
        localBlobUrl: activeSourceItem.localBlobUrl,
        collectionNames: activeSourceItem.collectionNames || baseResult.collectionNames,
        genres: mergedGenres,
        status: 'categorized',
      };
    }
    return {
      ...baseResult,
      genres: mergedGenres,
      status: 'categorized',
    };
  };

  const handleSave = async () => {
    if (!resultData) return;

    // Build finalized media metadata with assigned categories
    const updatedMedia = buildUpdatedMediaRecord(resultData);

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
    setActiveSourceItem(null);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 2500);
  };

  const handleCategorizeAndPlay = () => {
    if (!resultData) return;
    const updatedMedia = buildUpdatedMediaRecord(resultData);
    onSaveCategorizedMedia(updatedMedia);
    setActiveSourceItem(null);
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLogsPanel(!showLogsPanel)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                showLogsPanel
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
              }`}
              title="Toggle API Diagnostic Logs & Response Headers"
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              <span>Logs ({apiLogs.length})</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                    These {incompleteItems.length} library items lack official genres, synopsis, or artwork. Use one-click triggers to re-categorize or manually match.
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
                    onClick={() => setUncatSubFilter('unsorted')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      uncatSubFilter === 'unsorted'
                        ? 'bg-orange-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Unsorted Path ({unsortedPathCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setUncatSubFilter('genres')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      uncatSubFilter === 'genres'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Needs Genres ({missingGenresCount})
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
                  {albumIncompleteCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setUncatSubFilter('album')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                        uncatSubFilter === 'album'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      Music ({albumIncompleteCount})
                    </button>
                  )}
                </div>

                {/* Search in uncategorized */}
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={uncatSearchQuery}
                    onChange={(e) => setUncatSearchQuery(e.target.value)}
                    placeholder="Filter by title or path..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Unimported Unsorted / Staging Folders Diagnostic Notice */}
              {unimportedUnsorted.fileNodes.length > 0 && (
                <div className="p-3.5 rounded-xl bg-orange-950/30 border border-orange-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-orange-300">
                      <FolderOpen className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>
                        {unimportedUnsorted.fileNodes.length} Unimported Media File(s) Detected in Unsorted / Staging Folders
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      These files sit in {unimportedUnsorted.folderPaths.slice(0, 3).map((p) => `"${p}"`).join(', ')}
                      {unimportedUnsorted.folderPaths.length > 3 ? ` (+${unimportedUnsorted.folderPaths.length - 3} more)` : ''} and were excluded by default because the Folder Classifier assigns <span className="font-mono text-orange-300">Unsorted / Staging</span> below its auto-import threshold.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleImportUnsortedFromTree}
                      className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <FolderSync className="w-3.5 h-3.5" />
                      <span>Import {unimportedUnsorted.fileNodes.length} Unsorted</span>
                    </button>
                    {onOpenClassifierModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenClassifierModal();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                      >
                        Folder Classifier
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Items List */}
              {filteredUncategorized.length === 0 ? (
                <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div className="text-xs font-bold text-white">No uncategorized items found matching this filter!</div>
                  <p className="text-[11px] text-slate-400 max-w-xl mx-auto">
                    {unimportedUnsorted.fileNodes.length > 0
                      ? `Your active library has 0 uncategorized records, but ${unimportedUnsorted.fileNodes.length} file(s) in Unsorted / Staging folders have not been imported yet. Click "Import ${unimportedUnsorted.fileNodes.length} Unsorted" above to queue them for Web Search categorization.`
                      : sambaTree.length === 0
                      ? `All ${mediaLibrary.length} active library item(s) currently have genres, synopses, and artwork. No Samba or local folder scan tree is loaded yet — scan a share or import files to inspect new unsorted/uncategorized media here.`
                      : `All ${mediaLibrary.length} items in your active library currently have genres, synopses, and artwork.`}
                  </p>
                  {mediaLibrary.length > 0 && !showAllLibraryInUncat && (
                    <button
                      type="button"
                      onClick={() => {
                        setUncatSubFilter('all');
                        setUncatSearchQuery('');
                        setShowAllLibraryInUncat(true);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
                    >
                      Show All Library Items for Re-Categorization ({mediaLibrary.length})
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {showAllLibraryInUncat && (
                    <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-indigo-950/40 border border-indigo-800/50 text-[11px] text-indigo-200">
                      <span>Showing all {mediaLibrary.length} library items for optional re-categorization.</span>
                      <button
                        type="button"
                        onClick={() => setShowAllLibraryInUncat(false)}
                        className="text-indigo-300 hover:text-white font-semibold underline cursor-pointer"
                      >
                        Uncategorized only ({incompleteItems.length})
                      </button>
                    </div>
                  )}
                  {filteredUncategorized.map((item) => {
                    const missingSyn = isMediaMissingSynopsis(item);
                    const missingArt = isMediaMissingArtwork(item);
                    const missingGen = isMediaMissingGenres(item);
                    const displayPath = item.folderPath || item.recommendedFolderStructure || item.path;

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition"
                      >
                        {/* Media Item Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Thumbnail / Artwork Placeholder */}
                          <div className="w-11 h-14 rounded-lg bg-slate-950 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center relative">
                            {item.posterUrl && !missingArt ? (
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
                                  : item.type === 'album'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                              }`}>
                                {item.type}
                              </span>
                            </div>

                            {/* Defect Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isMediaInUnsortedPath(item) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-950/80 border border-orange-700/70 text-orange-300 flex items-center gap-1 font-medium">
                                  <FolderOpen className="w-3 h-3" />
                                  <span>Unsorted Path</span>
                                </span>
                              )}
                              {missingGen && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950/80 border border-indigo-800/70 text-indigo-300 flex items-center gap-1 font-medium">
                                  <Tag className="w-3 h-3" />
                                  <span>Needs Genres</span>
                                </span>
                              )}
                              {missingSyn && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950/80 border border-red-800/70 text-red-300 flex items-center gap-1 font-medium">
                                  <FileQuestion className="w-3 h-3" />
                                  <span>Missing Synopsis</span>
                                </span>
                              )}
                              {missingArt && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/80 border border-amber-800/70 text-amber-300 flex items-center gap-1 font-medium">
                                  <ImageOff className="w-3 h-3" />
                                  <span>Missing Artwork</span>
                                </span>
                              )}
                              {displayPath && (
                                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[220px] hidden md:inline" title={displayPath}>
                                  {displayPath}
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
                              setActiveSourceItem(item);
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
              {/* Reminder banner for uncategorized media or unimported unsorted folders */}
              {incompleteItems.length > 0 ? (
                <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span>
                      {incompleteItems.length} library item(s) need categorization
                      {unsortedPathCount > 0 ? ` (${unsortedPathCount} in Unsorted/Staging paths)` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('uncategorized')}
                    className="px-2.5 py-1 rounded-md bg-amber-900/60 hover:bg-amber-800/80 border border-amber-700/60 text-amber-200 text-xs font-bold transition cursor-pointer"
                  >
                    View Uncategorized Media →
                  </button>
                </div>
              ) : unimportedUnsorted.fileNodes.length > 0 ? (
                <div className="bg-orange-950/25 border border-orange-700/40 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-orange-300">
                    <FolderOpen className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>
                      0 uncategorized in library, but {unimportedUnsorted.fileNodes.length} unimported file(s) found in Unsorted / Staging folders
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('uncategorized')}
                    className="px-2.5 py-1 rounded-md bg-orange-900/60 hover:bg-orange-800/80 border border-orange-700/60 text-orange-200 text-xs font-bold transition cursor-pointer"
                  >
                    Inspect Unsorted →
                  </button>
                </div>
              ) : null}

              {/* Search Inputs */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setActiveSourceItem(null);
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
        {/* Diagnostic Logs Panel Drawer */}
        {showLogsPanel && (
          <div className="bg-slate-950 border-t border-slate-800 p-4 max-h-60 overflow-y-auto shrink-0 font-mono text-xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <FileCode className="w-4 h-4" />
                <span>API Diagnostic Inspector & Response Headers ({apiLogs.length} entries)</span>
              </div>
              <div className="flex items-center gap-2">
                {onOpenApiDebugger && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenApiDebugger();
                    }}
                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold flex items-center gap-1 shadow-sm"
                  >
                    <span>Open Full API Debugger</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setApiLogs([])}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                >
                  Clear Logs
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogsPanel(false)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                >
                  Close Logs
                </button>
              </div>
            </div>
            {apiLogs.length === 0 ? (
              <p className="text-slate-500 italic py-2 text-center">No API requests recorded yet. Perform a search or categorize media to view network traces.</p>
            ) : (
              <div className="space-y-3">
                {apiLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${log.method === 'POST' ? 'bg-indigo-950 text-indigo-300' : 'bg-emerald-950 text-emerald-300'}`}>
                          {log.method}
                        </span>
                        <span className="text-slate-200 font-bold">{log.url}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${log.status >= 200 && log.status < 300 ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                          {log.status} {log.statusText}
                        </span>
                        <span className="text-slate-500 text-[10px]">{log.timestamp.split('T')[1]?.slice(0, 8)}</span>
                      </div>
                    </div>
                    {log.requestBody && (
                      <div className="text-[11px] text-slate-400">
                        <strong className="text-indigo-400">Payload:</strong> {JSON.stringify(log.requestBody)}
                      </div>
                    )}
                    {log.headers && Object.keys(log.headers).length > 0 && (
                      <div className="text-[10px] text-slate-400 bg-slate-950/60 p-1.5 rounded">
                        <span className="text-cyan-400 font-bold">Response Headers:</span> {JSON.stringify(log.headers)}
                      </div>
                    )}
                    {log.responseBody && (
                      <div className="text-[11px] text-slate-300 bg-slate-950 p-2 rounded max-h-32 overflow-y-auto">
                        <strong className="text-emerald-400">Response Body:</strong> <pre className="whitespace-pre-wrap">{typeof log.responseBody === 'string' ? log.responseBody : JSON.stringify(log.responseBody, null, 2)}</pre>
                      </div>
                    )}
                    {log.error && (
                      <div className="text-[11px] text-rose-400">
                        <strong>Error:</strong> {log.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
