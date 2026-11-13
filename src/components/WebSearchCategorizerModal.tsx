import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
import { resolveMediaWithFallback } from '../utils/clientMediaResolver';
import { fetchSecondaryMetadata } from '../utils/mediaExtractor';
import { categorizeMediaWithRetry } from '../utils/metadataCategorizer';
import { fetchLibraryMetadata, isCategorizerFolderLabel, isCollectionLookup, isIndividualAudioTrack, isMetadataSidecar, isMissingArtwork, isMissingSynopsis, isMissingText, libraryLookupTitle, metadataLookupMedia, metadataLookupYear, MetadataBackendUnavailableError, MetadataReviewRequiredError, type FetchedLibraryMetadata, type MetadataLookupDetails } from '../utils/libraryMetadataFetch';
import { ProviderSearch } from './ProviderSearch';

interface WebSearchCategorizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCategorizedMedia: (media: MediaMetadata) => void;
  onFetchLibraryMetadata: (id: string, metadata: FetchedLibraryMetadata | null) => Promise<void>;
  onPlayMedia?: (media: MediaMetadata) => void;
  onOpenInNfoStudio?: (media: MediaMetadata) => void;
  onOpenManualMatch?: (media: MediaMetadata) => void;
  onOpenApiDebugger?: () => void;
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
  onFetchLibraryMetadata,
  onPlayMedia,
  onOpenInNfoStudio,
  onOpenManualMatch,
  onOpenApiDebugger,
  initialQuery = '',
  initialType = 'all',
  mediaLibrary = [],
}) => {
  const [activeTabFilter, setActiveTabFilter] = useState<'search' | 'uncategorized' | 'complete'>('search');
  const [uncatSubFilter, setUncatSubFilter] = useState<'all' | 'unfetched' | 'synopsis' | 'artwork' | 'series' | 'movie'>('all');
  const [uncatSearchQuery, setUncatSearchQuery] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [batchErrors, setBatchErrors] = useState<Record<string, string>>({});
  const [reviewCandidates, setReviewCandidates] = useState<Record<string, NonNullable<FetchedLibraryMetadata['candidates']>>>({});
  const [savingCandidateId, setSavingCandidateId] = useState<string | null>(null);
  const [batchCurrentTitle, setBatchCurrentTitle] = useState('');
  const [batchLog, setBatchLog] = useState<string[]>([]);
  const [showBatchLog, setShowBatchLog] = useState(false);
  const batchController = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    if (!isOpen) batchController.current?.abort();
    return () => batchController.current?.abort();
  }, [isOpen]);

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

  const categoryLabelCount = mediaLibrary.filter(isCategorizerFolderLabel).length;
  const audioTrackCount = mediaLibrary.filter((item) => !isCategorizerFolderLabel(item) && isIndividualAudioTrack(item)).length;
  const sidecarCount = mediaLibrary.filter((item) => !isCategorizerFolderLabel(item) && !isIndividualAudioTrack(item) && isMetadataSidecar(item)).length;
  const categorizerItems = mediaLibrary.filter((item) => !isCategorizerFolderLabel(item) && !isIndividualAudioTrack(item) && !isMetadataSidecar(item));
  const incompleteItems = categorizerItems.filter((m) => isMissingSynopsis(m) || isMissingArtwork(m.posterUrl));
  const completeItems = categorizerItems.filter((m) => !isMissingSynopsis(m) && !isMissingArtwork(m.posterUrl));

  const missingSynopsisCount = incompleteItems.filter(isMissingSynopsis).length;
  const missingArtworkCount = incompleteItems.filter((m) => isMissingArtwork(m.posterUrl)).length;
  const unfetchedCount = incompleteItems.filter((m) => !m.metadataFetchStatus).length;

  const seriesIncompleteCount = incompleteItems.filter((m) => m.type === 'series').length;
  const movieIncompleteCount = incompleteItems.filter((m) => m.type === 'movie').length;

  const filteredUncategorized = incompleteItems.filter((item) => {
    if (reviewCandidates[item.id]?.length) return true;
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
      return isMissingArtwork(item.posterUrl);
    }
    if (uncatSubFilter === 'unfetched') {
      return !item.metadataFetchStatus;
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
    const items = [...incompleteItems];
    const controller = new AbortController();
    batchController.current = controller;
    setBatchProcessing(true);
    setBatchProgress({ current: 0, total: items.length });
    setBatchMessage(null);
    setBatchErrors({});
    setReviewCandidates({});
    setShowBatchLog(true);
    setBatchLog([
      `Starting: ${items.length} incomplete items; ${completeItems.length} already have a synopsis and poster; ${categoryLabelCount} category labels and ${audioTrackCount} individual audio tracks excluded. ${sidecarCount} subtitle/metadata/artwork entries excluded.`,
      'Fetch All checks all incomplete items, regardless of the current list filter. Movies and series use TMDB when configured, with OMDb, TVMaze and iTunes fallbacks; albums use MusicBrainz and TheAudioDB. TMDB checks the lookup year first, then the following year. Multiple matches require review.',
    ]);

    const log = (message: string) => {
      setBatchLog((previous) => [...previous, message]);
    };

    let matched = 0;
    let noMatch = 0;
    let review = 0;
    let failed = 0;
    let completed = 0;
    let backendUnavailable = false;
    for (const item of items) {
      if (controller.signal.aborted) break;
      setBatchCurrentTitle(item.title);
      const year = metadataLookupYear(item);
      log(`Checking "${item.title}" (${item.type}${year ? `, ${year}` : ', unverified year'}); missing: ${[isMissingSynopsis(item) ? 'synopsis' : '', isMissingArtwork(item.posterUrl) ? 'poster' : ''].filter(Boolean).join(', ')}.`);
      const lookupMedia = metadataLookupMedia(item);
      const lookupTitle = libraryLookupTitle(lookupMedia);
      if (lookupMedia.type !== item.type) log(`  Using ${lookupMedia.type} lookup based on TV path context.`);
      if (lookupTitle !== item.title) log(`  Lookup title: "${lookupTitle}".`);
      if (isCollectionLookup(lookupMedia)) {
        log('  Looking up the TMDB collection and combining its overview with descriptions for its films.');
      }
      try {
        let needsReview = false;
        const itemData = await fetchLibraryMetadata(item, controller.signal, (details: MetadataLookupDetails) => {
          if (details.candidates?.length) {
            needsReview = true;
            setReviewCandidates(previous => ({ ...previous, [item.id]: details.candidates! }));
            log('  Multiple exact-title results; choose the correct TMDB result below.');
            for (const candidate of details.candidates) {
              log(candidate.candidateType === 'collection'
                ? `  TMDB collection option: ${candidate.title}.`
                : `  TMDB option: ${candidate.title}${candidate.year ? ` (${candidate.year})` : ''}.`);
            }
          }
          if (details.providers?.length) {
            for (const provider of details.providers) log(`  ${provider.provider}: ${provider.outcome}.`);
          } else {
            log('  Provider details unavailable from this backend.');
          }
          log(`  ${details.reason}; source: ${details.source || 'none'}; returned: ${details.returnedTitle || 'no title'}${details.returnedYear ? ` (${details.returnedYear})` : ''}; fields: ${details.fields.join(', ') || 'none'}.`);
        });
        if (controller.signal.aborted) break;
        await onFetchLibraryMetadata(item.id, itemData);
        if (itemData) {
          matched++;
          const filled = [
            isMissingSynopsis(item) && !isMissingText(itemData.overview) ? 'synopsis' : '',
            isMissingArtwork(item.posterUrl) && !isMissingArtwork(itemData.posterUrl) ? 'poster' : '',
            isMissingArtwork(item.fanartUrl) && !isMissingArtwork(itemData.fanartUrl) ? 'fanart' : '',
            !item.genres?.length && itemData.genres?.length ? 'genres' : '',
            !item.rating && itemData.rating && Number.isFinite(itemData.rating) ? 'rating' : '',
            !item.cast?.length && itemData.cast?.length ? 'cast' : '',
          ].filter(Boolean);
          const matchLabel = itemData.matchMode === 'ranked' || itemData.matchMode === 'unique-variant'
            ? 'inferred match (verify manually)' : 'verified match';
          log(`  Saved ${matchLabel} for "${item.title}"; filled: ${filled.join(', ') || 'no missing fields'}; existing metadata was preserved.`);
        } else if (needsReview) {
          review++;
          log(`  Awaiting your selection for "${item.title}".`);
        } else {
          noMatch++;
          log(`  No verified match saved for "${item.title}".`);
        }
      } catch (e) {
        if (controller.signal.aborted) break;
        const message = e instanceof Error ? e.message : String(e);
        setBatchErrors((prev) => ({ ...prev, [item.id]: message }));
        if (e instanceof MetadataReviewRequiredError) {
          log(`  Manual review required for "${item.title}": ${message}`);
          review++;
        } else {
          console.warn(`Failed to fetch metadata for ${item.title}:`, e);
          log(`  Failed to fetch or save "${item.title}": ${message}`);
          failed++;
          if (e instanceof MetadataBackendUnavailableError) backendUnavailable = true;
        }
      }
      completed++;
      setBatchProgress({ current: completed, total: items.length });
      if (backendUnavailable) break;
    }
    batchController.current = null;
    setBatchCurrentTitle('');
    setBatchProcessing(false);
    const summary = `${controller.signal.aborted || backendUnavailable ? 'Stopped' : 'Finished'}: ${completed}/${items.length} checked, ${matched} matched, ${noMatch} without a verified match, ${review} requiring manual review, ${failed} failed.`;
    setBatchMessage(backendUnavailable ? `${summary} Metadata backend unavailable; retry after restoring the connection.` : summary);
    log(backendUnavailable ? `${summary} Metadata backend unavailable; retry after restoring the connection.` : summary);
  };

  const handleSelectReviewCandidate = async (
    item: MediaMetadata,
    candidate: NonNullable<FetchedLibraryMetadata['candidates']>[number],
  ) => {
    setSavingCandidateId(item.id);
    try {
      let selectedMetadata: FetchedLibraryMetadata;
      if (candidate.candidateType === 'collection' && candidate.collectionId) {
        const selected = await fetchLibraryMetadata(item, new AbortController().signal, undefined, candidate.collectionId);
        if (!selected) throw new Error('The selected TMDB collection could not be verified or had no usable descriptions.');
        selectedMetadata = selected;
      } else {
        selectedMetadata = { ...candidate, matchMode: 'manual' };
      }
      await onFetchLibraryMetadata(item.id, selectedMetadata);
      setReviewCandidates(previous => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      setBatchErrors(previous => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      setBatchLog(previous => [...previous, `  Saved your selection: ${candidate.title}${candidate.year ? ` (${candidate.year})` : ''} for "${item.title}".`]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBatchErrors(previous => ({ ...previous, [item.id]: message }));
      setBatchLog(previous => [...previous, `  Could not save selected result for "${item.title}": ${message}`]);
    } finally {
      setSavingCandidateId(null);
    }
  };

  if (!isOpen) return null;

  const handleSearch = async (targetQuery?: string, targetType?: MediaType | 'all', targetYear?: number) => {
    const q = (targetQuery || query).trim();
    if (!q) {
      setErrorMsg('Please enter a movie or series title to categorize.');
      return;
    }

    setIsSearching(true);
    setErrorMsg(null);
    setIsSaved(false);

    try {
      const parsedYear = targetQuery !== undefined
        ? targetYear
        : yearHint ? parseInt(yearHint, 10) : undefined;
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
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
            <button type="button" onClick={() => setActiveTabFilter('complete')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${activeTabFilter === 'complete' ? 'bg-emerald-700 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'}`}>
              Has metadata ({completeItems.length})
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
            <span>Missing &amp; Unfetched</span>
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
                    <span>Missing &amp; Unfetched Media</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Showing items missing a synopsis or poster. Category folder labels, individual audio tracks and subtitle/metadata/artwork entries are excluded; albums remain eligible. Existing metadata is kept.
                  </p>
                  {audioTrackCount > 0 && <p className="text-[11px] text-slate-400">{audioTrackCount} audio track entries excluded. Only albums already in the library are searched.</p>}
                </div>

                {incompleteItems.length > 0 && (
                  batchProcessing ? (
                    <button type="button" onClick={() => batchController.current?.abort()}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold cursor-pointer">
                      Stop after current save
                    </button>
                  ) : (
                  <button
                    type="button"
                    onClick={handleBatchCategorizeAll}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Fetch All ({incompleteItems.length})</span>
                  </button>
                  )
                )}
              </div>

              {batchProcessing && (
                <div role="status" className="text-xs text-slate-300 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Checked {batchProgress.current}/{batchProgress.total}; {batchProgress.total - batchProgress.current} remaining. Checking: {batchCurrentTitle}
                </div>
              )}
              {/* Batch feedback message */}
              {batchMessage && (
                <div role="status" className="p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{batchMessage}</span>
                </div>
              )}
              {batchLog.length > 0 && (
                <section className="rounded-xl border border-slate-700 bg-slate-950 p-3 space-y-2" aria-label="Fetch All diagnostics">
                  <button type="button" onClick={() => setShowBatchLog(!showBatchLog)}
                    className="text-xs font-bold text-indigo-300" aria-expanded={showBatchLog}>
                    {showBatchLog ? 'Hide' : 'Show'} Fetch All log ({batchLog.length} entries)
                  </button>
                  {showBatchLog && (
                    <>
                      <p className="text-[11px] text-slate-400">Contains library titles and years. Review before sharing. Cleared when the next Fetch All starts.</p>
                      <div role="log" aria-label="Fetch All log" className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-slate-300">
                        {batchLog.join('\n')}
                      </div>
                    </>
                  )}
                </section>
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
                    onClick={() => setUncatSubFilter('unfetched')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      uncatSubFilter === 'unfetched'
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Not Checked ({unfetchedCount})
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
                    No media matches the selected filter.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {filteredUncategorized.map((item) => {
                    const missingSynopsis = isMissingSynopsis(item);
                    const missingArtwork = isMissingArtwork(item.posterUrl);
                    const sourcePath = item.path || (
                      item.folderPath && item.matchedFilename
                        ? `${item.folderPath.replace(/[\\/]+$/, '')}/${item.matchedFilename}`
                        : undefined
                    );
                    const sourceFileName = sourcePath?.replace(/\\/g, '/').split('/').pop() ||
                      item.matchedFilename?.replace(/\\/g, '/').split('/').pop();
                    const lookupYear = metadataLookupYear(item);

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-3 p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Media Item Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Thumbnail / Artwork Placeholder */}
                          <div className="w-11 h-14 rounded-lg bg-slate-950 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center relative">
                            {item.posterUrl && !missingArtwork ? (
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
                              {lookupYear && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  ({lookupYear})
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

                            {(sourceFileName || sourcePath) && (
                              <div className="space-y-0.5 text-[10px] font-mono text-slate-400">
                                {sourceFileName && (
                                  <div className="break-all">
                                    <span className="text-slate-500">File: </span>{sourceFileName}
                                  </div>
                                )}
                                {sourcePath && (
                                  <div className="break-all">
                                    <span className="text-slate-500">Full path: </span>{sourcePath}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Defect Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {!item.metadataFetchStatus && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-200">Not checked by Fetch All</span>
                              )}
                              {item.metadataFetchStatus === 'no-match' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-200">No verified match or provider unavailable</span>
                              )}
                              {batchErrors[item.id] && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950 text-red-200">Fetch failed: {batchErrors[item.id]}</span>
                              )}
                              {missingSynopsis && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950/80 border border-red-800/70 text-red-300 flex items-center gap-1 font-medium">
                                  <FileQuestion className="w-3 h-3" />
                                  <span>Missing Synopsis</span>
                                </span>
                              )}
                              {missingArtwork && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/80 border border-amber-800/70 text-amber-300 flex items-center gap-1 font-medium">
                                  <ImageOff className="w-3 h-3" />
                                  <span>Missing Artwork</span>
                                </span>
                              )}
                              {!sourcePath && item.recommendedFolderStructure && (
                                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[200px] hidden md:inline">
                                  Folder: {item.recommendedFolderStructure}
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
                              setYearHint(lookupYear?.toString() || '');
                              handleSearch(item.title, item.type, lookupYear);
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
                        {!!reviewCandidates[item.id]?.length && (
                          <div className="space-y-2 border-t border-slate-700 pt-3">
                            <p className="text-xs text-amber-200">TMDB found multiple possible matches. Select the correct title or collection:</p>
                            <div className="flex flex-wrap gap-2">
                              {reviewCandidates[item.id].map((candidate, index) => (
                                <button
                                  key={`${candidate.candidateType || 'movie'}:${candidate.collectionId || candidate.title}:${candidate.year || ''}:${index}`}
                                  type="button"
                                  disabled={savingCandidateId === item.id}
                                  onClick={() => handleSelectReviewCandidate(item, candidate)}
                                  className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-left text-xs text-white hover:border-amber-400 disabled:opacity-50"
                                >
                                  {candidate.posterUrl && <img src={candidate.posterUrl} alt="" className="h-10 w-7 rounded object-cover" />}
                                  <span>{candidate.title}{candidate.year ? ` (${candidate.year})` : ' (collection)'}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WEB SEARCH & CATEGORIZE VIEW */}
          {activeTabFilter === 'complete' && (
            <section className="space-y-3">
              <p className="text-sm text-slate-400">These items have a synopsis and poster. Review or manually correct them if needed.</p>
              {completeItems.length === 0 && <p className="text-sm text-slate-400">No items with a synopsis and poster found.</p>}
              {completeItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-xl bg-slate-900 p-3 text-sm">
                  <img src={item.posterUrl} alt={`${item.title} poster`} className="w-12 rounded" referrerPolicy="no-referrer" />
                  <div className="flex-1 space-y-1">
                    <strong>{item.title} {item.year ? `(${item.year})` : ''}</strong>
                    <p className="text-xs text-slate-400">{isMissingText(item.overview) ? item.synopsis : item.overview}</p>
                  </div>
                  {onOpenManualMatch && <button type="button" onClick={() => onOpenManualMatch(item)} className="rounded bg-slate-700 px-3 py-1">Manual Match</button>}
                </div>
              ))}
            </section>
          )}
          {activeTabFilter === 'search' && (
            <>
              <ProviderSearch key={`${query}:${mediaType}`} initialTitle={query} type={mediaType === 'album' ? 'all' : mediaType} />
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
    </div>,
    document.body
  );
};
