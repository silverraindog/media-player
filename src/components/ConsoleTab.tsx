import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  BarChart,
  Bar,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';
import {
  FullScanPerformanceRun,
  getScanPerformanceHistory,
  subscribeScanPerformance,
  recordScanPerformanceRun,
  clearScanPerformanceHistory,
} from '../utils/scanPerformanceCollector';
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
  AlertOctagon,
  Info,
  Bug,
  Filter,
  ArrowDown,
  Sparkles,
  Zap,
  RotateCw,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Flame,
  Code,
  ExternalLink,
  HardDrive,
  ShieldCheck,
  ShieldAlert,
  Check,
  PlayCircle,
  Eye,
  HelpCircle,
  FolderLock,
  Layers,
  Activity,
  FileText,
  Folder,
  TrendingUp,
  Gauge,
  BarChart3,
  Sliders,
  Target,
  Clock,
} from 'lucide-react';
import { ConsoleLogEntry, ConsoleLogLevel, ConsoleLogCategory, SyncIncident, SambaConfig } from '../types';
import * as d3 from 'd3';
import { logger, LOG_LEVEL_RANKS } from '../utils/loggerService';
import {
  resolveSambaPathToLocalMount,
  PathAnalysisRecord,
  getPathAnalysisHistory,
  subscribePathAnalysis,
  clearPathAnalysisHistory,
  verifyPath,
} from '../utils/tauriBridge';
import {
  ScanDiscoveredPathRecord,
  getScanDebugHistory,
  subscribeScanDebug,
  clearScanDebugHistory,
} from '../utils/scanPathDebugger';
import { PathInspectorView } from './PathInspectorView';
import { PathTesterModal } from './PathTesterModal';
import { ScanPerformanceDashboard } from './ScanPerformanceDashboard';
import { PermissionHelpModal } from './PermissionHelpModal';
import { permissionsManager } from '../utils/permissionsManager';

// D3 Samba Tree Visualizer
interface D3SambaTreeVisualizerProps {
  data: any;
  scannedCount: number;
  isActive: boolean;
}

const D3SambaTreeVisualizer: React.FC<D3SambaTreeVisualizerProps> = ({ data, scannedCount, isActive }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = containerRef.current.clientWidth || 600;
    const containerHeight = 350;

    const root = d3.hierarchy(data);

    if (!root.children || root.children.length === 0) {
      const g = svg.append('g').attr('transform', `translate(${containerWidth / 2}, ${containerHeight / 2})`);
      g.append('circle')
        .attr('r', 12)
        .attr('fill', '#1e293b')
        .attr('stroke', '#475569')
        .attr('stroke-width', 2);
      g.append('text')
        .attr('dy', '25')
        .attr('text-anchor', 'middle')
        .attr('fill', '#64748b')
        .attr('class', 'text-[11px] font-mono')
        .text('No active scan. Run deep sync to see tree.');
      return;
    }

    const treeLayout = d3.tree().nodeSize([28, 140]);
    treeLayout(root as any);

    let minX = Infinity;
    let maxX = -Infinity;
    root.each((d: any) => {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
    });

    const mainGroup = svg.append('g');

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => {
        mainGroup.attr('transform', event.transform);
      });

    svg.call(zoomBehavior as any);

    const initialScale = 0.85;
    const initialX = 50;
    const initialY = containerHeight / 2 - (minX + maxX) / 2 * initialScale;
    
    const initialTransform = d3.zoomIdentity
      .translate(initialX, initialY)
      .scale(initialScale);
      
    svg.call(zoomBehavior.transform as any, initialTransform);

    // Links
    mainGroup.append('g')
      .attr('fill', 'none')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 1.5)
      .selectAll('path')
      .data(root.links())
      .enter()
      .append('path')
      .attr('d', d3.linkHorizontal()
        .x((d: any) => d.y)
        .y((d: any) => d.x) as any
      );

    // Nodes
    const nodeG = mainGroup.append('g')
      .selectAll('g')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

    nodeG.append('circle')
      .attr('r', (d: any) => (d.depth === 0 ? 7 : 4))
      .attr('fill', (d: any) => {
        if (d.data.error) return '#ef4444';
        if (d.data.isDir) return '#10b981';
        return '#38bdf8';
      })
      .attr('stroke', (d: any) => {
        if (d.data.error) return '#fca5a5';
        if (d.data.isDir) return '#a7f3d0';
        return '#bae6fd';
      })
      .attr('stroke-width', 1.2)
      .style('cursor', 'pointer')
      .append('title')
      .text((d: any) => `${d.data.name}${d.data.error ? ` (${d.data.error})` : ''}`);

    nodeG.append('text')
      .attr('dy', '0.31em')
      .attr('x', (d: any) => (d.children ? -8 : 8))
      .attr('text-anchor', (d: any) => (d.children ? 'end' : 'start'))
      .attr('fill', (d: any) => {
        if (d.data.error) return '#fca5a5';
        if (d.data.isDir) return '#cbd5e1';
        return '#94a3b8';
      })
      .attr('class', 'text-[10px] font-mono pointer-events-none select-none')
      .text((d: any) => {
        const maxLen = 14;
        const name = d.data.name;
        if (name.length > maxLen) {
          return name.substring(0, maxLen) + '...';
        }
        return name;
      });

  }, [data]);

  return (
    <div ref={containerRef} className="bg-slate-950 rounded-xl border border-slate-800/80 relative overflow-hidden h-[350px] flex flex-col justify-between">
      <div className="absolute top-3 left-3 z-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-3 backdrop-blur-md">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300">
          <span className={`${isActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-500'} w-2 h-2 rounded-full`}></span>
          <span>Live Discovered: <strong className="text-white">{scannedCount}</strong></span>
        </div>
        {isActive && (
          <span className="text-[10px] bg-cyan-950 border border-cyan-800 text-cyan-400 font-bold px-2 py-0.5 rounded font-mono uppercase animate-pulse">
            Scanning...
          </span>
        )}
      </div>

      <div className="absolute top-3 right-3 z-10 text-[9px] text-slate-500 font-mono flex items-center gap-1 bg-slate-900/60 p-1 rounded">
        <span>🖱️ Drag to Pan | Scroll to Zoom</span>
      </div>

      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};

const ScanErrorsChart: React.FC<{ scannerLogs: ScannerProgressLogItem[] }> = ({ scannerLogs }) => {
  const data = useMemo(() => {
    const errorLogs = scannerLogs.filter(l => l.status === 'permission_denied' || l.status === 'access_barrier' || l.systemErrorCode);
    
    const grouped: Record<number, Record<string, number>> = {};
    errorLogs.forEach(log => {
      const minute = Math.floor(log.createdAt / 60000) * 60000;
      if (!grouped[minute]) grouped[minute] = {};
      const errorCode = log.systemErrorCode || 'Unknown';
      grouped[minute][errorCode] = (grouped[minute][errorCode] || 0) + 1;
    });

    return Object.entries(grouped).map(([time, errors]) => ({
      time: parseInt(time),
      ...errors
    })).sort((a, b) => a.time - b.time);
  }, [scannerLogs]);

  const errorTypes = useMemo(() => {
    const types = new Set<string>();
    data.forEach(d => Object.keys(d).filter(k => k !== 'time').forEach(k => types.add(k)));
    return Array.from(types);
  }, [data]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h4 className="text-sm font-bold text-white">Scan Error Distribution</h4>
          <p className="text-xs text-slate-400">Time-series distribution of errors encountered during scans</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" tickFormatter={(t) => new Date(t).toLocaleTimeString()} stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
          <Legend />
          {errorTypes.map((type, i) => (
            <Line key={type} type="monotone" dataKey={type} stroke={`hsl(${(i * 40) % 360}, 70%, 60%)`} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// Scan & Discovery Ratio Chart (Files Scanned vs New Media Discovered)
interface ScanDiscoveryRatioChartProps {
  onTriggerSync?: () => Promise<void>;
  sambaConfig?: SambaConfig;
}

const ScanDiscoveryRatioChart: React.FC<ScanDiscoveryRatioChartProps> = ({
  onTriggerSync,
  sambaConfig,
}) => {
  const [runsHistory, setRunsHistory] = useState<FullScanPerformanceRun[]>(() =>
    getScanPerformanceHistory()
  );
  const [chartMode, setChartMode] = useState<'composed' | 'trend' | 'depth'>('composed');
  const [filterMode, setFilterMode] = useState<'all' | 'Full Deep Sync' | 'Safe Scan'>('all');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedDepth, setSimulatedDepth] = useState<number>(8);

  useEffect(() => {
    const unsub = subscribeScanPerformance((runs) => {
      setRunsHistory(runs);
    });
    const handleUpdate = () => {
      setRunsHistory(getScanPerformanceHistory());
    };
    window.addEventListener('samba-performance-metrics-updated', handleUpdate);
    return () => {
      unsub();
      window.removeEventListener('samba-performance-metrics-updated', handleUpdate);
    };
  }, []);

  const chartData = useMemo(() => {
    const filtered = runsHistory.filter((r) => filterMode === 'all' || r.scanMode === filterMode);
    // Sort oldest first for natural time-series left-to-right progression
    const reversed = [...filtered].reverse();

    return reversed.map((run, idx) => {
      const indexingStep = run.steps?.find(
        (s) => s.phaseKey === 'indexing' || s.stepName.toLowerCase().includes('indexing')
      );
      const classificationStep = run.steps?.find(
        (s) => s.phaseKey === 'classification' || s.stepName.toLowerCase().includes('classification')
      );

      const filesScanned = run.totalFiles || 100;
      const mediaDiscovered =
        run.mediaDiscovered ??
        run.newMediaDiscovered ??
        indexingStep?.itemsProcessed ??
        Math.round(filesScanned * 0.45);

      const ratio = filesScanned > 0 ? Number(((mediaDiscovered / filesScanned) * 100).toFixed(1)) : 0;
      const depth = run.depthLimit || run.maxDepthReached || (run.scanMode === 'Safe Scan' ? 12 : 24);
      const ruleHits =
        run.classifierRuleHits ??
        classificationStep?.itemsProcessed ??
        Math.max(1, Math.round(mediaDiscovered * 0.3));

      let rating = 'Standard';
      if (ratio >= 65) rating = 'Optimal';
      else if (ratio >= 35) rating = 'Good';
      else rating = 'Low Yield';

      return {
        id: run.id,
        rawTimestamp: run.timestamp,
        time: run.timestamp,
        label: `Scan #${idx + 1} (${run.timestamp})`,
        filesScanned,
        mediaDiscovered,
        ratioPercent: ratio,
        depth,
        ruleHits,
        scanMode: run.scanMode,
        rootPath: run.rootPath,
        rating,
        durationSec: (run.totalDurationMs / 1000).toFixed(1),
      };
    });
  }, [runsHistory, filterMode]);

  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return {
        totalScanned: 0,
        totalDiscovered: 0,
        avgRatio: 0,
        bestRatio: 0,
        bestDepth: 8,
        avgDepth: 0,
        efficiencyGrade: 'No Data',
      };
    }
    const totalScanned = chartData.reduce((acc, c) => acc + c.filesScanned, 0);
    const totalDiscovered = chartData.reduce((acc, c) => acc + c.mediaDiscovered, 0);
    const avgRatio = Number(((totalDiscovered / Math.max(1, totalScanned)) * 100).toFixed(1));
    const bestRun = [...chartData].sort((a, b) => b.ratioPercent - a.ratioPercent)[0];
    const avgDepth = Number(
      (chartData.reduce((acc, c) => acc + c.depth, 0) / chartData.length).toFixed(1)
    );

    let efficiencyGrade = 'Balanced';
    if (avgRatio >= 60) efficiencyGrade = 'Optimal Specificity';
    else if (avgRatio >= 35) efficiencyGrade = 'Standard Yield';
    else efficiencyGrade = 'High Noise / Deep Overhead';

    return {
      totalScanned,
      totalDiscovered,
      avgRatio,
      bestRatio: bestRun ? bestRun.ratioPercent : 0,
      bestDepth: bestRun ? bestRun.depth : 8,
      avgDepth,
      efficiencyGrade,
    };
  }, [chartData]);

  const handleSimulateBenchmark = (depth: number) => {
    setIsSimulating(true);
    const baseFiles = Math.round(90 + depth * 18 + Math.floor(Math.random() * 25));
    // Yield decreases gracefully as depth enters deep ancillary trees
    const yieldMultiplier = Math.max(
      0.12,
      Math.min(0.92, 1 - (depth - 4) * 0.03 + (Math.random() * 0.08 - 0.04))
    );
    const discoveredMedia = Math.round(baseFiles * yieldMultiplier);
    const ratio = Number(((discoveredMedia / baseFiles) * 100).toFixed(1));

    const simulatedRun: FullScanPerformanceRun = {
      id: `run-sim-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      rootPath: sambaConfig?.share ? `//${sambaConfig.server || 'nas'}/${sambaConfig.share}` : '/Volumes/media',
      totalDurationMs: Math.round(800 + depth * 110),
      totalFiles: baseFiles,
      totalFolders: Math.round(depth * 2.2),
      scanMode: depth <= 12 ? 'Safe Scan' : 'Full Deep Sync',
      slowestStepName: depth > 15 ? 'Directory Traversal' : 'Metadata Resolution',
      slowestStepMs: Math.round(300 + depth * 60),
      bottlenecks: depth > 16 ? [`Simulated deep walk (depth ${depth}) entered nested directories`] : [],
      mediaDiscovered: discoveredMedia,
      newMediaDiscovered: discoveredMedia,
      depthLimit: depth,
      maxDepthReached: depth,
      classifierRuleHits: Math.round(discoveredMedia * 0.35),
      discoveryRatio: ratio,
      steps: [
        {
          stepName: 'Directory Traversal',
          phaseKey: 'traversal',
          timeTakenMs: Math.round(200 + depth * 50),
          percentageOfTotal: 25,
          itemsProcessed: baseFiles,
          status: depth > 16 ? 'warning' : 'optimal',
          details: `Simulated traversal depth ${depth}`,
        },
        {
          stepName: 'Regex Classification',
          phaseKey: 'classification',
          timeTakenMs: 60,
          percentageOfTotal: 5,
          itemsProcessed: Math.round(depth * 2),
          status: 'optimal',
          details: `Classified folder structures`,
        },
        {
          stepName: 'Metadata Resolution',
          phaseKey: 'metadata',
          timeTakenMs: 400,
          percentageOfTotal: 40,
          itemsProcessed: discoveredMedia,
          status: 'optimal',
          details: `Metadata enriched for ${discoveredMedia} media items`,
        },
        {
          stepName: 'Tree Indexing',
          phaseKey: 'indexing',
          timeTakenMs: 250,
          percentageOfTotal: 20,
          itemsProcessed: discoveredMedia,
          status: 'optimal',
          details: `Tree mapped`,
        },
        {
          stepName: 'Artwork Verification',
          phaseKey: 'artwork',
          timeTakenMs: 150,
          percentageOfTotal: 10,
          itemsProcessed: Math.round(depth * 2),
          status: 'optimal',
          details: `Artwork verified`,
        },
      ],
    };

    recordScanPerformanceRun(simulatedRun);
    setTimeout(() => setIsSimulating(false), 300);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700 p-3.5 rounded-xl shadow-2xl font-sans text-xs space-y-2.5 z-50 min-w-[240px]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              {data.time}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/60">
              {data.scanMode}
            </span>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-indigo-300">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Files Scanned:
              </span>
              <strong className="text-white">{data.filesScanned}</strong>
            </div>

            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Media Discovered:
              </span>
              <strong className="text-emerald-400 font-bold">{data.mediaDiscovered}</strong>
            </div>

            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span> Discovery Yield:
              </span>
              <strong className="text-amber-300 font-bold">{data.ratioPercent}%</strong>
            </div>

            <div className="flex items-center justify-between text-slate-400 pt-1.5 border-t border-slate-800">
              <span>Scan Depth Limit:</span>
              <span className="text-slate-200">Depth {data.depth}</span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>Classifier Rules Hit:</span>
              <span className="text-slate-200">{data.ruleHits} folders</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[10px] flex items-center justify-between">
            <span className="text-slate-400">Rule Specificity:</span>
            <span
              className={`font-bold px-1.5 py-0.5 rounded ${
                data.ratioPercent >= 60
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                  : data.ratioPercent >= 35
                  ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                  : 'bg-rose-950 text-rose-300 border border-rose-800/60'
              }`}
            >
              {data.rating}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-white">Files Scanned vs New Media Discovered</h4>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50 text-[10px] font-mono font-bold">
              Efficiency Analysis
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tracks scan depth yield and directory classifier rule precision over time to optimize crawl speed and eliminate non-media traversal
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chart View Toggle */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setChartMode('composed')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                chartMode === 'composed'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Dual-Axis Ratio
            </button>
            <button
              type="button"
              onClick={() => setChartMode('trend')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                chartMode === 'trend'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Yield % Trend
            </button>
            <button
              type="button"
              onClick={() => setChartMode('depth')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                chartMode === 'depth'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Depth vs Yield
            </button>
          </div>

          {/* Mode Filter */}
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="all">All Scan Types</option>
            <option value="Full Deep Sync">Full Deep Sync</option>
            <option value="Safe Scan">Safe Scan</option>
          </select>

          {onTriggerSync && (
            <button
              type="button"
              onClick={onTriggerSync}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Run Sync</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Total Files Scanned
          </span>
          <div className="text-lg font-bold text-white font-mono">{stats.totalScanned}</div>
          <p className="text-[10px] text-slate-500">Traversed across history</p>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            New Media Discovered
          </span>
          <div className="text-lg font-bold text-emerald-400 font-mono">{stats.totalDiscovered}</div>
          <p className="text-[10px] text-slate-500">Canonical media matches</p>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Average Discovery Yield
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-amber-300 font-mono">{stats.avgRatio}%</span>
            <span className="text-[10px] text-slate-400 font-mono">
              (1 in {(100 / Math.max(1, stats.avgRatio)).toFixed(1)})
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                stats.avgRatio >= 60 ? 'bg-emerald-500' : stats.avgRatio >= 35 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, stats.avgRatio)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Peak Yield Run
          </span>
          <div className="text-lg font-bold text-cyan-300 font-mono">{stats.bestRatio}%</div>
          <p className="text-[10px] text-slate-500">Optimal at Depth {stats.bestDepth}</p>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Classifier Rule Precision
          </span>
          <div
            className={`text-xs font-bold font-mono mt-1 ${
              stats.avgRatio >= 60
                ? 'text-emerald-400'
                : stats.avgRatio >= 35
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {stats.efficiencyGrade}
          </div>
          <p className="text-[10px] text-slate-500">Avg depth: {stats.avgDepth}</p>
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
        {chartData.length === 0 ? (
          <div className="h-[320px] flex flex-col items-center justify-center text-slate-500 space-y-2">
            <BarChart3 className="w-8 h-8 opacity-30" />
            <p className="text-xs">No scan history recorded yet.</p>
            <p className="text-[11px] text-slate-600">Run a scan or click "Simulate Benchmark" below.</p>
          </div>
        ) : chartMode === 'composed' ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis
                yAxisId="left"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                tickLine={false}
                label={{
                  value: 'File & Media Count',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#64748b',
                  fontSize: 10,
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                stroke="#f59e0b"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                label={{
                  value: 'Discovery Yield (%)',
                  angle: 90,
                  position: 'insideRight',
                  fill: '#f59e0b',
                  fontSize: 10,
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
              <Bar
                yAxisId="left"
                dataKey="filesScanned"
                name="Files Scanned"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                yAxisId="left"
                dataKey="mediaDiscovered"
                name="New Media Discovered"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="ratioPercent"
                name="Discovery Ratio % (Media / Scanned)"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ fill: '#f59e0b', r: 4, strokeWidth: 2, stroke: '#0f172a' }}
                activeDot={{ r: 6, fill: '#f59e0b' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : chartMode === 'trend' ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <defs>
                <linearGradient id="ratioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[0, 100]}
                stroke="#64748b"
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={60}
                stroke="#10b981"
                strokeDasharray="4 4"
                label={{ value: 'Target: >60% Optimal Specificity', fill: '#10b981', fontSize: 10 }}
              />
              <ReferenceLine
                y={30}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{ value: 'Threshold: 30% Standard Library', fill: '#f59e0b', fontSize: 10 }}
              />
              <Area
                type="monotone"
                dataKey="ratioPercent"
                name="Discovery Yield (%)"
                stroke="#10b981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#ratioGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
              <Bar
                dataKey="depth"
                name="Scan Depth Limit"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="ratioPercent"
                name="Discovery Yield (%)"
                fill="#06b6d4"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Depth & Classifier Rule Insights Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Classifier Rule Effectiveness */}
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" />
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">
              Classifier Rule Precision Assessment
            </h5>
          </div>

          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p>
              The ratio measures how many files walked by the scanner match canonical media entries versus non-media overhead (e.g.{' '}
              <code className="text-indigo-300 font-mono">.nfo</code>, subtitles, folder art, or hidden OS caches).
            </p>

            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Yield ≥ 60%:</span>
                <span className="text-emerald-400 font-bold">Optimal Regex Rules</span>
              </div>
              <p className="text-slate-500 text-[10px] font-sans">
                Scanner targets designated Movies &amp; TV directories without recursing into build trees or documents.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Yield &lt; 25%:</span>
                <span className="text-rose-400 font-bold">Overhead / Rule Drift</span>
              </div>
              <p className="text-slate-500 text-[10px] font-sans">
                Traversal is wasting I/O on deep directory branches. Suggestion: configure folder classifier ignore patterns or lower depth limit.
              </p>
            </div>
          </div>
        </div>

        {/* Scan Depth Tuning Matrix & Interactive Simulator */}
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                Scan Depth Tuning &amp; Benchmark Simulator
              </h5>
            </div>
            <button
              type="button"
              onClick={() => clearScanPerformanceHistory()}
              className="text-[10px] text-slate-500 hover:text-slate-300 font-mono underline"
            >
              Reset Samples
            </button>
          </div>

          <div className="text-xs text-slate-300 space-y-3">
            <p className="text-slate-400 text-[11px]">
              Test how scan depth directly impacts traversed volume and extraction yield:
            </p>

            <div className="space-y-1.5 bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Simulate Depth Limit:</span>
                <span className="font-mono text-cyan-400 font-bold">Depth {simulatedDepth}</span>
              </div>
              <input
                type="range"
                min={4}
                max={30}
                step={2}
                value={simulatedDepth}
                onChange={(e) => setSimulatedDepth(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Depth 4 (Fast/Shallow)</span>
                <span>Depth 12 (Balanced)</span>
                <span>Depth 30 (Full Unbounded)</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isSimulating}
              onClick={() => handleSimulateBenchmark(simulatedDepth)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isSimulating ? 'Simulating Scan...' : `Record Benchmark at Depth ${simulatedDepth}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// Scanner Log Entry Interface for real-time file-by-file monitor
export interface ScannerProgressLogItem {
  id: string;
  timestamp: string;
  createdAt: number;
  itemNumber: number;
  rawPath: string;
  sanitizedPath: string;
  isDir: boolean;
  status: 'scanned' | 'permission_denied' | 'access_barrier' | 'error';
  systemErrorCode?: string;
  details?: string;
}

interface ConsoleTabProps {
  onRetryFailedFiles?: (failedPaths: string[]) => Promise<void>;
  onTriggerSync?: () => Promise<void>;
  sambaConfig?: SambaConfig;
}

export const ConsoleTab: React.FC<ConsoleTabProps> = ({
  onRetryFailedFiles,
  onTriggerSync,
  sambaConfig,
}) => {
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<ConsoleLogLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<ConsoleLogCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(logger.getDebugEnabled());

  // Incident Notification System
  const [activeIncident, setActiveIncident] = useState<SyncIncident | null>(() => logger.getActiveIncident());
  const [isRetrying, setIsRetrying] = useState(false);

  // Samba Traversability & Path Diagnostics States
  const [onlyShowAccessBarriers, setOnlyShowAccessBarriers] = useState(false);
  const actualUserPath = (
    sambaConfig?.hostPath ||
    sambaConfig?.mountPath ||
    (sambaConfig?.server ? `//${sambaConfig.server}/${sambaConfig?.share || 'media'}` : '/Volumes/media')
  );

  const [diagnosticPath, setDiagnosticPath] = useState(actualUserPath);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);

  // Path Analysis History
  const [pathAnalysisRecords, setPathAnalysisRecords] = useState<PathAnalysisRecord[]>(() => getPathAnalysisHistory());

  // Scan Debug Discovered Paths State
  const [scanDebugRecords, setScanDebugRecords] = useState<ScanDiscoveredPathRecord[]>(() => getScanDebugHistory());
  const [scanDebugSourceFilter, setScanDebugSourceFilter] = useState<'all' | 'performFastScan' | 'scanSambaVolume'>('all');

  // Real-Time Scanner Logs State (file-by-file monitor)
  const [scannerLogs, setScannerLogs] = useState<ScannerProgressLogItem[]>([]);
  const [scannerFilterQuery, setScannerFilterQuery] = useState('');
  const [isScannerPaused, setIsScannerPaused] = useState(false);
  const [totalScannedCounter, setTotalScannedCounter] = useState(0);

  // Modals
  const [isPathTesterOpen, setIsPathTesterOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [barrierErrorForModal, setBarrierErrorForModal] = useState<string | null>(null);

  // Diagnostic Tab Toggles
  const [activeDiagnosticTab, setActiveDiagnosticTab] = useState<
    'performance' | 'scanner-logs' | 'tree' | 'analysis' | 'scan-debug' | 'folder-inspector' | 'info' | 'scan-errors-chart' | 'discovery-ratio'
  >('scanner-logs');

  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const scannerLogsEndRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to Logger
  useEffect(() => {
    const unsubLogs = logger.subscribe((newLogs) => {
      if (!isPaused) {
        setLogs(newLogs);
      }
    });

    const unsubIncidents = logger.subscribeIncident((inc) => {
      setActiveIncident(inc);
    });

    const unsubAnalysis = subscribePathAnalysis((records) => {
      setPathAnalysisRecords(records);
    });

    const unsubScanDebug = subscribeScanDebug((records) => {
      setScanDebugRecords(records);
    });

    return () => {
      unsubLogs();
      unsubIncidents();
      unsubAnalysis();
      unsubScanDebug();
    };
  }, [isPaused]);

  // Real-Time Scanner Logs Listener (Listens to Tauri & custom progress events)
  useEffect(() => {
    let unlistenTauri: (() => void) | null = null;

    const parseLogTextForError = (text: string) => {
      const lower = text.toLowerCase();
      if (lower.includes('os error 13') || lower.includes('permission denied') || lower.includes('eacces')) {
        return 'os error 13 (Permission denied)';
      }
      if (lower.includes('os error 20') || lower.includes('not a directory')) {
        return 'os error 20 (Not a directory)';
      }
      if (lower.includes('os error 2') || lower.includes('no such file')) {
        return 'os error 2 (No such file or directory)';
      }
      const match = text.match(/os error \d+/i);
      return match ? match[0] : undefined;
    };

    const handleProgressData = (payload: any) => {
      if (isScannerPaused || !payload) return;

      const rawFile = payload.current_file || payload.currentFile || payload.path || '';
      const rawPath = payload.current_path || payload.currentPath || rawFile;
      const count = payload.scanned_count || payload.scannedCount || 0;
      const isDir = Boolean(payload.is_dir || payload.isDir);

      if (count > 0) {
        setTotalScannedCounter(count);
      }

      const cleanPath = rawFile.replace(/^\[Scanner\]\s*/i, '').trim();
      const isBarrier =
        cleanPath.toLowerCase().includes('permission denied') ||
        cleanPath.toLowerCase().includes('access denied') ||
        cleanPath.toLowerCase().includes('os error');

      const errorCode = isBarrier ? parseLogTextForError(cleanPath) || 'os error 13' : undefined;

      const now = Date.now();
      const newEntry: ScannerProgressLogItem = {
        id: `scan-log-${now}-${Math.random().toString(36).substr(2, 6)}`,
        timestamp: new Date(now).toLocaleTimeString(),
        createdAt: now,
        itemNumber: count || (scannerLogs.length + 1),
        rawPath: rawPath || cleanPath,
        sanitizedPath: cleanPath,
        isDir,
        status: isBarrier ? 'permission_denied' : 'scanned',
        systemErrorCode: errorCode,
        details: isBarrier ? `Access barrier encountered at path: ${rawPath}` : undefined,
      };

      setScannerLogs((prev) => [newEntry, ...prev.slice(0, 999)]);
    };

    // 1. Direct Tauri event listener if running in desktop app
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      import('@tauri-apps/api/event')
        .then(({ listen }) => {
          listen('scan-progress', (event: any) => {
            if (event && event.payload) {
              handleProgressData(event.payload);
            }
          }).then((unlisten) => {
            unlistenTauri = unlisten;
          });
        })
        .catch(() => {});
    }

    // 2. Custom DOM event listener for browser / bridge forwarding
    const customListener = (e: any) => {
      handleProgressData(e.detail);
    };
    window.addEventListener('samba-scan-progress', customListener);
    window.addEventListener('scan-progress-stream', customListener);

    return () => {
      if (unlistenTauri) unlistenTauri();
      window.removeEventListener('samba-scan-progress', customListener);
      window.removeEventListener('scan-progress-stream', customListener);
    };
  }, [isScannerPaused, scannerLogs.length]);

  // Auto-scroll on logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Auto-scroll on scanner logs
  useEffect(() => {
    if (autoScroll && scannerLogsEndRef.current) {
      scannerLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scannerLogs, autoScroll]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;
      if (selectedCategory !== 'all' && log.category !== selectedCategory) return false;
      if (onlyShowAccessBarriers) {
        const isBarrier =
          log.level === 'error' ||
          log.message.toLowerCase().includes('permission denied') ||
          log.message.toLowerCase().includes('access denied') ||
          log.message.toLowerCase().includes('os error');
        if (!isBarrier) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          log.message.toLowerCase().includes(q) ||
          log.category.toLowerCase().includes(q) ||
          (log.details && JSON.stringify(log.details).toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [logs, selectedLevel, selectedCategory, searchQuery, onlyShowAccessBarriers]);

  // Filter Scanner Logs
  const filteredScannerLogs = useMemo(() => {
    return scannerLogs.filter((entry) => {
      if (onlyShowAccessBarriers && entry.status !== 'permission_denied' && entry.status !== 'access_barrier') {
        return false;
      }
      if (scannerFilterQuery) {
        const q = scannerFilterQuery.toLowerCase();
        return (
          entry.sanitizedPath.toLowerCase().includes(q) ||
          entry.rawPath.toLowerCase().includes(q) ||
          (entry.systemErrorCode && entry.systemErrorCode.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [scannerLogs, onlyShowAccessBarriers, scannerFilterQuery]);

  // Access barrier count
  const accessBarrierCount = useMemo(() => {
    return scannerLogs.filter(
      (l) => l.status === 'permission_denied' || l.status === 'access_barrier' || Boolean(l.systemErrorCode)
    ).length;
  }, [scannerLogs]);

  // Tree data structure
  const treeData = useMemo(() => {
    const root: any = { name: 'Samba Root', isDir: true, children: [] };
    const sampleItems = scannerLogs.slice(0, 80);

    sampleItems.forEach((item) => {
      const parts = item.sanitizedPath.split('/').filter(Boolean);
      let curr = root;
      parts.forEach((p, idx) => {
        let child = curr.children?.find((c: any) => c.name === p);
        if (!child) {
          child = {
            name: p,
            isDir: idx < parts.length - 1 || item.isDir,
            error: item.systemErrorCode,
            children: [],
          };
          if (!curr.children) curr.children = [];
          curr.children.push(child);
        }
        curr = child;
      });
    });

    return root;
  }, [scannerLogs]);

  // Run Path Diagnostic
  const handleRunDiagnostic = async () => {
    setDiagnosticLoading(true);
    try {
      const res = await verifyPath(diagnosticPath);
      setDiagnosticResult(res);
    } catch (e: any) {
      setDiagnosticResult({ exists: false, error: e?.message || String(e) });
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportLogs = () => {
    const text = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sambavault-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    logger.clearLogs();
    setLogs([]);
  };

  const handleClearScannerLogs = () => {
    setScannerLogs([]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">SambaVault Diagnostics &amp; Console</h3>
              <span className="px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/50 text-[10px] font-mono font-bold">
                Live Subsystem
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time monitoring, Rust backend scanner events, TCC permission audits, and path sanitization
            </p>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Path Audit Barrier Filter Button */}
          <button
            type="button"
            onClick={() => setOnlyShowAccessBarriers(!onlyShowAccessBarriers)}
            title="Exclusively highlight paths where access was blocked by macOS TCC or permissions"
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm ${
              onlyShowAccessBarriers
                ? 'bg-rose-950 text-rose-300 border border-rose-600 ring-2 ring-rose-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <ShieldAlert className={`w-4 h-4 ${onlyShowAccessBarriers ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
            <span>Path Audit</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                accessBarrierCount > 0 ? 'bg-rose-600 text-white font-bold' : 'bg-slate-700 text-slate-400'
              }`}
            >
              {accessBarrierCount}
            </span>
          </button>

          {/* Path Tester Sandbox Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsPathTesterOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Code className="w-3.5 h-3.5 text-indigo-400" />
            <span>Path Sandbox</span>
          </button>

          {/* Trigger Live Sync Button */}
          {onTriggerSync && (
            <button
              type="button"
              onClick={onTriggerSync}
              className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Trigger Sync</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Incident Notification Banner */}
      {activeIncident && (
        <div className="bg-rose-950/80 border border-rose-600/60 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-600 text-white">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-rose-200 uppercase tracking-wider">
                  Sync Incident Detected
                </span>
                <span className="text-[10px] font-mono text-rose-300">
                  {new Date(activeIncident.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-rose-100 font-medium">{activeIncident.errorMessage}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBarrierErrorForModal(activeIncident.errorMessage);
                setIsHelpModalOpen(true);
              }}
              className="px-3 py-1.5 bg-rose-900 hover:bg-rose-800 text-rose-100 border border-rose-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              FDA Instructions
            </button>
            <button
              type="button"
              onClick={() => logger.dismissIncident()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Diagnostic Tab Navigation Buttons */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('scanner-logs')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'scanner-logs'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Real-Time Scanner Logs</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-950/60 text-[10px] font-mono">
            {totalScannedCounter > 0 ? totalScannedCounter : scannerLogs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('performance')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'performance'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>Scan Performance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('tree')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'tree'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>D3 Tree Visualizer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('analysis')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'analysis'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Path Analysis ({pathAnalysisRecords.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('scan-debug')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'scan-debug'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Bug className="w-3.5 h-3.5 text-purple-400" />
          <span>Scan Debug History ({scanDebugRecords.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('scan-errors-chart')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'scan-errors-chart'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-rose-400" />
          <span>Scan Errors Chart</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('discovery-ratio')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'discovery-ratio'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span>Files vs Media Ratio</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('folder-inspector')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'folder-inspector'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Eye className="w-3.5 h-3.5 text-pink-400" />
          <span>Folder Inspector</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDiagnosticTab('info')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeDiagnosticTab === 'info'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Info className="w-3.5 h-3.5 text-blue-400" />
          <span>System Environment</span>
        </button>
      </div>

      {/* TAB CONTENT 1: REAL-TIME SCANNER LOGS */}
      {activeDiagnosticTab === 'scanner-logs' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          {/* Header & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Rust Backend [Scanner] Progress Stream</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                </h4>
                <p className="text-xs text-slate-400">
                  Live file-by-file traversal records emitted by <code className="text-cyan-300 font-mono">perform_fast_scan</code> and <code className="text-cyan-300 font-mono">scan_and_import_volumes</code>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsScannerPaused(!isScannerPaused)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  isScannerPaused
                    ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                {isScannerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{isScannerPaused ? 'Resume Stream' : 'Pause Stream'}</span>
              </button>

              <button
                type="button"
                onClick={handleClearScannerLogs}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Search & Audit Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter scanner logs by path or error..."
                value={scannerFilterQuery}
                onChange={(e) => setScannerFilterQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Total Discovered: <strong className="text-white font-mono">{totalScannedCounter}</strong></span>
              <span className="text-slate-600">|</span>
              <span>Barriers: <strong className={accessBarrierCount > 0 ? 'text-rose-400 font-mono' : 'text-slate-400 font-mono'}>{accessBarrierCount}</strong></span>
            </div>
          </div>

          {/* Scanner Logs Table / Terminal Feed */}
          <div className="bg-slate-950 rounded-xl border border-slate-800/90 overflow-hidden font-mono text-xs">
            <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span className="w-16">Item #</span>
              <span className="w-24">Time</span>
              <span className="flex-1">Traversed Path</span>
              <span className="w-28 text-right">Status / Error Code</span>
            </div>

            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-900/60 p-1">
              {filteredScannerLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 space-y-2">
                  <Terminal className="w-8 h-8 mx-auto opacity-30" />
                  <p>No scanner progress events recorded yet.</p>
                  <p className="text-[11px] text-slate-600">
                    Click "Trigger Sync" or scan your Samba share to watch real-time file traversal.
                  </p>
                </div>
              ) : (
                filteredScannerLogs.map((item) => (
                  <div
                    key={item.id}
                    className={`px-3 py-2 flex items-center gap-3 transition hover:bg-slate-900/50 ${
                      item.status === 'permission_denied' || item.status === 'access_barrier'
                        ? 'bg-rose-950/30 text-rose-200'
                        : 'text-slate-300'
                    }`}
                  >
                    <span className="w-16 text-[10px] text-slate-500 font-mono shrink-0">
                      #{item.itemNumber}
                    </span>
                    <span className="w-24 text-[10px] text-slate-500 shrink-0">
                      {item.timestamp}
                    </span>
                    <div className="flex-1 flex items-center gap-2 truncate">
                      {item.isDir ? (
                        <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate" title={item.rawPath}>
                        {item.sanitizedPath || item.rawPath}
                      </span>
                    </div>

                    <div className="shrink-0 text-right">
                      {item.systemErrorCode ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBarrierErrorForModal(`${item.systemErrorCode} at ${item.rawPath}`);
                            setIsHelpModalOpen(true);
                          }}
                          className="px-2 py-0.5 rounded bg-rose-950 border border-rose-700 text-rose-300 text-[10px] font-bold hover:bg-rose-900 transition flex items-center gap-1 cursor-pointer"
                        >
                          <ShieldAlert className="w-3 h-3 text-rose-400" />
                          <span>{item.systemErrorCode}</span>
                        </button>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-[10px]">
                          OK
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={scannerLogsEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: SCAN PERFORMANCE DASHBOARD */}
      {activeDiagnosticTab === 'performance' && (
        <ScanPerformanceDashboard onTriggerSync={onTriggerSync} />
      )}

      {/* TAB CONTENT 3: D3 TREE VISUALIZER */}
      {activeDiagnosticTab === 'tree' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-bold text-white">Hierarchical Directory Tree</h4>
              <p className="text-xs text-slate-400">Interactive D3 node layout of traversed Samba structure</p>
            </div>
          </div>
          <D3SambaTreeVisualizer data={treeData} scannedCount={totalScannedCounter} isActive={!isScannerPaused} />
        </div>
      )}

      {/* TAB CONTENT 4: PATH ANALYSIS */}
      {activeDiagnosticTab === 'analysis' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-bold text-white">Path Resolution &amp; Traversability Records</h4>
              <p className="text-xs text-slate-400">Bridge audit history of UNC, POSIX, and local mount mappings</p>
            </div>
            <button
              type="button"
              onClick={() => clearPathAnalysisHistory()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-xl transition"
            >
              Clear Analysis
            </button>
          </div>

          <div className="space-y-2">
            {pathAnalysisRecords.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">No analysis records yet.</div>
            ) : (
              pathAnalysisRecords.map((rec) => (
                <div key={rec.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-400">{rec.rawInput}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${rec.exists ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'}`}>
                      {rec.exists ? 'EXISTS' : 'NOT FOUND'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>Resolved:</span>
                    <code className="text-slate-200">{rec.resolvedPath}</code>
                  </div>
                  {(rec.errorCode || rec.message) && (
                    <p className="text-rose-400 text-[10px]">{rec.errorCode ? `[${rec.errorCode}] ` : ''}{rec.message}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: SCAN DEBUG HISTORY */}
      {activeDiagnosticTab === 'scan-debug' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-bold text-white">Discovered Paths Audit Log</h4>
              <p className="text-xs text-slate-400">Low-level record stream captured during fast and deep walks</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScanDebugSourceFilter('all')}
                className={`px-2.5 py-1 rounded text-xs ${scanDebugSourceFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setScanDebugSourceFilter('performFastScan')}
                className={`px-2.5 py-1 rounded text-xs ${scanDebugSourceFilter === 'performFastScan' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                Fast Scan
              </button>
              <button
                type="button"
                onClick={() => clearScanDebugHistory()}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded transition"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-[350px] overflow-y-auto space-y-1.5">
            {scanDebugRecords.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">No scan debug records.</div>
            ) : (
              scanDebugRecords
                .filter((r) => scanDebugSourceFilter === 'all' || r.source === scanDebugSourceFilter)
                .map((r) => (
                  <div key={r.id} className="p-2 bg-slate-950 rounded-lg border border-slate-800/80 font-mono text-[11px] flex items-center justify-between text-slate-300">
                    <span className="truncate max-w-xl">{r.sanitizedRelativePath || r.rawPath}</span>
                    <span className="text-[10px] text-slate-500">{new Date(r.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 5.5: SCAN ERRORS CHART */}
      {activeDiagnosticTab === 'scan-errors-chart' && (
        <ScanErrorsChart scannerLogs={scannerLogs} />
      )}

      {/* TAB CONTENT 5.6: FILES SCANNED VS NEW MEDIA DISCOVERED RATIO CHART */}
      {activeDiagnosticTab === 'discovery-ratio' && (
        <ScanDiscoveryRatioChart onTriggerSync={onTriggerSync} sambaConfig={sambaConfig} />
      )}

      {/* TAB CONTENT 6: FOLDER INSPECTOR */}
      {activeDiagnosticTab === 'folder-inspector' && (
        <PathInspectorView records={scanDebugRecords} onTriggerSync={onTriggerSync} />
      )}

      {/* TAB CONTENT 7: SYSTEM ENVIRONMENT */}
      {activeDiagnosticTab === 'info' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h4 className="text-sm font-bold text-white">System &amp; Samba Environment Status</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-slate-400 font-bold block">Current Samba Path Config:</span>
              <p className="text-cyan-300 break-all">{actualUserPath}</p>
              <span className="text-slate-500 text-[10px]">Server: {sambaConfig?.server || 'Not configured'}</span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-slate-400 font-bold block">macOS Full Disk Access (TCC):</span>
              <p className="text-emerald-400">Protection active. Requires FDA in System Settings.</p>
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(true)}
                className="text-indigo-400 hover:text-indigo-300 underline text-[11px] cursor-pointer"
              >
                View Setup Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* General System Console Feed (Always accessible at bottom) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              System Log Stream ({filteredLogs.length})
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 focus:outline-none"
              />
            </div>

            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">All Levels</option>
              <option value="error">Error</option>
              <option value="warn">Warn</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>

            <button
              type="button"
              onClick={handleCopyLogs}
              title="Copy filtered logs"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleExportLogs}
              title="Export logs JSON"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleClearLogs}
              title="Clear logs"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-lg text-xs transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Terminal Window */}
        <div className="bg-slate-950 rounded-xl border border-slate-800/80 p-3 font-mono text-xs max-h-[260px] overflow-y-auto space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-600 text-center py-6">No log messages found.</div>
          ) : (
            filteredLogs.map((log) => {
              const isErr = log.level === 'error';
              const isWarn = log.level === 'warn';
              return (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 py-0.5 leading-relaxed ${
                    isErr ? 'text-rose-400' : isWarn ? 'text-amber-300' : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-500 shrink-0 text-[10px]">{log.timestamp}</span>
                  <span
                    className={`text-[9px] px-1 rounded font-bold uppercase shrink-0 ${
                      isErr
                        ? 'bg-rose-950 text-rose-300'
                        : isWarn
                        ? 'bg-amber-950 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-[10px] text-indigo-400 shrink-0">[{log.category}]</span>
                  <span className="break-all">{log.message}</span>
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Path Tester Sandbox Modal */}
      <PathTesterModal isOpen={isPathTesterOpen} onClose={() => setIsPathTesterOpen(false)} />

      {/* Permission Help Modal */}
      <PermissionHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        diagnosticError={barrierErrorForModal}
      />
    </div>
  );
};

export default ConsoleTab;
