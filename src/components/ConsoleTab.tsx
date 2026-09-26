import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Search,
  Trash2,
  Download,
  Copy,
  Pause,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  Filter,
  ArrowDown,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ConsoleLogEntry, ConsoleLogLevel, ConsoleLogCategory } from '../types';
import { logger, LOG_LEVEL_RANKS } from '../utils/loggerService';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export const ConsoleTab: React.FC = () => {
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<ConsoleLogLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<ConsoleLogCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(logger.getDebugEnabled());

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = logger.subscribe((newLogs, minLvl, debugFlag) => {
      if (!isPaused) {
        setLogs(newLogs);
      }
      setDebugEnabled(debugFlag);
    });
    return () => unsubscribe();
  }, [isPaused]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Filter logs using hierarchical rank
  const filteredLogs = logs.filter((log) => {
    if (selectedLevel !== 'all') {
      const logRank = LOG_LEVEL_RANKS[log.level] || 20;
      const selectedRank = LOG_LEVEL_RANKS[selectedLevel as ConsoleLogLevel] || 20;
      if (log.level !== selectedLevel && logRank < selectedRank) {
        return false;
      }
    }
    if (selectedCategory !== 'all' && log.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchCat = log.category.toLowerCase().includes(q);
      const matchLvl = log.level.toLowerCase().includes(q);
      const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(q) : false;
      if (!matchMsg && !matchCat && !matchLvl && !matchDetails) return false;
    }
    return true;
  });

  // Stats calculation
  const totalCount = logs.length;
  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;
  const successCount = logs.filter((l) => l.level === 'success').length;
  const infoCount = logs.filter((l) => l.level === 'info' || l.level === 'debug').length;

  // Compute chart data for the last hour (6 buckets of 10 minutes)
  const chartData = React.useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const bucketSizeMs = 600000; // 10 minutes
    const bucketsCount = 6;

    const buckets: Array<{ timeLabel: string; success: number; failed: number; timestamp: number }> = [];

    for (let i = bucketsCount - 1; i >= 0; i--) {
      const bucketEndTime = now - i * bucketSizeMs;
      const bucketStartTime = bucketEndTime - bucketSizeMs;
      const d = new Date(bucketStartTime);
      const timeLabel = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      buckets.push({
        timeLabel,
        success: 0,
        failed: 0,
        timestamp: bucketStartTime,
      });
    }

    logs.forEach((log) => {
      const logTime = new Date(log.timestamp).getTime();
      if (logTime >= oneHourAgo) {
        const bucketIndex = buckets.findIndex((b, idx) => {
          const nextTime = idx < buckets.length - 1 ? buckets[idx + 1].timestamp : now + 1;
          return logTime >= b.timestamp && logTime < nextTime;
        });
        if (bucketIndex !== -1) {
          if (log.level === 'success') {
            buckets[bucketIndex].success += 1;
          } else if (log.level === 'error') {
            buckets[bucketIndex].failed += 1;
          }
        }
      }
    });

    return buckets;
  }, [logs]);

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toLocaleTimeString()}.${String(new Date(l.timestamp).getMilliseconds()).padStart(3, '0')}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}${
            l.details ? `\nDetails: ${JSON.stringify(l.details, null, 2)}` : ''
          }`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `sambavault_console_logs_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleSimulateTestLog = () => {
    const categories: ConsoleLogCategory[] = ['Sync', 'Samba', 'Mount', 'Database', 'Scanner', 'Scheduler', 'Auth'];
    const levels: ConsoleLogLevel[] = ['info', 'success', 'warn', 'error', 'debug'];
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const lvl = levels[Math.floor(Math.random() * levels.length)];

    const messages = {
      info: `Executing diagnostic integrity check on ${cat} subsystem...`,
      success: `${cat} operation verified. 100% path resolution achieved.`,
      warn: `${cat} warning: Latency exceeded 120ms during tree traversal.`,
      error: `${cat} error: Failed to connect to socket descriptor or local stream target.`,
      debug: `${cat} trace: Memory tier cache hit count = ${Math.floor(Math.random() * 500)}.`,
    };

    logger.log(lvl, cat, messages[lvl], { simulatedAt: new Date().toISOString(), memoryUsageBytes: 1048576 * Math.random() });
  };

  const getLevelBadge = (level: ConsoleLogLevel) => {
    switch (level) {
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-600/50 font-mono text-[10px] font-bold">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>ERROR</span>
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-600/50 font-mono text-[10px] font-bold">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>WARN</span>
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-600/50 font-mono text-[10px] font-bold">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>SUCCESS</span>
          </span>
        );
      case 'debug':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-600/50 font-mono text-[10px] font-bold">
            <Bug className="w-3 h-3 text-purple-400" />
            <span>DEBUG</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-600/50 font-mono text-[10px] font-bold">
            <Info className="w-3 h-3 text-indigo-400" />
            <span>INFO</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 shadow-inner">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Application Console & Debug Logs</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/50 font-semibold">
                Live Feed
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time telemetry for Samba syncs, folder scanners, SQLite database operations, and background cron schedules.
            </p>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">Total:</span>
            <span className="text-white font-bold tabular-nums">{totalCount}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center gap-2">
            <span className="text-emerald-400">Success:</span>
            <span className="text-emerald-200 font-bold tabular-nums">{successCount}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-800/60 flex items-center gap-2">
            <span className="text-amber-400">Warn:</span>
            <span className="text-amber-200 font-bold tabular-nums">{warnCount}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-800/60 flex items-center gap-2">
            <span className="text-rose-400">Errors:</span>
            <span className="text-rose-200 font-bold tabular-nums">{errorCount}</span>
          </div>
        </div>
      </div>

      {/* Real-Time Sync Activity Dashboard (Recharts AreaChart) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Sync Activity & Operation Telemetry (Last Hour)</h3>
              <p className="text-xs text-slate-400">
                Real-time comparison of successful vs. failed operations across 10-minute intervals.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
              <span className="text-slate-300">Success Operations</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
              <span className="text-slate-300">Failed / Errors</span>
            </div>
          </div>
        </div>

        <div className="h-56 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />
              <Area type="monotone" dataKey="success" name="Successful Ops" stroke="#10b981" fillOpacity={1} fill="url(#colorSuccess)" strokeWidth={2} />
              <Area type="monotone" dataKey="failed" name="Failed Ops" stroke="#f43f5e" fillOpacity={1} fill="url(#colorFailed)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Control Bar: Filters, Search, Actions */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search console logs, paths, or JSON details..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            )}
          </div>

          {/* Actions Group */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                autoScroll
                  ? 'bg-cyan-950 text-cyan-200 border-cyan-600/60 shadow-xs'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <ArrowDown className={`w-3.5 h-3.5 ${autoScroll ? 'text-cyan-400 animate-bounce' : ''}`} />
              <span>Auto-Scroll</span>
            </button>

            {/* Pause/Resume feed */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                isPaused
                  ? 'bg-amber-950 text-amber-200 border-amber-600/60 shadow-xs'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
              }`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 text-amber-400" /> : <Pause className="w-3.5 h-3.5 text-slate-400" />}
              <span>{isPaused ? 'Resume Feed' : 'Pause Feed'}</span>
            </button>

            {/* Debug Mode Toggle */}
            <button
              onClick={() => {
                const next = !debugEnabled;
                logger.setDebugEnabled(next);
                setDebugEnabled(next);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                debugEnabled
                  ? 'bg-purple-950 text-purple-200 border-purple-600/60 shadow-xs'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Toggle Debug Mode: When ON, verbose path scanning logs and debug telemetry are active and visible"
            >
              <Bug className={`w-3.5 h-3.5 ${debugEnabled ? 'text-purple-400' : 'text-slate-500'}`} />
              <span>Debug Logs: {debugEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Copy Logs */}
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 text-slate-300 border border-slate-800 hover:text-white hover:border-slate-700 transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-indigo-400" />
              <span>{copied ? 'Copied!' : 'Copy Filtered'}</span>
            </button>

            {/* Export JSON */}
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 text-slate-300 border border-slate-800 hover:text-white hover:border-slate-700 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export JSON</span>
            </button>

            {/* Simulate Test Event */}
            <button
              onClick={handleSimulateTestLog}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/30 text-indigo-200 border border-indigo-500/50 hover:bg-indigo-600/50 transition cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Simulate Log</span>
            </button>

            {/* Clear Logs */}
            <button
              onClick={() => logger.clearLogs()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900/80 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-800/80 flex-wrap text-xs">
          {/* Level Filters */}
          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mr-1">Level:</span>
            {(['all', 'info', 'success', 'warn', 'error', 'debug'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition cursor-pointer ${
                  selectedLevel === lvl
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {lvl.toUpperCase()}
              </button>
            ))}
          </div>

          <span className="text-slate-700 hidden md:inline">|</span>

          {/* Category Filters */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mr-1">Category:</span>
            {(['all', 'Sync', 'Samba', 'Mount', 'Database', 'Scanner', 'Scheduler', 'Auth', 'System'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-cyan-600 text-white font-bold shadow-xs'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-2xl overflow-hidden font-mono text-xs text-slate-300 min-h-[420px] max-h-[600px] flex flex-col">
        {/* Terminal Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-850 shrink-0 text-slate-500 text-[11px]">
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            <span className="ml-2 font-mono text-slate-400">sambavault-telemetry.log</span>
          </div>
          <div>
            Showing {filteredLogs.length} of {totalCount} log entries
          </div>
        </div>

        {/* Scrollable Log Lines Container */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
          {filteredLogs.length === 0 ? (
            <div className="h-full py-16 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <Terminal className="w-8 h-8 opacity-40" />
              <p className="text-xs">No console logs match the selected filter query.</p>
              <button
                onClick={() => {
                  setSelectedLevel('all');
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="text-indigo-400 hover:underline text-xs cursor-pointer pt-2"
              >
                Reset all filters
              </button>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const d = new Date(log.timestamp);
              const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
                d.getSeconds()
              ).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
              const isExpanded = expandedLogId === log.id;

              return (
                <div
                  key={log.id}
                  className="p-2 rounded-lg bg-slate-900/60 border border-slate-850/80 hover:bg-slate-900 transition flex flex-col space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-slate-500 text-[11px] tabular-nums shrink-0 pt-0.5">{timeStr}</span>
                      {getLevelBadge(log.level)}
                      <span className="text-cyan-400/90 font-semibold px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40 text-[10px]">
                        {log.category}
                      </span>
                      <span className="text-slate-200 break-all leading-snug">{log.message}</span>
                    </div>

                    {log.details && (
                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 shrink-0 cursor-pointer"
                      >
                        {isExpanded ? 'Hide JSON' : '{ JSON }'}
                      </button>
                    )}
                  </div>

                  {/* Formatted JSON details expander */}
                  {isExpanded && log.details && (
                    <div className="mt-2 p-2.5 rounded bg-black/80 border border-slate-800 text-[11px] text-cyan-300 font-mono overflow-x-auto">
                      <pre>{JSON.stringify(log.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
