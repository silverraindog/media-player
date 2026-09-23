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
} from 'lucide-react';

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
  errorMessage?: string;
  retryCount?: number;
  maxRetries?: number;
  retryDelayRemaining?: number;
  phaseDescription?: string;
  etaSeconds?: number | null;
  averageBatchTimeMs?: number;
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
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={`bg-slate-900/95 border-b border-indigo-500/30 px-4 py-3 shadow-2xl backdrop-blur-md relative overflow-hidden ${className}`}
      >
        {/* Subtle background glow effect during active sync */}
        {progress.isActive && progress.phase !== 'completed' && (
          <motion.div
            className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
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
                className={`p-1.5 rounded-lg ${currentPhaseInfo.badgeBg} border ${currentPhaseInfo.border} flex items-center justify-center shrink-0 shadow-sm`}
              >
                {progress.phase === 'enriching' ? (
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
                      className={`font-semibold tracking-wide uppercase text-[11px] ${currentPhaseInfo.color}`}
                    >
                      {currentPhaseInfo.label}
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

                  {/* Dynamic ETA badge based on average batch processing time */}
                  {effectiveEta !== null && effectiveEta > 0 && progress.phase !== 'completed' && progress.phase !== 'idle' && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="px-2 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-500/60 text-cyan-300 text-[10px] font-mono flex items-center gap-1.5 shadow-sm"
                      title={
                        effectiveAvgMs
                          ? `Estimated time remaining based on ~${(effectiveAvgMs / 1000).toFixed(1)}s/batch average`
                          : 'Estimated time remaining based on previous batches'
                      }
                    >
                      <Clock className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
                      <span>ETA: ~{formatEta(effectiveEta)}</span>
                      {effectiveAvgMs && (
                        <span className="text-cyan-500/80 text-[9px] hidden lg:inline">
                          ({(effectiveAvgMs / 1000).toFixed(1)}s/batch)
                        </span>
                      )}
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
                    className="text-slate-300 font-mono text-xs truncate max-w-md md:max-w-2xl"
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
              }}
              transition={{
                type: 'spring',
                stiffness: 120,
                damping: 20,
                mass: 0.6,
                restDelta: 0.001,
              }}
            >
              {/* Shimmer / light pulse effect on active track */}
              {progress.isActive && progress.phase !== 'completed' && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

