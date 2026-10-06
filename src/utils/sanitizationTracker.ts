import { sanitizeSambaPath, sanitizeFilename } from './pathSanitizer';

export interface SanitizationLogEntry {
  id: string;
  timestamp: string; // ISO string
  rawPath: string;
  sanitizedPath: string;
  wasCorrected: boolean;
  dirtyState: 'dirty' | 'clean';
  dirtyReasons: string[];
  transformationsApplied: string[];
  nodeType: 'folder' | 'file';
  nodeName: string;
  source: 'Folder Traversal' | 'Quick Sanitize' | 'Global Sanitizer' | 'Manual Fix' | 'Interactive Test' | 'Sync Pipeline';
}

/**
 * Detailed analysis function that checks a path against Samba/SMB filesystem rules,
 * generates the sanitized path using sanitizeSambaPath, and details all specific
 * transformations and dirty state indicators.
 */
export function analyzePathSanitization(
  rawPath: string,
  options?: {
    nodeType?: 'folder' | 'file';
    nodeName?: string;
    source?: SanitizationLogEntry['source'];
  }
): Omit<SanitizationLogEntry, 'id' | 'timestamp'> {
  const nodeType = options?.nodeType || 'folder';
  const source = options?.source || 'Folder Traversal';
  const cleanInput = rawPath ?? '';
  const dirtyReasons: string[] = [];
  const transformationsApplied: string[] = [];

  // Check 1: Backslashes
  if (cleanInput.includes('\\')) {
    dirtyReasons.push('Contains Windows-style backslashes (\\)');
    transformationsApplied.push('Normalized backslashes (\\) to forward slashes (/)');
  }

  // Check 2: Double or multiple slashes
  if (/\/{2,}/.test(cleanInput)) {
    dirtyReasons.push('Contains redundant consecutive slashes (//)');
    transformationsApplied.push('Collapsed consecutive slashes to single forward slash (/)');
  }

  // Check 3: URL encoding
  if (/%[0-9A-Fa-f]{2}/.test(cleanInput)) {
    dirtyReasons.push('Contains URL-encoded octets (e.g. %20, %3A)');
    transformationsApplied.push('Decoded URL-encoded percent sequences into valid unicode characters');
  }

  // Segment by segment analysis
  const normalized = cleanInput.replace(/\\/g, '/');
  const rawSegments = normalized.split('/').filter(Boolean);

  let hasColon = false;
  let hasForbiddenChars = false;
  let hasControlChars = false;
  let hasLeadingTrailingWhitespaceOrDot = false;
  let hasRedundantSpacesOrHyphens = false;

  for (const seg of rawSegments) {
    if (seg.includes(':')) {
      hasColon = true;
    }
    if (/[<>"?*|]/.test(seg)) {
      hasForbiddenChars = true;
    }
    if (/[\x00-\x1F\x7F]/.test(seg)) {
      hasControlChars = true;
    }
    if (/^[.\s]+|[.\s]+$/.test(seg)) {
      hasLeadingTrailingWhitespaceOrDot = true;
    }
    if (/\s{2,}/.test(seg) || /-{2,}/.test(seg)) {
      hasRedundantSpacesOrHyphens = true;
    }
  }

  if (hasColon) {
    dirtyReasons.push('Contains colon characters (:) in path segment(s)');
    transformationsApplied.push('Replaced colons (:) with spaced hyphens (" - ")');
  }

  if (hasForbiddenChars) {
    dirtyReasons.push('Contains SMB/Windows forbidden characters (< > " ? * |)');
    transformationsApplied.push('Stripped illegal filesystem characters (< > " ? * |)');
  }

  if (hasControlChars) {
    dirtyReasons.push('Contains non-printable control characters (ASCII 0-31 / 127)');
    transformationsApplied.push('Removed non-printable control character codes');
  }

  if (hasLeadingTrailingWhitespaceOrDot) {
    dirtyReasons.push('Contains illegal leading or trailing dots/spaces in segment(s)');
    transformationsApplied.push('Stripped leading and trailing dots/whitespace from segments');
  }

  if (hasRedundantSpacesOrHyphens) {
    dirtyReasons.push('Contains repetitive consecutive whitespace or hyphens');
    transformationsApplied.push('Collapsed consecutive spaces into single space and normalized hyphens');
  }

  // Compute final sanitized path using canonical sanitizeSambaPath
  // Handle URL decoded characters if present
  let preProcessed = cleanInput;
  if (/%[0-9A-Fa-f]{2}/.test(cleanInput)) {
    try {
      preProcessed = decodeURIComponent(cleanInput);
    } catch {
      preProcessed = cleanInput.replace(/%20/g, ' ');
    }
  }

  const sanitized = sanitizeSambaPath(preProcessed);

  // Check if transformed output differs from raw input
  const wasCorrected = cleanInput !== sanitized || dirtyReasons.length > 0;
  const dirtyState: 'dirty' | 'clean' = wasCorrected ? 'dirty' : 'clean';

  if (!wasCorrected && transformationsApplied.length === 0) {
    transformationsApplied.push('Path conforms to SMB POSIX standard; no alterations required.');
  }

  const nodeName = options?.nodeName || rawSegments[rawSegments.length - 1] || cleanInput;

  return {
    rawPath: cleanInput,
    sanitizedPath: sanitized,
    wasCorrected,
    dirtyState,
    dirtyReasons,
    transformationsApplied,
    nodeType,
    nodeName,
    source,
  };
}

class SanitizationTracker {
  private history: SanitizationLogEntry[] = [];
  private listeners: Set<(logs: SanitizationLogEntry[]) => void> = new Set();
  private storageKey = 'samba_sanitization_history';
  private maxLogs = 500;

  constructor() {
    this.loadFromStorage();
    if (this.history.length === 0) {
      this.seedInitialHistory();
    }
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.history = parsed;
        }
      }
    } catch {
      this.history = [];
    }
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.history.slice(0, 300)));
    } catch {
      // Ignore quota
    }
  }

  private notify() {
    const copy = [...this.history];
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.error('SanitizationTracker listener error:', err);
      }
    });
  }

  private seedInitialHistory() {
    const seedCases: Array<{ path: string; name: string; source: SanitizationLogEntry['source'] }> = [
      {
        path: 'Movies/Sci-Fi/Alien: Romulus (2024)//Disc 1/',
        name: 'Alien: Romulus (2024)',
        source: 'Folder Traversal',
      },
      {
        path: 'TV Shows/What If... ?/Season 01',
        name: 'What If... ?',
        source: 'Folder Traversal',
      },
      {
        path: 'Documentaries/Apollo 11\\Mission Logs',
        name: 'Mission Logs',
        source: 'Folder Traversal',
      },
      {
        path: 'Music/Albums/AC%20DC/Back in Black',
        name: 'Back in Black',
        source: 'Folder Traversal',
      },
      {
        path: 'Movies/Action/The Dark Knight (2008)',
        name: 'The Dark Knight (2008)',
        source: 'Folder Traversal',
      },
    ];

    seedCases.forEach((item) => {
      const analyzed = analyzePathSanitization(item.path, {
        nodeType: 'folder',
        nodeName: item.name,
        source: item.source,
      });
      this.history.push({
        id: `san-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
        ...analyzed,
      });
    });

    this.persist();
  }

  public recordTransform(
    rawPath: string,
    options?: {
      nodeType?: 'folder' | 'file';
      nodeName?: string;
      source?: SanitizationLogEntry['source'];
    }
  ): SanitizationLogEntry {
    const analyzed = analyzePathSanitization(rawPath, options);
    const entry: SanitizationLogEntry = {
      id: `san-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...analyzed,
    };

    // Avoid exact duplicate consecutive records for the same rawPath & source
    if (this.history.length > 0 && this.history[0].rawPath === rawPath && this.history[0].source === entry.source) {
      return this.history[0];
    }

    this.history.unshift(entry);
    if (this.history.length > this.maxLogs) {
      this.history = this.history.slice(0, this.maxLogs);
    }

    this.persist();
    this.notify();
    return entry;
  }

  public getHistory(): SanitizationLogEntry[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
    this.persist();
    this.notify();
  }

  public subscribe(listener: (logs: SanitizationLogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.history]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public auditTreeNodes(nodes: any[]): SanitizationLogEntry[] {
    const recorded: SanitizationLogEntry[] = [];
    const traverse = (items: any[]) => {
      for (const item of items) {
        if (item.path) {
          const entry = this.recordTransform(item.path, {
            nodeType: item.type === 'file' ? 'file' : 'folder',
            nodeName: item.name,
            source: 'Folder Traversal',
          });
          recorded.push(entry);
        }
        if (item.children && Array.isArray(item.children)) {
          traverse(item.children);
        }
      }
    };
    traverse(nodes);
    return recorded;
  }
}

export const sanitizationTracker = new SanitizationTracker();
