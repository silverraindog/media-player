// Helper to interact with native Tauri backend when running as desktop app,
// with safe fallback when running in browser preview mode.

export interface VolumeMountInfo {
  isMounted: boolean;
  mountPath: string;
  files: string[];
  permissionDenied?: boolean;
  errorDetails?: string | null;
}

export interface NetworkProbeResult {
  reachable: boolean;
  latencyMs: number;
  message: string;
}

export interface MountActionResult {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
}

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_IPC__' in window;
};

export const checkMacVolume = async (shareName: string): Promise<VolumeMountInfo> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const result = await invoke<any>('check_volume_mounted', { shareName });
      
      const isMounted = Boolean(result?.is_mounted ?? result?.isMounted);
      const permissionDenied = Boolean(result?.permission_denied ?? result?.permissionDenied);
      const errorDetails = result?.error_details ?? result?.errorDetails ?? null;
      const mountPath = result?.mount_path ?? result?.mountPath ?? `/Volumes/${shareName}`;
      const files = result?.files ?? [];

      if (permissionDenied) {
        console.error(
          `[SambaVault Volume Scanner] Permission Denied accessing /Volumes or ${mountPath}. ` +
          `macOS sandbox or privacy settings blocked filesystem read. Details: ${errorDetails}`
        );
      } else if (errorDetails && !isMounted) {
        console.info(`[SambaVault Volume Scanner] Share inspection: ${errorDetails}`);
      }

      return {
        isMounted,
        mountPath,
        files,
        permissionDenied,
        errorDetails,
      };
    } catch (e: any) {
      console.error('[SambaVault Volume Scanner] Tauri invoke check_volume_mounted error:', e);
      return {
        isMounted: false,
        mountPath: `/Volumes/${shareName}`,
        files: [],
        permissionDenied: true,
        errorDetails: e?.message || 'Unknown IPC failure during volume scan',
      };
    }
  }

  // Browser preview fallback / mock check
  return {
    isMounted: false,
    mountPath: `/Volumes/${shareName}`,
    files: [],
    permissionDenied: false,
    errorDetails: 'Running in browser preview mode; native filesystem not attached.',
  };
};

export const attemptMountSambaShare = async (params: {
  server: string;
  share: string;
  port?: number;
  username?: string;
  password?: string;
  isGuest?: boolean;
}): Promise<MountActionResult> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const result = await invoke<any>('mount_samba_share', {
        server: params.server,
        share: params.share,
        port: params.port || 445,
        username: params.username || '',
        password: params.password || '',
        isGuest: Boolean(params.isGuest),
      });

      return {
        success: Boolean(result?.success),
        message: result?.message || (result?.success ? 'Mounted share successfully' : 'Mount command failed'),
        stdout: result?.stdout || '',
        stderr: result?.stderr || '',
      };
    } catch (e: any) {
      console.error('[SambaVault Mount] Tauri invoke mount_samba_share error:', e);
      return {
        success: false,
        message: `Mount invocation failed: ${e?.message || e}`,
        stderr: String(e),
      };
    }
  }

  // Browser fallback
  return {
    success: true,
    message: `[Preview Mode] Simulated system mount command (mount_smbfs //${params.username || 'guest'}@${params.server}:${params.port || 445}/${params.share} /Volumes/${params.share})`,
  };
};

export const listMountedVolumes = async (): Promise<string[]> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const volumes = await invoke<string[]>('list_mounted_volumes');
      return volumes || [];
    } catch (e) {
      console.warn('Tauri invoke list_mounted_volumes failed:', e);
    }
  }
  return [];
};

export const probeLocalNetwork = async (host: string, port: number): Promise<NetworkProbeResult> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const result = await invoke<any>('probe_local_port', { host, port });
      return {
        reachable: Boolean(result?.reachable),
        latencyMs: Number(result?.latency_ms ?? result?.latencyMs ?? 0),
        message: result?.message || '',
      };
    } catch (e) {
      console.warn('Tauri probe_local_port failed:', e);
    }
  }

  // Fallback to server endpoint
  try {
    const res = await fetch('/api/samba/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: host, share: 'test', port }),
    });
    const data = await res.json();
    return {
      reachable: Boolean(data.connected),
      latencyMs: data.latencyMs || 0,
      message: data.message || (data.connected ? 'Reachable' : 'Unreachable'),
    };
  } catch (err: any) {
    return {
      reachable: false,
      latencyMs: 0,
      message: err.message || 'Failed to probe network',
    };
  }
};

export interface ScannedShareItem {
  name: string;
  rel_path: string;
  is_dir: boolean;
  size_str?: string;
  extension?: string;
}

export interface ScanVolumeResult {
  success: boolean;
  mountPath: string;
  items: ScannedShareItem[];
  totalScanned: number;
  error?: string | null;
}

export const scanSambaVolume = async (
  shareName: string,
  customPath?: string
): Promise<ScanVolumeResult> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const result = await invoke<any>('scan_samba_volume', {
        shareName,
        customPath: customPath || null,
      });
      return {
        success: Boolean(result?.success),
        mountPath: result?.mount_path || `/Volumes/${shareName}`,
        items: result?.items || [],
        totalScanned: result?.total_scanned || (result?.items?.length ?? 0),
        error: result?.error || null,
      };
    } catch (e: any) {
      console.error('[SambaVault Scanner] Tauri invoke scan_samba_volume failed:', e);
      return {
        success: false,
        mountPath: `/Volumes/${shareName}`,
        items: [],
        totalScanned: 0,
        error: e?.message || String(e),
      };
    }
  }

  // Preview fallback: simulate scanner
  return {
    success: false,
    mountPath: `/Volumes/${shareName}`,
    items: [],
    totalScanned: 0,
    error: 'Preview mode: Native volume scan runs when running in desktop mode on mounted share.',
  };
};
