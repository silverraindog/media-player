import React, { useState } from 'react';
import {
  Terminal,
  Copy,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Filter,
  Search,
  Sparkles,
  Layers,
  ArrowRight,
  Database,
  Radio,
  Tv,
  Check,
  X,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { SyncLog, DeepRefreshJobState } from '../types';

interface ConsoleLogSectionProps {
  logs: SyncLog[];
  onClearLogs?: () => void;
  onRetryAllFailed?: () => void;
  onDeepRefresh?: () => Promise<void> | void;
  isDeepRefreshing?: boolean;
  deepRefreshJobState?: DeepRefreshJobState | null;
  metadataMissingCount?: number;
  metadataMissingSeries?: Array<{ id: string; name: string; path: string }>;
  onFlagSampleMissingSeries?: () => void;
}

export const ConsoleLogSection: React.FC<ConsoleLogSectionProps> = ({
  logs,
  onClearLogs,
  onRetryAllFailed,
  onDeepRefresh,
  isDeepRefreshing = false,
  deepRefreshJobState = null,
  metadataMissingCount = 0,
  metadataMissingSeries = [],
  onFlagSampleMissingSeries,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showPipelineDetails, setShowPipelineDetails] = useState(true);

  const failedLogsIn24h = logs.filter((l) => {
    const isFailed =
      l.status === 'error' ||
      l.details.toLowerCase().includes('fail') ||
      l.details.toLowerCase().includes('error');
    if (!isFailed) return false;
    const logTime = new Date(l.timestamp).getTime();
    if (!isNaN(logTime)) {
      return Date.now() - logTime <= 24 * 60 * 60 * 1000;
    }
    return true;
  });
  const failedLogsCount = failedLogsIn24h.length;

  const handleRetryFailed = async () => {
    if (isRetrying || !onRetryAllFailed) return;
    setIsRetrying(true);
    try {
      await onRetryAllFailed();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleTriggerDeepRefresh = async () => {
    if (isDeepRefreshing || !onDeepRefresh) return;
    await onDeepRefresh();
  };

  const filteredLogs = logs.filter((log) => {
    const matchesType =
      filterType === 'all' ||
      log.status === filterType ||
      log.type === filterType ||
      (filterType === 'deep_refresh' && log.type === 'deep_refresh') ||
      (filterType === 'metadata-missing' && (log.status === 'metadata-missing' || log.details.includes('metadata-missing')));

    const matchesSearch =
      log.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.timestamp.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${(l.status || 'INFO').toUpperCase()}] ${l.title}: ${l.details}`)
      .join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header with Title and Global Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">Application & Samba Sync Logs</h3>
              {metadataMissingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                  {metadataMissingCount} Flagged Missing
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Real-time event stream, Deep Refresh sequential fallback queries, disk writes, and vault synchronization.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Deep Refresh Action Button */}
          {onDeepRefresh && (
            <button
              id="btn-deep-refresh-series"
              onClick={handleTriggerDeepRefresh}
              disabled={isDeepRefreshing}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border shadow-md transition cursor-pointer disabled:opacity-50 select-none ${
                isDeepRefreshing
                  ? 'bg-purple-950/60 border-purple-500 text-purple-200 animate-pulse'
                  : 'bg-gradient-to-r from-purple-900/60 via-indigo-900/60 to-purple-900/60 hover:from-purple-800/80 hover:to-indigo-800/80 border-purple-500/40 text-purple-200 hover:border-purple-400 hover:text-white shadow-purple-950/40'
              }`}
              title="Systematically iterates through series flagged as 'metadata-missing' and executes sequential queries across all fallback providers (OMDb -> TVMaze -> iTunes -> Encyclopedic -> Heuristics)"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isDeepRefreshing ? 'animate-spin text-purple-400' : 'text-purple-300'}`} />
              <span>
                {isDeepRefreshing
                  ? 'Deep Refreshing...'
                  : metadataMissingCount > 0
                  ? `Deep Refresh (${metadataMissingCount} Missing)`
                  : 'Deep Refresh Series'}
              </span>
            </button>
          )}

          {/* Retry All Failed Button */}
          {onRetryAllFailed && (
            <button
              id="btn-retry-all-failed-logs"
              onClick={handleRetryFailed}
              disabled={isRetrying}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                isRetrying
                  ? 'bg-amber-950/40 border-amber-800/40 text-amber-400/60'
                  : 'bg-amber-900/40 hover:bg-amber-900/60 border-amber-500/40 text-amber-300'
              }`}
              title="Re-trigger metadata fetcher and write-artwork for failed items in last 24h"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Retrying...' : `Retry All Failed (${failedLogsCount})`}</span>
            </button>
          )}

          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            title="Copy logs to clipboard"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
            <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
          </button>

          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30 transition cursor-pointer"
              title="Clear console logs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Deep Refresh Job Live Pipeline Inspector & Status Banner */}
      {deepRefreshJobState && deepRefreshJobState.isActive && (
        <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-800/60 space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
              </span>
              <span className="text-xs font-bold text-purple-200">
                Deep Refresh Job in Progress: {deepRefreshJobState.completedSeries} / {deepRefreshJobState.totalSeries} Series
              </span>
              <span className="text-xs text-purple-300 font-mono">
                ({deepRefreshJobState.currentSeriesTitle || 'Scanning...'})
              </span>
            </div>
            <span className="text-xs font-mono text-purple-400 font-bold">
              {deepRefreshJobState.overallProgress}% Complete
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-purple-900/50">
            <div
              className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full transition-all duration-300"
              style={{ width: `${deepRefreshJobState.overallProgress}%` }}
            />
          </div>

          {/* Sequential Fallback Provider Chain Visualizer */}
          <div className="pt-1">
            <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
              <span>Sequential Fallback Providers Chain:</span>
              <span className="text-purple-300 font-mono text-[10px]">
                Active: {deepRefreshJobState.activeProviderName || 'Primary API'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-1.5 text-[10px] font-mono">
              {[
                { name: '1. Primary API', id: 'primary-api', icon: Radio },
                { name: '2. TVMaze Direct', id: 'tvmaze-direct', icon: Tv },
                { name: '3. iTunes Catalog', id: 'itunes-tmdb', icon: Database },
                { name: '4. Knowledge Vault', id: 'encyclopedic-vault', icon: Layers },
                { name: '5. Heuristics', id: 'heuristic-engine', icon: Sparkles },
              ].map((step, idx) => {
                const stepAudit = deepRefreshJobState.providers?.find((p) => p.providerId === step.id);
                const isCurrent = deepRefreshJobState.currentProviderIndex === idx;
                const isSuccess = stepAudit?.status === 'success';
                const isFailed = stepAudit?.status === 'failed';
                const IconComponent = step.icon;

                return (
                  <div
                    key={step.id}
                    className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between transition-colors ${
                      isSuccess
                        ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                        : isCurrent
                        ? 'bg-purple-900/70 border-purple-400 text-purple-200 animate-pulse ring-1 ring-purple-400'
                        : isFailed
                        ? 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <IconComponent className="w-3 h-3 shrink-0" />
                      <span className="truncate">{step.name}</span>
                    </div>
                    <div>
                      {isSuccess && <Check className="w-3 h-3 text-emerald-400" />}
                      {isFailed && <X className="w-3 h-3 text-slate-600" />}
                      {isCurrent && <Clock className="w-3 h-3 text-purple-300 animate-spin" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Flagged Series Summary Ribbon */}
      {metadataMissingCount > 0 && !deepRefreshJobState?.isActive && (
        <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>{metadataMissingCount} series flagged as 'metadata-missing'</strong> in current library/Samba share.
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {metadataMissingSeries.slice(0, 3).map((item) => (
              <span
                key={item.id}
                className="px-2 py-0.5 rounded-md bg-amber-900/50 text-amber-300 border border-amber-600/40 font-mono text-[10px]"
                title={item.path}
              >
                {item.name}
              </span>
            ))}
            {onDeepRefresh && (
              <button
                onClick={handleTriggerDeepRefresh}
                className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition cursor-pointer text-[11px]"
              >
                Run Deep Refresh Now
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 py-3 border-y border-slate-800/50">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative min-w-[160px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 appearance-none cursor-pointer font-semibold transition-all hover:bg-slate-900"
            >
              <option value="all">All Event Logs</option>
              <option value="deep_refresh">Deep Refresh Queries</option>
              <option value="metadata-missing">Flagged Missing Metadata</option>
              <option value="success">Successful Operations</option>
              <option value="samba_pushed">Samba Disk Writes</option>
              <option value="connected">Network & Connectivity</option>
              <option value="warning">System Warnings</option>
              <option value="error">Critical Errors</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
              <ArrowRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total:</span>
            <span className="text-xs font-mono text-indigo-400 font-bold">{filteredLogs.length}</span>
            <span className="text-[10px] text-slate-600">/</span>
            <span className="text-xs font-mono text-slate-500">{logs.length}</span>
          </div>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search log titles, details, or timestamps..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 font-mono transition-all placeholder:text-slate-600"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-800 rounded-full text-slate-500 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Log Feed Terminal Screen */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-2 shadow-inner">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-slate-600">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No console logs match the selected filter.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isSuccess = log.status === 'success';
            const isError = log.status === 'error';
            const isWarning = log.status === 'warning';
            const isMissing = log.status === 'metadata-missing';
            const isDeepRefresh = log.type === 'deep_refresh';

            return (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg border transition ${
                  isError
                    ? 'bg-rose-950/20 border-rose-900/40 text-rose-200'
                    : isMissing
                    ? 'bg-amber-950/30 border-amber-700/50 text-amber-200'
                    : isDeepRefresh
                    ? 'bg-purple-950/20 border-purple-900/40 text-purple-200'
                    : isWarning
                    ? 'bg-amber-950/20 border-amber-900/40 text-amber-200'
                    : 'bg-slate-900/80 border-slate-800/80 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[10px]">[{log.timestamp}]</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        isError
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : isMissing
                          ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                          : isDeepRefresh
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : isWarning
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="font-bold text-white text-[11px]">{log.title}</span>
                  </div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">
                    {log.type}
                  </span>
                </div>
                <p
                  className={`pl-4 border-l-2 text-[11px] leading-relaxed break-words ${
                    isDeepRefresh
                      ? 'border-purple-500/50 text-purple-200/90 font-mono'
                      : isMissing
                      ? 'border-amber-500/50 text-amber-200/90 font-mono'
                      : 'border-indigo-500/40 text-slate-400'
                  }`}
                >
                  {log.details}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
