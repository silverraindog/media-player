import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCw,
  X,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Layers,
  Zap,
  ShieldCheck,
  ShieldAlert,
  FolderTree,
  Terminal,
  FileCheck,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { LastScanSummary } from '../types';

interface LastScanSummaryCardProps {
  summary: LastScanSummary;
  onDismiss?: () => void;
  onReSync?: () => void;
  isSyncing?: boolean;
  onInspectFiles?: () => void;
}

export const LastScanSummaryCard: React.FC<LastScanSummaryCardProps> = ({
  summary,
  onDismiss,
  onReSync,
  isSyncing = false,
  onInspectFiles,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasBottlenecks = summary.bottlenecks && summary.bottlenecks.length > 0;
  const isOptimal = summary.status === 'optimal' || (!hasBottlenecks && summary.totalFilesScanned > 0);
  const isError = summary.status === 'error' || summary.totalFilesScanned === 0;

  // Formatting helpers
  const formatTime = (seconds: number) => {
    if (seconds < 1) {
      return `${Math.round(seconds * 1000)}ms`;
    }
    return `${seconds.toFixed(2)}s`;
  };

  const getBottleneckIcon = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('timeout') || lower.includes('latency') || lower.includes('retry')) {
      return <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
    }
    if (lower.includes('depth') || lower.includes('barrier') || lower.includes('limit')) {
      return <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />;
    }
    if (lower.includes('permission') || lower.includes('read-only')) {
      return <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />;
    }
    if (lower.includes('25') || lower.includes('boundary') || lower.includes('throttle')) {
      return <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
    }
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
  };

  return (
    <div
      id="last-scan-summary-card"
      className={`rounded-2xl border transition-all shadow-xl backdrop-blur-sm overflow-hidden ${
        isError
          ? 'bg-slate-950/95 border-rose-500/40 shadow-rose-950/20'
          : hasBottlenecks
          ? 'bg-slate-950/95 border-amber-500/40 shadow-amber-950/20'
          : 'bg-slate-950/95 border-emerald-500/40 shadow-emerald-950/20'
      }`}
    >
      {/* Header Bar */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center space-x-3 min-w-0">
          <div
            className={`p-2.5 rounded-xl border flex-shrink-0 ${
              isError
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : hasBottlenecks
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            <Activity className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Last Scan Summary
              </h3>

              {/* Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold border ${
                  isError
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                    : hasBottlenecks
                    ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isError
                      ? 'bg-rose-400 animate-pulse'
                      : hasBottlenecks
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
                {isError
                  ? 'Scan Issues Detected'
                  : hasBottlenecks
                  ? `${summary.bottlenecks.length} Bottleneck${summary.bottlenecks.length > 1 ? 's' : ''} Encountered`
                  : 'Optimal Performance · 0 Bottlenecks'}
              </span>

              <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
                Synced at {summary.timestamp}
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {summary.scanMode} across{' '}
              <code className="text-indigo-300 font-mono font-semibold text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                {summary.scanPath}
              </code>
            </p>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {onReSync && (
            <button
              onClick={onReSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-50"
              title="Trigger a new sync scan on this path"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Scanning...' : 'Re-scan'}</span>
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-slate-700"
            title={isExpanded ? 'Collapse details' : 'Expand full summary'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-slate-700"
              title="Dismiss summary card"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row (Always Visible) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-800/80 bg-slate-950/40">
        {/* Metric 1: Files Scanned */}
        <div className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
            <FileCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Total Files Scanned</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
              {summary.totalFilesScanned.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">files</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono truncate">
            {summary.totalFoldersScanned ? `${summary.totalFoldersScanned} directories` : 'Directory tree'}
            {summary.mediaExtractedCount ? ` · ${summary.mediaExtractedCount} media matches` : ''}
          </div>
        </div>

        {/* Metric 2: Processing Time in Seconds */}
        <div className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Processing Time</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-300 tracking-tight">
              {formatTime(summary.processingTimeSeconds)}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">seconds</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono truncate">
            {summary.itemsPerSecond ? `${summary.itemsPerSecond} files/sec throughput` : 'Completed in one pass'}
          </div>
        </div>

        {/* Metric 3: Depth Traversed vs Limit */}
        <div className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Traversal Depth</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-cyan-300 tracking-tight">
              Level {summary.maxDepthReached ?? 1}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">reached</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono truncate">
            Depth limit configured: {summary.depthLimit} levels
          </div>
        </div>

        {/* Metric 4: Bottleneck Status */}
        <div className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
            <ShieldCheck className={`w-3.5 h-3.5 ${hasBottlenecks ? 'text-amber-400' : 'text-emerald-400'}`} />
            <span>Encountered Bottlenecks</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${
                isError
                  ? 'text-rose-400'
                  : hasBottlenecks
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {summary.bottlenecks.length}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {summary.bottlenecks.length === 1 ? 'detected' : 'detected'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono truncate">
            {summary.retriesEncountered ? `${summary.retriesEncountered} network retries` : 'Network & I/O healthy'}
          </div>
        </div>
      </div>

      {/* Collapsible Detailed Bottlenecks and Diagnostics Panel */}
      {isExpanded && (
        <div className="p-4 sm:p-5 border-t border-slate-800/80 space-y-4 bg-slate-950/70">
          {/* Section: Bottlenecks Breakdown */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 font-mono">
                {hasBottlenecks ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Scan Diagnostics & Bottleneck Analysis</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {hasBottlenecks
                  ? `${summary.bottlenecks.length} issue(s) identified`
                  : 'All hardware & network checks optimal'}
              </span>
            </div>

            {hasBottlenecks ? (
              <div className="space-y-2">
                {summary.bottlenecks.map((bottleneck, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/25 flex items-start gap-3 text-xs"
                  >
                    {getBottleneckIcon(bottleneck)}
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="font-semibold text-amber-200 leading-snug">
                        {bottleneck}
                      </p>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                        {bottleneck.toLowerCase().includes('depth')
                          ? 'Recommendation: Increase the "Depth Limit" parameter in the Explorer header bar to traverse deeper nested seasons and discs.'
                          : bottleneck.toLowerCase().includes('25')
                          ? 'Observation: Check if WalkDir timeout or event throttling returned early. Full Deep Sync can be re-run with safe mode off.'
                          : bottleneck.toLowerCase().includes('0 files')
                          ? 'Recommendation: Verify that the share is mounted in Finder (⌘K) or check the Samba Mount Hub settings.'
                          : bottleneck.toLowerCase().includes('retry')
                          ? 'Observation: SMB socket connection experienced high latency; automatic exponential backoff retried successfully.'
                          : 'System automated mitigation handled this condition during traversal.'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="leading-relaxed">
                    <strong>Zero Bottlenecks Encountered:</strong> Native filesystem traversal maintained high I/O throughput, 0 network socket retries, and clean folder depth progression.
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                  PASSED
                </span>
              </div>
            )}
          </div>

          {/* Technical Diagnostics Footer */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-4 flex-wrap font-mono text-[11px]">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                <span>Target: {summary.scanPath}</span>
              </span>
              <span className="text-slate-600">·</span>
              <span>Mode: {summary.scanMode}</span>
              <span className="text-slate-600">·</span>
              <span>Throughput: {summary.itemsPerSecond ?? 0} items/sec</span>
              {summary.retriesEncountered !== undefined && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>Retries: {summary.retriesEncountered}</span>
                </>
              )}
            </div>

            {onInspectFiles && (
              <button
                onClick={onInspectFiles}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition cursor-pointer"
              >
                <span>Inspect Discovered Files</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
