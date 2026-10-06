import React, { useState, useEffect, useRef, useMemo } from 'react';
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

// Scanner Log Entry Interface for real-time file-by-file monitor
export interface ScannerProgressLogItem {
  id: string;
  timestamp: string;
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
    'performance' | 'scanner-logs' | 'tree' | 'analysis' | 'scan-debug' | 'folder-inspector' | 'info'
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

      const newEntry: ScannerProgressLogItem = {
        id: `scan-log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
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
