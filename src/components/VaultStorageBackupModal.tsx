import React, { useState } from 'react';
import {
  HardDrive,
  Download,
  Upload,
  Save,
  CheckCircle2,
  AlertCircle,
  FolderSync,
  Database,
  FileCode,
  ShieldCheck,
  RefreshCw,
  X,
  Laptop,
  Clock,
} from 'lucide-react';
import { SambaShareNode, SyncLog, SambaConfig, ClassifierSettings, MediaScanExtensionConfig, MediaMetadata } from '../types';

interface VaultStorageBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  sambaTree: SambaShareNode[];
  syncLogs: SyncLog[];
  sambaConfig: SambaConfig;
  classifierSettings: ClassifierSettings;
  mediaExtensionConfig: MediaScanExtensionConfig;
  mediaLibrary: MediaMetadata[];
  storageInfo?: {
    dataDir?: string;
    dbPath?: string;
    stateFilePath?: string;
    isPermanentHomeLocation?: boolean;
    dbExists?: boolean;
    stateFileExists?: boolean;
    dbSizeBytes?: number;
    stateSizeBytes?: number;
    lastSavedAt?: string | null;
  } | null;
  onRestoreState: (restoredState: any) => void;
  onForceSaveToDisk: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const VaultStorageBackupModal: React.FC<VaultStorageBackupModalProps> = ({
  isOpen,
  onClose,
  sambaTree,
  syncLogs,
  sambaConfig,
  classifierSettings,
  mediaExtensionConfig,
  mediaLibrary,
  storageInfo,
  onRestoreState,
  onForceSaveToDisk,
  showToast,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  if (!isOpen) return null;

  const countSyncedSeries = syncLogs.filter((l) => l.status === 'synced' || l.status === 'verified').length;
  const countFailedSeries = syncLogs.filter((l) => l.status === 'failed' || l.status === 'metadata-missing').length;

  const handleExportBackup = () => {
    try {
      const snapshot = {
        app: 'SambaVault',
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        storageInfo: storageInfo || {},
        state: {
          sambaTree,
          syncLogs,
          sambaConfig,
          classifierSettings,
          mediaExtensionConfig,
          mediaLibrarySummary: {
            totalItems: mediaLibrary.length,
            syncedSeriesCount: countSyncedSeries,
          },
        },
      };

      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `sambavault-synced-state-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Vault backup file downloaded successfully.');
    } catch (err: any) {
      showToast(`Export failed: ${err?.message || err}`);
    }
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        const state = parsed.state || parsed;

        if (!state || (!state.sambaTree && !state.syncLogs && !state.mediaLibrary)) {
          throw new Error('Invalid SambaVault backup JSON format.');
        }

        onRestoreState(state);

        // Also push to persistent backend API
        try {
          await fetch('/api/vault/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot: parsed }),
          });
        } catch {}

        showToast('Vault state restored successfully from backup file!');
        setIsRestoring(false);
      } catch (err: any) {
        setIsRestoring(false);
        showToast(`Restore error: ${err?.message || 'Invalid JSON'}`);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveNow = async () => {
    setIsSaving(true);
    try {
      await onForceSaveToDisk();
      showToast('Vault state saved to persistent storage (~/.sambavault/vault_state.json).');
    } catch (err: any) {
      showToast(`Save error: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Persistent Storage & Synced State Backup
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Survives App Updates
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Preserve synced series, folder trees, and SQLite progress across app re-installs and updates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Storage Location & Persistence Status */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Permanent User Home Location</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                {storageInfo?.isPermanentHomeLocation !== false ? 'Active (~/.sambavault)' : 'Local Project Folder'}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              When updating SambaVault (e.g. deleting the previous version from Applications, Downloads, or extracting a new ZIP), your synced series, folder tree records, and SQLite databases are stored permanently in your user directory:
            </p>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 font-mono text-xs text-indigo-300 break-all select-all flex items-center justify-between">
              <span>{storageInfo?.dataDir || '~/.sambavault'}</span>
              <span className="text-[10px] text-slate-500 font-sans ml-2 shrink-0">Permanent Data Directory</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-center">
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                <div className="text-base font-bold text-emerald-400">{countSyncedSeries}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Synced Series</div>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                <div className="text-base font-bold text-indigo-400">{sambaTree.length}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Root Folders</div>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                <div className="text-base font-bold text-amber-400">{syncLogs.length}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Sync Logs</div>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                <div className="text-base font-bold text-cyan-400">
                  {storageInfo?.dbSizeBytes ? `${Math.round(storageInfo.dbSizeBytes / 1024)} KB` : 'SQLite Active'}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Database Size</div>
              </div>
            </div>

            {storageInfo?.lastSavedAt && (
              <div className="flex items-center text-[11px] text-slate-500 gap-1.5 pt-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Last auto-persisted to disk: {new Date(storageInfo.lastSavedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Export & Import Backup Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Export */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center space-x-2 text-sm font-semibold text-white">
                  <Download className="w-4 h-4 text-indigo-400" />
                  <span>Export Vault Backup (.json)</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Download a portable JSON snapshot containing all synced series states, folder trees, and classifier configurations.
                </p>
              </div>

              <button
                id="vault-export-backup-btn"
                onClick={handleExportBackup}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Backup Snapshot</span>
              </button>
            </div>

            {/* Import / Restore */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${
                dragOver ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-800 bg-slate-950/40'
              }`}
            >
              <div>
                <div className="flex items-center space-x-2 text-sm font-semibold text-white">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>Restore from Backup (.json)</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Drag and drop a previously exported SambaVault JSON file or select from your computer to restore your synced state.
                </p>
              </div>

              <label className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold cursor-pointer border border-slate-700 transition-colors">
                <Upload className="w-4 h-4" />
                <span>{isRestoring ? 'Restoring...' : 'Select Backup File (.json)'}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>
          </div>

          {/* Quick Manual Flush / Save Button */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <Save className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Force immediate sync of all in-memory changes to disk:</span>
            </div>
            <button
              id="vault-force-save-btn"
              onClick={handleSaveNow}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Saving...' : 'Save to Disk Now'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            SambaVault automatically persists changes every few seconds.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
