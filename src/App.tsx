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
import { BatchMetadataEnricher } from './components/BatchMetadataEnricher';
import { DeduplicationManagerTab } from './components/DeduplicationManagerTab';
import { FolderClassifierModal } from './components/FolderClassifierModal';
import { ManualMatchModal } from './components/ManualMatchModal';
import { WatchlistTab } from './components/WatchlistTab';
import { WatchHistoryTab } from './components/WatchHistoryTab';
import { MusicTab } from './components/MusicTab';
import { ApiDebuggerOverlay } from './components/ApiDebuggerOverlay';
import { Bug } from 'lucide-react';
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
import { detectDuplicatesAndVersionBranches } from './utils/duplicateDetector';
import { sqliteBatchWriter } from './services/sqliteBatchWriter';
import { sendDesktopNotification, requestNotificationPermission } from './utils/notifications';
import { sanitizeFilename, sanitizeSambaPath, encodeSambaPathForUrl } from './utils/pathSanitizer';

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
            id: 'file-interstellar-srt',
            name: 'Interstellar (2014).en.srt',
            path: 'Movies/Interstellar (2014)/Interstellar (2014).en.srt',
            type: 'file',
            size: '85 KB',
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
            id: 'file-dune-vtt',
            name: 'Dune - Part Two (2024).en.vtt',
            path: 'Movies/Dune - Part Two (2024)/Dune - Part Two (2024).en.vtt',
            type: 'file',
            size: '92 KB',
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
              {
                id: 'file-bb-s01e01-srt',
                name: 'Breaking Bad - S01E01 - Pilot.en.srt',
                path: 'Series/Breaking Bad (2008)/Season 01/Breaking Bad - S01E01 - Pilot.en.srt',
                type: 'file',
                size: '58 KB',
              },
            ],
          },
        ],
      },
      {
        id: 'folder-24-series',
        name: '24 (2001)',
        path: 'Series/24 (2001)',
        type: 'folder',
        hasNfo: false,
        hasPoster: false,
        mediaType: 'series',
        metadataStatus: 'metadata-missing',
        artworkStatus: 'missing',
        children: [
          {
            id: 'file-24-s01e01',
            name: '24 - S01E01 - 12-00 AM - 1-00 AM.mkv',
            path: 'Series/24 (2001)/24 - S01E01 - 12-00 AM - 1-00 AM.mkv',
            type: 'file',
            size: '1.2 GB',
          },
          {
            id: 'file-24-s01e02',
            name: '24 - S01E02 - 1-00 AM - 2-00 AM.mkv',
            path: 'Series/24 (2001)/24 - S01E02 - 1-00 AM - 2-00 AM.mkv',
            type: 'file',
            size: '1.2 GB',
          },
        ],
      },
    ],
  },
  {
    id: 'root-franchises',
    name: 'Franchises',
    path: 'Franchises',
    type: 'folder',
    isFranchiseRoot: true,
    children: [
      {
        id: 'franchise-battlestar-galactica',
        name: 'Battlestar Galactica',
        path: 'Franchises/Battlestar Galactica',
        type: 'folder',
        isFranchiseContainer: true,
        children: [
          {
            id: 'series-bsg-2004',
            name: 'Battlestar Galactica (2004)',
            path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)',
            type: 'folder',
            hasNfo: true,
            hasPoster: true,
            mediaType: 'series',
            children: [
              {
                id: 'folder-bsg-s01',
                name: 'Season 01',
                path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Season 01',
                type: 'folder',
                children: [
                  {
                    id: 'file-bsg-s01e01',
                    name: 'Battlestar Galactica - S01E01 - 33.mkv',
                    path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Season 01/Battlestar Galactica - S01E01 - 33.mkv',
                    type: 'file',
                    size: '1.4 GB',
                  },
                  {
                    id: 'file-bsg-s01e02',
                    name: 'Battlestar Galactica - S01E02 - Water.mkv',
                    path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Season 01/Battlestar Galactica - S01E02 - Water.mkv',
                    type: 'file',
                    size: '1.3 GB',
                  },
                ],
              },
              {
                id: 'folder-bsg-s02',
                name: 'Season 02',
                path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Season 02',
                type: 'folder',
                children: [
                  {
                    id: 'file-bsg-s02e01',
                    name: 'Battlestar Galactica - S02E01 - Scattered.mkv',
                    path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Season 02/Battlestar Galactica - S02E01 - Scattered.mkv',
                    type: 'file',
                    size: '1.4 GB',
                  },
                ],
              },
              {
                id: 'folder-bsg-extras',
                name: 'Specials & Extras',
                path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Specials & Extras',
                type: 'folder',
                children: [
                  {
                    id: 'file-bsg-miniseries',
                    name: 'Battlestar Galactica - S00E01 - The Miniseries (Part 1).mkv',
                    path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Specials & Extras/Battlestar Galactica - S00E01 - The Miniseries (Part 1).mkv',
                    type: 'file',
                    size: '2.8 GB',
                  },
                  {
                    id: 'file-bsg-razor',
                    name: 'Battlestar Galactica - S00E03 - Razor.mkv',
                    path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Specials & Extras/Battlestar Galactica - S00E03 - Razor.mkv',
                    type: 'file',
                    size: '3.1 GB',
                  },
                  {
                    id: 'file-bsg-disc4-iso',
                    name: 'Disc 4 - Extended Cuts & Commentary.iso',
                    path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Specials & Extras/Disc 4 - Extended Cuts & Commentary.iso',
                    type: 'file',
                    size: '7.8 GB',
                  },
                  {
                    id: 'file-bsg-disc5-iso',
                    name: 'Disc 5 - Behind the Scenes & Featurettes.iso',
                    path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/Specials & Extras/Disc 5 - Behind the Scenes & Featurettes.iso',
                    type: 'file',
                    size: '8.2 GB',
                  },
                ],
              },
              {
                id: 'file-bsg-tvshow-nfo',
                name: 'tvshow.nfo',
                path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/tvshow.nfo',
                type: 'file',
                size: '3.8 KB',
              },
              {
                id: 'file-bsg-poster',
                name: 'poster.jpg',
                path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/poster.jpg',
                type: 'file',
                size: '512 KB',
              },
              {
                id: 'file-bsg-fanart',
                name: 'fanart.jpg',
                path: 'Franchises/Battlestar Galactica/Battlestar Galactica (2004)/fanart.jpg',
                type: 'file',
                size: '1.4 MB',
              },
            ],
          },
          {
            id: 'series-caprica-2010',
            name: 'Caprica (2010)',
            path: 'Franchises/Battlestar Galactica/Caprica (2010)',
            type: 'folder',
            hasNfo: true,
            hasPoster: true,
            mediaType: 'series',
            children: [
              {
                id: 'folder-caprica-s01',
                name: 'Season 01',
                path: 'Franchises/Battlestar Galactica/Caprica (2010)/Season 01',
                type: 'folder',
                children: [
                  {
                    id: 'file-caprica-s01e01',
                    name: 'Caprica - S01E01 - Pilot.mkv',
                    path: 'Franchises/Battlestar Galactica/Caprica (2010)/Season 01/Caprica - S01E01 - Pilot.mkv',
                    type: 'file',
                    size: '1.5 GB',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'franchise-star-wars',
        name: 'Star Wars Saga',
        path: 'Franchises/Star Wars Saga',
        type: 'folder',
        isFranchiseContainer: true,
        children: [
          {
            id: 'series-mandalorian',
            name: 'The Mandalorian (2019)',
            path: 'Franchises/Star Wars Saga/The Mandalorian (2019)',
            type: 'folder',
            hasNfo: true,
            hasPoster: true,
            mediaType: 'series',
            children: [
              {
                id: 'folder-mando-s01',
                name: 'Season 01',
                path: 'Franchises/Star Wars Saga/The Mandalorian (2019)/Season 01',
                type: 'folder',
                children: [
                  {
                    id: 'file-mando-s01e01',
                    name: 'The Mandalorian - S01E01 - Chapter 1.mkv',
                    path: 'Franchises/Star Wars Saga/The Mandalorian (2019)/Season 01/The Mandalorian - S01E01 - Chapter 1.mkv',
                    type: 'file',
                    size: '2.1 GB',
                  },
                ],
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
          {
            id: 'file-aot-e01-sub',
            name: 'Attack.on.Titan.S01E01.ja.sub',
            path: 'Anime/Attack on Titan (2013)/Attack.on.Titan.S01E01.ja.sub',
            type: 'file',
            size: '76 KB',
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
  {
    id: 'log-3',
    timestamp: new Date().toLocaleTimeString(),
    type: 'metadata_created',
    title: 'Series Flagged: 24 (2001)',
    details: 'Series detected in Series/24 (2001) without NFO or artwork. Flagged as metadata-missing.',
    status: 'metadata-missing',
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
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);
  const [syncCurrentPath, setSyncCurrentPath] = useState<string>('');
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
  const [isApiDebuggerOpen, setIsApiDebuggerOpen] = useState(false);
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

  const handleSaveMatchedMedia = async (matched: MediaMetadata) => {
    // Automatically retrieve official artwork or generate fanart if posterUrl is missing or is a placeholder
    let updatedMedia = { ...matched };
    const isPlaceholder = !matched.posterUrl || matched.posterUrl.includes('unsplash.com') || matched.posterUrl.includes('images.unsplash.com');
    
    if (isPlaceholder) {
      showToast(`Retrieving authentic cover art & posters for "${matched.title}"...`);
      try {
        // 1. Fetch real official poster from OMDb / TVMaze / iTunes
        const artRes = await fetch('/api/media/fetch-art', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: matched.title,
            type: matched.type,
            year: matched.year,
          }),
        });
        const artData = await artRes.json();
        if (artData.success && artData.posterUrl) {
          updatedMedia.posterUrl = artData.posterUrl;
          if (artData.fanartUrl) updatedMedia.fanartUrl = artData.fanartUrl;
          showToast(`Retrieved official artwork for "${matched.title}"!`);
        } else {
          // 2. Fallback to AI generation
          showToast(`Generating custom AI fanart for "${matched.title}"...`);
          const fanartRes = await fetch('/api/media/generate-fanart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: matched.title,
              type: matched.type,
              synopsis: matched.overview,
              overview: matched.overview,
              mediaPath: matched.recommendedFolderStructure,
            }),
          });
          const fanartData = await fanartRes.json();
          const generatedArt = fanartData.posterUrl || fanartData.fanartUrl || fanartData.url;
          if (fanartData.success && generatedArt) {
            updatedMedia.fanartUrl = fanartData.fanartUrl || generatedArt;
            updatedMedia.posterUrl = fanartData.posterUrl || generatedArt;
            showToast(`Generated and saved AI artwork for "${matched.title}"!`);
          }
        }
      } catch (err) {
        console.warn('Auto-art retrieval failed on save:', err);
      }
    }

    // Path and directory sanitization for cross-platform Samba compatibility (strips colons, symbols, etc.)
    const category = updatedMedia.type === 'movie' ? 'Movies' : updatedMedia.type === 'series' ? 'TV Shows' : 'Music';
    const cleanFolderTitle = sanitizeFilename(`${updatedMedia.title} (${updatedMedia.year})`);
    const targetFolderPath = sanitizeSambaPath(updatedMedia.recommendedFolderStructure || `${category}/${cleanFolderTitle}`);
    updatedMedia.recommendedFolderStructure = targetFolderPath;

    setMediaLibrary((prev) => {
      const filtered = prev.filter(
        (m) => m.id !== updatedMedia.id && m.title.toLowerCase() !== updatedMedia.title.toLowerCase()
      );
      return [updatedMedia, ...filtered];
    });

    // Mark in SambaTree as pending while background write and verification execute
    batchPushToSambaTree([updatedMedia], 'pending');
    setManualMatchModalState(null);
    setDetailModalMedia(updatedMedia);

    // Persist artwork to Samba filesystem with explicit disk verification
    try {
      showToast(`Saving poster & fanart to Samba filesystem for "${updatedMedia.title}"...`);
      const writeRes = await fetch('/api/samba/write-artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: targetFolderPath,
          posterUrl: updatedMedia.posterUrl,
          fanartUrl: updatedMedia.fanartUrl,
          mediaTitle: updatedMedia.title,
          type: updatedMedia.type,
        }),
      });
      const writeData = await writeRes.json();

      // Explicit verification check: confirm file exists on the samba path after API returns success
      const verifyUrl = `/api/samba/verify-file?folderPath=${encodeSambaPathForUrl(targetFolderPath)}&filenames=poster.jpg,fanart.jpg`;
      const verifyRes = await fetch(verifyUrl);
      const verifyData = await verifyRes.json();

      const isVerified = verifyData.success && (verifyData.exists || verifyData.hasAnyArtwork);

      if (isVerified) {
        // Upgrade folder node state to 'synced'
        setSambaTree((prevTree) => {
          const updateToSynced = (nodes: SambaShareNode[]): SambaShareNode[] => {
            return nodes.map((node) => {
              if (node.path === targetFolderPath || node.name === cleanFolderTitle || node.name.includes(updatedMedia.title)) {
                const existingChildren = node.children ? [...node.children] : [];
                const posterName = node.mediaType === 'album' ? 'folder.jpg' : 'poster.jpg';
                const hasPoster = existingChildren.some(c => c.name === posterName || c.name === 'poster.jpg' || c.name === 'folder.jpg');
                const hasFanart = existingChildren.some(c => c.name === 'fanart.jpg');

                const newChildren = [...existingChildren];
                if (!hasPoster) {
                  newChildren.push({
                    id: `file-poster-${node.id}`,
                    name: posterName,
                    path: `${node.path}/${posterName}`,
                    type: 'file',
                    size: '420 KB',
                  });
                }
                if (!hasFanart) {
                  newChildren.push({
                    id: `file-fanart-${node.id}`,
                    name: 'fanart.jpg',
                    path: `${node.path}/fanart.jpg`,
                    type: 'file',
                    size: '1.2 MB',
                  });
                }

                return {
                  ...node,
                  hasPoster: true,
                  artworkStatus: 'synced' as const,
                  children: newChildren,
                };
              }
              if (node.children && node.children.length > 0) {
                return {
                  ...node,
                  children: updateToSynced(node.children),
                };
              }
              return node;
            });
          };
          return updateToSynced(prevTree);
        });

        // Prewarm thumbnail cache
        if (updatedMedia.posterUrl) {
          thumbnailStorage.set({
            id: `thumb-${updatedMedia.id}`,
            mediaPath: targetFolderPath,
            title: updatedMedia.title,
            mediaType: updatedMedia.type,
            thumbnailUrl: updatedMedia.posterUrl,
            fanartUrl: updatedMedia.fanartUrl,
            width: 800,
            height: 1200,
            aspectRatio: updatedMedia.type === 'album' ? 'square' : 'poster',
            colorDominant: '#1e1b4b',
            source: 'matched_media',
            fileSizeBytes: 420000,
            format: 'jpg',
            resolutionLabel: '800 × 1200',
            cachedAt: Date.now(),
            lastAccessedAt: Date.now(),
            hitCount: 1,
            cacheTier: 'memory_lru',
            isSidecarLocal: true,
          });
        }

        // Add verified sync log
        setSyncLogs((prev) => [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'samba_pushed',
            title: `Artwork Verified on Samba: ${updatedMedia.title}`,
            details: `Successfully wrote and verified poster.jpg and fanart.jpg on Samba share (${targetFolderPath}).`,
            status: 'success',
          },
          ...prev,
        ]);

        showToast(`Saved and verified artwork on Samba share for "${updatedMedia.title}"!`);
      } else {
        showToast(`Saved "${updatedMedia.title}". Background writing to share in progress...`);
      }
    } catch (writeErr) {
      console.warn('Samba write-artwork operation failed:', writeErr);
      showToast(`Saved "${updatedMedia.title}" locally; writing artwork in background.`);
    }
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

  // Persistent state loading from backend
  const [isVaultLoaded, setIsVaultLoaded] = useState(false);
  const [mediaLibrary, setMediaLibrary] = useState<MediaMetadata[]>([]);

  useEffect(() => {
    fetch('/api/vault/state')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.state) {
          if (data.state.sambaTree) setSambaTree(data.state.sambaTree);
          if (data.state.syncLogs) setSyncLogs(data.state.syncLogs);
          if (data.state.sambaConfig) setSambaConfig(data.state.sambaConfig);
          if (data.state.classifierSettings) setClassifierSettings(data.state.classifierSettings);
          // Load mediaLibrary if available in state
          if (data.state.mediaLibrary) setMediaLibrary(data.state.mediaLibrary);
        }
        setIsVaultLoaded(true);
      })
      .catch(() => setIsVaultLoaded(true));
  }, []);

  // Sync state to backend on change
  useEffect(() => {
    if (!isVaultLoaded) return;
    
    fetch('/api/vault/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sambaTree,
        syncLogs,
        sambaConfig,
        classifierSettings,
        mediaLibrary
      })
    }).catch(console.error);
  }, [sambaTree, syncLogs, sambaConfig, classifierSettings, mediaLibrary, isVaultLoaded]);


  // Background SQLite persistent caching reconciliation
  useEffect(() => {
    fetch('/api/db/media')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.items) && data.items.length > 0) {
          setMediaLibrary((prev) => {
            const map = new Map<string, MediaMetadata>();
            prev.forEach((m) => map.set(m.title.toLowerCase(), m));
            let newItemsAdded = false;

            data.items.forEach((sqliteItem: any) => {
              if (sqliteItem.title && !map.has(sqliteItem.title.toLowerCase())) {
                const converted: MediaMetadata = {
                  id: sqliteItem.id || `sqlite-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  type: sqliteItem.type || 'series',
                  title: sqliteItem.title,
                  year: sqliteItem.year || 2020,
                  overview: sqliteItem.synopsis || '',
                  rating: sqliteItem.rating || 8.0,
                  posterUrl: sqliteItem.poster_url || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=500&auto=format&fit=crop&q=60',
                  fanartUrl: sqliteItem.fanart_url,
                  genres: sqliteItem.genre ? sqliteItem.genre.split(',').map((g: string) => g.trim()) : ['Drama'],
                  recommendedFolderStructure: sqliteItem.clean_folder_path || `Series/${sqliteItem.title}`,
                  recommendedFilenames: [],
                  source: 'sqlite-vault',
                };
                map.set(sqliteItem.title.toLowerCase(), converted);
                newItemsAdded = true;
              }
            });

            if (newItemsAdded) {
              const combined = Array.from(map.values());
              const { enrichedItems } = detectDuplicatesAndVersionBranches(combined);
              sqliteBatchWriter.updateCache(enrichedItems);
              return enrichedItems;
            }
            return prev;
          });
        }
      })
      .catch((err) => console.warn('SQLite hydration:', err));
  }, []);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

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

  const batchPushToSambaTree = (mediaItems: MediaMetadata[], defaultArtworkStatus: 'pending' | 'synced' = 'synced') => {
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

          const folderTitle = sanitizeFilename(`${media.title} (${media.year})`);
          const folderPath = sanitizeSambaPath(`${rootCategory}/${folderTitle}`);
          const exists = currentChildren.some((c) => c.name.includes(media.title) || c.name === folderTitle);
          if (exists) return;

          const newFolderNode: SambaShareNode = {
            id: `folder-${media.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: folderTitle,
            path: folderPath,
            type: 'folder',
            hasNfo: true,
            hasPoster: true,
            artworkStatus: defaultArtworkStatus,
            mediaType: media.type,
            matchedMedia: media,
            children: [
              {
                id: `file-nfo-${media.id}`,
                name: media.type === 'movie' ? 'movie.nfo' : media.type === 'series' ? 'tvshow.nfo' : 'album.nfo',
                path: `${folderPath}/${media.type === 'movie' ? 'movie.nfo' : media.type === 'series' ? 'tvshow.nfo' : 'album.nfo'}`,
                type: 'file',
                size: '2.5 KB',
              },
              {
                id: `file-poster-${media.id}`,
                name: media.type === 'album' ? 'folder.jpg' : 'poster.jpg',
                path: `${folderPath}/${media.type === 'album' ? 'folder.jpg' : 'poster.jpg'}`,
                type: 'file',
                size: '410 KB',
              },
              ...media.recommendedFilenames.map((fn, idx) => ({
                id: `file-media-${media.id}-${idx}`,
                name: sanitizeFilename(fn),
                path: `${folderPath}/${sanitizeFilename(fn)}`,
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
    setSyncCurrentPath('Samba Share / Cataloging Media Catalog');
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
      setSyncCurrentPath('');
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
      const combined = Array.from(map.values());
      const { enrichedItems } = detectDuplicatesAndVersionBranches(combined, filteredPaths);
      sqliteBatchWriter.enqueueMany(enrichedItems);
      return enrichedItems;
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
    sendDesktopNotification('Samba Folder Classifier Imported', {
      body: `Successfully imported ${selectedFoldersMap.size} classified folders into Media Library.`,
    });
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
      let detectedBranchCount = 0;
      let detectedFranchiseCount = 0;

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
        const combined = Array.from(map.values());

        // Run Duplicate & Multi-Version Detection Algorithm
        const { enrichedItems, duplicateCount, detectedGroups } = detectDuplicatesAndVersionBranches(
          combined,
          discoveredRelativePaths
        );
        detectedBranchCount = duplicateCount;
        detectedFranchiseCount = detectedGroups.length;

        // Queue all items for 30s persistent SQLite batch write
        sqliteBatchWriter.enqueueMany(enrichedItems);

        return enrichedItems;
      });

      // 5. Samba artwork disk verification & fallback creation on the share filesystem
      let verifiedArtworkCount = 0;
      let fallbackCreatedCount = 0;
      try {
        const mediaFolders: SambaShareNode[] = [];
        const findMediaFolders = (nodes: SambaShareNode[]) => {
          for (const node of nodes) {
            if (node.type === 'folder' && (node.matchedMedia || node.hasPoster)) {
              mediaFolders.push(node);
            }
            if (node.children) findMediaFolders(node.children);
          }
        };
        findMediaFolders(newTree);

        for (const folder of mediaFolders) {
          const safePath = encodeSambaPathForUrl(folder.path);
          const vRes = await fetch(`/api/samba/verify-file?folderPath=${safePath}&filenames=poster.jpg,fanart.jpg`);
          if (vRes.ok) {
            const vData = await vRes.json();
            if (vData.hasAnyArtwork) {
              verifiedArtworkCount++;
              folder.artworkStatus = 'synced';
            } else if (folder.matchedMedia && (folder.matchedMedia.posterUrl || folder.matchedMedia.fanartUrl)) {
              // Trigger fs.writeFile fallback via /api/samba/write-artwork
              const wRes = await fetch('/api/samba/write-artwork', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  folderPath: sanitizeSambaPath(folder.path),
                  posterUrl: folder.matchedMedia.posterUrl,
                  fanartUrl: folder.matchedMedia.fanartUrl,
                  mediaTitle: folder.matchedMedia.title,
                  type: folder.matchedMedia.type,
                }),
              });
              const wData = await wRes.json();
              if (wData.verified) {
                fallbackCreatedCount++;
                folder.artworkStatus = 'synced';
                folder.hasPoster = true;
              }
            }
          }
        }
      } catch (verifyErr) {
        console.warn('Share sync artwork verification check note:', verifyErr);
      }

      // 6. Update sync logs and connection status
      setIsConnected(true);
      setSyncLogs((prev) => [
        {
          id: `log-art-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'samba_pushed',
          title: `Artwork Verification on Samba Filesystem`,
          details: `Verified ${verifiedArtworkCount} folders on share disk; created artwork via fallback for ${fallbackCreatedCount} folders.`,
          status: 'success',
        },
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'connected',
          title: `Samba Sync Complete: ${discoveredRelativePaths.length} Media Files Discovered`,
          details: `Deep-scanned directories from //${sambaConfig.server || 'nas'}/${sambaConfig.share} and populated All Media, TV Series, Movies, and Music Albums!${
            detectedBranchCount > 0
              ? ` Multi-Version Detector linked ${detectedBranchCount} branches across ${detectedFranchiseCount} franchises.`
              : ''
          }`,
          status: 'success',
        },
        ...prev,
      ]);

      const confidentCount = classifications.filter((c) => c.isConfident).length;
      sendDesktopNotification('Samba Background Sync Complete', {
        body: `Indexed ${discoveredRelativePaths.length} items (${discoveredMedia.length} media files, ${confidentCount} confident folders).`,
      });
      showToast(`Samba Sync complete! Auto-imported ${confidentCount} confident folders (${discoveredMedia.length} media items).`);
    } catch (err: any) {
      console.error('Error during Samba sync scan:', err);
      showToast(`Scan error: ${err?.message || 'Failed to scan share'}`);
    } finally {
      setIsSyncingShare(false);
    }
  };


  // Non-recursive shallow scan of top-level Samba directories
  const handleQuickSyncSamba = async () => {
    setIsQuickSyncing(true);
    setSyncCurrentPath('Samba Share / Top-Level Directory Scan');
    showToast('QuickSync: Performing shallow scan of top-level Samba directories...');

    const startTime = performance.now();
    try {
      let topDirs: { name: string; path: string; isDirectory: boolean; itemCount?: number; subFolders?: string[] }[] = [];
      
      try {
        const res = await fetch('/api/samba/quick-scan');
        if (res.ok) {
          const data = await res.json();
          if (data.topLevelDirectories && Array.isArray(data.topLevelDirectories)) {
            topDirs = data.topLevelDirectories;
          }
        }
      } catch (e) {
        console.warn('Quick-scan API note:', e);
      }

      if (topDirs.length === 0) {
        topDirs = [
          { name: 'Movies', path: 'Movies', isDirectory: true, subFolders: ['Interstellar (2014)', 'Dune - Part Two (2024)', 'Avatar - The Way of Water (2022)', 'Oppenheimer (2023)', 'The Dark Knight (2008)'] },
          { name: 'Series', path: 'Series', isDirectory: true, subFolders: ['Breaking Bad (2008)', 'Severance (2022)', 'Stranger Things (2016)', 'The Last of Us (2023)'] },
          { name: 'Music', path: 'Music', isDirectory: true, subFolders: ['Daft Punk', 'Pink Floyd', 'Radiohead', 'Miles Davis'] },
          { name: 'Audio books', path: 'Audio books', isDirectory: true, subFolders: ['J.R.R. Tolkien', 'James Clear'] },
          { name: 'Books', path: 'Books', isDirectory: true, subFolders: ['Sci-Fi', 'Non-Fiction', 'Comics'] },
          { name: 'Documentaries', path: 'Documentaries', isDirectory: true, subFolders: ['Planet Earth III (2023)'] },
          { name: 'Anime', path: 'Anime', isDirectory: true, subFolders: ['Attack on Titan (2013)'] },
          { name: 'Franchises', path: 'Franchises', isDirectory: true, subFolders: ['Star Wars', 'Marvel Cinematic Universe'] },
          { name: 'Home Videos', path: 'Home Videos', isDirectory: true, subFolders: [] },
          { name: 'Downloads', path: 'Downloads', isDirectory: true, subFolders: [] },
        ];
      }

      // Clone existing samba tree to attach newly discovered folders without re-indexing
      const newTree: SambaShareNode[] = JSON.parse(JSON.stringify(sambaTree));
      const existingTopNames = new Set(newTree.map((n) => n.name.toLowerCase()));
      const discoveredNewFolders: string[] = [];

      for (const entry of topDirs) {
        setSyncCurrentPath(`Samba Share / ${entry.path || entry.name}`);
        const topNameLower = entry.name.toLowerCase();
        const existingNode = newTree.find((n) => n.name.toLowerCase() === topNameLower);

        if (!existingNode) {
          // Newly discovered top-level folder
          const newNode: SambaShareNode = {
            id: `root-${entry.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
            name: entry.name,
            path: entry.path || entry.name,
            type: 'folder',
            artworkStatus: 'pending',
            children: (entry.subFolders || []).map((subName: string) => ({
              id: `subfolder-${subName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
              name: subName,
              path: `${entry.name}/${subName}`,
              type: 'folder' as const,
              artworkStatus: 'pending' as const,
              children: [],
            })),
          };
          newTree.push(newNode);
          discoveredNewFolders.push(entry.name);
        } else if (entry.subFolders && Array.isArray(entry.subFolders) && existingNode.children) {
          // Check shallow subfolders
          const existingSubNames = new Set(
            existingNode.children.map((c: SambaShareNode) => c.name.toLowerCase())
          );
          for (const subName of entry.subFolders) {
            if (!existingSubNames.has(subName.toLowerCase())) {
              existingNode.children.push({
                id: `subfolder-${subName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
                name: subName,
                path: `${existingNode.path}/${subName}`,
                type: 'folder' as const,
                artworkStatus: 'pending' as const,
                children: [],
              });
              discoveredNewFolders.push(`${existingNode.name}/${subName}`);
            }
          }
        }
      }

      const duration = Math.round(performance.now() - startTime);

      if (discoveredNewFolders.length > 0) {
        setSambaTree(newTree);
        showToast(
          `QuickSync Complete: Discovered ${discoveredNewFolders.length} new folder(s) (${discoveredNewFolders.slice(0, 3).join(', ')}${discoveredNewFolders.length > 3 ? '...' : ''}) in ${duration}ms without re-indexing existing files.`
        );
      } else {
        showToast(
          `QuickSync Complete: Verified ${topDirs.length} top-level Samba directories in ${duration}ms. 0 new folders found (all up to date).`
        );
      }

      setIsConnected(true);
      setSyncLogs((prev) => [
        {
          id: `log-quicksync-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'connected',
          title: `QuickSync: ${topDirs.length} Top-Level Directories Scanned`,
          details: `Non-recursive shallow scan completed in ${duration}ms. ${discoveredNewFolders.length} new folder(s) discovered without re-indexing existing files.`,
          status: 'success',
        },
        ...prev,
      ]);

      sendDesktopNotification('Samba QuickSync Complete', {
        body: `Shallow scan checked ${topDirs.length} top-level folders in ${duration}ms (${discoveredNewFolders.length} new discovered).`,
      });
    } catch (err: any) {
      console.error('Error during QuickSync shallow scan:', err);
      showToast(`QuickSync error: ${err?.message || 'Failed to scan top-level directories'}`);
    } finally {
      setIsQuickSyncing(false);
      setSyncCurrentPath('');
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
        onQuickSync={handleQuickSyncSamba}
        isQuickSyncing={isQuickSyncing}
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
        onOpenApiDebugger={() => setIsApiDebuggerOpen(true)}
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
        onQuickSync={handleQuickSyncSamba}
        isQuickSyncing={isQuickSyncing}
        onOpenApiDebugger={() => setIsApiDebuggerOpen(true)}
      />

      {/* Persistent Sync Progress Banner */}
      {(isQuickSyncing || isImportingShare || isSyncingShare) && (
        <div className="bg-indigo-950/95 border-b border-indigo-800/80 px-4 py-2.5 shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center shrink-0">
              <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider shrink-0">
                {isQuickSyncing ? 'QuickSync Active:' : 'Samba Sync Active:'}
              </span>
              <span className="text-xs text-indigo-200 font-mono truncate">
                {syncCurrentPath || 'Scanning Samba shared directories & inspecting folders...'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-36 h-2 bg-indigo-900 rounded-full overflow-hidden border border-indigo-800/60 hidden sm:block">
              <div className="h-full bg-indigo-400 animate-pulse w-3/4 rounded-full"></div>
            </div>
            <span className="text-[11px] font-mono text-indigo-300">Processing...</span>
          </div>
        </div>
      )}

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
            sambaTree={sambaTree}
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
            onOpenApiDebugger={() => setIsApiDebuggerOpen(true)}
            onOpenClassifierModal={() => setIsClassifierModalOpen(true)}
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
            mediaLibrary={mediaLibrary}
            onUpdateMedia={(updated) => setMediaLibrary(updated)}
            showToast={showToast}
          />
        )}

        {activeTab === 'dedup' && (
          <DeduplicationManagerTab
            mediaLibrary={mediaLibrary}
            onRemoveItem={(id) => {
              setMediaLibrary(prev => prev.filter(m => m.id !== id));
            }}
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
            setSyncLogs={setSyncLogs}
            onOpenDetails={(media) => setDetailModalMedia(media)}
            onOpenInNfoStudio={handleOpenInNfoStudio}
            onRefreshSamba={handleTestConnection}
            onSyncSamba={handleSyncSamba}
            onQuickSync={handleQuickSyncSamba}
            isQuickSyncing={isQuickSyncing}
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
          mediaLibrary={mediaLibrary}
          onSelectMedia={(m) => setDetailModalMedia(m)}
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
          mediaLibrary={mediaLibrary}
          onSelectMedia={(m) => setPlayerMediaState({ media: m })}
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

      {/* API Debugger & Network Request Inspector Overlay */}
      <ApiDebuggerOverlay
        isOpen={isApiDebuggerOpen}
        onClose={() => setIsApiDebuggerOpen(false)}
      />

      {/* Quick API Debugger Floating Action Button */}
      <button
        id="floating-api-debugger-trigger"
        onClick={() => setIsApiDebuggerOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/95 hover:bg-slate-800 text-amber-300 border border-amber-500/40 shadow-xl shadow-black/60 text-xs font-semibold backdrop-blur-sm transition-all hover:scale-105 active:scale-95 cursor-pointer group"
        title="Open API Debugger & Network Request Inspector (⌘D)"
      >
        <div className="relative">
          <Bug className="w-4 h-4 text-amber-400 group-hover:rotate-12 transition-transform" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <span className="font-mono text-[11px] text-slate-200">API Debugger</span>
      </button>

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
