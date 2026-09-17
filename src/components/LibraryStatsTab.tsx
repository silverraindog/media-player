import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  PieChart as PieChartIcon,
  HardDrive,
  Film,
  Tv,
  Music,
  RefreshCw,
  TrendingUp,
  Database,
  ArrowUpDown,
  Download,
  Filter,
  CheckCircle2,
  Calendar,
  Star,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  LibraryDistributionStatsResponse,
  GenreDistributionItem,
  MediaTypeDistributionItem,
  DecadeDistributionItem,
  LargestMediaItem,
  MediaType,
  MediaMetadata,
} from '../types';

interface LibraryStatsTabProps {
  onNavigateToVault: () => void;
  onOpenDetails?: (media: MediaMetadata) => void;
}

type GenreSortOption = 'storage-desc' | 'count-desc' | 'rating-desc' | 'name-asc';

export const LibraryStatsTab: React.FC<LibraryStatsTabProps> = ({
  onNavigateToVault,
  onOpenDetails,
}) => {
  const [statsData, setStatsData] = useState<LibraryDistributionStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [genreSort, setGenreSort] = useState<GenreSortOption>('storage-desc');
  const [selectedMediaType, setSelectedMediaType] = useState<'all' | MediaType>('all');
  const [storageUnit, setStorageUnit] = useState<'GB' | 'MB'>('GB');
  const [chartViewMode, setChartViewMode] = useState<'storage' | 'count'>('storage');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchStats = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/db/stats/distribution');
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data: LibraryDistributionStatsResponse = await res.json();
      setStatsData(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load library distribution stats:', err);
      setError(err?.message || 'Failed to load SQLite vault distribution statistics');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Filter and sort genres for display
  const processedGenres = useMemo(() => {
    if (!statsData) return [];

    let list = statsData.genreDistribution.map((item) => {
      // If filtering by media type, adjust values
      if (selectedMediaType === 'movie') {
        const estBytes = item.movieCount > 0 ? (item.totalBytes * item.movieCount) / item.totalCount : 0;
        return {
          ...item,
          totalCount: item.movieCount,
          totalGB: Number((estBytes / (1024 * 1024 * 1024)).toFixed(2)),
          totalBytes: estBytes,
        };
      }
      if (selectedMediaType === 'series') {
        const estBytes = item.seriesCount > 0 ? (item.totalBytes * item.seriesCount) / item.totalCount : 0;
        return {
          ...item,
          totalCount: item.seriesCount,
          totalGB: Number((estBytes / (1024 * 1024 * 1024)).toFixed(2)),
          totalBytes: estBytes,
        };
      }
      if (selectedMediaType === 'album') {
        const estBytes = item.albumCount > 0 ? (item.totalBytes * item.albumCount) / item.totalCount : 0;
        return {
          ...item,
          totalCount: item.albumCount,
          totalGB: Number((estBytes / (1024 * 1024 * 1024)).toFixed(2)),
          totalBytes: estBytes,
        };
      }
      return item;
    });

    if (selectedMediaType !== 'all') {
      list = list.filter((g) => g.totalCount > 0);
    }

    switch (genreSort) {
      case 'storage-desc':
        return [...list].sort((a, b) => b.totalGB - a.totalGB);
      case 'count-desc':
        return [...list].sort((a, b) => b.totalCount - a.totalCount);
      case 'rating-desc':
        return [...list].sort((a, b) => b.avgRating - a.avgRating);
      case 'name-asc':
        return [...list].sort((a, b) => a.genre.localeCompare(b.genre));
      default:
        return list;
    }
  }, [statsData, genreSort, selectedMediaType]);

  // Top 8 genres for main chart to keep visual clean & readable
  const topGenresChartData = useMemo(() => {
    return processedGenres.slice(0, 10).map((g) => ({
      genre: g.genre,
      storage: storageUnit === 'GB' ? g.totalGB : Number((g.totalGB * 1024).toFixed(0)),
      count: g.totalCount,
      percent: g.percentOfStorage,
      avgRating: g.avgRating,
      movieCount: g.movieCount,
      seriesCount: g.seriesCount,
      albumCount: g.albumCount,
    }));
  }, [processedGenres, storageUnit]);

  // Media type breakdown for pie chart
  const mediaTypePieData = useMemo(() => {
    if (!statsData) return [];
    return statsData.mediaTypeDistribution.map((item) => ({
      name: item.name,
      value: chartViewMode === 'storage' ? item.totalGB : item.count,
      count: item.count,
      totalGB: item.totalGB,
      percent: item.percent,
      color: item.color,
    }));
  }, [statsData, chartViewMode]);

  // Top heaviest media items
  const heaviestItems = useMemo(() => {
    if (!statsData) return [];
    let items = statsData.largestItems;
    if (selectedMediaType !== 'all') {
      items = items.filter((i) => i.mediaType === selectedMediaType);
    }
    return items.slice(0, 7).map((item) => ({
      id: item.id,
      title: (item.mediaType === 'series' ? 'Series / ' : item.mediaType === 'movie' ? 'Movies / ' : 'Albums / ') + (item.title.length > 20 ? item.title.substring(0, 19) + '…' : item.title),
      fullTitle: item.title,
      totalGB: item.totalGB,
      mediaType: item.mediaType,
      year: item.year,
      rating: item.rating,
    }));
  }, [statsData, selectedMediaType]);

  const exportSummaryJson = () => {
    if (!statsData) return;
    const blob = new Blob([JSON.stringify(statsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `samba-vault-library-stats-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Custom tooltips for Recharts
  const CustomGenreTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs backdrop-blur-md z-50 min-w-[200px]">
          <div className="font-semibold text-slate-100 text-sm border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between">
            <span>{label}</span>
            <span className="text-indigo-400 font-mono text-[11px]">{data.percent}% of vault</span>
          </div>
          <div className="space-y-1 text-slate-300">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Storage:</span>
              <span className="font-bold text-emerald-400 font-mono">
                {data.storage} {storageUnit}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Titles:</span>
              <span className="font-semibold text-slate-200">{data.count} items</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-800/80 text-[11px]">
              <span className="text-slate-400">Composition:</span>
              <span className="text-slate-300">
                {data.movieCount} Movies • {data.seriesCount} Series • {data.albumCount} Music
              </span>
            </div>
            {data.avgRating > 0 && (
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Avg Rating:</span>
                <span className="text-amber-400 font-semibold flex items-center gap-1">
                  ★ {data.avgRating}/10
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs backdrop-blur-md z-50">
          <div className="font-semibold text-slate-100 text-sm pb-1 flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: data.color }}
            />
            <span>{data.name}</span>
          </div>
          <div className="mt-1 space-y-1 text-slate-300">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Items Count:</span>
              <span className="font-semibold text-slate-100">{data.count} titles</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Vault Storage:</span>
              <span className="font-bold text-emerald-400 font-mono">{data.totalGB} GB</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Share of Catalog:</span>
              <span className="text-indigo-400 font-medium">{data.percent}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div id="library-stats-container" className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                  Library Stats & Storage Analytics
                  <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-md bg-indigo-950/80 border border-indigo-800/50 text-indigo-300">
                    Recharts • SQLite Vault
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Visualizing media distribution, GB allocations per genre, and format counts stored in your SQLite vault.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
              <button
                id="unit-gb-btn"
                onClick={() => setStorageUnit('GB')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  storageUnit === 'GB'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                GB
              </button>
              <button
                id="unit-mb-btn"
                onClick={() => setStorageUnit('MB')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  storageUnit === 'MB'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                MB
              </button>
            </div>

            <button
              id="refresh-stats-btn"
              onClick={fetchStats}
              disabled={isRefreshing}
              className="px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>

            <button
              id="export-stats-btn"
              onClick={exportSummaryJson}
              disabled={!statsData}
              className="px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export JSON</span>
            </button>

            <button
              id="goto-sqlite-vault-btn"
              onClick={onNavigateToVault}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
            >
              <Database className="w-3.5 h-3.5" />
              <span>SQLite Vault</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              Filter Format:
            </span>
            <div className="flex items-center gap-1 bg-slate-950/70 p-1 border border-slate-800 rounded-lg">
              <button
                id="filter-format-all"
                onClick={() => setSelectedMediaType('all')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  selectedMediaType === 'all'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Media
              </button>
              <button
                id="filter-format-movies"
                onClick={() => setSelectedMediaType('movie')}
                className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  selectedMediaType === 'movie'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Film className="w-3 h-3 text-indigo-400" />
                Movies Only
              </button>
              <button
                id="filter-format-series"
                onClick={() => setSelectedMediaType('series')}
                className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  selectedMediaType === 'series'
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tv className="w-3 h-3 text-purple-400" />
                TV Series Only
              </button>
              <button
                id="filter-format-albums"
                onClick={() => setSelectedMediaType('album')}
                className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  selectedMediaType === 'album'
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Music className="w-3 h-3 text-cyan-400" />
                Music Only
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              Genre Sort:
            </span>
            <select
              id="genre-sort-select"
              value={genreSort}
              onChange={(e) => setGenreSort(e.target.value as GenreSortOption)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="storage-desc">Storage Size ({storageUnit} High → Low)</option>
              <option value="count-desc">Title Count (High → Low)</option>
              <option value="rating-desc">Highest Rated Genre</option>
              <option value="name-asc">Alphabetical (A → Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={fetchStats}
            className="px-3 py-1 bg-rose-800/80 hover:bg-rose-700 text-white rounded text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Vault Storage</span>
            <HardDrive className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold font-mono text-white tracking-tight">
              {statsData ? statsData.summary.totalSizeGB : '0.0'}
              <span className="text-xs font-normal text-slate-400 ml-1">GB</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              SQLite Indexed
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Titles</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold font-mono text-white tracking-tight">
              {statsData ? statsData.summary.totalMediaItems : 0}
              <span className="text-xs font-normal text-slate-400 ml-1">items</span>
            </div>
            <div className="text-[11px] text-indigo-300 mt-1 font-medium">
              Across {statsData ? statsData.summary.uniqueGenresCount : 0} genres
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Movies vs Series</span>
            <Film className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2.5">
            <div className="text-lg font-bold text-white tracking-tight flex items-baseline gap-1.5">
              <span className="text-indigo-400">{statsData?.summary.movieCount || 0}</span>
              <span className="text-xs text-slate-500">/</span>
              <span className="text-purple-400">{statsData?.summary.seriesCount || 0}</span>
              <span className="text-xs text-slate-500">/</span>
              <span className="text-cyan-400">{statsData?.summary.albumCount || 0}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Film • TV • Music
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Series Storage</span>
            <Tv className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold font-mono text-purple-300 tracking-tight">
              {statsData ? statsData.summary.seriesSizeGB : '0.0'}
              <span className="text-xs font-normal text-slate-400 ml-1">GB</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {statsData && statsData.summary.totalSizeGB > 0
                ? `${((statsData.summary.seriesSizeGB / statsData.summary.totalSizeGB) * 100).toFixed(0)}% of storage`
                : '0%'}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Movies Storage</span>
            <Film className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold font-mono text-indigo-300 tracking-tight">
              {statsData ? statsData.summary.movieSizeGB : '0.0'}
              <span className="text-xs font-normal text-slate-400 ml-1">GB</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {statsData && statsData.summary.totalSizeGB > 0
                ? `${((statsData.summary.movieSizeGB / statsData.summary.totalSizeGB) * 100).toFixed(0)}% of storage`
                : '0%'}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Avg Title Rating</span>
            <Star className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold font-mono text-amber-300 tracking-tight">
              ★ {statsData ? statsData.summary.avgRating : '0.0'}
              <span className="text-xs font-normal text-slate-400 ml-1">/10</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              High Quality Vault
            </div>
          </div>
        </div>
      </div>

      {/* Primary Visualizations: Recharts Bar Chart (GB per Genre) & Donut Chart (Movies vs Series vs Music) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart: Total GB per Genre */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  Media Distribution: Total Storage ({storageUnit}) per Genre
                </h3>
                <p className="text-xs text-slate-400">
                  Calculated storage consumption of media indexed in your SQLite vault, aggregated by genre tag.
                </p>
              </div>

              <div className="text-xs text-slate-400 font-mono">
                Top {topGenresChartData.length} Genres Shown
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="h-80 w-full pt-2">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-500" />
                  Computing Recharts distribution matrix…
                </div>
              ) : topGenresChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  No media genre data available. Add or scan titles into SQLite vault.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topGenresChartData}
                    margin={{ top: 10, right: 15, left: -10, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
                    <XAxis
                      dataKey="genre"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={45}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      unit={` ${storageUnit}`}
                    />
                    <Tooltip content={<CustomGenreTooltip />} />
                    <Bar
                      dataKey="storage"
                      name={`Storage (${storageUnit})`}
                      fill="#6366f1"
                      radius={[6, 6, 0, 0]}
                    >
                      {topGenresChartData.map((entry, index) => {
                        // Alternate subtle gradient colors
                        const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b'];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
              <span>Multi-genre items are counted under each associated category</span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              Source: SQLite `media_items` table
            </span>
          </div>
        </div>

        {/* Secondary Chart: Donut Chart (Movies vs Series vs Music) */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-purple-400" />
                  Format Breakdown
                </h3>
                <p className="text-xs text-slate-400">
                  {chartViewMode === 'storage' ? 'Storage share (GB)' : 'Item count ratio'}
                </p>
              </div>

              {/* Toggle storage vs count */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                <button
                  id="chart-mode-storage-btn"
                  onClick={() => setChartViewMode('storage')}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    chartViewMode === 'storage'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  GB
                </button>
                <button
                  id="chart-mode-count-btn"
                  onClick={() => setChartViewMode('count')}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    chartViewMode === 'count'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Count
                </button>
              </div>
            </div>

            {/* Recharts Pie / Donut Chart */}
            <div className="h-56 w-full relative flex items-center justify-center">
              {isLoading ? (
                <div className="text-slate-500 text-xs">Loading chart…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Pie
                      data={mediaTypePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {mediaTypePieData.map((entry, index) => (
                        <Cell key={`pie-cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}

              {/* Center donut text */}
              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs text-slate-400">Total</span>
                <span className="text-lg font-bold font-mono text-white">
                  {chartViewMode === 'storage'
                    ? `${statsData?.summary.totalSizeGB || 0} GB`
                    : `${statsData?.summary.totalMediaItems || 0} Items`}
                </span>
              </div>
            </div>

            {/* Custom Format Legend */}
            <div className="mt-2 space-y-2">
              {mediaTypePieData.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-semibold text-slate-200">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{item.count} items</span>
                    <span className="font-mono font-bold text-emerald-400">{item.totalGB} GB</span>
                    <span className="text-[11px] text-slate-500 w-9 text-right font-mono">
                      {item.percent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Row: Composed Chart (GB vs Count Correlation) & Decade Distribution Area Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Composed Chart: Genre Storage vs Title Count */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Storage Density: GB vs Title Count Correlation
              </h3>
              <p className="text-xs text-slate-400">
                Comparing storage impact (Bars) vs quantity of titles (Line) across genres.
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={topGenresChartData.slice(0, 8)}
                  margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis dataKey="genre" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="left" stroke="#6366f1" fontSize={11} tickLine={false} unit=" GB" />
                  <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={11} tickLine={false} />
                  <Tooltip content={<CustomGenreTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar yAxisId="left" dataKey="storage" name="Storage (GB)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="count" name="Title Count" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Release Decade Distribution Area Chart */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                Vault Timeline: Storage by Release Decade
              </h3>
              <p className="text-xs text-slate-400">
                Media release distribution chronologically across decades.
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            {isLoading || !statsData ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={statsData.decadeDistribution}
                  margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                >
                  <defs>
                    <linearGradient id="decadeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis dataKey="decade" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit=" GB" />
                  <Tooltip
                    formatter={(val: any) => [`${val} GB`, 'Storage']}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalGB"
                    name="Storage (GB)"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#decadeGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Storage Usage Horizontal Bar Chart */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-rose-400" />
              Largest Storage Consumers in SQLite Vault (Top Titles)
            </h3>
            <p className="text-xs text-slate-400">
              Shows largest single media entries (4K HDR UHD series box-sets and high-bitrate films).
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Sorted by Total GB Descending
          </span>
        </div>

        <div className="h-64 w-full">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              Loading…
            </div>
          ) : heaviestItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              No media items found.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={heaviestItems}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} unit=" GB" />
                <YAxis
                  dataKey="title"
                  type="category"
                  stroke="#cbd5e1"
                  fontSize={11}
                  tickLine={false}
                  width={110}
                />
                <Tooltip
                  formatter={(val: any, name: any, item: any) => [
                    `${val} GB (${item.payload.mediaType.toUpperCase()} • ${item.payload.year || 'N/A'})`,
                    'Storage Size',
                  ]}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar
                  dataKey="totalGB"
                  fill="#f43f5e"
                  radius={[0, 6, 6, 0]}
                  barSize={18}
                >
                  {heaviestItems.map((entry, index) => {
                    const color = entry.mediaType === 'series' ? '#a855f7' : entry.mediaType === 'album' ? '#06b6d4' : '#6366f1';
                    return <Cell key={`item-cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Comprehensive Genre Breakdown Data Table */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              Detailed Media Distribution by Genre
            </h3>
            <p className="text-xs text-slate-400">
              Exhaustive breakdown of counts, formats, storage volume, and rating benchmarks stored in SQLite.
            </p>
          </div>

          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
            {processedGenres.length} Genres Indexed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Genre</th>
                <th className="py-3 px-4">Total Titles</th>
                <th className="py-3 px-4">Movies</th>
                <th className="py-3 px-4">TV Series</th>
                <th className="py-3 px-4">Music Albums</th>
                <th className="py-3 px-4 text-right">Vault Storage</th>
                <th className="py-3 px-4 text-center">Share of Vault</th>
                <th className="py-3 px-4 text-right">Avg Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {processedGenres.map((item, idx) => (
                <tr key={item.genre} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-100 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    <span>{item.genre}</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-200">
                    {item.totalCount}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {item.movieCount > 0 ? `${item.movieCount} films` : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {item.seriesCount > 0 ? `${item.seriesCount} shows` : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {item.albumCount > 0 ? `${item.albumCount} albums` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                    {storageUnit === 'GB' ? `${item.totalGB} GB` : `${(item.totalGB * 1024).toFixed(0)} MB`}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-20 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full"
                          style={{ width: `${Math.min(100, item.percentOfStorage * 2.5)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 w-10 text-right">
                        {item.percentOfStorage}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {item.avgRating > 0 ? (
                      <span className="text-amber-400 font-semibold font-mono">
                        ★ {item.avgRating}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
