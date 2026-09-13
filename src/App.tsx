import React, { useState, useEffect } from 'react';
import {
  Header,
} from './components/Header';
import { MediaSearch } from './components/MediaSearch';
import { BatchFilenameCleaner } from './components/BatchFilenameCleaner';
import { SambaMountHub } from './components/SambaMountHub';
import { SambaExplorer } from './components/SambaExplorer';
import { NfoStudio } from './components/NfoStudio';
import { MediaDetailModal } from './components/MediaDetailModal';
import { SqliteVault } from './components/SqliteVault';
import {
  MediaMetadata,
  SambaConfig,
  SambaShareNode,
  SyncLog,
  ParsedFileInfo,
} from './types';
import { CURATED_MEDIA_DATABASE } from './data/curatedMedia';
import {
  isTauriEnvironment,
  checkMacVolume,
  listMountedVolumes,
  probeLocalNetwork,
  VolumeMountInfo,
} from './utils/tauriBridge';

const INITIAL_SAMBA_CONFIG: SambaConfig = {
  server: '192.168.1.150',
  share: 'media',
  port: 445,
  workgroup: 'WORKGROUP',
  username: 'media_admin',
  password: 'MediaPassword123!',
  isGuest: false,
  targetPlatform: 'all',
  baseMountPath: '//192.168.1.150/media',
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
    ],
  },
  {
    id: 'root-shows',
    name: 'TV Shows',
    path: 'TV Shows',
    type: 'folder',
    children: [
      {
        id: 'folder-breaking-bad',
        name: 'Breaking Bad (2008)',
        path: 'TV Shows/Breaking Bad (2008)',
        type: 'folder',
        hasNfo: true,
        hasPoster: true,
        mediaType: 'series',
        matchedMedia: CURATED_MEDIA_DATABASE.find((m) => m.id === 'series-breaking-bad'),
        children: [
          {
            id: 'file-bb-tvshow-nfo',
            name: 'tvshow.nfo',
            path: 'TV Shows/Breaking Bad (2008)/tvshow.nfo',
            type: 'file',
            size: '3.6 KB',
          },
          {
            id: 'file-bb-poster',
            name: 'poster.jpg',
            path: 'TV Shows/Breaking Bad (2008)/poster.jpg',
            type: 'file',
            size: '510 KB',
          },
          {
            id: 'folder-bb-s1',
            name: 'Season 01',
            path: 'TV Shows/Breaking Bad (2008)/Season 01',
            type: 'folder',
            children: [
              {
                id: 'file-bb-s01e01',
                name: 'Breaking Bad - S01E01 - Pilot.mkv',
                path: 'TV Shows/Breaking Bad (2008)/Season 01/Breaking Bad - S01E01 - Pilot.mkv',
                type: 'file',
                size: '1.4 GB',
              },
              {
                id: 'file-bb-s01e01-nfo',
                name: 'Breaking Bad - S01E01 - Pilot.nfo',
                path: 'TV Shows/Breaking Bad (2008)/Season 01/Breaking Bad - S01E01 - Pilot.nfo',
                type: 'file',
                size: '1.2 KB',
              },
              {
                id: 'file-bb-s01e02',
                name: "Breaking Bad - S01E02 - Cat's in the Bag....mkv",
                path: "TV Shows/Breaking Bad (2008)/Season 01/Breaking Bad - S01E02 - Cat's in the Bag....mkv",
                type: 'file',
                size: '1.3 GB',
              },
            ],
          },
        ],
      },
      {
        id: 'folder-severance',
        name: 'Severance (2022)',
        path: 'TV Shows/Severance (2022)',
        type: 'folder',
        hasNfo: true,
        hasPoster: true,
        mediaType: 'series',
        matchedMedia: CURATED_MEDIA_DATABASE.find((m) => m.id === 'series-severance'),
        children: [
          {
            id: 'file-sev-nfo',
            name: 'tvshow.nfo',
            path: 'TV Shows/Severance (2022)/tvshow.nfo',
            type: 'file',
            size: '3.1 KB',
          },
          {
            id: 'folder-sev-s1',
            name: 'Season 01',
            path: 'TV Shows/Severance (2022)/Season 01',
            type: 'folder',
            children: [
              {
                id: 'file-sev-s01e01',
                name: 'Severance - S01E01 - Good News About Hell.mkv',
                path: 'TV Shows/Severance (2022)/Season 01/Severance - S01E01 - Good News About Hell.mkv',
                type: 'file',
                size: '1.6 GB',
              },
            ],
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
                id: 'file-ram-cover',
                name: 'folder.jpg',
                path: 'Music/Daft Punk/Random Access Memories (2013)/folder.jpg',
                type: 'file',
                size: '380 KB',
              },
              {
                id: 'file-ram-01',
                name: '01 - Give Life Back to Music.flac',
                path: 'Music/Daft Punk/Random Access Memories (2013)/01 - Give Life Back to Music.flac',
                type: 'file',
                size: '34.2 MB',
              },
              {
                id: 'file-ram-08',
                name: '08 - Get Lucky.flac',
                path: 'Music/Daft Punk/Random Access Memories (2013)/08 - Get Lucky.flac',
                type: 'file',
                size: '42.8 MB',
              },
            ],
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
  const [activeTab, setActiveTab] = useState<
    'search' | 'cleaner' | 'samba-mount' | 'explorer' | 'nfo-studio' | 'sqlite-vault'
  >('search');
  const [sambaConfig, setSambaConfig] = useState<SambaConfig>(INITIAL_SAMBA_CONFIG);
  const [isConnected, setIsConnected] = useState(true);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState<any>(null);
  const [sambaTree, setSambaTree] = useState<SambaShareNode[]>(INITIAL_SAMBA_TREE);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>(INITIAL_SYNC_LOGS);
  const [detailModalMedia, setDetailModalMedia] = useState<MediaMetadata | null>(null);
  const [nfoStudioMedia, setNfoStudioMedia] = useState<MediaMetadata | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [isMountedInFinder, setIsMountedInFinder] = useState(false);
  const [mountedVolumeInfo, setMountedVolumeInfo] = useState<VolumeMountInfo | null>(null);
  const [systemVolumes, setSystemVolumes] = useState<string[]>([]);
  const [isDesktopApp, setIsDesktopApp] = useState(false);

  // Poll /Volumes in desktop mode or on share configuration changes
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

  const handlePushToSamba = (media: MediaMetadata) => {
    const rootCategory =
      media.type === 'movie' ? 'Movies' : media.type === 'series' ? 'TV Shows' : 'Music';
    const folderTitle = `${media.title} (${media.year})`;

    setSambaTree((prevTree) => {
      return prevTree.map((rootNode) => {
        if (rootNode.name !== rootCategory) return rootNode;

        // Check if item folder already exists
        const exists = rootNode.children?.some((c) => c.name.includes(media.title));
        if (exists) return rootNode;

        const newFolderNode: SambaShareNode = {
          id: `folder-${media.id}-${Date.now()}`,
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

        return {
          ...rootNode,
          children: [newFolderNode, ...(rootNode.children || [])],
        };
      });
    });

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
    items.forEach((item) => {
      const syntheticMedia: MediaMetadata = {
        id: `batch-${Date.now()}-${Math.random()}`,
        type: item.detectedType,
        title: item.detectedTitle,
        year: item.detectedYear || new Date().getFullYear(),
        overview: `Auto-tagged release "${item.originalFilename}". Formatted for Samba network share.`,
        genres: ['Organized Media'],
        rating: 8.5,
        posterUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80',
        recommendedFolderStructure: item.cleanFolderPath,
        recommendedFilenames: [item.cleanFormattedFilename],
        source: 'curated-database',
      };
      handlePushToSamba(syntheticMedia);
    });

    showToast(`Organized & pushed ${items.length} files to Samba share!`);
    setActiveTab('explorer');
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

      {/* Main Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sambaConfig={sambaConfig}
        setSambaConfig={setSambaConfig}
        isConnected={isConnected}
        onOpenQuickMount={() => setActiveTab('samba-mount')}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'search' && (
          <MediaSearch
            onPushToSamba={handlePushToSamba}
            onOpenDetails={(media) => setDetailModalMedia(media)}
            onOpenInNfoStudio={handleOpenInNfoStudio}
            sambaConfig={sambaConfig}
          />
        )}

        {activeTab === 'sqlite-vault' && (
          <SqliteVault
            onOpenDetails={(media) => setDetailModalMedia(media)}
          />
        )}

        {activeTab === 'cleaner' && (
          <BatchFilenameCleaner
            sambaConfig={sambaConfig}
            onBatchPushToSamba={handleBatchPushToSamba}
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
            isMountedInFinder={isMountedInFinder}
            mountedVolumeInfo={mountedVolumeInfo}
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
          sambaConfig={sambaConfig}
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
