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
  // Ratio and classifier effectiveness evaluation fields
  mediaDiscovered?: number;
  newMediaDiscovered?: number;
  depthLimit?: number;
  maxDepthReached?: number;
  classifierRuleHits?: number;
  discoveryRatio?: number; // (newMediaDiscovered / totalFiles) * 100
}

const STORAGE_KEY = 'samba_vault_scan_performance_history';
const MAX_RUNS_STORED = 20;

type PerformanceListener = (runs: FullScanPerformanceRun[]) => void;
const listeners: Set<PerformanceListener> = new Set();

/**
 * Creates default sample performance data for initial rendering
 */
export function getSamplePerformanceRuns(): FullScanPerformanceRun[] {
  const now = Date.now();
  return [
    {
      id: 'run-sample-5',
      timestamp: new Date(now - 1800000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rootPath: '/Volumes/media',
      totalDurationMs: 1420,
      totalFiles: 148,
      totalFolders: 18,
      scanMode: 'Full Deep Sync',
      slowestStepName: 'Tree Indexing',
      slowestStepMs: 420,
      bottlenecks: [],
      mediaDiscovered: 122,
      newMediaDiscovered: 122,
      depthLimit: 6,
      maxDepthReached: 6,
      classifierRuleHits: 48,
      discoveryRatio: 82.4,
      steps: [
        {
          stepName: 'Directory Traversal',
          phaseKey: 'traversal',
          timeTakenMs: 210,
          percentageOfTotal: 14.8,
          itemsProcessed: 148,
          status: 'optimal',
          details: 'Optimal shallow recursion (depth: 6) via focused classifier directory rules',
        },
        {
          stepName: 'Regex Classification',
          phaseKey: 'classification',
          timeTakenMs: 65,
          percentageOfTotal: 4.6,
          itemsProcessed: 18,
          status: 'optimal',
          details: 'High-specificity regex match: Movie and TV directory branches resolved',
        },
        {
          stepName: 'Metadata Resolution',
          phaseKey: 'metadata',
          timeTakenMs: 510,
          percentageOfTotal: 35.9,
          itemsProcessed: 122,
          status: 'optimal',
          details: 'Cached metadata resolution with 98% hit rate',
        },
        {
          stepName: 'Tree Indexing',
          phaseKey: 'indexing',
          timeTakenMs: 420,
          percentageOfTotal: 29.6,
          itemsProcessed: 122,
          status: 'optimal',
          details: '122 canonical media items mapped into hierarchy with 0 orphans',
        },
        {
          stepName: 'Artwork Verification',
          phaseKey: 'artwork',
          timeTakenMs: 215,
          percentageOfTotal: 15.1,
          itemsProcessed: 18,
          status: 'optimal',
          details: 'Artwork cache verified',
        },
      ],
    },
    {
      id: 'run-sample-4',
      timestamp: new Date(now - 7200000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rootPath: '/Volumes/media',
      totalDurationMs: 2100,
      totalFiles: 195,
      totalFolders: 22,
      scanMode: 'Full Deep Sync',
      slowestStepName: 'Metadata Resolution',
      slowestStepMs: 820,
      bottlenecks: [],
      mediaDiscovered: 114,
      newMediaDiscovered: 114,
      depthLimit: 8,
      maxDepthReached: 8,
      classifierRuleHits: 36,
      discoveryRatio: 58.5,
      steps: [
        {
          stepName: 'Directory Traversal',
          phaseKey: 'traversal',
          timeTakenMs: 340,
          percentageOfTotal: 16.2,
          itemsProcessed: 195,
          status: 'optimal',
          details: 'Bounded tree walk across depth limit 8',
        },
        {
          stepName: 'Regex Classification',
          phaseKey: 'classification',
          timeTakenMs: 70,
          percentageOfTotal: 3.3,
          itemsProcessed: 22,
          status: 'optimal',
          details: 'Standard TV/Movie regex classifier rule hits',
        },
        {
          stepName: 'Metadata Resolution',
          phaseKey: 'metadata',
          timeTakenMs: 820,
          percentageOfTotal: 39.0,
          itemsProcessed: 114,
          status: 'optimal',
          details: 'Metadata enriched for 114 media files',
        },
        {
          stepName: 'Tree Indexing',
          phaseKey: 'indexing',
          timeTakenMs: 490,
          percentageOfTotal: 23.3,
          itemsProcessed: 114,
          status: 'optimal',
          details: '114 media nodes indexed into category tree',
        },
        {
          stepName: 'Artwork Verification',
          phaseKey: 'artwork',
          timeTakenMs: 380,
          percentageOfTotal: 18.1,
          itemsProcessed: 22,
          status: 'optimal',
          details: 'Artwork posters verified',
        },
      ],
    },
    {
      id: 'run-sample-3',
      timestamp: new Date(now - 28800000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rootPath: '/Volumes/media/Series',
      totalDurationMs: 1680,
      totalFiles: 240,
      totalFolders: 26,
      scanMode: 'Safe Scan',
      slowestStepName: 'Directory Traversal',
      slowestStepMs: 620,
      bottlenecks: [],
      mediaDiscovered: 98,
      newMediaDiscovered: 98,
      depthLimit: 12,
      maxDepthReached: 11,
      classifierRuleHits: 28,
      discoveryRatio: 40.8,
      steps: [
        {
          stepName: 'Directory Traversal',
          phaseKey: 'traversal',
          timeTakenMs: 620,
          percentageOfTotal: 36.9,
          itemsProcessed: 240,
          status: 'optimal',
          details: 'Safe scan shallow filesystem traversal (depth <= 12)',
        },
        {
          stepName: 'Regex Classification',
          phaseKey: 'classification',
          timeTakenMs: 85,
          percentageOfTotal: 5.1,
          itemsProcessed: 26,
          status: 'optimal',
          details: 'Classifier rule matching on Series folder structure',
        },
        {
          stepName: 'Metadata Resolution',
          phaseKey: 'metadata',
          timeTakenMs: 410,
          percentageOfTotal: 24.4,
          itemsProcessed: 98,
          status: 'optimal',
          details: 'Safe scan local title parsing without network calls',
        },
        {
          stepName: 'Tree Indexing',
          phaseKey: 'indexing',
          timeTakenMs: 310,
          percentageOfTotal: 18.5,
          itemsProcessed: 98,
          status: 'optimal',
          details: '98 episodes indexed',
        },
        {
          stepName: 'Artwork Verification',
          phaseKey: 'artwork',
          timeTakenMs: 255,
          percentageOfTotal: 15.2,
          itemsProcessed: 26,
          status: 'optimal',
          details: 'Local thumbnail check',
        },
      ],
    },
    {
      id: 'run-sample-2',
      timestamp: new Date(now - 86400000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rootPath: '/Volumes/media',
      totalDurationMs: 3820,
      totalFiles: 365,
      totalFolders: 38,
      scanMode: 'Full Deep Sync',
      slowestStepName: 'Directory Traversal',
      slowestStepMs: 1450,
      bottlenecks: ['Extended traversal into nested .DS_Store and subtitle cache dirs'],
      mediaDiscovered: 88,
      newMediaDiscovered: 88,
      depthLimit: 18,
      maxDepthReached: 17,
      classifierRuleHits: 20,
      discoveryRatio: 24.1,
      steps: [
        {
          stepName: 'Directory Traversal',
          phaseKey: 'traversal',
          timeTakenMs: 1450,
          percentageOfTotal: 38.0,
          itemsProcessed: 365,
          status: 'warning',
          details: 'Traversed deeply into ancillary folders before encountering media',
        },
        {
          stepName: 'Regex Classification',
          phaseKey: 'classification',
          timeTakenMs: 110,
          percentageOfTotal: 2.9,
          itemsProcessed: 38,
          status: 'optimal',
          details: 'Rule evaluation with multiple non-media directory passes',
        },
        {
          stepName: 'Metadata Resolution',
          phaseKey: 'metadata',
          timeTakenMs: 1200,
          percentageOfTotal: 31.4,
          itemsProcessed: 88,
          status: 'optimal',
          details: 'Resolving 88 video files against canonical media database',
        },
        {
          stepName: 'Tree Indexing',
          phaseKey: 'indexing',
          timeTakenMs: 560,
          percentageOfTotal: 14.7,
          itemsProcessed: 88,
          status: 'optimal',
          details: 'Tree node creation',
        },
        {
          stepName: 'Artwork Verification',
          phaseKey: 'artwork',
          timeTakenMs: 500,
          percentageOfTotal: 13.1,
          itemsProcessed: 38,
          status: 'optimal',
          details: 'Poster checks',
        },
      ],
    },
    {
      id: 'run-sample-1',
      timestamp: new Date(now - 172800000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rootPath: '/Volumes/media',
      totalDurationMs: 5120,
      totalFiles: 520,
      totalFolders: 48,
      scanMode: 'Full Deep Sync',
      slowestStepName: 'Metadata Resolution',
      slowestStepMs: 2450,
      bottlenecks: ['Unbounded depth 30 traversed build artifacts and hidden OS folders'],
      mediaDiscovered: 68,
      newMediaDiscovered: 68,
      depthLimit: 30,
      maxDepthReached: 26,
      classifierRuleHits: 12,
      discoveryRatio: 13.1,
      steps: [
        {
          stepName: 'Directory Traversal',
          phaseKey: 'traversal',
          timeTakenMs: 1820,
          percentageOfTotal: 35.5,
          itemsProcessed: 520,
          status: 'warning',
          details: 'Deep recursion depth limit 30 scanned 520 files with high noise ratio',
        },
        {
          stepName: 'Regex Classification',
          phaseKey: 'classification',
          timeTakenMs: 140,
          percentageOfTotal: 2.7,
          itemsProcessed: 48,
          status: 'optimal',
          details: 'Default baseline classification rules',
        },
        {
          stepName: 'Metadata Resolution',
          phaseKey: 'metadata',
          timeTakenMs: 2450,
          percentageOfTotal: 47.9,
          itemsProcessed: 68,
          status: 'stall_risk',
          details: 'HTTP rate-limit delay during initial batch sync',
        },
        {
          stepName: 'Tree Indexing',
          phaseKey: 'indexing',
          timeTakenMs: 380,
          percentageOfTotal: 7.4,
          itemsProcessed: 68,
          status: 'optimal',
          details: '68 media items isolated out of 520 traversed files',
        },
        {
          stepName: 'Artwork Verification',
          phaseKey: 'artwork',
          timeTakenMs: 330,
          percentageOfTotal: 6.4,
          itemsProcessed: 48,
          status: 'optimal',
          details: 'Initial thumbnail download',
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
