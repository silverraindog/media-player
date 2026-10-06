import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  ShieldCheck,
  AlertTriangle,
  Search,
  Filter,
  Trash2,
  Download,
  Copy,
  Check,
  X,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Folder,
  File,
  CheckCircle2,
  Wand2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  sanitizationTracker,
  SanitizationLogEntry,
  analyzePathSanitization,
} from '../utils/sanitizationTracker';
import { SambaShareNode } from '../types';

interface SanitizationHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sambaTree?: SambaShareNode[];
}

export const SanitizationHistoryPanel: React.FC<SanitizationHistoryPanelProps> = ({
  isOpen,
  onClose,
  sambaTree = [],
}) => {
  const [logs, setLogs] = useState<SanitizationLogEntry[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'corrected' | 'clean'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPlayground, setShowPlayground] = useState(false);
  const [playgroundInput, setPlaygroundInput] = useState('Movies/Sci-Fi/Alien: Romulus (2024)//Disc 1/');
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLogs(sanitizationTracker.getHistory());
    const unsubscribe = sanitizationTracker.subscribe((updated) => {
      setLogs([...updated]);
    });
    return () => unsubscribe();
  }, []);

  // Filtered list
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterMode === 'corrected' && !log.wasCorrected) return false;
      if (filterMode === 'clean' && log.wasCorrected) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        log.nodeName.toLowerCase().includes(q) ||
        log.rawPath.toLowerCase().includes(q) ||
        log.sanitizedPath.toLowerCase().includes(q) ||
        log.dirtyReasons.some((r) => r.toLowerCase().includes(q)) ||
        log.transformationsApplied.some((t) => t.toLowerCase().includes(q)) ||
        log.source.toLowerCase().includes(q)
      );
    });
  }, [logs, filterMode, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = logs.length;
    const corrected = logs.filter((l) => l.wasCorrected).length;
    const clean = total - corrected;
    const rate = total > 0 ? Math.round((corrected / total) * 100) : 0;
    return { total, corrected, clean, rate };
  }, [logs]);

  // Playground analysis
  const playgroundAnalysis = useMemo(() => {
    if (!playgroundInput.trim()) return null;
    return analyzePathSanitization(playgroundInput, {
      nodeType: 'folder',
      source: 'Interactive Test',
    });
  }, [playgroundInput]);

  const handleCopyPath = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleScanCurrentTree = () => {
    if (sambaTree.length > 0) {
      sanitizationTracker.auditTreeNodes(sambaTree);
    }
  };

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `samba-sanitization-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const presetExamples = [
    'Movies/Sci-Fi/Alien: Romulus (2024)//Disc 1/',
    'TV Shows/What If... ?/Season 01',
    'Documentaries/Apollo 11\\Mission Logs',
    'Music/Albums/AC%20DC/Back in Black',
    'Movies/Action/The: Dark: Knight: (2008)',
  ];

  if (!isOpen) return null;

  return (
    <div
      id="sanitization-history-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Sanitization History</h2>
                <span className="px-2 py-0.5 rounded-md bg-teal-950 text-teal-300 border border-teal-800/60 text-xs font-mono font-semibold">
                  sanitizeSambaPath Logs
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Detailed transformation audit verifying if folder paths were corrected from a 'dirty' state to standard Samba SMB formatting.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowPlayground(!showPlayground)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                showPlayground
                  ? 'bg-indigo-950 text-indigo-200 border-indigo-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>{showPlayground ? 'Hide Path Tester' : 'Interactive Path Tester'}</span>
            </button>

            {sambaTree.length > 0 && (
              <button
                onClick={handleScanCurrentTree}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-950/60 hover:bg-teal-900/80 text-teal-200 border border-teal-600/50 text-xs font-semibold transition cursor-pointer"
                title="Scan all folder nodes currently in the Samba tree"
              >
                <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                <span>Audit Current Tree</span>
              </button>
            )}

            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Export transformation audit as JSON"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={() => sanitizationTracker.clearHistory()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 text-xs font-semibold transition cursor-pointer"
              title="Clear all recorded transformation history"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Counters Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 bg-slate-950/40 border-b border-slate-800 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Total Analyzed:</span>
            <span className="text-white font-bold text-sm tabular-nums">{stats.total}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Corrected Dirty:</span>
            </div>
            <span className="text-amber-300 font-bold text-sm tabular-nums">{stats.corrected}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified Clean:</span>
            </div>
            <span className="text-emerald-300 font-bold text-sm tabular-nums">{stats.clean}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-teal-950/40 border border-teal-800/50 flex items-center justify-between">
            <span className="text-teal-400">Correction Rate:</span>
            <span className="text-teal-300 font-bold text-sm tabular-nums">{stats.rate}%</span>
          </div>
        </div>

        {/* Interactive Path Playground (Collapsible) */}
        {showPlayground && (
          <div className="px-6 py-4 bg-slate-950 border-b border-indigo-900/40 space-y-3 animate-in slide-in-from-top duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Interactive sanitizeSambaPath Tester
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Type any folder path to inspect real-time transformations and dirty detection
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={playgroundInput}
                onChange={(e) => setPlaygroundInput(e.target.value)}
                placeholder="Enter folder path e.g. Movies/Sci-Fi/Alien: Romulus (2024)//Disc 1/"
                className="flex-1 bg-slate-900 border border-indigo-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={() => {
                  if (playgroundAnalysis) {
                    sanitizationTracker.recordTransform(playgroundInput, {
                      source: 'Interactive Test',
                      nodeType: 'folder',
                    });
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer shadow"
              >
                Log to History
              </button>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="text-slate-500">Presets:</span>
              {presetExamples.map((ex, idx) => (
                <button
                  key={idx}
                  onClick={() => setPlaygroundInput(ex)}
                  className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-mono transition cursor-pointer truncate max-w-[200px]"
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Live Output Card */}
            {playgroundAnalysis && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Raw Input:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        playgroundAnalysis.wasCorrected
                          ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                      }`}
                    >
                      {playgroundAnalysis.wasCorrected ? 'DIRTY DETECTED' : 'CLEAN'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 text-amber-300 break-all">
                    {playgroundAnalysis.rawPath}
                  </div>
                  {playgroundAnalysis.dirtyReasons.length > 0 && (
                    <div className="space-y-1">
                      {playgroundAnalysis.dirtyReasons.map((r, i) => (
                        <div key={i} className="text-amber-400/90 text-[10px] flex items-center gap-1.5">
                          <span>•</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Sanitized Output (Samba POSIX Safe):</span>
                    <button
                      onClick={() => handleCopyPath(playgroundAnalysis.sanitizedPath, 'playground')}
                      className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1"
                    >
                      {copiedId === 'playground' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === 'playground' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-emerald-900/60 text-emerald-300 break-all font-bold">
                    {playgroundAnalysis.sanitizedPath}
                  </div>
                  <div className="space-y-1">
                    {playgroundAnalysis.transformationsApplied.map((t, i) => (
                      <div key={i} className="text-emerald-400/90 text-[10px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Transformations ({logs.length})
            </button>
            <button
              onClick={() => setFilterMode('corrected')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                filterMode === 'corrected'
                  ? 'bg-amber-950 text-amber-200 border border-amber-700/60 shadow-xs'
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Corrected from Dirty ({stats.corrected})</span>
            </button>
            <button
              onClick={() => setFilterMode('clean')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                filterMode === 'clean'
                  ? 'bg-emerald-950 text-emerald-200 border border-emerald-700/60 shadow-xs'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Verified Clean ({stats.clean})</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search folder, path, or reason..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Transformation Logs Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredLogs.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-slate-800">
              <History className="w-10 h-10 text-slate-600 mb-3" />
              <h4 className="text-sm font-semibold text-slate-300">No transformation logs found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                {searchTerm || filterMode !== 'all'
                  ? 'No paths match your active search filter. Clear filters to view full sanitization history.'
                  : 'Path transformations performed by sanitizeSambaPath will appear here in real-time as folders are scanned or cleaned.'}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogIds[log.id] ?? false;
              return (
                <div
                  key={log.id}
                  id={`sanitization-log-${log.id}`}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    log.wasCorrected
                      ? 'bg-slate-950/70 border-amber-900/40 hover:border-amber-700/60 shadow-lg shadow-amber-950/20'
                      : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700/80'
                  }`}
                >
                  {/* Card Header */}
                  <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 bg-slate-900/60">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`p-2 rounded-xl ${
                          log.wasCorrected
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        }`}
                      >
                        {log.nodeType === 'folder' ? <Folder className="w-4 h-4" /> : <File className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white font-mono">{log.nodeName}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase flex items-center gap-1 ${
                              log.wasCorrected
                                ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            }`}
                          >
                            {log.wasCorrected ? (
                              <>
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                                <span>Corrected from Dirty</span>
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                <span>Verified Clean</span>
                              </>
                            )}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                            {log.source}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()} · {new Date(log.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyPath(log.sanitizedPath, log.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition cursor-pointer"
                        title="Copy sanitized path"
                      >
                        {copiedId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === log.id ? 'Copied' : 'Copy Clean'}</span>
                      </button>

                      <button
                        onClick={() => toggleExpand(log.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                        title="Toggle full details"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Transformation Diff Body */}
                  <div className="p-5 space-y-4 font-mono text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Before (Raw) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-semibold">Raw Folder Path (Original State):</span>
                          {log.wasCorrected && (
                            <span className="text-amber-400 text-[10px] font-bold">Dirty State Detected</span>
                          )}
                        </div>
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-amber-200 break-all leading-relaxed">
                          {log.rawPath}
                        </div>
                      </div>

                      {/* After (Sanitized) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-semibold">Transformed Samba Path:</span>
                          <span className="text-emerald-400 text-[10px] font-bold">SMB Safe</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-950 border border-emerald-900/50 text-emerald-300 font-bold break-all leading-relaxed">
                          {log.sanitizedPath}
                        </div>
                      </div>
                    </div>

                    {/* Reasons & Specific Applied Transforms */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-900">
                      {/* Dirty Reasons */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                          Detected Issues & Dirty Flags:
                        </span>
                        {log.dirtyReasons.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic">None. Path was clean on arrival.</p>
                        ) : (
                          <div className="space-y-1">
                            {log.dirtyReasons.map((reason, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-amber-400/90 text-[11px]">
                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                <span>{reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Applied Transforms */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                          Applied Transformations:
                        </span>
                        <div className="space-y-1">
                          {log.transformationsApplied.map((trans, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-emerald-400/90 text-[11px]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>{trans}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
