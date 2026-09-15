import React, { useState, useEffect } from 'react';
import {
  Zap,
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SambaShareNode, ThumbnailCacheStats, ThumbnailMetadata } from '../types';
import { thumbnailStorage } from '../utils/thumbnailStorage';

interface ThumbnailCacheBarProps {
  sambaTree: SambaShareNode[];
  onSelectNode?: (node: SambaShareNode) => void;
}

export const ThumbnailCacheBar: React.FC<ThumbnailCacheBarProps> = ({
  sambaTree,
  onSelectNode,
}) => {
  const [stats, setStats] = useState<ThumbnailCacheStats>(() => thumbnailStorage.getStats());
  const [isPrewarming, setIsPrewarming] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to real-time cache updates
    const unsubscribe = thumbnailStorage.subscribe((newStats) => {
      setStats(newStats);
    });
    return unsubscribe;
  }, []);

  const handlePrewarm = async () => {
    setIsPrewarming(true);
    setLastActionMessage('Scanning share & caching thumbnails...');
    try {
      const result = thumbnailStorage.prewarmSambaTree(sambaTree);
      setLastActionMessage(
        `Pre-warmed ${result.cached} media thumbnails (${stats.totalCached} total in storage layer)`
      );
      setTimeout(() => setLastActionMessage(null), 4000);
    } catch (e) {
      setLastActionMessage('Failed pre-warming thumbnails');
    } finally {
      setIsPrewarming(false);
    }
  };

  const handleClearCache = async () => {
    if (confirm('Clear thumbnail metadata storage layer (Memory, LocalStorage & SQLite)?')) {
      await thumbnailStorage.clearCache();
      setLastActionMessage('Thumbnail cache storage purged');
      setTimeout(() => setLastActionMessage(null), 3000);
    }
  };

  const allCachedItems = showInspector ? thumbnailStorage.getAllCachedItems() : [];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl transition-all duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Storage Layer Title & Hit Rate telemetry */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Zap className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white tracking-tight">
                Thumbnail Metadata Storage Layer
              </h4>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-[10px] font-mono font-bold">
                ⚡ Active ({(stats.hitRatio * 100).toFixed(1)}% Hit Rate)
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <span className="font-mono text-slate-300">
                <strong className="text-white font-bold">{stats.totalCached}</strong> thumbnails cached
              </span>
              <span>•</span>
              <span className="font-mono text-emerald-400">
                ~{stats.avgLoadTimeMs}ms avg retrieval
              </span>
              <span>•</span>
              <span className="hidden sm:inline text-slate-400">
                Tiered: Memory LRU + LocalStorage + SQLite
              </span>
            </div>
          </div>
        </div>

        {/* Right: Action Buttons & Expand Inspector */}
        <div className="flex items-center gap-2 flex-wrap">
          {lastActionMessage && (
            <span className="text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded-lg animate-fade-in font-mono">
              {lastActionMessage}
            </span>
          )}

          <button
            onClick={handlePrewarm}
            disabled={isPrewarming}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition cursor-pointer"
            title="Recursively pre-warm thumbnails for all discovered items to ensure 0ms navigation"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isPrewarming ? 'animate-spin' : ''}`} />
            <span>{isPrewarming ? 'Caching...' : 'Pre-warm All'}</span>
          </button>

          <button
            onClick={() => setShowInspector(!showInspector)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Cache Inspector</span>
            {showInspector ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleClearCache}
            className="p-1.5 rounded-xl bg-slate-800/60 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-700/60 transition cursor-pointer"
            title="Purge thumbnail storage cache"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Cache Inspector Drawer */}
      {showInspector && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Memory LRU Tier</span>
              <span className="text-emerald-300 font-bold font-mono text-sm">
                {stats.memoryTierCount} items
              </span>
              <span className="text-[10px] text-slate-400 block">Instant (0ms)</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-mono">LocalStorage Tier</span>
              <span className="text-indigo-300 font-bold font-mono text-sm">
                {stats.totalCached} items
              </span>
              <span className="text-[10px] text-slate-400 block">Persistent across sessions</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Cache Hits / Misses</span>
              <span className="text-white font-bold font-mono text-sm">
                {stats.hitCount} / {stats.missCount}
              </span>
              <span className="text-[10px] text-emerald-400 block">
                {(stats.hitRatio * 100).toFixed(1)}% hit ratio
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Storage Footprint</span>
              <span className="text-purple-300 font-bold font-mono text-sm">
                {(stats.storageSizeBytes / 1024).toFixed(1)} KB
              </span>
              <span className="text-[10px] text-slate-400 block">SQLite & JSON payload</span>
            </div>
          </div>

          {/* Cached Records Preview Grid */}
          <div>
            <div className="flex items-center justify-between pb-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-200">
                Cached Thumbnail Records ({allCachedItems.length})
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                Click an item to locate in directory
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/80 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs">
              {allCachedItems.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  No thumbnails cached yet. Click "Pre-warm All" to index the Samba share.
                </div>
              ) : (
                allCachedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-900 transition text-slate-300"
                  >
                    <div className="flex items-center gap-3 truncate pr-4">
                      {/* Mini Cached Poster */}
                      <div
                        className="w-8 h-12 rounded bg-slate-800 overflow-hidden shrink-0 border border-slate-700"
                        style={{ backgroundColor: item.colorDominant }}
                      >
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="truncate">
                        <div className="font-bold text-white truncate font-sans">{item.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{item.mediaPath}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        {item.resolutionLabel}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                        {item.hitCount} hits
                      </span>
                      <span className="text-slate-500 capitalize">{item.source.replace('_', ' ')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
