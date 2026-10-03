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
import { ScanPerformanceDashboard } from './ScanPerformanceDashboard';
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
  const [activeDiagnosticTab, setActiveDiagnosticTab] = useState<'info' | 'analysis' | 'tree' | 'scan-debug' | 'folder-inspector' | 'performance' | 'scanner-logs'>('performance');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ... (keep top banner) */}
      
      {/* Samba Traversability & Path Diagnostics Panel */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
        {/* ... (keep header as is) */}
        
        {isDiagnosticExpanded && (
          <div className="space-y-4">
            {/* ... (render tab content) */}
          </div>
        )}
      </div>
    </div>
  );
};

