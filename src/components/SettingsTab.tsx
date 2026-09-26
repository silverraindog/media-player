import React, { useState, useEffect } from 'react';
import {
  Settings,
  Clock,
  Calendar,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  FolderSync,
  Sliders,
  Sparkles,
  Database,
  Trash2,
  Download,
  HardDrive,
  Info,
  Check,
  Play,
  Bell,
  RefreshCw,
  Tag,
  GitBranch,
  Copy,
  History,
  Milestone,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Activity,
  Terminal,
} from 'lucide-react';
import { SyncScheduleConfig, ClassifierSettings, SambaConfig } from '../types';
import { APP_VERSION, APP_RELEASE_TAG, getNextReleaseTag, BUILD_INCREMENTS, ReleaseIncrement } from '../version';
import {
  syncScheduler,
  DEFAULT_SYNC_SCHEDULE_CONFIG,
  CRON_PRESETS,
  parseCronToHumanText,
  calculateNextRunDate,
  timeAndDaysToCron,
  cronToTimeAndDays,
} from '../utils/syncScheduler';
import { logger } from '../utils/loggerService';

interface SettingsTabProps {
  classifierSettings: ClassifierSettings;
  onUpdateClassifierSettings: (settings: ClassifierSettings) => void;
  sambaConfig: SambaConfig;
  onClearThumbnailCache: () => void;
  onExportLibraryBackup: () => void;
  onManualTriggerSync?: () => Promise<void>;
  scanDepthLimit?: number;
  onUpdateScanDepthLimit?: (depth: number) => void;
  serverVersionInfo?: any;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  classifierSettings,
  onUpdateClassifierSettings,
  sambaConfig,
  onClearThumbnailCache,
  onExportLibraryBackup,
  onManualTriggerSync,
  scanDepthLimit = 30,
  onUpdateScanDepthLimit,
  serverVersionInfo,
}) => {
  const [scheduleConfig, setScheduleConfig] = useState<SyncScheduleConfig>(() => syncScheduler.getConfig());
  const [customCronInput, setCustomCronInput] = useState(scheduleConfig.cronExpression);
  const [isSyncRunning, setIsSyncRunning] = useState(false);
  const [mountMappingsCount, setMountMappingsCount] = useState<number>(0);
  const [clearedMappingsToast, setClearedMappingsToast] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopyCommand = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(id);
    setTimeout(() => setCopiedCommand(null), 2500);
  };

  // Schedule Visual Mode: 'daily_time' | 'interval' | 'advanced_cron'
  const [scheduleUiTab, setScheduleUiTab] = useState<'daily_time' | 'interval' | 'advanced_cron'>(() => {
    if (scheduleConfig.intervalPreset === 'custom') {
      return scheduleConfig.cronExpression.includes('*/') ? 'interval' : 'daily_time';
    }
    if (['15m', '1h', '6h'].includes(scheduleConfig.intervalPreset)) {
      return 'interval';
    }
    return 'daily_time';
  });

  // Timepicker & Days State
  const initialTimeAndDays = cronToTimeAndDays(scheduleConfig.cronExpression);
  const [selectedTime, setSelectedTime] = useState<string>(initialTimeAndDays.time);
  const [selectedDays, setSelectedDays] = useState<number[]>(initialTimeAndDays.days);

  // Sync state when scheduleConfig updates
  useEffect(() => {
    const parsed = cronToTimeAndDays(scheduleConfig.cronExpression);
    setSelectedTime(parsed.time);
    setSelectedDays(parsed.days);
    setCustomCronInput(scheduleConfig.cronExpression);
  }, [scheduleConfig.cronExpression]);

  // Handlers for Visual Schedule Builder
  const handleTimeChange = (newTime: string) => {
    setSelectedTime(newTime);
    const generatedCron = timeAndDaysToCron(newTime, selectedDays);
    const updated = syncScheduler.saveConfig({
      intervalPreset: 'custom',
      cronExpression: generatedCron,
    });
    setScheduleConfig(updated);
  };

  const handleToggleDay = (dayIndex: number) => {
    let nextDays: number[];
    if (selectedDays.includes(dayIndex)) {
      if (selectedDays.length === 1) return; // Keep at least 1 day selected
      nextDays = selectedDays.filter((d) => d !== dayIndex);
    } else {
      nextDays = [...selectedDays, dayIndex].sort((a, b) => a - b);
    }
    setSelectedDays(nextDays);
    const generatedCron = timeAndDaysToCron(selectedTime, nextDays);
    const updated = syncScheduler.saveConfig({
      intervalPreset: 'custom',
      cronExpression: generatedCron,
    });
    setScheduleConfig(updated);
  };

  const handleQuickDayPreset = (preset: 'everyday' | 'weekdays' | 'weekends') => {
    let nextDays = [0, 1, 2, 3, 4, 5, 6];
    if (preset === 'weekdays') nextDays = [1, 2, 3, 4, 5];
    if (preset === 'weekends') nextDays = [0, 6];

    setSelectedDays(nextDays);
    const generatedCron = timeAndDaysToCron(selectedTime, nextDays);
    const updated = syncScheduler.saveConfig({
      intervalPreset: 'custom',
      cronExpression: generatedCron,
    });
    setScheduleConfig(updated);
  };

  // Load mount mappings count
  useEffect(() => {
    try {
      const saved = localStorage.getItem('samba_vault_mount_mappings');
      if (saved) {
        const parsed = JSON.parse(saved);
        setMountMappingsCount(Object.keys(parsed).length);
      }
    } catch {
      setMountMappingsCount(0);
    }
  }, []);

  // Update schedule settings
  const handleToggleSchedule = (enabled: boolean) => {
    const updated = syncScheduler.saveConfig({ enabled });
    setScheduleConfig(updated);
  };

  const handleSelectPreset = (presetKey: SyncScheduleConfig['intervalPreset']) => {
    const preset = CRON_PRESETS[presetKey];
    const cron = presetKey === 'custom' ? customCronInput : preset.cron;
    const updated = syncScheduler.saveConfig({
      intervalPreset: presetKey,
      cronExpression: cron,
    });
    setScheduleConfig(updated);
  };

  const handleApplyCustomCron = () => {
    const updated = syncScheduler.saveConfig({
      intervalPreset: 'custom',
      cronExpression: customCronInput,
    });
    setScheduleConfig(updated);
  };

  const handleTriggerSyncNow = async () => {
    setIsSyncRunning(true);
    try {
      if (onManualTriggerSync) {
        await onManualTriggerSync();
      } else {
        await syncScheduler.triggerSyncNow('manual_button');
      }
      setScheduleConfig(syncScheduler.getConfig());
    } catch (err: any) {
      console.error('Trigger sync failed:', err);
    } finally {
      setIsSyncRunning(false);
    }
  };

  const handleClearMountMappings = () => {
    localStorage.removeItem('samba_vault_mount_mappings');
    setMountMappingsCount(0);
    setClearedMappingsToast(true);
    logger.info('Cleared persistent samba_vault_mount_mappings local storage table.', 'Mount');
    setTimeout(() => setClearedMappingsToast(false), 2500);
  };

  const humanScheduleDescription = parseCronToHumanText(scheduleConfig.cronExpression);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-white tracking-tight">SambaVault Settings & Schedule</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                v{APP_VERSION} Config
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Configure background sync cron schedules, AI classifier rules, storage options, and system diagnostics.
            </p>
          </div>
        </div>

        <button
          onClick={handleTriggerSyncNow}
          disabled={isSyncRunning}
          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg transition cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
        >
          <Zap className={`w-4 h-4 text-amber-300 fill-amber-300 ${isSyncRunning ? 'animate-spin' : ''}`} />
          <span>{isSyncRunning ? 'Syncing Samba Storage...' : 'Sync Samba Now'}</span>
        </button>
      </div>

      {/* SECTION 1: BACKGROUND SYNC SCHEDULE (CRON) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Automated Sync Schedule (Background Cron)</h3>
              <p className="text-xs text-slate-400">
                Define an interval or cron syntax to automatically trigger <code className="text-amber-300">handleSyncSamba</code> in the background.
              </p>
            </div>
          </div>

          {/* Schedule Enable Switch */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleConfig.enabled}
              onChange={(e) => handleToggleSchedule(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            <span className="ml-3 text-xs font-bold text-slate-200">
              {scheduleConfig.enabled ? 'Schedule Active' : 'Schedule Disabled'}
            </span>
          </label>
        </div>

        {/* Status Dashboard Box */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status Card 1: Next Run */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2">
            <div className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span>Next Scheduled Run</span>
            </div>
            <div className="text-sm font-bold text-white font-mono">
              {scheduleConfig.enabled && scheduleConfig.nextRunAt
                ? new Date(scheduleConfig.nextRunAt).toLocaleString()
                : 'Schedule Inactive'}
            </div>
            <p className="text-[11px] text-cyan-300/80 font-medium">
              {scheduleConfig.enabled ? humanScheduleDescription : 'Enable schedule switch to activate'}
            </p>
          </div>

          {/* Status Card 2: Last Run */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2">
            <div className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
              <RotateCw className="w-4 h-4 text-indigo-400" />
              <span>Last Execution Status</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                {scheduleConfig.lastRunAt ? new Date(scheduleConfig.lastRunAt).toLocaleTimeString() : 'Never Executed'}
              </span>
              {scheduleConfig.lastRunStatus === 'success' && (
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-bold border border-emerald-600/40">
                  SUCCESS
                </span>
              )}
              {scheduleConfig.lastRunStatus === 'error' && (
                <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 text-[10px] font-bold border border-rose-600/40">
                  FAILED
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {scheduleConfig.lastRunSummary || 'No recent scheduled runs recorded.'}
            </p>
          </div>

          {/* Status Card 3: Cron Setting */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2">
            <div className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Active Cron Syntax</span>
            </div>
            <div className="text-sm font-mono font-bold text-amber-300 bg-amber-950/40 px-2.5 py-1 rounded border border-amber-800/40 inline-block w-fit">
              {scheduleConfig.cronExpression}
            </div>
            <p className="text-[11px] text-slate-400">Standard 5-field unix cron evaluation</p>
          </div>
        </div>

        {/* Visual Schedule Builder Controls */}
        <div className="space-y-4 pt-2">
          {/* Visual Mode Selector Segmented Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Configure Schedule Mode:
            </label>
            <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800 gap-1">
              <button
                type="button"
                onClick={() => setScheduleUiTab('daily_time')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  scheduleUiTab === 'daily_time'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> Daily Timepicker
              </button>
              <button
                type="button"
                onClick={() => setScheduleUiTab('interval')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  scheduleUiTab === 'interval'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Repeating Interval
              </button>
              <button
                type="button"
                onClick={() => setScheduleUiTab('advanced_cron')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  scheduleUiTab === 'advanced_cron'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderSync className="w-3.5 h-3.5" /> Advanced Cron
              </button>
            </div>
          </div>

          {/* TAB 1: DAILY TIMEPICKER & DAYS SELECTOR */}
          {scheduleUiTab === 'daily_time' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Visual Timepicker Box */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 border border-indigo-900/50 space-y-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-indigo-400" />
                    <span className="text-sm font-bold text-white">Daily Run Timepicker</span>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/50 font-mono font-bold">
                    {(() => {
                      const [hStr, mStr] = selectedTime.split(':');
                      const h = parseInt(hStr || '3', 10);
                      const m = parseInt(mStr || '0', 10);
                      const ampm = h >= 12 ? 'PM' : 'AM';
                      const formattedHour = h % 12 === 0 ? 12 : h % 12;
                      const formattedMin = String(m).padStart(2, '0');
                      return `${formattedHour}:${formattedMin} ${ampm} (${selectedTime})`;
                    })()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                      Set Execution Time:
                    </label>
                    <input
                      type="time"
                      value={selectedTime}
                      onChange={(e) => handleTimeChange(e.target.value)}
                      className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl px-4 py-3 text-base font-bold text-amber-300 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-inner cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                      Quick Time Presets:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleTimeChange('03:00')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-left ${
                          selectedTime === '03:00'
                            ? 'bg-indigo-600 text-white border-indigo-400 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        🌙 03:00 AM (Overnight)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimeChange('08:00')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-left ${
                          selectedTime === '08:00'
                            ? 'bg-indigo-600 text-white border-indigo-400 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        🌅 08:00 AM (Morning)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimeChange('12:00')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-left ${
                          selectedTime === '12:00'
                            ? 'bg-indigo-600 text-white border-indigo-400 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        ☀️ 12:00 PM (Noon)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimeChange('18:00')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-left ${
                          selectedTime === '18:00'
                            ? 'bg-indigo-600 text-white border-indigo-400 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        🌆 06:00 PM (Evening)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Days of the Week Selection Card */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white">Repeat Days of the Week</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickDayPreset('everyday')}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] font-semibold border border-slate-800 transition cursor-pointer"
                    >
                      Every Day
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDayPreset('weekdays')}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] font-semibold border border-slate-800 transition cursor-pointer"
                    >
                      Mon-Fri
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDayPreset('weekends')}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] font-semibold border border-slate-800 transition cursor-pointer"
                    >
                      Sat-Sun
                    </button>
                  </div>
                </div>

                {/* Day Buttons */}
                <div className="grid grid-cols-7 gap-2 pt-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, idx) => {
                    const isSelected = selectedDays.includes(idx);
                    return (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => handleToggleDay(idx)}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <span>{dayName}</span>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REPEATING INTERVAL GRID */}
          {scheduleUiTab === 'interval' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <label className="text-xs font-bold text-slate-300 block">Select Repeat Interval:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { key: '15m', label: 'Every 15 Minutes', cron: '*/15 * * * *', desc: 'Runs automatically every 15 minutes' },
                  { key: '30m', label: 'Every 30 Minutes', cron: '*/30 * * * *', desc: 'Runs automatically every 30 minutes' },
                  { key: '1h', label: 'Every 1 Hour', cron: '0 * * * *', desc: 'Runs at minute 0 of every hour' },
                  { key: '3h', label: 'Every 3 Hours', cron: '0 */3 * * *', desc: 'Runs every 3 hours' },
                  { key: '6h', label: 'Every 6 Hours', cron: '0 */6 * * *', desc: 'Runs every 6 hours' },
                  { key: '12h', label: 'Every 12 Hours', cron: '0 */12 * * *', desc: 'Runs twice a day' },
                ].map((item) => {
                  const isSelected = scheduleConfig.cronExpression === item.cron;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        const updated = syncScheduler.saveConfig({
                          intervalPreset: item.key as any,
                          cronExpression: item.cron,
                        });
                        setScheduleConfig(updated);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-1.5 ${
                        isSelected
                          ? 'bg-indigo-950/80 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold text-white">{item.label}</span>
                        <span className="text-[10px] font-mono text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {item.cron}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ADVANCED CRON */}
          {scheduleUiTab === 'advanced_cron' && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200">Custom 5-Field Unix Cron Expression:</label>
                <span className="text-[11px] text-indigo-400 font-medium">Format: min hour dom month dow</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={customCronInput}
                  onChange={(e) => setCustomCronInput(e.target.value)}
                  placeholder="e.g. 0 3 * * *"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomCron}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
                >
                  Apply Custom Cron
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Human Translation: <span className="text-cyan-300 font-semibold">{parseCronToHumanText(customCronInput)}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: AI & FOLDER CLASSIFIER RULES */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Folder Classifier & Regex Automation</h3>
            <p className="text-xs text-slate-400">
              Configure confidence thresholds and regex categorization rules for ambiguous network folders.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Confidence Slider */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Confidence Threshold:</span>
              <span className="text-xs font-mono font-bold text-indigo-400">
                {Math.round((classifierSettings.confidenceThreshold || 0.85) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="0.99"
              step="0.05"
              value={classifierSettings.confidenceThreshold || 0.85}
              onChange={(e) =>
                onUpdateClassifierSettings({
                  ...classifierSettings,
                  confidenceThreshold: parseFloat(e.target.value),
                })
              }
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <p className="text-[11px] text-slate-400">
              Folders with regex/heuristic confidence higher than this threshold will be categorized automatically.
            </p>
          </div>

          {/* Auto-Import Toggle */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-200 block">Auto-Import Confident Folders</span>
              <p className="text-[11px] text-slate-400">
                Skip review modal for high-confidence matches during syncs.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={classifierSettings.autoImportConfident ?? true}
                onChange={(e) =>
                  onUpdateClassifierSettings({
                    ...classifierSettings,
                    autoImportConfident: e.target.checked,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* SECTION: SCAN DEPTH & RECURSION LIMIT */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Scan Depth & Recursion Limit</h3>
            <p className="text-xs text-slate-400">
              Control the maximum recursive depth when traversing Samba network shares or mount volume folders.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">Maximum Recursion Depth:</span>
            <span className="text-xs font-mono font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-950 border border-blue-800/40">
              {scanDepthLimit} Levels
            </span>
          </div>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            value={scanDepthLimit}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (onUpdateScanDepthLimit) {
                onUpdateScanDepthLimit(val);
              }
            }}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>Shallow (5)</span>
            <span>Standard (30)</span>
            <span>Deep (50)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Higher depth limits allow deep subfolders (e.g. multi-season TV series and nested franchise structures) to be fully traversed during volume scans.
          </p>
        </div>
      </div>

      {/* SECTION 3: STORAGE, BACKUP & SYSTEM DIAGNOSTICS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Storage, Mount Mappings & Backup Tools</h3>
            <p className="text-xs text-slate-400">
              Manage local cache, reset persistent system mount point mappings, and export full library state backups.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Clear Mount Mappings Table */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span>Mount Mappings Table</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">
                  {mountMappingsCount} Mapped Entries
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Persistent system volume paths resolved for media player streaming.
              </p>
            </div>
            <button
              onClick={handleClearMountMappings}
              className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-400" />
              <span>{clearedMappingsToast ? 'Mappings Cleared!' : 'Reset Mount Mappings'}</span>
            </button>
          </div>

          {/* Clear Thumbnail Cache */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-bold text-white block">Thumbnail Artwork Cache</span>
              <p className="text-[11px] text-slate-400 mt-1">
                Purge cached image thumbnails to force fresh TMDB/TVMaze artwork downloads.
              </p>
            </div>
            <button
              onClick={onClearThumbnailCache}
              className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Purge Image Cache</span>
            </button>
          </div>

          {/* Export Full Backup JSON */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-bold text-white block">Full Vault State Backup</span>
              <p className="text-[11px] text-slate-400 mt-1">
                Export complete SQLite media database, watch history, and classifier settings as JSON.
              </p>
            </div>
            <button
              onClick={onExportLibraryBackup}
              className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-2 shadow"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Vault Backup JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 5: RELEASE VERSION TRACKER & BUILD INCREMENTS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Milestone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Release Version Tracker</h3>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                  v{APP_RELEASE_TAG} (Active)
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-medium">
                  Next Push: v{getNextReleaseTag(APP_RELEASE_TAG)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Every build increment is tracked sequentially. Pushing to <code className="text-emerald-300 font-mono">main</code> triggers GitHub Actions <code className="text-emerald-300 font-mono">release.yml</code> to auto-bump patch tags and compile cross-platform desktop installers.
              </p>
            </div>
          </div>
        </div>

        {/* Release Status Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/30 shadow-md shadow-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Current Client Version</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                Runtime Active
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-emerald-400">{APP_RELEASE_TAG}</span>
              <span className="text-xs text-slate-500 font-mono">tag: v{APP_RELEASE_TAG}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Build-time constant state
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-500/30 shadow-md shadow-indigo-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Server Synchronicity</span>
              {serverVersionInfo?.releaseTag && serverVersionInfo.releaseTag !== APP_RELEASE_TAG ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-semibold flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Update Available
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold">
                  Synced
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-indigo-400">v{serverVersionInfo?.releaseTag || '...'}</span>
              <span className="text-[10px] text-slate-500 font-mono">env: {serverVersionInfo?.environment || 'unknown'}</span>
            </div>
            <div className="mt-2 space-y-1">
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-indigo-500" />
                Commit: <span className="font-mono text-slate-300">{serverVersionInfo?.commit?.substring(0, 8) || 'unknown'}</span>
              </p>
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-indigo-500" />
                Built: <span className="text-slate-300">{serverVersionInfo?.buildDate ? new Date(serverVersionInfo.buildDate).toLocaleString() : 'unknown'}</span>
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Next Planned Push</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                Build #2 Staged
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl font-bold font-mono text-cyan-400">{getNextReleaseTag(APP_RELEASE_TAG)}</span>
              <ArrowRight className="w-4 h-4 text-slate-600" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Auto-incremented on next main branch push
            </p>
          </div>
        </div>

        {/* BUILD INCREMENTS TIMELINE (Every increment visible to the user) */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-4 h-4 text-emerald-400" />
              Sequential Build Increments Timeline
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Semver Sequence: 0.0.0 → 0.0.1 → 0.0.2 → 0.0.3
            </span>
          </div>

          <div className="space-y-3">
            {BUILD_INCREMENTS.map((build: ReleaseIncrement) => {
              const isCurrent = build.version === APP_RELEASE_TAG;
              const isNext = build.version === getNextReleaseTag(APP_RELEASE_TAG);
              return (
                <div
                  key={build.version}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-emerald-950/20 border-emerald-500/40 shadow-md shadow-emerald-950/20'
                      : isNext
                      ? 'bg-cyan-950/20 border-cyan-500/40 shadow-md shadow-cyan-950/20'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-3">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-9 h-9 rounded-lg font-mono text-sm font-bold flex items-center justify-center flex-shrink-0 ${
                          isCurrent
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                            : isNext
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        v{build.version}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-white">{build.title}</h4>
                          {isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Active Build
                            </span>
                          )}
                          {isNext && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                              Next Push Target
                            </span>
                          )}
                          {build.status === 'queued' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold">
                              Planned Increment
                            </span>
                          )}
                          {build.status === 'baseline' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                              Bootstrap Baseline
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Build #{build.buildNumber} • {build.releaseDate} • Tag: <code className="text-slate-200">{build.tag}</code>
                        </p>
                      </div>
                    </div>

                    {build.gitCommand && (
                      <button
                        onClick={() => handleCopyCommand(build.gitCommand!, `build-${build.version}`)}
                        className="self-end sm:self-center px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs rounded-lg transition-colors flex items-center gap-1.5 font-mono cursor-pointer flex-shrink-0"
                      >
                        {copiedCommand === `build-${build.version}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedCommand === `build-${build.version}` ? 'Copied' : `tag ${build.tag}`}</span>
                      </button>
                    )}
                  </div>

                  {/* Highlights Bullet List */}
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                    {build.highlights.map((highlight, hIdx) => (
                      <li key={hIdx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 mt-1.5 flex-shrink-0" />
                        <span className="leading-snug">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Git & NPM Quick Commands */}
        <div className="space-y-3 pt-2">
          <span className="text-xs font-bold text-slate-200 block uppercase tracking-wider">
            Release Pipeline Commands & Push Shortcuts
          </span>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Auto-bump patch via npm */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Bump Patch Version ({APP_RELEASE_TAG} → {getNextReleaseTag(APP_RELEASE_TAG)})</span>
                </div>
                <code className="text-[11px] font-mono text-indigo-300 block mt-1">npm run bump:patch</code>
              </div>
              <button
                onClick={() => handleCopyCommand('npm run bump:patch', 'npm-patch')}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedCommand === 'npm-patch' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCommand === 'npm-patch' ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* Manual Tag Push */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Push Specific Tag to GitHub</span>
                </div>
                <code className="text-[11px] font-mono text-emerald-300 block mt-1">git tag {getNextReleaseTag(APP_RELEASE_TAG)} && git push origin {getNextReleaseTag(APP_RELEASE_TAG)}</code>
              </div>
              <button
                onClick={() => handleCopyCommand(`git tag ${getNextReleaseTag(APP_RELEASE_TAG)} && git push origin ${getNextReleaseTag(APP_RELEASE_TAG)}`, 'git-tag')}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedCommand === 'git-tag' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCommand === 'git-tag' ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

