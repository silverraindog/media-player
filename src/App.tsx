import React, { useState, useEffect, useCallback, useMemo, useReducer, useRef, Suspense, lazy } from 'react';
import {
  AppTab,
  ClassifierSettings,
  EpisodeMetadata,
  FolderScanClassification,
  LastScanSummary,
  MediaCollection,
  MediaMetadata,
  MediaScanExtensionConfig,
  MediaType,
  ParsedFileInfo,
  SambaConfig,
  SambaShareNode,
  SyncLog,
  SyncProgressState,
  TrackMetadata,
  TranscodeConfig,
} from './types';
import { CURATED_MEDIA_DATABASE } from './data/curatedMedia';
import { Header } from './components/Header';
import { MenuBar } from './components/MenuBar';
import { MediaSearch } from './components/MediaSearch';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy-load non-default tabs and heavy modals/overlays so initial boot only parses Header, MenuBar, and MediaSearch
const CollectionsTab = lazy(() => import('./components/CollectionsTab').then((m) => ({ default: m.CollectionsTab })));
const MusicTab = lazy(() => import('./components/MusicTab').then((m) => ({ default: m.MusicTab })));
const WatchlistTab = lazy(() => import('./components/WatchlistTab').then((m) => ({ default: m.WatchlistTab })));
const WatchHistoryTab = lazy(() => import('./components/WatchHistoryTab').then((m) => ({ default: m.WatchHistoryTab })));
const SqliteVault = lazy(() => import('./components/SqliteVault').then((m) => ({ default: m.SqliteVault })));
const DeduplicationManagerTab = lazy(() => import('./components/DeduplicationManagerTab').then((m) => ({ default: m.DeduplicationManagerTab })));
const LibraryStatsTab = lazy(() => import('./components/LibraryStatsTab').then((m) => ({ default: m.LibraryStatsTab })));
const BatchFilenameCleaner = lazy(() => import('./components/BatchFilenameCleaner').then((m) => ({ default: m.BatchFilenameCleaner })));
const SambaExplorer = lazy(() => import('./components/SambaExplorer').then((m) => ({ default: m.SambaExplorer })));
const SambaMountHub = lazy(() => import('./components/SambaMountHub').then((m) => ({ default: m.SambaMountHub })));
const NfoStudio = lazy(() => import('./components/NfoStudio').then((m) => ({ default: m.NfoStudio })));
const ConsoleTab = lazy(() => import('./components/ConsoleTab').then((m) => ({ default: m.ConsoleTab })));
const SettingsTab = lazy(() => import('./components/SettingsTab').then((m) => ({ default: m.SettingsTab })));
const YouTubeTab = lazy(() => import('./components/YouTubeTab').then((m) => ({ default: m.YouTubeTab })));
const MediaDetailModal = lazy(() => import('./components/MediaDetailModal').then((m) => ({ default: m.MediaDetailModal })));
const MediaPlayerModal = lazy(() => import('./components/MediaPlayerModal').then((m) => ({ default: m.MediaPlayerModal })));
const ManualMatchModal = lazy(() => import('./components/ManualMatchModal').then((m) => ({ default: m.ManualMatchModal })));
const FolderClassifierModal = lazy(() => import('./components/FolderClassifierModal').then((m) => ({ default: m.FolderClassifierModal })));
const ApiDebuggerOverlay = lazy(() => import('./components/ApiDebuggerOverlay').then((m) => ({ default: m.ApiDebuggerOverlay })));
const FullDiskAccessOverlay = lazy(() => import('./components/FullDiskAccessOverlay').then((m) => ({ default: m.FullDiskAccessOverlay })));
const VaultStorageBackupModal = lazy(() => import('./components/VaultStorageBackupModal').then((m) => ({ default: m.VaultStorageBackupModal })));
const SyncProgressBar = lazy(() => import('./components/SyncProgressBar').then((m) => ({ default: m.SyncProgressBar })));

const TabLoadingFallback = (
  <div className="py-16 flex items-center justify-center text-xs text-slate-400 font-medium">
    Loading view...
  </div>
);
import {
  DEFAULT_CLASSIFIER_SETTINGS,
  classifyAllDiscoveredPaths,
} from './utils/folderClassifier';
import {
  DEFAULT_MEDIA_SCAN_CONFIG,
  detectMediaType,
  extractAllMediaFromSambaTreeAsync,
  parseTitleAndYear,
  parsedFileToMediaMetadata,
} from './utils/mediaExtractor';
import {
  checkMacVolume,
  detectFFmpegPath,
  getState,
  isTauriEnvironment,
  listMountedVolumes,
  performFastScan,
  saveState,
  scanSambaVolume,
  VolumeMountInfo,
} from './utils/tauriBridge';
import { normalizeFranchiseHierarchy } from './utils/franchiseHierarchy';
import { extractCollectionFromPath } from './utils/collections';
import { generateMetadataFile } from './utils/nfoGenerator';
import { logger } from './utils/loggerService';
import { localDbFallback } from './utils/localDatabaseFallback';
import { apiCall } from './lib/api';
import { sqliteBatchWriter } from './services/sqliteBatchWriter';
import { loadAppPersistenceState, saveAppPersistenceState } from './utils/persistence';
import { checkFullDiskAccess, FullDiskAccessStatus, openMacOSSecurityPrivacy } from './utils/permissionsManager';
import { mediaLibraryReducer } from './reducers/mediaLibraryReducer';
import { mediaScannerWorkerPool } from './workers/mediaScannerWorkerPool';
import { APP_VERSION, APP_RELEASE_TAG } from './version';
import { AlertTriangle, RotateCw } from 'lucide-react';

const DEFAULT_SAMBA_CONFIG: SambaConfig = {
  enabled: false,
  hostPath: '/Volumes/media',
  server: '192.168.1.150',
  share: 'media',
  port: 445,
  workgroup: 'WORKGROUP',
  username: 'guest',
  password: '',
  isGuest: true,
  targetPlatform: 'all',
  baseMountPath: '/Volumes/media',
  mountPath: '/Volumes/media',
  customMountPaths: [],
  depthLimit: 30,
};

const DEFAULT_TRANSCODE_CONFIG: TranscodeConfig = {
  codec: 'h264',
  resolution: '1080p',
  maxCacheSizeGb: 20,
  hwAccel: {
    enabled: true,
    nvenc: false,
    videotoolbox: true,
    vaapi: false,
    h264: true,
    hevc: true,
    av1: false,
  },
  presets: [
    {
      id: 'preset-balanced-1080p',
      name: 'Balanced 1080p Stream',
      resolution: '1080p',
      bitrate: '8 Mbps',
      hwAccelType: 'videotoolbox',
    },
    {
      id: 'preset-direct-4k',
      name: 'Direct / High Bitrate 4K',
      resolution: '4k',
      bitrate: '25 Mbps',
      hwAccelType: 'none',
    },
  ],
  activePresetId: 'preset-balanced-1080p',
};

const INITIAL_SYNC_PROGRESS: SyncProgressState = {
  isActive: false,
  phase: 'idle',
  currentStep: 0,
  totalSteps: 0,
  currentPath: '',
  processedCount: 0,
  totalCount: 0,
};

function readStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const CURATED_MEDIA_IDS = new Set(CURATED_MEDIA_DATABASE.map((m) => m.id));

function stripDeadBlobUrls(item: MediaMetadata): MediaMetadata {
  const cleaned: MediaMetadata = { ...item };
  if (cleaned.localBlobUrl && cleaned.localBlobUrl.startsWith('blob:')) {
    delete cleaned.localBlobUrl;
  }
  if (cleaned.playbackUrl && cleaned.playbackUrl.startsWith('blob:')) {
    cleaned.playbackUrl = cleaned.path || undefined;
  }
  return cleaned;
}

function hydrateMediaRecord(row: any): MediaMetadata | null {
  if (!row) return null;
  let parsedRaw: any = null;
  if (row.raw_data) {
    try {
      parsedRaw = typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data;
    } catch {}
  }

  if (parsedRaw && typeof parsedRaw === 'object' && parsedRaw.title) {
    return stripDeadBlobUrls({
      ...parsedRaw,
      id: parsedRaw.id || row.id,
      type: parsedRaw.type || row.media_type || 'movie',
      title: parsedRaw.title || row.title,
      posterUrl: parsedRaw.posterUrl || row.poster_url || '',
      fanartUrl: parsedRaw.fanartUrl || row.fanart_url || parsedRaw.posterUrl || row.poster_url || '',
      path: parsedRaw.path || row.file_path || undefined,
      folderPath: parsedRaw.folderPath || parsedRaw.recommendedFolderStructure || row.recommended_folder || undefined,
      recommendedFolderStructure: parsedRaw.recommendedFolderStructure || row.recommended_folder || '',
    } as MediaMetadata);
  }

  if (!row.title && !row.id) return null;

  let genres: string[] = ['Media'];
  try {
    if (Array.isArray(row.genres)) {
      genres = row.genres;
    } else if (typeof row.genres === 'string' && row.genres.trim()) {
      const parsedGenres = JSON.parse(row.genres);
      if (Array.isArray(parsedGenres)) genres = parsedGenres;
    }
  } catch {
    if (typeof row.genres === 'string' && row.genres.trim()) genres = [row.genres];
  }

  const normalizedType: MediaType =
    row.media_type === 'series' || row.media_type === 'album' || row.media_type === 'movie'
      ? row.media_type
      : 'movie';

  return stripDeadBlobUrls({
    id: row.id,
    type: normalizedType,
    title: row.title || 'Untitled',
    originalTitle: row.original_title || row.title || 'Untitled',
    overview: row.synopsis || '',
    year: row.year || new Date().getFullYear(),
    rating: typeof row.rating === 'number' ? row.rating : 0,
    posterUrl: row.poster_url || '',
    fanartUrl: row.fanart_url || row.poster_url || '',
    genres,
    recommendedFolderStructure: row.recommended_folder || '',
    recommendedFilenames: [],
    folderPath: row.recommended_folder || undefined,
    path: row.file_path || undefined,
    source: 'sqlite-vault',
  } as MediaMetadata);
}

function initMediaLibrary(): MediaMetadata[] {
  const wasReset = localStorage.getItem('sambavault_db_reset') === 'true';
  const stored = readStorageJson<MediaMetadata[]>('sambavault_media_library_v2', []);
  if (wasReset) return stored;
  return stored.length > 0 ? stored : CURATED_MEDIA_DATABASE;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('search');
  const [selectedSearchMediaType, setSelectedSearchMediaType] = useState<'all' | MediaType | 'collections'>('all');

  const [mediaLibrary, dispatchMediaLibrary] = useReducer(
    mediaLibraryReducer,
    undefined,
    initMediaLibrary
  );

  const [customCollections, setCustomCollections] = useState<MediaCollection[]>(() =>
    readStorageJson<MediaCollection[]>('media_vault_collections_cache', [])
  );

  const [sambaConfig, setSambaConfig] = useState<SambaConfig>(() =>
    readStorageJson<SambaConfig>('sambavault_samba_config', DEFAULT_SAMBA_CONFIG)
  );
  const [sambaTree, setSambaTree] = useState<SambaShareNode[]>(() =>
    readStorageJson<SambaShareNode[]>('samba_vault_tree', [])
  );
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>(() =>
    readStorageJson<SyncLog[]>('sambavault_sync_logs', [])
  );
  const [classifierSettings, setClassifierSettings] = useState<ClassifierSettings>(() =>
    readStorageJson<ClassifierSettings>('sambavault_classifier_settings', DEFAULT_CLASSIFIER_SETTINGS)
  );
  const [mediaExtensionConfig, setMediaExtensionConfig] = useState<MediaScanExtensionConfig>(() =>
    readStorageJson<MediaScanExtensionConfig>('sambavault_extension_config', DEFAULT_MEDIA_SCAN_CONFIG)
  );
  const [scanDepthLimit, setScanDepthLimit] = useState<number>(() => sambaConfig.depthLimit || 30);
  const [transcodeConfig, setTranscodeConfig] = useState<TranscodeConfig>(() =>
    readStorageJson<TranscodeConfig>('sambavault_transcode_config', DEFAULT_TRANSCODE_CONFIG)
  );

  const [isConnected, setIsConnected] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState<any>(null);
  const [isMountedInFinder, setIsMountedInFinder] = useState(false);
  const [mountedVolumeInfo, setMountedVolumeInfo] = useState<VolumeMountInfo | null>(null);
  const [systemVolumes, setSystemVolumes] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressState>(INITIAL_SYNC_PROGRESS);
  const [lastScanSummary, setLastScanSummary] = useState<LastScanSummary | null>(() =>
    readStorageJson<LastScanSummary | null>('samba_vault_last_scan_summary', null)
  );

  const [watchlistCount, setWatchlistCount] = useState<number>(0);
  const [serverVersionInfo, setServerVersionInfo] = useState<any>({
    version: APP_VERSION,
    releaseTag: APP_RELEASE_TAG,
  });
  const [storageInfo, setStorageInfo] = useState<any>(null);

  // Modals & Overlays
  const [detailModalMedia, setDetailModalMedia] = useState<MediaMetadata | null>(null);
  const [nfoTargetMedia, setNfoTargetMedia] = useState<MediaMetadata | null>(null);
  const [playerState, setPlayerState] = useState<{
    isOpen: boolean;
    media: MediaMetadata | null;
    episode?: EpisodeMetadata;
    track?: TrackMetadata;
  }>({ isOpen: false, media: null });

  // Centralized Stream Recovery Monitor (User Request #5)
  const [playerRecoveryError, setPlayerRecoveryError] = useState<string | null>(null);
  const [playerMountKey, setPlayerMountKey] = useState<number>(1);

  const [manualMatchState, setManualMatchState] = useState<{
    isOpen: boolean;
    rawPathOrName: string;
    mediaType?: MediaType;
  }>({ isOpen: false, rawPathOrName: '' });

  const [isClassifierModalOpen, setIsClassifierModalOpen] = useState(false);
  const [folderClassifications, setFolderClassifications] = useState<FolderScanClassification[]>([]);
  const [isApiDebuggerOpen, setIsApiDebuggerOpen] = useState(false);
  const [isFullDiskOverlayOpen, setIsFullDiskOverlayOpen] = useState(false);
  const [fullDiskStatus, setFullDiskStatus] = useState<FullDiskAccessStatus | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const localImportInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const hasHydratedRef = useRef<boolean>(false);
  const skipNextVaultPersistRef = useRef<boolean>(false);
  const didMountSettingsPersistRef = useRef<boolean>(false);
  const removedMediaIdsRef = useRef<string[]>(readStorageJson<string[]>('sambavault_removed_media_ids', []));
  const latestVaultPayloadRef = useRef<any>(null);
  const vaultPersistTimerRef = useRef<number | null>(null);
  const createdBlobUrlsRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  const appendSyncLog = useCallback((entry: Omit<SyncLog, 'id' | 'timestamp'>) => {
    const logItem: SyncLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      ...entry,
    };
    setSyncLogs((prev) => [logItem, ...prev].slice(0, 200));
  }, []);

  const ensureSqliteMediaIndexes = useCallback(async () => {
    try {
      const res = await apiCall<any>('/api/db/schema/ensure-indexes', {
        method: 'POST',
      });
      if (res?.success) return res;
    } catch {}

    // Fallback direct SQL schema index interaction via /api/db/query
    try {
      await apiCall('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: [
            'CREATE INDEX IF NOT EXISTS idx_media_items_title ON media_items(title);',
            'CREATE INDEX IF NOT EXISTS idx_media_items_type ON media_items(media_type);',
            'CREATE INDEX IF NOT EXISTS idx_media_items_title_nocase ON media_items(title COLLATE NOCASE);',
            'CREATE INDEX IF NOT EXISTS idx_media_items_type_title ON media_items(media_type, title COLLATE NOCASE);',
          ].join(' '),
        }),
      });
    } catch {}
    return null;
  }, []);

  const queryIndexedSqliteMedia = useCallback(async (mediaType?: string, query?: string): Promise<MediaMetadata[]> => {
    const params = new URLSearchParams();
    if (mediaType && mediaType !== 'all' && mediaType !== 'collections') {
      params.set('type', mediaType);
    }
    if (query && query.trim()) {
      params.set('search', query.trim());
    }
    params.set('limit', '200');
    params.set('ensureIndexes', '1');
    try {
      const data = await apiCall<any>(`/api/db/media?${params.toString()}`);
      const rows = Array.isArray(data?.items) ? data.items : [];
      const removedSet = new Set(removedMediaIdsRef.current);
      const hydrated = rows
        .map(hydrateMediaRecord)
        .filter((item): item is MediaMetadata => Boolean(item && item.id && !removedSet.has(item.id)));
      if (hydrated.length > 0) {
        dispatchMediaLibrary({ type: 'UPSERT_ITEMS', items: hydrated });
      }
      return hydrated;
    } catch {
      return [];
    }
  }, []);

  // Hydrate persistent state from disk (~/.media-player/vault_state.json + SQLite media_items) on mount
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const wasReset = localStorage.getItem('sambavault_db_reset') === 'true';

      try {
        const [vaultData, dbMediaData, colData, wlData, storageRes, versionRes] = await Promise.all([
          apiCall<any>('/api/vault/state').catch(() => null),
          apiCall<any>('/api/db/media?ensureIndexes=1').catch(() => null),
          apiCall<any>('/api/collections').catch(() => null),
          apiCall<any>('/api/db/watchlist').catch(() => null),
          fetch('/api/vault/storage-info').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/version').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        if (dbMediaData && !Array.isArray(dbMediaData.indexes)) {
          ensureSqliteMediaIndexes().catch(() => null);
        }

        if (cancelled) return;

        let st = vaultData?.hasSavedState && vaultData.state ? vaultData.state : null;

        // Secondary recovery for Tauri desktop upgrades (legacy state.json or AppData media_state.json)
        if (!st && isTauriEnvironment()) {
          try {
            const legacyState = await getState().catch(() => null);
            if (legacyState && (Array.isArray(legacyState.mediaLibrary) || Array.isArray(legacyState.sambaTree))) {
              st = legacyState;
            }
          } catch {}
          if (!st) {
            try {
              const appDataState = await loadAppPersistenceState().catch(() => null);
              if (appDataState && (Array.isArray(appDataState.mediaLibrary) || Array.isArray(appDataState.sambaTree))) {
                st = appDataState;
              }
            } catch {}
          }
        }

        if (Array.isArray(st?.removedMediaIds)) {
          removedMediaIdsRef.current = Array.from(new Set([...removedMediaIdsRef.current, ...st.removedMediaIds]));
          try {
            localStorage.setItem('sambavault_removed_media_ids', JSON.stringify(removedMediaIdsRef.current));
          } catch {}
        }
        const removedSet = new Set(removedMediaIdsRef.current);

        // Merge saved vault_state mediaLibrary + SQLite media_items + un-flushed cache + non-curated localStorage items
        const diskLibraryRaw: MediaMetadata[] = Array.isArray(st?.mediaLibrary) ? st.mediaLibrary : [];
        const dbItemsRaw: any[] = Array.isArray(dbMediaData?.items) ? dbMediaData.items : [];
        const dbHydratedItems = dbItemsRaw
          .map(hydrateMediaRecord)
          .filter((item): item is MediaMetadata => Boolean(item && item.id));
        const cachedWriterItems = sqliteBatchWriter.getCachedMedia();
        const localStored = readStorageJson<MediaMetadata[]>('sambavault_media_library_v2', []);

        const mergedMap = new Map<string, MediaMetadata>();
        const addMerged = (item: MediaMetadata) => {
          if (!item || !item.id || removedSet.has(item.id)) return;
          if (!mergedMap.has(item.id)) {
            mergedMap.set(item.id, stripDeadBlobUrls(item));
          }
        };

        diskLibraryRaw.forEach(addMerged);
        dbHydratedItems.forEach(addMerged);
        cachedWriterItems.forEach(addMerged);
        localStored.forEach((item) => {
          if (!item || !item.id || removedSet.has(item.id)) return;
          const isImportedOrCustom =
            !CURATED_MEDIA_IDS.has(item.id) ||
            item.id.startsWith('imported-') ||
            item.id.startsWith('batch-imported-') ||
            item.id.startsWith('folder-');
          if (isImportedOrCustom || mergedMap.size === 0) {
            addMerged(item);
          }
        });

        if (mergedMap.size > 0) {
          const mergedList = Array.from(mergedMap.values());
          dispatchMediaLibrary({ type: 'HYDRATE', items: mergedList });
          if (wasReset) {
            try {
              localStorage.removeItem('sambavault_db_reset');
            } catch {}
          }
        } else if (wasReset) {
          dispatchMediaLibrary({ type: 'HYDRATE', items: [] });
        }

        if (st) {
          if (Array.isArray(st.sambaTree) && st.sambaTree.length > 0) setSambaTree(st.sambaTree);
          if (Array.isArray(st.syncLogs) && st.syncLogs.length > 0) setSyncLogs(st.syncLogs);
          if (st.sambaConfig) setSambaConfig((prev) => ({ ...prev, ...st.sambaConfig }));
          if (st.classifierSettings) setClassifierSettings(st.classifierSettings);
          if (st.mediaExtensionConfig) setMediaExtensionConfig(st.mediaExtensionConfig);
          if (st.transcodeConfig) setTranscodeConfig(st.transcodeConfig);
        }

        const apiCols: MediaCollection[] =
          colData?.success && Array.isArray(colData.collections) ? colData.collections : [];
        const diskCols: MediaCollection[] = Array.isArray(st?.customCollections) ? st.customCollections : [];
        if (apiCols.length > 0 || diskCols.length > 0) {
          const colMap = new Map<string, MediaCollection>();
          apiCols.forEach((c) => c?.id && colMap.set(c.id, c));
          diskCols.forEach((c) => c?.id && !colMap.has(c.id) && colMap.set(c.id, c));
          const mergedCols = Array.from(colMap.values());
          setCustomCollections(mergedCols);
          try {
            localStorage.setItem('media_vault_collections_cache', JSON.stringify(mergedCols));
          } catch {}
        }

        if (wlData?.success && Array.isArray(wlData.watchlist)) {
          setWatchlistCount(wlData.watchlist.length);
        }

        if (storageRes?.success) {
          setStorageInfo(storageRes);
        }

        if (versionRes && (versionRes.version || versionRes.releaseTag)) {
          setServerVersionInfo(versionRes);
        }
      } catch (err) {
        console.warn('[App] Hydration warning:', err);
      } finally {
        if (!cancelled) {
          skipNextVaultPersistRef.current = true;
          hasHydratedRef.current = true;
        }
      }

      // Defer local volume mount & FFmpeg diagnostics until after first paint / idle time
      const runDeferredDiagnostics = async () => {
        if (cancelled) return;
        try {
          if (isTauriEnvironment()) {
            const [vols, volInfo] = await Promise.all([
              listMountedVolumes().catch(() => []),
              checkMacVolume(sambaConfig.share || 'media').catch(() => null),
            ]);
            if (!cancelled) {
              setSystemVolumes(vols);
              if (volInfo) {
                setMountedVolumeInfo(volInfo);
                setIsMountedInFinder(Boolean(volInfo.isMounted));
                if (volInfo.isMounted) setIsConnected(true);
              }
            }
          }
          detectFFmpegPath().catch(() => null);
        } catch {}
      };

      if (typeof window !== 'undefined') {
        if ('requestIdleCallback' in window) {
          window.setTimeout(() => {
            if (!cancelled) {
              (window as any).requestIdleCallback(runDeferredDiagnostics, { timeout: 3000 });
            }
          }, 1200);
        } else {
          globalThis.setTimeout(runDeferredDiagnostics, 1800);
        }
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist key settings and library snapshots to localStorage asynchronously in idle time
  useEffect(() => {
    if (!hasHydratedRef.current) return;
    let idleHandle: number | null = null;
    const timer = window.setTimeout(() => {
      const writeLib = () => {
        try {
          localStorage.setItem('sambavault_media_library_v2', JSON.stringify(mediaLibrary));
        } catch {}
      };
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleHandle = (window as any).requestIdleCallback(writeLib, { timeout: 2000 });
      } else {
        writeLib();
      }
    }, 1000);
    return () => {
      window.clearTimeout(timer);
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [mediaLibrary]);

  useEffect(() => {
    if (!didMountSettingsPersistRef.current) return;
    try {
      localStorage.setItem('sambavault_samba_config', JSON.stringify(sambaConfig));
    } catch {}
  }, [sambaConfig]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    let idleHandle: number | null = null;
    const timer = window.setTimeout(() => {
      const writeTree = () => {
        try {
          localStorage.setItem('samba_vault_tree', JSON.stringify(sambaTree));
        } catch {}
      };
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleHandle = (window as any).requestIdleCallback(writeTree, { timeout: 2000 });
      } else {
        writeTree();
      }
    }, 1000);
    return () => {
      window.clearTimeout(timer);
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [sambaTree]);

  useEffect(() => {
    if (!didMountSettingsPersistRef.current) return;
    try {
      localStorage.setItem('sambavault_classifier_settings', JSON.stringify(classifierSettings));
    } catch {}
  }, [classifierSettings]);

  useEffect(() => {
    if (!didMountSettingsPersistRef.current) return;
    try {
      localStorage.setItem('sambavault_extension_config', JSON.stringify(mediaExtensionConfig));
    } catch {}
  }, [mediaExtensionConfig]);

  useEffect(() => {
    if (!didMountSettingsPersistRef.current) {
      didMountSettingsPersistRef.current = true;
      return;
    }
    try {
      localStorage.setItem('sambavault_transcode_config', JSON.stringify(transcodeConfig));
    } catch {}
  }, [transcodeConfig]);

  const flushVaultPayloadToDisk = useCallback(async (payload: any) => {
    if (!payload) return;
    await apiCall('/api/vault/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (isTauriEnvironment()) {
      saveState(payload).catch(() => null);
      saveAppPersistenceState(payload).catch(() => null);
    }
  }, []);

  const vaultPayload = useMemo(
    () => ({
      mediaLibrary,
      sambaTree,
      syncLogs,
      sambaConfig,
      classifierSettings,
      mediaExtensionConfig,
      transcodeConfig,
      customCollections,
      removedMediaIds: removedMediaIdsRef.current,
    }),
    [
      mediaLibrary,
      sambaTree,
      syncLogs,
      sambaConfig,
      classifierSettings,
      mediaExtensionConfig,
      transcodeConfig,
      customCollections,
    ]
  );

  // Auto-persist full vault state (imported media, trees, collections, settings) to permanent disk storage
  useEffect(() => {
    latestVaultPayloadRef.current = vaultPayload;

    if (!hasHydratedRef.current) return;
    if (skipNextVaultPersistRef.current) {
      skipNextVaultPersistRef.current = false;
      return;
    }

    if (vaultPersistTimerRef.current) {
      window.clearTimeout(vaultPersistTimerRef.current);
    }
    vaultPersistTimerRef.current = window.setTimeout(() => {
      flushVaultPayloadToDisk(latestVaultPayloadRef.current).catch(() => null);
    }, 1000);

    return () => {
      if (vaultPersistTimerRef.current) {
        window.clearTimeout(vaultPersistTimerRef.current);
      }
    };
  }, [vaultPayload, flushVaultPayloadToDisk]);

  // Flush pending vault snapshot when closing or replacing the app
  useEffect(() => {
    const handleBeforeExitFlush = () => {
      if (!hasHydratedRef.current || !latestVaultPayloadRef.current) return;
      const payload = latestVaultPayloadRef.current;
      try {
        localStorage.setItem('sambavault_media_library_v2', JSON.stringify(payload.mediaLibrary || []));
      } catch {}
      if (isTauriEnvironment()) {
        flushVaultPayloadToDisk(payload).catch(() => null);
      } else if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          navigator.sendBeacon('/api/vault/state', blob);
        } catch {}
      }
    };

    window.addEventListener('beforeunload', handleBeforeExitFlush);
    window.addEventListener('pagehide', handleBeforeExitFlush);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeExitFlush);
      window.removeEventListener('pagehide', handleBeforeExitFlush);
    };
  }, [flushVaultPayloadToDisk]);

  // Revoke any blob: URLs created during file imports once they are no longer referenced by mediaLibrary
  useEffect(() => {
    const activeBlobUrls = new Set<string>();
    for (const item of mediaLibrary) {
      if (typeof item.localBlobUrl === 'string' && item.localBlobUrl.startsWith('blob:')) {
        activeBlobUrls.add(item.localBlobUrl);
      }
      if (typeof item.playbackUrl === 'string' && item.playbackUrl.startsWith('blob:')) {
        activeBlobUrls.add(item.playbackUrl);
      }
      if (Array.isArray(item.seasons)) {
        for (const season of item.seasons) {
          if (Array.isArray(season.episodes)) {
            for (const ep of season.episodes) {
              if (typeof ep.playbackUrl === 'string' && ep.playbackUrl.startsWith('blob:')) {
                activeBlobUrls.add(ep.playbackUrl);
              }
            }
          }
        }
      }
      if (Array.isArray(item.tracks)) {
        for (const tr of item.tracks) {
          if (typeof tr.playbackUrl === 'string' && tr.playbackUrl.startsWith('blob:')) {
            activeBlobUrls.add(tr.playbackUrl);
          }
        }
      }
    }

    for (const blobUrl of Array.from(createdBlobUrlsRef.current)) {
      if (!activeBlobUrls.has(blobUrl)) {
        URL.revokeObjectURL(blobUrl);
        createdBlobUrlsRef.current.delete(blobUrl);
      }
    }
  }, [mediaLibrary]);

  useEffect(() => {
    return () => {
      for (const blobUrl of createdBlobUrlsRef.current) {
        URL.revokeObjectURL(blobUrl);
      }
      createdBlobUrlsRef.current.clear();
      mediaScannerWorkerPool.terminateAll();
    };
  }, []);

  // Global Stream Recovery monitor: catches unhandled playback/stream errors & CustomEvents while player is open
  useEffect(() => {
    if (!playerState.isOpen) return;

    const handleGlobalPlayerError = (event: ErrorEvent) => {
      const msg = event?.message || 'Unexpected media player runtime error.';
      if (/video|audio|stream|media|hls|matroska|decode|source/i.test(msg)) {
        console.error('[StreamRecovery] Global stream error intercepted:', msg);
        setPlayerRecoveryError(msg);
      }
    };

    const handleCustomPlayerError = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (!detail || detail.fatal === false) return;
      const msg = detail.message || 'Stream playback encountered a fatal interruption.';
      console.error('[StreamRecovery] Player error event intercepted:', detail);
      setPlayerRecoveryError(msg);
    };

    window.addEventListener('error', handleGlobalPlayerError);
    window.addEventListener('sambavault-player-error', handleCustomPlayerError);
    return () => {
      window.removeEventListener('error', handleGlobalPlayerError);
      window.removeEventListener('sambavault-player-error', handleCustomPlayerError);
    };
  }, [playerState.isOpen]);

  const handleRetryStream = useCallback(() => {
    setPlayerRecoveryError(null);
    setPlayerMountKey((k) => k + 1);
    showToast('Re-initializing media player stream...');
  }, [showToast]);

  const persistVaultSnapshot = useCallback(async () => {
    try {
      await flushVaultPayloadToDisk(vaultPayload);
      showToast('Vault state saved to disk.');
    } catch (err) {
      console.warn('[App] Failed persisting vault snapshot:', err);
    }
  }, [vaultPayload, flushVaultPayloadToDisk, showToast]);

  // Collections CRUD (SQLite + local fallback)
  const handleCreateCollection = useCallback(
    async (collection: MediaCollection) => {
      setCustomCollections((prev) => {
        const filtered = prev.filter((c) => c.id !== collection.id);
        const next = [collection, ...filtered];
        try {
          localStorage.setItem('media_vault_collections_cache', JSON.stringify(next));
        } catch {}
        return next;
      });

      try {
        await apiCall('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(collection),
        });
      } catch {
        localDbFallback.saveCollection(collection);
      }
      showToast(`Collection "${collection.name}" saved.`);
    },
    [showToast]
  );

  const handleUpdateCollection = useCallback(
    async (collection: MediaCollection) => {
      setCustomCollections((prev) => {
        const exists = prev.some((c) => c.id === collection.id);
        const next = exists
          ? prev.map((c) => (c.id === collection.id ? collection : c))
          : [collection, ...prev];
        try {
          localStorage.setItem('media_vault_collections_cache', JSON.stringify(next));
        } catch {}
        return next;
      });

      try {
        await apiCall(`/api/collections/${encodeURIComponent(collection.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(collection),
        });
      } catch {
        localDbFallback.saveCollection(collection);
      }
      showToast(`Collection "${collection.name}" updated.`);
    },
    [showToast]
  );

  const handleDeleteCollection = useCallback(
    async (id: string) => {
      setCustomCollections((prev) => {
        const next = prev.filter((c) => c.id !== id);
        try {
          localStorage.setItem('media_vault_collections_cache', JSON.stringify(next));
        } catch {}
        return next;
      });

      try {
        await apiCall(`/api/collections/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
      } catch {
        localDbFallback.deleteCollection(id);
      }
      showToast('Collection removed.');
    },
    [showToast]
  );

  // Save/merge media into library, SQLite vault, and persistent disk snapshot
  const upsertMediaItems = useCallback(
    (incoming: MediaMetadata[]) => {
      if (!Array.isArray(incoming) || incoming.length === 0) return;

      // Clear DB reset flag once user imports or adds new media
      try {
        localStorage.removeItem('sambavault_db_reset');
      } catch {}

      const incomingIds = new Set(incoming.map((i) => i.id));
      if (removedMediaIdsRef.current.length > 0) {
        removedMediaIdsRef.current = removedMediaIdsRef.current.filter((id) => !incomingIds.has(id));
        try {
          localStorage.setItem('sambavault_removed_media_ids', JSON.stringify(removedMediaIdsRef.current));
        } catch {}
      }

      dispatchMediaLibrary({ type: 'UPSERT_ITEMS', items: incoming });

      sqliteBatchWriter.updateCache(incoming);
      apiCall('/api/db/media/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: incoming }),
      })
        .then(() => {
          if (incoming.length >= 10) {
            ensureSqliteMediaIndexes().catch(() => null);
          }
        })
        .catch(() => null);
    },
    [ensureSqliteMediaIndexes]
  );

  const removeMediaItemsByIds = useCallback((ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const mergedRemoved = Array.from(new Set([...removedMediaIdsRef.current, ...ids]));
    removedMediaIdsRef.current = mergedRemoved;
    try {
      localStorage.setItem('sambavault_removed_media_ids', JSON.stringify(mergedRemoved));
    } catch {}
    dispatchMediaLibrary({ type: 'REMOVE_BY_IDS', ids });
  }, []);

  const handleRemoveSingleMediaItem = useCallback(
    (id: string) => {
      removeMediaItemsByIds([id]);
      apiCall(`/api/db/media/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
      showToast('Duplicate item removed from library.');
    },
    [removeMediaItemsByIds, showToast]
  );

  const mediaByIdMap = useMemo(() => {
    const map = new Map<string, MediaMetadata>();
    for (const item of mediaLibrary) {
      map.set(item.id, item);
    }
    return map;
  }, [mediaLibrary]);

  // Import local files / folder drops preserving webkitRelativePath for collection auto-grouping
  const handleImportFiles = useCallback(
    async (filesOrPaths: File[] | string[]) => {
      if (!filesOrPaths || filesOrPaths.length === 0) return;

      const rawInputs = filesOrPaths.map((entry) => {
        if (typeof entry === 'string') {
          const cleanName = entry.split('/').pop() || entry;
          return { path: entry, rel_path: entry, name: cleanName, is_dir: false };
        }
        const relPath = (entry as any).webkitRelativePath || (entry as any).path || entry.name;
        return { path: relPath, rel_path: relPath, name: entry.name, is_dir: false };
      });

      const parsedBatch = await mediaScannerWorkerPool.parseRawFilesWithPool(rawInputs, '');
      const importedItems: MediaMetadata[] = [];

      for (let i = 0; i < filesOrPaths.length; i++) {
        const entry = filesOrPaths[i];
        const parsedEntry = parsedBatch[i];
        const fullPath = parsedEntry?.path || rawInputs[i].path || rawInputs[i].name;
        const cleanName = parsedEntry?.name || rawInputs[i].name;
        const colMatch = extractCollectionFromPath(fullPath);
        const parentFolder = fullPath.includes('/') ? fullPath.slice(0, fullPath.lastIndexOf('/')) : undefined;

        if (typeof entry === 'string') {
          const blobMedia = parsedFileToMediaMetadata({
            id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            originalFilename: cleanName,
            detectedType: parsedEntry.mediaType,
            detectedTitle: parsedEntry.title,
            detectedYear: parsedEntry.year,
            detectedSeason: parsedEntry.season,
            detectedEpisode: parsedEntry.episode,
            cleanFormattedFilename: cleanName,
            cleanFolderPath: parentFolder || `Media/${parsedEntry.title}`,
            status: 'matched',
          });
          importedItems.push({
            ...blobMedia,
            folderPath: parentFolder || blobMedia.recommendedFolderStructure,
            path: entry,
            playbackUrl: entry,
            collectionNames: colMatch ? [colMatch.name] : undefined,
          });
        } else {
          const objectUrl = URL.createObjectURL(entry);
          createdBlobUrlsRef.current.add(objectUrl);

          const meta = parsedFileToMediaMetadata({
            id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            originalFilename: entry.name,
            detectedType: parsedEntry.mediaType,
            detectedTitle: parsedEntry.title,
            detectedYear: parsedEntry.year,
            detectedSeason: parsedEntry.season,
            detectedEpisode: parsedEntry.episode,
            cleanFormattedFilename: entry.name,
            cleanFolderPath: parentFolder || `Media/${parsedEntry.title}`,
            status: 'matched',
          });

          importedItems.push({
            ...meta,
            folderPath: parentFolder || meta.recommendedFolderStructure,
            path: fullPath,
            localBlobUrl: objectUrl,
            playbackUrl: objectUrl,
            collectionNames: colMatch ? [colMatch.name] : undefined,
          });
        }
      }

      upsertMediaItems(importedItems);
      appendSyncLog({
        type: 'metadata_created',
        title: 'Local Media Imported',
        details: `Imported ${importedItems.length} item(s) into Media Vault.`,
        status: 'success',
      });
      showToast(`Imported ${importedItems.length} media item${importedItems.length === 1 ? '' : 's'}.`);
    },
    [upsertMediaItems, appendSyncLog, showToast]
  );

  const handleTestSambaConnection = useCallback(
    async (overrideConfig?: SambaConfig) => {
      const cfg = overrideConfig || sambaConfig;
      setIsTestingConnection(true);
      try {
        const res = await fetch('/api/samba/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        });
        const data = await res.json().catch(() => ({ success: false }));
        setConnectionDetails(data);
        setIsConnected(Boolean(data.success));
        showToast(data.success ? 'Samba / Host connection verified.' : 'Samba connection offline.');
        return data;
      } catch (err) {
        setIsConnected(false);
        return { success: false };
      } finally {
        setIsTestingConnection(false);
      }
    },
    [sambaConfig, showToast]
  );

  const handleScanSambaVolume = useCallback(
    async (customPath?: string, customDepthLimit?: number) => {
      if (isSyncing) return;
      setIsSyncing(true);
      const effectiveDepth =
        typeof customDepthLimit === 'number' && customDepthLimit > 0
          ? customDepthLimit
          : scanDepthLimit || sambaConfig.depthLimit || 30;
      const rootTarget =
        customPath || sambaConfig.hostPath || sambaConfig.mountPath || sambaConfig.baseMountPath || '/Volumes/media';

      setSyncProgress({
        isActive: true,
        phase: 'scanning',
        currentStep: 1,
        totalSteps: 3,
        currentPath: rootTarget,
        processedCount: 0,
        totalCount: 100,
        phaseDescription: `Scanning ${rootTarget} (max depth ${effectiveDepth})...`,
      });

      try {
        const startedAt = Date.now();
        let scanResult = await performFastScan(
          rootTarget,
          (scannedCount, currentFile) => {
            setSyncProgress((prev) => ({
              ...prev,
              phase: 'scanning',
              currentPath: currentFile || rootTarget,
              processedCount: Math.min(55, Math.max(5, scannedCount)),
              totalCount: Math.max(100, scannedCount),
              phaseDescription: currentFile
                ? `OSWalk scanning (${scannedCount} items): ${currentFile}`
                : `OSWalk scanning (${scannedCount} items)...`,
            }));
          },
          180000,
          false,
          effectiveDepth
        );

        // Fallback to direct scanSambaVolume if performFastScan did not return success
        if (!scanResult?.success) {
          scanResult = await scanSambaVolume(
            sambaConfig.share || 'media',
            rootTarget,
            180000,
            false,
            effectiveDepth
          );
        }

        const rawItems = Array.isArray(scanResult?.items) ? scanResult.items : [];
        const scanErrors = Array.isArray(scanResult?.errors)
          ? scanResult.errors
          : scanResult?.error
          ? [scanResult.error]
          : [];
        try {
          localStorage.setItem('samba_vault_last_scan_errors', JSON.stringify(scanErrors));
        } catch {}

        const nodeMap = new Map<string, SambaShareNode>();
        const roots: SambaShareNode[] = [];
        const baseMount = (
          sambaConfig.hostPath ||
          sambaConfig.mountPath ||
          sambaConfig.baseMountPath ||
          `/Volumes/${sambaConfig.share || 'media'}`
        ).replace(/\/+$/, '');
        let effectivePrefix = customPath ? baseMount : (scanResult.mountPath || rootTarget).replace(/\/+$/, '');
        if (rawItems.length > 0) {
          const sampleRel = (rawItems[0].rel_path || '').replace(/\\/g, '/').replace(/^\/+/, '');
          const firstSeg = sampleRel.split('/')[0];
          if (firstSeg && effectivePrefix.toLowerCase().endsWith(`/${firstSeg.toLowerCase()}`)) {
            effectivePrefix = effectivePrefix.slice(0, effectivePrefix.length - firstSeg.length - 1);
          }
        }

        const ensureFolderPath = (segments: string[], fullPathPrefix: string) => {
          let parentList = roots;
          let accRel = '';
          for (const seg of segments) {
            accRel = accRel ? `${accRel}/${seg}` : seg;
            let folderNode = nodeMap.get(accRel);
            if (!folderNode) {
              folderNode = {
                id: `folder-${accRel.replace(/[^a-zA-Z0-9]/g, '-')}`,
                name: seg,
                path: fullPathPrefix ? `${fullPathPrefix}/${accRel}` : accRel,
                type: 'folder',
                children: [],
              };
              nodeMap.set(accRel, folderNode);
              parentList.push(folderNode);
            }
            if (!folderNode.children) folderNode.children = [];
            parentList = folderNode.children;
          }
          return parentList;
        };

        for (const item of rawItems) {
          const cleanRel = (item.rel_path || item.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
          if (!cleanRel) continue;
          const parts = cleanRel.split('/').filter(Boolean);
          if (item.is_dir) {
            ensureFolderPath(parts, effectivePrefix);
          } else {
            const parentSegments = parts.slice(0, -1);
            const targetList = parentSegments.length > 0 ? ensureFolderPath(parentSegments, effectivePrefix) : roots;
            targetList.push({
              id: `file-${cleanRel.replace(/[^a-zA-Z0-9]/g, '-')}`,
              name: item.name || parts[parts.length - 1],
              path: item.path || `${effectivePrefix}/${cleanRel}`,
              type: 'file',
              size: item.size_str,
            });
          }
        }

        const normalizedTree = normalizeFranchiseHierarchy(roots);
        if (!customPath || normalizedTree.length > 0) {
          setSambaTree(normalizedTree);
        }

        setSyncProgress((prev) => ({
          ...prev,
          phase: 'indexing',
          currentStep: 2,
          processedCount: 70,
          totalCount: 100,
          phaseDescription: 'Indexing discovered media & collections...',
        }));

        const extracted = await extractAllMediaFromSambaTreeAsync(
          normalizedTree,
          mediaExtensionConfig,
          30,
          (poolProgress) => {
            const pct =
              poolProgress.totalChunks > 0
                ? 70 + Math.round((poolProgress.completedChunks / poolProgress.totalChunks) * 28)
                : 95;
            setSyncProgress((prev) => ({
              ...prev,
              phase: 'indexing',
              currentStep: 2,
              processedCount: pct,
              totalCount: 100,
              phaseDescription: `Worker pool (${poolProgress.activeWorkers} threads): ${poolProgress.processedNodes}/${poolProgress.totalNodes} nodes · ${poolProgress.discoveredCount} items`,
            }));
          }
        );
        if (extracted.length > 0) {
          upsertMediaItems(extracted);
        }

        const fileCount = rawItems.filter((i) => !i.is_dir).length;
        const folderCount = rawItems.filter((i) => i.is_dir).length;
        const durationSec = Math.max(0.1, Number(((Date.now() - startedAt) / 1000).toFixed(2)));
        const maxDepthReached = scanResult.diagnostics?.maxDepthReached ?? 0;

        setLastScanSummary({
          timestamp: new Date().toISOString(),
          totalFilesScanned: fileCount,
          totalFoldersScanned: folderCount,
          processingTimeSeconds: durationSec,
          scanPath: scanResult.mountPath || rootTarget,
          scanMode: customPath ? 'Folder Sync' : 'Full Deep Sync',
          depthLimit: effectiveDepth,
          maxDepthReached,
          itemsPerSecond: durationSec > 0 ? Math.round(rawItems.length / durationSec) : rawItems.length,
          bottlenecks: scanErrors,
          status: scanErrors.length > 0 && rawItems.length === 0 ? 'error' : scanErrors.length > 0 ? 'warning' : 'optimal',
          mediaExtractedCount: extracted.length,
        });

        appendSyncLog({
          type: scanErrors.length > 0 && rawItems.length === 0 ? 'error' : 'connected',
          title: 'Samba Volume Scan Completed',
          details:
            rawItems.length > 0
              ? `Scanned ${rootTarget} (${fileCount} files, ${folderCount} folders, max depth ${maxDepthReached}) and extracted ${extracted.length} media item(s).`
              : scanErrors[0] || `No items found at ${rootTarget}.`,
          status: scanErrors.length > 0 && rawItems.length === 0 ? 'warning' : 'success',
        });
        showToast(
          rawItems.length > 0
            ? `Scan complete: ${fileCount} files scanned, ${extracted.length} media indexed.`
            : scanErrors[0] || 'Scan finished with 0 items found.'
        );
      } catch (err: any) {
        logger.error(`Scan failed: ${err?.message || err}`, 'Scanner');
        showToast(`Samba volume scan failed: ${err?.message || 'Unknown error'}`);
      } finally {
        setIsSyncing(false);
        setSyncProgress(INITIAL_SYNC_PROGRESS);
      }
    },
    [isSyncing, sambaConfig, mediaExtensionConfig, scanDepthLimit, upsertMediaItems, appendSyncLog, showToast]
  );

  const handleQuickSync = useCallback(async () => {
    if (isQuickSyncing) return;
    setIsQuickSyncing(true);
    try {
      await handleScanSambaVolume();
    } finally {
      setIsQuickSyncing(false);
    }
  }, [isQuickSyncing, handleScanSambaVolume]);

  const handlePushToSamba = useCallback(
    async (media: MediaMetadata, customXml?: string) => {
      const nfoXml = customXml || media.nfoContent || generateMetadataFile(media);
      const targetFolder = media.recommendedFolderStructure || media.folderPath || `Media/${media.title}`;
      try {
        await fetch('/api/samba/push-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media,
            nfoContent: nfoXml,
            targetFolder,
            sambaConfig,
          }),
        }).catch(() => null);
      } finally {
        appendSyncLog({
          type: 'samba_pushed',
          title: `Pushed ${media.title}`,
          details: `Metadata & NFO synced to ${targetFolder}`,
          status: 'success',
        });
        showToast(`Pushed metadata for "${media.title}" to Samba.`);
      }
    },
    [sambaConfig, appendSyncLog, showToast]
  );

  const handleOpenClassifier = useCallback(() => {
    const paths: string[] = [];
    const walk = (nodes: SambaShareNode[]) => {
      for (const n of nodes) {
        if (n.path) paths.push(n.path);
        if (n.children && n.children.length > 0) walk(n.children);
      }
    };
    walk(sambaTree);
    const discovered = classifyAllDiscoveredPaths(
      paths,
      classifierSettings.rules,
      classifierSettings.confidenceThreshold
    );
    setFolderClassifications(discovered);
    setIsClassifierModalOpen(true);
  }, [sambaTree, classifierSettings]);

  const handlePlayMedia = useCallback(
    (media: MediaMetadata, episode?: EpisodeMetadata, track?: TrackMetadata) => {
      setPlayerRecoveryError(null);
      setPlayerMountKey((k) => k + 1);
      setPlayerState({
        isOpen: true,
        media,
        episode,
        track,
      });
    },
    []
  );

  const handleExportLibraryBackup = useCallback(() => {
    const payload = {
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      mediaLibrary,
      customCollections,
      sambaConfig,
      classifierSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sambavault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported Media Vault backup JSON.');
  }, [mediaLibrary, customCollections, sambaConfig, classifierSettings, showToast]);

  const handleClearThumbnailCache = useCallback(async () => {
    try {
      await fetch('/api/thumbnails/cache', { method: 'DELETE' }).catch(() => null);
      showToast('Thumbnail cache cleared.');
    } catch {}
  }, [showToast]);

  const handleSelectViewMediaType = useCallback((type: 'all' | MediaType | 'collections') => {
    setSelectedSearchMediaType(type);
  }, []);

  // Memoized callbacks to keep MediaSearch, CollectionsTab, MusicTab, LibraryStatsTab, and DeduplicationManagerTab props stable
  const handlePushSingleMedia = useCallback(
    (m: MediaMetadata) => handlePushToSamba(m),
    [handlePushToSamba]
  );

  const handleOpenDetails = useCallback((m: MediaMetadata) => {
    setDetailModalMedia(m);
  }, []);

  const handleOpenInNfoStudio = useCallback((m: MediaMetadata) => {
    setNfoTargetMedia(m);
    setActiveTab('nfo-studio');
  }, []);

  const handleTriggerLocalImport = useCallback(() => {
    localImportInputRef.current?.click();
  }, []);

  const handleScanRootSamba = useCallback(() => {
    return handleScanSambaVolume();
  }, [handleScanSambaVolume]);

  const handleOpenManualMatchFromChild = useCallback((rawPathOrName?: string, mediaType?: MediaType) => {
    setManualMatchState({ isOpen: true, rawPathOrName: rawPathOrName || '', mediaType });
  }, []);

  const handleSaveCategorizedMedia = useCallback(
    (m: MediaMetadata) => upsertMediaItems([m]),
    [upsertMediaItems]
  );

  const handleImportMediaBatch = useCallback(
    (items: MediaMetadata[]) => upsertMediaItems(items),
    [upsertMediaItems]
  );

  const handleOpenApiDebugger = useCallback(() => {
    setIsApiDebuggerOpen(true);
  }, []);

  const handleOpenCollectionsTab = useCallback(() => {
    setActiveTab('collections');
  }, []);

  const handleNavigateToSearchAll = useCallback(() => {
    setSelectedSearchMediaType('all');
    setActiveTab('search');
  }, []);

  const handleNavigateToSearchTab = useCallback(() => {
    setActiveTab('search');
  }, []);

  const handleNavigateToVaultTab = useCallback(() => {
    setActiveTab('sqlite-vault');
  }, []);

  const handleNavigateToStatsTab = useCallback(() => {
    setActiveTab('stats');
  }, []);

  const handlePlayMusicTrack = useCallback(
    (m: MediaMetadata, track?: TrackMetadata) => handlePlayMedia(m, undefined, track),
    [handlePlayMedia]
  );

  const handlePlayMediaDefault = useCallback(
    (m: MediaMetadata) => handlePlayMedia(m),
    [handlePlayMedia]
  );

  const handleOpenHistoryDetails = useCallback(
    (mediaId: string) => {
      const found = mediaByIdMap.get(mediaId);
      if (found) setDetailModalMedia(found);
    },
    [mediaByIdMap]
  );

  const handlePopulateFromSambaTree = useCallback(() => {
    extractAllMediaFromSambaTreeAsync(sambaTree)
      .then((items) => {
        if (items.length > 0) upsertMediaItems(items);
      })
      .catch(() => null);
  }, [sambaTree, upsertMediaItems]);

  const handleDismissLastScanSummary = useCallback(() => {
    setLastScanSummary(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Hidden local file input for menu / toolbar import trigger */}
      <input
        ref={localImportInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []) as File[];
          if (files.length > 0) {
            handleImportFiles(files);
          }
          e.target.value = '';
        }}
      />

      <MenuBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSelectViewMediaType={handleSelectViewMediaType}
        selectedMediaType={selectedSearchMediaType}
        sambaConfig={sambaConfig}
        isConnected={isConnected}
        onScanSamba={() => handleScanSambaVolume()}
        onQuickSync={handleQuickSync}
        isQuickSyncing={isQuickSyncing}
        onOpenClassifierModal={handleOpenClassifier}
        onOpenQuickMount={() => setActiveTab('samba-mount')}
        onOpenManualMatch={() => setManualMatchState({ isOpen: true, rawPathOrName: '' })}
        onClearThumbnailCache={handleClearThumbnailCache}
        onTriggerLocalImport={() => localImportInputRef.current?.click()}
        onExportLibraryBackup={handleExportLibraryBackup}
        onRefreshStatus={() => handleTestSambaConnection()}
        onOpenApiDebugger={() => setIsApiDebuggerOpen(true)}
      />

      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sambaConfig={sambaConfig}
        setSambaConfig={setSambaConfig}
        isConnected={isConnected}
        onOpenQuickMount={() => setActiveTab('samba-mount')}
        onQuickSync={handleQuickSync}
        isQuickSyncing={isQuickSyncing}
        watchlistCount={watchlistCount}
        onOpenApiDebugger={() => setIsApiDebuggerOpen(true)}
        serverVersionInfo={serverVersionInfo}
        syncProgress={syncProgress}
      />

      {syncProgress.isActive && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
          <Suspense fallback={null}>
            <SyncProgressBar progress={syncProgress} />
          </Suspense>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'search' && (
          <ErrorBoundary tabName="Search & Metadata">
            <MediaSearch
              mediaLibrary={mediaLibrary}
              sambaTree={sambaTree}
              customCollections={customCollections}
              onPushToSamba={handlePushSingleMedia}
              onOpenDetails={handleOpenDetails}
              onOpenInNfoStudio={handleOpenInNfoStudio}
              onPlayMedia={handlePlayMedia}
              sambaConfig={sambaConfig}
              onImportFiles={handleImportFiles}
              onTriggerLocalImport={handleTriggerLocalImport}
              onSyncFromSamba={handleScanRootSamba}
              onOpenManualMatch={handleOpenManualMatchFromChild}
              onSaveCategorizedMedia={handleSaveCategorizedMedia}
              onImportMediaBatch={handleImportMediaBatch}
              isSyncing={isSyncing}
              scanRootPath={sambaConfig.hostPath || sambaConfig.mountPath}
              selectedMediaType={selectedSearchMediaType}
              onSelectMediaType={setSelectedSearchMediaType}
              onOpenApiDebugger={handleOpenApiDebugger}
              onOpenClassifierModal={handleOpenClassifier}
              onOpenCollectionsTab={handleOpenCollectionsTab}
              enableVirtualization={true}
              onIndexedDbSearch={queryIndexedSqliteMedia}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'collections' && (
          <ErrorBoundary tabName="Collections">
            <Suspense fallback={TabLoadingFallback}>
              <CollectionsTab
                mediaLibrary={mediaLibrary}
                sambaTree={sambaTree}
                customCollections={customCollections}
                onCreateCollection={handleCreateCollection}
                onUpdateCollection={handleUpdateCollection}
                onDeleteCollection={handleDeleteCollection}
                onPlayMedia={handlePlayMedia}
                onOpenDetails={handleOpenDetails}
                onPushToSamba={handlePushSingleMedia}
                onNavigateToSearch={handleNavigateToSearchAll}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'music' && (
          <ErrorBoundary tabName="Music & Audio Vault">
            <Suspense fallback={TabLoadingFallback}>
              <MusicTab
                mediaLibrary={mediaLibrary}
                onPlayMedia={handlePlayMusicTrack}
                onOpenDetails={handleOpenDetails}
                sambaConfig={sambaConfig}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'watchlist' && (
          <ErrorBoundary tabName="Watchlist">
            <Suspense fallback={TabLoadingFallback}>
              <WatchlistTab
                onPlayMedia={handlePlayMediaDefault}
                onOpenDetails={handleOpenDetails}
                onPushToSamba={handlePushSingleMedia}
                onNavigateToSearch={handleNavigateToSearchTab}
                sambaConfig={sambaConfig}
                allMediaLibrary={mediaLibrary}
                onOpenInNfoStudio={handleOpenInNfoStudio}
                onWatchlistCountChange={setWatchlistCount}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'history' && (
          <ErrorBoundary tabName="Watch History">
            <Suspense fallback={TabLoadingFallback}>
              <WatchHistoryTab
                onOpenDetails={handleOpenHistoryDetails}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'sqlite-vault' && (
          <ErrorBoundary tabName="SQLite Vault">
            <Suspense fallback={TabLoadingFallback}>
              <SqliteVault
                onOpenDetails={handleOpenDetails}
                onNavigateToStats={handleNavigateToStatsTab}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'dedup' && (
          <ErrorBoundary tabName="Deduplication Manager">
            <Suspense fallback={TabLoadingFallback}>
              <DeduplicationManagerTab
                mediaLibrary={mediaLibrary}
                onRemoveItem={handleRemoveSingleMediaItem}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'stats' && (
          <ErrorBoundary tabName="Library Stats">
            <Suspense fallback={TabLoadingFallback}>
              <LibraryStatsTab
                onNavigateToVault={handleNavigateToVaultTab}
                onOpenDetails={handleOpenDetails}
                mediaLibrary={mediaLibrary}
                onUpdateMedia={handleImportMediaBatch}
                showToast={showToast}
                sambaTree={sambaTree}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'cleaner' && (
          <ErrorBoundary tabName="Batch File Cleaner">
            <Suspense fallback={TabLoadingFallback}>
              <BatchFilenameCleaner
                sambaConfig={sambaConfig}
                onBatchPushToSamba={(items: ParsedFileInfo[]) => {
                  const metas = items.map(parsedFileToMediaMetadata);
                  upsertMediaItems(metas);
                  showToast(`Queued ${items.length} cleaned file(s) for Samba push.`);
                }}
                onAddToLibrary={(items: ParsedFileInfo[]) => {
                  const metas = items.map(parsedFileToMediaMetadata);
                  upsertMediaItems(metas);
                  showToast(`Added ${metas.length} item(s) to Media Library.`);
                }}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'explorer' && (
          <ErrorBoundary tabName="Samba Share Browser">
            <Suspense fallback={TabLoadingFallback}>
              <SambaExplorer
                sambaConfig={sambaConfig}
                setSambaConfig={setSambaConfig}
                sambaTree={sambaTree}
                setSambaTree={setSambaTree}
                syncLogs={syncLogs}
                setSyncLogs={setSyncLogs}
                onOpenDetails={handleOpenDetails}
                onOpenInNfoStudio={handleOpenInNfoStudio}
                onRefreshSamba={() => handleTestSambaConnection()}
                onSyncSamba={handleScanSambaVolume}
                onQuickSync={handleQuickSync}
                isQuickSyncing={isQuickSyncing}
                onOpenClassifierModal={handleOpenClassifier}
                onPopulateMediaLibrary={handlePopulateFromSambaTree}
                isSyncing={isSyncing}
                isMountedInFinder={isMountedInFinder}
                mountedVolumeInfo={mountedVolumeInfo}
                extensionConfig={mediaExtensionConfig}
                onUpdateExtensionConfig={setMediaExtensionConfig}
                depthLimit={scanDepthLimit}
                onUpdateDepthLimit={setScanDepthLimit}
                lastScanSummary={lastScanSummary}
                onDismissLastScanSummary={handleDismissLastScanSummary}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'samba-mount' && (
          <ErrorBoundary tabName="Cross-Platform Mount">
            <Suspense fallback={TabLoadingFallback}>
              <SambaMountHub
                sambaConfig={sambaConfig}
                setSambaConfig={setSambaConfig}
                isConnected={isConnected}
                onTestConnection={() => handleTestSambaConnection()}
                isTesting={isTestingConnection}
                connectionDetails={connectionDetails}
                isMountedInFinder={isMountedInFinder}
                mountedVolumeInfo={mountedVolumeInfo}
                systemVolumes={systemVolumes}
                isDesktopApp={isTauriEnvironment()}
                onSyncPath={handleScanSambaVolume}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'nfo-studio' && (
          <ErrorBoundary tabName="NFO / XML Studio">
            <Suspense fallback={TabLoadingFallback}>
              <NfoStudio
                initialMedia={nfoTargetMedia}
                sambaConfig={sambaConfig}
                onPushNfoToSamba={(media, xml) => handlePushToSamba(media, xml)}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'console' && (
          <ErrorBoundary tabName="Console Logs">
            <Suspense fallback={TabLoadingFallback}>
              <ConsoleTab
                onRetryFailedFiles={async () => handleScanSambaVolume()}
                onTriggerSync={async () => handleScanSambaVolume()}
                sambaConfig={sambaConfig}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'youtube' && (
          <ErrorBoundary tabName="YouTube Feed">
            <Suspense fallback={TabLoadingFallback}>
              <YouTubeTab />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'settings' && (
          <ErrorBoundary tabName="Settings">
            <Suspense fallback={TabLoadingFallback}>
              <SettingsTab
                classifierSettings={classifierSettings}
                onUpdateClassifierSettings={setClassifierSettings}
                sambaConfig={sambaConfig}
                onUpdateSambaConfig={setSambaConfig}
                onClearThumbnailCache={handleClearThumbnailCache}
                onExportLibraryBackup={handleExportLibraryBackup}
                onManualTriggerSync={handleScanRootSamba}
                scanDepthLimit={scanDepthLimit}
                onUpdateScanDepthLimit={setScanDepthLimit}
                transcodeConfig={transcodeConfig}
                onUpdateTranscodeConfig={setTranscodeConfig}
                serverVersionInfo={serverVersionInfo}
                mediaLibrary={mediaLibrary}
                sambaTree={sambaTree}
                customCollections={customCollections}
                onRemoveMediaItemsByIds={removeMediaItemsByIds}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {/* Media Detail Modal */}
      {detailModalMedia && (
        <Suspense fallback={null}>
          <MediaDetailModal
            media={detailModalMedia}
            onClose={() => setDetailModalMedia(null)}
            onPushToSamba={(m) => handlePushToSamba(m)}
            onOpenInNfoStudio={(m) => {
              setDetailModalMedia(null);
              setNfoTargetMedia(m);
              setActiveTab('nfo-studio');
            }}
            onPlayMedia={(m, ep, track) => {
              setDetailModalMedia(null);
              handlePlayMedia(m, ep, track);
            }}
            onUpdateMedia={(updated) => {
              upsertMediaItems([updated]);
              setDetailModalMedia(updated);
            }}
            onOpenManualMatcher={(m) => {
              setDetailModalMedia(null);
              setManualMatchState({ isOpen: true, rawPathOrName: m.title, mediaType: m.type });
            }}
            sambaConfig={sambaConfig}
            mediaLibrary={mediaLibrary}
            onSelectMedia={(m) => setDetailModalMedia(m)}
          />
        </Suspense>
      )}

      {/* Media Player Modal wrapped in Centralized Stream Recovery Monitor */}
      {playerState.isOpen && playerState.media && (
        playerRecoveryError ? (
          <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">Stream Recovery Active</h3>
                <p className="text-xs text-slate-400">
                  The media player encountered a stream interruption and reset to prevent a blank screen.
                </p>
                <p className="text-[11px] font-mono text-amber-300 bg-slate-950 border border-slate-800 rounded-lg p-2 break-words">
                  {playerRecoveryError}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2.5 pt-2">
                <button
                  id="stream-recovery-retry-btn"
                  onClick={handleRetryStream}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Retry Stream</span>
                </button>
                <button
                  onClick={() => {
                    setPlayerRecoveryError(null);
                    setPlayerState({ isOpen: false, media: null });
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
                >
                  Close Player
                </button>
              </div>
            </div>
          </div>
        ) : (
          <ErrorBoundary
            key={`player-boundary-${playerMountKey}`}
            tabName="Media Player"
            fallback={
              <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-4">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <h3 className="text-base font-bold text-white">Player Stream Reset</h3>
                  <p className="text-xs text-slate-400">
                    The playback session was reset after a render error. Click Retry Stream to re-initialize.
                  </p>
                  <div className="flex items-center justify-center gap-2.5">
                    <button
                      onClick={handleRetryStream}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Retry Stream</span>
                    </button>
                    <button
                      onClick={() => setPlayerState({ isOpen: false, media: null })}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            }
          >
            <Suspense fallback={null}>
              <MediaPlayerModal
                key={`player-${playerState.media.id}-${playerMountKey}`}
                isOpen={playerState.isOpen}
                media={playerState.media}
                initialEpisode={playerState.episode}
                initialTrack={playerState.track}
                onClose={() => {
                  setPlayerRecoveryError(null);
                  setPlayerState({ isOpen: false, media: null });
                }}
                sambaConfig={sambaConfig}
                mediaLibrary={mediaLibrary}
                onSelectMedia={(m) => setPlayerState((prev) => ({ ...prev, media: m }))}
                onNavigateToMountHub={() => {
                  setPlayerState({ isOpen: false, media: null });
                  setActiveTab('samba-mount');
                }}
                onTestConnection={(cfg) => handleTestSambaConnection(cfg)}
                transcodeConfig={transcodeConfig}
              />
            </Suspense>
          </ErrorBoundary>
        )
      )}

      {/* Manual Match Modal (lazy-mounted when open) */}
      {manualMatchState.isOpen && (
        <Suspense fallback={null}>
          <ManualMatchModal
            isOpen={manualMatchState.isOpen}
            onClose={() => setManualMatchState({ isOpen: false, rawPathOrName: '' })}
            rawPathOrName={manualMatchState.rawPathOrName}
            initialMediaType={manualMatchState.mediaType}
            onSaveMatchedMedia={(matched) => {
              upsertMediaItems([matched]);
              showToast(`Saved matched metadata for "${matched.title}".`);
            }}
          />
        </Suspense>
      )}

      {/* Folder Classifier Modal (lazy-mounted when open) */}
      {isClassifierModalOpen && (
        <Suspense fallback={null}>
          <FolderClassifierModal
            isOpen={isClassifierModalOpen}
            onClose={() => setIsClassifierModalOpen(false)}
            folderClassifications={folderClassifications}
            onConfirmImport={(updated, nextSettings) => {
              setClassifierSettings(nextSettings);
              const chosen = updated.filter((c) => c.selectedForImport && c.targetType !== 'ignore');
              if (chosen.length > 0) {
                const items = chosen.map((c) => {
                  const parsed = parseTitleAndYear(c.folderName);
                  return parsedFileToMediaMetadata({
                    id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    originalFilename: c.sampleFiles[0] || c.folderName,
                    detectedType: c.targetType as MediaType,
                    detectedTitle: parsed.title,
                    detectedYear: parsed.year,
                    cleanFormattedFilename: c.folderName,
                    cleanFolderPath: c.relativePath,
                    status: 'matched',
                  });
                });
                upsertMediaItems(items);
                showToast(`Imported ${items.length} classified folder(s).`);
              }
              setIsClassifierModalOpen(false);
            }}
            settings={classifierSettings}
            onUpdateSettings={setClassifierSettings}
            sambaConfig={sambaConfig}
          />
        </Suspense>
      )}

      {/* API Debugger & Disk Access & Vault Backup Overlays (lazy-mounted when open) */}
      {isApiDebuggerOpen && (
        <Suspense fallback={null}>
          <ApiDebuggerOverlay
            isOpen={isApiDebuggerOpen}
            onClose={() => setIsApiDebuggerOpen(false)}
          />
        </Suspense>
      )}

      {isFullDiskOverlayOpen && (
        <Suspense fallback={null}>
          <FullDiskAccessOverlay
            isOpen={isFullDiskOverlayOpen}
            onClose={() => setIsFullDiskOverlayOpen(false)}
            status={fullDiskStatus}
            onRecheck={async () => {
              const st = await checkFullDiskAccess(true);
              setFullDiskStatus(st);
              return Boolean(st?.hasFullDiskAccess);
            }}
            onOpenSettings={async () => {
              await openMacOSSecurityPrivacy();
            }}
          />
        </Suspense>
      )}

      {isBackupModalOpen && (
        <Suspense fallback={null}>
          <VaultStorageBackupModal
            isOpen={isBackupModalOpen}
            onClose={() => setIsBackupModalOpen(false)}
            sambaTree={sambaTree}
            syncLogs={syncLogs}
            sambaConfig={sambaConfig}
            classifierSettings={classifierSettings}
            mediaExtensionConfig={mediaExtensionConfig}
            mediaLibrary={mediaLibrary}
            storageInfo={storageInfo}
            onRestoreState={(restored) => {
              if (Array.isArray(restored?.mediaLibrary)) {
                dispatchMediaLibrary({ type: 'SET_ALL', items: restored.mediaLibrary });
              }
              if (Array.isArray(restored?.sambaTree)) setSambaTree(restored.sambaTree);
              if (Array.isArray(restored?.customCollections)) setCustomCollections(restored.customCollections);
              if (restored?.sambaConfig) setSambaConfig(restored.sambaConfig);
              showToast('Vault backup restored.');
            }}
            onForceSaveToDisk={persistVaultSnapshot}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* Subtle Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 border border-indigo-500/40 text-slate-100 text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
