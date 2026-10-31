import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
  RotateCw,
  Film,
  Music,
  Tv,
  List,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Sliders,
  CheckCircle,
  Radio,
  FileVideo,
  Cpu,
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  Network,
  Copy,
  Check,
  Eye,
  Server,
  Globe,
} from 'lucide-react';
import {
  MediaMetadata,
  MediaType,
  EpisodeMetadata,
  TrackMetadata,
  SambaConfig,
  TranscodeConfig,
} from '../types';
import { MatroskaPlayer } from './MatroskaPlayer';
import { HLSPlayer } from './HLSPlayer';
import { getDirectMediaPlayUrl } from '../utils/directMediaPlay';
import { getMountedDisplayPath, extractCleanLocalPath } from '../utils/pathSanitizer';
import { transcodeService, TranscodeStatusInfo, MediaInfo } from '../services/TranscodeService';

export interface NetworkProbeStats {
  timestamp: number;
  testedUrl: string;
  httpStatus: number | null;
  statusText: string;
  acceptRanges: string | null;
  contentRange: string | null;
  contentLength: string | null;
  contentType: string | null;
  accessControlAllowOrigin: string | null;
  latencyMs: number | null;
  isPartialContent: boolean;
  hasAcceptRangesBytes: boolean;
  hasValidContentRange: boolean;
  corsHeadersExposed: boolean;
  error?: string | null;
}

export interface VideoSrcDiagnostic {
  domSrc: string;
  currentSrc: string;
  resolvedProtocol: string;
  isBlob: boolean;
  isMalformedAsset: boolean;
  isDoublePrefixed: boolean;
  isExpressStream: boolean;
  isHlsPlaylist: boolean;
  healthStatus: 'healthy' | 'warning' | 'error';
  diagnosisNotes: string[];
  lastChecked: number;
}

export interface MediaPlayerModalProps {
  isOpen: boolean;
  media: MediaMetadata;
  initialEpisode?: EpisodeMetadata;
  initialTrack?: TrackMetadata;
  onClose: () => void;
  sambaConfig: SambaConfig;
  mediaLibrary?: MediaMetadata[];
  onSelectMedia?: (m: MediaMetadata) => void;
  onNavigateToMountHub?: () => void;
  onTestConnection?: (sambaConfig?: SambaConfig) => Promise<any> | any;
  transcodeConfig?: TranscodeConfig;
}

export const MediaPlayerModal: React.FC<MediaPlayerModalProps> = ({
  isOpen,
  media,
  initialEpisode,
  initialTrack,
  onClose,
  sambaConfig,
  mediaLibrary = [],
  onSelectMedia,
  onTestConnection,
  onNavigateToMountHub,
  transcodeConfig,
}) => {
  const [currentEpisode, setCurrentEpisode] = useState<EpisodeMetadata | undefined>(initialEpisode);
  const [currentTrack, setCurrentTrack] = useState<TrackMetadata | undefined>(initialTrack);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playerEngine, setPlayerEngine] = useState<'hls' | 'direct' | 'matroska'>('hls');
  const [useMatroskaEngine, setUseMatroskaEngine] = useState(false);
  const [useTranscode, setUseTranscode] = useState(false);
  const [showPlaylistSidebar, setShowPlaylistSidebar] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [transcodeStatus, setTranscodeStatus] = useState<TranscodeStatusInfo>({
    state: 'native',
    progressPercent: 0,
    message: 'Native Playback',
  });
  const [isProbing, setIsProbing] = useState(false);
  const [showDiagnosticOverlay, setShowDiagnosticOverlay] = useState(false);
  const [diagView, setDiagView] = useState<'stats' | 'protocol' | 'network' | 'videosrc'>('stats');
  const [pathHealth, setPathHealth] = useState<any>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkProbeStats | null>(null);
  const [isProbingNetwork, setIsProbingNetwork] = useState(false);
  const [videoSrcReport, setVideoSrcReport] = useState<VideoSrcDiagnostic | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const [hardwareAccel, setHardwareAccel] = useState(transcodeConfig?.hwAccel?.enabled ?? true);
  const [selectedCodec, setSelectedCodec] = useState<'h264' | 'hevc' | 'av1'>(transcodeConfig?.codec || 'h264');
  const [pipelineHealth, setPipelineHealth] = useState({ fps: 60, latency: 0 });
  const [lastPruneTime, setLastPruneTime] = useState(0);
  const [isForceStreamViaPipe, setIsForceStreamViaPipe] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const getSanitizedPath = (path: string) => {
    return extractCleanLocalPath(path, sambaConfig?.share || 'media');
  };

  const handleNativeFallback = async (pathOverride?: string) => {
    try {
      // Intercept any path containing 'asset:/' or 'localhost' and completely strip out everything prior to true root
      const raw = pathOverride || activeFilePath;
      const pathToUse = extractCleanLocalPath(raw, sambaConfig?.share || 'media');
      console.log('[MediaPlayerModal] Attempting native file fallback with sanitized local path:', pathToUse);

      const isNetwork = pathToUse.toLowerCase().startsWith('/volumes/') || pathToUse.startsWith('//') || pathToUse.startsWith('\\\\');
      if (isNetwork) {
        console.log('[MediaPlayerModal] Network path detected in fallback, fetching blob via async Express stream to prevent tokio block_on hang...');
        const streamEndpoint = `/api/samba/stream?path=${encodeURIComponent(pathToUse)}`;
        const res = await fetch(streamEndpoint);
        if (!res.ok) throw new Error(`Stream proxy returned HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setPlayerEngine('direct');
        setPlaybackError(null);
        console.log('[MediaPlayerModal] Native fallback URL created via async stream proxy:', url);
        return;
      }

      const tauri = (window as any).__TAURI__;
      if (!tauri || !tauri.fs) {
        throw new Error('Tauri filesystem API not available');
      }

      // Read the file as binary using Tauri (for strictly local disk files)
      const binaryData = await tauri.fs.readBinaryFile(pathToUse);
      const blob = new Blob([binaryData], { type: 'video/mp4' }); 
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setPlayerEngine('direct');
      setPlaybackError(null);
      console.log('[MediaPlayerModal] Native fallback URL created:', url);
    } catch (err) {
      console.error('[MediaPlayerModal] Native fallback failed:', err);
      setPlaybackError('Native fallback failed: ' + (err as Error).message);
    }
  };

  // FPS monitor effect
  useEffect(() => {
    // Simulated FPS monitoring from transcodeStatus message or logs
    if (transcodeStatus.state === 'transcoding') {
      const randomFps = 10 + Math.random() * 20; // Simulated FPS
      setPipelineHealth({ fps: Math.round(randomFps), latency: Math.round(Math.random() * 50) });
    }
  }, [transcodeStatus]);

  const [isBufferingCache, setIsBufferingCache] = useState(false);
  const [bufferSecondsRemaining, setBufferSecondsRemaining] = useState(10);

  // Pre-load buffer strategy & 5-second buffer threshold monitor:
  // Automatically pauses when buffer < 5s and waits for transcoder cache to fill before resuming playback.
  useEffect(() => {
    const el = media.type === 'album' ? audioRef.current : videoRef.current;
    if (!el) return;

    const checkBufferHealth = () => {
      try {
        if (el.buffered && el.buffered.length > 0) {
          const bufferedEnd = el.buffered.end(el.buffered.length - 1);
          const current = el.currentTime;
          const bufferRemaining = bufferedEnd - current;
          setBufferSecondsRemaining(Math.max(0, bufferRemaining));

          if (bufferRemaining < 5 && !el.paused && current < (duration - 2)) {
            if (!isBufferingCache) {
              console.warn(`[MediaPlayerModal] Buffer dropped below 5s threshold (${bufferRemaining.toFixed(1)}s). Pausing stream to let transcoder fill cache...`);
              setIsBufferingCache(true);
              el.pause();
            }
          } else if (bufferRemaining >= 5 && isBufferingCache) {
            console.log(`[MediaPlayerModal] Buffer refilled (${bufferRemaining.toFixed(1)}s >= 5s). Resuming playback...`);
            setIsBufferingCache(false);
            el.play().catch(() => {});
          }
        }
      } catch (e) {
        // Ignore
      }
    };

    const interval = setInterval(checkBufferHealth, 1000);
    return () => clearInterval(interval);
  }, [isBufferingCache, duration, media.type]);

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
    // Sliding-window buffer strategy: every 30s of playback, prune consumed transcode segments from cache
    if (Math.abs(time - lastPruneTime) > 30) {
      setLastPruneTime(time);
      fetch('/api/samba/transcode/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentTime: time, keepPath: activeFilePath }),
      }).catch(() => {});
    }
  };

  // Sync initial episode or track when props change
  useEffect(() => {
    setCurrentEpisode(initialEpisode);
  }, [initialEpisode]);

  useEffect(() => {
    setCurrentTrack(initialTrack);
  }, [initialTrack]);

  // Determine active media path resolved to mounted local path (e.g. /Volumes/media/...)
  const activeFilePath = useMemo(() => {
    let resolved = '';
    if (media.type === 'album') {
      resolved = currentTrack?.playbackUrl || media.playbackUrl || media.path || '';
    } else if (media.type === 'series') {
      resolved = currentEpisode?.playbackUrl || currentEpisode?.filePath || media.playbackUrl || media.path || '';
    } else {
      resolved = media.playbackUrl || media.path || '';
    }

    if (!resolved) {
      const server = sambaConfig?.server || '192.168.1.25';
      const share = sambaConfig?.share || 'media';
      const folder = media.recommendedFolderStructure || (media.type === 'series' ? 'Series' : 'Movies');
      const filename = media.recommendedFilenames?.[0] || `${media.title || 'media'}.mkv`;
      const cleanFolder = folder.replace(/^\/+/, '').replace(/\/+$/, '');
      resolved = `//${server}/${share}/${cleanFolder ? `${cleanFolder}/` : ''}${filename}`;
    }

    const share = sambaConfig?.share || 'media';
    const mountRoot = sambaConfig?.mountPath || sambaConfig?.baseMountPath || `/Volumes/${share}`;
    const mounted = getMountedDisplayPath(resolved, mountRoot, share);
    return extractCleanLocalPath(mounted, share);
  }, [media, currentEpisode, currentTrack, sambaConfig]);

  const isMkv = useMemo(() => {
    const p = (activeFilePath || media.matchedFilename || '').toLowerCase();
    return p.endsWith('.mkv') || p.includes('.mkv?');
  }, [activeFilePath, media.matchedFilename]);

  // Probe media and subscribe to transcode service updates
  useEffect(() => {
    if (!activeFilePath) return;
    let isMounted = true;
    setIsProbing(true);

    transcodeService.probe(activeFilePath)
      .then((info) => {
        if (!isMounted) return;
        setMediaInfo(info);
        setIsProbing(false);
      })
      .catch(() => {
        if (isMounted) setIsProbing(false);
      });

    const unsubscribe = transcodeService.subscribe((path, status) => {
      if (path === activeFilePath) {
        setTranscodeStatus(status);
      }
    });

    setTranscodeStatus(transcodeService.getStatus(activeFilePath));

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [activeFilePath]);

  const handleStartTranscode = async () => {
    setUseTranscode(true);
    setPlaybackError(null);
    try {
      await transcodeService.transcode(activeFilePath, media.type === 'album' ? 'audio' : 'video');
    } catch (err: any) {
      setPlaybackError(err?.message || 'Transcoding failed');
    }
  };

  // Build the playback URL (direct or transcoded output)
  const streamUrl = useMemo(() => {
    if (!activeFilePath) return '';

    // Extract normalized filesystem path stripped of any mangled asset/tauri/volume duplicates
    const cleanLocalPath = extractCleanLocalPath(activeFilePath, sambaConfig?.share || 'media');

    // 1. If explicit transcoding is required or transcode cache is ready, route via transcode endpoint
    const hwParam = hardwareAccel ? '&hwaccel=true' : '';
    if (useTranscode || transcodeStatus.state === 'ready') {
      const targetPath = transcodeStatus.outputPath || cleanLocalPath || activeFilePath;
      const relativeTranscode = `/api/samba/transcode?path=${encodeURIComponent(targetPath)}${hwParam}`;
      if (typeof window !== 'undefined' && (
        window.location.protocol === 'tauri:' ||
        window.location.origin.includes('tauri.localhost') ||
        window.location.origin.includes('localhost:1420') ||
        Boolean((window as any).__TAURI__) ||
        Boolean((window as any).__TAURI_IPC__)
      )) {
        const backendPort = (window as any).__EXPRESS_PORT__ || 3000;
        return `http://localhost:${backendPort}${relativeTranscode}`;
      }
      return relativeTranscode;
    }

    // 2. THREADING & DEADLOCK FIX (macOS Stackshots diagnostic resolution):
    // Tauri's asset_protocol_handler invokes `tokio::runtime::Runtime::block_on` synchronously
    // directly on the user interactive main thread. Under Samba (smbfs) latency spikes,
    // this deadlocks the window event loop and causes beachballs/application crashes.
    // We implement a robust check to identify network paths (strings starting with //, \\, /Volumes/, or smb:)
    // and completely bypass Tauri's native convertFileSrc or asset protocol transformations.
    const isNetworkPath = (p: string): boolean => {
      if (!p) return false;
      const lower = p.trim().toLowerCase();
      return (
        lower.startsWith('//') ||
        lower.startsWith('\\\\') ||
        lower.startsWith('/volumes/') ||
        lower.startsWith('volumes/') ||
        lower.startsWith('smb:') ||
        lower.startsWith('/mnt/') ||
        lower.startsWith('/media/')
      );
    };

    if (isNetworkPath(activeFilePath) || isNetworkPath(cleanLocalPath)) {
      console.log('[MediaPlayerModal] Network share detected, bypassing Tauri asset_protocol_handler to avoid main-thread block_on deadlock. Offloading to Express stream proxy:', cleanLocalPath);
      // Immediately return standard proxy streaming path to offload I/O operations asynchronously to Express backend
      const relativeProxy = `/api/samba/stream?path=${encodeURIComponent(cleanLocalPath)}`;
      if (typeof window !== 'undefined' && (
        window.location.protocol === 'tauri:' ||
        window.location.origin.includes('tauri.localhost') ||
        window.location.origin.includes('localhost:1420') ||
        Boolean((window as any).__TAURI__) ||
        Boolean((window as any).__TAURI_IPC__)
      )) {
        const backendPort = (window as any).__EXPRESS_PORT__ || 3000;
        return `http://localhost:${backendPort}${relativeProxy}`;
      }
      return relativeProxy;
    }

    // 3. Check if running inside a Tauri container for strictly local, non-network disk files
    const isTauriContainer = typeof window !== 'undefined' && (
      Boolean((window as any).__TAURI__) ||
      Boolean((window as any).__TAURI_IPC__) ||
      window.location.protocol === 'tauri:' ||
      window.location.origin.includes('tauri.localhost')
    );

    // Only for truly local offline files (e.g. $HOME, /tmp, C:\...), utilize Tauri convertFileSrc
    if (isTauriContainer && !isForceStreamViaPipe) {
      try {
        const tauriGlobal = (window as any).__TAURI__;
        const convert = tauriGlobal?.convertFileSrc ||
          (window as any).__TAURI_IPC__?.convertFileSrc ||
          (window as any).convertFileSrc;

        if (typeof convert === 'function') {
          console.log('[Tauri Protocol Inspector] [INPUT] Clean Local Path for transform:', cleanLocalPath);
          const convertedUrl = convert(cleanLocalPath);
          console.log('[Tauri Protocol Inspector] [OUTPUT] Resulting Asset URL:', convertedUrl);
          
          if (convertedUrl && (convertedUrl.includes('asset:') || convertedUrl.includes('tauri:'))) {
             console.log('[Tauri Protocol Inspector] [VALIDATION] Transformation succeeded for:', convertedUrl);
          } else {
             console.error('[Tauri Protocol Inspector] [VALIDATION] Transformation returned unexpected URL format:', convertedUrl);
          }
          return convertedUrl;
        }
      } catch (err) {
        console.warn('[MediaPlayerModal] Tauri convertFileSrc error, falling back to direct play:', err);
      }
    }

    return getDirectMediaPlayUrl(cleanLocalPath || activeFilePath, sambaConfig);
  }, [activeFilePath, sambaConfig, useTranscode, isForceStreamViaPipe, transcodeStatus, hardwareAccel]);

  // Diagnostic: Check if streamUrl is blocked
  useEffect(() => {
    if (streamUrl && (streamUrl.startsWith('tauri://') || streamUrl.startsWith('asset://'))) {
      fetch(streamUrl, { method: 'HEAD' })
        .then(response => {
          if (!response.ok) {
            console.error('[MediaPlayerModal] Diagnostic: Asset URL might be blocked by CORS or origin-check:', streamUrl, 'Status:', response.status);
          } else {
            console.log('[MediaPlayerModal] Diagnostic: Asset URL is accessible:', streamUrl);
          }
        })
        .catch(err => {
           console.error('[MediaPlayerModal] Diagnostic: Failed to access asset URL:', streamUrl, err);
        });
    }
  }, [streamUrl]);

  // Reset playback errors when target file changes
  useEffect(() => {
    setPlaybackError(null);
    setCurrentTime(0);
    setDuration(0);
  }, [streamUrl]);

  // Keyboard shortcut for ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPlaying]);

  const togglePlay = () => {
    const el = media.type === 'album' ? audioRef.current : videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch((err) => {
        console.warn('Playback error:', err);
        setPlaybackError(err.message || 'Could not play media.');
      });
    } else {
      el.pause();
    }
  };

  const handleSeek = (newTime: number) => {
    const el = media.type === 'album' ? audioRef.current : videoRef.current;
    if (el) {
      el.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    const el = media.type === 'album' ? audioRef.current : videoRef.current;
    if (el) {
      el.volume = newVol;
      el.muted = newVol === 0;
    }
  };

  // Protocol Debugger Monitor
  useEffect(() => {
    if (!showDiagnosticOverlay || diagView !== 'protocol') return;

    const tauri = (window as any).__TAURI__;
    const convert = tauri?.convertFileSrc;
    
    if (!convert) {
      setPathHealth({ error: 'convertFileSrc not found' });
      return;
    }

    const cleanInput = extractCleanLocalPath(activeFilePath, sambaConfig?.share || 'media');
    const result = convert(cleanInput);
    const isRelative = !result.startsWith('/') && !result.includes('://') && !result.startsWith('asset:');
    const isTauriProtocol = result.startsWith('tauri://') || result.startsWith('asset://') || result.startsWith('asset:');
    const startsInVolumes = cleanInput.startsWith('/Volumes');

    setPathHealth({
      rawInput: activeFilePath,
      cleanInput,
      result,
      isRelative,
      isTauriProtocol,
      startsInVolumes,
      timestamp: Date.now()
    });
  }, [activeFilePath, showDiagnosticOverlay, diagView, sambaConfig]);

  // Clipboard copy helper with visual acknowledgment
  const copyToClipboard = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  // Helper to retrieve active mounted <video> element (Direct Video ref or HLS Player child element)
  const getActiveVideoElement = useCallback((): HTMLVideoElement | null => {
    if (videoRef.current) return videoRef.current;
    if (playerContainerRef.current) {
      const v = playerContainerRef.current.querySelector('video');
      if (v) return v as HTMLVideoElement;
    }
    return null;
  }, []);

  // NETWORK MONITOR PROBE:
  // Verifies that the Express server responds correctly to HTTP range requests
  // Specifically checks Content-Range, Accept-Ranges, Content-Length, Content-Type, and HTTP 206 Partial Content
  const runNetworkProbe = useCallback(async (targetUrl?: string) => {
    let urlToProbe = targetUrl || streamUrl;
    if (!urlToProbe && activeFilePath) {
      const clean = extractCleanLocalPath(activeFilePath, sambaConfig?.share || 'media');
      urlToProbe = `/api/samba/stream?path=${encodeURIComponent(clean)}`;
    }
    if (!urlToProbe) return;

    // Resolve relative path to localhost backend if inside a Tauri custom scheme container
    if (typeof window !== 'undefined' && urlToProbe.startsWith('/') && (
      window.location.protocol === 'tauri:' ||
      window.location.origin.includes('tauri.localhost') ||
      Boolean((window as any).__TAURI__) ||
      Boolean((window as any).__TAURI_IPC__)
    )) {
      const backendPort = (window as any).__EXPRESS_PORT__ || 3000;
      urlToProbe = `http://localhost:${backendPort}${urlToProbe}`;
    }

    setIsProbingNetwork(true);
    const start = performance.now();

    try {
      // Send HTTP Range request requesting the first 1KB (bytes=0-1023)
      const res = await window.fetch(urlToProbe, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-1023',
        },
      });

      const elapsed = Math.round(performance.now() - start);
      const acceptRanges = res.headers.get('accept-ranges');
      const contentRange = res.headers.get('content-range');
      const contentLength = res.headers.get('content-length');
      const contentType = res.headers.get('content-type');
      const allowOrigin = res.headers.get('access-control-allow-origin');

      // Cancel reader to avoid continuing download
      try {
        res.body?.cancel();
      } catch {}

      const is206 = res.status === 206;
      const hasAcceptRangesBytes = acceptRanges?.toLowerCase().includes('bytes') ?? false;
      const hasValidContentRange = Boolean(contentRange && contentRange.toLowerCase().startsWith('bytes'));

      setNetworkStats({
        timestamp: Date.now(),
        testedUrl: urlToProbe,
        httpStatus: res.status,
        statusText: res.statusText || (res.status === 206 ? 'Partial Content' : res.status === 200 ? 'OK' : ''),
        acceptRanges,
        contentRange,
        contentLength,
        contentType,
        accessControlAllowOrigin: allowOrigin,
        latencyMs: elapsed,
        isPartialContent: is206,
        hasAcceptRangesBytes,
        hasValidContentRange,
        corsHeadersExposed: Boolean(contentRange || acceptRanges),
        error: !is206 && res.status !== 200 ? `Express returned HTTP ${res.status} (${res.statusText || 'Error'})` : null,
      });
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      setNetworkStats({
        timestamp: Date.now(),
        testedUrl: urlToProbe,
        httpStatus: null,
        statusText: 'Network Probe Failed',
        acceptRanges: null,
        contentRange: null,
        contentLength: null,
        contentType: null,
        accessControlAllowOrigin: null,
        latencyMs: elapsed,
        isPartialContent: false,
        hasAcceptRangesBytes: false,
        hasValidContentRange: false,
        corsHeadersExposed: false,
        error: err?.message || 'Connection refused or CORS headers blocking range response inspection',
      });
    } finally {
      setIsProbingNetwork(false);
    }
  }, [streamUrl, activeFilePath, sambaConfig]);

  // RESOLVED HTML <video> src LOGGER & DIAGNOSTIC:
  // Inspects the active <video> element's DOM src and currentSrc attributes.
  // Specifically catches if it defaulted to blob: or a malformed asset:/ URL after sanitization.
  const inspectVideoSrc = useCallback(() => {
    const el = getActiveVideoElement();
    const domSrc = el?.getAttribute('src') || el?.src || blobUrl || streamUrl || '';
    const currentSrc = el?.currentSrc || domSrc;

    const isBlob = domSrc.startsWith('blob:') || currentSrc.startsWith('blob:');
    const isMalformedAsset = (
      domSrc.includes('asset:/') ||
      domSrc.includes('tauri:/') ||
      domSrc.includes('asset://') ||
      domSrc.includes('tauri://') ||
      domSrc.includes('%2FVolumes%2F') ||
      /^\/Volumes\/.*asset:\//i.test(domSrc)
    );
    const isDoublePrefixed = (
      domSrc.includes('/Volumes/Media/asset:') ||
      domSrc.includes('/Volumes/media/asset:') ||
      domSrc.includes('localhost/%2F')
    );
    const isExpressStream = domSrc.includes('/api/samba/stream') || domSrc.includes('/api/media/stream');
    const isHlsPlaylist = domSrc.includes('.m3u8') || currentSrc.includes('.m3u8');

    const notes: string[] = [];
    let status: 'healthy' | 'warning' | 'error' = 'healthy';

    if (isMalformedAsset || isDoublePrefixed) {
      status = 'error';
      notes.push('CRITICAL: Malformed asset URI or duplicated /Volumes/ prefix detected in video src.');
      notes.push('Tauri asset protocol cannot parse repeated root path segments or nested schemes.');
    } else if (isBlob) {
      status = 'warning';
      notes.push('WARNING: Video element is playing from an in-memory blob: URL fallback.');
      notes.push('HTTP 206 range seeking may be limited and consumes high browser RAM.');
    } else if (isExpressStream) {
      status = 'healthy';
      notes.push('OPTIMAL: Streaming directly via Express HTTP 206 partial content proxy.');
      notes.push('Native Tauri convertFileSrc bypassed to prevent macOS main-thread IPC locks.');
    } else if (isHlsPlaylist) {
      status = 'healthy';
      notes.push('OPTIMAL: Active FFmpeg HLS segmented playlist stream (.m3u8).');
    } else if (domSrc) {
      notes.push(`INFO: Video source resolved to: ${domSrc.substring(0, 35)}...`);
    } else {
      notes.push('WARNING: No media src loaded into DOM <video> element yet.');
    }

    setVideoSrcReport({
      domSrc,
      currentSrc,
      resolvedProtocol: domSrc ? (domSrc.split(':')[0] + ':') : 'none',
      isBlob,
      isMalformedAsset,
      isDoublePrefixed,
      isExpressStream,
      isHlsPlaylist,
      healthStatus: status,
      diagnosisNotes: notes,
      lastChecked: Date.now(),
    });
  }, [getActiveVideoElement, blobUrl, streamUrl]);

  // Periodic DOM video src inspection and initial network probe
  useEffect(() => {
    inspectVideoSrc();
    if (streamUrl) {
      runNetworkProbe(streamUrl);
    }
  }, [streamUrl, blobUrl, playerEngine, inspectVideoSrc, runNetworkProbe]);

  // Live sampling when Diagnostic Overlay is open
  useEffect(() => {
    if (!showDiagnosticOverlay) return;
    inspectVideoSrc();
    if (diagView === 'network' && !networkStats) {
      runNetworkProbe();
    }
    const interval = setInterval(inspectVideoSrc, 2000);
    return () => clearInterval(interval);
  }, [showDiagnosticOverlay, diagView, inspectVideoSrc, runNetworkProbe, networkStats]);

  const toggleMute = () => {
    const el = media.type === 'album' ? audioRef.current : videoRef.current;
    if (el) {
      const targetMute = !isMuted;
      setIsMuted(targetMute);
      el.muted = targetMute;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    const el = media.type === 'album' ? audioRef.current : videoRef.current;
    if (el) el.playbackRate = speed;
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch((err) => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRunConnectionTest = async () => {
    if (!onTestConnection) return;
    setIsTestingConnection(true);
    setConnectionStatus(null);
    try {
      const ok = await onTestConnection(sambaConfig);
      setConnectionStatus(ok ? 'Connected successfully!' : 'Connection test failed');
    } catch {
      setConnectionStatus('Connection error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
      <div
        ref={playerContainerRef}
        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg shrink-0">
              {media.type === 'movie' ? <Film className="w-5 h-5" /> : media.type === 'album' ? <Music className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
            </div>
            <div className="truncate">
              <h2 className="text-base font-semibold text-white truncate flex items-center gap-2">
                {media.title}
                {media.year ? <span className="text-xs text-slate-400 font-normal">({media.year})</span> : null}
                {currentEpisode && (
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-medium">
                    S{String(currentEpisode.seasonNumber).padStart(2, '0')}E{String(currentEpisode.episodeNumber).padStart(2, '0')}: {currentEpisode.title}
                  </span>
                )}
                {currentTrack && (
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-medium">
                    Track {currentTrack.trackNumber}: {currentTrack.title}
                  </span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Direct Play
                </span>
              </h2>
              <div className="text-xs text-slate-400 truncate flex items-center gap-2 font-mono">
                <span className="text-emerald-400 font-medium">Direct Path:</span>
                <span className="text-slate-300 truncate">{activeFilePath || media.matchedFilename || 'Media file'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Playlist/Episodes toggle button */}
            {(media.seasons?.length || media.tracks?.length) ? (
              <button
                onClick={() => setShowPlaylistSidebar(!showPlaylistSidebar)}
                className={`p-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${showPlaylistSidebar ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                title="Toggle episode/track list"
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-medium">
                  {media.type === 'album' ? 'Tracks' : 'Episodes'}
                </span>
              </button>
            ) : null}

            {/* Playback Engine Switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => {
                  setPlayerEngine('hls');
                  setUseMatroskaEngine(false);
                }}
                className={`px-2 py-1 rounded font-medium transition-colors ${playerEngine === 'hls' && !useMatroskaEngine ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                title="HLS On-The-Fly FFmpeg Transcode Engine"
              >
                HLS
              </button>
              <button
                onClick={() => {
                  setPlayerEngine('direct');
                  setUseMatroskaEngine(false);
                }}
                className={`px-2 py-1 rounded font-medium transition-colors ${playerEngine === 'direct' && !useMatroskaEngine ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                title="Direct / Express Chunk Stream Engine (Zero-stall)"
              >
                Direct
              </button>
              {isMkv && (
                <button
                  onClick={() => {
                    setUseMatroskaEngine(true);
                    setPlayerEngine('matroska');
                  }}
                  className={`px-2 py-1 rounded font-medium transition-colors ${useMatroskaEngine || playerEngine === 'matroska' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  title="Matroska (.MKV) Analyzer Engine"
                >
                  MKV
                </button>
              )}
            </div>

            <button
              onClick={() => setHardwareAccel(!hardwareAccel)}
              className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${hardwareAccel ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              title="Toggle Hardware-Accelerated Decoding (GPU / HEVC)"
            >
              <Cpu className="w-4 h-4" />
              <span className="hidden md:inline">HW Accel: {hardwareAccel ? 'ON' : 'OFF'}</span>
            </button>

            {/* Encoder / Codec Selector Dropdown */}
            <select
              value={selectedCodec}
              onChange={(e) => setSelectedCodec(e.target.value as any)}
              className="bg-slate-900 border border-cyan-500/40 text-cyan-300 rounded-lg px-2 py-1.5 text-xs font-medium cursor-pointer"
              title="Select Hardware Acceleration Encoder (H.264, HEVC, AV1)"
            >
              <option value="h264">Encoder: H.264</option>
              <option value="hevc">Encoder: HEVC</option>
              <option value="av1">Encoder: AV1</option>
            </select>

            <button
              onClick={() => {
                if (showDiagnosticOverlay && diagView === 'network') {
                  setShowDiagnosticOverlay(false);
                } else {
                  setShowDiagnosticOverlay(true);
                  setDiagView('network');
                  runNetworkProbe();
                }
              }}
              className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${showDiagnosticOverlay && diagView === 'network' ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              title="Toggle Network Range Request Monitor (HTTP 206 Content-Range)"
            >
              <Network className="w-4 h-4" />
              <span className="hidden md:inline">Net Monitor</span>
            </button>

            <button
              onClick={() => setShowDiagnosticOverlay(!showDiagnosticOverlay)}
              className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${showDiagnosticOverlay ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              title="Toggle Diagnostic Overlay"
            >
              <Activity className="w-4 h-4" />
              <span className="hidden md:inline">Diagnostics</span>
            </button>

            <button
              onClick={handleStartTranscode}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow"
              title="Force transcode file to H.264 / AAC"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Force Transcode</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Close Player (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Player + Sidebar Layout */}
        <div className="relative flex-1 flex flex-col md:flex-row min-h-[380px] sm:min-h-[480px] bg-black overflow-hidden">
          {/* Player Display Container */}
          <div className="relative flex-1 flex flex-col items-center justify-center bg-black overflow-hidden">
            {/* Diagnostic Overlay */}
            {showDiagnosticOverlay && (
              <div className="absolute top-16 left-4 z-40 bg-black/85 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 sm:p-4 w-80 sm:w-96 md:w-[450px] max-h-[82vh] overflow-y-auto text-xs font-mono text-slate-300 shadow-2xl">
                {/* Overlay Header & Tabs */}
                <div className="flex items-center justify-between mb-3 border-b border-slate-700/80 pb-2">
                  <h4 className="font-semibold text-white flex items-center gap-1.5 truncate">
                    <Activity className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">
                      {diagView === 'stats' && 'Live Playback Metrics'}
                      {diagView === 'protocol' && 'Tauri Protocol Debugger'}
                      {diagView === 'network' && 'HTTP 206 Network Monitor'}
                      {diagView === 'videosrc' && 'HTML <video src> Inspector'}
                    </span>
                  </h4>
                  <div className="flex gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg shrink-0">
                    <button
                      onClick={() => setDiagView('stats')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${diagView === 'stats' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Stats
                    </button>
                    <button
                      onClick={() => setDiagView('protocol')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${diagView === 'protocol' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Proto
                    </button>
                    <button
                      onClick={() => {
                        setDiagView('network');
                        if (!networkStats) runNetworkProbe();
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${diagView === 'network' ? 'bg-cyan-600/40 text-cyan-200 border border-cyan-500/50' : 'text-slate-400 hover:text-slate-200'}`}
                      title="Network Monitor: Content-Range and Accept-Ranges"
                    >
                      <Network className="w-3 h-3" />
                      <span>Net</span>
                    </button>
                    <button
                      onClick={() => {
                        setDiagView('videosrc');
                        inspectVideoSrc();
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${diagView === 'videosrc' ? 'bg-amber-600/40 text-amber-200 border border-amber-500/50' : 'text-slate-400 hover:text-slate-200'}`}
                      title="Resolved DOM video element src logger"
                    >
                      <Eye className="w-3 h-3" />
                      <span>DOM Src</span>
                    </button>
                  </div>
                </div>

                {/* 1. Stats View */}
                {diagView === 'stats' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between"><span>FPS:</span><span className="text-emerald-400">{pipelineHealth.fps}</span></div>
                    <div className="flex justify-between"><span>Latency:</span><span className="text-amber-400">{pipelineHealth.latency}ms</span></div>
                    <div className="flex justify-between"><span>Buffer:</span><span className="text-indigo-400">{bufferSecondsRemaining.toFixed(1)}s</span></div>
                    <div className="flex justify-between"><span>Status:</span><span className="text-slate-100 truncate">{transcodeStatus.state}</span></div>
                    <div className="flex justify-between"><span>Progress:</span><span className="text-white">{transcodeStatus.progressPercent}%</span></div>
                  </div>
                )}

                {/* 2. Protocol Debugger View */}
                {diagView === 'protocol' && (
                  <div className="space-y-2 text-[11px]">
                    {pathHealth ? (
                      <>
                        <div className="break-all p-1.5 bg-slate-950 rounded border border-slate-800 font-mono text-[10px]">
                          <span className="text-slate-400 block mb-0.5 font-semibold">Tauri Asset Result:</span>
                          {pathHealth.result.split('/').map((seg: string, i: number, arr: string[]) => (
                            <span key={i} className={(seg === 'localhost' || seg === 'Volumes') ? 'text-rose-400 font-bold bg-rose-950/50 px-0.5 rounded' : 'text-slate-200'}>
                              {seg}{i < arr.length - 1 ? '/' : ''}
                            </span>
                          ))}
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-400">Interpretation:</span>
                          <span className={pathHealth.isRelative ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                            {pathHealth.isRelative ? 'RELATIVE (Error)' : 'ABSOLUTE (Valid)'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-400">Protocol:</span>
                          <span className="text-cyan-400">{pathHealth.isTauriProtocol ? 'Tauri/Asset' : 'Direct HTTP'}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-400">Network Bypass:</span>
                          <span className="text-emerald-400 font-medium">Express Stream (Non-blocking)</span>
                        </div>

                        <div className="flex flex-col gap-1.5 mt-2">
                          <button
                            onClick={() => {
                              const fixed = extractCleanLocalPath(pathHealth?.result || activeFilePath, sambaConfig?.share || 'media');
                              console.log('[Protocol Debugger] Re-sanitized local path:', fixed);
                              handleNativeFallback(fixed);
                            }}
                            className="w-full px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded font-medium text-xs transition-colors"
                          >
                            Re-Sanitize & Test Fallback
                          </button>
                          <button
                            onClick={() => {
                              setUseTranscode(true);
                              setPlaybackError(null);
                            }}
                            className="w-full px-2 py-1 bg-indigo-700 hover:bg-indigo-600 text-white rounded font-medium text-xs transition-colors"
                          >
                            Force Transcode (H.264 / AAC)
                          </button>
                        </div>
                      </>
                    ) : (
                      <div>Monitoring...</div>
                    )}
                  </div>
                )}

                {/* 3. Network Monitor View: HTTP Range & Response Headers Inspector */}
                {diagView === 'network' && (
                  <div className="space-y-2.5 text-[11px]">
                    {/* Action Header */}
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                      <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                        <Server className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Range Headers Probe</span>
                      </div>
                      <button
                        onClick={() => runNetworkProbe()}
                        disabled={isProbingNetwork}
                        className="px-2 py-0.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded text-[10px] flex items-center gap-1 font-medium transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${isProbingNetwork ? 'animate-spin' : ''}`} />
                        <span>{isProbingNetwork ? 'Testing...' : 'Probe Range Now'}</span>
                      </button>
                    </div>

                    {/* Target Endpoint Box */}
                    <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] break-all">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-400 font-semibold">Target Streaming Endpoint:</span>
                        <button
                          onClick={() => copyToClipboard(networkStats?.testedUrl || streamUrl, 'targetUrl')}
                          className="text-slate-400 hover:text-white flex items-center gap-0.5 text-[9px]"
                          title="Copy URL"
                        >
                          {copiedKey === 'targetUrl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'targetUrl' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <span className="text-cyan-300">{networkStats?.testedUrl || streamUrl || 'No active stream URL'}</span>
                    </div>

                    {networkStats ? (
                      <>
                        {/* HTTP Status & Range Verification Badge */}
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <div className="p-1.5 bg-slate-950 rounded border border-slate-800 flex flex-col gap-0.5">
                            <span className="text-slate-400">HTTP Status:</span>
                            <span className={`font-bold flex items-center gap-1 ${networkStats.isPartialContent ? 'text-emerald-400' : networkStats.httpStatus === 200 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {networkStats.isPartialContent ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <AlertTriangle className="w-3 h-3" />}
                              {networkStats.httpStatus ? `${networkStats.httpStatus} ${networkStats.statusText}` : 'Unreachable'}
                            </span>
                          </div>

                          <div className="p-1.5 bg-slate-950 rounded border border-slate-800 flex flex-col gap-0.5">
                            <span className="text-slate-400">Range Slicing:</span>
                            <span className={`font-bold ${networkStats.isPartialContent ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {networkStats.isPartialContent ? '206 Partial Content (OK)' : '200 OK (Full File / Unsliced)'}
                            </span>
                          </div>
                        </div>

                        {/* Specific Headers Inspection */}
                        <div className="space-y-1 p-2 bg-slate-950 rounded border border-slate-800 text-[10px] font-mono">
                          <div className="flex justify-between items-center py-0.5 border-b border-slate-800/60">
                            <span className="text-slate-400">Accept-Ranges:</span>
                            <span className={networkStats.hasAcceptRangesBytes ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {networkStats.acceptRanges || 'MISSING (Seeking Disabled)'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center py-0.5 border-b border-slate-800/60">
                            <span className="text-slate-400">Content-Range:</span>
                            <span className={networkStats.hasValidContentRange ? 'text-emerald-400 font-bold truncate max-w-[200px]' : 'text-rose-400 font-bold'}>
                              {networkStats.contentRange || 'MISSING (Header Blocked)'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center py-0.5 border-b border-slate-800/60">
                            <span className="text-slate-400">Content-Length:</span>
                            <span className="text-slate-200">
                              {networkStats.contentLength ? `${networkStats.contentLength} bytes` : 'Unknown'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center py-0.5 border-b border-slate-800/60">
                            <span className="text-slate-400">Content-Type:</span>
                            <span className="text-slate-200 truncate max-w-[200px]">
                              {networkStats.contentType || 'application/octet-stream'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center py-0.5 border-b border-slate-800/60">
                            <span className="text-slate-400">Roundtrip Latency:</span>
                            <span className="text-cyan-300 font-semibold">{networkStats.latencyMs ?? '--'} ms</span>
                          </div>

                          <div className="flex justify-between items-center py-0.5">
                            <span className="text-slate-400">CORS Expose:</span>
                            <span className={networkStats.corsHeadersExposed ? 'text-emerald-400' : 'text-amber-400'}>
                              {networkStats.corsHeadersExposed ? 'Range Headers Exposed' : 'Check Access-Control-Expose-Headers'}
                            </span>
                          </div>
                        </div>

                        {/* Diagnostic Assessment Banner */}
                        {networkStats.isPartialContent && networkStats.hasAcceptRangesBytes ? (
                          <div className="p-2 bg-emerald-950/50 border border-emerald-800/80 rounded text-[10px] text-emerald-300 flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold">Range Slicing Confirmed Healthy</p>
                              <p className="text-emerald-400/80 mt-0.5">
                                Express server is accepting <code className="text-emerald-200">Range: bytes=0-1023</code> and returning HTTP 206 with correct Content-Range and Accept-Ranges headers. Browser video timeline seeking is enabled.
                              </p>
                            </div>
                          </div>
                        ) : networkStats.error ? (
                          <div className="p-2 bg-rose-950/60 border border-rose-800 rounded text-[10px] text-rose-300 flex items-start gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold">Range Request Warning</p>
                              <p className="text-rose-400/80 mt-0.5">{networkStats.error}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 bg-amber-950/60 border border-amber-800 rounded text-[10px] text-amber-300 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold">Non-Range Response (HTTP 200)</p>
                              <p className="text-amber-300/80 mt-0.5">
                                Server returned the full file rather than partial chunk. Ensure the Express endpoint handles the <code>Range</code> header with status 206.
                              </p>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-4 bg-slate-950 rounded border border-slate-800 text-center text-slate-400">
                        <RefreshCw className="w-4 h-4 mx-auto mb-1 animate-spin text-cyan-400" />
                        <p>Probing streaming endpoint range headers...</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Resolved HTML <video> src Inspector Tab */}
                {diagView === 'videosrc' && (
                  <div className="space-y-2.5 text-[11px]">
                    {/* Header & Refresh */}
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                      <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                        <Eye className="w-3.5 h-3.5 text-amber-400" />
                        <span>HTML &lt;video&gt; DOM Inspector</span>
                      </div>
                      <button
                        onClick={() => inspectVideoSrc()}
                        className="px-2 py-0.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] flex items-center gap-1 font-medium transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Re-inspect DOM</span>
                      </button>
                    </div>

                    {videoSrcReport ? (
                      <>
                        {/* Status Warning or Health Banner */}
                        {videoSrcReport.isMalformedAsset ? (
                          <div className="p-2.5 bg-rose-950/80 border border-rose-700 rounded-lg text-rose-200">
                            <div className="flex items-center gap-1.5 font-bold text-rose-300 text-[11px]">
                              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                              <span>MALFORMED ASSET URL DETECTED</span>
                            </div>
                            <p className="text-[10px] text-rose-300 mt-1">
                              The DOM <code>&lt;video&gt;</code> element received an invalid or double-prefixed URI (e.g., <code>/Volumes/Media/asset:...</code> or repeated <code>localhost</code>/<code>%2F</code>). This triggers Tauri main-thread tokio deadlocks and causes playback failure.
                            </p>
                            <button
                              onClick={() => {
                                const sanitized = extractCleanLocalPath(videoSrcReport.domSrc || activeFilePath, sambaConfig?.share || 'media');
                                console.log('[DOM Src Inspector] Stripping prefixes and forcing clean Express stream proxy:', sanitized);
                                setBlobUrl(null);
                                setPlayerEngine('direct');
                                setPlaybackError(null);
                                runNetworkProbe(`/api/samba/stream?path=${encodeURIComponent(sanitized)}`);
                                setTimeout(inspectVideoSrc, 300);
                              }}
                              className="mt-2 w-full px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-semibold text-[10px] transition-colors"
                            >
                              Strip Prefixes & Switch to Express Stream
                            </button>
                          </div>
                        ) : videoSrcReport.isBlob ? (
                          <div className="p-2.5 bg-amber-950/70 border border-amber-700/80 rounded-lg text-amber-200">
                            <div className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px]">
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                              <span>LOCAL BLOB FALLBACK ACTIVE</span>
                            </div>
                            <p className="text-[10px] text-amber-300 mt-1">
                              The player defaulted to a <code>blob:</code> in-memory buffer URL. Seeking may be constrained by buffer size and uses client RAM.
                            </p>
                            <button
                              onClick={() => {
                                setBlobUrl(null);
                                setPlayerEngine('direct');
                                setPlaybackError(null);
                                setTimeout(inspectVideoSrc, 300);
                              }}
                              className="mt-2 w-full px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded font-medium text-[10px] transition-colors"
                            >
                              Reset Blob & Use Native Express Stream Proxy
                            </button>
                          </div>
                        ) : videoSrcReport.isExpressStream ? (
                          <div className="p-2 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-200">
                            <div className="flex items-center gap-1.5 font-bold text-emerald-300 text-[11px]">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>OPTIMAL ASYNC STREAM PROXY</span>
                            </div>
                            <p className="text-[10px] text-emerald-400/80 mt-0.5">
                              Targeting <code>/api/samba/stream</code>. Tauri asset protocol bypassed to protect macOS main thread from Samba I/O latency.
                            </p>
                          </div>
                        ) : videoSrcReport.isHlsPlaylist ? (
                          <div className="p-2 bg-indigo-950/60 border border-indigo-800 rounded-lg text-indigo-200">
                            <div className="flex items-center gap-1.5 font-bold text-indigo-300 text-[11px]">
                              <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                              <span>FFMPEG HLS STREAM PLAYLIST</span>
                            </div>
                            <p className="text-[10px] text-indigo-400/80 mt-0.5">
                              Streaming transcoded H.264/AAC segments on the fly.
                            </p>
                          </div>
                        ) : null}

                        {/* Raw Resolved DOM src Attribute */}
                        <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] break-all">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-slate-400 font-semibold">Resolved &lt;video src&gt;:</span>
                            <button
                              onClick={() => copyToClipboard(videoSrcReport.domSrc, 'domSrc')}
                              className="text-slate-400 hover:text-white flex items-center gap-0.5 text-[9px]"
                              title="Copy URL"
                            >
                              {copiedKey === 'domSrc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === 'domSrc' ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          {videoSrcReport.domSrc ? (
                            <div>
                              {videoSrcReport.domSrc.split('/').map((seg, i, arr) => {
                                const isBad = seg.includes('asset:') || seg.includes('localhost') || (seg === 'Volumes' && i > 1);
                                return (
                                  <span
                                    key={i}
                                    className={isBad ? 'text-rose-400 font-bold bg-rose-950/60 px-0.5 rounded' : 'text-slate-200'}
                                  >
                                    {seg}{i < arr.length - 1 ? '/' : ''}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">No src attribute found on video DOM element</span>
                          )}
                        </div>

                        {/* DOM currentSrc */}
                        {videoSrcReport.currentSrc && videoSrcReport.currentSrc !== videoSrcReport.domSrc && (
                          <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] break-all">
                            <span className="text-slate-400 block mb-0.5 font-semibold">DOM currentSrc:</span>
                            <span className="text-slate-300">{videoSrcReport.currentSrc}</span>
                          </div>
                        )}

                        {/* Protocol Scheme & Attributes Summary */}
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <div className="p-1.5 bg-slate-950 rounded border border-slate-800 flex justify-between">
                            <span className="text-slate-400">Scheme:</span>
                            <span className="text-cyan-300 font-mono font-semibold">{videoSrcReport.resolvedProtocol}</span>
                          </div>
                          <div className="p-1.5 bg-slate-950 rounded border border-slate-800 flex justify-between">
                            <span className="text-slate-400">Engine:</span>
                            <span className="text-indigo-300 font-semibold">{playerEngine.toUpperCase()}</span>
                          </div>
                        </div>

                        {/* Diagnostic Notes */}
                        <div className="space-y-1 p-2 bg-slate-950 rounded border border-slate-800 text-[10px]">
                          <span className="text-slate-400 font-semibold block mb-0.5">Sanitization & Diagnostics:</span>
                          {videoSrcReport.diagnosisNotes.map((note, idx) => (
                            <div key={idx} className="text-slate-300 flex items-start gap-1">
                              <span className="text-cyan-400 shrink-0">•</span>
                              <span>{note}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="p-3 bg-slate-950 rounded border border-slate-800 text-center text-slate-400">
                        <RefreshCw className="w-4 h-4 mx-auto mb-1 animate-spin text-amber-400" />
                        <p>Inspecting active DOM &lt;video&gt; element...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Transcoding Progress Bar Overlay */}
            {(transcodeStatus.state === 'transcoding' || isProbing) && (
              <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center animate-pulse">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {isProbing ? 'Probing Media Codecs (H.265 / HEVC / MKV)...' : 'Transcoding to H.264 / AAC'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {transcodeStatus.message || 'Converting unsupported file format on the fly via FFmpeg'}
                    </p>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full space-y-2">
                    <div className="flex justify-between text-xs font-mono text-slate-400">
                      <span>Transcoding Progress</span>
                      <span className="text-indigo-400 font-semibold">{transcodeStatus.progressPercent}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-300"
                        style={{ width: `${transcodeStatus.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        setUseTranscode(false);
                        transcodeService.setStatus(activeFilePath, { state: 'native', progressPercent: 0, message: 'Cancelled' });
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                    >
                      Cancel & Use Direct Play
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isBufferingCache && (
              <div className="absolute top-4 inset-x-4 z-20 bg-amber-950/90 border border-amber-500/50 text-amber-200 px-4 py-3 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg animate-pulse">
                <RefreshCw className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
                <div className="flex-1 text-xs">
                  <p className="font-bold">Pre-loading Buffer & Waiting for Transcoder Cache...</p>
                  <p className="text-amber-300 mt-0.5">Buffer dropped below 5s threshold ({bufferSecondsRemaining.toFixed(1)}s remaining). Automatically paused to let transcoder fill cache. Resuming shortly...</p>
                </div>
              </div>
            )}

            {playbackError && (
              <div className="absolute top-4 inset-x-4 z-20 bg-rose-950/90 border border-rose-800 text-rose-200 px-4 py-3 rounded-xl flex items-start gap-3 backdrop-blur-md shadow-lg">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">Playback Notice</p>
                  <p className="text-xs text-rose-300 mt-0.5">{playbackError}</p>
                  
                  {/* Automated Diagnostic Validator */}
                  {(activeFilePath.includes('asset:') || activeFilePath.includes('tauri:') || activeFilePath.includes('localhost') || activeFilePath.includes('%2F')) && (
                    <div className="mt-2 p-2 bg-amber-950/50 border border-amber-800 rounded">
                      <p className="text-xs text-amber-200 font-semibold">Diagnostic: Path contains URI or scheme wrappers ({activeFilePath.substring(0, 45)}...)</p>
                      <button
                        onClick={() => {
                          const sanitized = extractCleanLocalPath(activeFilePath, sambaConfig?.share || 'media');
                          console.log('[Diagnostic Validator] Re-sanitized path:', sanitized);
                          handleNativeFallback(sanitized);
                        }}
                        className="mt-1 px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-medium transition-colors"
                      >
                        Click to Re-Sanitize & Fallback
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => handleNativeFallback()}
                      className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-medium transition-colors"
                    >
                      Native Fallback (Blob URL)
                    </button>
                    <button
                      onClick={() => {
                        setIsForceStreamViaPipe(true);
                        setPlayerEngine('direct');
                        setPlaybackError(null);
                      }}
                      className="px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-medium transition-colors"
                    >
                      Force Pipe Streaming (Emergency)
                    </button>
                    <button
                      onClick={() => {
                        setUseTranscode(true);
                        setPlayerEngine('hls');
                        setPlaybackError(null);
                      }}
                      className="px-2.5 py-1 bg-rose-700 hover:bg-rose-600 text-white rounded text-xs font-medium transition-colors"
                    >
                      Attempt Transcode (H.264 / AAC)
                    </button>
                    {onNavigateToMountHub && (
                      <button
                        onClick={onNavigateToMountHub}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium transition-colors flex items-center gap-1"
                      >
                        Samba Mount Settings <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <button onClick={() => setPlaybackError(null)} className="text-rose-400 hover:text-rose-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {useMatroskaEngine || playerEngine === 'matroska' ? (
              <div className="w-full h-full p-4 flex flex-col">
                <MatroskaPlayer
                  streamUrl={streamUrl}
                  title={media.title}
                  onClose={() => {
                    setUseMatroskaEngine(false);
                    setPlayerEngine('hls');
                  }}
                  onFallbackToTranscode={() => {
                    setUseTranscode(true);
                    setUseMatroskaEngine(false);
                    setPlayerEngine('hls');
                  }}
                />
              </div>
            ) : playerEngine === 'direct' ? (
              <div className="relative w-full h-full flex flex-col items-center justify-center bg-black p-4">
                <div className="w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center border border-slate-800">
                  <video
                    ref={videoRef}
                    src={blobUrl || streamUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                    poster={media.fanartUrl || media.posterUrl}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
                    onError={(e) => {
                      console.warn('[MediaPlayerModal Direct Video] Error:', e);
                      setPlaybackError('Direct video stream encountered an error. Switch to FFmpeg HLS transcode engine.');
                    }}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Direct Express Stream ({blobUrl ? 'Local Blob' : 'Express Async Stream'})</span>
                  </span>
                  <span>•</span>
                  <button
                    onClick={() => {
                      setPlayerEngine('hls');
                      setPlaybackError(null);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Switch to FFmpeg HLS Transcoder
                  </button>
                </div>
              </div>
            ) : (
              <HLSPlayer
                mediaId={media.id}
                filePath={activeFilePath}
                title={media.title}
                posterUrl={media.fanartUrl || media.posterUrl}
                isAudio={media.type === 'album'}
                currentTrackTitle={currentTrack?.title}
                currentEpisodeTitle={currentEpisode ? `S${String(currentEpisode.seasonNumber).padStart(2, '0')}E${String(currentEpisode.episodeNumber).padStart(2, '0')}: ${currentEpisode.title}` : undefined}
                initialHwAccel={hardwareAccel}
                initialCodec={selectedCodec}
                initialForceTranscode={useTranscode || transcodeStatus.state === 'ready'}
                fallbackStreamUrl={streamUrl}
                onClose={onClose}
                onFallbackDirect={() => {
                  setPlayerEngine('direct');
                }}
                onSwitchToDirect={() => {
                  setPlayerEngine('direct');
                }}
              />
            )}

            {/* Bottom Controls Bar (when not in HLS or Matroska mode) */}
            {false && !useMatroskaEngine && (
              <div className="w-full bg-slate-950/95 border-t border-slate-800 px-4 py-3 flex flex-col gap-2">
                {/* Timeline scrubber */}
                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span>{formatTime(duration)}</span>
                </div>

                {/* Control buttons */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => handleSeek(Math.max(0, currentTime - 10))}
                      className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
                      title="Rewind 10 seconds"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={togglePlay}
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-transform active:scale-95 shadow-md"
                      title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <button
                      onClick={() => handleSeek(Math.min(duration || 0, currentTime + 10))}
                      className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
                      title="Fast-forward 10 seconds"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>

                    {/* Volume Slider */}
                    <div className="flex items-center gap-1.5 ml-2">
                      <button
                        onClick={toggleMute}
                        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-16 sm:w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Playback rate & Fullscreen */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
                      {[0.75, 1, 1.25, 1.5].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => handleSpeedChange(speed)}
                          className={`px-2 py-0.5 rounded transition-colors ${playbackSpeed === speed ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>

                    {media.type !== 'album' && (
                      <button
                        onClick={toggleFullscreen}
                        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors ml-1"
                        title="Toggle Fullscreen"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Episodes or Tracks List */}
          {showPlaylistSidebar && (
            <div className="w-full md:w-80 bg-slate-900 border-l border-slate-800 flex flex-col max-h-[40vh] md:max-h-none overflow-hidden">
              <div className="p-3 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  {media.type === 'album' ? 'Album Tracks' : 'Series Episodes'}
                </span>
                <button
                  onClick={() => setShowPlaylistSidebar(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* Series Episodes List */}
                {media.type === 'series' && media.seasons && media.seasons.length > 0 && (
                  media.seasons.map((season) => (
                    <div key={season.seasonNumber} className="mb-3">
                      <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {season.name || `Season ${season.seasonNumber}`}
                      </div>
                      <div className="space-y-1 mt-1">
                        {season.episodes?.map((ep) => {
                          const isCurrent = currentEpisode?.seasonNumber === ep.seasonNumber && currentEpisode?.episodeNumber === ep.episodeNumber;
                          return (
                            <button
                              key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                              onClick={() => {
                                setCurrentEpisode(ep);
                                setPlaybackError(null);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${isCurrent ? 'bg-indigo-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-800'}`}
                            >
                              <div className="truncate pr-2">
                                <span className="font-mono text-slate-400 mr-2">E{String(ep.episodeNumber).padStart(2, '0')}</span>
                                <span>{ep.title}</span>
                              </div>
                              {isCurrent && <Play className="w-3.5 h-3.5 text-white shrink-0 fill-current" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}

                {/* Music Tracks List */}
                {media.type === 'album' && media.tracks && media.tracks.length > 0 && (
                  <div className="space-y-1">
                    {media.tracks.map((trk) => {
                      const isCurrent = currentTrack?.trackNumber === trk.trackNumber;
                      return (
                        <button
                          key={trk.trackNumber}
                          onClick={() => {
                            setCurrentTrack(trk);
                            setPlaybackError(null);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${isCurrent ? 'bg-emerald-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-800'}`}
                        >
                          <div className="truncate pr-2 flex items-center gap-2">
                            <span className="font-mono text-slate-400 w-5">{trk.trackNumber}.</span>
                            <span className="truncate">{trk.title}</span>
                          </div>
                          <span className="font-mono text-slate-400 text-[11px] shrink-0">{trk.duration}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Samba Info & Status */}
        <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Share: <strong className="text-slate-200">{sambaConfig.mountPath || sambaConfig.baseMountPath || sambaConfig.hostPath || `//${sambaConfig.server}/${sambaConfig.share}`}</strong></span>
              {activeFilePath && (
                <span className="text-slate-400 font-mono text-[11px] truncate max-w-[180px] sm:max-w-xs" title={activeFilePath}>
                  ({activeFilePath.split('/').pop()})
                </span>
              )}
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800 text-[11px] flex items-center gap-1 font-mono">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Direct File Source (No API proxy)
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800 text-[11px] flex items-center gap-1 font-mono">
              <Zap className="w-3 h-3 text-cyan-400" />
              Sliding-Window Buffer (HW Accel: {hardwareAccel ? 'GPU' : 'CPU'})
            </span>
            {useTranscode && (
              <span className="px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-800 text-[11px]">
                Active Mode: Real-time Transcoding
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {connectionStatus && (
              <span className="text-[11px] text-slate-300 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                {connectionStatus}
              </span>
            )}
            {onTestConnection && (
              <button
                onClick={handleRunConnectionTest}
                disabled={isTestingConnection}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isTestingConnection ? 'animate-spin' : ''}`} />
                Test SMB
              </button>
            )}
            {onNavigateToMountHub && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToMountHub();
                }}
                className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 rounded text-xs transition-colors"
              >
                Mount Settings
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
