import { ConsoleLogEntry, ConsoleLogLevel, ConsoleLogCategory, SyncIncident } from '../types';

export const LOG_LEVEL_RANKS: Record<ConsoleLogLevel, number> = {
  error: 40,
  warn: 30,
  success: 25,
  info: 20,
  debug: 10,
};

type LogListener = (logs: ConsoleLogEntry[], minLevel: ConsoleLogLevel, debugEnabled: boolean) => void;
type IncidentListener = (incident: SyncIncident | null) => void;

class LoggerService {
  private logs: ConsoleLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private incidentListeners: Set<IncidentListener> = new Set();
  private activeIncident: SyncIncident | null = null;
  private maxLogs = 1000;
  private storageKey = 'samba_vault_console_logs';
  private incidentStorageKey = 'samba_vault_active_incident';
  private debugEnabled: boolean = true;
  private minLevel: ConsoleLogLevel = 'info';

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
      const savedIncident = localStorage.getItem(this.incidentStorageKey);
      if (savedIncident) {
        this.activeIncident = JSON.parse(savedIncident);
      }
      const savedDebug = localStorage.getItem('samba_vault_debug_enabled');
      if (savedDebug !== null) {
        this.debugEnabled = JSON.parse(savedDebug);
      }
      const savedMinLevel = localStorage.getItem('samba_vault_min_level');
      if (savedMinLevel) {
        this.minLevel = savedMinLevel as ConsoleLogLevel;
      }
    } catch (e) {
      this.logs = [];
    }
  }

  private persistToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs.slice(-300)));
      localStorage.setItem('samba_vault_debug_enabled', JSON.stringify(this.debugEnabled));
      localStorage.setItem('samba_vault_min_level', this.minLevel);
      if (this.activeIncident) {
        localStorage.setItem(this.incidentStorageKey, JSON.stringify(this.activeIncident));
      } else {
        localStorage.removeItem(this.incidentStorageKey);
      }
    } catch (e) {
      // Ignore storage quota
    }
  }

  private notify() {
    const copy = [...this.logs];
    this.listeners.forEach((listener) => {
      try {
        listener(copy, this.minLevel, this.debugEnabled);
      } catch (err) {
        console.error('Logger listener error:', err);
      }
    });
  }

  private notifyIncident() {
    const incident = this.activeIncident ? { ...this.activeIncident } : null;
    this.incidentListeners.forEach((listener) => {
      try {
        listener(incident);
      } catch (err) {
        console.error('Incident listener error:', err);
      }
    });
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs], this.minLevel, this.debugEnabled);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeIncident(listener: IncidentListener): () => void {
    this.incidentListeners.add(listener);
    listener(this.activeIncident ? { ...this.activeIncident } : null);
    return () => {
      this.incidentListeners.delete(listener);
    };
  }

  public getActiveIncident(): SyncIncident | null {
    return this.activeIncident ? { ...this.activeIncident } : null;
  }

  public recordIncident(incidentData: {
    title: string;
    errorMessage: string;
    failedPaths?: string[];
    category?: SyncIncident['category'];
  }): SyncIncident {
    const incident: SyncIncident = {
      id: `incident-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      title: incidentData.title,
      errorMessage: incidentData.errorMessage,
      failedPaths: incidentData.failedPaths || [],
      category: incidentData.category || 'Network',
      retryCount: 0,
      resolved: false,
    };
    this.activeIncident = incident;
    this.persistToStorage();
    this.notifyIncident();
    return incident;
  }

  public updateIncidentRetryCount(id?: string): number {
    if (this.activeIncident && (!id || this.activeIncident.id === id)) {
      this.activeIncident.retryCount = (this.activeIncident.retryCount || 0) + 1;
      this.persistToStorage();
      this.notifyIncident();
      return this.activeIncident.retryCount;
    }
    return 0;
  }

  public resolveIncident(id?: string) {
    if (this.activeIncident && (!id || this.activeIncident.id === id)) {
      this.activeIncident = null;
      this.persistToStorage();
      this.notifyIncident();
      this.success('Sync Incident resolved: All failed operations re-attempted and verified.', 'Sync');
    }
  }

  public dismissIncident() {
    this.activeIncident = null;
    this.persistToStorage();
    this.notifyIncident();
  }

  public getLogs(): ConsoleLogEntry[] {
    return [...this.logs];
  }

  public getDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  public setDebugEnabled(enabled: boolean) {
    this.debugEnabled = enabled;
    this.persistToStorage();
    this.notify();
    this.info(`Debug logging ${enabled ? 'ENABLED' : 'DISABLED'}`, 'System', { debugEnabled: enabled });
  }

  public getMinLevel(): ConsoleLogLevel {
    return this.minLevel;
  }

  public setMinLevel(level: ConsoleLogLevel) {
    this.minLevel = level;
    this.persistToStorage();
    this.notify();
    this.info(`Minimum log level set to ${level.toUpperCase()}`, 'System', { minLevel: level });
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
  ): ConsoleLogEntry | null {
    // If level is debug and debug mode is disabled, drop it
    if (level === 'debug' && !this.debugEnabled) {
      return null;
    }

    // Hierarchical check against min level
    const rank = LOG_LEVEL_RANKS[level] || 20;
    const minRank = LOG_LEVEL_RANKS[this.minLevel] || 20;
    if (rank < minRank) {
      return null;
    }

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

    // Automatic critical network error detection for real-time Sync Incidents
    if (level === 'error' && (category === 'Sync' || category === 'Network' || category === 'Scanner' || category === 'Mount')) {
      const errorText = `${message} ${details ? JSON.stringify(details) : ''}`.toLowerCase();
      const isCriticalNetworkError =
        errorText.includes('network') ||
        errorText.includes('econnrefused') ||
        errorText.includes('ehostunreach') ||
        errorText.includes('etimedout') ||
        errorText.includes('timeout') ||
        errorText.includes('timed out') ||
        errorText.includes('connection failed') ||
        errorText.includes('failed to fetch') ||
        errorText.includes('socket hang up') ||
        errorText.includes('unreachable') ||
        errorText.includes('samba sync failed') ||
        errorText.includes('disconnected');

      if (isCriticalNetworkError) {
        let extractedPaths: string[] = [];
        if (details && Array.isArray(details.failedPaths)) {
          extractedPaths = details.failedPaths;
        } else if (details && typeof details.path === 'string') {
          extractedPaths = [details.path];
        } else if (details && Array.isArray(details.items)) {
          extractedPaths = details.items
            .map((it: any) => (typeof it === 'string' ? it : it?.path || it?.rel_path))
            .filter(Boolean);
        }

        let cat: SyncIncident['category'] = 'Network';
        if (errorText.includes('timeout') || errorText.includes('timed out') || errorText.includes('etimedout')) {
          cat = 'Timeout';
        } else if (errorText.includes('auth') || errorText.includes('denied') || errorText.includes('permission')) {
          cat = 'Auth';
        }

        this.recordIncident({
          title: `Critical Network Incident (${category})`,
          errorMessage: message,
          failedPaths: extractedPaths,
          category: cat,
        });
      }
    }

    // Also mirror to browser console for devtools
    const prefix = `[SambaVault][${category}][${level.toUpperCase()}]`;
    if (level === 'error') console.error(prefix, message, details || '');
    else if (level === 'warn') console.warn(prefix, message, details || '');
    else if (level === 'debug') console.debug(prefix, message, details || '');
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
