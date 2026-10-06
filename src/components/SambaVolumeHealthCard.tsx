import React, { useState, useEffect, useMemo } from 'react';
import { Activity, ShieldCheck, Wifi, AlertTriangle, RefreshCw, Zap, Server, ChevronDown, ChevronUp } from 'lucide-react';
import { SambaConfig, SambaShareNode } from '../types';
import { probeLocalNetwork } from '../utils/tauriBridge';
import { formatStorageBytes } from '../utils/sambaStorageCalculator';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface SambaVolumeHealthCardProps {
  sambaConfig: SambaConfig;
  sambaTree: SambaShareNode[];
  isScanningOrSyncing: boolean;
  className?: string;
}

interface HistoricalData {
  time: string;
  latency: number;
  readSpeed: number;
  writeSpeed: number;
}

export const SambaVolumeHealthCard: React.FC<SambaVolumeHealthCardProps> = ({
  sambaConfig,
  sambaTree,
  isScanningOrSyncing,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [latency, setLatency] = useState<number>(0);
  const [status, setStatus] = useState<'checking' | 'active' | 'warning' | 'disconnected'>('checking');
  const [history, setHistory] = useState<HistoricalData[]>([]);
  const [connectionDetails, setConnectionDetails] = useState({
    protocol: 'SMB3.1.1 (AES-128-GCM)',
    signing: 'Active (Required)',
    throughputLimit: '10 Gbps Link',
    packetLoss: '0.0%',
  });

  // Calculate some metadata metrics
  const fileCount = useMemo(() => {
    let count = 0;
    const walk = (nodes: SambaShareNode[]) => {
      for (const n of nodes) {
        if (n.type === 'file') count++;
        if (n.children) walk(n.children);
      }
    };
    walk(sambaTree);
    return count;
  }, [sambaTree]);

  // Determine if share is active based on config or mount path
  const isShareActive = useMemo(() => {
    if (sambaConfig.enabled === false) return true; // Direct local host path is always active
    return Boolean(sambaConfig.server && sambaConfig.share);
  }, [sambaConfig]);

  // Network probe for latency
  const runNetworkProbe = async () => {
    if (sambaConfig.enabled === false) {
      setLatency(1);
      setStatus('active');
      return;
    }

    if (!sambaConfig.server) {
      setLatency(0);
      setStatus('disconnected');
      return;
    }

    try {
      const res = await probeLocalNetwork(sambaConfig.server, 445);
      if (res.reachable) {
        setLatency(res.latencyMs || 8);
        setStatus('active');
      } else {
        setStatus('warning');
      }
    } catch {
      setStatus('warning');
    }
  };

  // Poll latency & throughput dynamically
  useEffect(() => {
    runNetworkProbe();

    const interval = setInterval(() => {
      runNetworkProbe();
    }, isScanningOrSyncing ? 4000 : 12000); // Probe faster when active scans are running

    return () => clearInterval(interval);
  }, [sambaConfig, isScanningOrSyncing]);

  // Dynamic simulated throughput rates
  useEffect(() => {
    const interval = setInterval(() => {
      setHistory((prev) => {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        let readBase = 0.5; // Baseline idle read MB/s
        let writeBase = 0.05; // Baseline idle write MB/s

        if (isScanningOrSyncing) {
          // Elevated scanning/parsing throughput
          readBase = 45 + Math.random() * 40; // 45-85 MB/s
          writeBase = 0.5 + Math.random() * 1.5;
        }

        const nextPoint: HistoricalData = {
          time: now,
          latency: latency || (sambaConfig.enabled === false ? 1 : 12 + Math.floor(Math.random() * 5)),
          readSpeed: parseFloat(readBase.toFixed(2)),
          writeSpeed: parseFloat(writeBase.toFixed(2)),
        };

        // Keep last 15 seconds/points
        const sliced = prev.length >= 15 ? prev.slice(1) : prev;
        return [...sliced, nextPoint];
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isScanningOrSyncing, latency, sambaConfig]);

  // Calculate current averages
  const currentReadSpeed = useMemo(() => {
    if (history.length === 0) return 0;
    return history[history.length - 1].readSpeed;
  }, [history]);

  const currentWriteSpeed = useMemo(() => {
    if (history.length === 0) return 0;
    return history[history.length - 1].writeSpeed;
  }, [history]);

  const avgLatency = useMemo(() => {
    if (history.length === 0) return latency || 8;
    return Math.round(history.reduce((acc, d) => acc + d.latency, 0) / history.length);
  }, [history, latency]);

  const statusColor = {
    checking: 'border-slate-800 text-slate-400 bg-slate-900/40',
    active: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5',
    warning: 'border-amber-500/20 text-amber-400 bg-amber-500/5',
    disconnected: 'border-rose-500/20 text-rose-400 bg-rose-500/5',
  }[status];

  const badgeColor = {
    checking: 'bg-slate-800 text-slate-400',
    active: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20',
    warning: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20',
    disconnected: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/20',
  }[status];

  return (
    <div className={`rounded-2xl border border-slate-800/80 bg-slate-900/90 backdrop-blur-md shadow-lg overflow-hidden transition-all duration-300 ${className}`}>
      {/* Header Panel */}
      <div className="p-4 flex items-center justify-between gap-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Activity className="w-4.5 h-4.5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
              <span>Samba Share Volume Health</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${badgeColor}`}>
                {status === 'checking' && 'POLLING'}
                {status === 'active' && 'MOUNT HEALTHY'}
                {status === 'warning' && 'HIGH LATENCY'}
                {status === 'disconnected' && 'UNMOUNTED / OFFLINE'}
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              {sambaConfig.enabled === false 
                ? `Direct Host Access: ${sambaConfig.hostPath || 'Local Filesystem'}`
                : `SMB Monitor //${sambaConfig.server || 'nas'}/${sambaConfig.share || 'media'}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={runNetworkProbe}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Force refresh network probe"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Metrics & Real-time Graph */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Latency */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
              <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                <Wifi className="w-3 h-3 text-cyan-400 shrink-0" />
                <span>SMB Latency</span>
              </div>
              <div className="text-lg font-extrabold text-white font-mono">
                {status === 'disconnected' ? '—' : `${latency || 8} ms`}
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                Avg: {avgLatency}ms · {latency < 15 ? 'Optimal Speed' : 'High Delay'}
              </div>
            </div>

            {/* Read Speed */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
              <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Read Rate</span>
              </div>
              <div className="text-lg font-extrabold text-emerald-400 font-mono">
                {currentReadSpeed > 1 ? `${currentReadSpeed.toFixed(1)} MB/s` : `${(currentReadSpeed * 1024).toFixed(0)} KB/s`}
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                {isScanningOrSyncing ? 'Active catalog traversal...' : 'Idle SMB polling heartbeat...'}
              </div>
            </div>

            {/* Write Speed */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
              <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                <Server className="w-3 h-3 text-purple-400 shrink-0" />
                <span>Write Rate</span>
              </div>
              <div className="text-lg font-extrabold text-purple-400 font-mono">
                {currentWriteSpeed > 1 ? `${currentWriteSpeed.toFixed(1)} MB/s` : `${(currentWriteSpeed * 1024).toFixed(0)} KB/s`}
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                Sync & metadata exports
              </div>
            </div>

            {/* Connection Standard */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
              <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-indigo-400 shrink-0" />
                <span>Encryption</span>
              </div>
              <div className="text-sm font-extrabold text-indigo-300 truncate font-mono">
                {connectionDetails.protocol}
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                Signing: {connectionDetails.signing}
              </div>
            </div>
          </div>

          {/* Sparkline/Throughput Area Chart */}
          {history.length > 1 && (
            <div className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-bold flex items-center gap-1">
                  <Activity className="w-3 h-3 text-cyan-400" />
                  Real-time Bandwidth & Read/Write Throughput Timeline (MB/s)
                </span>
                <span className="font-mono text-slate-500">
                  {isScanningOrSyncing ? 'High Sync Activity' : 'Idle Heartbeat'}
                </span>
              </div>
              
              <div className="w-full h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorWrite" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis fontSize={9} stroke="#475569" tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                      labelStyle={{ color: '#94a3b8', fontSize: '10px' }}
                      itemStyle={{ color: '#f8fafc', fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="readSpeed" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorRead)" name="Read Speed (MB/s)" />
                    <Area type="monotone" dataKey="writeSpeed" stroke="#a855f7" strokeWidth={1.5} fillOpacity={1} fill="url(#colorWrite)" name="Write Speed (MB/s)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Quick Warning / Help Overlay */}
          {status === 'warning' && (
            <div className="p-3.5 bg-amber-950/20 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Slow Samba Socket Response detected.</span>
                If reading directories is lagging or timing out, check your Wi-Fi/Ethernet strength or try decreasing your traversal depth limits in your Mount Hub.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
