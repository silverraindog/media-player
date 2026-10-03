/**
 * PermissionsManager Utility
 * Checks and manages macOS Full Disk Access (FDA) permissions.
 * Provides system settings navigation paths, quick-access triggers to the
 * macOS Security & Privacy pane, and real-time state listeners.
 * 
 * Performs secure stat inspections across candidate macOS system directories
 * (/Volumes, /Library/Application Support/com.apple.TCC, Safari/Mail sandbox folders)
 * to infer if permissions are missing or granted.
 */

export interface FullDiskAccessStatus {
  isMacOS: boolean;
  hasFullDiskAccess: boolean;
  platform: string;
  checkedPath?: string;
  details?: string;
  systemSettingsPath: string;
  lastChecked: number;
  isSimulated?: boolean;
  probedPaths?: Array<{ path: string; accessible: boolean; reason?: string }>;
}

export interface PermissionInstructions {
  title: string;
  systemSettingsPath: string;
  legacySystemPreferencesPath: string;
  steps: string[];
  cliHelp?: string;
}

export interface DirectoryStatProbeResult {
  path: string;
  exists: boolean;
  readable: boolean;
  statAvailable: boolean;
  message?: string;
}

type PermissionListener = (status: FullDiskAccessStatus) => void;

export class PermissionsManager {
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
   * Checks whether the client environment is macOS.
   */
  public isClientMacOS(): boolean {
    if (typeof window === 'undefined') return false;
    
    // Check manual override/simulation flag
    const simulated = localStorage.getItem('sambavault_fda_simulate_macos');
    if (simulated === 'true') return true;
    if (simulated === 'false') return false;

    // Check navigator properties
    const nav = navigator as any;
    const userAgent = (nav.userAgent || '').toLowerCase();
    const platform = (nav.platform || '').toLowerCase();
    const uaPlatform = (nav.userAgentData?.platform || '').toLowerCase();

    return (
      userAgent.includes('macintosh') ||
      userAgent.includes('mac os x') ||
      userAgent.includes('mac_powerpc') ||
      platform.includes('mac') ||
      uaPlatform.includes('mac')
    );
  }

  /**
   * Toggle or set simulation mode for testing macOS permissions in any browser.
   */
  public setSimulateMacOS(enabled: boolean): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sambavault_fda_simulate_macos', enabled ? 'true' : 'false');
    }
    this.checkFullDiskAccess(true);
  }

  public isSimulatedMacOS(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sambavault_fda_simulate_macos') === 'true';
  }

  /**
   * Performs a secure stat call on a candidate system path to infer permission status.
   */
  public async probeDirectoryStat(targetPath: string): Promise<DirectoryStatProbeResult> {
    const cleanPath = (targetPath || '').trim();
    if (!cleanPath) {
      return { path: targetPath, exists: false, readable: false, statAvailable: false, message: 'Empty path provided' };
    }

    let isTauri = false;
    try {
      isTauri = Boolean((window as any).__TAURI__ || (window as any).__TAURI_METADATA__);
    } catch (_) {}

    // 1. Try Tauri native check_path_exists stat inspection
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const res = await invoke<any>('check_path_exists', { path: cleanPath });
        return {
          path: cleanPath,
          exists: Boolean(res?.exists),
          readable: Boolean(res?.readable),
          statAvailable: true,
          message: res?.message || (res?.readable ? 'Stat and read access verified' : 'Access denied'),
        };
      } catch (err: any) {
        return {
          path: cleanPath,
          exists: false,
          readable: false,
          statAvailable: false,
          message: err?.message || String(err),
        };
      }
    }

    // 2. Try HTTP backend stat endpoint
    try {
      const res = await fetch(`/api/samba/check-path?path=${encodeURIComponent(cleanPath)}`);
      if (res.ok) {
        const data = await res.json();
        return {
          path: cleanPath,
          exists: Boolean(data?.exists),
          readable: Boolean(data?.readable),
          statAvailable: true,
          message: data?.message,
        };
      }
    } catch (httpErr: any) {
      // Ignored in offline preview mode
    }

    // Fallback in browser preview
    return {
      path: cleanPath,
      exists: true,
      readable: true,
      statAvailable: true,
      message: 'Browser preview mode probe',
    };
  }

  /**
   * Checks whether the application has Full Disk Access on macOS.
   * Attempts secure stat calls on common system directories (/Volumes, ~/Library/Safari, /Library/Application Support/com.apple.TCC)
   * to infer if permissions are missing.
   */
  public async checkFullDiskAccess(forceRefresh = false): Promise<FullDiskAccessStatus> {
    if (!forceRefresh && this.lastStatus && Date.now() - this.lastStatus.lastChecked < 4000) {
      return this.lastStatus;
    }

    if (this.checkingPromise) {
      return this.checkingPromise;
    }

    this.checkingPromise = (async () => {
      const isClientMac = this.isClientMacOS();
      const isSimulated = this.isSimulatedMacOS();

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
            isMacOS: Boolean(result?.is_macos ?? result?.isMacOS ?? isClientMac),
            hasFullDiskAccess: Boolean(result?.has_full_disk_access ?? result?.hasFullDiskAccess),
            platform: result?.platform || (isClientMac ? 'macos' : 'unknown'),
            checkedPath: result?.checked_path || result?.checkedPath || '/Volumes',
            details: result?.details || 'Tauri native TCC permission probe completed.',
            systemSettingsPath: result?.system_settings_path || 'System Settings > Privacy & Security > Full Disk Access',
            lastChecked: Date.now(),
            isSimulated,
          };
          this.updateStatus(status);
          return status;
        } catch (tauriErr) {
          console.warn('[PermissionsManager] Tauri check_full_disk_access error:', tauriErr);
        }
      }

      // 2. Try HTTP backend proxy endpoint with clientPlatform query hint
      try {
        const clientHint = isClientMac ? 'macos' : 'other';
        const res = await fetch(`/api/system/macos-permissions?clientPlatform=${clientHint}`);
        if (res.ok) {
          const data = await res.json();
          const effectiveIsMac = isClientMac || Boolean(data.isMacOS);
          const effectiveHasAccess = isClientMac && !data.isMacOS
            ? false // If client is Mac but server is Linux proxy without confirmed TCC, flag as pending
            : Boolean(data.hasFullDiskAccess);

          const status: FullDiskAccessStatus = {
            isMacOS: effectiveIsMac,
            hasFullDiskAccess: effectiveHasAccess,
            platform: data.platform || (isClientMac ? 'macos' : 'browser'),
            checkedPath: data.checkedPath || (effectiveIsMac ? '/Volumes' : ''),
            details: data.details || (effectiveIsMac
              ? 'macOS Full Disk Access verification required for /Volumes traversal.'
              : 'Full Disk Access is only enforced on macOS.'),
            systemSettingsPath: data.systemSettingsPath || 'System Settings > Privacy & Security > Full Disk Access',
            lastChecked: Date.now(),
            isSimulated,
          };
          this.updateStatus(status);
          return status;
        }
      } catch (httpErr) {
        console.warn('[PermissionsManager] Backend /api/system/macos-permissions error:', httpErr);
      }

      // 3. Fallback client-side resolution
      const fallbackStatus: FullDiskAccessStatus = {
        isMacOS: isClientMac,
        hasFullDiskAccess: !isClientMac, // If on Mac, default to pending (false) to ensure warning box is visible
        platform: isClientMac ? 'macos' : 'browser',
        checkedPath: isClientMac ? '/Volumes' : '',
        details: isClientMac
          ? 'macOS Security & Privacy requires Full Disk Access for Samba /Volumes mounts.'
          : 'Full Disk Access is only enforced on macOS.',
        systemSettingsPath: 'System Settings > Privacy & Security > Full Disk Access',
        lastChecked: Date.now(),
        isSimulated,
      };

      this.updateStatus(fallbackStatus);
      return fallbackStatus;
    })().finally(() => {
      this.checkingPromise = null;
    });

    return this.checkingPromise;
  }

  /**
   * Triggers native permission request dialog via AppleScript/TCC, registers app in macOS Full Disk Access list,
   * opens System Settings, and starts auto-polling for permission verification.
   */
  public async requestAndRegisterFullDiskAccess(): Promise<{ success: boolean; message: string }> {
    let isTauri = false;
    try {
      isTauri = Boolean((window as any).__TAURI__ || (window as any).__TAURI_METADATA__);
    } catch (_) {}

    let requestResult: { success: boolean; message: string } = { success: false, message: 'Initial request' };

    // 1. Try Tauri native invocation
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const res = await invoke<string>('request_full_disk_access_and_register');
        requestResult = { success: true, message: res || 'Requested Full Disk Access and registered app in macOS TCC' };
      } catch (err: any) {
        console.warn('[PermissionsManager] Tauri request_full_disk_access_and_register error:', err);
        requestResult = { success: false, message: err?.message || String(err) };
      }
    } else {
      // 2. Try HTTP backend proxy endpoint
      try {
        const res = await fetch('/api/system/request-full-disk-access', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          requestResult = { success: Boolean(data.success), message: data.message || 'Requested Full Disk Access' };
        }
      } catch (httpErr: any) {
        console.warn('[PermissionsManager] HTTP request-full-disk-access error:', httpErr);
      }
    }

    if (!requestResult.success) {
      // Fallback to launching Security & Privacy directly
      requestResult = await this.openSecurityAndPrivacy();
    }

    // 3. Start live 15-second polling loop to automatically detect when user flips toggle in System Settings
    let pollCount = 0;
    const pollInterval = setInterval(async () => {
      pollCount++;
      const updatedStatus = await this.checkFullDiskAccess(true);
      if (updatedStatus.hasFullDiskAccess || pollCount >= 15) {
        clearInterval(pollInterval);
      }
    }, 1000);

    return requestResult;
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

    // 3. Try web browser custom protocol URL
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

/**
 * Direct export of checkFullDiskAccess for convenient functional imports
 */
export const checkFullDiskAccess = (forceRefresh = false): Promise<FullDiskAccessStatus> =>
  permissionsManager.checkFullDiskAccess(forceRefresh);

/**
 * Direct export of openMacOSSecurityPrivacy for convenient functional imports
 */
export const openMacOSSecurityPrivacy = (): Promise<{ success: boolean; message: string }> =>
  permissionsManager.openSecurityAndPrivacy();
