import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  History,
  Film,
  Tv,
  Music,
  Clock,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  PlayCircle,
  BarChart2,
  Sparkles,
  AlertCircle,
  Database,
  ArrowRight,
  Download,
  Upload,
  FileJson,
} from 'lucide-react';
import { WatchHistoryItem, WatchHistoryStats, MediaType } from '../types';

interface WatchHistoryTabProps {
  onOpenDetails?: (mediaId: string) => void;
}

export const WatchHistoryTab: React.FC<WatchHistoryTabProps> = ({ onOpenDetails }) => {
  const [historyItems, setHistoryItems] = useState<WatchHistoryItem[]>([]);
  const [historyStats, setHistoryStats] = useState<WatchHistoryStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedFilterType, setSelectedFilterType] = useState<string>('all');
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportProgress = () => {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      historyItems,
      historyStats,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watch-progress-sync-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportProgressFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.historyItems && Array.isArray(parsed.historyItems)) {
        for (const item of parsed.historyItems) {
          await fetch('/api/db/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          });
        }
        await fetchHistory();
        alert(`Successfully imported ${parsed.historyItems.length} watch progress records!`);
      } else {
        alert('Invalid sync file structure.');
      }
    } catch (err) {
      console.error('Failed to import watch progress:', err);
      alert('Failed to parse JSON sync file.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const [histRes, statsRes] = await Promise.all([
        fetch('/api/db/history?limit=200'),
        fetch('/api/db/history/stats'),
      ]);
      
      const histContentType = histRes.headers.get('content-type') || '';
      const statsContentType = statsRes.headers.get('content-type') || '';
      
      if (histContentType.includes('application/json') && statsContentType.includes('application/json')) {
        const histData = await histRes.json();
        const statsData = await statsRes.json();
        if (histData.success) {
          setHistoryItems(histData.history || []);
        }
        if (statsData.success) {
          setHistoryStats(statsData.stats || null);
        }
      } else {
        console.warn('[WatchHistoryTab] API returned non-JSON response. This usually happens in Desktop/Tauri environments when backend routes are unreachable.');
        // If we got HTML, it means the backend is failing. We stay with empty items but log it.
        setHistoryItems([]);
      }
    } catch (err) {
      console.error('Failed to load watch history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/db/history/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setHistoryItems((prev) => prev.filter((item) => item.id !== id));
        fetchHistory();
      }
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all watch history logs?')) return;
    setIsClearing(true);
    try {
      const res = await fetch('/api/db/history', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setHistoryItems([]);
        setHistoryStats({
          totalWatched: 0,
          moviesWatched: 0,
          seriesEpisodesWatched: 0,
          albumsPlayed: 0,
          completedCount: 0,
          totalSecondsWatched: 0,
          totalHoursWatched: 0,
        });
      }
    } catch (err) {
      console.error('Failed to clear watch history:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const filteredItems = useMemo(() => {
    return historyItems.filter((item) => {
      const matchesType =
        selectedFilterType === 'all' || item.media_type === selectedFilterType;
      const matchesSearch =
        !searchTerm ||
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.episode_title && item.episode_title.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [historyItems, selectedFilterType, searchTerm]);

  return (
    <div className="flex-1 bg-slate-950 p-6 md:p-8 space-y-8 overflow-y-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-900/40 rounded-2xl p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <History className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Watch History & Log</h1>
          </div>
          <p className="text-sm text-slate-400 max-w-2xl">
            Track your viewing progress, resume where you left off across movies and series, and review your watch time analytics stored securely in the SQLite vault.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportProgressFile}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 border border-slate-700/60 transition cursor-pointer"
            title="Import watch progress JSON sync-file from another device"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Import Sync</span>
          </button>
          <button
            onClick={handleExportProgress}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            title="Export watch history and progress as a JSON file for transferring between devices"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Progress</span>
          </button>
          <button
            onClick={fetchHistory}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 border border-slate-700/60 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {historyItems.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={isClearing}
              className="px-3.5 py-2 rounded-xl bg-red-950/50 hover:bg-red-900/60 text-red-300 text-xs font-medium flex items-center gap-2 border border-red-800/40 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Analytics KPI Cards */}
      {historyStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400">
              <PlayCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Total Watched</p>
              <h3 className="text-2xl font-bold text-white mt-0.5">{historyStats.totalWatched}</h3>
              <p className="text-[11px] text-indigo-400 mt-0.5">Items logged</p>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Movies & Series</p>
              <h3 className="text-2xl font-bold text-white mt-0.5">
                {historyStats.moviesWatched} <span className="text-sm font-normal text-slate-400">mov</span> / {historyStats.seriesEpisodesWatched} <span className="text-sm font-normal text-slate-400">eps</span>
              </h3>
              <p className="text-[11px] text-cyan-400 mt-0.5">Media items</p>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Completed</p>
              <h3 className="text-2xl font-bold text-white mt-0.5">{historyStats.completedCount}</h3>
              <p className="text-[11px] text-emerald-400 mt-0.5">Finished items</p>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Watch Time</p>
              <h3 className="text-2xl font-bold text-white mt-0.5">{historyStats.totalHoursWatched} hrs</h3>
              <p className="text-[11px] text-amber-400 mt-0.5">Total duration</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search watch history..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0 mr-1" />
          {['all', 'movie', 'series', 'album'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedFilterType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition cursor-pointer shrink-0 ${
                selectedFilterType === type
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
              }`}
            >
              {type === 'all' ? 'All Types' : type}
            </button>
          ))}
        </div>
      </div>

      {/* History Items List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-400">Loading watch history from SQLite vault...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/40 border border-slate-800/60 rounded-2xl text-center p-8 space-y-3">
          <div className="p-4 rounded-2xl bg-slate-800/80 text-slate-400">
            <History className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-white">No watch history records found</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            {searchTerm || selectedFilterType !== 'all'
              ? 'Try adjusting your search query or media filter.'
              : 'Play movies or TV series episodes in the media player to automatically record your watch history here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const isCompleted = item.is_completed || (item.progress_percentage || 0) >= 90;
            const progress = item.progress_percentage || 0;
            const formattedDate = new Date(item.watched_at).toLocaleString();

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (item.media_id && onOpenDetails) {
                    onOpenDetails(item.media_id);
                  }
                }}
                className="group bg-slate-900/90 hover:bg-slate-900 border border-slate-800/80 hover:border-indigo-500/50 rounded-2xl p-4 flex gap-4 transition shadow-md hover:shadow-indigo-500/10 cursor-pointer relative overflow-hidden"
              >
                {/* Poster Thumbnail */}
                <div className="w-20 h-28 shrink-0 rounded-xl bg-slate-800 overflow-hidden relative border border-slate-700/60 shadow">
                  {item.poster_url ? (
                    <img
                      src={item.poster_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">
                      {item.media_type === 'movie' ? (
                        <Film className="w-6 h-6" />
                      ) : item.media_type === 'series' ? (
                        <Tv className="w-6 h-6" />
                      ) : (
                        <Music className="w-6 h-6" />
                      )}
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur-md text-[10px] font-semibold text-white uppercase tracking-wider">
                    {item.media_type}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition">
                        {item.title}
                      </h4>
                      <button
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        className="text-slate-500 hover:text-red-400 p-1 transition rounded-lg hover:bg-red-500/10"
                        title="Remove from history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {item.season_number !== undefined && item.episode_number !== undefined && (
                      <p className="text-xs font-medium text-indigo-400 truncate">
                        S{String(item.season_number).padStart(2, '0')} E{String(item.episode_number).padStart(2, '0')}
                        {item.episode_title ? ` • ${item.episode_title}` : ''}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-0.5">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{formattedDate}</span>
                    </div>
                  </div>

                  {/* Progress & Status */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={isCompleted ? 'text-emerald-400 font-medium flex items-center gap-1' : 'text-slate-400'}>
                        {isCompleted ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 inline" /> Completed
                          </>
                        ) : (
                          `${Math.round(progress)}% watched`
                        )}
                      </span>
                      {item.duration_seconds ? (
                        <span className="text-slate-500 font-mono">
                          {Math.floor(item.duration_seconds / 60)}m
                        </span>
                      ) : null}
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
