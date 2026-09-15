import React, { useState, useMemo, useRef } from 'react';
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
} from 'lucide-react';
import { MediaMetadata, MediaType, SambaConfig, EpisodeMetadata, TrackMetadata } from '../types';
import { downloadMediaBundleZip } from '../utils/zipDownloader';
import { generateMetadataFile } from '../utils/nfoGenerator';

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
  isSyncing?: boolean;
  selectedMediaType?: 'all' | MediaType;
  onSelectMediaType?: (type: 'all' | MediaType) => void;
}

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
  isSyncing = false,
  selectedMediaType,
  onSelectMediaType,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute live counts across the library
  const allCount = mediaLibrary.length;
  const seriesCount = mediaLibrary.filter((m) => m.type === 'series').length;
  const moviesCount = mediaLibrary.filter((m) => m.type === 'movie').length;
  const albumsCount = mediaLibrary.filter((m) => m.type === 'album').length;
  const importedCount = mediaLibrary.filter(
    (m) => m.id.startsWith('imported-') || m.id.startsWith('batch-') || m.matchedFilename
  ).length;

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

  // Extract all available release years with item counts
  const availableYears = useMemo(() => {
    const yearMap = new Map<number, number>();
    mediaLibrary.forEach((m) => {
      if (selectedType !== 'all' && m.type !== selectedType) return;
      if (m.year) {
        yearMap.set(m.year, (yearMap.get(m.year) || 0) + 1);
      }
    });
    return Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, count]) => ({ year, count }));
  }, [mediaLibrary, selectedType]);

  // Filter items based on type, origin, genre, release year, and search query
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

      // Direct Genre filter
      if (selectedGenre !== 'all') {
        const hasGenre = media.genres?.some(
          (g) => g.toLowerCase() === selectedGenre.toLowerCase()
        );
        if (!hasGenre) return false;
      }

      // Direct Year filter
      if (selectedYear !== 'all') {
        if (selectedYear === '2020s') {
          if (!media.year || media.year < 2020) return false;
        } else if (selectedYear === '2010s') {
          if (!media.year || media.year < 2010 || media.year > 2019) return false;
        } else if (selectedYear === 'classic') {
          if (!media.year || media.year >= 2010) return false;
        } else {
          const targetYear = Number(selectedYear);
          if (media.year !== targetYear) return false;
        }
      }

      // Search Query (Supports plain text or specialized tags like 'genre:scifi' or 'year:2024')
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
  }, [mediaLibrary, selectedType, originFilter, selectedGenre, selectedYear, searchQuery]);

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
      setIsLoading(true);
      try {
        const targetType = selectedType === 'all' ? 'movie' : selectedType;
        const res = await fetch('/api/metadata/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, type: targetType }),
        });

        const data = await res.json();
        if (data.success && data.data && onImportFiles) {
          // Add newly discovered AI metadata into the library
          onImportFiles([query]);
        }
      } catch (err) {
        console.error('Search scrape error:', err);
      } finally {
        setIsLoading(false);
      }
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

      {/* Top Banner & Quick Import Bar */}
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
              <span>Unified Media Scraper, Network Sync & Ingestion</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              All Media Library & Network Downloader
            </h1>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Populated with <span className="text-white font-semibold">{allCount}</span> total items ({seriesCount} TV Series, {moviesCount} Movies, and {albumsCount} Music Albums) discovered from your Samba share and local file imports.
            </p>
          </div>

          {/* Quick Import & Sync Actions */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              id="btn-import-files-direct"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 transition cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Import Files (Video/Audio/NFO)</span>
            </button>

            {onSyncFromSamba && (
              <button
                id="btn-sync-samba-all-media"
                onClick={onSyncFromSamba}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
              >
                <FolderSync className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Scanning Share...' : 'Sync from Samba Share'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-medium">Quick Suggestions:</span>
            <button
              id="preset-severance"
              onClick={() => handlePresetClick('Severance', 'series')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              📺 Severance (2022)
            </button>
            <button
              id="preset-breaking-bad"
              onClick={() => handlePresetClick('Breaking Bad', 'series')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              📺 Breaking Bad
            </button>
            <button
              id="preset-dune-two"
              onClick={() => handlePresetClick('Dune', 'movie')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              🎬 Dune: Part Two (2024)
            </button>
            <button
              id="preset-interstellar"
              onClick={() => handlePresetClick('Interstellar', 'movie')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              🎬 Interstellar (2014)
            </button>
            <button
              id="preset-daft-punk"
              onClick={() => handlePresetClick('Random Access Memories', 'album')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              🎵 Daft Punk - RAM
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Filter Origin:</span>
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

      {/* Main Tabs (All Media, TV Series, Movies, Music Albums) & Search Bar */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        {/* Category Tabs with live counts */}
        <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs sm:text-sm overflow-x-auto">
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
              placeholder="Search title, genre (e.g. 'Sci-Fi'), year (e.g. '2024'), files..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            id="media-search-submit-btn"
            type="submit"
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 transition shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Scraping...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>Search</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Quick Filter Bar: Genre & Release Year Selectors */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-inner">
        <div className="flex flex-wrap items-center gap-3">
          {/* Genre Filter Dropdown & Quick Badges */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>Genre:</span>
            </span>
            <select
              id="filter-genre-select"
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer text-xs"
            >
              <option value="all">All Genres ({mediaLibrary.length})</option>
              {availableGenres.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name} ({g.count})
                </option>
              ))}
            </select>
          </div>

          {/* Release Year Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>Year:</span>
            </span>
            <select
              id="filter-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer text-xs"
            >
              <option value="all">All Years</option>
              <option value="2020s">2020s Decade</option>
              <option value="2010s">2010s Decade</option>
              <option value="classic">Classic (&lt; 2010)</option>
              {availableYears.map((y) => (
                <option key={y.year} value={String(y.year)}>
                  {y.year} ({y.count})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Popular Genre Pills */}
          <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-800">
            {availableGenres.slice(0, 5).map((g) => {
              const isPillActive = selectedGenre.toLowerCase() === g.name.toLowerCase();
              return (
                <button
                  key={g.name}
                  id={`quick-genre-${g.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  onClick={() => setSelectedGenre(isPillActive ? 'all' : g.name)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
                    isPillActive
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Filter Badges & Reset */}
        {(selectedGenre !== 'all' || selectedYear !== 'all' || searchQuery.trim()) && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Active:</span>
            {selectedGenre !== 'all' && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-950 border border-indigo-700/60 text-indigo-300 text-[11px] flex items-center gap-1">
                <span>Genre: {selectedGenre}</span>
                <button
                  onClick={() => setSelectedGenre('all')}
                  className="hover:text-white ml-0.5 cursor-pointer"
                >
                  ×
                </button>
              </span>
            )}
            {selectedYear !== 'all' && (
              <span className="px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-700/60 text-cyan-300 text-[11px] flex items-center gap-1">
                <span>Year: {selectedYear}</span>
                <button
                  onClick={() => setSelectedYear('all')}
                  className="hover:text-white ml-0.5 cursor-pointer"
                >
                  ×
                </button>
              </span>
            )}
            <button
              id="btn-reset-media-filters"
              onClick={() => {
                setSelectedGenre('all');
                setSelectedYear('all');
                setSearchQuery('');
              }}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-medium underline cursor-pointer ml-1"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Results Header Status */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <div>
          Showing <span className="text-white font-bold">{filteredMedia.length}</span> media item
          {filteredMedia.length === 1 ? '' : 's'} in{' '}
          <span className="text-indigo-400 font-semibold capitalize">
            {selectedType === 'all'
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
            <Layers className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-white">No media found</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            No media matches your current filter ({selectedType}) and search query. You can drop files
            here to import them or click "Sync from Samba Share".
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedType('all');
                setOriginFilter('all');
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              Reset Filters
            </button>
            {onOpenManualMatch && (
              <button
                onClick={() => onOpenManualMatch(searchQuery, selectedType !== 'all' ? selectedType : undefined)}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-md shadow-purple-600/20 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Enter Name Manually & Fetch Synopsis</span>
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              Import Files Now
            </button>
          </div>
        </div>
      )}

      {/* Media Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMedia.map((media) => {
          const isPushed = pushedIds[media.id];
          const isCopied = copiedNfoId === media.id;
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

                {/* Rating badge */}
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-900/90 border border-amber-500/30 px-2 py-1 rounded-lg text-amber-400 text-xs font-bold shadow-md">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{media.rating.toFixed(1)}</span>
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
                {/* Genres */}
                <div className="flex flex-wrap gap-1.5">
                  {media.genres.slice(0, 3).map((g, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60"
                    >
                      {g}
                    </span>
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

                {/* Target Samba Folder Path info / matched file */}
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

                  {/* Secondary Play, Details, SQLite & NFO buttons */}
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
                      id={`btn-copy-nfo-${media.id}`}
                      onClick={() => handleCopyNfo(media)}
                      className="flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-indigo-400" />
                          <span>NFO</span>
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
    </div>
  );
};
