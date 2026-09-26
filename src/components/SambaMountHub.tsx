import React, { useState, useMemo } from 'react';
import {
  Server,
  HardDrive,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Terminal,
  ShieldCheck,
  Zap,
  Laptop,
  Trash2,
  ArrowUp,
  ArrowDown,
  Play,
  AlertTriangle,
  Star,
  Plus,
  Compass,
} from 'lucide-react';
import { SambaConfig, CustomMountPath } from '../types';
import { VolumeMountInfo } from '../utils/tauriBridge';
import { normalizeCustomMountPaths } from '../utils/customMountUtils';

interface SambaMountHubProps {
  sambaConfig: SambaConfig;
  setSambaConfig: (config: SambaConfig | ((prev: SambaConfig) => SambaConfig)) => void;
  isConnected: boolean;
  onTestConnection: () => Promise<void> | void;
  isTesting: boolean;
  connectionDetails: any;
  isMountedInFinder: boolean;
  mountedVolumeInfo: VolumeMountInfo | null;
  systemVolumes: any[];
  isDesktopApp: boolean;
  onSyncPath?: (path: string) => void;
}

export const SambaMountHub: React.FC<SambaMountHubProps> = ({
  sambaConfig,
  setSambaConfig,
  isConnected,
  onTestConnection,
  isTesting,
  connectionDetails,
  isMountedInFinder,
  mountedVolumeInfo,
  systemVolumes,
  isDesktopApp,
  onSyncPath,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Custom Mount Paths Form State
  const [newPathInput, setNewPathInput] = useState('');
  const [newAliasInput, setNewAliasInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const customPaths = useMemo<CustomMountPath[]>(() => {
    return normalizeCustomMountPaths(sambaConfig.customMountPaths);
  }, [sambaConfig.customMountPaths]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const showTemporarySuccess = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  // Add new Custom Mount Path
  const handleAddCustomPath = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    const cleanPath = newPathInput.trim();
    if (!cleanPath) {
      setFormError('Please enter a valid directory path (e.g. /Volumes/Media or /mnt/media).');
      return;
    }

    // Check duplicate
    const exists = customPaths.some(
      (p) => p.path.toLowerCase().replace(/[/\\]+$/, '') === cleanPath.toLowerCase().replace(/[/\\]+$/, '')
    );
    if (exists) {
      setFormError(`Path "${cleanPath}" is already registered in your Custom Mount Paths.`);
      return;
    }

    const defaultAlias = newAliasInput.trim() || cleanPath.split(/[/\\]/).filter(Boolean).pop() || 'Custom Share';
    const newEntry: CustomMountPath = {
      id: `mount-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      path: cleanPath,
      alias: defaultAlias,
      enabled: true,
      priority: customPaths.length + 1,
      addedAt: new Date().toISOString(),
      status: 'unverified',
    };

    const updated = [...customPaths, newEntry];
    setSambaConfig((prev) => ({
      ...prev,
      customMountPaths: updated,
      // If mountPath isn't set yet, automatically adopt this path
      mountPath: prev.mountPath || cleanPath,
    }));

    setNewPathInput('');
    setNewAliasInput('');
    showTemporarySuccess(`Registered custom path: "${cleanPath}" (Priority #${newEntry.priority})`);
  };

  // Quick Preset Click
  const handleApplyPreset = (presetPath: string, presetAlias: string) => {
    setNewPathInput(presetPath);
    setNewAliasInput(presetAlias);
    setFormError(null);
  };

  // Toggle Enable/Disable Custom Path
  const handleTogglePath = (id: string) => {
    const updated = customPaths.map((p) => {
      if (p.id === id) {
        return { ...p, enabled: !p.enabled };
      }
      return p;
    });
    setSambaConfig((prev) => ({
      ...prev,
      customMountPaths: updated,
    }));
  };

  // Move Path Up in Priority
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...customPaths];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;

    // Reassign sequential priorities
    const reordered = updated.map((p, idx) => ({ ...p, priority: idx + 1 }));
    setSambaConfig((prev) => ({
      ...prev,
      customMountPaths: reordered,
    }));
    showTemporarySuccess(`Promoted "${temp.alias || temp.path}" to Priority #${index}`);
  };

  // Move Path Down in Priority
  const handleMoveDown = (index: number) => {
    if (index >= customPaths.length - 1) return;
    const updated = [...customPaths];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;

    const reordered = updated.map((p, idx) => ({ ...p, priority: idx + 1 }));
    setSambaConfig((prev) => ({
      ...prev,
      customMountPaths: reordered,
    }));
    showTemporarySuccess(`Deprioritized "${temp.alias || temp.path}" to Priority #${index + 2}`);
  };

  // Delete Custom Path
  const handleDeletePath = (id: string, pathName: string) => {
    const updated = customPaths
      .filter((p) => p.id !== id)
      .map((p, idx) => ({ ...p, priority: idx + 1 }));

    setSambaConfig((prev) => ({
      ...prev,
      customMountPaths: updated,
      // If current mountPath was deleted, reset to next available or empty
      mountPath: prev.mountPath === pathName ? (updated[0]?.path || '') : prev.mountPath,
    }));
    showTemporarySuccess(`Removed custom mount path: "${pathName}"`);
  };

  // Set as Active Primary Mount Path
  const handleSetPrimary = (path: string) => {
    setSambaConfig((prev) => ({
      ...prev,
      mountPath: path,
    }));
    showTemporarySuccess(`Set "${path}" as active primary mount path`);
  };

  const macMountCommand = `mount_smbfs //${sambaConfig.isGuest ? 'guest@' : (sambaConfig.username ? `${sambaConfig.username}@` : '')}${sambaConfig.server || '192.168.1.150'}/${sambaConfig.share || 'media'} /Volumes/${sambaConfig.share || 'media'}`;
  const macFinderUrl = `smb://${sambaConfig.isGuest ? '' : (sambaConfig.username ? `${sambaConfig.username}@` : '')}${sambaConfig.server || '192.168.1.150'}/${sambaConfig.share || 'media'}`;
  const linuxMountCommand = `sudo mount -t cifs //${sambaConfig.server || '192.168.1.150'}/${sambaConfig.share || 'media'} /mnt/${sambaConfig.share || 'media'} -o username=${sambaConfig.isGuest ? 'guest' : (sambaConfig.username || 'user')}${sambaConfig.password ? `,password=***` : ',guest'},iocharset=utf8,vers=3.0`;
  const windowsMountCommand = `net use Z: \\\\${sambaConfig.server || '192.168.1.150'}\\${sambaConfig.share || 'media'} ${sambaConfig.password ? sambaConfig.password : ''} /USER:${sambaConfig.username || 'user'} /PERSISTENT:YES`;

  const autoDiscoveryFailed = !isMountedInFinder && (!systemVolumes || systemVolumes.length === 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl">
              <Server className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Samba Network Storage Hub
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Online & Reachable
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    <XCircle className="w-3.5 h-3.5 text-slate-500" /> Offline / Unverified
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Connect your NAS, Kodi, unRAID, or Windows SMB media directory for real-time metadata indexing and artwork synchronization.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onTestConnection}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg font-medium text-sm transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
              {isTesting ? 'Testing Probe...' : 'Test Connection'}
            </button>
          </div>
        </div>

        {/* Local Mount Status Banner */}
        {isMountedInFinder && (
          <div className="mt-4 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg flex items-center justify-between text-sm text-emerald-300">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>
                <strong>System Mount Detected:</strong> Local volume active at{' '}
                <code className="bg-emerald-950/80 px-1.5 py-0.5 rounded font-mono text-xs text-emerald-200">
                  {mountedVolumeInfo?.mountPath || sambaConfig.mountPath || `/Volumes/${sambaConfig.share}`}
                </code>
              </span>
            </div>
            <span className="text-xs text-emerald-400 font-medium">Native I/O Ready</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION: PERSISTENT CUSTOM MOUNT PATHS (FALLBACK & SCAN PRIORITIZATION) */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 border border-blue-500/30 rounded-xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Custom Mount Paths</h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                  {customPaths.length} Registered
                </span>
                {customPaths.some((p) => p.enabled) && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-emerald-400" />
                    Prioritized during Sync Scan
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Register additional local directory paths manually if auto-discovery for Samba shares fails or when using non-standard mount paths. Saved in <code className="text-blue-300 font-mono">SambaConfig</code> and prioritized first during library sync scans.
              </p>
            </div>
          </div>
        </div>

        {/* Auto-Discovery Failure Alert Banner */}
        {autoDiscoveryFailed && (
          <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl flex items-start gap-3 text-xs text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-300">
                Auto-Discovery for Samba Shares in Standard System Volumes Returned No Drives
              </p>
              <p className="text-amber-200/90 leading-relaxed">
                If your Samba volume is mounted in a custom path (such as <code className="bg-amber-950/80 px-1 py-0.5 rounded font-mono">/mnt/...</code>, <code className="bg-amber-950/80 px-1 py-0.5 rounded font-mono">/media/...</code>, external drives, or non-standard mount points), register it below. Any registered and enabled custom path will be scanned with highest priority.
              </p>
            </div>
          </div>
        )}

        {/* Temporary Feedback Message */}
        {actionSuccessMsg && (
          <div className="p-3 bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs rounded-lg flex items-center gap-2 animate-fadeIn">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}

        {/* Form: Register New Custom Path */}
        <form onSubmit={handleAddCustomPath} className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Register New Directory Path
          </span>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-7">
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Local Directory Path (Required)
              </label>
              <div className="relative">
                <FolderOpen className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="e.g. /Volumes/Media or /mnt/media or D:\Shared\Media"
                  value={newPathInput}
                  onChange={(e) => {
                    setNewPathInput(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 font-mono"
                />
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Alias / Display Label (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Primary NAS or Backup Share"
                value={newAliasInput}
                onChange={(e) => setNewAliasInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div className="md:col-span-2 flex items-end">
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Register Path</span>
              </button>
            </div>
          </div>

          {formError && (
            <p className="text-xs text-rose-400 flex items-center gap-1 mt-1">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{formError}</span>
            </p>
          )}

          {/* Quick Presets Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-400" /> Quick Presets:
            </span>
            <button
              type="button"
              onClick={() => handleApplyPreset(`/Volumes/${sambaConfig.share || 'media'}`, 'Finder /Volumes Mount')}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 rounded text-[11px] font-mono transition-colors cursor-pointer"
            >
              /Volumes/{sambaConfig.share || 'media'}
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(`/mnt/${sambaConfig.share || 'media'}`, 'Linux CIFS Mount')}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 rounded text-[11px] font-mono transition-colors cursor-pointer"
            >
              /mnt/{sambaConfig.share || 'media'}
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('/Volumes/Media', 'macOS Default Media')}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 rounded text-[11px] font-mono transition-colors cursor-pointer"
            >
              /Volumes/Media
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('/media/storage', 'Linux Media Storage')}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 rounded text-[11px] font-mono transition-colors cursor-pointer"
            >
              /media/storage
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('Z:\\media', 'Windows Z: Drive')}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 rounded text-[11px] font-mono transition-colors cursor-pointer"
            >
              Z:\media
            </button>
          </div>
        </form>

        {/* Registered Custom Paths List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-200 uppercase tracking-wider">
              Configured Mount Paths & Priority Order
            </span>
            <span className="text-[11px] text-slate-500">
              Higher priority paths are scanned first during library sync
            </span>
          </div>

          {customPaths.length > 0 ? (
            <div className="space-y-2.5">
              {customPaths.map((item, idx) => {
                const isPrimary = sambaConfig.mountPath === item.path;
                return (
                  <div
                    key={item.id || idx}
                    className={`p-3.5 rounded-xl border transition-all ${
                      item.enabled
                        ? isPrimary
                          ? 'bg-blue-950/30 border-blue-500/50 shadow-md shadow-blue-950/20'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/40 border-slate-900 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center space-x-3 min-w-0 flex-1">
                        {/* Priority Badge */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold flex-shrink-0 ${
                            idx === 0 && item.enabled
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                          title={`Priority #${idx + 1}`}
                        >
                          #{idx + 1}
                        </div>

                        {/* Enable Checkbox */}
                        <label className="flex items-center cursor-pointer" title={item.enabled ? 'Enabled in sync scan' : 'Disabled (skipped during sync)'}>
                          <input
                            type="checkbox"
                            checked={item.enabled}
                            onChange={() => handleTogglePath(item.id)}
                            className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900 cursor-pointer"
                          />
                        </label>

                        {/* Path details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-white">
                              {item.alias || 'Custom Share'}
                            </span>
                            {idx === 0 && item.enabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                                Highest Priority
                              </span>
                            )}
                            {isPrimary && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-semibold">
                                Active Mount
                              </span>
                            )}
                            {!item.enabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                Disabled
                              </span>
                            )}
                          </div>
                          <code className="text-xs font-mono text-blue-300 block truncate mt-0.5 select-all">
                            {item.path}
                          </code>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                        {/* Priority Reordering */}
                        <button
                          type="button"
                          onClick={() => handleMoveUp(idx)}
                          disabled={idx === 0}
                          title="Increase Priority (Move Up)"
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 rounded border border-slate-700/60 transition-colors cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(idx)}
                          disabled={idx === customPaths.length - 1}
                          title="Decrease Priority (Move Down)"
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 rounded border border-slate-700/60 transition-colors cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Set as Primary Mount */}
                        {!isPrimary && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(item.path)}
                            title="Set as Active MountPath in SambaConfig"
                            className="px-2 py-1 bg-slate-900 hover:bg-blue-600 hover:text-white text-slate-300 text-[11px] rounded border border-slate-700/60 transition-colors cursor-pointer"
                          >
                            Set Active
                          </button>
                        )}

                        {/* Scan Path Now */}
                        {onSyncPath && (
                          <button
                            type="button"
                            onClick={() => onSyncPath(item.path)}
                            title="Scan this custom directory immediately"
                            className="px-2 py-1 bg-emerald-950/60 hover:bg-emerald-700 text-emerald-300 hover:text-white text-[11px] font-medium rounded border border-emerald-500/40 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Scan</span>
                          </button>
                        )}

                        {/* Copy Path */}
                        <button
                          type="button"
                          onClick={() => handleCopy(item.path, `path-${idx}`)}
                          title="Copy path"
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/60 transition-colors cursor-pointer"
                        >
                          {copiedKey === `path-${idx}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeletePath(item.id, item.alias || item.path)}
                          title="Delete from custom mount paths"
                          className="p-1.5 bg-slate-900 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded border border-slate-700/60 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 px-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-xs text-slate-500 space-y-2">
              <FolderPlus className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-400 font-medium">No custom mount paths registered yet.</p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                If auto-discovery does not locate your Samba drive in <code className="text-slate-400 font-mono">/Volumes</code>, enter your mount path above or click one of the quick preset chips to prioritize it during library scans.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Server Credentials Form */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <HardDrive className="w-4 h-4 text-blue-400" />
            Share Configuration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Server IP or Hostname
              </label>
              <input
                type="text"
                placeholder="e.g. 192.168.1.150 or nas.local"
                value={sambaConfig.server}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, server: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Share Directory Name
              </label>
              <input
                type="text"
                placeholder="e.g. media or Movies"
                value={sambaConfig.share}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, share: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 font-mono"
              />
            </div>
          </div>

          {/* Active Direct Mount Path Field */}
          <div className="pt-2">
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-300">
                <FolderOpen className="w-4 h-4 text-blue-400" />
                Active Local Mount Path (Saved in SambaConfig)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">e.g. /Volumes/media or /mnt/media</span>
            </label>
            <input
              type="text"
              placeholder="/Volumes/media or /path/to/share"
              value={sambaConfig.mountPath || ''}
              onChange={(e) => setSambaConfig((prev) => ({ ...prev, mountPath: e.target.value }))}
              className="w-full bg-slate-950 border border-blue-500/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 font-mono"
            />
            <p className="text-[11px] text-slate-300 mt-1">
              If specified, <strong className="text-white">Server IP & Hostname can be left blank</strong>. The scanner reads directly from this local volume path with zero network overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Samba Port
              </label>
              <select
                value={sambaConfig.port}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, port: Number(e.target.value) }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value={445}>445 (SMB Direct over TCP - Recommended)</option>
                <option value={139}>139 (NetBIOS Session Service)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Workgroup / Domain
              </label>
              <input
                type="text"
                placeholder="WORKGROUP"
                value={sambaConfig.workgroup || 'WORKGROUP'}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, workgroup: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Target Operating System
              </label>
              <select
                value={sambaConfig.targetPlatform || 'all'}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, targetPlatform: e.target.value as any }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="all">Universal / Auto</option>
                <option value="macos">macOS (Finder / smb://)</option>
                <option value="linux">Linux (CIFS mount)</option>
                <option value="windows">Windows (UNC Share)</option>
              </select>
            </div>
          </div>

          {/* Authentication Section */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Authentication Credentials
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                <input
                  type="checkbox"
                  checked={sambaConfig.isGuest}
                  onChange={(e) => setSambaConfig((prev) => ({ ...prev, isGuest: e.target.checked }))}
                  className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-950"
                />
                Connect as Anonymous Guest
              </label>
            </div>

            {!sambaConfig.isGuest && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. smbuser"
                    value={sambaConfig.username}
                    onChange={(e) => setSambaConfig((prev) => ({ ...prev, username: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={sambaConfig.password}
                    onChange={(e) => setSambaConfig((prev) => ({ ...prev, password: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mount Commands Tab / Cheatsheet */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              Quick Mount Shortcuts & Terminal Commands
            </h3>

            {/* macOS */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-sky-400" /> macOS Finder Connect (⌘K)
                </span>
                <button
                  onClick={() => handleCopy(macFinderUrl, 'macFinder')}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs transition-colors cursor-pointer"
                >
                  {copiedKey === 'macFinder' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'macFinder' ? 'Copied' : 'Copy URI'}
                </button>
              </div>
              <code className="block text-xs font-mono text-sky-300 bg-slate-900/90 p-2 rounded select-all break-all">
                {macFinderUrl}
              </code>
            </div>

            {/* Linux */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-amber-400" /> Linux Terminal Mount
                </span>
                <button
                  onClick={() => handleCopy(linuxMountCommand, 'linux')}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs transition-colors cursor-pointer"
                >
                  {copiedKey === 'linux' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'linux' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="block text-xs font-mono text-amber-300 bg-slate-900/90 p-2 rounded select-all break-all">
                {linuxMountCommand}
              </code>
            </div>

            {/* Windows */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-purple-400" /> Windows Command Prompt (cmd)
                </span>
                <button
                  onClick={() => handleCopy(windowsMountCommand, 'win')}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs transition-colors cursor-pointer"
                >
                  {copiedKey === 'win' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'win' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="block text-xs font-mono text-purple-300 bg-slate-900/90 p-2 rounded select-all break-all">
                {windowsMountCommand}
              </code>
            </div>
          </div>
        </div>

        {/* Right Column: Connection Audit & Discovered Volumes */}
        <div className="space-y-6">
          {/* Connection Audit Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Connection Diagnostics
            </h3>

            {connectionDetails ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Server Target:</span>
                  <span className="font-mono text-slate-200">{connectionDetails.server}:{connectionDetails.port}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Share Resource:</span>
                  <span className="font-mono text-slate-200">/{connectionDetails.share}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Protocol:</span>
                  <span className="text-slate-200">{connectionDetails.protocol || 'SMB3'}</span>
                </div>
                {connectionDetails.latencyMs && (
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Round-Trip Latency:</span>
                    <span className="text-emerald-400 font-mono">{connectionDetails.latencyMs} ms</span>
                  </div>
                )}
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                  <p className={connectionDetails.connected ? 'text-emerald-400' : 'text-rose-400'}>
                    {connectionDetails.message || connectionDetails.error || (connectionDetails.connected ? 'Probe completed successfully.' : 'Probe failed.')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs">
                Click <strong>"Test Connection"</strong> to run a network socket probe against the configured Samba server.
              </div>
            )}
          </div>

          {/* Mounted Volumes Selector */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-400" />
                Detected System Mounts
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {systemVolumes ? systemVolumes.length : 0} detected
              </span>
            </div>

            {systemVolumes && systemVolumes.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {systemVolumes.map((vol, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (vol.name) {
                        const targetPath = vol.path || `/Volumes/${vol.name}`;
                        setSambaConfig((prev) => ({
                          ...prev,
                          share: vol.name,
                          mountPath: targetPath,
                          baseMountPath: targetPath,
                        }));
                        showTemporarySuccess(`Adopted system volume: "${vol.name}" as active mount path`);
                      }
                    }}
                    className="p-2.5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-lg cursor-pointer transition-colors flex items-center justify-between text-xs group"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <HardDrive className="w-4 h-4 text-slate-400 group-hover:text-blue-400 flex-shrink-0 transition-colors" />
                      <span className="font-medium text-slate-200 truncate">{vol.name}</span>
                    </div>
                    <span className="text-slate-500 font-mono text-[11px] truncate max-w-[120px]">{vol.path}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1.5 text-xs text-slate-400">
                <p>
                  {isDesktopApp
                    ? 'No external SMB network mounts currently detected in standard /Volumes directory.'
                    : 'Desktop bridge active. Mount your Samba share in Finder (⌘K) to index files at full local bus speed.'}
                </p>
                <p className="text-[11px] text-blue-300">
                  Tip: Register your custom local directory in the <strong>Custom Mount Paths</strong> section above.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
