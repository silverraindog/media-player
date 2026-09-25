import { ConsoleLogEntry, ConsoleLogLevel, ConsoleLogCategory } from '../types';

type LogListener = (logs: ConsoleLogEntry[]) => void;

class LoggerService {
  private logs: ConsoleLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 1000;
  private storageKey = 'samba_vault_console_logs';

  constructor() {
    this.loadFromStorage();
    if (this.logs.length === 0) {
      this.info('SambaVault Console Log Subsystem initialized. Monitoring active.', 'System');
    }
  }

  private loadFromStorage() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.logs = parsed;
        }
      }
    } catch (e) {
      this.logs = [];
    }
  }

  private persistToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs.slice(-300)));
    } catch (e) {
      // Ignore storage quota
    }
  }

  private notify() {
    const copy = [...this.logs];
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.error('Logger listener error:', err);
      }
    });
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getLogs(): ConsoleLogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    this.persistToStorage();
    this.notify();
    this.info('Console log buffer cleared.', 'System');
  }

  public log(
    level: ConsoleLogLevel,
    category: ConsoleLogCategory,
    message: string,
    details?: any
  ): ConsoleLogEntry {
    const entry: ConsoleLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.persistToStorage();
    this.notify();

    // Also mirror to browser console for devtools
    const prefix = `[SambaVault][${category}][${level.toUpperCase()}]`;
    if (level === 'error') console.error(prefix, message, details || '');
    else if (level === 'warn') console.warn(prefix, message, details || '');
    else console.log(prefix, message, details || '');

    return entry;
  }

  public info(message: string, category: ConsoleLogCategory = 'Sync', details?: any) {
    return this.log('info', category, message, details);
  }

  public success(message: string, category: ConsoleLogCategory = 'Sync', details?: any) {
    return this.log('success', category, message, details);
  }

  public warn(message: string, category: ConsoleLogCategory = 'Sync', details?: any) {
    return this.log('warn', category, message, details);
  }

  public error(message: string, category: ConsoleLogCategory = 'Sync', details?: any) {
    return this.log('error', category, message, details);
  }

  public debug(message: string, category: ConsoleLogCategory = 'Sync', details?: any) {
    return this.log('debug', category, message, details);
  }
}

export const logger = new LoggerService();
