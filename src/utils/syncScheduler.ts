import { SyncScheduleConfig } from '../types';
import { logger } from './loggerService';

export const DEFAULT_SYNC_SCHEDULE_CONFIG: SyncScheduleConfig = {
  enabled: false,
  intervalPreset: '1h',
  cronExpression: '0 * * * *',
  lastRunAt: undefined,
  lastRunStatus: 'idle',
  lastRunSummary: 'No scheduled sync executed yet.',
  nextRunAt: undefined,
  showToastOnRun: true,
};

export const CRON_PRESETS: Record<SyncScheduleConfig['intervalPreset'], { label: string; cron: string; description: string }> = {
  '15m': {
    label: 'Every 15 Minutes',
    cron: '*/15 * * * *',
    description: 'Runs automatically every 15 minutes',
  },
  '1h': {
    label: 'Every Hour',
    cron: '0 * * * *',
    description: 'Runs automatically at minute 0 of every hour',
  },
  '6h': {
    label: 'Every 6 Hours',
    cron: '0 */6 * * *',
    description: 'Runs automatically every 6 hours (00:00, 06:00, 12:00, 18:00)',
  },
  'daily_3am': {
    label: 'Daily at 3:00 AM',
    cron: '0 3 * * *',
    description: 'Runs once a day at 3:00 AM local time',
  },
  'daily_12pm': {
    label: 'Daily at 12:00 PM (Noon)',
    cron: '0 12 * * *',
    description: 'Runs once a day at 12:00 PM local time',
  },
  'weekly_sun': {
    label: 'Weekly on Sunday at 2:00 AM',
    cron: '0 2 * * 0',
    description: 'Runs once a week every Sunday at 2:00 AM local time',
  },
  'custom': {
    label: 'Custom Cron Expression',
    cron: '0 3 * * *',
    description: 'User-defined standard 5-field cron syntax',
  },
};

export function parseCronToHumanText(cronExpr: string): string {
  const clean = cronExpr.trim();
  if (clean === '*/15 * * * *') return 'Every 15 minutes';
  if (clean === '0 * * * *') return 'Every hour at minute 0';
  if (clean === '0 */6 * * *') return 'Every 6 hours';
  if (clean === '0 3 * * *') return 'Daily at 3:00 AM';
  if (clean === '0 12 * * *') return 'Daily at 12:00 PM (Noon)';
  if (clean === '0 2 * * 0') return 'Weekly on Sunday at 2:00 AM';

  const parts = clean.split(/\s+/);
  if (parts.length !== 5) return 'Invalid cron syntax (expected 5 fields)';

  const [min, hour, dom, month, dow] = parts;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let timeStr = '';
  if (hour !== '*' && min !== '*') {
    const h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    if (!isNaN(h) && !isNaN(m)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const formattedHour = h % 12 === 0 ? 12 : h % 12;
      const formattedMin = String(m).padStart(2, '0');
      timeStr = `at ${formattedHour}:${formattedMin} ${ampm}`;
    }
  }

  if (dom === '*' && month === '*' && dow === '*') {
    return timeStr ? `Daily ${timeStr}` : `Every hour at minute ${min}`;
  }
  if (dow !== '*') {
    const dIndex = parseInt(dow, 10);
    const dName = dayNames[dIndex] || `Day ${dow}`;
    return `Weekly on ${dName} ${timeStr}`;
  }
  if (dom !== '*') {
    return `Monthly on day ${dom} ${timeStr}`;
  }

  return `Custom Schedule (${clean})`;
}

export function calculateNextRunDate(cronExpr: string, fromDate: Date = new Date()): Date {
  const clean = cronExpr.trim();
  const parts = clean.split(/\s+/);
  
  const next = new Date(fromDate.getTime());
  next.setSeconds(0);
  next.setMilliseconds(0);

  if (parts.length !== 5) {
    next.setTime(next.getTime() + 60 * 60 * 1000);
    return next;
  }

  const [minStr, hourStr, domStr, monthStr, dowStr] = parts;

  // Handles */N minutes
  if (minStr.startsWith('*/')) {
    const interval = parseInt(minStr.replace('*/', ''), 10) || 15;
    const currentMin = next.getMinutes();
    const minsToAdd = interval - (currentMin % interval);
    next.setMinutes(currentMin + (minsToAdd === 0 ? interval : minsToAdd));
    return next;
  }

  // Handles */N hours
  if (minStr === '0' && hourStr.startsWith('*/')) {
    const intervalHours = parseInt(hourStr.replace('*/', ''), 10) || 6;
    next.setMinutes(0);
    const currentHour = next.getHours();
    const hoursToAdd = intervalHours - (currentHour % intervalHours);
    next.setHours(currentHour + (hoursToAdd === 0 ? intervalHours : hoursToAdd));
    return next;
  }

  const targetMin = minStr === '*' ? 0 : (parseInt(minStr, 10) || 0);
  const targetHour = hourStr === '*' ? fromDate.getHours() + 1 : (parseInt(hourStr, 10) || 0);
  const targetDow = dowStr === '*' ? null : (parseInt(dowStr, 10) % 7);

  next.setMinutes(targetMin);
  next.setHours(targetHour);

  if (next.getTime() <= fromDate.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  if (targetDow !== null) {
    while (next.getDay() !== targetDow || next.getTime() <= fromDate.getTime()) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next;
}

export class SyncSchedulerEngine {
  private config: SyncScheduleConfig = DEFAULT_SYNC_SCHEDULE_CONFIG;
  private intervalTimer: any = null;
  private syncCallback: (() => Promise<void>) | null = null;
  private storageKey = 'samba_vault_sync_schedule';

  constructor() {
    this.loadFromStorage();
  }

  public loadFromStorage(): SyncScheduleConfig {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.config = { ...DEFAULT_SYNC_SCHEDULE_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      this.config = { ...DEFAULT_SYNC_SCHEDULE_CONFIG };
    }
    
    // Ensure next run is computed if enabled
    if (this.config.enabled && this.config.cronExpression) {
      const nextDate = calculateNextRunDate(this.config.cronExpression);
      this.config.nextRunAt = nextDate.toISOString();
    }
    return this.config;
  }

  public saveConfig(newConfig: Partial<SyncScheduleConfig>): SyncScheduleConfig {
    const updated = { ...this.config, ...newConfig };
    if (updated.enabled && updated.cronExpression) {
      const nextDate = calculateNextRunDate(updated.cronExpression);
      updated.nextRunAt = nextDate.toISOString();
    } else {
      updated.nextRunAt = undefined;
    }

    this.config = updated;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to persist sync schedule config:', e);
    }

    logger.info(
      `Sync Schedule updated. Enabled: ${updated.enabled ? 'YES' : 'NO'}, Cron: "${updated.cronExpression}" (${parseCronToHumanText(updated.cronExpression)})`,
      'Scheduler'
    );

    this.restartTimer();
    return this.config;
  }

  public getConfig(): SyncScheduleConfig {
    return { ...this.config };
  }

  public registerSyncHandler(callback: () => Promise<void>) {
    this.syncCallback = callback;
    this.restartTimer();
  }

  private restartTimer() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (!this.config.enabled || !this.syncCallback) {
      return;
    }

    // Check timer loop every 15 seconds
    this.intervalTimer = setInterval(() => {
      this.checkAndTriggerDueRun();
    }, 15000);

    // Initial check
    this.checkAndTriggerDueRun();
  }

  private async checkAndTriggerDueRun() {
    if (!this.config.enabled || !this.syncCallback || !this.config.nextRunAt) {
      return;
    }

    const nextRunTime = new Date(this.config.nextRunAt).getTime();
    const now = Date.now();

    if (now >= nextRunTime) {
      logger.info(
        `⏰ Scheduled Sync Trigger firing! Interval: "${this.config.cronExpression}" (${parseCronToHumanText(this.config.cronExpression)})`,
        'Scheduler'
      );

      try {
        await this.triggerSyncNow('automated_schedule');
      } catch (err: any) {
        logger.error(`Scheduled Sync execution failed: ${err?.message || err}`, 'Scheduler');
      }
    }
  }

  public async triggerSyncNow(source: 'automated_schedule' | 'manual_button' = 'manual_button') {
    if (!this.syncCallback) {
      logger.warn('Trigger manual run invoked but no sync callback handler is attached.', 'Scheduler');
      return;
    }

    const startTime = Date.now();
    logger.info(
      `Starting ${source === 'automated_schedule' ? 'Automated Scheduled' : 'Manual Scheduled'} Samba Sync process...`,
      'Scheduler'
    );

    try {
      await this.syncCallback();
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      
      const summary = `Sync finished successfully in ${durationSec}s at ${new Date().toLocaleTimeString()}`;
      logger.success(`Scheduled Background Sync Completed! ${summary}`, 'Scheduler');

      const nextDate = calculateNextRunDate(this.config.cronExpression);
      this.saveConfig({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: 'success',
        lastRunSummary: summary,
        nextRunAt: nextDate.toISOString(),
      });
    } catch (err: any) {
      const summary = `Sync failed: ${err?.message || err}`;
      logger.error(`Scheduled Background Sync Error: ${summary}`, 'Scheduler');

      const nextDate = calculateNextRunDate(this.config.cronExpression);
      this.saveConfig({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: 'error',
        lastRunSummary: summary,
        nextRunAt: nextDate.toISOString(),
      });
      throw err;
    }
  }
}

export const syncScheduler = new SyncSchedulerEngine();
