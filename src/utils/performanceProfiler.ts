import type { ProfilerOnRenderCallback } from 'react';
import { logger } from './loggerService';

export const MAIN_THREAD_FRAME_BUDGET_MS = 16;
const RAF_FRAME_BUDGET_MS = 16.7;
const MAX_SLOW_TASK_RECORDS = 120;

export type SlowTaskSource =
  | 'sync-task'
  | 'navigation'
  | 'react-commit'
  | 'raf-frame-drop'
  | 'longtask-observer'
  | 'long-animation-frame';

export interface SlowTaskRecord {
  id: string;
  timestamp: string;
  scope: string;
  taskName: string;
  source: SlowTaskSource;
  durationMs: number;
  thresholdMs: number;
  phase?: 'mount' | 'update' | 'nested-update' | string;
  metadata?: Record<string, unknown>;
}

interface ProfilerGlobalHandle {
  getSlowTasks: () => SlowTaskRecord[];
  clearSlowTasks: () => void;
  getThresholdMs: () => number;
}

declare global {
  interface Window {
    __SAMBAVAULT_PERF_PROFILER__?: ProfilerGlobalHandle;
  }
}

class MainThreadPerformanceProfiler {
  private records: SlowTaskRecord[] = [];
  public recordSlowTask(
    entry: Omit<SlowTaskRecord, 'id' | 'timestamp' | 'thresholdMs'> & { thresholdMs?: number }
  ): SlowTaskRecord | null {
    const thresholdMs = entry.thresholdMs ?? MAIN_THREAD_FRAME_BUDGET_MS;
    if (!Number.isFinite(entry.durationMs) || entry.durationMs <= thresholdMs) {
      return null;
    }

    const roundedDuration = Number(entry.durationMs.toFixed(2));
    const record: SlowTaskRecord = {
      id: `perf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      scope: entry.scope,
      taskName: entry.taskName,
      source: entry.source,
      durationMs: roundedDuration,
      thresholdMs,
      ...entry,
      durationMs: roundedDuration,
    };

    this.records = [record, ...this.records].slice(0, MAX_SLOW_TASK_RECORDS);

    const summary = `[PerfProfiler][${thresholdMs}ms] ${record.scope} :: ${record.taskName} (${record.source}) took ${roundedDuration}ms`;
    console.warn(summary, record.metadata || '');
    logger.warn(summary, 'System', {
      durationMs: roundedDuration,
      thresholdMs,
      source: record.source,
      phase: record.phase,
      ...record.metadata,
    });

    return record;
  }

  public traceNavigation(
    scope: string,
    action: string,
    metadata?: Record<string, unknown>
  ): { endSync: () => number } {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const markStart = `sv_nav_${action}_start_${start}`;

    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      try {
        performance.mark(markStart);
      } catch {}
    }

    let endedSync = false;

    // Also measure total time until the browser finishes layout & paint on the next frame
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        const frameEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const frameDurationMs = frameEnd - start;
        if (frameDurationMs > MAIN_THREAD_FRAME_BUDGET_MS) {
          this.recordSlowTask({
            scope,
            taskName: `${action} (frame commit)`,
            source: 'navigation',
            durationMs: frameDurationMs,
            metadata,
          });
          if (typeof performance !== 'undefined' && typeof performance.clearMarks === 'function') {
            try {
              performance.clearMarks(markStart);
            } catch {}
          }
        }
      });
    }

    return {
      endSync: () => {
        if (endedSync) return 0;
        endedSync = true;
        const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const syncDurationMs = end - start;
        if (syncDurationMs > MAIN_THREAD_FRAME_BUDGET_MS) {
          this.recordSlowTask({
            scope,
            taskName: `${action} (sync dispatch)`,
            source: 'navigation',
            durationMs: syncDurationMs,
            metadata,
          });
        }
        return syncDurationMs;
      },
    };
  }

  public createReactProfilerCallback(scope: string): ProfilerOnRenderCallback {
    return (id, phase, actualDuration, baseDuration) => {
      if (typeof actualDuration !== 'number' || !Number.isFinite(actualDuration)) {
        return;
      }
      if (actualDuration > MAIN_THREAD_FRAME_BUDGET_MS) {
        this.recordSlowTask({
          scope,
          taskName: `${id} (${phase})`,
          source: 'react-commit',
          phase,
          durationMs: actualDuration,
          metadata: {
            baseDurationMs: Number(baseDuration.toFixed(2)),
          },
        });
      }
    };
  }

  public profileSyncTask<T>(
    scope: string,
    taskName: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      return fn();
    } finally {
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const durationMs = end - start;
      if (durationMs > MAIN_THREAD_FRAME_BUDGET_MS) {
        this.recordSlowTask({
          scope,
          taskName,
          source: 'sync-task',
          durationMs,
          metadata: metadata || {},
        });
      }
    }
  }

  public startObservers(): void {
    const threshold = MAIN_THREAD_FRAME_BUDGET_MS;

    // Setup PerformanceObserver for long tasks
    if (typeof performance !== 'undefined') {
      this.perfObserver = new PerformanceObserver((entry) => {
        if (entry.type === 'longtask') {
          this.recordSlowTask({
            scope: window.__SAMBAVAULT_PERF_PROFILER__?.activeScope || 'global',
            taskName: 'Long task completed',
            source: 'longtask-observer',
            durationMs: entry.duration,
            metadata: {
              entries: Array.from(entry.entries).map((e) => ({
                name: e.name,
                duration: e.duration,
                start: e.startTime,
              })),
            },
          });
        }
      });
    }

    // Setup long animation frame observer
    if (typeof performance !== 'undefined') {
      this.loaObserver = new PerformanceObserver((entry) => {
        if (entry.type === 'longanimationframe') {
          this.recordSlowTask({
            scope: window.__SAMBAVAULT_PERF_PROFILER__?.activeScope || 'global',
            taskName: 'Long animation frame completed',
            source: 'long-animation-frame',
            durationMs: entry.duration,
            metadata: {},
          });
        }
      });
    }
  }

  public stopObservers(): void {
    if (this.perfObserver) {
      this.perfObserver.disconnect();
      this.perfObserver = null;
    }
    if (this.loaObserver) {
      this.loaObserver.disconnect();
      this.loaObserver = null;
    }
  }

  public dispose(): void {
    this.stopScopeMonitor('App');
    this.stopRafMonitor();
    this.stopObservers();
  }

  private activeScopes = new Set<string>();
  private rafId: number | null = null;
  private lastRafTime: number | null = null;
  private perfObserver: PerformanceObserver | null = null;
  private loaObserver: PerformanceObserver | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.__SAMBAVAULT_PERF_PROFILER__ = {
        getSlowTasks: () => this.getSlowTasks(),
        clearSlowTasks: () => this.clearSlowTasks(),
        getThresholdMs: () => MAIN_THREAD_FRAME_BUDGET_MS,
      };
    }
  }

  public getSlowTasks(): SlowTaskRecord[] {
    return [...this.records];
  }

  public clearSlowTasks(): void {
    this.records = [];
  }
}
