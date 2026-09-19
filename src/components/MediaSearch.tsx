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
  ShieldCheck,
  Loader2,
  AlertCircle,
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
  Image as ImageIcon,
  Target,
  ArrowUpDown,
  TrendingUp,
  Info,
  HelpCircle,
  Languages,
  Bug,
} from 'lucide-react';
import { MediaMetadata, MediaType, SambaConfig, EpisodeMetadata, TrackMetadata, MediaSortOption, GenreAffinityScore, SambaShareNode } from '../types';
import { downloadMediaBundleZip, downloadMediaArtwork } from '../utils/zipDownloader';
import { generateMetadataFile } from '../utils/nfoGenerator';
import { WebSearchCategorizerModal } from './WebSearchCategorizerModal';
import { BulkSubtitlesModal } from './BulkSubtitlesModal';
import { globalSearchIndexer, SmartSearchSuggestion, IndexerTelemetry } from '../utils/globalSearchIndexer';
import { motion, AnimatePresence } from 'motion/react';

interface MediaSearchProps {
  mediaLibrary: MediaMetadata[];
  sambaTree?: SambaShareNode[];
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
  onOpenApiDebugger?: () => void;
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

export const FILE_TYPE_OPTIONS = [
  { value: 'all', label: 'All File Types' },
  { value: '.mkv', label: '.mkv (Matroska Video)' },
  { value: '.mp4', label: '.mp4 (MPEG-4 Video)' },
  { value: '.cbz', label: '.cbz (Comic Book Zip)' },
  { value: '.cbr', label: '.cbr (Comic Book RAR)' },
  { value: '.epub', label: '.epub (E-Book)' },
  { value: '.pdf', label: '.pdf (Document / Comic)' },
  { value: '.flac', label: '.flac (Lossless Audio)' },
  { value: '.mp3', label: '.mp3 (Audio MP3)' },
  { value: '.avi', label: '.avi (AVI Video)' },
  { value: '.mov', label: '.mov (QuickTime)' },
  { value: '.iso', label: '.iso (Disc Image)' },
];

/**
 * Extracts all file extensions associated with a media item across matchedFilename,
 * recommendedFilenames, recommendedFolderStructure, episodes, and tracks.
 */
export const getMediaFileExtensions = (media: MediaMetadata): string[] => {
  const exts = new Set<string>();

  const extract = (str?: string) => {
    if (!str) return;
    const matches = str.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/gi);
    if (matches) {
      matches.forEach((m) => {
        const ext = m.replace('.', '').toLowerCase();
        if (!['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'nfo', 'txt', 'html', 'json'].includes(ext)) {
          exts.add(`.${ext}`);
        }
      });
    }
  };

  if (media.matchedFilename) extract(media.matchedFilename);
  if (media.recommendedFolderStructure) extract(media.recommendedFolderStructure);
  if (media.recommendedFilenames) media.recommendedFilenames.forEach(extract);
  if (media.playbackUrl) extract(media.playbackUrl);
  if (media.localBlobUrl) extract(media.localBlobUrl);
  if (media.seasons) {
    media.seasons.forEach((s) => s.episodes?.forEach((e) => extract(e.playbackUrl)));
  }
  if (media.tracks) {
    media.tracks.forEach((t) => extract(t.playbackUrl));
  }

  // Canonical defaults based on metadata type if none explicitly present
  if (exts.size === 0) {
    if (media.type === 'movie' || media.type === 'series') {
      exts.add('.mkv');
      exts.add('.mp4');
    } else if (media.type === 'album') {
      exts.add('.flac');
      exts.add('.mp3');
    }
    const recLow = (media.recommendedFolderStructure || '').toLowerCase();
    if (recLow.includes('comic') || media.genres?.some((g) => g.toLowerCase().includes('comic'))) {
      exts.add('.cbz');
    }
    if (recLow.includes('book') || recLow.includes('ebook') || media.genres?.some((g) => g.toLowerCase().includes('book'))) {
      exts.add('.epub');
    }
  }

  return Array.from(exts);
};

export const MediaSearch: React.FC<MediaSearchProps> = ({
  mediaLibrary,
  sambaTree,
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
  onOpenApiDebugger,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedFileType, setSelectedFileType] = useState<string>('all');
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
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const toggleExpandCard = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedCardIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Watchlist state (persisted via SQLite)
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  // Recently Added state (loaded from SQLite)
  const [recentlyAdded, setRecentlyAdded] = useState<MediaMetadata[]>([]);
  const [isRecentLoading, setIsRecentLoading] = useState(false);
  const recentScrollRef = useRef<HTMLDivElement>(null);

  // Web Search Categorizer Modal State
  const [isCategorizerModalOpen, setIsCategorizerModalOpen] = useState(false);
  const [isBulkSubtitlesModalOpen, setIsBulkSubtitlesModalOpen] = useState(false);
  const [categorizerInitialQuery, setCategorizerInitialQuery] = useState('');
  const [categorizerInitialType, setCategorizerInitialType] = useState<MediaType | 'all'>('all');
  const [isBatchCategorizing, setIsBatchCategorizing] = useState(false);
  const [batchCategorizeSuccess, setBatchCategorizeSuccess] = useState<string | null>(null);

  // Watched / Unwatched persistent history check & Genre Affinity
  const [watchedItemsMap, setWatchedItemsMap] = useState<Record<string, { isCompleted: boolean; progress: number }>>({});
  const [rawHistory, setRawHistory] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<MediaSortOption>('affinity');
  const [showAffinityBreakdownModal, setShowAffinityBreakdownModal] = useState(false);

  // Global Search & Discovery Indexer State
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSearchSuggestion[]>([]);
  const [isSmartSearching, setIsSmartSearching] = useState(false);
  const [indexerTelemetry, setIndexerTelemetry] = useState<IndexerTelemetry>(globalSearchIndexer.getTelemetry());

  // Background indexing synchronization
  useEffect(() => {
    globalSearchIndexer.scheduleBackgroundIndexing(mediaLibrary, sambaTree);
  }, [mediaLibrary, sambaTree]);

  // Subscribe to telemetry updates
  useEffect(() => {
    return globalSearchIndexer.subscribe(() => {
      setIndexerTelemetry(globalSearchIndexer.getTelemetry());
    });
  }, []);

  // Trigger Smart Search when search query changes
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSmartSuggestions([]);
      setIsSmartSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSmartSearching(true);
      try {
        const res = await globalSearchIndexer.performSmartSearch(q, selectedType);
        setSmartSuggestions(res.suggestions);
      } catch (err) {
        console.warn('Smart search non-fatal error:', err);
      } finally {
        setIsSmartSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery, mediaLibrary, selectedType]);

  useEffect(() => {
    const fetchWatchStatus = async () => {
      try {
        const res = await fetch('/api/db/history?limit=500');
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
          setRawHistory(data.history);
          const map: Record<string, { isCompleted: boolean; progress: number }> = {};
          data.history.forEach((h: any) => {
            const isComp = h.is_completed || (h.progress_percentage || 0) >= 90;
            if (h.media_id) {
              map[h.media_id] = { isCompleted: isComp, progress: h.progress_percentage || 0 };
            }
            if (h.title) {
              map[h.title.toLowerCase()] = { isCompleted: isComp, progress: h.progress_percentage || 0 };
            }
          });
          setWatchedItemsMap(map);
        }
      } catch (err) {
        console.warn('Failed to load watch status badges:', err);
      }
    };
    fetchWatchStatus();
  }, [mediaLibrary]);

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

  // File Integrity verification state
  const [fileIntegrityMap, setFileIntegrityMap] = useState<Record<string, 'verifying' | 'reachable' | 'corrupted'>>({});

  const verifyFileIntegrity = async (media: MediaMetadata, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFileIntegrityMap((prev) => ({ ...prev, [media.id]: 'verifying' }));
    await new Promise((r) => setTimeout(r, 650));
    const isReachable = Math.random() > 0.15; // 85% success rate for simulation
    setFileIntegrityMap((prev) => ({
      ...prev,
      [media.id]: isReachable ? 'reachable' : 'corrupted',
    }));
  };
  const toggleWatchedStatus = async (media: MediaMetadata, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const watchInfo = watchedItemsMap[media.id] || watchedItemsMap[media.title.toLowerCase()];
    const isCurrentlyWatched = watchInfo?.isCompleted;
    const nextWatched = !isCurrentlyWatched;

    setWatchedItemsMap((prev) => ({
      ...prev,
      [media.id]: { isCompleted: nextWatched, progress: nextWatched ? 100 : 0 },
      [media.title.toLowerCase()]: { isCompleted: nextWatched, progress: nextWatched ? 100 : 0 },
    }));

    try {
      await fetch('/api/db/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_id: media.id,
          media_type: media.type,
          title: media.title,
          poster_url: media.posterUrl,
          duration_seconds: 7200,
          playback_position_seconds: nextWatched ? 7200 : 0,
          progress_percentage: nextWatched ? 100 : 0,
          is_completed: nextWatched ? 1 : 0,
        }),
      });
    } catch (err) {
      console.error('Failed to update watched status in DB:', err);
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

  // Calculate Genre Affinity from Watch History Data
  const { genreAffinityMap, topAffinityGenres, maxPossibleAffinityScore, totalWatchEventsCount } = useMemo(() => {
    const affinityMap: Record<string, GenreAffinityScore> = {};

    if (!rawHistory || rawHistory.length === 0) {
      return {
        genreAffinityMap: affinityMap,
        topAffinityGenres: [] as GenreAffinityScore[],
        maxPossibleAffinityScore: 0,
        totalWatchEventsCount: 0,
      };
    }

    let validEvents = 0;

    rawHistory.forEach((h: any) => {
      // Find matching media in library to discover genres
      const matched = mediaLibrary.find(
        (m) =>
          m.id === h.media_id ||
          m.id === h.series_id ||
          m.title.toLowerCase() === (h.title || '').toLowerCase()
      );

      let genres = matched?.genres && matched.genres.length > 0 ? matched.genres : [];

      // Fallback if not found in library
      if (genres.length === 0 && h.genres) {
        try {
          genres = JSON.parse(h.genres);
        } catch {
          genres = String(h.genres).split(',').map((g: string) => g.trim());
        }
      }

      if (genres.length === 0) return;
      validEvents++;

      const progress = typeof h.progress_percentage === 'number' ? h.progress_percentage : (h.is_completed ? 100 : 50);
      const isCompleted = Boolean(h.is_completed || progress >= 90);
      const durationSeconds = h.playback_position_seconds || h.duration_seconds || 1800;
      const durationMinutes = Math.round(durationSeconds / 60);

      // Score weight: Completed watch gives 2.5x base score, partial gives proportional score
      const progressWeight = isCompleted ? 2.5 : 1.0 + (progress / 100);
      // Duration bonus: longer watches contribute more affinity
      const durationBonus = Math.min(2.0, Math.max(0.5, durationMinutes / 45));
      const eventScore = progressWeight * durationBonus;

      genres.forEach((g: string) => {
        const key = g.trim().toLowerCase();
        if (!key) return;

        if (!affinityMap[key]) {
          affinityMap[key] = {
            genre: g.trim(),
            score: 0,
            watchCount: 0,
            totalDurationMinutes: 0,
            completedCount: 0,
          };
        }
        affinityMap[key].score += eventScore;
        affinityMap[key].watchCount += 1;
        affinityMap[key].totalDurationMinutes += durationMinutes;
        if (isCompleted) affinityMap[key].completedCount += 1;
      });
    });

    const topAffinityGenres = Object.values(affinityMap).sort((a, b) => b.score - a.score);

    // Calculate maximum affinity score among items in library for percentage scaling
    let maxPossible = 0;
    mediaLibrary.forEach((m) => {
      const score = (m.genres || []).reduce(
        (sum, g) => sum + (affinityMap[g.trim().toLowerCase()]?.score || 0),
        0
      );
      if (score > maxPossible) maxPossible = score;
    });

    return {
      genreAffinityMap: affinityMap,
      topAffinityGenres,
      maxPossibleAffinityScore: maxPossible,
      totalWatchEventsCount: validEvents,
    };
  }, [rawHistory, mediaLibrary]);

  // Helper to compute media affinity for a specific item
  const getMediaAffinity = (media: MediaMetadata) => {
    if (!media.genres || media.genres.length === 0 || topAffinityGenres.length === 0) {
      return { score: 0, percentage: 0, topMatchingGenre: null, matchingGenres: [] };
    }

    let totalScore = 0;
    let bestGenre: string | null = null;
    let bestScore = -1;
    const matching: string[] = [];

    media.genres.forEach((g) => {
      const entry = genreAffinityMap[g.trim().toLowerCase()];
      if (entry && entry.score > 0) {
        totalScore += entry.score;
        matching.push(entry.genre);
        if (entry.score > bestScore) {
          bestScore = entry.score;
          bestGenre = entry.genre;
        }
      }
    });

    const percentage =
      maxPossibleAffinityScore > 0
        ? Math.min(100, Math.round((totalScore / maxPossibleAffinityScore) * 100))
        : 0;

    return {
      score: totalScore,
      percentage,
      topMatchingGenre: bestGenre,
      matchingGenres: matching,
    };
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

  // Apply Sort to Filtered Media (prioritizing Genre Affinity when active)
  const sortedAndFilteredMedia = useMemo(() => {
    const list = [...filteredMedia];

    list.sort((a, b) => {
      if (sortBy === 'affinity') {
        const affA = getMediaAffinity(a).score;
        const affB = getMediaAffinity(b).score;
        if (affB !== affA) {
          return affB - affA; // Highest affinity first!
        }
        // Secondary tiebreaker: Rating descending
        const rA = a.rating || 0;
        const rB = b.rating || 0;
        if (rB !== rA) return rB - rA;
        // Tertiary: Year descending
        const yA = a.year || 0;
        const yB = b.year || 0;
        if (yB !== yA) return yB - yA;
        return a.title.localeCompare(b.title);
      }

      if (sortBy === 'rating-desc') {
        return (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title);
      }

      if (sortBy === 'year-desc') {
        return (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title);
      }

      if (sortBy === 'year-asc') {
        return (a.year || 0) - (b.year || 0) || a.title.localeCompare(b.title);
      }

      if (sortBy === 'title-asc') {
        return a.title.localeCompare(b.title);
      }

      if (sortBy === 'title-desc') {
        return b.title.localeCompare(a.title);
      }

      if (sortBy === 'recently-added') {
        const isImportedA =
          a.id.startsWith('imported-') || a.id.startsWith('batch-') || Boolean(a.matchedFilename);
        const isImportedB =
          b.id.startsWith('imported-') || b.id.startsWith('batch-') || Boolean(b.matchedFilename);
        if (isImportedA !== isImportedB) return isImportedA ? -1 : 1;
        return (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title);
      }

      return 0;
    });

    return list;
  }, [filteredMedia, sortBy, genreAffinityMap, maxPossibleAffinityScore, topAffinityGenres]);

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

  const handleApplySuggestion = (s: SmartSearchSuggestion) => {
    setSearchQuery(s.title);
    if (s.type) {
      setSelectedType(s.type);
    }
    if (s.preloadedMetadata && onSaveCategorizedMedia) {
      const exists = mediaLibrary.some((m) => m.id === s.preloadedMetadata!.id || m.title.toLowerCase() === s.title.toLowerCase());
      if (!exists) {
        onSaveCategorizedMedia(s.preloadedMetadata);
      }
    }
  };

  const handleInspectSuggestion = (s: SmartSearchSuggestion) => {
    if (s.preloadedMetadata) {
      onOpenDetails(s.preloadedMetadata);
    } else {
      handleOpenCategorizerForTitle(s.title, s.type);
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
        onOpenApiDebugger={onOpenApiDebugger}
        onSaveCategorizedMedia={(media) => {
          if (onSaveCategorizedMedia) {
            onSaveCategorizedMedia(media);
          }
        }}
        onPlayMedia={onPlayMedia}
        onOpenInNfoStudio={onOpenInNfoStudio}
        onOpenManualMatch={(media) => {
          setIsCategorizerModalOpen(false);
          if (onOpenManualMatch) {
            onOpenManualMatch(media.title, media.type);
          }
        }}
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
              id="btn-open-bulk-subtitles"
              onClick={() => setIsBulkSubtitlesModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-indigo-300 hover:text-white text-xs font-semibold border border-indigo-500/30 transition cursor-pointer shadow-sm"
              title="Automatically scan and fetch missing .srt subtitles for unwatched items"
            >
              <Languages className="w-4 h-4 text-indigo-400" />
              <span>Bulk Subtitles</span>
            </button>

            {onOpenApiDebugger && (
              <button
                id="btn-open-api-debugger-search"
                onClick={onOpenApiDebugger}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 hover:text-white text-xs font-semibold border border-amber-500/40 transition cursor-pointer shadow-sm"
                title="Open API Debugger to inspect outbound and inbound metadata requests (OMDb, TVMaze, TMDB)"
              >
                <Bug className="w-4 h-4 text-amber-400" />
                <span>API Debugger</span>
              </button>
            )}

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
              id="preset-24-series"
              onClick={() => handlePresetClick('24', 'series')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 transition cursor-pointer font-medium"
            >
              ⏱️ 24 (Action/Thriller)
            </button>
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
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                          {item.title}
                        </h3>
                        {/* Metadata Status Indicator Badge */}
                        {(() => {
                          const hasFull = item.posterUrl && !item.posterUrl.includes('unsplash.com') && item.overview && item.overview.length > 50;
                          return (
                            <div 
                              className={`shrink-0 w-2 h-2 rounded-full mt-1 ${hasFull ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`}
                              title={hasFull ? 'Full Metadata' : 'Partial Metadata (Missing Artwork or Synopsis)'}
                            />
                          );
                        })()}
                      </div>
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

          {/* Global Search & Discovery Indexer Status Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold text-slate-300">Global Search & Discovery Indexer</span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-slate-400">
                {indexerTelemetry.totalIndexedItems} indexed titles across TVMaze / TMDB / Local Vault
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isSmartSearching && (
                <span className="flex items-center gap-1 text-indigo-400 font-mono text-[10px]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Scanning alternate DBs...</span>
                </span>
              )}
              <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                Aliases: {indexerTelemetry.totalAliases} | Latency: ~{indexerTelemetry.lastQueryTimeMs.toFixed(1)}ms
              </span>
            </div>
          </div>

          {/* Smart Search & Discovery "Did you mean?" Suggestion Banner */}
          {smartSuggestions.length > 0 && searchQuery.trim().length > 0 && (
            <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 border border-indigo-500/50 rounded-2xl p-4 space-y-3 shadow-xl shadow-indigo-950/20">
              <div className="flex items-center justify-between pb-2 border-b border-indigo-800/40">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                  <h4 className="text-xs font-bold text-white">Smart Search & Discovery Suggestions</h4>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-900/70 text-indigo-200 text-[10px] font-mono border border-indigo-600/40">
                    TVMaze / TMDB Fallback
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {smartSuggestions.length} match{smartSuggestions.length > 1 ? 'es' : ''} found
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-indigo-200 flex items-center gap-1">
                  <span>💡 Did you mean:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {smartSuggestions.map((s, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950/80 border border-indigo-800/50 hover:border-indigo-400 rounded-xl space-y-2 transition shadow-sm group cursor-pointer"
                      onClick={() => handleApplySuggestion(s)}
                    >
                      <div className="flex items-start gap-2.5">
                        {s.posterUrl ? (
                          <img
                            src={s.posterUrl}
                            alt={s.title}
                            referrerPolicy="no-referrer"
                            className="w-10 h-14 object-cover rounded bg-slate-800 border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-14 rounded bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400 shrink-0">
                            {s.type === 'series' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white text-xs group-hover:text-indigo-300 transition truncate">
                              {s.title}
                            </span>
                            {s.year && (
                              <span className="text-[11px] text-slate-400 font-mono">
                                ({s.year})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-mono">
                            <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50 font-bold">
                              {Math.round(s.confidence)}% Match
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 border border-slate-700 uppercase">
                              {s.source}
                            </span>
                            {s.matchedAlias && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-700/50">
                                Alias: {s.matchedAlias}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {s.overview && (
                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                          {s.overview}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/60 text-[10px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplySuggestion(s);
                          }}
                          className="flex-1 py-1 px-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition text-center cursor-pointer"
                        >
                          Select "{s.title}"
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectSuggestion(s);
                          }}
                          className="py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition cursor-pointer"
                        >
                          Inspect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Results Header Status & Sort Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 px-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-2 flex-wrap">
              <div>
                Showing <span className="text-white font-bold">{sortedAndFilteredMedia.length}</span> media item
                {sortedAndFilteredMedia.length === 1 ? '' : 's'} in{' '}
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
                  className="text-slate-400 hover:text-slate-200 underline text-[11px] cursor-pointer"
                >
                  Clear Search
                </button>
              )}
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Quick 1-Click Genre Affinity Toggle Pill */}
              <button
                id="btn-toggle-genre-affinity"
                onClick={() => setSortBy(sortBy === 'affinity' ? 'rating-desc' : 'affinity')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  sortBy === 'affinity'
                    ? 'bg-gradient-to-r from-emerald-900/80 to-teal-900/80 border-emerald-500/60 text-emerald-200 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/40'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
                }`}
                title="Sort by user's most-watched genres from watch history"
              >
                <Sparkles className={`w-3.5 h-3.5 ${sortBy === 'affinity' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                <span>Genre Affinity</span>
                {topAffinityGenres.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-700/50">
                    {topAffinityGenres.length}
                  </span>
                )}
              </button>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-300">
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <label htmlFor="media-sort-select" className="text-[11px] text-slate-400 shrink-0 hidden sm:inline">
                  Sort:
                </label>
                <select
                  id="media-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as MediaSortOption)}
                  className="bg-transparent text-xs text-slate-200 focus:outline-hidden cursor-pointer font-medium"
                >
                  <option value="affinity" className="bg-slate-900 text-emerald-300">
                    🎯 Genre Affinity (Watch History)
                  </option>
                  <option value="rating-desc" className="bg-slate-900 text-slate-200">
                    ⭐ Highest Rating
                  </option>
                  <option value="year-desc" className="bg-slate-900 text-slate-200">
                    📅 Newest Releases
                  </option>
                  <option value="year-asc" className="bg-slate-900 text-slate-200">
                    📅 Oldest Releases
                  </option>
                  <option value="title-asc" className="bg-slate-900 text-slate-200">
                    🔤 Title (A → Z)
                  </option>
                  <option value="title-desc" className="bg-slate-900 text-slate-200">
                    🔤 Title (Z → A)
                  </option>
                  <option value="recently-added" className="bg-slate-900 text-slate-200">
                    ⚡ Recently Added / Imported
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Genre Affinity Active Profile Banner */}
          {sortBy === 'affinity' && (
            <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-teal-950/70 border border-emerald-500/40 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg shadow-emerald-950/20">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-900/60 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Genre Affinity Sort Active</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Personalized
                      </span>
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {topAffinityGenres.length > 0 ? (
                      <span>
                        Prioritizing your top watched genres:{' '}
                        <strong className="text-emerald-300">
                          {topAffinityGenres
                            .slice(0, 3)
                            .map((g) => `${g.genre} (${g.watchCount} watch${g.watchCount > 1 ? 'es' : ''})`)
                            .join(', ')}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        No watch history recorded yet. As you stream and finish items, your top genres will automatically boost here.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                {topAffinityGenres.length > 0 && (
                  <button
                    id="btn-open-affinity-breakdown"
                    onClick={() => setShowAffinityBreakdownModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Affinity Weights ({totalWatchEventsCount} events)</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {sortedAndFilteredMedia.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-6 shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400 shadow-inner">
                {smartSuggestions.length > 0 ? (
                  <Sparkles className="w-8 h-8 text-amber-400 animate-pulse" />
                ) : (
                  <Globe className="w-8 h-8 text-indigo-400" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">
                  {smartSuggestions.length > 0
                    ? `No local matches found for "${searchQuery}", but Smart Search found recommendations:`
                    : 'No media found for this category/filter'}
                </h3>
                <p className="text-sm text-slate-400 max-w-lg mx-auto">
                  {smartSuggestions.length > 0
                    ? 'Our Global Search Indexer queried TVMaze, TMDB and the Encyclopedic Vault to find the closest matches:'
                    : 'You can search the web by title to discover and download categories, plot synopses, and folder paths directly.'}
                </p>
              </div>

              {/* Suggestions in Empty State */}
              {smartSuggestions.length > 0 && (
                <div className="max-w-2xl mx-auto space-y-2 text-left pt-2">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Did you mean one of these titles?</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {smartSuggestions.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => handleApplySuggestion(s)}
                        className="p-3 bg-slate-950/90 border border-amber-500/30 hover:border-amber-400 rounded-xl flex items-center gap-3 transition cursor-pointer group shadow-sm"
                      >
                        {s.posterUrl ? (
                          <img
                            src={s.posterUrl}
                            alt={s.title}
                            referrerPolicy="no-referrer"
                            className="w-10 h-14 object-cover rounded bg-slate-800 border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-14 rounded bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
                            {s.type === 'series' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-white text-xs group-hover:text-amber-300 transition truncate">
                            {s.title} {s.year ? `(${s.year})` : ''}
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] font-mono mt-0.5">
                            <span className="text-emerald-400 font-bold">{Math.round(s.confidence)}% Match</span>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-400 uppercase">{s.source}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApplySuggestion(s);
                            }}
                            className="mt-1.5 text-[10px] text-amber-400 group-hover:text-amber-300 font-semibold underline"
                          >
                            Load "{s.title}" →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
            {sortedAndFilteredMedia.map((media) => {
              const isPushed = pushedIds[media.id];
              const isCopied = copiedNfoId === media.id;
              const isSavedWatchlist = watchlistIds.has(media.id);
              const isImported =
                media.id.startsWith('imported-') ||
                media.id.startsWith('batch-') ||
                Boolean(media.matchedFilename);
              const affinity = getMediaAffinity(media);

              const isExpanded = Boolean(expandedCardIds[media.id]);
              const watchInfo = watchedItemsMap[media.id] || watchedItemsMap[media.title.toLowerCase()];
              const isWatched = Boolean(watchInfo?.isCompleted);

              return (
                <motion.div
                  key={media.id}
                  id={`media-card-${media.id}`}
                  whileHover={{ scale: 1.015, y: -4, boxShadow: '0 20px 40px -15px rgba(99, 102, 241, 0.3)' }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-lg flex flex-col group cursor-pointer ${
                    sortBy === 'affinity' && affinity.percentage >= 60
                      ? 'border-emerald-500/50 hover:border-emerald-400/80 shadow-emerald-950/20'
                      : 'border-slate-800 hover:border-indigo-500/50'
                  }`}
                  onClick={(e) => toggleExpandCard(media.id, e)}
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

                    {/* Type Badge & Origin Badge & Affinity Badge */}
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

                      {/* Genre Affinity Match Score Badge */}
                      {sortBy === 'affinity' && affinity.percentage > 0 && (
                        <span
                          className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shadow-md backdrop-blur-xs"
                          title={`Affinity Score: ${affinity.score.toFixed(1)} based on ${affinity.topMatchingGenre} watch history`}
                        >
                          <Target className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{affinity.percentage}% Match</span>
                          {affinity.topMatchingGenre && (
                            <span className="text-emerald-200/70 font-normal">({affinity.topMatchingGenre})</span>
                          )}
                        </span>
                      )}

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

                      {/* Persistent Watched / Unwatched Badge */}
                      {isWatched ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 shadow">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          Watched
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700/60 text-slate-400 text-[10px] font-medium flex items-center gap-1 shadow">
                          <Clock className="w-2.5 h-2.5 text-slate-400" />
                          Unwatched
                        </span>
                      )}
                    </div>

                    {/* Rating badge & Watchlist/Watched toggle buttons */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {/* Watched Toggle Button */}
                      <button
                        id={`watched-toggle-${media.id}`}
                        onClick={(e) => toggleWatchedStatus(media, e)}
                        className={`p-1.5 rounded-lg transition cursor-pointer shadow-md backdrop-blur-md border ${
                          isWatched
                            ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50'
                            : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                        }`}
                        title={isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${isWatched ? 'text-emerald-400 fill-emerald-500/20' : ''}`} />
                      </button>

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

                      {media.posterUrl && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const filename = `${media.title.replace(/[/\\?%*:|"<>]/g, '_')}-${media.type === 'album' ? 'folder' : 'poster'}.jpg`;
                            downloadMediaArtwork(media.posterUrl, filename);
                          }}
                          className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-slate-700 transition cursor-pointer shadow-md"
                          title="Download high-resolution poster/cover image (.jpg)"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                        </button>
                      )}

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
                    {/* Categories & Genres Pills (with Affinity highlights) */}
                    <div className="flex flex-wrap gap-1.5">
                      {media.genres.slice(0, 4).map((g, idx) => {
                        const isAffinityMatched = (genreAffinityMap[g.trim().toLowerCase()]?.score || 0) > 0;
                        return (
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
                            className={`px-2 py-0.5 rounded-full text-[11px] border transition cursor-pointer flex items-center gap-1 ${
                              sortBy === 'affinity' && isAffinityMatched
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/90 font-medium'
                                : 'bg-slate-800 hover:bg-indigo-900/60 text-slate-300 hover:text-indigo-200 border-slate-700/60'
                            }`}
                            title={isAffinityMatched ? `Matched in your top watch genres (${genreAffinityMap[g.trim().toLowerCase()].watchCount} watches)` : undefined}
                          >
                            {sortBy === 'affinity' && isAffinityMatched && <Sparkles className="w-2.5 h-2.5 text-emerald-400" />}
                            <span>{g}</span>
                          </button>
                        );
                      })}
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

                    {/* Target Samba Folder Path info & Verify Integrity */}
                    <div className="space-y-1.5">
                      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <HardDrive className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">
                            {media.matchedFilename ? `File: ${media.matchedFilename}` : `//${sambaConfig.server}/${sambaConfig.share}/${media.recommendedFolderStructure}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <button
                          id={`btn-verify-integrity-${media.id}`}
                          onClick={(e) => verifyFileIntegrity(media, e)}
                          disabled={fileIntegrityMap[media.id] === 'verifying'}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Check Samba path accessibility and file checksum integrity"
                        >
                          {fileIntegrityMap[media.id] === 'verifying' ? (
                            <>
                              <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                              <span>Verifying Path...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span>Verify File Integrity</span>
                            </>
                          )}
                        </button>

                        {fileIntegrityMap[media.id] === 'reachable' && (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            File Verified & Accessible
                          </span>
                        )}

                        {fileIntegrityMap[media.id] === 'corrupted' && (
                          <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                            File Unreachable / Corrupted
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable Technical Metadata Toggle Bar */}
                    <button
                      id={`btn-expand-meta-${media.id}`}
                      onClick={(e) => toggleExpandCard(media.id, e)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{isExpanded ? 'Hide Technical Metadata' : 'View Bitrate, Audio & Subtitles'}</span>
                      </div>
                      <span className="text-[11px] text-indigo-400 font-mono">
                        {isExpanded ? '▲ Less' : '▼ More'}
                      </span>
                    </button>

                    {/* Expanded Technical Metadata Section */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="overflow-hidden space-y-3 pt-1 pb-1 text-xs text-slate-300"
                        >
                          <div className="p-3 rounded-xl bg-slate-950/90 border border-indigo-900/40 space-y-2.5 shadow-inner">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 font-medium flex items-center gap-1">
                                <HardDrive className="w-3 h-3 text-indigo-400" /> File Bitrate:
                              </span>
                              <span className="font-mono text-indigo-300 font-bold bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                                {media.type === 'album' ? '320 kbps (FLAC Lossless)' : media.type === 'series' ? '14.2 Mbps (HEVC 10-bit / 5.1ch)' : '18.8 Mbps (UHD Remux / Atmos)'}
                              </span>
                            </div>

                            <div>
                              <div className="text-slate-400 font-medium mb-1 flex items-center gap-1">
                                <Music className="w-3 h-3 text-emerald-400" /> Audio Track Languages:
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700 text-[11px] font-mono flex items-center gap-1">
                                  <span>🇺🇸</span> English (DTS-HD MA 5.1)
                                </span>
                                {media.type === 'series' && (
                                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700 text-[11px] font-mono flex items-center gap-1">
                                    <span>🇯🇵</span> Japanese (TrueHD Atmos 7.1)
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700 text-[11px] font-mono flex items-center gap-1">
                                  <span>🇫🇷</span> French (Stereo 2.0)
                                </span>
                              </div>
                            </div>

                            <div>
                              <div className="text-slate-400 font-medium mb-1 flex items-center gap-1">
                                <FileVideo className="w-3 h-3 text-teal-400" /> Full Subtitle List:
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <span className="px-2 py-0.5 rounded bg-teal-950/70 text-teal-300 border border-teal-800/50 text-[11px] font-mono flex items-center gap-1">
                                  <span>🇺🇸</span> English (.srt - Default)
                                </span>
                                <span className="px-2 py-0.5 rounded bg-teal-950/70 text-teal-300 border border-teal-800/50 text-[11px] font-mono flex items-center gap-1">
                                  <span>🇯🇵</span> Japanese (.ass - Signs & Songs)
                                </span>
                                <span className="px-2 py-0.5 rounded bg-teal-950/70 text-teal-300 border border-teal-800/50 text-[11px] font-mono flex items-center gap-1">
                                  <span>🇪🇸</span> Spanish (.vtt)
                                </span>
                                <span className="px-2 py-0.5 rounded bg-teal-950/70 text-teal-300 border border-teal-800/50 text-[11px] font-mono flex items-center gap-1">
                                  <span>🇩🇪</span> German (.srt)
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

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

                      {media.posterUrl && (
                        <button
                          id={`btn-download-art-${media.id}`}
                          onClick={() => {
                            const filename = `${media.title.replace(/[/\\?%*:|"<>]/g, '_')}-${media.type === 'album' ? 'folder' : 'poster'}.jpg`;
                            downloadMediaArtwork(media.posterUrl, filename);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-indigo-300 hover:text-indigo-200 border border-slate-700/80 text-[11px] font-semibold transition cursor-pointer"
                          title="Download standalone high-resolution poster / cover art image (.jpg)"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Download Artwork (.jpg)</span>
                        </button>
                      )}

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

                  {/* Thin Colored Progress Bar at Bottom of Media Card */}
                  {(() => {
                    const watchInfo = watchedItemsMap[media.id] || watchedItemsMap[media.title.toLowerCase()];
                    const progressPercent = watchInfo?.progress || (watchInfo?.isCompleted ? 100 : 0);
                    if (progressPercent <= 0) return null;
                    return (
                      <div className="w-full bg-slate-800 h-1.5 overflow-hidden rounded-b-2xl">
                        <div
                          className={`h-full transition-all duration-300 ${
                            progressPercent >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                          title={`Watch Progress: ${Math.round(progressPercent)}%`}
                        />
                      </div>
                    );
                  })()}
                </motion.div>
              );
            })}
          </div>
        </main>
      </div>

      {/* Genre Affinity Breakdown Modal */}
      {showAffinityBreakdownModal && (
        <div
          id="genre-affinity-breakdown-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Genre Affinity Breakdown</h3>
                  <p className="text-xs text-slate-400">
                    Calculated dynamically from your watch history and completion rates
                  </p>
                </div>
              </div>
              <button
                id="btn-close-affinity-modal"
                onClick={() => setShowAffinityBreakdownModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explanation box */}
            <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-slate-300 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-emerald-300">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>How Affinity Scoring Works</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Each watch session contributes to genre weights. Completed movies & series award <strong>2.5× weight</strong>, partial progress scales by watched percentage, and longer watch durations provide proportional bonuses.
              </p>
            </div>

            {/* Genres score bars list */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Top Watched Genres ({topAffinityGenres.length})
              </h4>

              {topAffinityGenres.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs italic">
                  No watch history recorded yet. Start watching media to generate affinity scores!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topAffinityGenres.map((affinity) => (
                    <div
                      key={affinity.genre}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm capitalize">
                            {affinity.genre}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/50 text-emerald-300 font-mono text-[10px] font-bold">
                            {affinity.percentage}% Affinity
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 text-[11px] font-mono">
                          <span>{affinity.watchCount} watch{affinity.watchCount !== 1 ? 'es' : ''}</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-emerald-400">{affinity.completedCount} completed</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(8, affinity.percentage))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Total history events: <strong className="text-slate-200">{totalWatchEventsCount}</strong>
              </span>
              <button
                onClick={() => setShowAffinityBreakdownModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Subtitles Fetcher Modal */}
      <BulkSubtitlesModal
        isOpen={isBulkSubtitlesModalOpen}
        onClose={() => setIsBulkSubtitlesModalOpen(false)}
        mediaLibrary={mediaLibrary}
        watchedItemsMap={watchedItemsMap}
      />
    </div>
  );
};
