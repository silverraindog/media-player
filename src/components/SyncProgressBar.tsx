import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FolderSearch,
  HardDrive,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Database,
  RefreshCw,
  X,
  Check,
  Clock,
  Timer,
  Shield,
  ShieldCheck,
  Compass,
  AlertTriangle,
  Copy,
  FileText,
  Maximize2,
  ExternalLink,
} from 'lucide-react';

export interface RecursiveAuditProgress {
  isAuditing: boolean;
  currentDepth: number;
  maxDepthLimit: number;
  beyond25Count: number;
  totalAudited: number;
  currentFolder?: string;
  status: 'scanning' | 'auditing_deep' | 'verified_clean' | 'barrier_alert';
}

export interface BatchStatItem {
  batchIndex: number;
  successCount: number;
  failedCount: number;
  totalCount: number;
  durationMs?: number;
  status?: 'completed' | 'processing' | 'pending' | 'failed';
  timestamp?: string;
}

export interface FailedFilePathItem {
  path: string;
  error: string;
  timestamp?: string;
  batchIndex?: number;
  permissionDenied?: boolean;
}

export interface SyncProgressState {
  isActive: boolean;
  phase: 'idle' | 'scanning' | 'classifying' | 'enriching' | 'verifying' | 'indexing' | 'completed' | 'error';
  currentStep: number;
  totalSteps: number;
  currentPath: string;
  processedCount: number;
  totalCount: number;
  batchIndex?: number;
  totalBatches?: number;
  chunkSize?: number;
  errorMessage?: string;
  retryCount?: number;
  maxRetries?: number;
  retryDelayRemaining?: number;
  phaseDescription?: string;
  etaSeconds?: number | null;
  averageBatchTimeMs?: number;
  auditProgress?: RecursiveAuditProgress;
  batchStats?: BatchStatItem[];
  failedFilePaths?: FailedFilePathItem[];
}

interface SyncProgressBarProps {
  progress: SyncProgressState;
  onCancel?: () => void;
  onDismiss?: () => void;
  onRetry?: () => void;
  onForceSkip?: () => void;
  isSafeScan?: boolean;
  onToggleSafeScan?: (enabled: boolean) => void;
  className?: string;
}

const PHASES_ORDER: Array<{ key: SyncProgressState['phase']; label: string; shortLabel: string }> = [
  { key: 'scanning', label: 'Traversal', shortLabel: 'Scan' },
  { key: 'classifying', label: 'Classify', shortLabel: 'Classify' },
  { key: 'enriching', label: 'Metadata', shortLabel: 'Enrich' },
  { key: 'verifying', label: 'Artwork', shortLabel: 'Verify' },
  { key: 'indexing', label: 'Vault Index', shortLabel: 'Index' },
  { key: 'completed', label: 'Complete', shortLabel: 'Done' },
];

const PHASE_DETAILS: Record<
  SyncProgressState['phase'],
  { label: string; icon: React.ReactNode; color: string; badgeBg: string; border: string }
> = {
  idle: {
    label: 'Ready',
    icon: <HardDrive className="w-3.5 h-3.5" />,
    color: 'text-slate-400',
    badgeBg: 'bg-slate-800/80',
    border: 'border-slate-700',
  },
  scanning: {
    label: 'Directory Traversal (Rust WalkDir)',
    icon: <FolderSearch className="w-3.5 h-3.5 text-blue-400" />,
    color: 'text-blue-400',
    badgeBg: 'bg-blue-950/70',
    border: 'border-blue-500/40',
  },
  classifying: {
    label: 'Regex Category Classification',
    icon: <Layers className="w-3.5 h-3.5 text-cyan-400" />,
    color: 'text-cyan-400',
    badgeBg: 'bg-cyan-950/70',
    border: 'border-cyan-500/40',
  },
  enriching: {
    label: 'Batch Metadata Enrichment',
    icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />,
    color: 'text-amber-400',
    badgeBg: 'bg-amber-950/70',
    border: 'border-amber-500/40',
  },
  verifying: {
    label: 'Batch Artwork Verification',
    icon: <FileCode className="w-3.5 h-3.5 text-indigo-400" />,
    color: 'text-indigo-400',
    badgeBg: 'bg-indigo-950/70',
    border: 'border-indigo-500/40',
  },
  indexing: {
    label: 'SQLite Vault Indexing',
    icon: <Database className="w-3.5 h-3.5 text-emerald-400" />,
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-950/70',
    border: 'border-emerald-500/40',
  },
  completed: {
    label: 'Synchronization Complete',
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-950/70',
    border: 'border-emerald-500/40',
  },
  error: {
    label: 'Transient Network Error / Warning',
    icon: <AlertCircle className="w-3.5 h-3.5 text-rose-400" />,
    color: 'text-rose-400',
    badgeBg: 'bg-rose-950/70',
    border: 'border-rose-500/40',
  },
};

export const SyncProgressBar: React.FC<SyncProgressBarProps> = ({
  progress,
  onCancel,
  onDismiss,
  onRetry,
  onForceSkip,
  isSafeScan = false,
  onToggleSafeScan,
  className = '',
}) => {
  // Store timing history for previous batches to calculate accurate ETA
  const lastBatchRef = useRef<{ index: number; time: number } | null>(null);
  const batchDurationsRef = useRef<number[]>([]);
  const [internalEtaSeconds, setInternalEtaSeconds] = useState<number | null>(null);
  const [avgBatchDurationMs, setAvgBatchDurationMs] = useState<number | null>(null);

  // Detailed scan breakdown modal state
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'batches' | 'failed_paths'>('batches');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [failedSearchFilter, setFailedSearchFilter] = useState('');

  // Compute effective batch stats
  const totalBatchesCount = progress.totalBatches || Math.max(1, Math.ceil((progress.totalCount || 100) / (progress.chunkSize || 50)));
  const currentBatchIdx = progress.batchIndex || Math.max(1, Math.min(totalBatchesCount, Math.ceil(((progress.processedCount || 1) / (progress.totalCount || 1)) * totalBatchesCount)));

  const computedBatchStats = React.useMemo(() => {
    if (progress.batchStats && progress.batchStats.length > 0) {
      return progress.batchStats;
    }
    const stats: BatchStatItem[] = [];
    const chunkSize = progress.chunkSize || 50;
    for (let i = 1; i <= totalBatchesCount; i++) {
      const isPast = i < currentBatchIdx;
      const isCurrent = i === currentBatchIdx;
      const items = isPast ? chunkSize : isCurrent ? (progress.processedCount % chunkSize || chunkSize) : 0;
      const duration = isPast ? (avgBatchDurationMs || 1200) : isCurrent ? 800 : 0;
      stats.push({
        batchIndex: i,
        totalCount: chunkSize,
        successCount: isPast ? items : isCurrent ? Math.max(0, items - (progress.failedFilePaths?.length || 0)) : 0,
        failedCount: isCurrent ? (progress.failedFilePaths?.length || 0) : 0,
        durationMs: duration,
        status: isPast ? 'completed' : isCurrent ? 'processing' : 'pending',
        timestamp: new Date(Date.now() - (totalBatchesCount - i) * 1500).toLocaleTimeString(),
      });
    }
    return stats;
  }, [progress.batchStats, totalBatchesCount, currentBatchIdx, progress.processedCount, progress.chunkSize, progress.failedFilePaths, avgBatchDurationMs]);

  const computedFailedPaths = React.useMemo(() => {
    if (progress.failedFilePaths && progress.failedFilePaths.length > 0) {
      return progress.failedFilePaths;
    }
    if (progress.errorMessage) {
      return [
        {
          path: progress.currentPath || '/Volumes/media/Unreadable_Directory',
          error: progress.errorMessage || 'EACCES: Permission denied / Read-only SMB share lock',
          timestamp: new Date().toLocaleTimeString(),
          batchIndex: currentBatchIdx,
          permissionDenied: progress.errorMessage.toLowerCase().includes('permission') || progress.errorMessage.toLowerCase().includes('eacces'),
        },
      ];
    }
    return [];
  }, [progress.failedFilePaths, progress.errorMessage, progress.currentPath, currentBatchIdx]);

  // Batch scan completion spark animation state
  const [showSpark, setShowSpark] = useState(false);
  const [sparkKey, setSparkKey] = useState(0);
  const prevBatchRef = useRef<number | undefined>(progress.batchIndex);
  const prevProcessedRef = useRef<number>(progress.processedCount);
  const prevPhaseRef = useRef<string>(progress.phase);

  useEffect(() => {
    const batchChanged = typeof progress.batchIndex === 'number' && typeof prevBatchRef.current === 'number' && progress.batchIndex > prevBatchRef.current;
    const completedNow = (progress.phase === 'completed' && prevPhaseRef.current !== 'completed') || (progress.processedCount > 0 && progress.processedCount === progress.totalCount && prevProcessedRef.current < progress.totalCount);

    if (batchChanged || completedNow) {
      setSparkKey(Date.now());
      setShowSpark(true);
      const timer = setTimeout(() => setShowSpark(false), 1200);
      prevBatchRef.current = progress.batchIndex;
      prevProcessedRef.current = progress.processedCount;
      prevPhaseRef.current = progress.phase;
      return () => clearTimeout(timer);
    }

    prevBatchRef.current = progress.batchIndex;
    prevProcessedRef.current = progress.processedCount;
    prevPhaseRef.current = progress.phase;
  }, [progress.batchIndex, progress.processedCount, progress.totalCount, progress.phase]);

  // Stall detection state
  const lastUpdateRef = useRef<number>(Date.now());
  const lastProcessedRef = useRef<number>(0);
  const lastStepRef = useRef<number>(0);
  const [isStalled, setIsStalled] = useState(false);
  const [stallDuration, setStallDuration] = useState(0);

  // Monitor updates to detect stalls (e.g. no progress for 20 seconds)
  useEffect(() => {
    if (!progress.isActive || progress.phase === 'completed' || progress.phase === 'idle') {
      setIsStalled(false);
      setStallDuration(0);
      return;
    }

    const checkStall = () => {
      const now = Date.now();
      const timeSinceUpdate = now - lastUpdateRef.current;
      
      if (timeSinceUpdate > 15000) { // 15 seconds threshold
        setIsStalled(true);
        setStallDuration(Math.floor(timeSinceUpdate / 1000));
      } else {
        setIsStalled(false);
        setStallDuration(0);
      }
    };

    const interval = setInterval(checkStall, 2000);

    // Update last seen progress
    if (progress.processedCount !== lastProcessedRef.current || progress.currentStep !== lastStepRef.current) {
      lastUpdateRef.current = Date.now();
      lastProcessedRef.current = progress.processedCount;
      lastStepRef.current = progress.currentStep;
      setIsStalled(false);
    }

    return () => clearInterval(interval);
  }, [progress.processedCount, progress.currentStep, progress.isActive, progress.phase]);

  // Dynamic processing speed tracking (items per second)
  const scanStartTimeRef = useRef<number | null>(null);
  const scanStartProcessedRef = useRef<number>(0);
  const [itemsPerSec, setItemsPerSec] = useState<number | null>(null);

  useEffect(() => {
    if (!progress.isActive || progress.phase === 'completed' || progress.phase === 'idle') {
      scanStartTimeRef.current = null;
      setItemsPerSec(null);
      return;
    }

    if (scanStartTimeRef.current === null) {
      scanStartTimeRef.current = Date.now();
      scanStartProcessedRef.current = progress.processedCount;
    }

    const elapsedMs = Date.now() - scanStartTimeRef.current;
    const deltaItems = progress.processedCount - scanStartProcessedRef.current;

    if (elapsedMs > 500 && deltaItems > 0) {
      const speed = (deltaItems / elapsedMs) * 1000;
      setItemsPerSec(Math.round(speed * 10) / 10);

      const remainingItems = progress.totalCount - progress.processedCount;
      if (remainingItems > 0 && speed > 0 && internalEtaSeconds === null) {
        setInternalEtaSeconds(Math.max(1, Math.round(remainingItems / speed)));
      }
    }
  }, [progress.processedCount, progress.totalCount, progress.isActive, progress.phase]);

  // Monitor batch progress and calculate rolling average time per batch
  useEffect(() => {
    if (!progress.isActive || progress.phase === 'completed' || progress.phase === 'idle') {
      lastBatchRef.current = null;
      batchDurationsRef.current = [];
      setInternalEtaSeconds(null);
      setAvgBatchDurationMs(null);
      return;
    }

    const now = Date.now();
    const currentBatch = progress.batchIndex;

    if (typeof currentBatch === 'number' && currentBatch > 0) {
      if (lastBatchRef.current !== null && currentBatch > lastBatchRef.current.index) {
        const deltaMs = now - lastBatchRef.current.time;
        // Verify valid duration range between batches (25ms to 90s)
        if (deltaMs >= 25 && deltaMs <= 90000) {
          batchDurationsRef.current.push(deltaMs);
          // Keep a rolling window of the last 10 batches for responsive dynamic ETA
          if (batchDurationsRef.current.length > 10) {
            batchDurationsRef.current.shift();
          }

          const avg =
            batchDurationsRef.current.reduce((sum, d) => sum + d, 0) /
            batchDurationsRef.current.length;
          setAvgBatchDurationMs(Math.round(avg));

          const totalBatches = progress.totalBatches || 0;
          if (totalBatches > currentBatch) {
            const remainingBatches = totalBatches - currentBatch;
            const calculatedEta = Math.max(1, Math.round((remainingBatches * avg) / 1000));
            setInternalEtaSeconds(calculatedEta);
          } else {
            setInternalEtaSeconds(0);
          }
        }
      }
      lastBatchRef.current = { index: currentBatch, time: now };
    }
  }, [progress.batchIndex, progress.totalBatches, progress.isActive, progress.phase]);

  // Use explicit ETA from progress if provided, otherwise fallback to component's calculated ETA
  const effectiveEta =
    typeof progress.etaSeconds === 'number'
      ? progress.etaSeconds
      : internalEtaSeconds;

  const effectiveAvgMs = progress.averageBatchTimeMs || avgBatchDurationMs;

  const formatEta = (seconds: number): string => {
    if (seconds <= 0) return '< 5s';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    if (mins < 60) {
      return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
    }
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  if (!progress.isActive && progress.phase === 'idle') {
    return null;
  }

  const percent = Math.min(
    100,
    Math.max(
      0,
      progress.phase === 'completed'
        ? 100
        : progress.totalCount > 0
        ? Math.round((progress.processedCount / progress.totalCount) * 100)
        : progress.totalSteps > 0
        ? Math.round((progress.currentStep / progress.totalSteps) * 100)
        : progress.isActive
        ? 15
        : 100
    )
  );

  const currentPhaseInfo = PHASE_DETAILS[progress.phase] || PHASE_DETAILS.scanning;
  const currentPhaseIndex = PHASES_ORDER.findIndex((p) => p.key === progress.phase);

  return (
    <AnimatePresence>
      <motion.div
        id="samba-sync-progress-bar"
        initial={{ opacity: 0, y: -16 }}
        animate={{
          opacity: 1,
          y: 0,
          boxShadow: progress.isActive && progress.phase !== 'completed'
            ? [
                '0 0 12px rgba(99, 102, 241, 0.25)',
                '0 0 28px rgba(99, 102, 241, 0.55)',
                '0 0 12px rgba(99, 102, 241, 0.25)'
              ]
            : '0 0 0px transparent',
        }}
        exit={{ opacity: 0, y: -16 }}
        transition={{
          y: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
          boxShadow: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
        }}
        className={`bg-slate-900/95 border-b px-4 py-3 shadow-2xl backdrop-blur-md relative overflow-hidden transition-all duration-500 ${
          progress.phase === 'scanning'
            ? 'border-blue-500/60 ring-1 ring-blue-500/40'
            : 'border-indigo-500/30'
        } ${className}`}
      >
        {/* Subtle background glow effect during active sync */}
        {progress.isActive && progress.phase !== 'completed' && (
          <motion.div
            className={`absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r ${
              progress.phase === 'scanning'
                ? 'from-blue-600 via-cyan-300 to-blue-600 animate-pulse'
                : 'from-transparent via-indigo-500 to-transparent'
            }`}
            animate={{ opacity: progress.phase === 'scanning' ? [0.4, 1, 0.4] : [0.3, 1, 0.3] }}
            transition={{ duration: progress.phase === 'scanning' ? 1.2 : 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        <div className="max-w-7xl mx-auto space-y-2.5">
          {/* Top Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <motion.div
                key={progress.phase}
                initial={{ scale: 0.8, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className={`p-1.5 rounded-lg ${currentPhaseInfo.badgeBg} border ${currentPhaseInfo.border} flex items-center justify-center shrink-0 shadow-sm ${
                  progress.phase === 'scanning' ? 'ring-2 ring-blue-500/50 animate-pulse' : ''
                }`}
              >
                {progress.phase === 'scanning' ? (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    {currentPhaseInfo.icon}
                  </motion.div>
                ) : progress.phase === 'enriching' ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                  >
                    {currentPhaseInfo.icon}
                  </motion.div>
                ) : (
                  currentPhaseInfo.icon
                )}
              </motion.div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={progress.phase}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.2 }}
                      className={`font-semibold tracking-wide uppercase text-[11px] flex items-center gap-1.5 ${currentPhaseInfo.color}`}
                    >
                      {currentPhaseInfo.label}
                      {progress.phase === 'scanning' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
                      )}
                    </motion.span>
                  </AnimatePresence>

                  {/* Batch indicator */}
                  {progress.totalBatches && progress.totalBatches > 1 && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="px-1.5 py-0.5 rounded bg-indigo-950/80 text-[10px] font-mono text-indigo-300 border border-indigo-700/50 shadow-sm"
                    >
                      Batch {progress.batchIndex || 1}/{progress.totalBatches}
                    </motion.span>
                  )}

                  {/* Detailed Scan Breakdown Modal Trigger Button */}
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsDetailModalOpen(true)}
                    className="px-2.5 py-0.5 rounded-full bg-indigo-950/90 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-500/50 text-[10px] font-mono flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                    title="Click to expand detailed modal showing per-batch success counts and specific failed file paths"
                  >
                    <Maximize2 className="w-3 h-3 text-indigo-400" />
                    <span className="font-semibold">Scan Breakdown</span>
                    {computedFailedPaths.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-700/50 text-[9px] font-bold">
                        {computedFailedPaths.length} failed
                      </span>
                    )}
                  </motion.button>

                  {/* Dynamic ETA badge based on processing speed & average batch time */}
                  {effectiveEta !== null && effectiveEta > 0 && progress.phase !== 'completed' && progress.phase !== 'idle' && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="px-2.5 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-500/60 text-cyan-300 text-[10px] font-mono flex items-center gap-1.5 shadow-sm"
                      title={
                        itemsPerSec
                          ? `Processing speed: ~${itemsPerSec} items/sec. Estimated time remaining: ~${formatEta(effectiveEta)}`
                          : effectiveAvgMs
                          ? `Estimated time remaining based on ~${(effectiveAvgMs / 1000).toFixed(1)}s/batch average`
                          : 'Estimated time remaining'
                      }
                    >
                      <Clock className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
                      <span>ETA: ~{formatEta(effectiveEta)}</span>
                      {itemsPerSec ? (
                        <span className="text-cyan-400 font-semibold text-[9px] hidden lg:inline">
                          ({itemsPerSec} items/s)
                        </span>
                      ) : effectiveAvgMs ? (
                        <span className="text-cyan-500/80 text-[9px] hidden lg:inline">
                          ({(effectiveAvgMs / 1000).toFixed(1)}s/batch)
                        </span>
                      ) : null}
                    </motion.span>
                  )}

                  {/* Exponential backoff retry banner badge */}
                  {progress.retryCount && progress.retryCount > 0 ? (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="px-2 py-0.5 rounded-full bg-amber-950/90 border border-amber-500/60 text-amber-300 text-[10px] font-mono flex items-center gap-1 shadow-sm"
                    >
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-400" />
                      <span>
                        Retry {progress.retryCount}/{progress.maxRetries || 3}
                        {progress.retryDelayRemaining ? ` (${progress.retryDelayRemaining}ms)` : ''}
                      </span>
                    </motion.span>
                  ) : null}

                  {/* Safe Scan Mode Toggle Badge / Button */}
                  {onToggleSafeScan ? (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onToggleSafeScan(!isSafeScan)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-sm border ${
                        isSafeScan
                          ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/90 shadow-emerald-950/30 ring-1 ring-emerald-500/20'
                          : 'bg-slate-800/90 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                      }`}
                      title={
                        isSafeScan
                          ? 'Safe Scan Active: Shallow file traversal without deep recursive lookups or heavy API calls. Click to toggle.'
                          : 'Safe Scan OFF: Full deep scan with heavy external lookups. Click to activate Safe Scan.'
                      }
                    >
                      {isSafeScan ? (
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Shield className="w-3 h-3 text-slate-400" />
                      )}
                      <span className="font-semibold">{isSafeScan ? 'Safe Scan: ON' : 'Safe Scan: OFF'}</span>
                    </motion.button>
                  ) : isSafeScan ? (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono flex items-center gap-1.5 bg-emerald-950/90 border border-emerald-500/60 text-emerald-300"
                      title="Safe Scan Active: Shallow traversal without heavy API calls"
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span className="font-semibold">Safe Scan</span>
                    </span>
                  ) : null}
                </div>

                {/* Subtitle / Path */}
                <AnimatePresence mode="wait">
                  <motion.p
                    key={progress.currentPath}
                    initial={{ opacity: 0.7 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    className={`font-mono text-xs truncate max-w-md md:max-w-2xl transition-all duration-300 ${
                      progress.isActive && progress.phase !== 'completed'
                        ? 'text-indigo-300 animate-pulse font-medium'
                        : 'text-slate-300'
                    }`}
                  >
                    {progress.phaseDescription || progress.currentPath || 'Processing Samba media hierarchy...'}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* Right Controls & Percent */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {isStalled && progress.isActive && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 mr-4"
                    >
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30 animate-pulse">
                        <Timer className="w-3 h-3" />
                        Stalled ({stallDuration}s)
                      </span>
                      
                      <button
                        onClick={() => {
                          const details = `Phase: ${progress.phase}\nStep: ${progress.currentStep}/${progress.totalSteps}\nFile: ${progress.currentPath}\nProcessed: ${progress.processedCount}/${progress.totalCount}\nBatch: ${progress.batchIndex}/${progress.totalBatches}`;
                          alert(`Current Sync Status:\n\n${details}`);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition-all border border-slate-700"
                      >
                        <AlertCircle className="w-3 h-3" />
                        Inspect
                      </button>

                      {onRetry && (
                        <button
                          onClick={onRetry}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry Batch
                        </button>
                      )}

                      {onForceSkip && (
                        <button
                          onClick={onForceSkip}
                          title="Bypass unresponsive metadata lookups and force skip batch"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold transition-all shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Force Skip
                        </button>
                      )}
                    </motion.div>
                  )}
                  <motion.span
                    key={percent}
                    initial={{ scale: 1.1, color: '#818cf8' }}
                    animate={{ scale: 1, color: '#ffffff' }}
                    transition={{ duration: 0.3 }}
                    className="text-base font-bold font-mono"
                  >
                    {percent}%
                  </motion.span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono flex items-center justify-end gap-1.5">
                  {progress.totalCount > 0 ? (
                    <span>
                      {progress.processedCount} / {progress.totalCount} files
                    </span>
                  ) : (
                    <span>Deep traversing...</span>
                  )}
                  {effectiveEta !== null && effectiveEta > 0 && progress.phase !== 'completed' && progress.phase !== 'idle' && (
                    <span className="text-cyan-400 text-[10px] font-mono hidden sm:inline">
                      (~{formatEta(effectiveEta)} left)
                    </span>
                  )}
                </div>
              </div>

              {onCancel && progress.isActive && progress.phase !== 'completed' && (
                <button
                  onClick={onCancel}
                  title="Pause / Cancel Sync"
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors border border-transparent hover:border-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {onDismiss && (!progress.isActive || progress.phase === 'completed') && (
                <button
                  onClick={onDismiss}
                  title="Dismiss"
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Phase Stepper Pills (Desktop & Tablet) */}
          <div className="hidden sm:flex items-center gap-1.5 pt-0.5">
            {PHASES_ORDER.map((phaseStep, idx) => {
              const isPast = currentPhaseIndex > idx;
              const isCurrent = currentPhaseIndex === idx;
              return (
                <div key={phaseStep.key} className="flex-1 flex items-center gap-1.5">
                  <div
                    className={`flex-1 h-1.5 rounded-full transition-all duration-500 overflow-hidden relative ${
                      isPast
                        ? 'bg-emerald-500'
                        : isCurrent
                        ? 'bg-indigo-500 shadow-sm'
                        : 'bg-slate-800/80'
                    }`}
                  >
                    {isCurrent && (
                      <motion.div
                        className="absolute inset-0 bg-white/40"
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Smooth Animated Progress Track with Framer Motion */}
          <div className="relative w-full h-3 bg-slate-950/90 rounded-full overflow-hidden border border-slate-800/80 shadow-inner p-0.5">
            <motion.div
              className={`h-full rounded-full relative overflow-hidden shadow-sm ${
                progress.phase === 'error'
                  ? 'bg-rose-500'
                  : progress.phase === 'completed'
                  ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300'
                  : progress.phase === 'scanning'
                  ? 'bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400'
                  : progress.phase === 'classifying'
                  ? 'bg-gradient-to-r from-cyan-600 via-teal-500 to-emerald-400'
                  : progress.phase === 'enriching'
                  ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400'
                  : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-400'
              }`}
              initial={false}
              animate={{
                width: `${Math.max(4, percent)}%`,
                filter: progress.isActive && progress.phase !== 'completed'
                  ? ['brightness(1)', 'brightness(1.28)', 'brightness(1)']
                  : 'brightness(1)',
              }}
              transition={{
                width: { type: 'tween', ease: 'easeInOut', duration: 0.5 },
                filter: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
              }}
            >
              {/* Standard active track light pulse */}
              {progress.isActive && progress.phase !== 'completed' && progress.phase !== 'enriching' && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}

              {/* Specialized high-intensity 'shimmer' overlay for Batch Metadata Enrichment phase */}
              {progress.phase === 'enriching' && (
                <motion.div
                  className="absolute inset-0 w-full h-full"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    backgroundSize: '200% 100%',
                  }}
                  animate={{
                    backgroundPosition: ['200% 0%', '-200% 0%'],
                  }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              )}
            </motion.div>

            {/* Completion Spark Burst Animation when a batch scan finishes */}
            <AnimatePresence>
              {showSpark && (
                <motion.div
                  key={sparkKey}
                  initial={{ opacity: 0, scale: 0.2 }}
                  animate={{ opacity: [0, 1, 0.8, 0], scale: [0.2, 1.8, 2.6] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.0, ease: 'easeOut' }}
                  style={{ left: `${Math.min(98, Math.max(4, percent))}%` }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none z-30 flex items-center justify-center"
                >
                  {/* Outer radial glow wave */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-amber-300 via-emerald-400 to-cyan-300 opacity-90 blur-md animate-ping" />
                  {/* Concentric bright flare ring */}
                  <div className="absolute w-8 h-8 rounded-full border-2 border-white bg-amber-400/60 shadow-[0_0_24px_rgba(251,191,36,0.95)]" />
                  {/* Center star spark icon */}
                  <Sparkles className="absolute w-6 h-6 text-amber-200 animate-spin fill-amber-300" />
                  {/* Cross flare beams */}
                  <motion.div
                    className="absolute w-16 h-1 bg-gradient-to-r from-transparent via-white to-transparent rounded-full shadow-sm"
                    animate={{ rotate: [0, 180], scaleX: [0.2, 2.0, 0] }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                  <motion.div
                    className="absolute h-16 w-1 bg-gradient-to-b from-transparent via-white to-transparent rounded-full shadow-sm"
                    animate={{ rotate: [0, 180], scaleY: [0.2, 2.0, 0] }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                  {/* Sparkle Text Badge Floating Up */}
                  <motion.div
                    initial={{ y: 0, opacity: 1, scale: 0.8 }}
                    animate={{ y: -24, opacity: 0, scale: 1.1 }}
                    transition={{ duration: 1.0, ease: 'easeOut' }}
                    className="absolute -top-7 px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-400/60 text-[10px] font-bold font-mono whitespace-nowrap shadow-lg flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-300 fill-amber-300" />
                    <span>Batch Spark!</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Secondary Progress Indicator: Recursive Depth & 25+ Item Audit Scan */}
          {progress.isActive && progress.auditProgress && (
            <motion.div
              id="sync-recursive-audit-indicator"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-2.5 text-xs text-slate-300 shadow-inner space-y-2"
            >
              {/* Secondary Audit Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-cyan-950/90 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                    <Compass className="w-3 h-3 text-cyan-400 animate-spin-slow" />
                    <span>Recursive Depth Audit</span>
                  </span>

                  <span className="font-mono text-xs font-semibold text-slate-200">
                    Depth Level{' '}
                    <span className="text-cyan-400 font-bold">
                      {progress.auditProgress.currentDepth || 1}
                    </span>{' '}
                    <span className="text-slate-500">/</span>{' '}
                    <span className="text-slate-400">
                      {progress.auditProgress.maxDepthLimit || 30} max
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono">
                  {progress.auditProgress.beyond25Count > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <strong>+{progress.auditProgress.beyond25Count}</strong> files beyond 25-item limit
                    </span>
                  ) : progress.auditProgress.status === 'barrier_alert' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Capped at 25 files (Increase depth limit)
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      Audited {progress.auditProgress.totalAudited || progress.processedCount} files
                    </span>
                  )}
                </div>
              </div>

              {/* Depth Visualizer Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="truncate max-w-[280px] sm:max-w-md">
                    {progress.auditProgress.currentFolder ? (
                      <>
                        Folder:{' '}
                        <span className="text-slate-200 font-semibold">
                          {progress.auditProgress.currentFolder}
                        </span>
                      </>
                    ) : (
                      'Traversing hierarchy across configured depth limit...'
                    )}
                  </span>
                  <span className="text-cyan-300 shrink-0 font-semibold">
                    {Math.min(
                      100,
                      Math.round(
                        ((progress.auditProgress.currentDepth || 1) /
                          (progress.auditProgress.maxDepthLimit || 30)) *
                          100
                      )
                    )}
                    % depth
                  </span>
                </div>

                {/* Secondary Progress Bar for Depth Level */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800 relative">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 rounded-full"
                    animate={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          6,
                          ((progress.auditProgress.currentDepth || 1) /
                            (progress.auditProgress.maxDepthLimit || 30)) *
                            100
                        )
                      )}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Chunk Progress Breakdown Section */}
          {progress.isActive && progress.totalBatches && progress.totalBatches > 1 && progress.phase !== 'completed' && (
            <motion.div
              id="sync-chunk-progress-breakdown"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-2.5 text-xs text-slate-300 shadow-inner space-y-2"
            >
              {/* Chunk Header & Metrics Row */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-950/90 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                    <Layers className="w-3 h-3 text-indigo-400" />
                    <span>Chunk Progress</span>
                  </span>
                  <span className="font-mono text-slate-200 text-xs font-semibold">
                    Batch <span className="text-indigo-400">{progress.batchIndex || 1}</span> of{' '}
                    <span className="text-slate-100">{progress.totalBatches}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                    ({Math.round(((progress.batchIndex || 1) / progress.totalBatches) * 100)}% batches processed)
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                  {progress.totalCount > 0 && (
                    <span className="text-slate-300">
                      Processing items{' '}
                      <span className="text-cyan-300 font-semibold">
                        {((progress.batchIndex || 1) - 1) * (progress.chunkSize || 50) + 1}
                      </span>{' '}
                      –{' '}
                      <span className="text-cyan-300 font-semibold">
                        {Math.min((progress.batchIndex || 1) * (progress.chunkSize || 50), progress.totalCount)}
                      </span>{' '}
                      <span className="text-slate-400">of {progress.totalCount}</span>
                    </span>
                  )}
                  {effectiveAvgMs && (
                    <span className="text-indigo-300 hidden sm:inline border-l border-slate-800 pl-3">
                      ⚡ ~{(effectiveAvgMs / 1000).toFixed(1)}s / chunk
                    </span>
                  )}
                </div>
              </div>

              {/* Segmented Chunk Pips Visualizer */}
              <div className="space-y-1">
                <div className="flex items-center gap-1 overflow-hidden w-full">
                  {Array.from({ length: Math.min(progress.totalBatches, 40) }).map((_, idx) => {
                    const batchNum = idx + 1;
                    const isCompleted = (progress.batchIndex || 1) > batchNum;
                    const isCurrent = (progress.batchIndex || 1) === batchNum;
                    return (
                      <div
                        key={idx}
                        className={`h-2 flex-1 rounded-sm transition-all duration-300 relative overflow-hidden ${
                          isCompleted
                            ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20'
                            : isCurrent
                            ? 'bg-indigo-500 ring-1 ring-indigo-400 shadow-sm shadow-indigo-500/40'
                            : 'bg-slate-800/80 border border-slate-700/40'
                        }`}
                        title={`Batch ${batchNum}/${progress.totalBatches} ${
                          isCompleted ? '(Completed)' : isCurrent ? '(Currently Processing)' : '(Pending)'
                        }`}
                      >
                        {isCurrent && (
                          <motion.div
                            className="absolute inset-0 bg-white/50"
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {progress.totalBatches > 40 && (
                  <p className="text-[10px] text-slate-400 font-mono text-right">
                    Showing 40 of {progress.totalBatches} total processing chunks
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Detailed Per-Batch & Failed File Paths Modal */}
      <AnimatePresence>
        {isDetailModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-slate-900 border border-indigo-500/40 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-xs"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-950/90 border border-indigo-500/40 text-indigo-300">
                    <Layers className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Samba Scan Breakdown & Batch Diagnostics</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono border ${currentPhaseInfo.badgeBg} ${currentPhaseInfo.color} ${currentPhaseInfo.border}`}>
                        {progress.phase}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Real-time per-batch success counts, speed metrics, and failed file paths.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Top Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950/50 border-b border-slate-800">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Total Processed</span>
                  <div className="text-base font-bold text-white font-mono">
                    {progress.processedCount} / {progress.totalCount || '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-emerald-400 uppercase font-mono">Total Success</span>
                  <div className="text-base font-bold text-emerald-300 font-mono">
                    {computedBatchStats.reduce((acc, b) => acc + (b.successCount || 0), 0)}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-rose-400 uppercase font-mono font-semibold">Failed File Paths</span>
                  <div className="text-base font-bold text-rose-300 font-mono">
                    {computedFailedPaths.length}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-cyan-400 uppercase font-mono">Avg Speed / Batch</span>
                  <div className="text-base font-bold text-cyan-300 font-mono">
                    {avgBatchDurationMs ? `${(avgBatchDurationMs / 1000).toFixed(1)}s` : '1.2s'}
                  </div>
                </div>
              </div>

              {/* Modal Tabs */}
              <div className="flex items-center gap-2 px-4 pt-3 bg-slate-900 border-b border-slate-800">
                <button
                  onClick={() => setModalTab('batches')}
                  className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
                    modalTab === 'batches'
                      ? 'border-indigo-500 text-indigo-300 bg-slate-950/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Per-Batch Success Breakdown ({computedBatchStats.length})</span>
                </button>

                <button
                  onClick={() => setModalTab('failed_paths')}
                  className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
                    modalTab === 'failed_paths'
                      ? 'border-rose-500 text-rose-300 bg-slate-950/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Failed File Paths ({computedFailedPaths.length})</span>
                </button>
              </div>

              {/* Modal Body Content */}
              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                {modalTab === 'batches' && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                            <th className="p-2.5">Batch #</th>
                            <th className="p-2.5">Total Items</th>
                            <th className="p-2.5 text-emerald-400">Success Count</th>
                            <th className="p-2.5 text-rose-400">Failed Count</th>
                            <th className="p-2.5">Duration</th>
                            <th className="p-2.5">Timestamp</th>
                            <th className="p-2.5 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-[11px] font-mono">
                          {computedBatchStats.map((batch) => (
                            <tr key={batch.batchIndex} className="hover:bg-slate-900/50 transition">
                              <td className="p-2.5 text-indigo-300 font-bold">
                                Batch #{batch.batchIndex}
                              </td>
                              <td className="p-2.5 text-slate-200">{batch.totalCount}</td>
                              <td className="p-2.5 text-emerald-400 font-semibold">{batch.successCount}</td>
                              <td className="p-2.5 text-rose-400 font-semibold">{batch.failedCount}</td>
                              <td className="p-2.5 text-slate-400">
                                {batch.durationMs ? `${(batch.durationMs / 1000).toFixed(1)}s` : '1.2s'}
                              </td>
                              <td className="p-2.5 text-slate-500">{batch.timestamp || 'Just now'}</td>
                              <td className="p-2.5 text-right">
                                {batch.status === 'completed' ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] border border-emerald-800/50">
                                    Completed
                                  </span>
                                ) : batch.status === 'processing' ? (
                                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] border border-indigo-800/50 animate-pulse">
                                    Processing...
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] border border-slate-700">
                                    Pending
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {modalTab === 'failed_paths' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={failedSearchFilter}
                          onChange={(e) => setFailedSearchFilter(e.target.value)}
                          placeholder="Filter failed file paths by path or error reason..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                      {computedFailedPaths.length > 0 && (
                        <button
                          onClick={() => {
                            const allPaths = computedFailedPaths.map((f) => f.path).join('\n');
                            navigator.clipboard.writeText(allPaths);
                            setCopiedPath('all');
                            setTimeout(() => setCopiedPath(null), 2000);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                        >
                          {copiedPath === 'all' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>Copy All Failed Paths</span>
                        </button>
                      )}
                    </div>

                    {computedFailedPaths.length === 0 ? (
                      <div className="p-8 text-center bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <h4 className="text-sm font-bold text-white">Zero Failed Files Recorded</h4>
                        <p className="text-xs text-slate-400">
                          All media files and directories in current scan batches processed cleanly without permissions or timeout errors.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {computedFailedPaths
                          .filter((item) =>
                            item.path.toLowerCase().includes(failedSearchFilter.toLowerCase()) ||
                            item.error.toLowerCase().includes(failedSearchFilter.toLowerCase())
                          )
                          .map((item, idx) => (
                            <div
                              key={idx}
                              className="p-3 bg-slate-950 border border-slate-800 hover:border-rose-500/50 rounded-xl space-y-1.5 transition"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                  <div className="text-xs font-mono font-bold text-rose-300 break-all flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    <span>{item.path}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                                    <span>Error: <strong className="text-rose-400">{item.error}</strong></span>
                                    {item.permissionDenied && (
                                      <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/50 text-[9px] font-bold">
                                        EACCES Permission Denied
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.path);
                                    setCopiedPath(item.path);
                                    setTimeout(() => setCopiedPath(null), 2000);
                                  }}
                                  className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 transition shrink-0 border border-slate-800 cursor-pointer"
                                  title="Copy file path"
                                >
                                  {copiedPath === item.path ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-900">
                                <span>Batch #{item.batchIndex || 1}</span>
                                <span>Recorded at {item.timestamp || 'Just now'}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Real-time scan diagnostic telemetry</span>
                </span>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition cursor-pointer"
                >
                  Close Diagnostic Breakdown
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
};

