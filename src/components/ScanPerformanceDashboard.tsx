import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Download,
  Trash2,
  Sparkles,
  BarChart3,
  PieChart as PieChartIcon,
  Layers,
  Search,
  Filter,
  Info,
  RotateCw,
  HardDrive,
  Cpu,
  Gauge,
  ArrowUpDown,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import {
  ScanStepMetric,
  FullScanPerformanceRun,
  getScanPerformanceHistory,
  subscribeScanPerformance,
  clearScanPerformanceHistory,
  getSamplePerformanceRuns,
} from '../utils/scanPerformanceCollector';

interface ScanPerformanceDashboardProps {
  onTriggerSync?: () => Promise<void>;
  isSyncing?: boolean;
}

const PHASE_COLORS: Record<string, string> = {
  traversal: '#06b6d4', // Cyan for Directory Traversal
  classification: '#a855f7', // Purple for Regex Classification
  metadata: '#f43f5e', // Rose for Metadata Resolution
  indexing: '#3b82f6', // Blue for Tree Indexing
  artwork: '#10b981', // Emerald for Artwork Verification
};

export const ScanPerformanceDashboard: React.FC<ScanPerformanceDashboardProps> = ({
  onTriggerSync,
  isSyncing = false,
}) => {
  const [runsHistory, setRunsHistory] = useState<FullScanPerformanceRun[]>(() =>
    getScanPerformanceHistory()
  );
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'Full Deep Sync' | 'Safe Scan'>('all');
  const [activeChartType, setActiveChartType] = useState<'bar' | 'pie' | 'trend'>('bar');
  const [copiedExport, setCopiedExport] = useState(false);

  // Subscribe to real-time performance updates during handleSyncSamba
  useEffect(() => {
    const unsubscribe = subscribeScanPerformance((runs) => {
      setRunsHistory(runs);
      if (runs.length > 0 && !selectedRunId) {
        setSelectedRunId(runs[0].id);
      }
    });

    const handleCustomEvent = (e: any) => {
      if (e?.detail) {
        setRunsHistory(getScanPerformanceHistory());
      }
    };

    window.addEventListener('samba-performance-metrics-updated', handleCustomEvent);
    return () => {
      unsubscribe();
      window.removeEventListener('samba-performance-metrics-updated', handleCustomEvent);
    };
  }, [selectedRunId]);

  // Filtered runs
  const filteredRuns = useMemo(() => {
    if (filterMode === 'all') return runsHistory;
    return runsHistory.filter((r) => r.scanMode === filterMode);
  }, [runsHistory, filterMode]);

  // Currently selected performance run
  const currentRun = useMemo(() => {
    if (selectedRunId) {
      const match = runsHistory.find((r) => r.id === selectedRunId);
      if (match) return match;
    }
    return filteredRuns[0] || runsHistory[0] || getSamplePerformanceRuns()[0];
  }, [selectedRunId, runsHistory, filteredRuns]);

  // Identify primary stall phase
  const primaryStall = useMemo(() => {
    if (!currentRun || !currentRun.steps || currentRun.steps.length === 0) return null;
    const sorted = [...currentRun.steps].sort((a, b) => b.timeTakenMs - a.timeTakenMs);
    const top = sorted[0];
    const isStall = top.percentageOfTotal > 40 || top.timeTakenMs > 2000;
    return {
      step: top,
      isStall,
      advice:
        top.phaseKey === 'metadata'
          ? 'Canonical metadata resolution is taking >40% of sync time. Enable Safe Scan mode in Settings to bypass network API lookups for instant local scans.'
          : top.phaseKey === 'traversal'
          ? 'Directory traversal is taking >40% of sync time. Check SMB mount latency or lower scan depth limit (e.g. depth limit = 15).'
          : top.phaseKey === 'artwork'
          ? 'Artwork disk verification is taking substantial time. Ensure local thumbnail disk cache is enabled.'
          : 'Phase execution is well balanced across traversal and classification.',
    };
  }, [currentRun]);

  // Chart data for BarChart (Scan Step vs Time Taken ms)
  const barChartData = useMemo(() => {
    if (!currentRun || !currentRun.steps) return [];
    return currentRun.steps.map((s) => ({
      stepName: s.stepName,
      timeTakenMs: s.timeTakenMs,
      percentage: s.percentageOfTotal,
      itemsProcessed: s.itemsProcessed,
      phaseKey: s.phaseKey,
      status: s.status,
      details: s.details,
    }));
  }, [currentRun]);

  // Chart data for PieChart (% Breakdown)
  const pieChartData = useMemo(() => {
    if (!currentRun || !currentRun.steps) return [];
    return currentRun.steps.map((s) => ({
      name: s.stepName,
      value: s.timeTakenMs,
      percentage: s.percentageOfTotal,
      color: PHASE_COLORS[s.phaseKey] || '#64748b',
    }));
  }, [currentRun]);

  // Chart data for TrendChart across recent runs
  const trendChartData = useMemo(() => {
    return [...runsHistory]
      .reverse()
      .slice(-10)
      .map((r, idx) => ({
        index: idx + 1,
        timestamp: r.timestamp,
        totalMs: r.totalDurationMs,
        totalFiles: r.totalFiles,
        traversalMs: r.steps.find((s) => s.phaseKey === 'traversal')?.timeTakenMs || 0,
        metadataMs: r.steps.find((s) => s.phaseKey === 'metadata')?.timeTakenMs || 0,
        scanMode: r.scanMode,
      }));
  }, [runsHistory]);

  const handleExportDiagnostics = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        selectedRun: currentRun,
        allRunsHistory: runsHistory,
      },
      null,
      2
    );
    navigator.clipboard.writeText(payload);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2500);

    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sambavault-scan-performance-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* HEADER TOOLBAR */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-300 shadow-lg">
            <Gauge className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-tight">Scan Performance Dashboard</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/50 text-[11px] font-mono font-bold">
                Recharts Performance Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Visualizes step duration (ms) for every scan phase in <code className="text-cyan-300 font-mono">handleSyncSamba</code> to identify sync stall bottlenecks.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {/* Run Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedRunId || (currentRun?.id ?? '')}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
            >
              {runsHistory.map((run) => (
                <option key={run.id} value={run.id} className="bg-slate-900 text-slate-200">
                  {run.timestamp} - {run.scanMode} ({run.totalDurationMs}ms, {run.totalFiles} files)
                </option>
              ))}
            </select>
          </div>

          {/* Filter Mode */}
          <div className="flex items-center bg-slate-950 p-1 border border-slate-800 rounded-xl text-[11px]">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                filterMode === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('Full Deep Sync')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                filterMode === 'Full Deep Sync' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Deep Sync
            </button>
            <button
              onClick={() => setFilterMode('Safe Scan')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                filterMode === 'Safe Scan' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Safe Scan
            </button>
          </div>

          {onTriggerSync && (
            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 active:from-cyan-700 active:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-300 fill-amber-300 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Running Scan...' : 'Trigger Scan Benchmark'}</span>
            </button>
          )}

          <button
            onClick={handleExportDiagnostics}
            className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            title="Export JSON report"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>{copiedExport ? 'Copied JSON!' : 'Export Report'}</span>
          </button>
        </div>
      </div>

      {/* TOP METRICS SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sync Time */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Total Sync Duration</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">{currentRun?.totalDurationMs ?? 0}</span>
            <span className="text-xs font-mono text-slate-400">ms</span>
            <span
              className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                (currentRun?.totalDurationMs ?? 0) < 2000
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                  : (currentRun?.totalDurationMs ?? 0) < 5000
                  ? 'bg-amber-950 text-amber-300 border border-amber-600/40'
                  : 'bg-rose-950 text-rose-300 border border-rose-600/40'
              }`}
            >
              {(currentRun?.totalDurationMs ?? 0) < 2000 ? 'Optimal' : (currentRun?.totalDurationMs ?? 0) < 5000 ? 'Moderate' : 'Slow'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 block font-mono">
            Mode: {currentRun?.scanMode} | Root: "{currentRun?.rootPath}"
          </span>
        </div>

        {/* Slowest Phase / Primary Bottleneck */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Primary Sync Bottleneck</span>
            <AlertTriangle className={`w-4 h-4 ${primaryStall?.isStall ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-rose-300 truncate">{primaryStall?.step.stepName || 'None'}</span>
            <span className="text-xs font-mono text-rose-400 font-bold ml-auto">{primaryStall?.step.timeTakenMs || 0}ms</span>
          </div>
          <span className="text-[11px] text-slate-400 block font-mono truncate">
            {primaryStall?.step.percentageOfTotal.toFixed(1)}% of total sync duration
          </span>
        </div>

        {/* Processing Throughput */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Scanning Throughput</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">
              {Math.round((currentRun?.totalFiles ?? 0) / Math.max(0.1, (currentRun?.totalDurationMs ?? 1000) / 1000))}
            </span>
            <span className="text-xs font-mono text-slate-400">files/sec</span>
          </div>
          <span className="text-[11px] text-slate-400 block font-mono">
            {currentRun?.totalFiles ?? 0} files across {currentRun?.totalFolders ?? 0} folders
          </span>
        </div>

        {/* Active Bottlenecks & Warnings */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Active Bottlenecks</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-300 font-mono">
              {currentRun?.bottlenecks?.length ?? 0}
            </span>
            <span className="text-xs font-mono text-slate-400">issues logged</span>
          </div>
          <span className="text-[11px] text-slate-400 block font-mono truncate">
            {currentRun?.bottlenecks && currentRun.bottlenecks.length > 0
              ? currentRun.bottlenecks[0]
              : 'Zero sync bottlenecks detected'}
          </span>
        </div>
      </div>

      {/* SYNC STALL ADVISORY BANNER */}
      {primaryStall?.isStall && (
        <div className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-amber-950/80 border border-rose-500/40 rounded-2xl p-4 shadow-xl flex items-start space-x-3.5">
          <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 shrink-0 mt-0.5">
            <AlertCircle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-sm">
                Sync Stall Detected in "{primaryStall.step.stepName}" ({primaryStall.step.timeTakenMs}ms)
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700/60 font-mono text-[10px] font-bold">
                {primaryStall.step.percentageOfTotal.toFixed(1)}% OF TOTAL TIME
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">{primaryStall.advice}</p>
          </div>
        </div>
      )}

      {/* RECHARTS CHART PANEL */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Chart View Selector Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">
              {activeChartType === 'bar'
                ? 'Scan Step vs Time Taken (ms)'
                : activeChartType === 'pie'
                ? 'Phase Duration Breakdown (%)'
                : 'Historical Scan Duration Trend'}
            </h3>
          </div>

          <div className="flex items-center bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
            <button
              onClick={() => setActiveChartType('bar')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeChartType === 'bar' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Step Duration (Bar)</span>
            </button>
            <button
              onClick={() => setActiveChartType('pie')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeChartType === 'pie' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>Phase % (Donut)</span>
            </button>
            <button
              onClick={() => setActiveChartType('trend')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeChartType === 'trend' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Latency Trend</span>
            </button>
          </div>
        </div>

        {/* CHART 1: BAR CHART — Scan Step vs Time Taken (ms) */}
        {activeChartType === 'bar' && (
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 15, right: 30, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis
                  dataKey="stepName"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  interval={0}
                  tick={{ fill: '#cbd5e1' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  unit="ms"
                  tick={{ fill: '#94a3b8' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-950 border border-slate-700 p-3 rounded-xl shadow-2xl space-y-1.5 text-xs font-mono">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1">
                            <span className="font-bold text-white">{data.stepName}</span>
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                              style={{ backgroundColor: `${PHASE_COLORS[data.phaseKey]}33`, color: PHASE_COLORS[data.phaseKey] }}
                            >
                              {data.phaseKey}
                            </span>
                          </div>
                          <div className="text-slate-300">
                            Time Taken: <strong className="text-cyan-300">{data.timeTakenMs} ms</strong> ({data.percentage.toFixed(1)}%)
                          </div>
                          <div className="text-slate-400">
                            Items Processed: <strong className="text-slate-200">{data.itemsProcessed}</strong>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-tight pt-1 max-w-xs">{data.details}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="timeTakenMs" name="Duration (ms)" radius={[8, 8, 0, 0]}>
                  {barChartData.map((entry, index) => {
                    const color =
                      entry.timeTakenMs > 2000
                        ? '#f43f5e' // Rose for slow/stall risk
                        : entry.timeTakenMs > 600
                        ? '#f59e0b' // Amber for warning
                        : PHASE_COLORS[entry.phaseKey] || '#10b981';
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* CHART 2: PIE / DONUT CHART — Phase Duration Breakdown (%) */}
        {activeChartType === 'pie' && (
          <div className="h-72 w-full flex items-center justify-center pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={100}
                  paddingAngle={4}
                  label={({ name, percent }: any) => `${name}: ${((percent || 0) * 100).toFixed(1)}%`}
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-pie-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-xl shadow-2xl text-xs font-mono space-y-1">
                          <span className="font-bold text-white">{data.name}</span>
                          <div className="text-cyan-300">
                            {data.value} ms ({data.percentage.toFixed(1)}% of sync duration)
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend formatter={(value) => <span className="text-xs text-slate-300">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* CHART 3: AREA / TREND CHART — Historical Sync Duration Trend */}
        {activeChartType === 'trend' && (
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendChartData} margin={{ top: 15, right: 30, left: 10, bottom: 25 }}>
                <defs>
                  <linearGradient id="totalMsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="traversalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="ms" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-xl shadow-2xl text-xs font-mono space-y-1">
                          <span className="font-bold text-white">{d.timestamp} ({d.scanMode})</span>
                          <div className="text-indigo-300">Total Duration: {d.totalMs} ms</div>
                          <div className="text-cyan-300">Traversal Time: {d.traversalMs} ms</div>
                          <div className="text-rose-300">Metadata Time: {d.metadataMs} ms</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="totalMs" name="Total Sync Time (ms)" stroke="#6366f1" fillOpacity={1} fill="url(#totalMsGrad)" />
                <Area type="monotone" dataKey="traversalMs" name="Traversal Time (ms)" stroke="#06b6d4" fillOpacity={1} fill="url(#traversalGrad)" />
                <Legend formatter={(value) => <span className="text-xs text-slate-300">{value}</span>} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* DETAILED PHASE BREAKDOWN TABLE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Detailed Phase Execution Breakdown</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {currentRun?.steps?.length ?? 0} phases evaluated
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 font-mono border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Scan Step</th>
                <th className="py-2.5 px-3">Phase Key</th>
                <th className="py-2.5 px-3 text-right">Time Taken (ms)</th>
                <th className="py-2.5 px-3 text-right">% Share</th>
                <th className="py-2.5 px-3 text-right">Items Processed</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3">Phase Execution Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {currentRun?.steps?.map((step) => (
                <tr key={step.stepName} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PHASE_COLORS[step.phaseKey] || '#64748b' }}
                    />
                    <span>{step.stepName}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                      style={{ backgroundColor: `${PHASE_COLORS[step.phaseKey]}22`, color: PHASE_COLORS[step.phaseKey] }}
                    >
                      {step.phaseKey}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-cyan-300 font-mono">
                    {step.timeTakenMs} ms
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    {step.percentageOfTotal.toFixed(1)}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-200">
                    {step.itemsProcessed}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        step.status === 'optimal'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                          : step.status === 'warning'
                          ? 'bg-amber-950 text-amber-300 border border-amber-600/40'
                          : 'bg-rose-950 text-rose-300 border border-rose-600/40'
                      }`}
                    >
                      {step.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-400 leading-tight text-[11px] max-w-md break-words">
                    {step.details}
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
