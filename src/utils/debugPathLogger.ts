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
      this.logs = this.logs.slice(0, 500);
    }
    this.save();
    this.notify();
    console.debug(`[PathDebugLogger] [${fullEntry.eventType}] node="${fullEntry.nodeName}" raw="${fullEntry.rawPath}" resolved="${fullEntry.resolvedPath}" dirty=${fullEntry.isDirty}`, fullEntry);
  }

  public getLogs(): PathDebugLogEntry[] {
    return this.logs;
  }

  public clear() {
    this.logs = [];
    this.save();
    this.notify();
  }

  public subscribe(listener: (logs: PathDebugLogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private save() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('samba_path_debug_logs', JSON.stringify(this.logs.slice(0, 200)));
      } catch {}
    }
  }

  private notify() {
    this.listeners.forEach((l) => l(this.logs));
  }
}

export const pathDebugLogger = new PathDebugLogger();
