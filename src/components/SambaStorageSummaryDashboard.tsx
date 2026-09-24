import React, { useState, useMemo } from 'react';
import {
  Film,
  Tv,
  Music,
  HardDrive,
  FolderTree,
  FileVideo,
  FileAudio,
  TrendingUp,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Maximize2,
  Minimize2,
  PieChart,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { SambaShareNode, MediaMetadata } from '../types';
import {
  calculateSambaStorageMetrics,
  formatStorageBytes,
  StorageMediaType,
  StorageEntityItem,
  MediaTypeStorageStats,
} from '../utils/sambaStorageCalculator';

interface SambaStorageSummaryDashboardProps {
  sambaTree: SambaShareNode[];
  onOpenDetails?: (media: MediaMetadata) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export const SambaStorageSummaryDashboard: React.FC<SambaStorageSummaryDashboardProps> = ({
  sambaTree,
  onOpenDetails,
  className = '',
  defaultExpanded = true,
}) => {
  const [selectedUnit, setSelectedUnit] = useState<'AUTO' | 'GB' | 'MB' | 'TB'>('AUTO');
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [selectedCategory, setSelectedCategory] = useState<StorageMediaType | 'all'>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  // Calculate live storage metrics based on the current Samba tree hierarchy
  const summary = useMemo(() => {
    return calculateSambaStorageMetrics(sambaTree);
  }, [sambaTree]);

  const { byType, totalBytes, totalFiles, totalFolders } = summary;

  // Format bytes helper that honors user-selected unit
  const formatSize = (bytes: number): string => {
    return formatStorageBytes(bytes, 2, selectedUnit);
  };

  // Build copyable summary text
  const handleCopySummary = async () => {
    const lines = [
      `=== Samba Storage Hierarchy Summary ===`,
      `Total Allocated Storage: ${formatStorageBytes(totalBytes)} (${totalBytes.toLocaleString()} bytes)`,
      `Total Files: ${totalFiles.toLocaleString()}`,
      `Total Folders: ${totalFolders.toLocaleString()}`,
      ``,
      `--- Breakdown Per Media Type ---`,
      `1. Movies & Films:`,
      `   Storage: ${formatStorageBytes(byType.movies.totalBytes)} (${byType.movies.percentage}% of share)`,
      `   Files: ${byType.movies.fileCount} across ${byType.movies.folderCount} movie titles`,
      `   Avg File Size: ${formatStorageBytes(byType.movies.averageFileSizeBytes)}`,
      byType.movies.largestFile
        ? `   Largest Item: ${byType.movies.largestFile.name} (${formatStorageBytes(byType.movies.largestFile.sizeBytes)})`
        : '',
      ``,
      `2. Series & TV Shows:`,
      `   Storage: ${formatStorageBytes(byType.series.totalBytes)} (${byType.series.percentage}% of share)`,
      `   Episodes / Files: ${byType.series.fileCount} across ${byType.series.folderCount} series folders`,
      `   Avg Episode Size: ${formatStorageBytes(byType.series.averageFileSizeBytes)}`,
      byType.series.largestFile
        ? `   Largest Episode: ${byType.series.largestFile.name} (${formatStorageBytes(byType.series.largestFile.sizeBytes)})`
        : '',
      ``,
      `3. Music & Audio:`,
      `   Storage: ${formatStorageBytes(byType.music.totalBytes)} (${byType.music.percentage}% of share)`,
      `   Tracks / Files: ${byType.music.fileCount} across ${byType.music.folderCount} artist & album folders`,
      `   Avg Track Size: ${formatStorageBytes(byType.music.averageFileSizeBytes)}`,
      byType.music.largestFile
        ? `   Largest Track: ${byType.music.largestFile.name} (${formatStorageBytes(byType.music.largestFile.sizeBytes)})`
        : '',
      ``,
      byType.other.totalBytes > 0
        ? `4. Other Assets & Docs: ${formatStorageBytes(byType.other.totalBytes)} (${byType.other.fileCount} files)`
        : '',
      `=======================================`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(lines);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
    }
  };

  // Filter top media consumers for the inspection table
  const filteredEntities = useMemo(() => {
    let list: StorageEntityItem[] = [];
    if (selectedCategory === 'all') {
      list = [
        ...byType.movies.topItems,
        ...byType.series.topItems,
        ...byType.music.topItems,
        ...byType.other.topItems,
      ];
    } else {
      list = byType[selectedCategory].topItems;
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q));
    }

    return list.sort((a, b) => b.sizeBytes - a.sizeBytes);
  }, [byType, selectedCategory, searchFilter]);

  const cardsConfig: Array<{
    type: StorageMediaType;
    label: string;
    sublabel: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    borderColor: string;
    bgHover: string;
    stats: MediaTypeStorageStats;
  }> = [
    {
      type: 'movies',
      label: 'Movies',
      sublabel: 'Theatrical Films & Feature Movies',
      icon: Film,
      accentColor: 'text-indigo-400',
      borderColor: 'border-indigo-500/25',
      bgHover: 'hover:border-indigo-500/50',
      stats: byType.movies,
    },
    {
      type: 'series',
      label: 'Series',
      sublabel: 'Television Shows & Anime',
      icon: Tv,
      accentColor: 'text-purple-400',
      borderColor: 'border-purple-500/25',
      bgHover: 'hover:border-purple-500/50',
      stats: byType.series,
    },
    {
      type: 'music',
      label: 'Music',
      sublabel: 'Albums, Discographies & Audio',
      icon: Music,
      accentColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/25',
      bgHover: 'hover:border-emerald-500/50',
      stats: byType.music,
    },
  ];

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-md shadow-xl overflow-hidden ${className}`}
    >
      {/* Top Header & Overview Bar */}
      <div className="p-5 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-100 tracking-tight">Samba Storage Summary</h3>
              <span className="text-xs text-slate-400 font-mono">
                {formatSize(totalBytes)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>{totalFiles.toLocaleString()} files</span>
              <span aria-hidden="true">·</span>
              <span>{totalFolders.toLocaleString()} folders</span>
              <span aria-hidden="true">·</span>
              <span>{cardsConfig.reduce((acc, c) => acc + c.stats.folderCount, 0)} media titles</span>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {/* Unit Switcher */}
          <div className="flex items-center p-1 bg-slate-950/70 border border-slate-800 rounded-xl">
            {(['AUTO', 'GB', 'MB', 'TB'] as const).map((unit) => (
              <button
                key={unit}
                onClick={() => setSelectedUnit(unit)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  selectedUnit === unit
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Display storage sizes in ${unit}`}
              >
                {unit}
              </button>
            ))}
          </div>

          {/* Copy Report Button */}
          <button
            onClick={handleCopySummary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            title="Copy storage breakdown summary to clipboard"
          >
            {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedReport ? 'Copied' : 'Copy Report'}</span>
          </button>

          {/* Collapse / Expand Toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            title={isExpanded ? 'Collapse storage dashboard' : 'Expand storage dashboard'}
            aria-label={isExpanded ? 'Collapse storage dashboard' : 'Expand storage dashboard'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Visual Storage Distribution Bar */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-medium">
          <span className="flex items-center gap-1.5">
            <PieChart className="w-3.5 h-3.5 text-slate-400" />
            <span>Storage Allocation Distribution</span>
          </span>
          <span className="font-mono text-slate-300">
            {totalBytes > 0 ? '100% Allocated' : 'No media detected'}
          </span>
        </div>

        {/* Multi-segment distribution progress bar */}
        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800/80 p-0.5">
          {byType.movies.percentage > 0 && (
            <div
              style={{ width: `${byType.movies.percentage}%` }}
              className="h-full bg-indigo-500 rounded-l-full transition-all duration-500 relative group cursor-pointer"
              title={`Movies: ${formatSize(byType.movies.totalBytes)} (${byType.movies.percentage}%)`}
              onClick={() => setSelectedCategory('movies')}
            />
          )}
          {byType.series.percentage > 0 && (
            <div
              style={{ width: `${byType.series.percentage}%` }}
              className="h-full bg-purple-500 transition-all duration-500 relative group cursor-pointer"
              title={`Series: ${formatSize(byType.series.totalBytes)} (${byType.series.percentage}%)`}
              onClick={() => setSelectedCategory('series')}
            />
          )}
          {byType.music.percentage > 0 && (
            <div
              style={{ width: `${byType.music.percentage}%` }}
              className="h-full bg-emerald-500 transition-all duration-500 relative group cursor-pointer"
              title={`Music: ${formatSize(byType.music.totalBytes)} (${byType.music.percentage}%)`}
              onClick={() => setSelectedCategory('music')}
            />
          )}
          {byType.other.percentage > 0 && (
            <div
              style={{ width: `${byType.other.percentage}%` }}
              className="h-full bg-slate-600 rounded-r-full transition-all duration-500 relative group cursor-pointer"
              title={`Other / Non-media: ${formatSize(byType.other.totalBytes)} (${byType.other.percentage}%)`}
              onClick={() => setSelectedCategory('other')}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
          <button
            onClick={() => setSelectedCategory(selectedCategory === 'movies' ? 'all' : 'movies')}
            className={`flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'movies' ? 'text-indigo-300 font-bold' : 'hover:text-slate-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span>Movies: {byType.movies.percentage}% ({formatSize(byType.movies.totalBytes)})</span>
          </button>
          <button
            onClick={() => setSelectedCategory(selectedCategory === 'series' ? 'all' : 'series')}
            className={`flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'series' ? 'text-purple-300 font-bold' : 'hover:text-slate-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span>Series: {byType.series.percentage}% ({formatSize(byType.series.totalBytes)})</span>
          </button>
          <button
            onClick={() => setSelectedCategory(selectedCategory === 'music' ? 'all' : 'music')}
            className={`flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'music' ? 'text-emerald-300 font-bold' : 'hover:text-slate-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Music: {byType.music.percentage}% ({formatSize(byType.music.totalBytes)})</span>
          </button>
          {byType.other.totalBytes > 0 && (
            <button
              onClick={() => setSelectedCategory(selectedCategory === 'other' ? 'all' : 'other')}
              className={`flex items-center gap-1.5 transition cursor-pointer ${
                selectedCategory === 'other' ? 'text-slate-200 font-bold' : 'hover:text-slate-300'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              <span>Other: {byType.other.percentage}% ({formatSize(byType.other.totalBytes)})</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content Section */}
      {isExpanded && (
        <div className="p-5 pt-3 space-y-5">
          {/* Media Type Cards Grid (Movies, Series, Music) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cardsConfig.map((card) => {
              const Icon = card.icon;
              const isSelected = selectedCategory === card.type;

              return (
                <div
                  key={card.type}
                  onClick={() => setSelectedCategory(isSelected ? 'all' : card.type)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? `bg-slate-850 border-slate-600 ring-2 ring-indigo-500/40 shadow-lg`
                      : `bg-slate-950/60 ${card.borderColor} ${card.bgHover}`
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center ${card.accentColor}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-100">{card.label}</h4>
                          <span className="text-[11px] text-slate-400 block">{card.sublabel}</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-300">
                        {card.stats.percentage}%
                      </span>
                    </div>

                    {/* Main Total Storage Figure */}
                    <div className="mt-3">
                      <div className="text-2xl font-extrabold text-white tracking-tight font-mono">
                        {formatSize(card.stats.totalBytes)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <span>{card.stats.fileCount.toLocaleString()} files</span>
                        <span aria-hidden="true">·</span>
                        <span>{card.stats.folderCount} titles / folders</span>
                      </div>
                    </div>
                  </div>

                  {/* Secondary Details & Largest File */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Average File Size</span>
                      <span className="font-mono text-slate-200">{formatSize(card.stats.averageFileSizeBytes)}</span>
                    </div>

                    {card.stats.largestFile && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 shrink-0">Largest File</span>
                        <span
                          className="font-mono text-slate-200 truncate max-w-[150px] text-right"
                          title={`${card.stats.largestFile.name} (${formatSize(card.stats.largestFile.sizeBytes)})`}
                        >
                          {card.stats.largestFile.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Top Storage Entities Breakdown Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Top Storage Consumers {selectedCategory !== 'all' ? `(${selectedCategory.toUpperCase()})` : ''}
                </h4>
                <span className="text-xs text-slate-400 font-mono">
                  {filteredEntities.length} items
                </span>
              </div>

              {/* Category Filter Pills & Search */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter by title..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-44 pl-8 pr-3 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-lg">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-2 py-0.5 text-xs font-medium rounded transition cursor-pointer ${
                      selectedCategory === 'all'
                        ? 'bg-slate-800 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedCategory('movies')}
                    className={`px-2 py-0.5 text-xs font-medium rounded transition cursor-pointer ${
                      selectedCategory === 'movies'
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Movies
                  </button>
                  <button
                    onClick={() => setSelectedCategory('series')}
                    className={`px-2 py-0.5 text-xs font-medium rounded transition cursor-pointer ${
                      selectedCategory === 'series'
                        ? 'bg-purple-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Series
                  </button>
                  <button
                    onClick={() => setSelectedCategory('music')}
                    className={`px-2 py-0.5 text-xs font-medium rounded transition cursor-pointer ${
                      selectedCategory === 'music'
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Music
                  </button>
                </div>
              </div>
            </div>

            {/* List / Table */}
            {filteredEntities.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No storage consumer entries match the filter criteria.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
                {filteredEntities.map((item, index) => {
                  const percentOfTotal = totalBytes > 0 ? ((item.sizeBytes / totalBytes) * 100).toFixed(1) : '0';

                  return (
                    <div
                      key={item.id || index}
                      className="p-3 hover:bg-slate-900/60 transition flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono text-slate-400 w-5 text-right shrink-0">
                          {index + 1}.
                        </span>
                        <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                          {item.mediaType === 'movies' && <Film className="w-3.5 h-3.5 text-indigo-400" />}
                          {item.mediaType === 'series' && <Tv className="w-3.5 h-3.5 text-purple-400" />}
                          {item.mediaType === 'music' && <Music className="w-3.5 h-3.5 text-emerald-400" />}
                          {item.mediaType === 'other' && <FileVideo className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-slate-200 truncate block">
                            {item.name}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate block font-mono">
                            {item.path}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-bold text-slate-200 block">
                          {formatSize(item.sizeBytes)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {percentOfTotal}% of share · {item.fileCount} {item.fileCount === 1 ? 'file' : 'files'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
