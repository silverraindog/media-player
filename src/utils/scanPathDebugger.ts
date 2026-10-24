import { sanitizeSambaPath } from './pathSanitizer';

export interface ScanDiscoveredPathRecord {
  id: string;
  source: 'performFastScan' | 'scanSambaVolume' | 'serverApiScanVolume' | 'prevalidate' | 'handleSyncSamba';
  rawPath: string; // The exact raw path string as received from the scanner
  resolvedAbsolutePath: string; // The absolute path on the host system
  sanitizedRelativePath: string; // Standardized sanitized path
  isDir: boolean;
  sizeStr?: string;
  timestamp: string; // Localized time string
  hasAnomaly: boolean;
  anomalyReasons: string[];
}

export function detectPathAnomalies(
  rawPath: string,
  resolvedPath: string
): { hasAnomaly: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const raw = rawPath || '';

  // 1. Check for UNC network prefix
  if (raw.startsWith('//') || raw.startsWith('smb://') || raw.startsWith('\\\\')) {
    reasons.push('Raw UNC Network Protocol Prefix (e.g. //192.168.x.x/share)');
  }

  // 2. Check for unbalanced / unclosed parenthesis e.g. "(2016" without ")"
  const openParens = (raw.match(/\(/g) || []).length;
  const closeParens = (raw.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    reasons.push(`Unbalanced Parentheses (${openParens} open vs ${closeParens} close, e.g. '(2016')`);
  }

  const openBrackets = (raw.match(/\[/g) || []).length;
  const closeBrackets = (raw.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    reasons.push(`Unbalanced Square Brackets (${openBrackets} open vs ${closeBrackets} close)`);
  }

  // 3. Check for forbidden characters (< > " ? * | :) in non-protocol segments
  const cleanForCharCheck = raw.replace(/^https?:\/\//, '').replace(/^smb:\/\//, '');
  if (/[<>"?*|]/.test(cleanForCharCheck)) {
    reasons.push('Contains Forbidden Filesystem Characters (< > " ? * |)');
  }
  // Check for colon outside of Windows drive letter e.g. "C:\"
  const colonCheck = cleanForCharCheck.replace(/^[a-zA-Z]:/, '');
  if (colonCheck.includes(':')) {
    reasons.push('Contains Colon (:) Outside Drive Letter');
  }

  // 4. Check for consecutive redundant slashes (excluding valid protocol)
  if (/\/{2,}/.test(cleanForCharCheck.replace(/^\/\//, ''))) {
    reasons.push('Contains Redundant Consecutive Slashes (//)');
  }

  // 5. Check for null bytes or control characters
  if (/[\x00-\x1F\x7F]/.test(raw)) {
    reasons.push('Contains Non-Printable ASCII Control Characters');
  }

  // 6. Check for leading/trailing dots or spaces in path segments
  const segments = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  for (const seg of segments) {
    if (/^[.\s]+|[.\s]+$/.test(seg) && seg !== '.' && seg !== '..') {
      reasons.push(`Segment "${seg}" has Illegal Leading/Trailing Dots or Spaces`);
      break;
    }
  }

  return {
    hasAnomaly: reasons.length > 0,
    reasons,
  };
}

const STORAGE_KEY = 'samba_vault_scan_debug_history';
let inMemoryHistory: ScanDiscoveredPathRecord[] = (() => {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
})();

const listeners = new Set<(history: ScanDiscoveredPathRecord[]) => void>();

function notifyListeners() {
  const snapshot = [...inMemoryHistory];
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (_) {}
  });
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryHistory.slice(0, 150)));
    } catch (_) {}
  }
}

export function recordScanDiscoveredPath(item: {
  source: ScanDiscoveredPathRecord['source'];
  rawPath: string;
  resolvedAbsolutePath: string;
  sanitizedRelativePath?: string;
  isDir?: boolean;
  sizeStr?: string;
}): ScanDiscoveredPathRecord {
  const { hasAnomaly, reasons } = detectPathAnomalies(item.rawPath, item.resolvedAbsolutePath);
  const sanitized = item.sanitizedRelativePath || sanitizeSambaPath(item.rawPath);

  const record: ScanDiscoveredPathRecord = {
    id: `scan-dbg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    source: item.source,
    rawPath: item.rawPath,
    resolvedAbsolutePath: item.resolvedAbsolutePath,
    sanitizedRelativePath: sanitized,
    isDir: Boolean(item.isDir),
    sizeStr: item.sizeStr,
    timestamp: new Date().toLocaleTimeString(),
    hasAnomaly,
    anomalyReasons: reasons,
  };

  inMemoryHistory.unshift(record);
  if (inMemoryHistory.length > 500) {
    inMemoryHistory = inMemoryHistory.slice(0, 500);
  }

  notifyListeners();
  return record;
}

export function recordScanBatchDiscovered(
  items: Array<{
    source: ScanDiscoveredPathRecord['source'];
    rawPath: string;
    resolvedAbsolutePath: string;
    sanitizedRelativePath?: string;
    isDir?: boolean;
    sizeStr?: string;
  }>
) {
  if (!items || items.length === 0) return;

  const now = new Date().toLocaleTimeString();
  const newRecords: ScanDiscoveredPathRecord[] = items.map((item, idx) => {
    const { hasAnomaly, reasons } = detectPathAnomalies(item.rawPath, item.resolvedAbsolutePath);
    const sanitized = item.sanitizedRelativePath || sanitizeSambaPath(item.rawPath);

    return {
      id: `scan-dbg-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      source: item.source,
      rawPath: item.rawPath,
      resolvedAbsolutePath: item.resolvedAbsolutePath,
      sanitizedRelativePath: sanitized,
      isDir: Boolean(item.isDir),
      sizeStr: item.sizeStr,
      timestamp: now,
      hasAnomaly,
      anomalyReasons: reasons,
    };
  });

  inMemoryHistory.unshift(...newRecords);
  if (inMemoryHistory.length > 500) {
    inMemoryHistory = inMemoryHistory.slice(0, 500);
  }

  notifyListeners();
}

export function getScanDebugHistory(): ScanDiscoveredPathRecord[] {
  return [...inMemoryHistory];
}

export function clearScanDebugHistory() {
  inMemoryHistory = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
  notifyListeners();
}

export function subscribeScanDebug(
  listener: (history: ScanDiscoveredPathRecord[]) => void
): () => void {
  listeners.add(listener);
  listener([...inMemoryHistory]);
  return () => {
    listeners.delete(listener);
  };
}
