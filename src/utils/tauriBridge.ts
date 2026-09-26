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

export interface DirectoryDepthStats {
  dirPath: string;
  depth: number;
  directFiles: number;
  totalSubtreeFiles: number;
  directDirectories: number;
  extensions: Record<string, number>;
  sampleFiles: string[];
}

export interface ScanDepthDiagnosticReport {
  scannerName: string;
  rootPath: string;
  durationMs?: number;
  totalDiscoveredItems: number;
  totalFiles: number;
  totalDirectories: number;
  maxDepthReached: number;
  depthHistogram: Record<number, { directories: number; files: number }>;
  extensionSummary: Record<string, number>;
  visitedDirectories: DirectoryDepthStats[];
  emptyDirectories: string[];
  potentialBarriers: string[];
  isExactly25Files: boolean;
}

export interface ScanVolumeResult {
  success: boolean;
  mountPath: string;
  items: ScannedShareItem[];
  totalScanned: number;
  error?: string | null;
  diagnostics?: ScanDepthDiagnosticReport;
}

/**
 * Deep-dive diagnostic analyzer and logger that tracks folder discovery depth,
 * file distribution, file extensions, and hidden barriers (e.g. depth caps,
 * 25-file throttle boundaries, permissions blocks, or timeout truncations).
 */
export function logDirectoryTraversalDiagnostics(
  scannerName: string,
  rootPath: string,
  items: ScannedShareItem[],
  durationMs?: number,
  options?: { safeScan?: boolean; timeoutMs?: number }
): ScanDepthDiagnosticReport {
  const dirMap = new Map<string, DirectoryDepthStats>();
  const extensionSummary: Record<string, number> = {};
  const depthHistogram: Record<number, { directories: number; files: number }> = {};

  // Ensure root directory entry exists
  dirMap.set('.', {
    dirPath: rootPath || '/',
    depth: 0,
    directFiles: 0,
    totalSubtreeFiles: 0,
    directDirectories: 0,
    extensions: {},
    sampleFiles: [],
  });

  const fileItems = (items || []).filter((it) => !it.is_dir);
  const dirItems = (items || []).filter((it) => it.is_dir);

  // 1. Ingest explicit directory items and compute initial directory depths
  for (const item of dirItems) {
    const rawPath = item.rel_path || item.name || '';
    const cleanDir = rawPath.replace(/^[/\\]+|[/\\]+$/g, '').replace(/\\/g, '/');
    if (!cleanDir || cleanDir === '.') continue;
    const segments = cleanDir.split('/').filter(Boolean);
    const depth = segments.length;

    if (!dirMap.has(cleanDir)) {
      dirMap.set(cleanDir, {
        dirPath: cleanDir,
        depth,
        directFiles: 0,
        totalSubtreeFiles: 0,
        directDirectories: 0,
        extensions: {},
        sampleFiles: [],
      });
    }

    // Register this folder as direct child of its immediate parent
    const parentDir = segments.length > 1 ? segments.slice(0, -1).join('/') : '.';
    if (!dirMap.has(parentDir)) {
      dirMap.set(parentDir, {
        dirPath: parentDir === '.' ? (rootPath || '/') : parentDir,
        depth: parentDir === '.' ? 0 : segments.length - 1,
        directFiles: 0,
        totalSubtreeFiles: 0,
        directDirectories: 0,
        extensions: {},
        sampleFiles: [],
      });
    }
    dirMap.get(parentDir)!.directDirectories += 1;
  }

  // 2. Ingest files, populate per-directory counts, extensions, sample items, and depth trees
  for (const file of fileItems) {
    const cleanRelPath = (file.rel_path || file.name || '').replace(/^[/\\]+/g, '').replace(/\\/g, '/');
    const segments = cleanRelPath.split('/').filter(Boolean);
    const fileName = segments[segments.length - 1] || file.name || '';
    const extMatch = fileName.match(/\.([0-9a-z_-]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'no_ext';

    // Global extension tally
    extensionSummary[ext] = (extensionSummary[ext] || 0) + 1;

    const parentSegments = segments.slice(0, -1);
    const fileDepth = parentSegments.length;

    if (parentSegments.length === 0) {
      // Direct root file
      const rootEntry = dirMap.get('.')!;
      rootEntry.directFiles += 1;
      rootEntry.totalSubtreeFiles += 1;
      rootEntry.extensions[ext] = (rootEntry.extensions[ext] || 0) + 1;
      if (rootEntry.sampleFiles.length < 5) rootEntry.sampleFiles.push(fileName);
    } else {
      const directParent = parentSegments.join('/');
      if (!dirMap.has(directParent)) {
        dirMap.set(directParent, {
          dirPath: directParent,
          depth: fileDepth,
          directFiles: 0,
          totalSubtreeFiles: 0,
          directDirectories: 0,
          extensions: {},
          sampleFiles: [],
        });
      }
      const directParentEntry = dirMap.get(directParent)!;
      directParentEntry.directFiles += 1;
      directParentEntry.extensions[ext] = (directParentEntry.extensions[ext] || 0) + 1;
      if (directParentEntry.sampleFiles.length < 5) directParentEntry.sampleFiles.push(fileName);

      // Accumulate file count for each ancestor directory
      let accumulated = '';
      for (let i = 0; i < parentSegments.length; i++) {
        accumulated = accumulated ? `${accumulated}/${parentSegments[i]}` : parentSegments[i];
        if (!dirMap.has(accumulated)) {
          dirMap.set(accumulated, {
            dirPath: accumulated,
            depth: i + 1,
            directFiles: 0,
            totalSubtreeFiles: 0,
            directDirectories: 0,
            extensions: {},
            sampleFiles: [],
          });
        }
        dirMap.get(accumulated)!.totalSubtreeFiles += 1;
      }

      // Root ancestor tally
      dirMap.get('.')!.totalSubtreeFiles += 1;
    }
  }

  // Sort visited directories by depth, then alphabetically
  const visitedDirectories = Array.from(dirMap.values()).sort((a, b) =>
    a.depth !== b.depth ? a.depth - b.depth : a.dirPath.localeCompare(b.dirPath)
  );

  const totalFiles = fileItems.length;
  const totalDirectories = dirItems.length > 0 ? dirItems.length : visitedDirectories.length - 1;
  const maxDepthReached = visitedDirectories.reduce((max, d) => Math.max(max, d.depth), 0);

  // Compute depth histogram
  visitedDirectories.forEach((d) => {
    if (!depthHistogram[d.depth]) {
      depthHistogram[d.depth] = { directories: 0, files: 0 };
    }
    if (d.depth > 0) depthHistogram[d.depth].directories += 1;
    depthHistogram[d.depth].files += d.directFiles;
  });

  // Identify empty directories (discovered folders with 0 files directly and in subtree)
  const emptyDirectories = visitedDirectories
    .filter((d) => d.depth > 0 && d.totalSubtreeFiles === 0 && d.directFiles === 0)
    .map((d) => d.dirPath);

  // 3. Automated Barrier and Limit Detection Engine
  const potentialBarriers: string[] = [];

  // Barrier 1: Exactly 25 files check
  const isExactly25Files = totalFiles === 25;
  if (isExactly25Files) {
    potentialBarriers.push(
      'SYNC BARRIER DETECTED: Exactly 25 files were discovered. This matches common progress throttle intervals (count % 25 == 0) or mock catalog fallback limits. Check if the scan timed out prematurely or hit a depth boundary.'
    );
  }

  // Barrier 2: Shallow Max Depth Barrier (e.g. depth <= 2 while TV Series / Music require depth 3-5)
  if (maxDepthReached <= 2 && totalFiles > 0) {
    potentialBarriers.push(
      `DEPTH BARRIER WARNING: Max traversal depth reached was only ${maxDepthReached}. Standard Samba series structures (Series/Show/Season 01/Episode.mkv) and music albums (Music/Artist/Album/Track.flac) require depth >= 3 or 4. Verify max_depth or safeScan settings.`
    );
  }

  // Barrier 3: High count of empty directories
  if (emptyDirectories.length > 5) {
    potentialBarriers.push(
      `DIRECTORY BARRIER: ${emptyDirectories.length} subdirectories returned 0 media files (e.g., "${emptyDirectories.slice(0, 3).join('", "')}"). Check for permission restrictions, symlinks, or unsupported file extensions.`
    );
  }

  // Barrier 4: Timeout or Duration Warning
  if (durationMs && durationMs > 5000 && totalFiles < 50) {
    potentialBarriers.push(
      `LATENCY BARRIER: Scan took ${(durationMs / 1000).toFixed(2)}s for only ${totalFiles} files. Network latency or SMB socket timeouts may be throttling traversal speed.`
    );
  }

  const report: ScanDepthDiagnosticReport = {
    scannerName,
    rootPath,
    durationMs,
    totalDiscoveredItems: items?.length || 0,
    totalFiles,
    totalDirectories,
    maxDepthReached,
    depthHistogram,
    extensionSummary,
    visitedDirectories,
    emptyDirectories,
    potentialBarriers,
    isExactly25Files,
  };

  // Structured Console Diagnostic Groups
  console.group(`🔍 [${scannerName}] Deep-Dive Samba Scan Diagnostics | Root: "${rootPath}"`);
  console.info(
    `📊 [${scannerName}] Summary: Discovered ${totalFiles} file(s) across ${visitedDirectories.length} directory node(s) ` +
      `(Max Depth: ${maxDepthReached}${durationMs ? ` in ${(durationMs / 1000).toFixed(2)}s` : ''}).`
  );

  console.groupCollapsed(`📁 [${scannerName}] Folder Depth Tree & File Counts (${visitedDirectories.length} nodes)`);
  visitedDirectories.forEach((dir) => {
    const indent = '  '.repeat(dir.depth);
    const extList = Object.entries(dir.extensions)
      .map(([ext, count]) => `${count} .${ext}`)
      .join(', ');
    console.log(
      `${indent}📂 [Depth ${dir.depth}] "${dir.dirPath}" ➔ Direct Files: ${dir.directFiles} (Subtree Total: ${dir.totalSubtreeFiles})${extList ? ` [${extList}]` : ''}${dir.sampleFiles.length > 0 ? ` (e.g. ${dir.sampleFiles.slice(0, 2).join(', ')})` : ''}`
    );
  });
  console.groupEnd();

  console.groupCollapsed(`📈 [${scannerName}] Depth Histogram & Extension Breakdown`);
  console.table(
    Object.entries(depthHistogram).map(([depth, stats]) => ({
      Depth: Number(depth),
      Directories: stats.directories,
      'Direct Files': stats.files,
    }))
  );
  console.log(`📦 Extension Breakdown:`, extensionSummary);
  console.groupEnd();

  if (potentialBarriers.length > 0) {
    console.group(`⚠️ [${scannerName}] Potential Sync Barriers & Bottlenecks (${potentialBarriers.length})`);
    potentialBarriers.forEach((barrier, idx) => {
      console.warn(`[Barrier ${idx + 1}] ${barrier}`);
    });
    console.groupEnd();
  }

  console.groupEnd();

  return report;
}

export const performFastScan = async (
  rootPath: string,
  onProgress?: (scannedCount: number, currentFile: string) => void,
  timeoutMs = 180000,
  safeScan = false,
  max_depth?: number
): Promise<ScanVolumeResult> => {
  const startTime = performance.now();
  const effectiveMaxDepth = typeof max_depth === 'number' && max_depth > 0 ? max_depth : safeScan ? 20 : 60;

  console.log(
    `[recursive_limit] performFastScan initialized: target="${rootPath}", max_depth=${effectiveMaxDepth}, safeScan=${safeScan}, timeoutMs=${timeoutMs}`
  );

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const { listen } = await import('@tauri-apps/api/event');

      let unlistenFn: (() => void) | null = null;
      let streamedEventCount = 0;

      if (onProgress) {
        unlistenFn = await listen<any>('scan-progress', (event) => {
          if (event && event.payload) {
            streamedEventCount++;
            const count = event.payload.scanned_count || 0;
            const file = event.payload.current_file || '';
            if (file) {
              const clean = file.replace(/^[/\\]+/g, '').replace(/\\/g, '/');
              const parts = clean.split('/').filter(Boolean);
              const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : rootPath;
              const depth = parts.length > 1 ? parts.length - 1 : 0;
              console.log(
                `[performFastScan:StreamEvent #${streamedEventCount}] Visited dir: "${dir}" | Depth: ${depth} | Discovered items: ${count} | Item: "${file}"`
              );
              if (count === 25) {
                console.log(
                  `[recursive_limit] Stream reached item #25 boundary. Continuing traversal to audit items #26+...`
                );
              }
            }
            onProgress(count, file);
          }
        });
      }

      // Race invoke against timeout to prevent hanging forever if unmounted
      const invokePromise = invoke<any>('perform_fast_scan', {
        rootPath,
        root_path: rootPath,
        safeScan,
        safe_scan: safeScan,
        maxDepth: effectiveMaxDepth,
        max_depth: effectiveMaxDepth,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Native scan timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      let result: any = null;
      try {
        result = await Promise.race([invokePromise, timeoutPromise]);
      } catch (timeoutErr: any) {
        const elapsed = Math.round(performance.now() - startTime);
        console.warn(`[SambaVault Rust Scanner] Scan timed out or failed after ${elapsed}ms:`, timeoutErr);
        console.warn(
          `[recursive_limit] Native scan interrupted at elapsed ${elapsed}ms before completion. Check for backend timeout or unmounted SMB socket.`
        );
        throw timeoutErr;
      } finally {
        try {
          unlistenFn?.();
        } catch (e) {}
      }

      const durationMs = Math.round(performance.now() - startTime);
      const items = (result || []).map((it: any) => ({
        name: it.name,
        rel_path: it.rel_path,
        is_dir: it.is_dir,
        size_str: `${Math.round((it.size || 0) / (1024 * 1024))} MB`,
      }));

      console.log(
        `[recursive_limit] performFastScan completed in ${durationMs}ms: retrieved ${items.length} items with max_depth=${effectiveMaxDepth}. ` +
          (items.length === 25
            ? '⚠️ RESULT CONTAINS EXACTLY 25 ITEMS. Auditing for silent termination / buffer limit.'
            : `✅ Successfully bypassed 25-item boundary with ${items.length} discovered items.`)
      );

      // Deep-dive recursive depth and barrier analysis
      const diagnostics = logDirectoryTraversalDiagnostics(
        'performFastScan:NativeTauri',
        rootPath,
        items,
        durationMs,
        { safeScan, timeoutMs }
      );

      return {
        success: true,
        mountPath: rootPath,
        items,
        totalScanned: items.length,
        diagnostics,
      };
    } catch (e: any) {
      const durationMs = Math.round(performance.now() - startTime);
      console.error('[SambaVault Rust Scanner] Tauri invoke perform_fast_scan failed or timed out:', e);
      console.log(
        `[recursive_limit] performFastScan errored in ${durationMs}ms: max_depth=${effectiveMaxDepth}, error="${e?.message || e}"`
      );
      return {
        success: false,
        mountPath: rootPath,
        items: [],
        totalScanned: 0,
        error: e?.message || String(e),
      };
    }
  }

  // Browser fallback using recursive Express backend API
  try {
    const response = await fetch('/api/samba/scan-volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sharePath: rootPath,
        max_depth: effectiveMaxDepth,
        maxDepth: effectiveMaxDepth,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.items) {
        const durationMs = Math.round(performance.now() - startTime);

        if (onProgress) {
          data.items.forEach((item: any, idx: number) => {
            if (!item.is_dir) {
              const clean = (item.rel_path || '').replace(/^[/\\]+/g, '').replace(/\\/g, '/');
              const parts = clean.split('/').filter(Boolean);
              const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : rootPath;
              const depth = parts.length > 1 ? parts.length - 1 : 0;
              onProgress(idx + 1, item.rel_path);
            }
          });
        }

        console.log(
          `[recursive_limit] performFastScan (Browser Fallback) completed in ${durationMs}ms: retrieved ${data.items.length} items with max_depth=${effectiveMaxDepth}. ` +
            (data.items.length === 25
              ? '⚠️ RESULT CONTAINS EXACTLY 25 ITEMS.'
              : `✅ Successfully retrieved ${data.items.length} items.`)
        );

        // Deep-dive recursive depth and barrier analysis for browser fallback
        const diagnostics = logDirectoryTraversalDiagnostics(
          'performFastScan:BrowserFallback',
          rootPath,
          data.items,
          durationMs,
          { safeScan, timeoutMs }
        );

        return {
          success: true,
          mountPath: rootPath,
          items: data.items,
          totalScanned: data.totalScanned || data.items.length,
          diagnostics,
        };
      }
    }
  } catch (e: any) {
    console.warn('[performFastScan Fallback] API error:', e);
  }

  return {
    success: false,
    mountPath: rootPath,
    items: [],
    totalScanned: 0,
    error: 'Preview mode API fallback failed.',
  };
};

export const scanSambaVolume = async (
  shareName: string,
  customPath?: string,
  timeoutMs = 180000,
  safeScan = false,
  max_depth?: number
): Promise<ScanVolumeResult> => {
  const startTime = performance.now();
  const mountLocation = customPath || `/Volumes/${shareName}`;
  const effectiveMaxDepth = typeof max_depth === 'number' && max_depth > 0 ? max_depth : safeScan ? 20 : 60;

  console.log(
    `[recursive_limit] scanSambaVolume initialized: target="${mountLocation}", max_depth=${effectiveMaxDepth}, safeScan=${safeScan}, timeoutMs=${timeoutMs}`
  );

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');

      const invokePromise = invoke<any>('scan_samba_volume', {
        shareName,
        share_name: shareName,
        customPath: customPath || null,
        custom_path: customPath || null,
        safeScan,
        safe_scan: safeScan,
        maxDepth: effectiveMaxDepth,
        max_depth: effectiveMaxDepth,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`scan_samba_volume timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const result: any = await Promise.race([invokePromise, timeoutPromise]);
      const durationMs = Math.round(performance.now() - startTime);

      const items = (result?.items || []).map((it: any) => ({
        name: it.name,
        rel_path: it.rel_path,
        is_dir: Boolean(it.is_dir),
        size_str: it.size_str || `${Math.round((it.size || 0) / (1024 * 1024))} MB`,
      }));

      console.log(
        `[recursive_limit] scanSambaVolume completed in ${durationMs}ms: retrieved ${items.length} items with max_depth=${effectiveMaxDepth}. ` +
          (items.length === 25
            ? '⚠️ RESULT CONTAINS EXACTLY 25 ITEMS. Auditing for silent termination / buffer limit.'
            : `✅ Successfully discovered ${items.length} items.`)
      );

      // Deep-dive recursive depth and barrier analysis
      const diagnostics = logDirectoryTraversalDiagnostics(
        'scanSambaVolume:NativeTauri',
        mountLocation,
        items,
        durationMs,
        { safeScan, timeoutMs }
      );

      return {
        success: Boolean(result?.success),
        mountPath: result?.mount_path || mountLocation,
        items,
        totalScanned: result?.total_scanned || items.length,
        error: result?.error || null,
        diagnostics,
      };
    } catch (e: any) {
      const durationMs = Math.round(performance.now() - startTime);
      console.error('[SambaVault Scanner] Tauri invoke scan_samba_volume failed or timed out:', e);
      console.log(
        `[recursive_limit] scanSambaVolume errored in ${durationMs}ms: max_depth=${effectiveMaxDepth}, error="${e?.message || e}"`
      );
      return {
        success: false,
        mountPath: mountLocation,
        items: [],
        totalScanned: 0,
        error: e?.message || String(e),
      };
    }
  }

  // Browser fallback using recursive Express backend API
  try {
    const response = await fetch('/api/samba/scan-volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sharePath: customPath || '',
        mountPath: customPath || '',
        max_depth: effectiveMaxDepth,
        maxDepth: effectiveMaxDepth,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.items) {
        const durationMs = Math.round(performance.now() - startTime);

        console.log(
          `[recursive_limit] scanSambaVolume (Browser Fallback) completed in ${durationMs}ms: retrieved ${data.items.length} items with max_depth=${effectiveMaxDepth}.`
        );

        // Deep-dive recursive depth and barrier analysis for browser fallback
        const diagnostics = logDirectoryTraversalDiagnostics(
          'scanSambaVolume:BrowserFallback',
          mountLocation,
          data.items,
          durationMs,
          { safeScan, timeoutMs }
        );

        return {
          success: true,
          mountPath: mountLocation,
          items: data.items,
          totalScanned: data.totalScanned || data.items.length,
          diagnostics,
        };
      }
    }
  } catch (e: any) {
    console.warn('[scanSambaVolume Fallback] API error:', e);
  }

  return {
    success: false,
    mountPath: mountLocation,
    items: [],
    totalScanned: 0,
    error: 'Preview mode API fallback failed.',
  };
};

export const openInSystemPlayer = async (filePath: string): Promise<{ success: boolean; message: string }> => {
  let cleanPath = (filePath || '').trim().replace(/^file:\/\//i, '');
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {}

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const res = await invoke<string>('open_in_system_player', { filePath: cleanPath });
      return { success: true, message: res || 'Launched system media player' };
    } catch (e: any) {
      console.warn('open_in_system_player error:', e);
      return { success: false, message: e?.message || String(e) };
    }
  }
  return { success: false, message: 'External player launch is available in desktop app mode' };
};

export const openInVlc = async (filePath: string): Promise<{ success: boolean; message: string }> => {
  let cleanPath = (filePath || '').trim().replace(/^file:\/\//i, '');
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {}

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const res = await invoke<string>('open_in_vlc', { filePath: cleanPath });
      return { success: true, message: res || 'Launched VLC' };
    } catch (e: any) {
      console.warn('open_in_vlc error:', e);
      return { success: false, message: e?.message || String(e) };
    }
  }
  // Browser fallback - open vlc:// protocol URL
  try {
    // If the path is already an http/https stream URL or smb URL, open directly
    // Avoid double encoding or dispatching invalid file:/// with %20
    const target = cleanPath.startsWith('http://') || cleanPath.startsWith('https://')
      ? cleanPath
      : cleanPath.startsWith('smb://')
      ? cleanPath
      : `${cleanPath}`;

    window.open(`vlc://${target}`, '_blank');
    return { success: true, message: 'Dispatched VLC URI protocol' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to dispatch VLC URI' };
  }
};

export const openInIina = async (filePath: string): Promise<{ success: boolean; message: string }> => {
  let cleanPath = (filePath || '').trim().replace(/^file:\/\//i, '');
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {}

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const res = await invoke<string>('open_in_iina', { filePath: cleanPath });
      return { success: true, message: res || 'Launched IINA' };
    } catch (e: any) {
      console.warn('open_in_iina error:', e);
      return { success: false, message: e?.message || String(e) };
    }
  }
  // Browser fallback - open iina:// protocol URL
  try {
    window.open(`iina://weblink?url=${encodeURIComponent(cleanPath)}`, '_blank');
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


