import { MediaCollection, MediaMetadata, SambaConfig, SambaShareNode } from '../types';
import { resolveBackendUrl, isTauri } from '../lib/api';
import { checkPathMetadata } from './tauriBridge';

export type BrokenPathReason =
  | 'missing_on_disk'
  | 'unmounted_volume'
  | 'missing_in_samba_tree'
  | 'missing_file_path'
  | 'stale_blob_url'
  | 'malformed_path'
  | 'corrupted_metadata';

export interface BrokenPathRecord {
  id: string;
  title: string;
  mediaType: string;
  path: string;
  reason: BrokenPathReason;
  details: string;
  sourceTable: 'media_items' | 'thumbnail_metadata_cache' | 'active_library';
  recoverable?: boolean;
}

export interface OrphanedMetadataRecord {
  id: string;
  table:
    | 'series_watch_progress'
    | 'watch_history_log'
    | 'user_watchlist'
    | 'media_playback_settings'
    | 'thumbnail_metadata_cache'
    | 'media_collections';
  referencedId: string;
  label: string;
  details: string;
}

export interface LibraryIntegrityReport {
  checkedAt: string;
  dbFilePath: string;
  backendSource: 'express-sqlite' | 'tauri-sqlite' | 'client-fallback';
  summary: {
    totalMediaItems: number;
    brokenPathCount: number;
    missingOnDiskCount: number;
    unmountedVolumeCount: number;
    staleBlobCount: number;
    malformedPathCount: number;
    missingFilePathCount: number;
    corruptedMetadataCount: number;
    orphanedMetadataCount: number;
    danglingCollectionRefsCount: number;
  };
  tableCounts: {
    media_items: number;
    series_watch_progress: number;
    watch_history_log: number;
    user_watchlist: number;
    media_playback_settings: number;
    thumbnail_metadata_cache: number;
    media_collections: number;
  };
  brokenPathItems: BrokenPathRecord[];
  orphanedRecords: OrphanedMetadataRecord[];
}

export interface IntegrityCleanupOptions {
  removeAllOrphans?: boolean;
  removeBrokenMediaIds?: string[];
  clearStaleBlobUrls?: boolean;
}

export interface IntegrityCleanupResult {
  success: boolean;
  removedMediaCount: number;
  removedOrphanedRows: number;
  prunedCollectionRefs: number;
  clearedBlobUrls: number;
  message: string;
}

function isAbsoluteLocalFsPath(p: string): boolean {
  if (!p) return false;
  const trimmed = p.trim();
  if (/^(https?:|smb:|blob:|data:)/i.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  return trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed);
}

function hasMalformedPathIssues(p: string): string | null {
  if (!p) return null;
  if (/[\x00-\x1f]/.test(p)) return 'Contains control characters';
  if (/%20/i.test(p) && !/^https?:/i.test(p)) return 'Contains URL-encoded %20 spaces';
  const strippedProtocol = p.replace(/^(https?:\/\/|smb:\/\/|\/\/)/i, '');
  if (/\/\//.test(strippedProtocol)) return 'Contains duplicate consecutive slashes (//)';
  return null;
}

function collectSambaPaths(nodes: SambaShareNode[]): Set<string> {
  const paths = new Set<string>();
  const norm = (s: string) =>
    s
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '')
      .toLowerCase()
      .trim();

  const walk = (list: SambaShareNode[]) => {
    for (const n of list) {
      if (!n) continue;
      if (typeof n.path === 'string' && n.path.trim()) {
        paths.add(norm(n.path));
      }
      if (Array.isArray(n.children)) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

/**
 * Performs a comprehensive library integrity check across the SQLite vault
 * (broken filesystem/Samba paths, stale blob URLs, malformed paths, and orphaned metadata rows).
 */
export async function runLibraryIntegrityCheck(params: {
  sambaConfig?: SambaConfig;
  mediaLibrary?: MediaMetadata[];
  sambaTree?: SambaShareNode[];
  customCollections?: MediaCollection[];
}): Promise<LibraryIntegrityReport> {
  const mountPath = params.sambaConfig?.hostPath || params.sambaConfig?.mountPath || '';
  const mediaLibrary = Array.isArray(params.mediaLibrary) ? params.mediaLibrary : [];
  const sambaTree = Array.isArray(params.sambaTree) ? params.sambaTree : [];
  const customCollections = Array.isArray(params.customCollections) ? params.customCollections : [];

  let baseReport: LibraryIntegrityReport | null = null;

  // 1. Primary path: Query Express SQLite backend endpoint (works in web dev + Tauri with Express sidecar)
  try {
    const res = await fetch(resolveBackendUrl('/api/vault/integrity-check'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mountPath }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.report) {
        baseReport = {
          ...data.report,
          backendSource: 'express-sqlite',
        };
      }
    }
  } catch {
    // Express server unreachable; fall through to Tauri/client check
  }

  // 2. Fallback: Tauri native SQLite + filesystem probe or client-only check
  if (!baseReport) {
    let sqliteRows: any[] = [];
    let backendSource: 'tauri-sqlite' | 'client-fallback' = 'client-fallback';

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const rows = await invoke<any[]>('get_all_media');
        if (Array.isArray(rows)) {
          sqliteRows = rows;
          backendSource = 'tauri-sqlite';
        }
      } catch {
        // Ignore Tauri IPC fallback failure
      }
    }

    const brokenPathItems: BrokenPathRecord[] = [];
    const orphanedRecords: OrphanedMetadataRecord[] = [];
    const sambaPathSet = collectSambaPaths(sambaTree);
    const norm = (s: string) =>
      s
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/\/$/, '')
        .toLowerCase()
        .trim();

    const recordsToInspect =
      sqliteRows.length > 0
        ? sqliteRows.map((r) => {
            let parsedRaw: any = null;
            let rawInvalid = false;
            if (typeof r.raw_data === 'string' && r.raw_data.trim()) {
              try {
                parsedRaw = JSON.parse(r.raw_data);
              } catch {
                rawInvalid = true;
              }
            }
            return {
              id: String(r.id || ''),
              title: String(r.title || ''),
              mediaType: String(r.media_type || 'movie'),
              filePath: String(r.file_path || parsedRaw?.path || ''),
              folderPath: String(r.recommended_folder || parsedRaw?.folderPath || ''),
              raw: parsedRaw,
              rawInvalid,
              sourceTable: 'media_items' as const,
            };
          })
        : mediaLibrary.map((m) => ({
            id: m.id,
            title: m.title,
            mediaType: m.type,
            filePath: m.path || '',
            folderPath: m.folderPath || m.recommendedFolderStructure || '',
            raw: m,
            rawInvalid: false,
            sourceTable: 'active_library' as const,
          }));

    const inspectedIdSet = new Set<string>(recordsToInspect.map((r) => r.id));

    for (const rec of recordsToInspect) {
      if (!rec.title.trim() || rec.rawInvalid) {
        brokenPathItems.push({
          id: rec.id,
          title: rec.title || '(Empty Title)',
          mediaType: rec.mediaType,
          path: rec.filePath || rec.folderPath,
          reason: 'corrupted_metadata',
          details: rec.rawInvalid ? 'raw_data JSON failed to parse' : 'Record has an empty title',
          sourceTable: rec.sourceTable,
        });
      }

      const blobUrl =
        (rec.filePath.startsWith('blob:') && rec.filePath) ||
        (typeof rec.raw?.localBlobUrl === 'string' && rec.raw.localBlobUrl.startsWith('blob:') && rec.raw.localBlobUrl) ||
        (typeof rec.raw?.playbackUrl === 'string' && rec.raw.playbackUrl.startsWith('blob:') && rec.raw.playbackUrl) ||
        '';

      if (blobUrl) {
        brokenPathItems.push({
          id: rec.id,
          title: rec.title || rec.id,
          mediaType: rec.mediaType,
          path: blobUrl,
          reason: 'stale_blob_url',
          details: 'Record persists an ephemeral blob: URL that becomes invalid after restart',
          sourceTable: rec.sourceTable,
          recoverable: true,
        });
      }

      const isImportedOrigin =
        rec.id.startsWith('imported-') ||
        rec.id.startsWith('batch-imported-') ||
        rec.id.startsWith('samba-') ||
        rec.id.startsWith('folder-') ||
        rec.raw?.source === 'local' ||
        rec.raw?.source === 'samba';

      const targetPath = rec.filePath || (isAbsoluteLocalFsPath(rec.folderPath) ? rec.folderPath : '');
      if (isImportedOrigin && !targetPath) {
        brokenPathItems.push({
          id: rec.id,
          title: rec.title || rec.id,
          mediaType: rec.mediaType,
          path: rec.folderPath,
          reason: 'missing_file_path',
          details: 'Imported media item has no physical file path recorded',
          sourceTable: rec.sourceTable,
        });
        continue;
      }

      if (targetPath) {
        const malformed = hasMalformedPathIssues(targetPath);
        if (malformed) {
          brokenPathItems.push({
            id: rec.id,
            title: rec.title || rec.id,
            mediaType: rec.mediaType,
            path: targetPath,
            reason: 'malformed_path',
            details: malformed,
            sourceTable: rec.sourceTable,
            recoverable: true,
          });
        } else if (isTauri && isAbsoluteLocalFsPath(targetPath)) {
          const meta = await checkPathMetadata(targetPath);
          if (meta && !meta.exists) {
            brokenPathItems.push({
              id: rec.id,
              title: rec.title || rec.id,
              mediaType: rec.mediaType,
              path: targetPath,
              reason: 'missing_on_disk',
              details: meta.error || `Path not found on disk: ${targetPath}`,
              sourceTable: rec.sourceTable,
            });
          }
        } else if (isImportedOrigin && sambaPathSet.size > 0 && !/^(https?:|smb:|blob:|data:)/i.test(targetPath)) {
          const nTarget = norm(targetPath);
          const inTree =
            sambaPathSet.has(nTarget) ||
            sambaPathSet.has(`/${nTarget}`) ||
            Array.from(sambaPathSet).some((sp) => sp.endsWith(`/${nTarget}`) || nTarget.endsWith(sp));
          if (!inTree) {
            brokenPathItems.push({
              id: rec.id,
              title: rec.title || rec.id,
              mediaType: rec.mediaType,
              path: targetPath,
              reason: 'missing_in_samba_tree',
              details: 'Path not found in scanned Samba share tree',
              sourceTable: rec.sourceTable,
            });
          }
        }
      }
    }

    // Check customCollections for dangling itemIds
    let danglingRefs = 0;
    for (const col of customCollections) {
      const dangling = (col.itemIds || []).filter((mid) => !inspectedIdSet.has(mid));
      if (dangling.length > 0) {
        danglingRefs += dangling.length;
        orphanedRecords.push({
          id: col.id,
          table: 'media_collections',
          referencedId: dangling.slice(0, 3).join(', '),
          label: col.name,
          details: `Collection references ${dangling.length} missing media item ID(s)`,
        });
      }
    }

    baseReport = {
      checkedAt: new Date().toISOString(),
      dbFilePath: isTauri ? '~/.media-player/media_vault.sqlite' : 'Browser Local Fallback',
      backendSource,
      summary: {
        totalMediaItems: recordsToInspect.length,
        brokenPathCount: brokenPathItems.length,
        missingOnDiskCount: brokenPathItems.filter((b) => b.reason === 'missing_on_disk' || b.reason === 'missing_in_samba_tree').length,
        unmountedVolumeCount: brokenPathItems.filter((b) => b.reason === 'unmounted_volume').length,
        staleBlobCount: brokenPathItems.filter((b) => b.reason === 'stale_blob_url').length,
        malformedPathCount: brokenPathItems.filter((b) => b.reason === 'malformed_path').length,
        missingFilePathCount: brokenPathItems.filter((b) => b.reason === 'missing_file_path').length,
        corruptedMetadataCount: brokenPathItems.filter((b) => b.reason === 'corrupted_metadata').length,
        orphanedMetadataCount: orphanedRecords.length,
        danglingCollectionRefsCount: danglingRefs,
      },
      tableCounts: {
        media_items: recordsToInspect.length,
        series_watch_progress: 0,
        watch_history_log: 0,
        user_watchlist: 0,
        media_playback_settings: 0,
        thumbnail_metadata_cache: 0,
        media_collections: customCollections.length,
      },
      brokenPathItems,
      orphanedRecords,
    };
  }

  // 3. Cross-check active in-memory library items that may not yet be synced to SQLite
  if (baseReport.backendSource === 'express-sqlite' && mediaLibrary.length > 0) {
    const existingBrokenKeys = new Set(
      baseReport.brokenPathItems.map((b) => `${b.id}:${b.reason}`)
    );
    const activeIdSet = new Set(mediaLibrary.map((m) => m.id));

    for (const item of mediaLibrary) {
      const hasStaleBlob =
        (typeof item.localBlobUrl === 'string' && item.localBlobUrl.startsWith('blob:')) ||
        (typeof item.playbackUrl === 'string' && item.playbackUrl.startsWith('blob:'));
      if (hasStaleBlob && !existingBrokenKeys.has(`${item.id}:stale_blob_url`)) {
        baseReport.brokenPathItems.push({
          id: item.id,
          title: item.title,
          mediaType: item.type,
          path: item.localBlobUrl || item.playbackUrl || '',
          reason: 'stale_blob_url',
          details: 'Active library record holds a temporary blob: URL',
          sourceTable: 'active_library',
          recoverable: true,
        });
      }

      const candidate = item.path || item.folderPath || '';
      const malformed = hasMalformedPathIssues(candidate);
      if (malformed && !existingBrokenKeys.has(`${item.id}:malformed_path`)) {
        baseReport.brokenPathItems.push({
          id: item.id,
          title: item.title,
          mediaType: item.type,
          path: candidate,
          reason: 'malformed_path',
          details: malformed,
          sourceTable: 'active_library',
          recoverable: true,
        });
      }
    }

    // Also inspect in-memory customCollections if SQLite collections table didn't catch them
    const reportedCollectionIds = new Set(
      baseReport.orphanedRecords.filter((o) => o.table === 'media_collections').map((o) => o.id)
    );
    for (const col of customCollections) {
      if (reportedCollectionIds.has(col.id)) continue;
      const dangling = (col.itemIds || []).filter((mid) => !activeIdSet.has(mid));
      if (dangling.length > 0) {
        baseReport.orphanedRecords.push({
          id: col.id,
          table: 'media_collections',
          referencedId: dangling.slice(0, 3).join(', '),
          label: col.name,
          details: `Collection holds ${dangling.length} dangling media ID reference(s) missing from active library`,
        });
        baseReport.summary.danglingCollectionRefsCount += dangling.length;
      }
    }

    // Recompute summary totals after cross-check
    baseReport.summary.brokenPathCount = baseReport.brokenPathItems.length;
    baseReport.summary.staleBlobCount = baseReport.brokenPathItems.filter((b) => b.reason === 'stale_blob_url').length;
    baseReport.summary.malformedPathCount = baseReport.brokenPathItems.filter((b) => b.reason === 'malformed_path').length;
    baseReport.summary.orphanedMetadataCount = baseReport.orphanedRecords.length;
  }

  return baseReport;
}

export async function cleanLibraryIntegrityIssues(
  options: IntegrityCleanupOptions
): Promise<IntegrityCleanupResult> {
  try {
    const res = await fetch(resolveBackendUrl('/api/vault/integrity-cleanup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      return await res.json();
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.message || errBody?.error || `HTTP ${res.status}`);
  } catch (err: any) {
    return {
      success: false,
      removedMediaCount: 0,
      removedOrphanedRows: 0,
      prunedCollectionRefs: 0,
      clearedBlobUrls: 0,
      message: err?.message || 'Could not reach SQLite vault cleanup endpoint.',
    };
  }
}
