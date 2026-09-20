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

export const performFastScan = async (
  rootPath: string,
  onProgress?: (scannedCount: number, currentFile: string) => void
): Promise<ScanVolumeResult> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const { listen } = await import('@tauri-apps/api/event');

      if (onProgress) {
        const unlisten = await listen<any>('scan-progress', (event) => {
          if (event && event.payload) {
            onProgress(event.payload.scanned_count || 0, event.payload.current_file || '');
          }
        });
        // cleanup listener after scan
        setTimeout(() => {
          try {
            unlisten();
          } catch (e) {}
        }, 120000);
      }

      const result = await invoke<any>('perform_fast_scan', { rootPath });
      const items = (result || []).map((it: any) => ({
        name: it.name,
        rel_path: it.rel_path,
        is_dir: it.is_dir,
        size_str: `${Math.round((it.size || 0) / (1024 * 1024))} MB`,
      }));

      return {
        success: true,
        mountPath: rootPath,
        items,
        totalScanned: items.length,
      };
    } catch (e: any) {
      console.error('[SambaVault Rust Scanner] Tauri invoke perform_fast_scan failed:', e);
      return {
        success: false,
        mountPath: rootPath,
        items: [],
        totalScanned: 0,
        error: e?.message || String(e),
      };
    }
  }

  return {
    success: false,
    mountPath: rootPath,
    items: [],
    totalScanned: 0,
    error: 'Preview mode: perform_fast_scan requires Tauri desktop environment with Rust backend.',
  };
};

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

export const openInSystemPlayer = async (filePath: string): Promise<{ success: boolean; message: string }> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const res = await invoke<string>('open_in_system_player', { filePath });
      return { success: true, message: res || 'Launched system media player' };
    } catch (e: any) {
      console.warn('open_in_system_player error:', e);
      return { success: false, message: e?.message || String(e) };
    }
  }
  return { success: false, message: 'External player launch is available in desktop app mode' };
};

export const openInVlc = async (filePath: string): Promise<{ success: boolean; message: string }> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const res = await invoke<string>('open_in_vlc', { filePath });
      return { success: true, message: res || 'Launched VLC' };
    } catch (e: any) {
      console.warn('open_in_vlc error:', e);
      return { success: false, message: e?.message || String(e) };
    }
  }
  // Browser fallback - open vlc:// protocol URL
  try {
    window.open(`vlc://${filePath}`, '_blank');
    return { success: true, message: 'Dispatched VLC URI protocol' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to dispatch VLC URI' };
  }
};

export const openInIina = async (filePath: string): Promise<{ success: boolean; message: string }> => {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const res = await invoke<string>('open_in_iina', { filePath });
      return { success: true, message: res || 'Launched IINA' };
    } catch (e: any) {
      console.warn('open_in_iina error:', e);
      return { success: false, message: e?.message || String(e) };
    }
  }
  // Browser fallback - open iina:// protocol URL
  try {
    window.open(`iina://weblink?url=${encodeURIComponent(filePath)}`, '_blank');
    return { success: true, message: 'Dispatched IINA URI protocol' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to dispatch IINA URI' };
  }
};

export const getAllMediaFromTauriDb = async (): Promise<any[]> => {
  if (!isTauriEnvironment()) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/tauri');
    const items = await invoke<any[]>('get_all_media');
    if (!Array.isArray(items)) return [];
    return items.map((it) => {
      let genres: string[] = ['Media'];
      try {
        if (it.genres) genres = JSON.parse(it.genres);
      } catch {
        if (it.genres) genres = [it.genres];
      }
      return {
        id: it.id,
        type: it.media_type || 'series',
        title: it.title,
        originalTitle: it.original_title || it.title,
        overview: it.synopsis || '',
        year: it.year || new Date().getFullYear(),
        rating: it.rating || 0,
        posterUrl: it.poster_url || '',
        fanartUrl: it.fanart_url || it.poster_url || '',
        genres,
        recommendedFolderStructure: it.recommended_folder || `${it.media_type === 'series' ? 'Series' : 'Films'}/${it.title}/`,
        recommendedFilenames: [],
        source: 'sqlite-vault',
      };
    });
  } catch (err) {
    console.warn('getAllMediaFromTauriDb error:', err);
    return [];
  }
};

export const saveMediaToTauriDb = async (media: any): Promise<boolean> => {
  if (!isTauriEnvironment()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/tauri');
    const dbItem = {
      id: media.id || `media-${Date.now()}`,
      media_type: media.type || 'series',
      title: media.title,
      original_title: media.originalTitle || media.title,
      synopsis: media.overview || media.synopsis || media.tagline || media.title || '',
      year: media.year || null,
      rating: media.rating || null,
      poster_url: media.posterUrl || null,
      fanart_url: media.fanartUrl || null,
      genres: Array.isArray(media.genres) ? JSON.stringify(media.genres) : media.genres || null,
      cast: media.cast ? JSON.stringify(media.cast) : null,
      recommended_folder: media.recommendedFolderStructure || null,
      raw_data: JSON.stringify(media),
      file_size_bytes: null,
      created_at: null,
      updated_at: null,
    };
    await invoke('save_media', { media: dbItem });
    return true;
  } catch (err) {
    console.warn('saveMediaToTauriDb error:', err);
    return false;
  }
};

export interface PathValidationResult {
  resolvedPath: string;
  protocol: 'file' | 'smb' | 'http' | 'custom';
  platform: 'macos' | 'windows' | 'linux' | 'browser';
  isAbsolute: boolean;
  valid: boolean;
  message: string;
}

export const validateSambaPlaybackPath = (
  rawPathOrUrl: string,
  sambaConfig: { server?: string; share?: string; mountPath?: string } = {}
): PathValidationResult => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const isWin = ua.includes('win');
  const isMac = ua.includes('mac');
  const platform = isWin ? 'windows' : isMac ? 'macos' : 'linux';

  if (!rawPathOrUrl) {
    return {
      resolvedPath: '',
      protocol: 'custom',
      platform,
      isAbsolute: false,
      valid: false,
      message: 'Empty path provided',
    };
  }

  // If already an HTTP stream URL
  if (rawPathOrUrl.startsWith('http://') || rawPathOrUrl.startsWith('https://')) {
    return {
      resolvedPath: rawPathOrUrl,
      protocol: 'http',
      platform,
      isAbsolute: true,
      valid: true,
      message: 'Streaming via HTTP/S proxy endpoint',
    };
  }

  // If SMB protocol URL
  if (rawPathOrUrl.startsWith('smb://') || rawPathOrUrl.startsWith('smb:\\')) {
    return {
      resolvedPath: rawPathOrUrl,
      protocol: 'smb',
      platform,
      isAbsolute: true,
      valid: true,
      message: 'Direct SMB network protocol URI',
    };
  }

  // If file protocol URL
  if (rawPathOrUrl.startsWith('file://')) {
    return {
      resolvedPath: rawPathOrUrl,
      protocol: 'file',
      platform,
      isAbsolute: true,
      valid: true,
      message: 'Local file URI protocol',
    };
  }

  const server = sambaConfig.server || 'nas.local';
  const share = sambaConfig.share || 'media';
  const cleanPath = rawPathOrUrl.replace(/^[/\\]+/, '');

  let resolvedPath = rawPathOrUrl;
  let isAbsolute = false;

  if (isMac) {
    resolvedPath = sambaConfig.mountPath || `/Volumes/${share}/${cleanPath}`;
    isAbsolute = resolvedPath.startsWith('/');
  } else if (isWin) {
    const uncShare = `\\\\${server}\\${share}`;
    resolvedPath = `${uncShare}\\${cleanPath.replace(/\//g, '\\')}`;
    isAbsolute = resolvedPath.startsWith('\\\\');
  } else {
    resolvedPath = `/mnt/samba/${share}/${cleanPath}`;
    isAbsolute = resolvedPath.startsWith('/');
  }

  return {
    resolvedPath,
    protocol: 'file',
    platform,
    isAbsolute,
    valid: true,
    message: `Resolved for ${platform}: ${resolvedPath}`,
  };
};


