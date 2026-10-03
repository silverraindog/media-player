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
} from 'lucide-react';
import { ConsoleLogEntry, ConsoleLogLevel, ConsoleLogCategory, SyncIncident, SambaConfig } from '../types';
import * as d3 from 'd3';
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
import { HardDrive, ShieldCheck, ShieldAlert, Check, PlayCircle, Eye, HelpCircle } from 'lucide-react';
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
import { permissionsManager } from '../utils/permissionsManager';

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

    // 1. Clear previous content
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // 2. Setup Dimensions
    const containerWidth = containerRef.current.clientWidth || 600;
    const containerHeight = 350;

    // 3. Create root hierarchy
    const root = d3.hierarchy(data);

    // If no children, draw a nice empty state node
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

    // 4. Compute Tree Layout
    const treeLayout = d3.tree().nodeSize([28, 140]);
    treeLayout(root as any);

    // Find bounding box to center appropriately
    let minX = Infinity;
    let maxX = -Infinity;
    root.each((d: any) => {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
    });

    const mainGroup = svg.append('g');

    // Setup zoom
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => {
        mainGroup.attr('transform', event.transform);
      });

    svg.call(zoomBehavior as any);

    // Initial center transform
    const initialScale = 0.85;
    const initialX = 50;
    const initialY = containerHeight / 2 - (minX + maxX) / 2 * initialScale;
    
    const initialTransform = d3.zoomIdentity
      .translate(initialX, initialY)
      .scale(initialScale);
      
    svg.call(zoomBehavior.transform as any, initialTransform);

    // Draw Links
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

    // Draw Nodes
    const nodeG = mainGroup.append('g')
      .selectAll('g')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

    // Draw Node Circles
    nodeG.append('circle')
      .attr('r', (d: any) => (d.depth === 0 ? 7 : 4))
      .attr('fill', (d: any) => {
        if (d.data.error) return '#ef4444'; // Red for error nodes
        if (d.data.isDir) return '#10b981'; // Emerald for directories
        return '#38bdf8'; // Sky Blue for files
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

    // Draw Node Labels
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
      {/* Visualizer Floating Stats Header */}
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

  // Real-Time Sync Incident Notification System
  const [activeIncident, setActiveIncident] = useState<SyncIncident | null>(() => logger.getActiveIncident());
  const [isRetrying, setIsRetrying] = useState(false);
  const [showFailedPaths, setShowFailedPaths] = useState(false);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  // Samba Traversability & Path Diagnostics States
  const actualUserPath = (
    sambaConfig?.hostPath ||
    sambaConfig?.mountPath ||
    (sambaConfig?.server ? `//${sambaConfig.server}/${sambaConfig?.share || 'media'}` : '/Users/sargus/media')
  );

  const [isDiagnosticExpanded, setIsDiagnosticExpanded] = useState(true);
  const [diagnosticPath, setDiagnosticPath] = useState(actualUserPath);
  const [pathToResolve, setPathToResolve] = useState(actualUserPath);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [whoamiData, setWhoamiData] = useState<any>(null);

  // Permission Denied & Scan Errors Overlay State
  const [lastScanErrors, setLastScanErrors] = useState<string[]>([]);
  const [showOverlay, setShowOverlay] = useState(false);
  const [isPrevalidating, setIsPrevalidating] = useState(false);
  const [prevalidateResult, setPrevalidateResult] = useState<any>(null);

  // Diagnostic Tab Toggles
  const [activeDiagnosticTab, setActiveDiagnosticTab] = useState<'info' | 'analysis' | 'tree' | 'scan-debug' | 'folder-inspector'>('info');
  const [folderInspectorLogs, setFolderInspectorLogs] = useState<Array<{ id: string; path: string; isDir: boolean; count: number; timestamp: number }>>([]);
  const [isPathTesterOpen, setIsPathTesterOpen] = useState(false);

  // Real-Time Scan Debug Discovered Paths State
  const [scanDebugRecords, setScanDebugRecords] = useState<ScanDiscoveredPathRecord[]>(() => getScanDebugHistory());
  const [scanDebugSourceFilter, setScanDebugSourceFilter] = useState<'all' | 'performFastScan' | 'scanSambaVolume' | 'serverApiScanVolume'>('all');
  const [scanDebugAnomalyOnly, setScanDebugAnomalyOnly] = useState(false);
  const [scanDebugSearch, setScanDebugSearch] = useState('');
  const [copiedDebugKey, setCopiedDebugKey] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeScanDebug((history) => {
      setScanDebugRecords(history);
    });
    return () => unsub();
  }, []);

  const handleCopyDebugPath = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedDebugKey(key);
    setTimeout(() => setCopiedDebugKey(null), 2000);
  };

  const handleDownloadDiagnostics = () => {
    try {
      const diagnosticData = {
        timestamp: new Date().toISOString(),
        totalRecords: scanDebugRecords.length,
        doubleSlashAnomalies: scanDebugRecords.filter((r) => r.rawPath.startsWith('//') || r.rawPath.startsWith('\\\\')).length,
        records: scanDebugRecords.map((r) => ({
          id: r.id,
          source: r.source,
          rawPath: r.rawPath,
          resolvedAbsolutePath: r.resolvedAbsolutePath,
          sanitizedPath: r.sanitizedRelativePath,
          hasDoubleSlash: r.rawPath.startsWith('//') || r.rawPath.startsWith('\\\\'),
          hasAnomaly: r.hasAnomaly,
          anomalyReasons: r.anomalyReasons,
          timestamp: r.timestamp,
        })),
      };

      const blob = new Blob([JSON.stringify(diagnosticData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `samba_vault_path_diagnostics_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Failed to download diagnostics JSON:', e);
    }
  };

  // Real-Time Path Analysis Telemetry History State
  const [pathAnalysisHistory, setPathAnalysisHistory] = useState<PathAnalysisRecord[]>(() => getPathAnalysisHistory());
  const [testPathInput, setTestPathInput] = useState(actualUserPath);
  const [isAnalyzingPath, setIsAnalyzingPath] = useState(false);
  const [latestAnalysisTestResult, setLatestAnalysisTestResult] = useState<any>(null);

  // Sync actual paths when sambaConfig changes
  useEffect(() => {
    const current = (sambaConfig?.hostPath || sambaConfig?.mountPath || '').trim();
    if (current) {
      setDiagnosticPath(current);
      setTestPathInput(current);
      setPathToResolve(current);
    }
  }, [sambaConfig?.hostPath, sambaConfig?.mountPath]);

  useEffect(() => {
    const unsub = subscribePathAnalysis((history) => {
      setPathAnalysisHistory(history);
    });
    return () => unsub();
  }, []);

  const handleRunPathAnalysisTest = async () => {
    if (!testPathInput.trim()) return;
    setIsAnalyzingPath(true);
    setLatestAnalysisTestResult(null);
    try {
      const res = await verifyPath(testPathInput.trim());
      setLatestAnalysisTestResult(res);
    } catch (e: any) {
      setLatestAnalysisTestResult({
        exists: false,
        accessible: false,
        error: e.message || String(e),
      });
    } finally {
      setIsAnalyzingPath(false);
    }
  };

  // D3 Tree Visualizer States
  interface TreeVisualNode {
    name: string;
    children?: TreeVisualNode[];
    isDir?: boolean;
    error?: string;
  }

  const [liveTreeRoot, setLiveTreeRoot] = useState<TreeVisualNode>({
    name: 'media',
    isDir: true,
    children: [],
  });
  const [liveScannedCount, setLiveScannedCount] = useState(0);
  const [liveScanActive, setLiveScanActive] = useState(false);

  useEffect(() => {
    if (sambaConfig?.mountPath) {
      const parts = sambaConfig.mountPath.split('/').filter(Boolean);
      setLiveTreeRoot({
        name: parts[parts.length - 1] || 'media',
        isDir: true,
        children: [],
      });
    }
  }, [sambaConfig]);

  // Helper inside component to avoid closure capture issues
  const localAddPathToTree = (root: TreeVisualNode, pathStr: string, isDir: boolean, error?: string) => {
    const clean = pathStr.replace(/\\/g, '/').replace(/^\/+/g, '');
    if (!clean) return;
    const parts = clean.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children) {
        current.children = [];
      }

      let child = current.children.find((c: any) => c.name === part);
      if (!child) {
        child = {
          name: part,
          isDir: isLast ? isDir : true,
        };
        if (isLast && error) {
          child.error = error;
        }
        current.children.push(child);
      }
      current = child;
    }
  };

  useEffect(() => {
    const handleStart = (e: any) => {
      const rootPath = e.detail?.rootPath || '';
      const parts = rootPath.split('/').filter(Boolean);
      setLiveTreeRoot({
        name: parts[parts.length - 1] || 'media',
        isDir: true,
        children: [],
      });
      setLiveScannedCount(0);
      setLiveScanActive(true);
    };

    const handleDiscovered = (e: any) => {
      const { path: pathStr, count, isDir } = e.detail || {};
      if (pathStr) {
        setFolderInspectorLogs((prev) => [
          {
            id: `folder-log-${Date.now()}-${Math.random()}`,
            path: pathStr,
            isDir: Boolean(isDir || !pathStr.includes('.')),
            count: count || 0,
            timestamp: Date.now(),
          },
          ...prev.slice(0, 499),
        ]);
        setLiveTreeRoot(prev => {
          const next = { ...prev };
          localAddPathToTree(next, pathStr, Boolean(isDir));
          return next;
        });
        setLiveScannedCount(count || 0);
      }
    };

    const handleComplete = (e: any) => {
      setLiveScanActive(false);
      const { items, errors } = e.detail || {};
      setLiveTreeRoot(prev => {
        const next = { ...prev };
        if (Array.isArray(items)) {
          items.forEach((it: any) => {
            localAddPathToTree(next, it.rel_path, it.is_dir);
          });
        }
        if (Array.isArray(errors)) {
          errors.forEach((errStr: string) => {
            const match = errStr.match(/Cannot read directory "([^"]+)"/);
            if (match && match[1]) {
              const rootPrefix = sambaConfig?.mountPath || '';
              const relPart = match[1].replace(rootPrefix, '');
              localAddPathToTree(next, relPart, true, "Permission Denied");
            }
          });
        }
        return next;
      });
    };

    window.addEventListener('samba-scan-start', handleStart);
    window.addEventListener('samba-file-discovered', handleDiscovered);
    window.addEventListener('samba-scan-complete', handleComplete);

    return () => {
      window.removeEventListener('samba-scan-start', handleStart);
      window.removeEventListener('samba-file-discovered', handleDiscovered);
      window.removeEventListener('samba-scan-complete', handleComplete);
    };
  }, [sambaConfig]);

  const loadLastScanErrors = () => {
    try {
      const stored = localStorage.getItem('samba_vault_last_scan_errors');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setLastScanErrors(parsed);
          return;
        }
      }
      setLastScanErrors([]);
    } catch (_) {
      setLastScanErrors([]);
    }
  };

  useEffect(() => {
    loadLastScanErrors();
    const interval = setInterval(loadLastScanErrors, 2500); // Poll local errors to keep live
    return () => clearInterval(interval);
  }, []);

  const handlePrevalidatePermissions = async () => {
    setIsPrevalidating(true);
    setPrevalidateResult(null);
    try {
      const mount = sambaConfig?.mountPath || '/Volumes/media';
      const res = await fetch('/api/samba/diagnostic-walk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: mount }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrevalidateResult({
          success: true,
          resolvedPath: data.resolvedPath,
          visits: data.visits || [],
        });
      } else {
        setPrevalidateResult({
          success: false,
          error: 'Could not access target path from host.',
        });
      }
    } catch (e: any) {
      setPrevalidateResult({
        success: false,
        error: e.message || 'Validation request failed.',
      });
    } finally {
      setIsPrevalidating(false);
    }
  };

  useEffect(() => {
    if (sambaConfig?.mountPath) {
      setDiagnosticPath(sambaConfig.mountPath);
    }
  }, [sambaConfig]);

  const fetchWhoamiDiagnostics = async () => {
    try {
      const res = await fetch('/api/samba/whoami', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mountPath: sambaConfig?.mountPath || '/Volumes/media' }),
      });
      if (res.ok) {
        const data = await res.json();
        setWhoamiData(data);
      }
    } catch (err) {
      console.warn('Failed to fetch whoami diagnostic context:', err);
    }
  };

  useEffect(() => {
    fetchWhoamiDiagnostics();
  }, [sambaConfig]);

  const handleRunDiagnosticWalk = async () => {
    if (!diagnosticPath) return;
    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      const res = await fetch('/api/samba/diagnostic-walk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: diagnosticPath }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiagnosticResult(data);
        if (data.visits && data.visits.length > 0) {
          logger.info(`Diagnostic walk finished. Traversed ${data.visits.length} folder nodes on Host.`, 'Scanner', data);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setDiagnosticError(errData.error || 'Failed to execute diagnostic walk on server.');
      }
    } catch (err: any) {
      setDiagnosticError(err.message || 'Network error while attempting diagnostic.');
    } finally {
      setDiagnosticLoading(false);
    }
  };

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
    const unsubIncident = logger.subscribeIncident((inc) => {
      setActiveIncident(inc);
    });
    return () => unsubIncident();
  }, []);

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
    if (selectedCategory !== 'all') {
      if ((selectedCategory as string) === 'Path Diagnostics' || (selectedCategory as string) === 'Path Analysis') {
        const isPathEvent =
          log.message.includes('[performFastScan:PathDiagnostic]') ||
          log.message.includes('[VerifyPath:PathAnalysis]') ||
          log.message.includes('[fs.access:') ||
          log.message.includes('[SyncLog:AccessError]') ||
          log.details?.type === 'path_analysis';
        if (!isPathEvent) return false;
      } else if (log.category !== selectedCategory) {
        return false;
      }
    }
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

  const handleRetryFailedFiles = async () => {
    if (!activeIncident || isRetrying) return;
    setIsRetrying(true);
    setRetryNotice(null);

    const targetPaths =
      activeIncident.failedPaths && activeIncident.failedPaths.length > 0
        ? activeIncident.failedPaths
        : [];

    logger.info(
      `Retrying ${targetPaths.length > 0 ? targetPaths.length + ' failed files' : 'Samba scan'} for incident "${activeIncident.title}"...`,
      'Sync',
      { failedPaths: targetPaths }
    );

    try {
      logger.updateIncidentRetryCount(activeIncident.id);

      if (onRetryFailedFiles) {
        await onRetryFailedFiles(targetPaths);
      } else if (onTriggerSync) {
        await onTriggerSync();
      } else {
        // Direct fallback: trigger sync-scan probe
        const res = await fetch('/api/samba/sync-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: targetPaths.length > 0 ? targetPaths : ['/Volumes/media'],
            shareName: 'media',
          }),
        }).catch(() => null);

        if (!res || !res.ok) {
          throw new Error('Samba server did not acknowledge retry command.');
        }
      }

      logger.resolveIncident(activeIncident.id);
      setRetryNotice('All failed operations retried and resolved successfully!');
      setTimeout(() => setRetryNotice(null), 4000);
    } catch (err: any) {
      console.error('Retry failed:', err);
      logger.error(`Retry attempt failed: ${err?.message || err}`, 'Sync', { error: String(err) });
      setRetryNotice(`Retry attempt failed: ${err?.message || 'Check network connection'}`);
      setTimeout(() => setRetryNotice(null), 5000);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSimulateIncident = () => {
    logger.recordIncident({
      title: 'Critical Samba Network / Scan Failure',
      errorMessage: 'Network timeout (ETIMEDOUT): Connection dropped to smb://192.168.1.25/media during directory traversal.',
      failedPaths: [
        'Movies/Sci-Fi/Dune Part Two (2024)/Dune.Part.Two.2024.2160p.mkv',
        'TV Shows/Battlestar Galactica (2004)/Season 01/S01E01 - 33.mkv',
        'TV Shows/Severance (2022)/Season 01/S01E01 - Good News About Hell.mkv',
      ],
      category: 'Network',
    });
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
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
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

          {/* Active Permission Denied / Warnings Diagnostic Trigger Button */}
          {lastScanErrors.length > 0 ? (
            <button
              onClick={() => setShowOverlay(true)}
              className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-950/40 relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-rose-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out" />
              <ShieldAlert className="w-4 h-4 text-rose-400 animate-bounce shrink-0" />
              <span>{lastScanErrors.length} Access Error(s)</span>
            </button>
          ) : (
            <button
              onClick={() => setShowOverlay(true)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 text-slate-300 font-semibold transition flex items-center gap-2 cursor-pointer shadow"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Permission Audit</span>
            </button>
          )}
        </div>
      </div>

      {/* Samba Traversability & Path Diagnostics Panel */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Samba Path &amp; Traversability Diagnostics</h3>
              <p className="text-xs text-slate-400">
                Identify why the scanner isn't finding expected files or if permissions prevent folder traversal.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPathTesterOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition flex items-center gap-1.5 shadow cursor-pointer"
              title="Open interactive Samba Path Regex and Sanitizer Sandbox modal"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Test Path Regex</span>
            </button>
            <button
              onClick={() => setIsDiagnosticExpanded(!isDiagnosticExpanded)}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
            >
              {isDiagnosticExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {isDiagnosticExpanded && (
          <div className="space-y-4">
            {/* Diagnostic Mode Tab Selector */}
            <div className="flex border-b border-slate-800 pb-1.5 gap-4">
              <button
                onClick={() => setActiveDiagnosticTab('info')}
                className={`text-xs font-bold font-mono pb-2 relative transition cursor-pointer ${
                  activeDiagnosticTab === 'info'
                    ? 'text-cyan-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>📋 Diagnostics &amp; Probe Tool</span>
                {activeDiagnosticTab === 'info' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500" />
                )}
              </button>
              <button
                onClick={() => setActiveDiagnosticTab('analysis')}
                className={`text-xs font-bold font-mono pb-2 relative transition cursor-pointer flex items-center gap-1.5 ${
                  activeDiagnosticTab === 'analysis'
                    ? 'text-cyan-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>🔍 Path Analysis &amp; Verify Traces</span>
                {pathAnalysisHistory.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold">
                    {pathAnalysisHistory.length}
                  </span>
                )}
                {activeDiagnosticTab === 'analysis' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500" />
                )}
              </button>
              <button
                onClick={() => setActiveDiagnosticTab('tree')}
                className={`text-xs font-bold font-mono pb-2 relative transition cursor-pointer flex items-center gap-1.5 ${
                  activeDiagnosticTab === 'tree'
                    ? 'text-cyan-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>🌳 Real-Time Tree Visualizer (D3)</span>
                {liveScanActive && (
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping shrink-0" />
                )}
                {activeDiagnosticTab === 'tree' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500" />
                )}
              </button>
              <button
                onClick={() => setActiveDiagnosticTab('scan-debug')}
                className={`text-xs font-bold font-mono pb-2 relative transition cursor-pointer flex items-center gap-1.5 ${
                  activeDiagnosticTab === 'scan-debug'
                    ? 'text-cyan-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>🔬 Raw vs Resolved Path Trace</span>
                {scanDebugRecords.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold border ${
                      scanDebugRecords.some((r) => r.hasAnomaly)
                        ? 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse'
                        : 'bg-indigo-950 text-indigo-300 border-indigo-800'
                    }`}
                  >
                    {scanDebugRecords.length}
                  </span>
                )}
                {activeDiagnosticTab === 'scan-debug' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500" />
                )}
              </button>
              <button
                onClick={() => setActiveDiagnosticTab('folder-inspector')}
                className={`text-xs font-bold font-mono pb-2 relative transition cursor-pointer flex items-center gap-1.5 ${
                  activeDiagnosticTab === 'folder-inspector'
                    ? 'text-cyan-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>📁 Real-Time Folder Inspector</span>
                {folderInspectorLogs.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold">
                    {folderInspectorLogs.length}
                  </span>
                )}
                {activeDiagnosticTab === 'folder-inspector' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500" />
                )}
              </button>
            </div>

            {activeDiagnosticTab === 'info' ? (
              <>
                {/* Context Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 block">Samba Process Context</span>
                <span className="font-mono text-slate-200 block font-semibold truncate">
                  User: {whoamiData?.systemUser?.username || 'reading...'} (UID: {whoamiData?.systemUser?.uid ?? '...'})
                </span>
                <span className="text-[10px] text-slate-400 font-mono block">
                  Platform: {whoamiData?.systemUser?.platform || '...'} | Hostname: {whoamiData?.systemUser?.hostname || '...'}
                </span>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 block">Configured Mount Path</span>
                <span className="font-mono text-slate-200 block font-semibold truncate" title={sambaConfig?.mountPath}>
                  {sambaConfig?.mountPath || '/Volumes/media'}
                </span>
                {whoamiData?.pathAudits && (
                  <span className="text-[10px] font-mono block">
                    {whoamiData.pathAudits.find((a: any) => a.path === sambaConfig?.mountPath)?.exists ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Exists &amp; {whoamiData.pathAudits.find((a: any) => a.path === sambaConfig?.mountPath)?.readable ? 'Readable' : 'Unreadable'}
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" /> Path does not exist on Host
                      </span>
                    )}
                  </span>
                )}
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 block">Resolved Physical Path</span>
                <span className="font-mono text-indigo-300 block font-semibold truncate" title={whoamiData?.smbConnectionContext?.resolvedMountPath}>
                  {whoamiData?.smbConnectionContext?.resolvedMountPath || 'resolving...'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {whoamiData?.smbConnectionContext?.resolvedMountPath === '/samba_share' || whoamiData?.smbConnectionContext?.resolvedMountPath?.endsWith('samba_share') ? (
                    <span className="text-amber-400">⚠️ Fallback to local cache (Samba turned off)</span>
                  ) : (
                    <span className="text-emerald-400 font-semibold">✅ Pointing to active network mount</span>
                  )}
                </span>
              </div>
            </div>

            {/* Path Probe Tool */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                    Test Path for Depth-First Traversal Diagnostics
                  </label>
                  <input
                    type="text"
                    value={diagnosticPath}
                    onChange={(e) => setDiagnosticPath(e.target.value)}
                    placeholder="Enter directory path to scan, e.g. /Volumes/media"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  onClick={handleRunDiagnosticWalk}
                  disabled={diagnosticLoading}
                  className="px-4 py-2 self-end rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold shadow transition flex items-center gap-2 cursor-pointer h-9 mt-1 sm:mt-0"
                >
                  {diagnosticLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{diagnosticLoading ? 'Traversing...' : 'Run Depth-First Probe'}</span>
                </button>
              </div>

              {diagnosticError && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs font-mono">
                  🛑 <strong>Error:</strong> {diagnosticError}
                </div>
              )}

              {/* Diagnostic walk results */}
              {diagnosticResult && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-400 font-mono">
                      Target: <strong className="text-white">{diagnosticResult.resolvedPath}</strong>
                    </span>
                    <span className="text-cyan-400 font-mono text-[11px]">
                      {diagnosticResult.summary}
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar">
                    {diagnosticResult.visits && diagnosticResult.visits.map((v: any, idx: number) => {
                      // Indent directory depth based on path segments relative to target root
                      const relativeSub = v.dir.replace(diagnosticResult.resolvedPath, '');
                      const depth = relativeSub.split(/[\/\\]/).filter(Boolean).length;
                      const indent = '  '.repeat(depth);

                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg text-xs font-mono border ${
                            v.error
                              ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                              : 'bg-slate-900/40 border-slate-800 text-slate-300'
                          } flex flex-col space-y-1`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate flex items-center gap-1.5">
                              <span className="text-slate-500 shrink-0 select-none whitespace-pre">{indent}</span>
                              <span className="text-slate-400 shrink-0 select-none">📂</span>
                              <span className="truncate text-slate-200" title={v.dir}>{v.dir}</span>
                            </span>
                            <span className="text-[11px] shrink-0 space-x-2">
                              <span className="text-slate-400">Files: <strong className="text-white">{v.fileCount}</strong></span>
                              <span className="text-slate-400">Folders: <strong className="text-white">{v.directoryCount}</strong></span>
                            </span>
                          </div>

                          {v.error ? (
                            <div className="text-[10px] text-rose-400 font-bold bg-rose-950/50 p-1.5 rounded border border-rose-900/40 mt-1 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <span>{v.error}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-0.5">
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-500" /> Accessible
                              </span>
                              <span>Readable: {v.readable ? 'Yes' : 'No'}</span>
                              <span>Writable: {v.writable ? 'Yes' : 'No'}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Samba Path Resolver & Mapping Diagnostics */}
            {(() => {
              const details = resolveSambaPathToLocalMount(
                pathToResolve,
                sambaConfig?.mountPath || '',
                sambaConfig?.share || 'media'
              );
              return (
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      <label className="text-[11px] font-bold text-slate-200 uppercase tracking-wider block font-mono">
                        Samba Path Resolver &amp; Mapping Diagnostics
                      </label>
                    </div>
                    <p className="text-[10.5px] text-slate-400">
                      Type any path (such as <code className="text-indigo-400">{actualUserPath}/Series/...</code> or a UNC network pointer) to see how it aligns to your absolute local storage mountpoint. Helps debug missing files!
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={pathToResolve}
                        onChange={(e) => setPathToResolve(e.target.value)}
                        placeholder={`e.g. ${actualUserPath}`}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setPathToResolve(actualUserPath)}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 font-medium border border-slate-800 transition shrink-0 cursor-pointer"
                      >
                        Reset Path
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono pt-1">
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Input Samba Path</span>
                      <div className="text-slate-300 break-all">{pathToResolve || '[Empty]'}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Configured Local Mount Root</span>
                      <div className="text-emerald-400 break-all">{details.configuredMountPath}</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-900/40 space-y-1.5 font-mono text-xs">
                    <div className="flex items-center gap-1.5 text-indigo-300 font-bold uppercase text-[10px]">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Resolved Absolute Local Path</span>
                    </div>
                    <div className="text-indigo-200 select-all break-all bg-slate-950/80 p-2 rounded border border-indigo-950">
                      {details.resolvedLocalPath}
                    </div>
                  </div>

                  {details.hasMappingMismatch ? (
                    <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 space-y-1.5 font-mono text-xs animate-pulse">
                      <div className="flex items-center gap-1.5 text-rose-300 font-bold uppercase text-[10px]">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        <span>MAPPING MISMATCH DETECTED (MEMBER DISCONNECT CAUSE)</span>
                      </div>
                      <p className="text-rose-200 text-[11px] leading-relaxed">
                        {details.mismatchReason}
                      </p>
                      <div className="text-[10px] text-slate-400 mt-1">
                        💡 <strong>Resolution:</strong> Ensure your Samba Scanners and local media readers are configured to point to the mapped directory <code className="text-emerald-400">{details.configuredMountPath}</code> rather than raw network UNC pointers.
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/30 flex items-start gap-2.5 font-mono text-xs text-emerald-200">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-[10px] uppercase block tracking-wider text-emerald-300">Valid Path Alignment Match</span>
                        <span className="text-[11px]">The input path matches the active local mount path alignment perfectly! No raw network protocol mismatch detected. Files placed here will resolve successfully.</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            </>
            ) : activeDiagnosticTab === 'analysis' ? (
              <div className="space-y-4">
                {/* Header & Quick Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      Path Analysis &amp; Verify Traces
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Inspects the results of <code className="text-cyan-300 font-mono">path.resolve()</code>, <code className="text-cyan-300 font-mono">fs.access()</code>, and <code className="text-cyan-300 font-mono">fs.stat()</code> across raw Samba inputs and absolute OS filesystem paths.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => clearPathAnalysisHistory()}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-800 rounded-lg text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Traces</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Path Tester */}
                <div className="bg-slate-950/80 p-4 rounded-xl border border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider font-mono">
                      Test Path Resolution &amp; fs.access
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      e.g. /Users/sargus/media, /Volumes/media, or //192.168.1.25/media
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={testPathInput}
                      onChange={(e) => setTestPathInput(e.target.value)}
                      placeholder="Enter raw path to analyze (e.g. /Users/sargus/media)"
                      className="flex-1 bg-slate-900 border border-slate-700/80 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleRunPathAnalysisTest}
                      disabled={isAnalyzingPath || !testPathInput.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center justify-center gap-2 cursor-pointer shadow-md shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzingPath ? 'animate-spin' : ''}`} />
                      <span>{isAnalyzingPath ? 'Analyzing...' : 'Run Path Analysis'}</span>
                    </button>
                  </div>

                  {/* Immediate Test Result Card */}
                  {latestAnalysisTestResult && (
                    <div className="mt-3 p-3.5 rounded-xl border text-xs font-mono bg-slate-900/90 border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-bold text-white flex items-center gap-2">
                          <span>Result for:</span>
                          <code className="text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded">{latestAnalysisTestResult.rawInput || testPathInput}</code>
                        </span>
                        {latestAnalysisTestResult.accessible ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            ✓ Verified &amp; Accessible
                          </span>
                        ) : latestAnalysisTestResult.accessDenied ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            ✕ Access Denied ({latestAnalysisTestResult.errorCode || 'EACCES'})
                          </span>
                        ) : latestAnalysisTestResult.exists ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            ⚠️ Exists but Not Readable
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/40 text-rose-300 border border-rose-800">
                            ✕ Path Does Not Exist
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase block">Raw Input</span>
                          <span className="text-slate-300 break-all select-all font-semibold">{latestAnalysisTestResult.rawInput || testPathInput}</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-indigo-950 space-y-1">
                          <span className="text-[10px] text-indigo-400 uppercase block">Absolute Resolved OS Path</span>
                          <span className="text-indigo-200 break-all select-all font-semibold">{latestAnalysisTestResult.resolvedPath || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px]">
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">Exists</span>
                          <span className={latestAnalysisTestResult.exists ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {latestAnalysisTestResult.exists ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">fs.access (R_OK)</span>
                          <span className={latestAnalysisTestResult.readable ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {latestAnalysisTestResult.readable ? 'Granted' : 'Denied'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">fs.access (W_OK)</span>
                          <span className={latestAnalysisTestResult.writable ? 'text-blue-400 font-bold' : 'text-amber-400 font-bold'}>
                            {latestAnalysisTestResult.writable ? 'Writable' : 'Read-Only'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">fs.stat Content</span>
                          <span className="text-slate-300 font-bold">
                            {latestAnalysisTestResult.isDirectory ? `${latestAnalysisTestResult.fileCount ?? 0} items` : 'File / Other'}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded border border-slate-800/80">
                        {latestAnalysisTestResult.message}
                      </p>
                    </div>
                  )}
                </div>

                {/* Path Analysis Recorded Events Stream */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <span>Recent Path Verifications &amp; Analyses</span>
                      <span className="text-indigo-400 font-normal">({pathAnalysisHistory.length})</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Updated whenever Verify Path or scanner checks run
                    </span>
                  </div>

                  {pathAnalysisHistory.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                      <Terminal className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-400 font-mono">
                        No path verification traces recorded yet.
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Click "Run Path Analysis" above or "Verify Path" in Samba Mount Hub to generate real-time traces.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                      {pathAnalysisHistory.map((item) => {
                        const d = new Date(item.timestamp);
                        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
                          d.getSeconds()
                        ).padStart(2, '0')}`;

                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border font-mono text-xs space-y-2 transition ${
                              item.accessDenied
                                ? 'bg-rose-950/20 border-rose-500/30'
                                : item.accessible
                                ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                                : 'bg-slate-900/40 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 text-[10px] tabular-nums">{timeStr}</span>
                                {item.accessible ? (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 text-[10px] font-bold">
                                    ✓ Verified
                                  </span>
                                ) : item.accessDenied ? (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-800/60 text-[10px] font-bold">
                                    ✕ Access Denied ({item.errorCode || 'EACCES'})
                                  </span>
                                ) : item.exists ? (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60 text-[10px] font-bold">
                                    ⚠️ Exists (Unreadable)
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px]">
                                    ✕ Not Found
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 space-x-2">
                                <span>{item.isDirectory ? `${item.fileCount} items` : 'File'}</span>
                                {item.mode && <span>(Mode {item.mode})</span>}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-500 text-[10px] uppercase block">Raw Input</span>
                                <span className="text-amber-300 break-all select-all font-semibold">{item.rawInput}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 text-[10px] uppercase block">Resolved OS Path</span>
                                <span className="text-cyan-300 break-all select-all font-semibold">{item.resolvedPath}</span>
                              </div>
                            </div>

                            {item.message && (
                              <p className="text-[10.5px] text-slate-400 border-t border-slate-800/60 pt-1.5">
                                {item.message}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : activeDiagnosticTab === 'tree' ? (
              <D3SambaTreeVisualizer
                data={liveTreeRoot}
                scannedCount={liveScannedCount}
                isActive={liveScanActive}
              />
            ) : activeDiagnosticTab === 'folder-inspector' ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-cyan-400" />
                      Real-Time Folder &amp; File Inspector Log
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Produces a real-time live log of all folders and files discovered during the active Samba sync scan.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(folderInspectorLogs, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `folder_inspector_log_${Date.now()}.json`;
                        a.click();
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 shadow"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Log JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFolderInspectorLogs([])}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-800 rounded-lg text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Log</span>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950/90 rounded-xl border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      <span>Live Discovered Folders &amp; Files Stream ({folderInspectorLogs.length})</span>
                    </h5>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {liveScanActive ? '🔴 Live Scanning Active...' : '⏸️ Scan Idle'}
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-[400px]">
                    {folderInspectorLogs.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-xs font-mono">
                        No folders or files logged yet. Trigger a Samba sync scan to start streaming folder discovery.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-900 text-slate-400 text-[10.5px] uppercase tracking-wider border-b border-slate-800 sticky top-0">
                          <tr>
                            <th className="p-2.5">Time</th>
                            <th className="p-2.5">Type</th>
                            <th className="p-2.5">Discovered Path / File</th>
                            <th className="p-2.5">Count Index</th>
                            <th className="p-2.5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {folderInspectorLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-900/50 transition">
                              <td className="p-2.5 text-slate-400 whitespace-nowrap text-[11px]">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </td>
                              <td className="p-2.5 whitespace-nowrap">
                                {log.isDir ? (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800 text-[10px] font-bold">
                                    📁 Folder
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                                    📄 File
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-200 font-mono text-[11px] max-w-md truncate">
                                {log.path}
                              </td>
                              <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">
                                #{log.count}
                              </td>
                              <td className="p-2.5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleCopyDebugPath(log.path, log.id)}
                                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded text-[10px] border border-slate-800 transition cursor-pointer inline-flex items-center gap-1"
                                >
                                  {copiedDebugKey === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  <span>Copy</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* activeDiagnosticTab === 'scan-debug' */
              <PathInspectorView records={scanDebugRecords} onTriggerSync={onTriggerSync} />
            )}

          </div>
        )}
      </div>

      {/* Real-Time Sync Incident Notification Alert Banner */}
      {activeIncident && (
        <div
          id="sync-incident-alert-banner"
          className="relative overflow-hidden rounded-2xl border-2 border-rose-500/80 bg-gradient-to-r from-rose-950/95 via-slate-950/95 to-rose-950/90 p-5 shadow-2xl shadow-rose-950/70 space-y-4 animate-in fade-in slide-in-from-top-3 duration-300"
        >
          {/* Subtle animated red background glow */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-rose-500/20 rounded-full blur-3xl pointer-events-none animate-pulse" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10 border-b border-rose-800/40 pb-3">
            <div className="flex items-center space-x-3">
              <div className="relative p-2.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-400 shrink-0">
                <AlertOctagon className="w-6 h-6 text-rose-400 animate-pulse" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider shadow">
                    SYNC INCIDENT ACTIVE
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-950 text-rose-300 border border-rose-800/60 text-[10px] font-mono">
                    {activeIncident.category.toUpperCase()}
                  </span>
                  {activeIncident.retryCount && activeIncident.retryCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 border border-amber-800/60 text-[10px] font-mono">
                      Retry #{activeIncident.retryCount}
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-400 font-mono">
                    {new Date(activeIncident.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  {activeIncident.title}
                </h3>
              </div>
            </div>

            <button
              onClick={() => logger.dismissIncident()}
              className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer self-end sm:self-auto"
              title="Dismiss Incident Alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative z-10 space-y-3">
            <p className="text-xs font-mono text-rose-200 bg-slate-950/80 border border-rose-900/50 p-3 rounded-xl leading-relaxed">
              {activeIncident.errorMessage}
            </p>

            {/* Failed Paths Collapsible Section */}
            {activeIncident.failedPaths && activeIncident.failedPaths.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowFailedPaths(!showFailedPaths)}
                  className="flex items-center gap-2 text-xs font-semibold text-rose-300 hover:text-rose-200 transition cursor-pointer"
                >
                  {showFailedPaths ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>Failed files / paths ({activeIncident.failedPaths.length})</span>
                </button>

                {showFailedPaths && (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px]">
                    {activeIncident.failedPaths.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-slate-300 bg-rose-950/20 px-2 py-1 rounded border border-rose-900/30 truncate"
                      >
                        <span className="text-rose-500 font-bold shrink-0">✕</span>
                        <span className="truncate">{p}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <button
                  id="retry-failed-files-btn"
                  onClick={handleRetryFailedFiles}
                  disabled={isRetrying}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900/50 text-white text-xs font-bold shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  <span>{isRetrying ? 'Retrying Failed Files...' : 'Retry failed files'}</span>
                </button>

                <button
                  onClick={() => logger.dismissIncident()}
                  disabled={isRetrying}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Dismiss
                </button>
              </div>

              {retryNotice && (
                <span className="text-xs font-mono text-cyan-300 animate-pulse">
                  {retryNotice}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success Notification after Incident Resolution */}
      {retryNotice && !activeIncident && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center gap-2 shadow-lg animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{retryNotice}</span>
        </div>
      )}

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

            {/* Simulate Sync Incident */}
            <button
              id="simulate-sync-incident-btn"
              onClick={handleSimulateIncident}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/30 text-rose-200 border border-rose-500/50 hover:bg-rose-600/50 transition cursor-pointer"
              title="Simulate Critical Samba Network Sync Incident to test real-time alert banner & retry system"
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Simulate Incident</span>
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
            {(['all', 'Sync', 'Samba', 'Mount', 'Database', 'Scanner', 'Scheduler', 'Auth', 'System', 'Path Analysis', 'Path Diagnostics'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat as any)}
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

                  {/* Path Diagnostic / Permission Failed Overlay */}
                  {log.message.includes('[performFastScan:PathDiagnostic]') && (
                    <div className="mt-1 p-2 rounded-lg bg-indigo-950/20 border border-indigo-900/30 font-mono text-[10px] text-indigo-300">
                      <span className="font-bold uppercase text-[9px] block mb-0.5 text-indigo-400">Path Resolver Trace</span>
                      {log.message}
                    </div>
                  )}

                  {/* Verify Path / Path Analysis Specialized Card */}
                  {(log.message.includes('[VerifyPath:PathAnalysis]') || log.details?.type === 'path_analysis') && (
                    <div className="mt-1.5 p-3 rounded-xl bg-slate-950 border border-indigo-500/40 font-mono text-[11px] text-indigo-200 space-y-2">
                      <div className="flex items-center justify-between text-[10px] border-b border-indigo-900/40 pb-1.5">
                        <span className="font-bold uppercase text-indigo-300 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                          Path Analysis &amp; Verify Trace
                        </span>
                        {log.details?.accessDenied ? (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px]">
                            ACCESS DENIED ({log.details?.errorCode || 'EACCES'})
                          </span>
                        ) : log.details?.accessible ? (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px]">
                            ✓ VERIFIED &amp; READABLE
                          </span>
                        ) : log.details?.exists ? (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px]">
                            ⚠️ UNREADABLE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-rose-950/40 text-rose-300 border border-rose-800 text-[9px]">
                            NOT FOUND (ENOENT)
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
                        <div className="p-1.5 bg-slate-900/80 rounded border border-slate-800">
                          <span className="text-slate-500 text-[9px] uppercase block font-bold">Raw Input</span>
                          <span className="text-amber-300 break-all select-all font-semibold">
                            {log.details?.rawInput || 'N/A'}
                          </span>
                        </div>
                        <div className="p-1.5 bg-slate-900/80 rounded border border-slate-800">
                          <span className="text-indigo-400 text-[9px] uppercase block font-bold">Resolved OS Path</span>
                          <span className="text-cyan-300 break-all select-all font-semibold">
                            {log.details?.resolvedPath || 'N/A'}
                          </span>
                        </div>
                      </div>
                      {log.details?.message && (
                        <p className="text-[10px] text-slate-400">
                          {log.details.message}
                        </p>
                      )}
                    </div>
                  )}

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

      {/* Diagnostic Permissions Audit Overlay Modal */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative flex flex-col max-h-[85vh] overflow-hidden space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Permissions &amp; Traversal Audit
                  </h3>
                  <p className="text-xs text-slate-400">
                    Live pre-validation checks and recent scanner folder access logs.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowOverlay(false);
                  setPrevalidateResult(null);
                }}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Resolved Mount Path Info */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
                Current Resolved Target Path
              </span>
              <div className="flex items-center justify-between text-xs font-mono bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-800">
                <span className="text-cyan-300 select-all truncate font-semibold">
                  {sambaConfig?.mountPath || '/Volumes/media'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold uppercase shrink-0 ml-2">
                  {sambaConfig?.enabled ? 'Samba Mount' : 'Local Path'}
                </span>
              </div>
            </div>

            {/* Active Permissions List / Errors from Last performFastScan */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
                  Scan Telemetry Warnings ({lastScanErrors.length})
                </span>

                {lastScanErrors.length > 0 ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded-xl text-rose-300 text-xs leading-relaxed flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-rose-200">Directory Reading Blocked!</strong>
                        The scanner skipped directories due to lack of standard read permissions (`EACCES`). Ensure proper mount options are active.
                      </div>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                      {lastScanErrors.map((err, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-950/80 border border-slate-850 rounded-xl text-xs font-mono text-rose-300 flex flex-col gap-1.5"
                        >
                          <div className="flex items-start gap-2 text-rose-200">
                            <span className="text-rose-500 shrink-0 select-none">🛑</span>
                            <span className="break-all">{err}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 pl-6">
                            Action recommendation: Run `chmod -R +r` or check mount credentials on the target host.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-emerald-950/10 border border-emerald-800/20 rounded-xl text-xs text-slate-300 space-y-2 flex flex-col items-center text-center">
                    <span className="text-3xl">🎉</span>
                    <div>
                      <strong className="block text-emerald-400 font-bold mb-1">No Read Failures Encountered</strong>
                      The last directory walk completed cleanly without encountering standard read permission blocks or unreadable paths.
                    </div>
                  </div>
                )}
              </div>

              {/* macOS Full Disk Access Guidance & Quick Trigger */}
              <div className="p-3.5 bg-amber-950/30 border border-amber-500/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>macOS Full Disk Access (FDA)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => permissionsManager.openSecurityAndPrivacy()}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10.5px] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open Security &amp; Privacy</span>
                  </button>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed font-mono">
                  If scanning local mounts or <code className="text-cyan-300">/Volumes</code> fails silently, grant Full Disk Access to SambaVault (or Terminal / VS Code) in <strong> &gt; System Settings &gt; Privacy &amp; Security &gt; Full Disk Access</strong>.
                </p>
              </div>

              {/* Pre-validation live suite */}
              <div className="space-y-2 border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
                    FS.PROMISES.ACCESS PRE-VALIDATION TEST
                  </span>
                  <button
                    onClick={handlePrevalidatePermissions}
                    disabled={isPrevalidating}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-50 text-white text-[10px] font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isPrevalidating ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    <span>{isPrevalidating ? 'Verifying...' : 'Test Pre-validation Now'}</span>
                  </button>
                </div>

                {prevalidateResult && (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                    {prevalidateResult.success ? (
                      <div className="space-y-2">
                        <span className="text-emerald-400 flex items-center gap-1.5 text-[11px] font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          Host filesystem verified readable at root.
                        </span>
                        <div className="max-h-32 overflow-y-auto space-y-1 text-[11px] custom-scrollbar">
                          {prevalidateResult.visits.map((v: any, vIdx: number) => (
                            <div key={vIdx} className="flex items-center justify-between gap-2 p-1 hover:bg-slate-900 rounded border border-transparent hover:border-slate-800">
                              <span className="truncate text-slate-400 text-left shrink" title={v.dir}>{v.dir}</span>
                              <span className={`shrink-0 text-right ${v.error ? "text-rose-400 font-bold" : "text-emerald-400 font-semibold"}`}>
                                {v.error ? "Blocked 🔒" : "Accessible ✅"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-rose-400 flex items-center gap-1.5 text-[11px] font-bold">
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                        <span>Pre-validation Failed: {prevalidateResult.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="border-t border-slate-800 pt-4 flex items-center justify-between shrink-0">
              <span className="text-[10px] text-slate-500 font-mono">
                SambaVault Security Auditing Engine v1.4
              </span>
              <button
                onClick={() => {
                  setShowOverlay(false);
                  setPrevalidateResult(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Dismiss Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Samba Path Regex and Sanitizer Sandbox Modal */}
      <PathTesterModal
        isOpen={isPathTesterOpen}
        onClose={() => setIsPathTesterOpen(false)}
      />
    </div>
  );
};
