import React, { useState, useEffect } from 'react';
import {
  Database,
  Bookmark,
  Play,
  CheckCircle2,
  Clock,
  Tv,
  Film,
  Music,
  Trash2,
  Edit3,
  Save,
  Plus,
  Search,
  Sparkles,
  Terminal,
  RefreshCw,
  Sliders,
  ChevronRight,
  FolderOpen,
  ArrowRight,
  HardDrive,
  BarChart2,
} from 'lucide-react';
import {
  SqliteMediaItem,
  SeriesWatchProgress,
  SqliteStats,
  MediaMetadata,
} from '../types';
import { sqliteBatchWriter, SqliteQueueStatus } from '../services/sqliteBatchWriter';

interface SqliteVaultProps {
  onOpenDetails: (media: MediaMetadata) => void;
  onRefreshTrigger?: () => void;
  onNavigateToStats?: () => void;
}

export const SqliteVault: React.FC<SqliteVaultProps> = ({ onOpenDetails, onRefreshTrigger, onNavigateToStats }) => {
  const [activeSubTab, setActiveSubTab] = useState<'progress' | 'database' | 'query'>('progress');
  const [mediaItems, setMediaItems] = useState<SqliteMediaItem[]>([]);
  const [watchProgressList, setWatchProgressList] = useState<SeriesWatchProgress[]>([]);
  const [dbStats, setDbStats] = useState<SqliteStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [batchStatus, setBatchStatus] = useState<SqliteQueueStatus>(sqliteBatchWriter.getStatus());

  useEffect(() => {
    const unsub = sqliteBatchWriter.subscribe((status) => {
      setBatchStatus(status);
    });
    return unsub;
  }, []);

  // Editing state for synopsis
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingSynopsis, setEditingSynopsis] = useState('');

  // Custom SQL console state
  const [customSql, setCustomSql] = useState(
    'SELECT title, synopsis, year, rating FROM media_items;'
  );
  const [queryResult, setQueryResult] = useState<{ columns: string[]; values: any[][] } | null>(
    null
  );
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState(false);

  // Quick episode update modal or inline drawer
  const [selectedProgressToEdit, setSelectedProgressToEdit] =
    useState<SeriesWatchProgress | null>(null);
  const [editSeason, setEditSeason] = useState(1);
  const [editEpisode, setEditEpisode] = useState(1);
  const [editEpisodeTitle, setEditEpisodeTitle] = useState('');
  const [editMinutes, setEditMinutes] = useState(0);
  const [editTotalMinutes, setEditTotalMinutes] = useState(50);
  const [editNotes, setEditNotes] = useState('');

  const fetchDatabaseData = async () => {
    setIsLoading(true);
    try {
      const [mediaRes, progRes, statsRes] = await Promise.all([
        fetch('/api/db/media'),
        fetch('/api/db/progress'),
        fetch('/api/db/stats'),
      ]);

      const mediaData = await mediaRes.json();
      const progData = await progRes.json();
      const statsData = await statsRes.json();

      if (mediaData.success) setMediaItems(mediaData.items);
      if (progData.success) setWatchProgressList(progData.progress);
      if (statsData.success) setDbStats(statsData.stats);
    } catch (err) {
      console.error('Error fetching SQLite data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDatabaseData();
  }, []);

  const handleUpdateSynopsis = async (item: SqliteMediaItem) => {
    try {
      const res = await fetch('/api/db/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          synopsis: editingSynopsis,
        }),
      });
      if (res.ok) {
        setEditingItemId(null);
        fetchDatabaseData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Delete this record from SQLite database?')) return;
    try {
      const res = await fetch(`/api/db/media/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDatabaseData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenProgressEditor = (prog: SeriesWatchProgress) => {
    setSelectedProgressToEdit(prog);
    setEditSeason(prog.season_number);
    setEditEpisode(prog.episode_number);
    setEditEpisodeTitle(prog.episode_title);
    setEditMinutes(Math.floor(prog.playback_position_seconds / 60));
    setEditTotalMinutes(Math.floor((prog.total_duration_seconds || 3000) / 60));
    setEditNotes(prog.notes || '');
  };

  const handleSaveProgress = async () => {
    if (!selectedProgressToEdit) return;
    try {
      const totalSec = editTotalMinutes * 60;
      const currentSec = editMinutes * 60;
      const percent = totalSec > 0 ? (currentSec / totalSec) * 100 : 0;

      const res = await fetch('/api/db/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          series_id: selectedProgressToEdit.series_id,
          series_title: selectedProgressToEdit.series_title,
          season_number: editSeason,
          episode_number: editEpisode,
          episode_title: editEpisodeTitle || `Episode ${editEpisode}`,
          playback_position_seconds: currentSec,
          total_duration_seconds: totalSec,
          progress_percentage: Math.min(100, Math.max(0, percent)),
          is_completed: percent >= 95,
          notes: editNotes,
        }),
      });

      if (res.ok) {
        setSelectedProgressToEdit(null);
        fetchDatabaseData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdvanceNextEpisode = async (prog: SeriesWatchProgress) => {
    try {
      const nextEp = prog.episode_number + 1;
      await fetch('/api/db/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          series_id: prog.series_id,
          series_title: prog.series_title,
          season_number: prog.season_number,
          episode_number: nextEp,
          episode_title: `Episode ${nextEp}`,
          playback_position_seconds: 0,
          total_duration_seconds: 3000,
          progress_percentage: 0,
          is_completed: false,
          notes: `Started Episode ${nextEp}`,
        }),
      });
      fetchDatabaseData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunCustomSql = async () => {
    setIsExecutingSql(true);
    setQueryError(null);
    try {
      const res = await fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: customSql }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setQueryResult(data.result);
      } else {
        setQueryError(data.message || 'Query error');
      }
    } catch (err: any) {
      setQueryError(err?.message || 'Execution error');
    } finally {
      setIsExecutingSql(false);
    }
  };

  const filteredMedia = mediaItems.filter(
    (item) =>
      item.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.synopsis.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-3">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Embedded SQLite Database Engine</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              SQLite Title, Synopsis & Series Progress Vault
            </h2>
            <p className="mt-1 text-sm text-slate-300 max-w-3xl leading-relaxed">
              Stores all media titles, synopses, and exact series watch positions in a persistent, embedded SQLite database (`media_vault.sqlite`). Track where you left off in TV shows, update progress timestamps, and query raw tables.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToStats && (
              <button
                id="btn-goto-library-stats"
                onClick={onNavigateToStats}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Library Stats (Recharts)</span>
              </button>
            )}

            <button
              id="btn-refresh-sqlite"
              onClick={fetchDatabaseData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition shadow"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh SQLite</span>
            </button>
          </div>
        </div>

        {/* Database Quick Stats Bar */}
        {dbStats && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[11px] block">SQLite File:</span>
              <span className="text-slate-200 truncate block">media_vault.sqlite</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Saved Titles:</span>
              <span className="text-indigo-300 font-bold">{dbStats.totalMediaItems} Media Records</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Active Series Tracked:</span>
              <span className="text-emerald-300 font-bold">{dbStats.totalSeriesTracked} In-Progress</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Watched Episodes:</span>
              <span className="text-purple-300 font-bold">{dbStats.totalWatchedHistory} Completed</span>
            </div>
          </div>
        )}

        {/* 30s Persistent Caching & Batch Buffer Indicator */}
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-indigo-900/30">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>
            <div>
              <span className="font-semibold text-slate-200">Zero-I/O Persistent Cache Active</span>
              <span className="text-slate-400 ml-2">
                ({batchStatus.cacheSize} items in cache &middot; {batchStatus.pendingCount} queued for next 30s batch)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-mono text-[11px]">
              Next auto-flush in: <strong className="text-indigo-400">{batchStatus.secondsUntilNextFlush}s</strong>
            </span>
            <button
              onClick={async () => {
                await sqliteBatchWriter.flushNow();
                fetchDatabaseData();
              }}
              disabled={batchStatus.isFlushing || batchStatus.pendingCount === 0}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                batchStatus.pendingCount > 0
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${batchStatus.isFlushing ? 'animate-spin' : ''}`} />
              <span>{batchStatus.isFlushing ? 'Flushing...' : 'Flush Queue Now'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub navigation tabs */}
      <div className="flex border-b border-slate-800 space-x-2">
        <button
          id="tab-sub-progress"
          onClick={() => setActiveSubTab('progress')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'progress'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Where You Left Off (Series Tracker)</span>
          <span className="px-1.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 text-[10px]">
            {watchProgressList.length}
          </span>
        </button>

        <button
          id="tab-sub-database"
          onClick={() => setActiveSubTab('database')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'database'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>SQLite Titles & Synopses Table</span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">
            {mediaItems.length}
          </span>
        </button>

        <button
          id="tab-sub-query"
          onClick={() => setActiveSubTab('query')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'query'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>SQL Query Console</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. WHERE YOU LEFT OFF (SERIES WATCH PROGRESS) */}
      {/* ========================================================================= */}
      {activeSubTab === 'progress' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              <span>Series In-Progress & Resume Queue</span>
            </h3>
            <span className="text-xs text-slate-400">
              Stored in SQLite table <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded font-mono">series_watch_progress</code>
            </span>
          </div>

          {watchProgressList.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <Tv className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">No active series watch records yet</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Search for any TV show or click on an episode in the search tab to mark where you left off.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {watchProgressList.map((prog) => {
                const currentMin = Math.floor(prog.playback_position_seconds / 60);
                const totalMin = Math.floor((prog.total_duration_seconds || 3000) / 60);
                const percent = Math.min(100, Math.round(prog.progress_percentage || 0));

                return (
                  <div
                    key={prog.id}
                    id={`progress-card-${prog.series_id}`}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4 transition"
                  >
                    <div className="flex gap-4">
                      {/* Series Poster Thumbnail */}
                      <div className="w-20 h-28 rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-slate-800 shadow">
                        <img
                          src={
                            prog.poster_url ||
                            'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80'
                          }
                          alt={prog.series_title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Series Info & Left-off Episode */}
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 font-bold text-[10px] tracking-wider uppercase">
                            TV SERIES
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(prog.last_watched_at).toLocaleDateString()}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-white truncate">
                          {prog.series_title}
                        </h4>

                        {/* Exact spot left off badge */}
                        <div className="p-2 bg-indigo-950/40 border border-indigo-800/30 rounded-lg">
                          <div className="text-xs font-semibold text-indigo-200 truncate">
                            Left off on S{String(prog.season_number).padStart(2, '0')}E
                            {String(prog.episode_number).padStart(2, '0')}: {prog.episode_title}
                          </div>
                          {prog.notes && (
                            <div className="text-[11px] text-slate-400 italic mt-0.5 truncate">
                              "{prog.notes}"
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar & Timestamps */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-400 font-mono">
                        <span className="text-slate-300 font-medium">
                          {currentMin}m / {totalMin}m
                        </span>
                        <span className="text-emerald-400 font-bold">{percent}% Watched</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                      <button
                        id={`btn-edit-progress-${prog.id}`}
                        onClick={() => handleOpenProgressEditor(prog)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 transition"
                      >
                        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Update Timestamp / Spot</span>
                      </button>

                      <button
                        id={`btn-next-ep-${prog.id}`}
                        onClick={() => handleAdvanceNextEpisode(prog)}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition shadow"
                      >
                        <span>Next Episode</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SQLITE TITLES & SYNOPSES TABLE */}
      {/* ========================================================================= */}
      {activeSubTab === 'database' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                <span>SQLite `media_items` Table ({mediaItems.length} records)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every title and synopsis is stored in SQLite columns (`title TEXT`, `synopsis TEXT`).
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search SQLite records..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Table of Records */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Title (`title`)</th>
                  <th className="py-2.5 px-3 w-1/2">Synopsis (`synopsis`)</th>
                  <th className="py-2.5 px-3">Year</th>
                  <th className="py-2.5 px-3">Rating</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredMedia.map((item) => {
                  const isEditing = editingItemId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 align-top">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.media_type === 'series'
                              ? 'bg-purple-900/40 text-purple-300'
                              : item.media_type === 'movie'
                              ? 'bg-cyan-900/40 text-cyan-300'
                              : 'bg-emerald-900/40 text-emerald-300'
                          }`}
                        >
                          {item.media_type}
                        </span>
                      </td>

                      <td className="py-3 px-3 align-top font-bold text-white">
                        <div className="flex items-center gap-2">
                          <span>{item.title}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 align-top text-slate-300 text-xs">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              rows={4}
                              value={editingSynopsis}
                              onChange={(e) => setEditingSynopsis(e.target.value)}
                              className="w-full bg-slate-950 border border-indigo-500 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateSynopsis(item)}
                                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" />
                                <span>Save to SQLite</span>
                              </button>
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-[11px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative">
                            <p className="line-clamp-3 leading-relaxed">{item.synopsis}</p>
                            <button
                              onClick={() => {
                                setEditingItemId(item.id);
                                setEditingSynopsis(item.synopsis);
                              }}
                              className="mt-1 text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 opacity-80 group-hover:opacity-100"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit Synopsis in SQLite</span>
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top font-mono text-slate-400">
                        {item.year || '—'}
                      </td>

                      <td className="py-3 px-3 align-top font-mono text-amber-400 font-bold">
                        {item.rating ? `★ ${item.rating}` : '—'}
                      </td>

                      <td className="py-3 px-3 align-top text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition"
                          title="Delete from SQLite database"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SQL QUERY RUNNER */}
      {/* ========================================================================= */}
      {activeSubTab === 'query' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>Interactive SQLite Query Console</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Database: media_vault.sqlite
            </span>
          </div>

          {/* Quick Query Templates */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-slate-400 font-medium self-center">Quick Queries:</span>
            <button
              onClick={() =>
                setCustomSql('SELECT id, title, synopsis, rating FROM media_items;')
              }
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono text-[11px]"
            >
              SELECT Title & Synopsis
            </button>
            <button
              onClick={() =>
                setCustomSql(
                  'SELECT series_title, season_number, episode_number, episode_title, progress_percentage FROM series_watch_progress;'
                )
              }
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-mono text-[11px]"
            >
              SELECT Series Left-Off Spots
            </button>
            <button
              onClick={() => setCustomSql('SELECT * FROM watch_history_log;')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 font-mono text-[11px]"
            >
              SELECT Watch History
            </button>
          </div>

          {/* SQL Input Textarea */}
          <div className="space-y-2">
            <textarea
              rows={4}
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-cyan-300 focus:outline-none focus:border-indigo-500"
              placeholder="Enter SQL statement, e.g. SELECT * FROM media_items;"
            />

            <button
              id="btn-execute-sql"
              onClick={handleRunCustomSql}
              disabled={isExecutingSql || !customSql.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Execute SQL Query</span>
            </button>
          </div>

          {/* Query Errors */}
          {queryError && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs font-mono">
              Error: {queryError}
            </div>
          )}

          {/* Query Result Table */}
          {queryResult && (
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold text-slate-300">
                Result ({queryResult.values.length} rows returned):
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                      {queryResult.columns.map((col, idx) => (
                        <th key={idx} className="py-2 px-3">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {queryResult.values.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-900/40 text-slate-200">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="py-2 px-3 truncate max-w-xs">
                            {cell !== null && cell !== undefined ? String(cell) : 'NULL'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* UPDATE PROGRESS MODAL */}
      {/* ========================================================================= */}
      {selectedProgressToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Update Where You Left Off: {selectedProgressToEdit.series_title}</span>
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Season Number</label>
                  <input
                    type="number"
                    min={1}
                    value={editSeason}
                    onChange={(e) => setEditSeason(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Episode Number</label>
                  <input
                    type="number"
                    min={1}
                    value={editEpisode}
                    onChange={(e) => setEditEpisode(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Episode Title</label>
                <input
                  type="text"
                  value={editEpisodeTitle}
                  onChange={(e) => setEditEpisodeTitle(e.target.value)}
                  placeholder="e.g. Pilot or Episode Name"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Current Minute ({editMinutes}m)</label>
                  <input
                    type="number"
                    min={0}
                    value={editMinutes}
                    onChange={(e) => setEditMinutes(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Total Duration ({editTotalMinutes}m)</label>
                  <input
                    type="number"
                    min={1}
                    value={editTotalMinutes}
                    onChange={(e) => setEditTotalMinutes(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Progress visual bar */}
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Playback Slider</span>
                  <span className="text-emerald-400 font-bold">
                    {Math.round(
                      editTotalMinutes > 0 ? (editMinutes / editTotalMinutes) * 100 : 0
                    )}
                    %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={editTotalMinutes}
                  value={editMinutes}
                  onChange={(e) => setEditMinutes(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Personal Watch Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Left off right after the cliffhanger scene"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedProgressToEdit(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProgress}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Save Progress to SQLite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
