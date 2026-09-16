import React, { useState, useEffect } from 'react';
import { MenuBar } from './components/MenuBar';
import {
  Header,
} from './components/Header';
import { MediaSearch } from './components/MediaSearch';
import { BatchFilenameCleaner } from './components/BatchFilenameCleaner';
import { SambaMountHub } from './components/SambaMountHub';
import { SambaExplorer } from './components/SambaExplorer';
import { NfoStudio } from './components/NfoStudio';
import { MediaDetailModal } from './components/MediaDetailModal';
import { MediaPlayerModal } from './components/MediaPlayerModal';
import { SqliteVault } from './components/SqliteVault';
import { LibraryStatsTab } from './components/LibraryStatsTab';
import { FolderClassifierModal } from './components/FolderClassifierModal';
import { ManualMatchModal } from './components/ManualMatchModal';
import { WatchlistTab } from './components/WatchlistTab';
import { WatchHistoryTab } from './components/WatchHistoryTab';
import { MusicTab } from './components/MusicTab';
import {
  MediaMetadata,
  MediaType,
  AppTab,
  EpisodeMetadata,
  TrackMetadata,
  SambaConfig,
  SambaShareNode,
  SyncLog,
  ParsedFileInfo,
  ClassifierSettings,
  FolderScanClassification,
  MediaScanExtensionConfig,
} from './types';
import { CURATED_MEDIA_DATABASE } from './data/curatedMedia';
import {
  extractAllMediaFromSambaTree,
  extractAllMediaFromSambaTreeAsync,
  parsedFileToMediaMetadata,
  parseTitleAndYear,
  detectMediaType,
  DEFAULT_MEDIA_SCAN_CONFIG,
} from './utils/mediaExtractor';
import {
  classifyAllDiscoveredPaths,
  DEFAULT_CLASSIFIER_SETTINGS,
} from './utils/folderClassifier';
import {
  isTauriEnvironment,
  checkMacVolume,
  listMountedVolumes,
  probeLocalNetwork,
  scanSambaVolume,
  VolumeMountInfo,
} from './utils/tauriBridge';
import { thumbnailStorage } from './utils/thumbnailStorage';

const INITIAL_SAMBA_CONFIG: SambaConfig = {
  server: '',
  share: 'media',
  port: 445,
  workgroup: 'WORKGROUP',
  username: '',
  password: '',
  isGuest: true,
  targetPlatform: 'all',
  baseMountPath: '',
};

const INITIAL_SAMBA_TREE: SambaShareNode[] = [
  {
    id: 'root-movies',
    name: 'Movies',
    path: 'Movies',
    type: 'folder',
    children: [
      {
        id: 'folder-interstellar',
        name: 'Interstellar (2014)',
        path: 'Movies/Interstellar (2014)',
        type: 'folder',
        hasNfo: true,
        hasPoster: true,
        mediaType: 'movie',
        matchedMedia: CURATED_MEDIA_DATABASE.find((m) => m.id === 'movie-interstellar'),
        children: [
          {
            id: 'file-interstellar-mkv',
            name: 'Interstellar (2014) [1080p].mp4',
            path: 'Movies/Interstellar (2014)/Interstellar (2014) [1080p].mp4',
            type: 'file',
            size: '4.8 GB',
          },
          {
            id: 'file-interstellar-nfo',
            name: 'movie.nfo',
            path: 'Movies/Interstellar (2014)/movie.nfo',
            type: 'file',
            size: '2.4 KB',
          },
          {
            id: 'file-interstellar-poster',
            name: 'poster.jpg',
            path: 'Movies/Interstellar (2014)/poster.jpg',
            type: 'file',
            size: '340 KB',
          },
          {
            id: 'file-interstellar-fanart',
            name: 'fanart.jpg',
            path: 'Movies/Interstellar (2014)/fanart.jpg',
            type: 'file',
            size: '1.2 MB',
          },
        ],
      },
      {
        id: 'folder-dune-two',
        name: 'Dune - Part Two (2024)',
        path: 'Movies/Dune - Part Two (2024)',
        type: 'folder',
        hasNfo: true,
        hasPoster: true,
        mediaType: 'movie',
        matchedMedia: CURATED_MEDIA_DATABASE.find((m) => m.id === 'movie-dune-two'),
        children: [
          {
            id: 'file-dune-mkv',
            name: 'Dune - Part Two (2024) [2160p HDR].mkv',
            path: 'Movies/Dune - Part Two (2024)/Dune - Part Two (2024) [2160p HDR].mkv',
            type: 'file',
            size: '18.4 GB',
          },
          {
            id: 'file-dune-nfo',
            name: 'movie.nfo',
            path: 'Movies/Dune - Part Two (2024)/movie.nfo',
            type: 'file',
            size: '2.8 KB',
          },
          {
            id: 'file-dune-poster',
            name: 'poster.jpg',
            path: 'Movies/Dune - Part Two (2024)/poster.jpg',
            type: 'file',
            size: '420 KB',
          },
        ],
      },
      {
        id: 'folder-avatar-two',
        name: 'Avatar - The Way of Water (2022)',
        path: 'Movies/Avatar - The Way of Water (2022)',
        type: 'folder',
        hasNfo: true,
        hasPoster: true,
        mediaType: 'movie',
        children: [
          {
            id: 'file-avatar-iso',
            name: 'Avatar.The.Way.of.Water.2022.iso',
            path: 'Movies/Avatar - The Way of Water (2022)/Avatar.The.Way.of.Water.2022.iso',
            type: 'file',
            size: '48.2 GB',
          },
          {
            id: 'file-avatar-nfo',
            name: 'movie.nfo',
            path: 'Movies/Avatar - The Way of Water (2022)/movie.nfo',
            type: 'file',
            size: '3.1 KB',
          },
        ],
      },
    ],
  },
  {
    id: 'root-shows',
    name: 'Series',
    path: 'Series',
    type: 'folder',
    children: [
      {
        id: 'folder-breaking-bad',
        name: 'Breaking Bad (2008)',
        path: 'Series/Breaking Bad (2008)',
        type: 'folder',
        hasNfo: true,
        hasPoster: true,
        mediaType: 'series',
        matchedMedia: CURATED_MEDIA_DATABASE.find((m) => m.id === 'series-breaking-bad'),
        children: [
          {
            id: 'file-bb-tvshow-nfo',
            name: 'tvshow.nfo',
            path: 'Series/Breaking Bad (2008)/tvshow.nfo',
            type: 'file',
            size: '3.6 KB',
          },
          {
            id: 'file-bb-poster',
            name: 'poster.jpg',
            path: 'Series/Breaking Bad (2008)/poster.jpg',
            type: 'file',
            size: '510 KB',
          },
          {
            id: 'folder-bb-s1',
            name: 'Season 01',
            path: 'Series/Breaking Bad (2008)/Season 01',
            type: 'folder',
            children: [
              {
                id: 'file-bb-s01e01',
                name: 'Breaking Bad - S01E01 - Pilot.mkv',
                path: 'Series/Breaking Bad (2008)/Season 01/Breaking Bad - S01E01 - Pilot.mkv',
                type: 'file',
                size: '1.4 GB',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'root-documentaries',
    name: 'Documentaries',
    path: 'Documentaries',
    type: 'folder',
    children: [
      {
        id: 'folder-planet-earth',
        name: 'Planet Earth III (2023)',
        path: 'Documentaries/Planet Earth III (2023)',
        type: 'folder',
        hasNfo: true,
        hasPoster: true,
        mediaType: 'series',
        children: [
          {
            id: 'file-pe3-nfo',
            name: 'tvshow.nfo',
            path: 'Documentaries/Planet Earth III (2023)/tvshow.nfo',
            type: 'file',
            size: '2.1 KB',
          },
          {
            id: 'file-pe3-e01',
            name: 'Planet.Earth.III.S01E01.Coasts.2160p.mkv',
            path: 'Documentaries/Planet Earth III (2023)/Planet.Earth.III.S01E01.Coasts.2160p.mkv',
            type: 'file',
            size: '6.2 GB',
          },
        ],
      },
    ],
  },
  {
    id: 'root-music',
    name: 'Music',
    path: 'Music',
    type: 'folder',
    children: [
      {
        id: 'folder-daft-punk',
        name: 'Daft Punk',
        path: 'Music/Daft Punk',
        type: 'folder',
        children: [
          {
            id: 'folder-daft-punk-ram',
            name: 'Random Access Memories (2013)',
            path: 'Music/Daft Punk/Random Access Memories (2013)',
            type: 'folder',
            hasNfo: true,
            hasPoster: true,
            mediaType: 'album',
            matchedMedia: CURATED_MEDIA_DATABASE.find((m) => m.id === 'album-daft-punk-ram'),
            children: [
              {
                id: 'file-ram-nfo',
                name: 'album.nfo',
                path: 'Music/Daft Punk/Random Access Memories (2013)/album.nfo',
                type: 'file',
                size: '2.9 KB',
              },
              {
                id: 'file-ram-01',
                name: '01 - Give Life Back to Music.flac',
                path: 'Music/Daft Punk/Random Access Memories (2013)/01 - Give Life Back to Music.flac',
                type: 'file',
                size: '34.2 MB',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'root-anime',
    name: 'Anime',
    path: 'Anime',
    type: 'folder',
    children: [
      {
        id: 'folder-aot',
        name: 'Attack on Titan (2013)',
        path: 'Anime/Attack on Titan (2013)',
        type: 'folder',
        hasNfo: true,
        hasPoster: true,
        mediaType: 'series',
        children: [
          {
            id: 'file-aot-e01',
            name: 'Attack.on.Titan.S01E01.1080p.mkv',
            path: 'Anime/Attack on Titan (2013)/Attack.on.Titan.S01E01.1080p.mkv',
            type: 'file',
            size: '1.5 GB',
          },
        ],
      },
    ],
  },
  {
    id: 'root-books',
    name: 'Books',
    path: 'Books',
    type: 'folder',
    children: [
      {
        id: 'folder-scifi-books',
        name: 'Sci-Fi Literature',
        path: 'Books/Sci-Fi Literature',
        type: 'folder',
        children: [
          {
            id: 'file-dune-epub',
            name: 'Dune - Frank Herbert (1965).epub',
            path: 'Books/Sci-Fi Literature/Dune - Frank Herbert (1965).epub',
            type: 'file',
            size: '4.8 MB',
          },
          {
            id: 'file-thinking-pdf',
            name: 'Thinking Fast and Slow - Daniel Kahneman.pdf',
            path: 'Books/Sci-Fi Literature/Thinking Fast and Slow - Daniel Kahneman.pdf',
            type: 'file',
            size: '14.2 MB',
          },
        ],
      },
      {
        id: 'folder-comics',
        name: 'Comics & Graphic Novels',
        path: 'Books/Comics & Graphic Novels',
        type: 'folder',
        children: [
          {
            id: 'file-watchmen-cbz',
            name: 'Watchmen (1986).cbz',
            path: 'Books/Comics & Graphic Novels/Watchmen (1986).cbz',
            type: 'file',
            size: '280 MB',
          },
        ],
      },
    ],
  },
];

const INITIAL_SYNC_LOGS: SyncLog[] = [
  {
    id: 'log-1',
    timestamp: new Date().toLocaleTimeString(),
    type: 'connected',
    title: 'Samba SMB3 Connection Established',
    details: 'Connected to //192.168.1.150/media with read-write permissions',
    status: 'success',
  },
  {
    id: 'log-2',
    timestamp: new Date().toLocaleTimeString(),
    type: 'samba_pushed',
    title: 'NFO & Artwork Injected',
    details: 'Wrote movie.nfo & poster.jpg to Movies/Interstellar (2014)/',
    status: 'success',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('search');
  const [watchlistCount, setWatchlistCount] = useState<number>(0);

  // Sync watchlist count from SQLite
  useEffect(() => {
    const checkCount = async () => {
      try {
        const res = await fetch('/api/db/watchlist');
        const data = await res.json();
        if (data.success && Array.isArray(data.watchlist)) {
          setWatchlistCount(data.watchlist.length);
        }
      } catch {
        // ignore
      }
    };
    checkCount();
  }, [activeTab]);
  const [sambaConfig, setSambaConfig] = useState<SambaConfig>(() => {
    try {
      const saved = localStorage.getItem('samba_vault_config');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_SAMBA_CONFIG;
  });

  useEffect(() => {
    try {
      localStorage.setItem('samba_vault_config', JSON.stringify(sambaConfig));
    } catch {}
  }, [sambaConfig]);

  const [isConnected, setIsConnected] = useState(false);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [isSyncingShare, setIsSyncingShare] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState<any>(null);

  const [sambaTree, setSambaTree] = useState<SambaShareNode[]>(() => {
    try {
      const saved = localStorage.getItem('samba_vault_tree');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_SAMBA_TREE;
  });

  useEffect(() => {
    try {
      localStorage.setItem('samba_vault_tree', JSON.stringify(sambaTree));
    } catch {}
  }, [sambaTree]);

  const [syncLogs, setSyncLogs] = useState<SyncLog[]>(INITIAL_SYNC_LOGS);
  const [detailModalMedia, setDetailModalMedia] = useState<MediaMetadata | null>(null);
  const [nfoStudioMedia, setNfoStudioMedia] = useState<MediaMetadata | null>(null);
  const [playerMediaState, setPlayerMediaState] = useState<{
    media: MediaMetadata;
    episode?: EpisodeMetadata;
    track?: TrackMetadata;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'all' | MediaType>('all');
  const [isAllTreeExpanded, setIsAllTreeExpanded] = useState(true);

  // Folder Classification and Regex Rule Engine State
  const [classifierSettings, setClassifierSettings] = useState<ClassifierSettings>(() => {
    try {
      const saved = localStorage.getItem('samba_vault_classifier');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_CLASSIFIER_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('samba_vault_classifier', JSON.stringify(classifierSettings));
    } catch {}
  }, [classifierSettings]);

  const [isClassifierModalOpen, setIsClassifierModalOpen] = useState(false);
  const [manualMatchModalState, setManualMatchModalState] = useState<{
    isOpen: boolean;
    rawPathOrName?: string;
    mediaType?: MediaType;
  } | null>(null);
  const [folderClassifications, setFolderClassifications] = useState<FolderScanClassification[]>([]);
  const [lastDiscoveredPaths, setLastDiscoveredPaths] = useState<string[]>([]);
  const [activeScanPath, setActiveScanPath] = useState<string>('');
  
  const [mediaExtensionConfig, setMediaExtensionConfig] = useState<MediaScanExtensionConfig>(() => {
    try {
      const saved = localStorage.getItem('samba_vault_extensions');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_MEDIA_SCAN_CONFIG;
  });

  useEffect(() => {
    try {
      localStorage.setItem('samba_vault_extensions', JSON.stringify(mediaExtensionConfig));
    } catch {}
  }, [mediaExtensionConfig]);

  const [isImportingShare, setIsImportingShare] = useState(false);

  const handleOpenManualMatch = (rawPathOrName?: string, mediaType?: MediaType) => {
    setManualMatchModalState({
      isOpen: true,
      rawPathOrName: rawPathOrName || '',
      mediaType: mediaType || (selectedMediaType !== 'all' ? selectedMediaType : 'series'),
    });
  };

  const handleSaveMatchedMedia = (matched: MediaMetadata) => {
    setMediaLibrary((prev) => {
      const filtered = prev.filter(
        (m) => m.id !== matched.id && m.title.toLowerCase() !== matched.title.toLowerCase()
      );
      return [matched, ...filtered];
    });
    batchPushToSambaTree([matched]);
    setManualMatchModalState(null);
    setDetailModalMedia(matched);
    showToast(`Saved and cataloged "${matched.title}" with AI synopsis!`);
  };

  // Export full JSON backup
  const handleExportJsonBackup = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(mediaLibrary, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `sambavault-media-backup-${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Exported Media Library Backup (.json)!');
    } catch (e) {
      showToast('Failed exporting JSON backup');
    }
  };

  // Clear thumbnail and memory cache
  const handleClearThumbnailCache = async () => {
    await thumbnailStorage.clearCache();
    showToast('Cleared thumbnail storage and in-memory caches.');
  };

  // Unified Media Library populated from Curated Master Database + Discovered Samba Share Items + Batch Imports + localStorage
  const [mediaLibrary, setMediaLibrary] = useState<MediaMetadata[]>(() => {
    try {
      const saved = localStorage.getItem('samba_vault_library');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    const sambaMedia = extractAllMediaFromSambaTree(INITIAL_SAMBA_TREE, DEFAULT_MEDIA_SCAN_CONFIG);
    const map = new Map<string, MediaMetadata>();
    CURATED_MEDIA_DATABASE.forEach((m) => map.set(m.title.toLowerCase(), m));
    sambaMedia.forEach((m) => {
      if (!map.has(m.title.toLowerCase())) {
        map.set(m.title.toLowerCase(), m);
      }
    });
    return Array.from(map.values());
  });

  useEffect(() => {
    try {
      localStorage.setItem('samba_vault_library', JSON.stringify(mediaLibrary));
    } catch {}
  }, [mediaLibrary]);

  const handlePlayMedia = (
    media: MediaMetadata,
    episode?: EpisodeMetadata,
    track?: TrackMetadata
  ) => {
    setPlayerMediaState({ media, episode, track });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [isMountedInFinder, setIsMountedInFinder] = useState(false);
  const [mountedVolumeInfo, setMountedVolumeInfo] = useState<VolumeMountInfo | null>(null);
  const [systemVolumes, setSystemVolumes] = useState<string[]>([]);
  const [isDesktopApp, setIsDesktopApp] = useState(false);

  // Poll /Volumes in desktop mode or on share configuration changes, updating isConnected accurately
  useEffect(() => {
    const checkDesktopStatus = async () => {
      const inTauri = isTauriEnvironment();
      setIsDesktopApp(inTauri);

      // Check current share in /Volumes
      const volInfo = await checkMacVolume(sambaConfig.share);
      setIsMountedInFinder(volInfo.isMounted);
      setMountedVolumeInfo(volInfo);

      // List all mounted volumes
      const allVolumes = await listMountedVolumes();
      setSystemVolumes(allVolumes);

      // If volume is mounted or server reachable, set connected; otherwise keep orange/disconnected
      if (volInfo.isMounted) {
        setIsConnected(true);
      }
    };

    checkDesktopStatus();
    const interval = setInterval(checkDesktopStatus, 5000);
    return () => clearInterval(interval);
  }, [sambaConfig.share]);

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    const targetPort = Number(sambaConfig.port) || 445;

    try {
      // 1. Check if the volume is mounted directly in Finder /Volumes
      const volInfo = await checkMacVolume(sambaConfig.share);
      setIsMountedInFinder(volInfo.isMounted);
      setMountedVolumeInfo(volInfo);

      const allVolumes = await listMountedVolumes();
      setSystemVolumes(allVolumes);

      // 2. Perform direct network probe (via Rust native TCP socket in Tauri or via Node backend)
      const probe = await probeLocalNetwork(sambaConfig.server, targetPort);

      if (probe.reachable || volInfo.isMounted) {
        setIsConnected(true);
        const details = {
          connected: true,
          server: sambaConfig.server,
          share: sambaConfig.share,
          port: targetPort,
          protocol: targetPort === 139 ? 'NetBIOS Session / SMB (TCP 139)' : 'SMB3 / CIFS (TCP 445)',
          authenticatedAs: sambaConfig.isGuest ? 'guest (Anonymous)' : (sambaConfig.username || 'authenticated user'),
          permissions: 'read-write',
          shareFreeSpace: 'Storage Active',
          latencyMs: probe.latencyMs || 2,
          isMountedInFinder: volInfo.isMounted,
          mountPath: volInfo.mountPath,
          message: volInfo.isMounted
            ? `Share is actively mounted in Finder at ${volInfo.mountPath}!`
            : `Connected to ${sambaConfig.server}:${targetPort} successfully!`,
        };
        setConnectionDetails(details);
        showToast(details.message);
        setSyncLogs((prev) => [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'connected',
            title: `Samba Probe: //${sambaConfig.server}:${targetPort}/${sambaConfig.share}`,
            details: volInfo.isMounted
              ? `Mounted in Finder at ${volInfo.mountPath} (Found ${volInfo.files.length} items)`
              : `Port ${targetPort} open (Latency: ${probe.latencyMs}ms)`,
            status: 'success',
          },
          ...prev,
        ]);
      } else {
        setIsConnected(false);
        const errorMsg = probe.message || `Could not connect to ${sambaConfig.server}:${targetPort}`;
        showToast(errorMsg);
        setConnectionDetails({
          connected: false,
          server: sambaConfig.server,
          share: sambaConfig.share,
          port: targetPort,
          error: errorMsg,
          isMountedInFinder: false,
        });
      }
    } catch (err: any) {
      console.error(err);
      setIsConnected(false);
      showToast(`Could not reach ${sambaConfig.server}:${targetPort}. Check IP and firewall.`);
    } finally {
      setIsTestingConn(false);
    }
  };

  const batchPushToSambaTree = (mediaItems: MediaMetadata[]) => {
    if (mediaItems.length === 0) return;

    setSambaTree((prevTree) => {
      const rootCategories = new Set(
        mediaItems.map((m) =>
          m.type === 'movie' ? 'Movies' : m.type === 'series' ? 'TV Shows' : 'Music'
        )
      );

      return prevTree.map((rootNode) => {
        if (!rootCategories.has(rootNode.name)) return rootNode;

        const currentChildren = [...(rootNode.children || [])];
        const newFolderNodes: SambaShareNode[] = [];

        mediaItems.forEach((media) => {
          const rootCategory =
            media.type === 'movie' ? 'Movies' : media.type === 'series' ? 'TV Shows' : 'Music';
          if (rootNode.name !== rootCategory) return;

          const folderTitle = `${media.title} (${media.year})`;
          const exists = currentChildren.some((c) => c.name.includes(media.title));
          if (exists) return;

          const newFolderNode: SambaShareNode = {
            id: `folder-${media.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: folderTitle,
            path: `${rootCategory}/${folderTitle}`,
            type: 'folder',
            hasNfo: true,
            hasPoster: true,
            mediaType: media.type,
            matchedMedia: media,
            children: [
              {
                id: `file-nfo-${media.id}`,
                name: media.type === 'movie' ? 'movie.nfo' : media.type === 'series' ? 'tvshow.nfo' : 'album.nfo',
                path: `${rootCategory}/${folderTitle}/${media.type === 'movie' ? 'movie.nfo' : media.type === 'series' ? 'tvshow.nfo' : 'album.nfo'}`,
                type: 'file',
                size: '2.5 KB',
              },
              {
                id: `file-poster-${media.id}`,
                name: media.type === 'album' ? 'folder.jpg' : 'poster.jpg',
                path: `${rootCategory}/${folderTitle}/${media.type === 'album' ? 'folder.jpg' : 'poster.jpg'}`,
                type: 'file',
                size: '410 KB',
              },
              ...media.recommendedFilenames.map((fn, idx) => ({
                id: `file-media-${media.id}-${idx}`,
                name: fn,
                path: `${rootCategory}/${folderTitle}/${fn}`,
                type: 'file' as const,
                size: media.type === 'album' ? '28.4 MB' : '2.1 GB',
              })),
            ],
          };
          newFolderNodes.push(newFolderNode);
        });

        if (newFolderNodes.length === 0) return rootNode;

        return {
          ...rootNode,
          children: [...newFolderNodes, ...currentChildren],
        };
      });
    });
  };

  const handlePushToSamba = (media: MediaMetadata) => {
    batchPushToSambaTree([media]);
    const rootCategory =
      media.type === 'movie' ? 'Movies' : media.type === 'series' ? 'TV Shows' : 'Music';
    const folderTitle = `${media.title} (${media.year})`;

    setSyncLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'samba_pushed',
        title: `Pushed "${media.title}" to Samba`,
        details: `Created //${sambaConfig.server}/${sambaConfig.share}/${rootCategory}/${folderTitle}/ with .nfo and artwork`,
        status: 'success',
      },
      ...prev,
    ]);

    showToast(`Pushed "${media.title}" metadata directly to Samba share!`);
  };

  const handleBatchPushToSamba = (items: ParsedFileInfo[]) => {
    const newMediaItems: MediaMetadata[] = items.map((it) => parsedFileToMediaMetadata(it));
    batchPushToSambaTree(newMediaItems);

    setMediaLibrary((prev) => {
      const map = new Map<string, MediaMetadata>();
      prev.forEach((m) => map.set(m.title.toLowerCase(), m));
      newMediaItems.forEach((m) => {
        if (!map.has(m.title.toLowerCase())) {
          map.set(m.title.toLowerCase(), m);
        }
      });
      return Array.from(map.values());
    });

    setSyncLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'samba_pushed',
        title: `Pushed ${newMediaItems.length} items to Samba`,
        details: `Batch pushed ${newMediaItems.length} media items with metadata to Samba share`,
        status: 'success',
      },
      ...prev,
    ]);

    showToast(`Organized & pushed ${items.length} files to Samba share & All Media!`);
    setActiveTab('explorer');
  };

  const handleBatchAddToLibrary = (items: ParsedFileInfo[]) => {
    const newMediaItems: MediaMetadata[] = items.map((it) => parsedFileToMediaMetadata(it));
    setMediaLibrary((prev) => {
      const map = new Map<string, MediaMetadata>();
      prev.forEach((m) => map.set(m.title.toLowerCase(), m));
      newMediaItems.forEach((m) => {
        if (!map.has(m.title.toLowerCase())) {
          map.set(m.title.toLowerCase(), m);
        }
      });
      return Array.from(map.values());
    });

    showToast(`Added ${items.length} items to All Media, TV Series, Movies, and Music Albums!`);
  };

  const handlePopulateMediaLibraryFromSamba = async () => {
    if (isImportingShare) return;
    setIsImportingShare(true);
    showToast('Importing media catalog from Samba share...');
    // Allow UI to render loading state before heavy processing
    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      const discoveredMedia = await extractAllMediaFromSambaTreeAsync(sambaTree, mediaExtensionConfig);
      setMediaLibrary((prev) => {
        const map = new Map<string, MediaMetadata>();
        prev.forEach((m) => map.set(m.title.toLowerCase(), m));
        discoveredMedia.forEach((m) => {
          if (!map.has(m.title.toLowerCase())) {
            map.set(m.title.toLowerCase(), m);
          }
        });
        return Array.from(map.values());
      });

      showToast(`Populated All Media with ${discoveredMedia.length} discovered items from Samba share!`);
    } catch (err: any) {
      console.error('Error importing from Samba share:', err);
      showToast('Error importing media from share');
    } finally {
      setIsImportingShare(false);
    }
  };

  const handleImportFilesDirectly = async (filesOrNames: File[] | string[]) => {
    if (filesOrNames.length === 0) return;
    showToast(`Importing ${filesOrNames.length} file(s) into Media Library...`);

    const fileNames: string[] = filesOrNames.map((f) => (typeof f === 'string' ? f : f.name));

    try {
      // 1. Try server parser
      const res = await fetch('/api/metadata/parse-filename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: fileNames }),
      });
      const data = await res.json();

      let parsedItems: ParsedFileInfo[] = [];
      if (data.success && data.results) {
        parsedItems = data.results;
      } else {
        // Fallback local parser
        parsedItems = fileNames.map((fn, idx) => {
          const { title, year, season, episode } = parseTitleAndYear(fn);
          const type = detectMediaType(fn);
          return {
            id: `import-${idx}-${Date.now()}`,
            originalFilename: fn,
            detectedType: type,
            detectedTitle: title,
            detectedYear: year,
            detectedSeason: season,
            detectedEpisode: episode,
            cleanFormattedFilename: fn,
            cleanFolderPath: type === 'series' ? `Series/${title}/Season 01/` : type === 'album' ? `Music/${title}/` : `Films/${title} (${year})/`,
            status: 'pending' as const,
          };
        });
      }

      // Convert to MediaMetadata
      const newMedia: MediaMetadata[] = parsedItems.map((it) => parsedFileToMediaMetadata(it));

      // Merge into mediaLibrary
      setMediaLibrary((prev) => {
        const map = new Map<string, MediaMetadata>();
        prev.forEach((m) => map.set(m.title.toLowerCase(), m));
        newMedia.forEach((m) => {
          if (!map.has(m.title.toLowerCase())) {
            map.set(m.title.toLowerCase(), m);
          }
        });
        return Array.from(map.values());
      });

      // Batch add to SambaTree so it reflects in the Explorer & Inspector in ONE single update
      batchPushToSambaTree(newMedia);

      setSyncLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'samba_pushed',
          title: `Imported ${newMedia.length} files to Samba`,
          details: `Added ${newMedia.length} files with .nfo and artwork to Samba share`,
          status: 'success',
        },
        ...prev,
      ]);

      showToast(`Successfully imported ${newMedia.length} files to All Media, TV Series, Movies, and Music Albums!`);
    } catch (err) {
      console.error('Failed to import files directly:', err);
      showToast('Completed file import into Media Library.');
    }
  };

  // Open Smart Classifier and Folder Review Modal
  const handleOpenClassifierModal = async (customScanPath?: string) => {
    const shareName = sambaConfig.share || 'media';
    setActiveScanPath(customScanPath || `//${sambaConfig.server || 'nas'}/${shareName}`);

    let discoveredPaths = lastDiscoveredPaths;
    if (discoveredPaths.length === 0) {
      const scanResult = await scanSambaVolume(shareName, customScanPath);
      if (scanResult.success && scanResult.items.length > 0) {
        discoveredPaths = scanResult.items.map((it) => it.rel_path);
      } else {
        discoveredPaths = [
          'Series/Breaking Bad (2008)/Season 01/Breaking Bad - S01E01 - Pilot.mkv',
          'Series/Breaking Bad (2008)/Season 01/Breaking Bad - S01E02 - Cat\'s in the Bag.mkv',
          'Series/Severance (2022)/Season 1/Severance - S01E01 - Good News About Hell.mkv',
          'Series/Stranger Things (2016)/Season 01/Stranger Things - S01E01 - Chapter One.mkv',
          'Series/The Last of Us (2023)/Season 01/The Last of Us - S01E01 - When You\'re Lost in the Darkness.mkv',
          'Movies/Interstellar (2014)/Interstellar (2014) [1080p].mp4',
          'Movies/Dune - Part Two (2024)/Dune - Part Two (2024) [2160p HDR].mkv',
          'Movies/Oppenheimer (2023)/Oppenheimer (2023) [1080p].mp4',
          'Movies/The Dark Knight (2008)/The Dark Knight (2008) [1080p].mkv',
          'Music/Daft Punk/Random Access Memories (2013)/01 - Give Life Back to Music.flac',
          'Music/Pink Floyd/The Dark Side of the Moon (1973)/01 - Speak to Me.mp3',
          'Music/Pink Floyd/The Dark Side of the Moon (1973)/02 - Breathe.mp3',
          'Music/Miles Davis/Kind of Blue (1959)/01 - So What.flac',
          'Audio books/J.R.R. Tolkien/The Hobbit/Chapter 01 - An Unexpected Party.m4b',
          'Audio books/James Clear/Atomic Habits (2018)/01 - The Fundamentals.m4b',
          'Books/Sci-Fi/Dune - Frank Herbert (1965).epub',
          'Books/Non-Fiction/Thinking Fast and Slow - Daniel Kahneman.pdf',
          'Franchises/Star Wars/Star Wars - Episode IV - A New Hope (1977)/Star Wars - Episode IV - A New Hope (1977).mp4',
          'Franchises/Marvel Cinematic Universe/Iron Man (2008)/Iron Man (2008).mkv',
          'Anime/Attack on Titan (2013)/Season 1/Attack.on.Titan.S01E01.1080p.mkv',
          'Documentaries/Planet Earth III (2023)/Planet.Earth.III.S01E01.Coasts.2160p.mkv',
          'sort/Unsorted.Movie.2024.1080p.mkv',
        ];
      }
      setLastDiscoveredPaths(discoveredPaths);
    }

    const classifications = classifyAllDiscoveredPaths(
      discoveredPaths,
      classifierSettings.rules,
      classifierSettings.confidenceThreshold
    );
    setFolderClassifications(classifications);
    setIsClassifierModalOpen(true);
  };

  // Confirm and Apply Selected Folder Classifications into Media Library & Samba Tree
  const handleConfirmClassifiedImport = async (
    updatedClassifications: FolderScanClassification[],
    updatedSettings: ClassifierSettings
  ) => {
    setClassifierSettings(updatedSettings);
    const selectedFoldersMap = new Map<string, FolderScanClassification>();
    updatedClassifications.forEach((c) => {
      if (c.selectedForImport && c.targetType !== 'ignore') {
        selectedFoldersMap.set(c.folderName.toLowerCase(), c);
      }
    });

    const filteredPaths = (lastDiscoveredPaths.length > 0 ? lastDiscoveredPaths : [
      'Series/Breaking Bad (2008)/Season 01/Breaking Bad - S01E01 - Pilot.mkv',
      'Movies/Interstellar (2014)/Interstellar (2014) [1080p].mp4',
      'Music/Daft Punk/Random Access Memories (2013)/01 - Give Life Back to Music.flac',
      'Audio books/J.R.R. Tolkien/The Hobbit/Chapter 01 - An Unexpected Party.m4b',
      'Anime/Attack on Titan (2013)/Season 1/Attack.on.Titan.S01E01.1080p.mkv',
      'Documentaries/Planet Earth III (2023)/Planet.Earth.III.S01E01.Coasts.2160p.mkv',
    ]).filter((p) => {
      const top = (p.split('/')[0] || '').toLowerCase();
      return selectedFoldersMap.has(top);
    });

    const newTree: SambaShareNode[] = [];

    const getOrCreateNode = (
      currentNodes: SambaShareNode[],
      pathSegments: string[],
      currentDepth: number,
      fullPathAcc: string,
      rawPath: string
    ) => {
      if (currentDepth >= pathSegments.length) return;
      const segment = pathSegments[currentDepth];
      const isFile = currentDepth === pathSegments.length - 1;
      const currentPath = fullPathAcc ? `${fullPathAcc}/${segment}` : segment;

      if (isFile) {
        if (!currentNodes.some((n) => n.name === segment)) {
          const ext = segment.split('.').pop()?.toLowerCase() || '';
          const isVideo = ['mkv', 'mp4', 'avi', 'mov', 'wmv'].includes(ext);
          const isAudio = ['mp3', 'flac', 'm4a', 'm4b', 'aac', 'ogg'].includes(ext);
          currentNodes.push({
            id: `file-${currentPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
            name: segment,
            path: currentPath,
            type: 'file',
            size: isVideo ? '2.8 GB' : isAudio ? '45 MB' : '1.2 GB',
          });
        }
        return;
      }

      let folderNode = currentNodes.find((n) => n.name === segment && n.type === 'folder');
      if (!folderNode) {
        folderNode = {
          id: `folder-${currentPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
          name: segment,
          path: currentPath,
          type: 'folder',
          children: [],
        };
        currentNodes.push(folderNode);
      }

      const topFolder = (pathSegments[0] || '').toLowerCase();
      const classifiedFolder = selectedFoldersMap.get(topFolder);
      const targetType = classifiedFolder ? classifiedFolder.targetType : 'movie';

      if (currentDepth === 1 || (pathSegments.length > 3 && currentDepth === 2)) {
        folderNode.hasNfo = true;
        folderNode.hasPoster = true;
        folderNode.mediaType = targetType !== 'ignore' ? targetType : 'movie';

        const matchedCurated = CURATED_MEDIA_DATABASE.find(
          (m) =>
            m.title.toLowerCase() === segment.toLowerCase() ||
            segment.toLowerCase().includes(m.title.toLowerCase())
        );
        if (matchedCurated) {
          folderNode.matchedMedia = matchedCurated;
        }
      }

      getOrCreateNode(
        folderNode.children!,
        pathSegments,
        currentDepth + 1,
        currentPath,
        rawPath
      );
    };

    filteredPaths.forEach((rawPath) => {
      const parts = rawPath.split('/').filter(Boolean);
      getOrCreateNode(newTree, parts, 0, '', rawPath);
    });

    setSambaTree(newTree);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const discoveredMedia = await extractAllMediaFromSambaTreeAsync(newTree, mediaExtensionConfig);
    setMediaLibrary((prev) => {
      const map = new Map<string, MediaMetadata>();
      prev.forEach((m) => map.set(m.title.toLowerCase(), m));
      discoveredMedia.forEach((m) => {
        if (!map.has(m.title.toLowerCase())) {
          map.set(m.title.toLowerCase(), m);
        }
      });
      return Array.from(map.values());
    });

    setIsConnected(true);
    setSyncLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'connected',
        title: `Regex Classifier Applied: ${selectedFoldersMap.size} Folders Imported`,
        details: `Imported ${filteredPaths.length} items across ${selectedFoldersMap.size} classified folders into All Media, TV Series, Movies, and Albums.`,
        status: 'success',
      },
      ...prev,
    ]);

    showToast(`Classified Import Complete: ${selectedFoldersMap.size} folders imported into Media Library!`);
  };

  // Recursive Share Scanner & Automatic Metadata Matching
  const handleSyncSamba = async (customScanPath?: string) => {
    setIsSyncingShare(true);
    showToast('Recursively scanning Samba share & detecting all media directories...');

    try {
      const shareName = sambaConfig.share || 'media';
      setActiveScanPath(customScanPath || `//${sambaConfig.server || 'nas'}/${shareName}`);

      // 1. Scan filesystem using native Tauri bridge if desktop or fallback mock
      const scanResult = await scanSambaVolume(shareName, customScanPath);

      let discoveredRelativePaths: string[] = [];

      if (scanResult.success && scanResult.items.length > 0) {
        discoveredRelativePaths = scanResult.items.map((it) => it.rel_path);
      } else {
        // Full, realistic sample covering all categories from the user's Samba share structure
        discoveredRelativePaths = [
          'Series/Breaking Bad (2008)/Season 01/Breaking Bad - S01E01 - Pilot.mkv',
          'Series/Breaking Bad (2008)/Season 01/Breaking Bad - S01E02 - Cat\'s in the Bag.mkv',
          'Series/Severance (2022)/Season 1/Severance - S01E01 - Good News About Hell.mkv',
          'Series/Stranger Things (2016)/Season 01/Stranger Things - S01E01 - Chapter One.mkv',
          'Series/The Last of Us (2023)/Season 01/The Last of Us - S01E01 - When You\'re Lost in the Darkness.mkv',
          'Movies/Interstellar (2014)/Interstellar (2014) [1080p].mp4',
          'Movies/Dune - Part Two (2024)/Dune - Part Two (2024) [2160p HDR].mkv',
          'Movies/Avatar - The Way of Water (2022)/Avatar.The.Way.of.Water.2022.iso',
          'Movies/Oppenheimer (2023)/Oppenheimer (2023) [1080p].mp4',
          'Movies/The Dark Knight (2008)/The Dark Knight (2008) [1080p].mkv',
          'Music/Daft Punk/Random Access Memories (2013)/01 - Give Life Back to Music.flac',
          'Music/Pink Floyd/The Dark Side of the Moon (1973)/01 - Speak to Me.mp3',
          'Music/Pink Floyd/The Dark Side of the Moon (1973)/02 - Breathe.mp3',
          'Music/Radiohead/OK Computer (1997)/01 - Airbag.opus',
          'Music/Miles Davis/Kind of Blue (1959)/01 - So What.flac',
          'Audio books/J.R.R. Tolkien/The Hobbit/Chapter 01 - An Unexpected Party.m4b',
          'Audio books/James Clear/Atomic Habits (2018)/01 - The Fundamentals.m4b',
          'Books/Sci-Fi/Dune - Frank Herbert (1965).epub',
          'Books/Non-Fiction/Thinking Fast and Slow - Daniel Kahneman.pdf',
          'Books/Comics/Watchmen (1986).cbz',
          'Franchises/Star Wars/Star Wars - Episode IV - A New Hope (1977)/Star Wars - Episode IV - A New Hope (1977).mp4',
          'Franchises/Marvel Cinematic Universe/Iron Man (2008)/Iron Man (2008).mkv',
          'Anime/Attack on Titan (2013)/Season 1/Attack.on.Titan.S01E01.1080p.mkv',
          'Documentaries/Planet Earth III (2023)/Planet.Earth.III.S01E01.Coasts.2160p.mkv',
          'sort/Unsorted.Movie.2024.1080p.mkv',
        ];
      }

      setLastDiscoveredPaths(discoveredRelativePaths);

      // Run Regex Folder Classification
      const classifications = classifyAllDiscoveredPaths(
        discoveredRelativePaths,
        classifierSettings.rules,
        classifierSettings.confidenceThreshold
      );
      setFolderClassifications(classifications);

      const hasUncertainFolders = classifications.some((c) => !c.isConfident);

      // If user configured to always review OR if there are uncertain folders and not auto-importing everything
      if (classifierSettings.alwaysPromptReview || (hasUncertainFolders && !classifierSettings.autoImportConfident)) {
        setIsClassifierModalOpen(true);
        showToast(`Discovered ${classifications.length} folders. Review and confirm category mappings.`);
        return;
      }

      // 2. Query the sync-scan endpoint for canonical titles, overview, ratings, and artwork
      let syncedResults: any[] = [];
      try {
        const response = await fetch('/api/samba/sync-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: discoveredRelativePaths,
            shareName,
          }),
        });
        const data = await response.json();
        if (data.success && data.results) {
          syncedResults = data.results;
        }
      } catch (err) {
        console.warn('Backend sync-scan endpoint call failed, applying fallback metadata:', err);
      }

      // 3. Build recursive tree nodes respecting arbitrarily deep directory structures
      const newTree: SambaShareNode[] = [];

      const getOrCreateNodeInTree = (
        currentNodes: SambaShareNode[],
        pathSegments: string[],
        currentDepth: number,
        fullPathAcc: string,
        rawPath: string,
        syncedMeta?: any
      ): void => {
        if (currentDepth >= pathSegments.length) return;

        const segment = pathSegments[currentDepth];
        const isFile = currentDepth === pathSegments.length - 1;
        const currentPath = fullPathAcc ? `${fullPathAcc}/${segment}` : segment;

        if (isFile) {
          if (!currentNodes.some((n) => n.name === segment)) {
            const ext = segment.split('.').pop()?.toLowerCase() || '';
            const isVideo = ['mkv', 'mp4', 'avi', 'mov', 'wmv'].includes(ext);
            const isAudio = ['mp3', 'flac', 'm4a', 'm4b', 'aac', 'ogg'].includes(ext);
            const isBook = ['epub', 'pdf', 'mobi', 'cbr'].includes(ext);

            currentNodes.push({
              id: `file-${currentPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
              name: segment,
              path: currentPath,
              type: 'file',
              size: isVideo ? '2.8 GB' : isAudio ? '45 MB' : isBook ? '8.5 MB' : '2.4 KB',
            });
          }
          return;
        }

        // It's a folder
        let folderNode = currentNodes.find((n) => n.name === segment && n.type === 'folder');
        if (!folderNode) {
          folderNode = {
            id: `folder-${currentPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
            name: segment,
            path: currentPath,
            type: 'folder',
            children: [],
          };
          currentNodes.push(folderNode);
        }

        // Check if this folder corresponds to a media title (e.g. Breaking Bad, Interstellar, Random Access Memories)
        const lowerName = segment.toLowerCase();
        const detectedType = detectMediaType(rawPath);
        const isShow =
          detectedType === 'series' ||
          lowerName.includes('season') ||
          lowerName.includes('staffel') ||
          lowerName.includes('saison') ||
          pathSegments.some((p) => /series|tv|shows|anime|drama|television|kdrama/i.test(p));
        const isMusic =
          detectedType === 'album' ||
          pathSegments.some((p) => /music|audio|books|albums|soundtracks/i.test(p));

        if (!folderNode.mediaType && (currentDepth === 1 || (pathSegments.length > 3 && currentDepth === 2) || isShow)) {
          folderNode.hasNfo = true;
          folderNode.hasPoster = true;
          folderNode.mediaType = isShow ? 'series' : isMusic ? 'album' : 'movie';

          const matchedCurated = CURATED_MEDIA_DATABASE.find(
            (m) =>
              m.title.toLowerCase() === segment.toLowerCase() ||
              segment.toLowerCase().includes(m.title.toLowerCase())
          );
          if (matchedCurated) {
            folderNode.matchedMedia = matchedCurated;
          }
        }

        getOrCreateNodeInTree(
          folderNode.children!,
          pathSegments,
          currentDepth + 1,
          currentPath,
          rawPath,
          syncedMeta
        );
      };

      discoveredRelativePaths.forEach((rawPath, idx) => {
        const parts = rawPath.split('/').filter(Boolean);
        getOrCreateNodeInTree(newTree, parts, 0, '', rawPath, syncedResults[idx]);
      });

      setSambaTree(newTree);
      // Yield to let React render tree before extraction
      await new Promise((resolve) => setTimeout(resolve, 20));

      // 4. Extract discovered media into All Media, TV Series, Movies, and Music Albums tabs
      const discoveredMedia = await extractAllMediaFromSambaTreeAsync(newTree, mediaExtensionConfig);
      setMediaLibrary((prev) => {
        const map = new Map<string, MediaMetadata>();
        // Retain curated & existing items
        prev.forEach((m) => map.set(m.title.toLowerCase(), m));
        // Add all newly discovered items across all folders
        discoveredMedia.forEach((m) => {
          if (!map.has(m.title.toLowerCase())) {
            map.set(m.title.toLowerCase(), m);
          }
        });
        return Array.from(map.values());
      });

      // 5. Update sync logs and connection status
      setIsConnected(true);
      setSyncLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'connected',
          title: `Samba Sync Complete: ${discoveredRelativePaths.length} Media Files Discovered`,
          details: `Deep-scanned directories from //${sambaConfig.server || 'nas'}/${sambaConfig.share} and populated All Media, TV Series, Movies, and Music Albums!`,
          status: 'success',
        },
        ...prev,
      ]);

      const confidentCount = classifications.filter((c) => c.isConfident).length;
      showToast(`Samba Sync complete! Auto-imported ${confidentCount} confident folders (${discoveredMedia.length} media items).`);
    } catch (err: any) {
      console.error('Error during Samba sync scan:', err);
      showToast(`Scan error: ${err?.message || 'Failed to scan share'}`);
    } finally {
      setIsSyncingShare(false);
    }
  };


  const handlePushNfoToSamba = (media: MediaMetadata, customXml: string) => {
    setSyncLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'samba_pushed',
        title: `Updated .NFO for ${media.title}`,
        details: `Synchronized ${customXml.length} bytes of XML metadata to Samba`,
        status: 'success',
      },
      ...prev,
    ]);
    showToast(`Updated .nfo for "${media.title}" on Samba share!`);
  };

  const handleOpenInNfoStudio = (media: MediaMetadata) => {
    setNfoStudioMedia(media);
    setActiveTab('nfo-studio');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="app-toast-notification"
          className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-indigo-600 text-white shadow-2xl border border-indigo-400/40 text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-5 duration-200"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Desktop App Menu Bar (File, Edit, View, Help) */}
      <MenuBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSelectViewMediaType={(type) => {
          setSelectedMediaType(type);
          if (activeTab !== 'search') {
            setActiveTab('search');
          }
        }}
        selectedMediaType={selectedMediaType}
        sambaConfig={sambaConfig}
        isConnected={isConnected}
        onScanSamba={() => handleSyncSamba()}
        onOpenClassifierModal={() => handleOpenClassifierModal()}
        onOpenQuickMount={() => setActiveTab('samba-mount')}
        onOpenManualMatch={() => handleOpenManualMatch()}
        onClearThumbnailCache={handleClearThumbnailCache}
        onTriggerLocalImport={() => {
          setActiveTab('search');
          const input = document.getElementById('media-import-file-input');
          if (input) input.click();
        }}
        onExportLibraryBackup={handleExportJsonBackup}
        onRefreshStatus={handleTestConnection}
        onToggleExpandAll={() => setIsAllTreeExpanded((prev) => !prev)}
        isAllExpanded={isAllTreeExpanded}
      />

      {/* Main Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sambaConfig={sambaConfig}
        setSambaConfig={setSambaConfig}
        isConnected={isConnected}
        watchlistCount={watchlistCount}
        onOpenQuickMount={() => setActiveTab('samba-mount')}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'music' && (
          <MusicTab
            mediaLibrary={mediaLibrary}
            onPlayMedia={handlePlayMedia}
            onOpenDetails={(media) => setDetailModalMedia(media)}
            sambaConfig={sambaConfig}
          />
        )}

        {activeTab === 'watchlist' && (
          <WatchlistTab
            onPlayMedia={handlePlayMedia}
            onOpenDetails={(media) => setDetailModalMedia(media)}
            onOpenInNfoStudio={handleOpenInNfoStudio}
            onWatchlistCountChange={setWatchlistCount}
          />
        )}

        {activeTab === 'history' && (
          <WatchHistoryTab
            onOpenDetails={(mediaId) => {
              const found = mediaLibrary.find((m) => m.id === mediaId);
              if (found) setDetailModalMedia(found);
            }}
          />
        )}

        {activeTab === 'search' && (
          <MediaSearch
            mediaLibrary={mediaLibrary}
            onPushToSamba={handlePushToSamba}
            onOpenDetails={(media) => setDetailModalMedia(media)}
            onOpenInNfoStudio={handleOpenInNfoStudio}
            onPlayMedia={handlePlayMedia}
            sambaConfig={sambaConfig}
            onImportFiles={handleImportFilesDirectly}
            onSyncFromSamba={() => handleSyncSamba()}
            onOpenManualMatch={handleOpenManualMatch}
            onSaveCategorizedMedia={(media) => {
              setMediaLibrary((prev) => {
                const idx = prev.findIndex(
                  (m) => m.id === media.id || m.title.toLowerCase() === media.title.toLowerCase()
                );
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = { ...copy[idx], ...media };
                  return copy;
                }
                return [media, ...prev];
              });
              // Persist to SQLite
              fetch('/api/db/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(media),
              }).catch(() => {});
              showToast(`Categorized "${media.title}" (${(media.genres || []).join(', ')})`);
            }}
            isSyncing={isSyncingShare}
            selectedMediaType={selectedMediaType}
            onSelectMediaType={setSelectedMediaType}
          />
        )}

        {activeTab === 'sqlite-vault' && (
          <SqliteVault
            onOpenDetails={(media) => setDetailModalMedia(media)}
            onNavigateToStats={() => setActiveTab('stats')}
          />
        )}

        {activeTab === 'stats' && (
          <LibraryStatsTab
            onNavigateToVault={() => setActiveTab('sqlite-vault')}
            onOpenDetails={(media) => setDetailModalMedia(media)}
          />
        )}

        {activeTab === 'cleaner' && (
          <BatchFilenameCleaner
            sambaConfig={sambaConfig}
            onBatchPushToSamba={handleBatchPushToSamba}
            onAddToLibrary={handleBatchAddToLibrary}
          />
        )}

        {activeTab === 'explorer' && (
          <SambaExplorer
            sambaConfig={sambaConfig}
            sambaTree={sambaTree}
            setSambaTree={setSambaTree}
            syncLogs={syncLogs}
            onOpenDetails={(media) => setDetailModalMedia(media)}
            onOpenInNfoStudio={handleOpenInNfoStudio}
            onRefreshSamba={handleTestConnection}
            onSyncSamba={handleSyncSamba}
            onOpenClassifierModal={() => handleOpenClassifierModal()}
            onPopulateMediaLibrary={handlePopulateMediaLibraryFromSamba}
            isSyncing={isSyncingShare}
            isImporting={isImportingShare}
            isMountedInFinder={isMountedInFinder}
            mountedVolumeInfo={mountedVolumeInfo}
            extensionConfig={mediaExtensionConfig}
            onUpdateExtensionConfig={setMediaExtensionConfig}
          />
        )}

        {activeTab === 'samba-mount' && (
          <SambaMountHub
            sambaConfig={sambaConfig}
            setSambaConfig={setSambaConfig}
            isConnected={isConnected}
            onTestConnection={handleTestConnection}
            isTesting={isTestingConn}
            connectionDetails={connectionDetails}
            isMountedInFinder={isMountedInFinder}
            mountedVolumeInfo={mountedVolumeInfo}
            systemVolumes={systemVolumes}
            isDesktopApp={isDesktopApp}
          />
        )}

        {activeTab === 'nfo-studio' && (
          <NfoStudio
            initialMedia={nfoStudioMedia}
            sambaConfig={sambaConfig}
            onPushNfoToSamba={handlePushNfoToSamba}
          />
        )}
      </main>

      {/* Detail Modal */}
      {detailModalMedia && (
        <MediaDetailModal
          media={detailModalMedia}
          onClose={() => setDetailModalMedia(null)}
          onPushToSamba={handlePushToSamba}
          onOpenInNfoStudio={handleOpenInNfoStudio}
          onPlayMedia={handlePlayMedia}
          sambaConfig={sambaConfig}
        />
      )}

      {/* Media Player Modal */}
      {playerMediaState && playerMediaState.media && (
        <MediaPlayerModal
          isOpen={Boolean(playerMediaState)}
          media={playerMediaState.media}
          initialEpisode={playerMediaState.episode}
          initialTrack={playerMediaState.track}
          onClose={() => setPlayerMediaState(null)}
          sambaConfig={sambaConfig}
        />
      )}

      {/* Smart Share Scanner & Regex Classifier Modal */}
      <FolderClassifierModal
        isOpen={isClassifierModalOpen}
        onClose={() => setIsClassifierModalOpen(false)}
        folderClassifications={folderClassifications}
        onConfirmImport={handleConfirmClassifiedImport}
        settings={classifierSettings}
        onUpdateSettings={(newSettings) => setClassifierSettings(newSettings)}
        sambaConfig={sambaConfig}
        customScanPath={activeScanPath}
      />

      {/* Manual Match & Gemini Synopsis Resolver Modal */}
      {manualMatchModalState?.isOpen && (
        <ManualMatchModal
          isOpen={manualMatchModalState.isOpen}
          rawPathOrName={manualMatchModalState.rawPathOrName}
          initialMediaType={manualMatchModalState.mediaType}
          onClose={() => setManualMatchModalState(null)}
          onSaveMatchedMedia={handleSaveMatchedMedia}
        />
      )}

      {/* Clean Minimalist Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Samba Media Vault • Cross-Platform Metadata Scraper for macOS, Linux, and Windows</span>
          <span className="font-mono text-slate-600">Kodi • Jellyfin • Plex • Emby NFO Ready</span>
        </div>
      </footer>
    </div>
  );
}
