export interface PathDebugLogEntry {
  id: string;
  timestamp: string;
  eventType: 'scan_node' | 'resolve_path' | 'sanitize_path' | 'error' | 'sync_share';
  rawPath: string;
  resolvedPath: string;
  sanitizedPath: string;
  isDirty: boolean;
  dirtyReason?: string;
  nodeName: string;
  nodeType: 'file' | 'folder';
  details: any;
}

class PathDebugLogger {
  private logs: PathDebugLogEntry[] = [];
  private listeners: ((logs: PathDebugLogEntry[]) => void)[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('samba_path_debug_logs');
        if (saved) {
          this.logs = JSON.parse(saved);
        }
      } catch {}
    }
  }

  public log(entry: Omit<PathDebugLogEntry, 'id' | 'timestamp'>) {
    const fullEntry: PathDebugLogEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };
    this.logs.unshift(fullEntry);
    if (this.logs.length > 500) {
      this.logs.length = 500;
    }
    this.save();
    this.notify();
  }

  public getLogs(): PathDebugLogEntry[] {
    return this.logs;
  }

  public clear() {
    this.logs = [];
    this.save(true);
    this.notify(true);
  }

  public subscribe(listener: (logs: PathDebugLogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private save(immediate = false) {
    if (typeof window === 'undefined') return;
    if (immediate) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      try {
        localStorage.setItem('samba_path_debug_logs', JSON.stringify(this.logs.slice(0, 200)));
      } catch {}
      return;
    }
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        localStorage.setItem('samba_path_debug_logs', JSON.stringify(this.logs.slice(0, 200)));
      } catch {}
    }, 500);
  }

  private notify(immediate = false) {
    if (this.listeners.length === 0) return;
    if (immediate) {
      if (this.notifyTimer) {
        clearTimeout(this.notifyTimer);
        this.notifyTimer = null;
      }
      const snapshot = [...this.logs];
      this.listeners.forEach((l) => l(snapshot));
      return;
    }
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      if (this.listeners.length === 0) return;
      const snapshot = [...this.logs];
      this.listeners.forEach((l) => l(snapshot));
    }, 150);
  }
}

export const pathDebugLogger = new PathDebugLogger();
