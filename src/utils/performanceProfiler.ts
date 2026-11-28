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
      thresholdMs,
      ...entry,
      durationMs: roundedDuration,
    };

    this.records = [record, ...this.records].slice(0, MAX_SLOW_TASK_RECORDS);

    const summary = `[PerfProfiler][>${thresholdMs}ms] ${record.scope} :: ${record.taskName} (${record.source}) took ${roundedDuration}ms`;
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
          metadata,
        });
      }
    }
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
        }
        if (typeof performance !== 'undefined' && typeof performance.clearMarks === 'function') {
          try {
            performance.clearMarks(markStart);
          } catch {}
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

  public startScopeMonitor(scope: string): () => void {
    this.activeScopes.add(scope);
    if (this.activeScopes.size === 1) {
      this.startObservers();
      this.startRafMonitor();
    }
    return () => {
      this.stopScopeMonitor(scope);
    };
  }

  public stopScopeMonitor(scope: string): void {
    this.activeScopes.delete(scope);
    if (this.activeScopes.size === 0) {
      this.stopObservers();
      this.stopRafMonitor();
    }
  }

  private getCurrentScopeLabel(): string {
    if (this.activeScopes.size === 0) return 'App';
    return Array.from(this.activeScopes).join(',');
  }

  private startRafMonitor(): void {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
    if (this.rafId !== null) return;

    this.lastRafTime = performance.now();
    const tick = (now: number) => {
      if (this.activeScopes.size === 0) {
        this.rafId = null;
        this.lastRafTime = null;
        return;
      }

      const prev = this.lastRafTime;
      this.lastRafTime = now;

      if (
        prev !== null &&
        (typeof document === 'undefined' || document.visibilityState === 'visible')
      ) {
        const deltaMs = now - prev;
        // Ignore multi-second jumps caused by tab suspension / window minimization
        if (deltaMs > RAF_FRAME_BUDGET_MS && deltaMs < 2000) {
          this.recordSlowTask({
            scope: this.getCurrentScopeLabel(),
            taskName: 'Main-thread frame budget exceeded',
            source: 'raf-frame-drop',
            durationMs: deltaMs,
            metadata: {
              droppedFramesApprox: Math.max(1, Math.floor(deltaMs / MAIN_THREAD_FRAME_BUDGET_MS) - 1),
            },
          });
        }
      }

      this.rafId = window.requestAnimationFrame(tick);
    };

    this.rafId = window.requestAnimationFrame(tick);
  }

  private stopRafMonitor(): void {
    if (this.rafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastRafTime = null;
  }

  private startObservers(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    const supported = Array.isArray(PerformanceObserver.supportedEntryTypes)
      ? PerformanceObserver.supportedEntryTypes
      : [];

    if (!this.perfObserver && supported.includes('longtask')) {
      try {
        this.perfObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > MAIN_THREAD_FRAME_BUDGET_MS) {
              this.recordSlowTask({
                scope: this.getCurrentScopeLabel(),
                taskName: entry.name || 'longtask',
                source: 'longtask-observer',
                durationMs: entry.duration,
              });
            }
          }
        });
        this.perfObserver.observe({ entryTypes: ['longtask'] });
      } catch {
        this.perfObserver = null;
      }
    }

    if (!this.loaObserver && supported.includes('long-animation-frame')) {
      try {
        this.loaObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > MAIN_THREAD_FRAME_BUDGET_MS) {
              this.recordSlowTask({
                scope: this.getCurrentScopeLabel(),
                taskName: entry.name || 'long-animation-frame',
                source: 'long-animation-frame',
                durationMs: entry.duration,
              });
            }
          }
        });
        this.loaObserver.observe({ entryTypes: ['long-animation-frame'] });
      } catch {
        this.loaObserver = null;
      }
    }
  }

  private stopObservers(): void {
    try {
      this.perfObserver?.disconnect();
    } catch {}
    this.perfObserver = null;
    try {
      this.loaObserver?.disconnect();
    } catch {}
    this.loaObserver = null;
  }
}

export const mainThreadProfiler = new MainThreadPerformanceProfiler();
