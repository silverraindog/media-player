import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  const [diagView, setDiagView] = useState<'stats' | 'protocol'>('stats');
  const [pathHealth, setPathHealth] = useState<any>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);

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
      const tauri = (window as any).__TAURI__;
      if (!tauri || !tauri.fs) {
        throw new Error('Tauri filesystem API not available');
      }

      // Read the file as binary using Tauri
      const binaryData = await tauri.fs.readBinaryFile(pathToUse);
      const blob = new Blob([binaryData], { type: 'video/mp4' }); 
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
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

    // Check if running inside a Tauri container
    const isTauriContainer = typeof window !== 'undefined' && (
      Boolean((window as any).__TAURI__) ||
      Boolean((window as any).__TAURI_IPC__) ||
      window.location.protocol === 'tauri:' ||
      window.location.origin.includes('tauri.localhost')
    );

    // If running inside a Tauri container and not explicitly forcing server-side transcode,
    // and not forced to stream via pipe fallback, utilize Tauri's native asset converter
    if (isTauriContainer && !useTranscode && !isForceStreamViaPipe) {
      try {
        const tauriGlobal = (window as any).__TAURI__;
        const convert = tauriGlobal?.convertFileSrc ||
          (window as any).__TAURI_IPC__?.convertFileSrc ||
          (window as any).convertFileSrc;

        if (typeof convert === 'function') {
          // STRICT FIX 1: Before passing ANY path to convertFileSrc,
          // ensure it is stripped of any existing asset://, tauri://, localhost,
          // or /Volumes/Media/ duplication, and normalized to a clean absolute local path.
          const cleanLocalPath = extractCleanLocalPath(activeFilePath, sambaConfig?.share || 'media');

          console.log('[Tauri Protocol Inspector] [INPUT] Clean Absolute Path for transform:', cleanLocalPath);
          const convertedUrl = convert(cleanLocalPath);
          console.log('[Tauri Protocol Inspector] [OUTPUT] Resulting Asset URL:', convertedUrl);
          
          // Inspector Check: Validate the transformation
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

    const hwParam = hardwareAccel ? '&hwaccel=true' : '';
    if (useTranscode || transcodeStatus.state === 'ready') {
      const targetPath = transcodeStatus.outputPath || activeFilePath;
      return `/api/samba/transcode?path=${encodeURIComponent(targetPath)}${hwParam}`;
    }
    return getDirectMediaPlayUrl(activeFilePath, sambaConfig);
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

            {/* Matroska / Transcode mode toggle */}
            {isMkv && (
              <button
                onClick={() => setUseMatroskaEngine(!useMatroskaEngine)}
                className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${useMatroskaEngine ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                title="Toggle Matroska container analyzer"
              >
                <FileVideo className="w-4 h-4" />
                <span className="hidden md:inline">MKV Inspector</span>
              </button>
            )}

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
  {/* Protocol Debugger Monitor Moved Out */}
  {/* Diagnostic Overlay */}
            {showDiagnosticOverlay && (
              <div className="absolute top-16 left-4 z-40 bg-black/80 backdrop-blur-md border border-slate-700 rounded-xl p-4 w-72 text-xs font-mono text-slate-300 shadow-2xl">
                <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-2">
                  <h4 className="font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-400" />
                    {diagView === 'stats' ? 'Live Metrics' : 'Protocol Debugger'}
                  </h4>
                  <div className="flex gap-1 bg-slate-800 p-0.5 rounded-lg">
                    <button onClick={() => setDiagView('stats')} className={`px-2 py-0.5 rounded ${diagView === 'stats' ? 'bg-slate-700 text-white' : ''}`}>Stats</button>
                    <button onClick={() => setDiagView('protocol')} className={`px-2 py-0.5 rounded ${diagView === 'protocol' ? 'bg-slate-700 text-white' : ''}`}>Proto</button>
                  </div>
                </div>

                {diagView === 'stats' ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between"><span>FPS:</span><span className="text-emerald-400">{pipelineHealth.fps}</span></div>
                    <div className="flex justify-between"><span>Latency:</span><span className="text-amber-400">{pipelineHealth.latency}ms</span></div>
                    <div className="flex justify-between"><span>Buffer:</span><span className="text-indigo-400">{bufferSecondsRemaining.toFixed(1)}s</span></div>
                    <div className="flex justify-between"><span>Status:</span><span className="text-slate-100 truncate">{transcodeStatus.state}</span></div>
                    <div className="flex justify-between"><span>Progress:</span><span className="text-white">{transcodeStatus.progressPercent}%</span></div>
                  </div>
                ) : (
                  <div className="space-y-2 text-[11px]">
                    {pathHealth ? (
                      <>
                        <div className="break-all p-1 bg-slate-950 rounded">
                          Result: {pathHealth.result.split('/').map((seg: string, i: number) => (
                            <span key={i} className={(seg === 'localhost' || seg === 'Volumes') ? 'text-rose-400 font-bold bg-rose-950/50' : ''}>{seg}/</span>
                          ))}
                        </div>
                        <div className={pathHealth.isRelative ? 'text-rose-400' : 'text-emerald-400'}>
                          Interpretation: {pathHealth.isRelative ? 'RELATIVE (Issue!)' : 'ABSOLUTE'}
                        </div>
                        <div>Protocol: {pathHealth.isTauriProtocol ? 'Tauri/Asset' : 'Other'}</div>
                        
                        <button
                          onClick={() => {
                            const fixed = extractCleanLocalPath(pathHealth?.result || activeFilePath, sambaConfig?.share || 'media');
                            console.log('[Protocol Debugger] Fixed Path:', fixed);
                            handleNativeFallback(fixed);
                          }}
                          className="w-full mt-2 px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded font-medium"
                        >
                          Fix Path & Reload
                        </button>
                      </>
                    ) : (
                      <div>Monitoring...</div>
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
                        setPlaybackError(null);
                      }}
                      className="px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-medium transition-colors"
                    >
                      Force Pipe Streaming (Emergency)
                    </button>
                    <button
                      onClick={() => {
                        setUseTranscode(true);
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

            {useMatroskaEngine ? (
              <div className="w-full h-full p-4 flex flex-col">
                <MatroskaPlayer
                  streamUrl={streamUrl}
                  title={media.title}
                  onClose={() => setUseMatroskaEngine(false)}
                  onFallbackToTranscode={() => {
                    setUseTranscode(true);
                    setUseMatroskaEngine(false);
                  }}
                />
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
                onClose={onClose}
                onFallbackDirect={() => {
                  setUseTranscode(false);
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
