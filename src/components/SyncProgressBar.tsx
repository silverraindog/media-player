import React from 'react';
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
}

interface SyncProgressBarProps {
  progress: SyncProgressState;
  onCancel?: () => void;
  onDismiss?: () => void;
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
  className = '',
}) => {
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
                <div className="text-[11px] text-slate-400 font-mono">
                  {progress.totalCount > 0 ? (
                    <span>
                      {progress.processedCount} / {progress.totalCount} files
                    </span>
                  ) : (
                    <span>Deep traversing...</span>
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
          <div className="relative w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 shadow-inner">
            <motion.div
              className={`h-full rounded-full relative ${
                progress.phase === 'error'
                  ? 'bg-rose-500'
                  : progress.phase === 'completed'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-400'
              }`}
              initial={false}
              animate={{ width: `${Math.max(3, percent)}%` }}
              transition={{
                duration: 0.6,
                ease: [0.16, 1, 0.3, 1], // Smooth custom cubic-bezier
              }}
            >
              {/* Shimmer / light pulse effect on active track */}
              {progress.isActive && progress.phase !== 'completed' && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

