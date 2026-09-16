import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Film,
  Tv,
  Music,
  Download,
  FolderPlus,
  Eye,
  Star,
  Calendar,
  Clock,
  Sparkles,
  Layers,
  Check,
  HardDrive,
  Copy,
  Database,
  Upload,
  FolderSync,
  Play,
  FileVideo,
  FileAudio,
  CheckCircle2,
  Filter,
  Globe,
  Tag,
  Rocket,
  Smile,
  ShieldAlert,
  SearchCode,
  Flame,
  Wand2,
  ListFilter,
  RefreshCw,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { MediaMetadata, MediaType, SambaConfig, EpisodeMetadata, TrackMetadata } from '../types';
import { downloadMediaBundleZip } from '../utils/zipDownloader';
import { generateMetadataFile } from '../utils/nfoGenerator';
import { WebSearchCategorizerModal } from './WebSearchCategorizerModal';

interface MediaSearchProps {
  mediaLibrary: MediaMetadata[];
  onPushToSamba: (media: MediaMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
  onPlayMedia?: (media: MediaMetadata, episode?: EpisodeMetadata, track?: TrackMetadata) => void;
  sambaConfig: SambaConfig;
  onImportFiles?: (files: File[] | string[]) => Promise<void> | void;
  onSyncFromSamba?: () => void;
  onOpenManualMatch?: (rawPathOrName?: string, mediaType?: MediaType) => void;
  onSaveCategorizedMedia?: (media: MediaMetadata) => void;
  isSyncing?: boolean;
  selectedMediaType?: 'all' | MediaType;
  onSelectMediaType?: (type: 'all' | MediaType) => void;
}

// Curated Category Taxonomy with Icons & Brand Colors
export interface CategoryDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  keywords: string[];
}

export const MOVIE_SERIES_CATEGORIES: CategoryDefinition[] = [
  { id: 'all', name: 'All Categories', icon: '🌟', color: 'indigo', keywords: [] },
  { id: 'scifi', name: 'Sci-Fi', icon: '🚀', color: 'cyan', keywords: ['sci-fi', 'science fiction', 'space', 'cyberpunk', 'futuristic', 'dystopian', 'alien'] },
  { id: 'drama', name: 'Drama', icon: '🎭', color: 'purple', keywords: ['drama', 'tragedy', 'character', 'emotional', 'social'] },
  { id: 'comedy', name: 'Comedy', icon: '😂', color: 'amber', keywords: ['comedy', 'sitcom', 'humor', 'parody', 'satire', 'funny'] },
  { id: 'action', name: 'Action', icon: '💥', color: 'rose', keywords: ['action', 'adventure', 'martial arts', 'superhero', 'explosive', 'fight'] },
  { id: 'thriller', name: 'Thriller', icon: '🔍', color: 'emerald', keywords: ['thriller', 'suspense', 'psychological', 'espionage', 'conspiracy'] },
  { id: 'crime', name: 'Crime', icon: '🕵️', color: 'red', keywords: ['crime', 'gangster', 'mafia', 'heist', 'noir', 'police', 'detective'] },
  { id: 'horror', name: 'Horror', icon: '👻', color: 'orange', keywords: ['horror', 'supernatural', 'monster', 'haunted', 'slasher', 'zombie'] },
  { id: 'animation', name: 'Animation', icon: '🎨', color: 'pink', keywords: ['animation', 'anime', 'cgi', 'cartoon', 'animated'] },
  { id: 'documentary', name: 'Documentary', icon: '📽️', color: 'blue', keywords: ['documentary', 'docuseries', 'biography', 'history', 'nature', 'science'] },
  { id: 'romance', name: 'Romance', icon: '💖', color: 'rose', keywords: ['romance', 'romantic', 'love', 'melodrama'] },
  { id: 'fantasy', name: 'Fantasy', icon: '🧙', color: 'violet', keywords: ['fantasy', 'magic', 'mythical', 'sword', 'sorcery'] },
  { id: 'mystery', name: 'Mystery', icon: '🧩', color: 'teal', keywords: ['mystery', 'whodunit', 'puzzle', 'investigation'] },
];

export const MediaSearch: React.FC<MediaSearchProps> = ({
  mediaLibrary,
  onPushToSamba,
  onOpenDetails,
  onOpenInNfoStudio,
  onPlayMedia,
  sambaConfig,
  onImportFiles,
  onSyncFromSamba,
  onOpenManualMatch,
  onSaveCategorizedMedia,
  isSyncing = false,
  selectedMediaType,
  onSelectMediaType,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [internalSelectedType, setInternalSelectedType] = useState<'all' | MediaType>('all');
  const selectedType = selectedMediaType !== undefined ? selectedMediaType : internalSelectedType;
  const setSelectedType = (type: 'all' | MediaType) => {
    setInternalSelectedType(type);
    if (onSelectMediaType) {
      onSelectMediaType(type);
    }
  };
  const [originFilter, setOriginFilter] = useState<'all' | 'imported' | 'curated'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [pushedIds, setPushedIds] = useState<Record<string, boolean>>({});
  const [savedDbIds, setSavedDbIds] = useState<Record<string, boolean>>({});
  const [copiedNfoId, setCopiedNfoId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Watchlist state (persisted via SQLite)
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  // Recently Added state (loaded from SQLite)
  const [recentlyAdded, setRecentlyAdded] = useState<MediaMetadata[]>([]);
  const [isRecentLoading, setIsRecentLoading] = useState(false);
  const recentScrollRef = useRef<HTMLDivElement>(null);

  // Web Search Categorizer Modal State
  const [isCategorizerModalOpen, setIsCategorizerModalOpen] = useState(false);
  const [categorizerInitialQuery, setCategorizerInitialQuery] = useState('');
  const [categorizerInitialType, setCategorizerInitialType] = useState<MediaType | 'all'>('all');
  const [isBatchCategorizing, setIsBatchCategorizing] = useState(false);
  const [batchCategorizeSuccess, setBatchCategorizeSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine Min and Max Year across library
  const { minLibraryYear, maxLibraryYear } = useMemo(() => {
    const years = mediaLibrary.map((m) => m.year).filter((y): y is number => Boolean(y) && !isNaN(y));
    const min = years.length > 0 ? Math.min(...years) : 1970;
    const max = years.length > 0 ? Math.max(...years) : 2026;
    return { minLibraryYear: Math.min(min, 1970), maxLibraryYear: Math.max(max, 2026) };
  }, [mediaLibrary]);

  // Date-range slider state
  const [yearRange, setYearRange] = useState<[number, number]>([1970, 2026]);

  // Sync year range bounds when library updates
  useEffect(() => {
    setYearRange([minLibraryYear, maxLibraryYear]);
  }, [minLibraryYear, maxLibraryYear]);

  // Fetch Watchlist IDs from SQLite on mount
  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        const res = await fetch('/api/db/watchlist');
        const data = await res.json();
        if (data.success && Array.isArray(data.watchlist)) {
          const idSet = new Set<string>(data.watchlist.map((item: any) => item.media_id));
          setWatchlistIds(idSet);
        }
      } catch (err) {
        console.error('Failed to load watchlist from SQLite:', err);
      }
    };
    fetchWatchlist();
  }, []);

  // Fetch Top 10 Recently Added from SQLite
  const fetchRecentMedia = async () => {
    setIsRecentLoading(true);
    try {
      const res = await fetch('/api/db/media/recent?limit=10');
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        // Map SQLite db rows to MediaMetadata
        const mapped: MediaMetadata[] = data.items.map((row: any) => {
          // Check if already present in mediaLibrary for full metadata
          const existing = mediaLibrary.find((m) => m.id === row.id || m.title.toLowerCase() === row.title.toLowerCase());
          if (existing) return existing;

          let parsedGenres: string[] = [];
          try {
            parsedGenres = JSON.parse(row.genres || '[]');
          } catch {
            parsedGenres = row.genres ? row.genres.split(',').map((g: string) => g.trim()) : [];
          }

          return {
            id: row.id,
            title: row.title,
            originalTitle: row.original_title,
            type: row.media_type as MediaType,
            year: row.year || 2024,
            rating: row.rating || 8.5,
            posterUrl: row.poster_url || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
            fanartUrl: row.fanart_url,
            overview: row.synopsis || 'Recently added media title',
            genres: parsedGenres.length > 0 ? parsedGenres : ['Drama'],
            recommendedFolderStructure: row.recommended_folder || `Media/${row.title}/`,
            source: 'sqlite-recent',
          };
        });
        setRecentlyAdded(mapped);
      }
    } catch (err) {
      console.error('Failed to fetch recent media from SQLite:', err);
    } finally {
      setIsRecentLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentMedia();
  }, [mediaLibrary.length]);

  // Toggle item in Watchlist (stored in SQLite)
  const toggleWatchlist = async (media: MediaMetadata, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isCurrentlySaved = watchlistIds.has(media.id);
    const nextSet = new Set(watchlistIds);
    if (isCurrentlySaved) {
      nextSet.delete(media.id);
    } else {
      nextSet.add(media.id);
    }
    setWatchlistIds(nextSet);

    try {
      await fetch('/api/db/watchlist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: media.id,
          title: media.title,
          mediaType: media.type,
          year: media.year,
          rating: media.rating,
          posterUrl: media.posterUrl,
          genres: JSON.stringify(media.genres),
          synopsis: media.overview,
        }),
      });
    } catch (err) {
      console.error('Failed to toggle watchlist in DB:', err);
    }
  };

  // Compute live counts across the library
  const allCount = mediaLibrary.length;
  const seriesCount = mediaLibrary.filter((m) => m.type === 'series').length;
  const moviesCount = mediaLibrary.filter((m) => m.type === 'movie').length;
  const albumsCount = mediaLibrary.filter((m) => m.type === 'album').length;
  const importedCount = mediaLibrary.filter(
    (m) => m.id.startsWith('imported-') || m.id.startsWith('batch-') || m.matchedFilename
  ).length;

  // Compute category counts for Movies & Series
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: mediaLibrary.length };
    MOVIE_SERIES_CATEGORIES.forEach((cat) => {
      if (cat.id === 'all') return;
      const matching = mediaLibrary.filter((m) => {
        if (selectedType !== 'all' && m.type !== selectedType) return false;
        const genresJoined = (m.genres || []).join(' ').toLowerCase();
        const overviewJoined = (m.overview || '').toLowerCase();
        return cat.keywords.some(
          (k) => genresJoined.includes(k) || overviewJoined.includes(k)
        );
      });
      counts[cat.id] = matching.length;
    });
    return counts;
  }, [mediaLibrary, selectedType]);

  // Extract all available genres with item counts
  const availableGenres = useMemo(() => {
    const genreMap = new Map<string, number>();
    mediaLibrary.forEach((m) => {
      if (selectedType !== 'all' && m.type !== selectedType) return;
      m.genres?.forEach((g) => {
        const trimmed = g.trim();
        if (trimmed) {
          genreMap.set(trimmed, (genreMap.get(trimmed) || 0) + 1);
        }
      });
    });
    return Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [mediaLibrary, selectedType]);

  // Handle multi-select genre toggle
  const handleToggleGenre = (genreName: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genreName) ? prev.filter((g) => g !== genreName) : [...prev, genreName]
    );
  };

  const handleSelectAllGenres = () => {
    setSelectedGenres(availableGenres.map((g) => g.name));
  };

  const handleClearAllGenres = () => {
    setSelectedGenres([]);
  };

  // Filter items based on type, origin, category, multi-genres, date-range, and search query
  const filteredMedia = useMemo(() => {
    return mediaLibrary.filter((media) => {
      // Type filter
      if (selectedType !== 'all' && media.type !== selectedType) {
        return false;
      }

      // Origin filter
      const isImported =
        media.id.startsWith('imported-') ||
        media.id.startsWith('batch-') ||
        Boolean(media.matchedFilename);
      if (originFilter === 'imported' && !isImported) return false;
      if (originFilter === 'curated' && isImported) return false;

      // Category filter (Sci-Fi, Drama, Comedy, Action, etc.)
      if (activeCategory !== 'all') {
        const catDef = MOVIE_SERIES_CATEGORIES.find((c) => c.id === activeCategory);
        if (catDef) {
          const genresJoined = (media.genres || []).join(' ').toLowerCase();
          const overviewJoined = (media.overview || '').toLowerCase();
          const matchesCategory = catDef.keywords.some(
            (k) => genresJoined.includes(k) || overviewJoined.includes(k)
          );
          if (!matchesCategory) return false;
        }
      }

      // Multi-select Genre Filter: Matches if media has ANY of the selected genres
      if (selectedGenres.length > 0) {
        const hasAnySelectedGenre = media.genres?.some((g) =>
          selectedGenres.some((sg) => sg.toLowerCase() === g.toLowerCase())
        );
        if (!hasAnySelectedGenre) return false;
      }

      // Date-Range Slider Filter
      if (media.year) {
        if (media.year < yearRange[0] || media.year > yearRange[1]) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();

        // Check if query is an explicit genre tag
        const genreTagMatch = q.match(/^genre[:=]\s*(.+)$/i);
        if (genreTagMatch) {
          const targetG = genreTagMatch[1].trim();
          return media.genres?.some((g) => g.toLowerCase().includes(targetG));
        }

        // Check if query is an explicit year tag
        const yearTagMatch = q.match(/^year[:=]\s*(\d{4})$/i);
        if (yearTagMatch) {
          return media.year === parseInt(yearTagMatch[1], 10);
        }

        const matchesTitle = media.title.toLowerCase().includes(q);
        const matchesOriginalTitle = media.originalTitle?.toLowerCase().includes(q);
        const matchesGenre = media.genres.some((g) => g.toLowerCase().includes(q));
        const matchesYear = media.year ? String(media.year).includes(q) : false;
        const matchesArtist = media.artists?.some((a) => a.toLowerCase().includes(q));
        const matchesDirector = media.directors?.some((d) => d.toLowerCase().includes(q));
        const matchesFolder = media.recommendedFolderStructure.toLowerCase().includes(q);
        const matchesFilename = media.matchedFilename?.toLowerCase().includes(q);
        const matchesOverview = media.overview?.toLowerCase().includes(q);

        return (
          matchesTitle ||
          matchesOriginalTitle ||
          matchesGenre ||
          matchesYear ||
          matchesArtist ||
          matchesDirector ||
          matchesFolder ||
          matchesFilename ||
          matchesOverview
        );
      }

      return true;
    });
  }, [mediaLibrary, selectedType, originFilter, activeCategory, selectedGenres, yearRange, searchQuery]);

  const handleSaveToSqlite = async (media: MediaMetadata) => {
    try {
      const res = await fetch('/api/db/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(media),
      });
      if (res.ok) {
        setSavedDbIds((prev) => ({ ...prev, [media.id]: true }));
        setTimeout(() => {
          setSavedDbIds((prev) => ({ ...prev, [media.id]: false }));
        }, 3000);
        fetchRecentMedia();
      }
    } catch (err) {
      console.error('Failed to save to SQLite:', err);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    // Check if query is already matched in our current dynamic library
    const matched = mediaLibrary.filter((m) =>
      m.title.toLowerCase().includes(query.toLowerCase())
    );

    if (matched.length === 0) {
      // Open Web Search Categorizer Modal to fetch rich metadata directly from web
      setCategorizerInitialQuery(query);
      setCategorizerInitialType(selectedType);
      setIsCategorizerModalOpen(true);
    }
  };

  const handleOpenCategorizerForTitle = (title: string, type?: MediaType) => {
    setCategorizerInitialQuery(title);
    setCategorizerInitialType(type || (selectedType !== 'all' ? selectedType : 'all'));
    setIsCategorizerModalOpen(true);
  };

  const handleBatchCategorizeAll = async () => {
    setIsBatchCategorizing(true);
    setBatchCategorizeSuccess(null);
    try {
      const titles = mediaLibrary.map((m) => ({ title: m.title, type: m.type }));
      const res = await fetch('/api/metadata/batch-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: titles }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        data.results.forEach((resItem: any) => {
          const match = mediaLibrary.find((m) => m.title.toLowerCase() === resItem.title.toLowerCase());
          if (match && onSaveCategorizedMedia && resItem.genres) {
            onSaveCategorizedMedia({
              ...match,
              genres: Array.from(new Set([...(match.genres || []), ...resItem.genres])),
            });
          }
        });
        setBatchCategorizeSuccess(`Auto-categorized ${data.results.length} titles via web database!`);
        setTimeout(() => setBatchCategorizeSuccess(null), 4000);
      }
    } catch (err) {
      console.error('Batch categorize error:', err);
    } finally {
      setIsBatchCategorizing(false);
    }
  };

  const handlePresetClick = (presetQuery: string, type: MediaType) => {
    setSearchQuery(presetQuery);
    setSelectedType(type);
  };

  const handlePush = (media: MediaMetadata) => {
    onPushToSamba(media);
    setPushedIds((prev) => ({ ...prev, [media.id]: true }));
    setTimeout(() => {
      setPushedIds((prev) => ({ ...prev, [media.id]: false }));
    }, 3000);
  };

  const handleCopyNfo = (media: MediaMetadata) => {
    const xml = generateMetadataFile(media);
    navigator.clipboard.writeText(xml);
    setCopiedNfoId(media.id);
    setTimeout(() => setCopiedNfoId(null), 2000);
  };

  // Horizontal scroll controls for Recently Added section
  const scrollRecent = (direction: 'left' | 'right') => {
    if (recentScrollRef.current) {
      const scrollAmount = direction === 'left' ? -320 : 320;
      recentScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Drag and drop handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onImportFiles) {
      const filesArray = Array.from(e.dataTransfer.files) as File[];
      await onImportFiles(filesArray);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFiles) {
      const filesArray = Array.from(e.target.files) as File[];
      await onImportFiles(filesArray);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Quick reset all filters
  const handleResetAllFilters = () => {
    setActiveCategory('all');
    setSelectedGenres([]);
    setYearRange([minLibraryYear, maxLibraryYear]);
    setSearchQuery('');
    setSelectedType('all');
    setOriginFilter('all');
  };

  const isAnyFilterActive =
    activeCategory !== 'all' ||
    selectedGenres.length > 0 ||
    yearRange[0] > minLibraryYear ||
    yearRange[1] < maxLibraryYear ||
    searchQuery.trim().length > 0 ||
    originFilter !== 'all';

  return (
    <div className="space-y-6">
      {/* Hidden file input for file imports */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Web Search & Categorizer Modal */}
      <WebSearchCategorizerModal
        isOpen={isCategorizerModalOpen}
        onClose={() => setIsCategorizerModalOpen(false)}
        initialQuery={categorizerInitialQuery}
        initialType={categorizerInitialType}
        mediaLibrary={mediaLibrary}
        onSaveCategorizedMedia={(media) => {
          if (onSaveCategorizedMedia) {
            onSaveCategorizedMedia(media);
          }
        }}
        onPlayMedia={onPlayMedia}
        onOpenInNfoStudio={onOpenInNfoStudio}
      />

      {/* Top Banner & Quick Ingestion */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border rounded-2xl p-6 shadow-xl transition-all ${
          isDragging
            ? 'border-indigo-500 bg-indigo-950/70 ring-4 ring-indigo-500/30'
            : 'border-slate-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Unified Media Scraper, Categorizer & Samba Sync</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              All Media Library & Network Downloader
            </h1>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Populated with <span className="text-white font-semibold">{allCount}</span> total items ({seriesCount} TV Series, {moviesCount} Movies, and {albumsCount} Music Albums) categorized across Sci-Fi, Drama, Comedy, Action, and more.
            </p>
          </div>

          {/* Quick Actions: Web Search Categorizer & Ingestion */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              id="btn-open-web-categorizer"
              onClick={() => {
                setCategorizerInitialQuery(searchQuery || '');
                setCategorizerInitialType(selectedType);
                setIsCategorizerModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              <span>Web Search & Categorize</span>
            </button>

            <button
              id="btn-import-files-direct"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>Import Files</span>
            </button>

            {onSyncFromSamba && (
              <button
                id="btn-sync-samba-all-media"
                onClick={onSyncFromSamba}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
              >
                <FolderSync className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Scanning Share...' : 'Sync from Samba'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Suggestion Pills & Origin Filters */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-medium">Quick Suggestions:</span>
            <button
              id="preset-severance"
              onClick={() => handlePresetClick('Severance', 'series')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              🚀 Severance (Sci-Fi)
            </button>
            <button
              id="preset-breaking-bad"
              onClick={() => handlePresetClick('Breaking Bad', 'series')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              🎭 Breaking Bad (Drama)
            </button>
            <button
              id="preset-ted-lasso"
              onClick={() => handlePresetClick('Ted Lasso', 'series')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              😂 Ted Lasso (Comedy)
            </button>
            <button
              id="preset-dune-two"
              onClick={() => handlePresetClick('Dune', 'movie')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              🎬 Dune: Part Two (Sci-Fi)
            </button>
            <button
              id="preset-interstellar"
              onClick={() => handlePresetClick('Interstellar', 'movie')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              🚀 Interstellar (Sci-Fi)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Origin:</span>
            <button
              id="filter-origin-all"
              onClick={() => setOriginFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition ${
                originFilter === 'all'
                  ? 'bg-slate-700 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({allCount})
            </button>
            <button
              id="filter-origin-imported"
              onClick={() => setOriginFilter('imported')}
              className={`px-2.5 py-1 rounded-lg transition ${
                originFilter === 'imported'
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Imported ({importedCount})
            </button>
            <button
              id="filter-origin-curated"
              onClick={() => setOriginFilter('curated')}
              className={`px-2.5 py-1 rounded-lg transition ${
                originFilter === 'curated'
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Curated ({allCount - importedCount})
            </button>
          </div>
        </div>
      </div>

      {/* RECENTLY ADDED SECTION (Pulls top 10 from SQLite with horizontal scrolling) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Recently Added</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-mono text-slate-400 border border-slate-700">
                  Top 10 in SQLite
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Latest media items saved to your local database • Scroll horizontally for quick access
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="recent-scroll-left"
              onClick={() => scrollRecent('left')}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
              title="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              id="recent-scroll-right"
              onClick={() => scrollRecent('right')}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
              title="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal Carousel Shelf */}
        <div
          ref={recentScrollRef}
          className="flex gap-4 overflow-x-auto pb-3 pt-1 scroll-smooth scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
        >
          {recentlyAdded.length > 0 ? (
            recentlyAdded.map((item) => {
              const isSavedWatchlist = watchlistIds.has(item.id);
              return (
                <div
                  key={`recent-${item.id}`}
                  id={`recent-card-${item.id}`}
                  onClick={() => onOpenDetails(item)}
                  className="group relative w-48 sm:w-56 shrink-0 bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer flex flex-col"
                >
                  {/* Poster image */}
                  <div className="relative aspect-[16/10] w-full bg-slate-900 overflow-hidden">
                    <img
                      src={item.fanartUrl || item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          item.type === 'series'
                            ? 'bg-purple-900/90 text-purple-200'
                            : item.type === 'movie'
                            ? 'bg-cyan-900/90 text-cyan-200'
                            : 'bg-emerald-900/90 text-emerald-200'
                        }`}
                      >
                        {item.type === 'series' ? 'Series' : item.type === 'movie' ? 'Movie' : 'Album'}
                      </span>

                      {/* Watchlist Bookmark toggle button */}
                      <button
                        type="button"
                        id={`watchlist-toggle-recent-${item.id}`}
                        onClick={(e) => toggleWatchlist(item, e)}
                        className={`pointer-events-auto p-1.5 rounded-full transition cursor-pointer backdrop-blur-md ${
                          isSavedWatchlist
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                            : 'bg-black/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10'
                        }`}
                        title={isSavedWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${isSavedWatchlist ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                    </div>

                    {/* Quick Play Hover Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onPlayMedia) onPlayMedia(item);
                        else onOpenDetails(item);
                      }}
                      className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xl cursor-pointer"
                      title="Play Media"
                    >
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </button>

                    {/* Rating inside poster */}
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-xs text-white">
                      <span className="flex items-center gap-1 font-bold text-amber-400 text-[11px]">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{item.rating?.toFixed(1) || '8.5'}</span>
                      </span>
                      <span className="text-[10px] text-slate-300 font-mono">
                        {item.year || '2024'}
                      </span>
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {item.genres?.slice(0, 2).join(' • ') || 'Drama'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onPlayMedia) onPlayMedia(item);
                          else onOpenDetails(item);
                        }}
                        className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-white" />
                        <span>Play</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDetails(item);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition cursor-pointer"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="w-full py-8 text-center text-xs text-slate-400 font-mono">
              Loading recent media from SQLite database...
            </div>
          )}
        </div>
      </div>

      {/* Main Type Tabs & Search Bar */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        {/* Type Tabs with live counts */}
        <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs sm:text-sm overflow-x-auto shrink-0">
          <button
            id="search-filter-all"
            onClick={() => setSelectedType('all')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedType === 'all'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Media</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                selectedType === 'all' ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {allCount}
            </span>
          </button>

          <button
            id="search-filter-series"
            onClick={() => setSelectedType('series')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedType === 'series'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>TV Series</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                selectedType === 'series'
                  ? 'bg-purple-800 text-purple-100'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {seriesCount}
            </span>
          </button>

          <button
            id="search-filter-movie"
            onClick={() => setSelectedType('movie')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedType === 'movie'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Movies</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                selectedType === 'movie' ? 'bg-cyan-800 text-cyan-100' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {moviesCount}
            </span>
          </button>

          <button
            id="search-filter-album"
            onClick={() => setSelectedType('album')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedType === 'album'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Music className="w-4 h-4" />
            <span>Music Albums</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                selectedType === 'album'
                  ? 'bg-emerald-800 text-emerald-100'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {albumsCount}
            </span>
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="media-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or enter movie/series name to web categorize..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            id="media-search-submit-btn"
            type="submit"
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 transition shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
          >
            <Globe className="w-4 h-4 text-indigo-200" />
            <span>Search</span>
          </button>
        </form>
      </div>

      {/* 2-COLUMN LAYOUT: Filter Sidebar (Multi-Select Genres + Date Slider) + Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* LEFT SEARCH SIDEBAR */}
        <aside className="lg:col-span-1 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-6 shadow-xl sticky top-20">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
              <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
              <span>Search Filters</span>
            </h3>

            {isAnyFilterActive && (
              <button
                id="btn-sidebar-reset-filters"
                onClick={handleResetAllFilters}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium transition cursor-pointer"
              >
                Reset All
              </button>
            )}
          </div>

          {/* DATE-RANGE SLIDER SECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Release Year Range</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-700/60 text-cyan-300 font-mono font-bold text-[11px]">
                {yearRange[0]} — {yearRange[1]}
              </span>
            </div>

            {/* Range Slider Controls */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>From: {yearRange[0]}</span>
                <span>To: {yearRange[1]}</span>
              </div>

              {/* Min Year Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Start Year</span>
                  <span className="font-mono text-slate-400">{yearRange[0]}</span>
                </div>
                <input
                  id="filter-year-min-slider"
                  type="range"
                  min={minLibraryYear}
                  max={maxLibraryYear}
                  value={yearRange[0]}
                  onChange={(e) => {
                    const newMin = Math.min(Number(e.target.value), yearRange[1]);
                    setYearRange([newMin, yearRange[1]]);
                  }}
                  className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>

              {/* Max Year Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>End Year</span>
                  <span className="font-mono text-slate-400">{yearRange[1]}</span>
                </div>
                <input
                  id="filter-year-max-slider"
                  type="range"
                  min={minLibraryYear}
                  max={maxLibraryYear}
                  value={yearRange[1]}
                  onChange={(e) => {
                    const newMax = Math.max(Number(e.target.value), yearRange[0]);
                    setYearRange([yearRange[0], newMax]);
                  }}
                  className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>

              {/* Quick Decade Presets */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  onClick={() => setYearRange([2020, 2026])}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                    yearRange[0] === 2020 && yearRange[1] === 2026
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  2020s
                </button>
                <button
                  onClick={() => setYearRange([2010, 2019])}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                    yearRange[0] === 2010 && yearRange[1] === 2019
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  2010s
                </button>
                <button
                  onClick={() => setYearRange([2000, 2009])}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                    yearRange[0] === 2000 && yearRange[1] === 2009
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  2000s
                </button>
                <button
                  onClick={() => setYearRange([1970, 1999])}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                    yearRange[0] === 1970 && yearRange[1] === 1999
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Classic (&lt;2000)
                </button>
                <button
                  onClick={() => setYearRange([minLibraryYear, maxLibraryYear])}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 transition cursor-pointer"
                >
                  All Years
                </button>
              </div>
            </div>
          </div>

          {/* MULTI-SELECT GENRES CHECKBOXES SECTION */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-indigo-400" />
                <span>Genres Multi-Select</span>
                {selectedGenres.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-[10px] font-bold text-white font-mono">
                    {selectedGenres.length}
                  </span>
                )}
              </span>

              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  onClick={handleSelectAllGenres}
                  className="text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                >
                  All
                </button>
                <span className="text-slate-600">•</span>
                <button
                  onClick={handleClearAllGenres}
                  className="text-slate-400 hover:text-slate-300 font-medium cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Checkboxes List */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
              {availableGenres.map((g) => {
                const isChecked = selectedGenres.includes(g.name);
                return (
                  <label
                    key={g.name}
                    id={`checkbox-genre-${g.name.toLowerCase().replace(/\s+/g, '-')}`}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer select-none ${
                      isChecked
                        ? 'bg-indigo-950/60 text-white border border-indigo-500/40 font-semibold'
                        : 'hover:bg-slate-800/60 text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleGenre(g.name)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 bg-slate-900 cursor-pointer"
                      />
                      <span>{g.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        isChecked ? 'bg-indigo-800 text-indigo-200' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {g.count}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Quick Web Categorizer CTA in Sidebar */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/40 via-purple-950/30 to-slate-900 border border-indigo-500/20 text-xs space-y-2">
            <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <span>Categorize by Name</span>
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Enter any title to query web metadata and discover Sci-Fi, Drama, Comedy genres automatically.
            </p>
            <button
              onClick={() => {
                setCategorizerInitialQuery(searchQuery || '');
                setCategorizerInitialType(selectedType);
                setIsCategorizerModalOpen(true);
              }}
              className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition shadow cursor-pointer text-center"
            >
              Open Web Categorizer
            </button>
          </div>
        </aside>

        {/* RIGHT MAIN SECTION */}
        <main className="lg:col-span-3 space-y-5">
          {/* Categories Bar for Movies & TV Shows (Sci-Fi, Drama, Comedy, Action, etc.) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white flex items-center gap-1.5 text-sm">
                  <Tag className="w-4 h-4 text-indigo-400" />
                  <span>Movie & Series Categories</span>
                </span>
                <span className="text-slate-400 text-xs">Filter or search web categories by name</span>
              </div>

              <div className="flex items-center gap-2">
                {batchCategorizeSuccess && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-700/60 text-emerald-300 text-xs font-semibold animate-in fade-in">
                    {batchCategorizeSuccess}
                  </span>
                )}
                <button
                  onClick={handleBatchCategorizeAll}
                  disabled={isBatchCategorizing}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-indigo-300 hover:text-white text-xs font-semibold border border-indigo-500/30 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Query web metadata to auto-categorize all library items into Sci-Fi, Drama, Comedy, etc."
                >
                  <Wand2 className={`w-3.5 h-3.5 text-indigo-400 ${isBatchCategorizing ? 'animate-spin' : ''}`} />
                  <span>{isBatchCategorizing ? 'Categorizing Library...' : 'Auto-Categorize All'}</span>
                </button>
              </div>
            </div>

            {/* Category Horizontal Scroll Ribbon */}
            <div className="flex flex-wrap items-center gap-2 pt-1 overflow-x-auto pb-1">
              {MOVIE_SERIES_CATEGORIES.map((category) => {
                const isActive = activeCategory === category.id;
                const count = categoryCounts[category.id] || 0;

                return (
                  <button
                    key={category.id}
                    id={`category-pill-${category.id}`}
                    onClick={() => setActiveCategory(category.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
                      isActive
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                        : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>{category.icon}</span>
                    <span>{category.name}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isActive ? 'bg-indigo-900 text-indigo-100' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Filter Badges Bar */}
          {isAnyFilterActive && (
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 text-[11px] font-medium">Active Filters:</span>
                {activeCategory !== 'all' && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-950 border border-indigo-700/60 text-indigo-300 text-[11px] flex items-center gap-1">
                    <span>Category: {MOVIE_SERIES_CATEGORIES.find((c) => c.id === activeCategory)?.name}</span>
                    <button
                      onClick={() => setActiveCategory('all')}
                      className="hover:text-white ml-0.5 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {selectedGenres.map((genre) => (
                  <span
                    key={genre}
                    className="px-2 py-0.5 rounded-md bg-purple-950 border border-purple-700/60 text-purple-300 text-[11px] flex items-center gap-1"
                  >
                    <span>Genre: {genre}</span>
                    <button
                      onClick={() => handleToggleGenre(genre)}
                      className="hover:text-white ml-0.5 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(yearRange[0] > minLibraryYear || yearRange[1] < maxLibraryYear) && (
                  <span className="px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-700/60 text-cyan-300 text-[11px] flex items-center gap-1">
                    <span>Years: {yearRange[0]}–{yearRange[1]}</span>
                    <button
                      onClick={() => setYearRange([minLibraryYear, maxLibraryYear])}
                      className="hover:text-white ml-0.5 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {searchQuery.trim() && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-[11px] flex items-center gap-1">
                    <span>Query: "{searchQuery}"</span>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="hover:text-white ml-0.5 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>

              <button
                id="btn-reset-media-filters"
                onClick={handleResetAllFilters}
                className="text-[11px] text-rose-400 hover:text-rose-300 font-medium underline cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          )}

          {/* Results Header Status */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <div>
              Showing <span className="text-white font-bold">{filteredMedia.length}</span> media item
              {filteredMedia.length === 1 ? '' : 's'} in{' '}
              <span className="text-indigo-400 font-semibold capitalize">
                {activeCategory !== 'all'
                  ? MOVIE_SERIES_CATEGORIES.find((c) => c.id === activeCategory)?.name
                  : selectedType === 'all'
                  ? 'All Media'
                  : selectedType === 'series'
                  ? 'TV Series'
                  : selectedType === 'movie'
                  ? 'Movies'
                  : 'Music Albums'}
              </span>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-200 underline"
              >
                Clear Search
              </button>
            )}
          </div>

          {/* Empty State */}
          {filteredMedia.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400">
                <Globe className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-white">No media found for this category/filter</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                You can search the web by title to discover and download categories, plot synopses, and folder paths directly.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleResetAllFilters}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  Reset Filters
                </button>
                <button
                  onClick={() => handleOpenCategorizerForTitle(searchQuery || 'Severance')}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md shadow-indigo-600/30 cursor-pointer"
                >
                  <Globe className="w-4 h-4" />
                  <span>Search Web for "{searchQuery || 'Title'}"</span>
                </button>
              </div>
            </div>
          )}

          {/* Media Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredMedia.map((media) => {
              const isPushed = pushedIds[media.id];
              const isCopied = copiedNfoId === media.id;
              const isSavedWatchlist = watchlistIds.has(media.id);
              const isImported =
                media.id.startsWith('imported-') ||
                media.id.startsWith('batch-') ||
                Boolean(media.matchedFilename);

              return (
                <div
                  key={media.id}
                  id={`media-card-${media.id}`}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg flex flex-col transition-all group"
                >
                  {/* Media Poster & Header Image */}
                  <div className="relative h-48 sm:h-52 bg-slate-950 overflow-hidden">
                    <img
                      src={media.fanartUrl || media.posterUrl}
                      alt={media.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-70 group-hover:opacity-85"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>

                    {/* Type Badge & Origin Badge */}
                    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
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

                      {isImported && (
                        <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 shadow">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Imported
                        </span>
                      )}

                      {media.certification && (
                        <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-slate-300 text-[10px] font-semibold">
                          {media.certification}
                        </span>
                      )}
                    </div>

                    {/* Rating badge & Watchlist toggle button */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {/* Watchlist Toggle Button */}
                      <button
                        id={`watchlist-toggle-${media.id}`}
                        onClick={(e) => toggleWatchlist(media, e)}
                        className={`p-1.5 rounded-lg transition cursor-pointer shadow-md backdrop-blur-md border ${
                          isSavedWatchlist
                            ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
                            : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                        }`}
                        title={isSavedWatchlist ? 'Remove from My Watchlist' : 'Add to My Watchlist'}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${isSavedWatchlist ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>

                      <button
                        onClick={() => handleOpenCategorizerForTitle(media.title, media.type)}
                        className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer shadow-md"
                        title="Search web for updated categories and metadata"
                      >
                        <Globe className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1 bg-slate-900/90 border border-amber-500/30 px-2 py-1 rounded-lg text-amber-400 text-xs font-bold shadow-md">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>{media.rating.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Quick Play/Preview Overlay on Hover */}
                    <button
                      onClick={() => onPlayMedia ? onPlayMedia(media) : onOpenDetails(media)}
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
                      {media.genres.slice(0, 4).map((g, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            const matchedCat = MOVIE_SERIES_CATEGORIES.find((c) =>
                              c.keywords.some((k) => g.toLowerCase().includes(k))
                            );
                            if (matchedCat) {
                              setActiveCategory(matchedCat.id);
                            } else {
                              handleToggleGenre(g);
                            }
                          }}
                          className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-indigo-900/60 text-slate-300 hover:text-indigo-200 text-[11px] border border-slate-700/60 transition cursor-pointer"
                        >
                          {g}
                        </button>
                      ))}
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

                    {/* Target Samba Folder Path info */}
                    <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <HardDrive className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">
                          {media.matchedFilename ? `File: ${media.matchedFilename}` : `//${sambaConfig.server}/${sambaConfig.share}/${media.recommendedFolderStructure}`}
                        </span>
                      </div>
                    </div>

                    {/* Actions Button Grid */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      {/* Primary Download & Push row */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          id={`btn-download-bundle-${media.id}`}
                          onClick={() => downloadMediaBundleZip(media)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm cursor-pointer"
                          title="Download complete ZIP package containing .nfo, posters, XML, subtitle templates"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download ZIP</span>
                        </button>

                        <button
                          id={`btn-push-samba-${media.id}`}
                          onClick={() => handlePush(media)}
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

                      {/* Secondary Play, Details, SQLite, Watchlist, Web Categorizer & NFO buttons */}
                      <div className="grid grid-cols-5 gap-1 text-[11px]">
                        <button
                          id={`btn-play-media-${media.id}`}
                          onClick={() => onPlayMedia ? onPlayMedia(media) : onOpenDetails(media)}
                          className="flex items-center justify-center gap-1 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-500 text-white font-semibold transition cursor-pointer shadow-sm"
                          title="Play & Stream Media"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>Play</span>
                        </button>

                        <button
                          id={`btn-inspect-${media.id}`}
                          onClick={() => onOpenDetails(media)}
                          className="flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>Info</span>
                        </button>

                        <button
                          id={`btn-watchlist-card-${media.id}`}
                          onClick={(e) => toggleWatchlist(media, e)}
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
                          onClick={() => handleSaveToSqlite(media)}
                          className={`flex items-center justify-center gap-1 py-1.5 rounded transition cursor-pointer ${
                            savedDbIds[media.id]
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800/80 hover:bg-slate-700 text-emerald-300'
                          }`}
                          title="Store Title and Synopsis in SQLite database"
                        >
                          {savedDbIds[media.id] ? (
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
                          onClick={() => onOpenInNfoStudio(media)}
                          className="flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          <span>XML</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
};
