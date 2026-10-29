/**
 * Web Worker based Dynamic Pre-Fetch Service for HLS Streams.
 * Pre-fetches upcoming HLS segments for high-bitrate content (>3 Mbps) in a background thread.
 * Dynamically adjusts pre-fetched segment count from 3 up to 8 based on observed network latency & jitter,
 * preventing network stalls and eliminating the 5-second buffer pause interruption.
 */

const WORKER_CODE = `
const CACHE_NAME = 'sambavault-hls-prefetch-v1';

// Rolling latency history (last 10 segment fetches)
const latencyHistory = [];
const MAX_HISTORY = 10;

function calculateNetworkJitter() {
  if (latencyHistory.length < 2) {
    return { avgLatencyMs: 50, jitterMs: 0, isHighJitter: false, recommendedCount: 3 };
  }

  const sum = latencyHistory.reduce((acc, val) => acc + val, 0);
  const avgLatencyMs = sum / latencyHistory.length;

  const varianceSum = latencyHistory.reduce((acc, val) => acc + Math.pow(val - avgLatencyMs, 2), 0);
  const jitterMs = Math.sqrt(varianceSum / latencyHistory.length);

  // High jitter interval detection: average latency > 250ms OR jitter variance > 100ms
  const isHighJitter = avgLatencyMs > 250 || jitterMs > 100;

  // Dynamic segment count adjustment:
  // Low latency & low jitter  (<150ms, jitter < 50ms) -> 3 segments
  // Moderate latency / jitter (150-250ms, jitter 50-100ms) -> 5 segments
  // High latency / high jitter (>250ms or jitter > 100ms) -> 8 segments
  let recommendedCount = 3;
  if (isHighJitter || avgLatencyMs > 300) {
    recommendedCount = 8;
  } else if (avgLatencyMs > 150 || jitterMs > 50) {
    recommendedCount = 5;
  }

  return { avgLatencyMs: Math.round(avgLatencyMs), jitterMs: Math.round(jitterMs), isHighJitter, recommendedCount };
}

self.onmessage = async (e) => {
  const { action, segmentUrls, bitrate, isHighBitrate, requestedCount } = e.data || {};

  if (action === 'cancel') {
    return;
  }

  if (action === 'prefetch' && Array.isArray(segmentUrls)) {
    // Exclusively process high-bitrate content (bitrate >= 3,000,000 bps or explicit high-bitrate flag)
    const HIGH_BITRATE_THRESHOLD = 3000000; // 3 Mbps
    const effectiveHighBitrate = isHighBitrate || (typeof bitrate === 'number' && bitrate >= HIGH_BITRATE_THRESHOLD);

    if (!effectiveHighBitrate) {
      self.postMessage({ type: 'skipped', reason: 'Bitrate below high-bitrate threshold', bitrate });
      return;
    }

    const netStats = calculateNetworkJitter();
    // Dynamic pre-fetch segment count: use higher of recommended vs requested, capped between 3 and 8
    const countToFetch = Math.min(8, Math.max(3, requestedCount || netStats.recommendedCount));
    const urlsToFetch = segmentUrls.slice(0, countToFetch);

    self.postMessage({
      type: 'started',
      urls: urlsToFetch,
      count: urlsToFetch.length,
      bitrate,
      networkStats: netStats,
    });

    try {
      const cache = await caches.open(CACHE_NAME);
      const prefetchPromises = urlsToFetch.map(async (url) => {
        const fetchStartTime = performance.now();
        try {
          // Check if already in cache
          const existing = await cache.match(url);
          if (existing) {
            return { url, status: 'hit', latencyMs: 0 };
          }

          const response = await fetch(url, {
            headers: {
              'Priority': 'u=1, i',
              'Request-Priority': 'high',
              'X-Prefetch-Worker': 'true',
            },
          });

          const elapsedMs = Math.round(performance.now() - fetchStartTime);
          latencyHistory.push(elapsedMs);
          if (latencyHistory.length > MAX_HISTORY) {
            latencyHistory.shift();
          }

          if (response.ok) {
            await cache.put(url, response.clone());
            return {
              url,
              status: 'cached',
              bytes: (await response.clone().arrayBuffer()).byteLength,
              latencyMs: elapsedMs,
            };
          }
          return { url, status: 'http_error', code: response.status, latencyMs: elapsedMs };
        } catch (fetchErr) {
          const elapsedMs = Math.round(performance.now() - fetchStartTime);
          latencyHistory.push(elapsedMs);
          if (latencyHistory.length > MAX_HISTORY) latencyHistory.shift();

          return { url, status: 'failed', error: String(fetchErr), latencyMs: elapsedMs };
        }
      });

      const results = await Promise.all(prefetchPromises);
      const updatedNetStats = calculateNetworkJitter();

      self.postMessage({
        type: 'completed',
        results,
        bitrate,
        countFetched: results.length,
        networkStats: updatedNetStats,
      });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
  }
};
`;

export interface PrefetchResult {
  url: string;
  status: 'hit' | 'cached' | 'http_error' | 'failed';
  bytes?: number;
  code?: number;
  error?: string;
  latencyMs?: number;
}

export interface NetworkJitterStats {
  avgLatencyMs: number;
  jitterMs: number;
  isHighJitter: boolean;
  recommendedCount: number;
}

export class HlsPrefetchWorkerService {
  private worker: Worker | null = null;
  private isSupported = false;
  private activePrefetchedUrls = new Set<string>();
  private currentNetworkStats: NetworkJitterStats = {
    avgLatencyMs: 50,
    jitterMs: 0,
    isHighJitter: false,
    recommendedCount: 3,
  };

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || !window.Worker) {
      console.warn('[HlsPrefetchWorker] Web Workers not supported in this environment.');
      return;
    }

    try {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);
      this.isSupported = true;

      this.worker.onmessage = (e) => {
        const { type, results, urls, bitrate, networkStats, count, error } = e.data || {};

        if (networkStats) {
          this.currentNetworkStats = networkStats;
        }

        if (type === 'started') {
          console.log(
            `[HlsPrefetchWorker] 🚀 Pre-fetching ${count || urls?.length} high-bitrate HLS segments (Bitrate: ${
              bitrate ? Math.round(bitrate / 1000) + ' kbps' : 'High'
            } | Avg Latency: ${this.currentNetworkStats.avgLatencyMs}ms | Jitter: ${
              this.currentNetworkStats.jitterMs
            }ms | High-Jitter: ${this.currentNetworkStats.isHighJitter ? 'YES (scaled to 8 segments)' : 'NO (3 segments)'})...`
          );
        } else if (type === 'completed') {
          if (Array.isArray(results)) {
            results.forEach((r: PrefetchResult) => {
              if (r.status === 'cached' || r.status === 'hit') {
                this.activePrefetchedUrls.add(r.url);
              }
            });
          }
          console.log(
            `[HlsPrefetchWorker] ✅ Pre-fetch batch complete (${results?.length} segments). Current recommended buffer count: ${this.currentNetworkStats.recommendedCount}`,
            results
          );
        } else if (type === 'error') {
          console.warn('[HlsPrefetchWorker] Worker error during prefetch:', error);
        }
      };

      console.log('[HlsPrefetchWorker] Web Worker pre-fetch service initialized with dynamic jitter scaling (3-8 segments).');
    } catch (err) {
      console.warn('[HlsPrefetchWorker] Failed to create worker:', err);
    }
  }

  /**
   * Returns current dynamic pre-fetch segment count based on observed network jitter & latency.
   */
  public getDynamicPreFetchCount(): number {
    return this.currentNetworkStats.recommendedCount || 3;
  }

  /**
   * Returns current network stats (latency, jitter, high-jitter status).
   */
  public getNetworkJitterStats(): NetworkJitterStats {
    return { ...this.currentNetworkStats };
  }

  /**
   * Pre-fetches upcoming HLS segments for high-bitrate content.
   * Dynamically adjusts fetch slice between 3 and 8 segments based on network latency & jitter.
   * @param segmentUrls Array of upcoming segment URLs (up to 8)
   * @param bitrate Current stream bitrate in bps (threshold >= 3,000,000)
   * @param isHighBitrate Explicit boolean override flag
   */
  public prefetchNextSegments(segmentUrls: string[], bitrate?: number, isHighBitrate = false) {
    if (!this.worker || segmentUrls.length === 0) return;

    const dynamicTarget = this.getDynamicPreFetchCount();

    // Filter out URLs already pre-fetched
    const uncollectedUrls = segmentUrls.filter((u) => !this.activePrefetchedUrls.has(u)).slice(0, dynamicTarget);
    if (uncollectedUrls.length === 0) return;

    this.worker.postMessage({
      action: 'prefetch',
      segmentUrls: uncollectedUrls,
      bitrate: bitrate || 0,
      isHighBitrate,
      requestedCount: dynamicTarget,
    });
  }

  /**
   * Purges old segment URLs from the tracking set and browser CacheStorage.
   */
  public clearPrefetchCache() {
    this.activePrefetchedUrls.clear();
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.delete('sambavault-hls-prefetch-v1').catch(() => {});
    }
  }

  public destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export const hlsPrefetchWorkerService = new HlsPrefetchWorkerService();
