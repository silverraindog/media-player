/**
 * Scan Performance Collector & Benchmark Tracker
 * Captures, persists, and analyzes performance metrics for every phase
 * during Samba share synchronization (`handleSyncSamba`).
 */

export interface ScanStepMetric {
  stepName: string;
  phaseKey: 'traversal' | 'classification' | 'metadata' | 'indexing' | 'artwork';
  timeTakenMs: number;
  percentageOfTotal: number;
  itemsProcessed: number;
  status: 'optimal' | 'warning' | 'stall_risk';
  details: string;
}

export interface FullScanPerformanceRun {
  id: string;
  timestamp: string;
  rootPath: string;
  totalDurationMs: number;
  totalFiles: number;
  totalFolders: number;
  scanMode: 'Safe Scan' | 'Full Deep Sync';
  steps: ScanStepMetric[];
  slowestStepName: string;
  slowestStepMs: number;
  bottlenecks: string[];
}

const STORAGE_KEY = 'samba_vault_scan_performance_history';
const MAX_RUNS_STORED = 20;

type PerformanceListener = (runs: FullScanPerformanceRun[]) => void;
const listeners: Set<PerformanceListener> = new Set();

/**
 * Creates default sample performance data for initial rendering
 */
export function getSamplePerformanceRuns(): FullScanPerformanceRun[] {
  return [
    {
      id: 'run-sample-1',
      timestamp: new Date(Date.now() - 3600000).toLocaleTimeString(),
      rootPath: '/Volumes/media',
      totalDurationMs: 4250,
      totalFiles: 148,
      totalFolders: 18,
      scanMode: 'Full Deep Sync',
      slowestStepName: 'Metadata Resolution',
      slowestStepMs: 2450,
      bottlenecks: ['HTTP rate-limit delay during canonical TMDB metadata lookup'],
      steps: [
        {
          stepName: 'Directory Traversal',
          phaseKey: 'traversal',
          timeTakenMs: 420,
          percentageOfTotal: 9.9,
          itemsProcessed: 166,
          status: 'optimal',
          details: 'Native performFastScan WalkDir completed recursively across depth limit 30',
        },
        {
          stepName: 'Regex Classification',
          phaseKey: 'classification',
          timeTakenMs: 85,
          percentageOfTotal: 2.0,
          itemsProcessed: 18,
          status: 'optimal',
          details: 'Folder path regex rule matching and confidence scoring',
        },
        {
          stepName: 'Metadata Resolution',
          phaseKey: 'metadata',
          timeTakenMs: 2450,
          percentageOfTotal: 57.6,
          itemsProcessed: 148,
          status: 'stall_risk',
          details: 'Batch POST /api/samba/sync-scan querying canonical series & movie titles in chunks of 50',
        },
        {
          stepName: 'Tree Indexing',
          phaseKey: 'indexing',
          timeTakenMs: 380,
          percentageOfTotal: 8.9,
          itemsProcessed: 166,
          status: 'optimal',
          details: 'Hierarchical node construction and multi-version duplicate branch detection',
        },
        {
          stepName: 'Artwork Verification',
          phaseKey: 'artwork',
          timeTakenMs: 915,
          percentageOfTotal: 21.5,
          itemsProcessed: 18,
          status: 'warning',
          details: 'Batch poster/fanart disk verification and fallback artwork creation',
        },
      ],
    },
    {
      id: 'run-sample-2',
      timestamp: new Date(Date.now() - 86400000).toLocaleTimeString(),
      rootPath: '/Volumes/media/Series',
      totalDurationMs: 1120,
      totalFiles: 82,
      totalFolders: 9,
      scanMode: 'Safe Scan',
      slowestStepName: 'Directory Traversal',
      slowestStepMs: 480,
      bottlenecks: [],
      steps: [
        {
          stepName: 'Directory Traversal',
          phaseKey: 'traversal',
          timeTakenMs: 480,
          percentageOfTotal: 42.8,
          itemsProcessed: 91,
          status: 'optimal',
          details: 'Safe scan shallow filesystem traversal (depth <= 12)',
        },
        {
          stepName: 'Regex Classification',
          phaseKey: 'classification',
          timeTakenMs: 45,
          percentageOfTotal: 4.0,
          itemsProcessed: 9,
          status: 'optimal',
          details: 'Instant regex pattern classification',
        },
        {
          stepName: 'Metadata Resolution',
          phaseKey: 'metadata',
          timeTakenMs: 180,
          percentageOfTotal: 16.1,
          itemsProcessed: 82,
          status: 'optimal',
          details: 'Safe scan local title parsing without external network API calls',
        },
        {
          stepName: 'Tree Indexing',
          phaseKey: 'indexing',
          timeTakenMs: 220,
          percentageOfTotal: 19.6,
          itemsProcessed: 91,
          status: 'optimal',
          details: 'Fast local tree construction',
        },
        {
          stepName: 'Artwork Verification',
          phaseKey: 'artwork',
          timeTakenMs: 195,
          percentageOfTotal: 17.4,
          itemsProcessed: 9,
          status: 'optimal',
          details: 'Local artwork disk presence check',
        },
      ],
    },
  ];
}

/**
 * Retrieves scan performance history from localStorage
 */
export function getScanPerformanceHistory(): FullScanPerformanceRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[ScanPerformanceCollector] Error loading history:', e);
  }
  return getSamplePerformanceRuns();
}

/**
 * Persists a new scan performance run record
 */
export function recordScanPerformanceRun(run: FullScanPerformanceRun): void {
  const history = getScanPerformanceHistory();
  const updated = [run, ...history.filter((r) => r.id !== run.id)].slice(0, MAX_RUNS_STORED);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[ScanPerformanceCollector] Error saving run:', e);
  }

  // Dispatch custom DOM event
  try {
    window.dispatchEvent(new CustomEvent('samba-performance-metrics-updated', { detail: run }));
  } catch (_) {}

  // Notify active subscribers
  listeners.forEach((listener) => {
    try {
      listener(updated);
    } catch (err) {
      console.error('[ScanPerformanceCollector] Listener error:', err);
    }
  });
}

/**
 * Subscribe to performance history updates
 */
export function subscribeScanPerformance(listener: PerformanceListener): () => void {
  listeners.add(listener);
  listener(getScanPerformanceHistory());
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Clears performance history
 */
export function clearScanPerformanceHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
  const samples = getSamplePerformanceRuns();
  listeners.forEach((l) => l(samples));
}
