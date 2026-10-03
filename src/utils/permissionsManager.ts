/**
 * PermissionsManager Utility
 * Checks and manages macOS Full Disk Access (FDA) permissions.
 * Provides system settings navigation paths, quick-access triggers to the
 * macOS Security & Privacy pane, and real-time state listeners.
 */

export interface FullDiskAccessStatus {
  isMacOS: boolean;
  hasFullDiskAccess: boolean;
  platform: string;
  checkedPath?: string;
  details?: string;
  systemSettingsPath: string;
  lastChecked: number;
}

export interface PermissionInstructions {
  title: string;
  systemSettingsPath: string;
  legacySystemPreferencesPath: string;
  steps: string[];
  cliHelp?: string;
}

type PermissionListener = (status: FullDiskAccessStatus) => void;

class PermissionsManager {
  private lastStatus: FullDiskAccessStatus | null = null;
  private listeners: Set<PermissionListener> = new Set();
  private checkingPromise: Promise<FullDiskAccessStatus> | null = null;

  /**
   * System settings instructions for granting Full Disk Access on macOS.
   */
  public getInstructions(): PermissionInstructions {
    return {
      title: 'Grant Full Disk Access on macOS',
      systemSettingsPath: 'System Settings > Privacy & Security > Full Disk Access',
      legacySystemPreferencesPath: 'System Preferences > Security & Privacy > Privacy > Full Disk Access',
      steps: [
        'Open macOS System Settings ( Apple menu > System Settings).',
        'Navigate to Privacy & Security > Full Disk Access in the sidebar.',
        'Locate SambaVault in the application list and toggle the switch to ON (Enabled).',
        'If SambaVault is not in the list, click the "+" button, select SambaVault from Applications, and add it.',
        'Return to SambaVault and click "Verify Permission" to confirm full read/write access to mounted volumes and media shares.',
      ],
      cliHelp: 'If running in development mode, grant Full Disk Access to Terminal / iTerm2 / VS Code or your Node.js runtime executable.',
    };
  }

  /**
   * Checks whether the application has Full Disk Access on macOS.
   */
  public async checkFullDiskAccess(forceRefresh = false): Promise<FullDiskAccessStatus> {
    if (!forceRefresh && this.lastStatus && Date.now() - this.lastStatus.lastChecked < 5000) {
      return this.lastStatus;
    }

    if (this.checkingPromise) {
      return this.checkingPromise;
    }

    this.checkingPromise = (async () => {
      let isTauri = false;
      try {
        isTauri = Boolean((window as any).__TAURI__ || (window as any).__TAURI_METADATA__);
      } catch (_) {}

      // 1. Try Tauri native command first
      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/tauri');
          const result = await invoke<any>('check_full_disk_access');
          const status: FullDiskAccessStatus = {
            isMacOS: Boolean(result?.is_macos ?? result?.isMacOS),
            hasFullDiskAccess: Boolean(result?.has_full_disk_access ?? result?.hasFullDiskAccess),
            platform: result?.platform || 'macos',
            checkedPath: result?.checked_path || result?.checkedPath || '/Volumes',
            details: result?.details || 'Tauri native TCC permission probe completed.',
            systemSettingsPath: result?.system_settings_path || 'System Settings > Privacy & Security > Full Disk Access',
            lastChecked: Date.now(),
          };
          this.updateStatus(status);
          return status;
        } catch (tauriErr) {
          console.warn('[PermissionsManager] Tauri check_full_disk_access error:', tauriErr);
        }
      }

      // 2. Try HTTP backend proxy endpoint
      try {
        const res = await fetch('/api/system/macos-permissions');
        if (res.ok) {
          const data = await res.json();
          const status: FullDiskAccessStatus = {
            isMacOS: Boolean(data.isMacOS),
            hasFullDiskAccess: Boolean(data.hasFullDiskAccess),
            platform: data.platform || 'macos',
            checkedPath: data.checkedPath,
            details: data.details,
            systemSettingsPath: data.systemSettingsPath || 'System Settings > Privacy & Security > Full Disk Access',
            lastChecked: Date.now(),
          };
          this.updateStatus(status);
          return status;
        }
      } catch (httpErr) {
        console.warn('[PermissionsManager] Backend /api/system/macos-permissions error:', httpErr);
      }

      // 3. Fallback browser / platform detection
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
      const isMac = userAgent.includes('macintosh') || userAgent.includes('mac os x');
      const fallbackStatus: FullDiskAccessStatus = {
        isMacOS: isMac,
        hasFullDiskAccess: !isMac, // Assume ok if not mac, prompt if mac
        platform: isMac ? 'macos' : 'browser',
        checkedPath: isMac ? '/Volumes' : '',
        details: isMac
          ? 'Browser preview mode: grant Full Disk Access to your local browser/runtime to scan /Volumes Samba mounts.'
          : 'Full Disk Access is only enforced on macOS.',
        systemSettingsPath: 'System Settings > Privacy & Security > Full Disk Access',
        lastChecked: Date.now(),
      };
      this.updateStatus(fallbackStatus);
      return fallbackStatus;
    })().finally(() => {
      this.checkingPromise = null;
    });

    return this.checkingPromise;
  }

  /**
   * Opens the macOS Security & Privacy pane directly to the Full Disk Access section.
   */
  public async openSecurityAndPrivacy(): Promise<{ success: boolean; message: string }> {
    let isTauri = false;
    try {
      isTauri = Boolean((window as any).__TAURI__ || (window as any).__TAURI_METADATA__);
    } catch (_) {}

    // 1. Try Tauri native invocation
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const res = await invoke<string>('open_macos_security_privacy');
        return { success: true, message: res || 'Opened macOS Security & Privacy pane' };
      } catch (err: any) {
        console.warn('[PermissionsManager] Tauri open_macos_security_privacy error:', err);
      }
    }

    // 2. Try HTTP backend proxy endpoint
    try {
      const res = await fetch('/api/system/open-security-privacy', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        return { success: true, message: data.message || 'Opened macOS System Settings' };
      }
    } catch (httpErr) {
      console.warn('[PermissionsManager] HTTP open-security-privacy error:', httpErr);
    }

    // 3. Try web browser custom protocol URL or window.open
    try {
      window.location.href = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
      return {
        success: true,
        message: 'Launched macOS System Settings url handler (x-apple.systempreferences:).',
      };
    } catch (e: any) {
      return {
        success: false,
        message: 'Could not open System Settings automatically. Please open  > System Settings > Privacy & Security > Full Disk Access manually.',
      };
    }
  }

  /**
   * Subscribe to permission changes.
   */
  public subscribe(listener: PermissionListener): () => void {
    this.listeners.add(listener);
    if (this.lastStatus) {
      listener(this.lastStatus);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getCachedStatus(): FullDiskAccessStatus | null {
    return this.lastStatus;
  }

  private updateStatus(status: FullDiskAccessStatus) {
    this.lastStatus = status;
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (e) {
        console.error('[PermissionsManager] Listener notification error:', e);
      }
    });
  }
}

export const permissionsManager = new PermissionsManager();
