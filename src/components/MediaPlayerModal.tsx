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
} from 'lucide-react';
import {
  MediaMetadata,
  MediaType,
  EpisodeMetadata,
  TrackMetadata,
  SambaConfig,
} from '../types';
import { MatroskaPlayer } from './MatroskaPlayer';
import { getDirectMediaPlayUrl } from '../utils/directMediaPlay';

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
  transcodeConfig?: any;
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync initial episode or track when props change
  useEffect(() => {
    setCurrentEpisode(initialEpisode);
  }, [initialEpisode]);

  useEffect(() => {
    setCurrentTrack(initialTrack);
  }, [initialTrack]);

  // Determine active media path
  const activeFilePath = useMemo(() => {
    if (media.type === 'album') {
      if (currentTrack?.playbackUrl) return currentTrack.playbackUrl;
      return media.playbackUrl || media.path || '';
    }
    if (media.type === 'series') {
      if (currentEpisode?.playbackUrl) return currentEpisode.playbackUrl;
      if (currentEpisode?.filePath) return currentEpisode.filePath;
      return media.playbackUrl || media.path || '';
    }
    return media.playbackUrl || media.path || '';
  }, [media, currentEpisode, currentTrack]);

  const isMkv = useMemo(() => {
    const p = (activeFilePath || media.matchedFilename || '').toLowerCase();
    return p.endsWith('.mkv') || p.includes('.mkv?');
  }, [activeFilePath, media.matchedFilename]);

  // Build the direct playback URL directly from the file path (not via the API)
  const streamUrl = useMemo(() => {
    if (!activeFilePath) return '';
    if (useTranscode) {
      return `/api/samba/transcode?path=${encodeURIComponent(activeFilePath)}`;
    }
    return getDirectMediaPlayUrl(activeFilePath, sambaConfig);
  }, [activeFilePath, sambaConfig, useTranscode]);

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
            {playbackError && (
              <div className="absolute top-4 inset-x-4 z-20 bg-rose-950/90 border border-rose-800 text-rose-200 px-4 py-3 rounded-xl flex items-start gap-3 backdrop-blur-md shadow-lg">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">Playback Notice</p>
                  <p className="text-xs text-rose-300 mt-0.5">{playbackError}</p>
                  <div className="flex items-center gap-3 mt-2">
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
            ) : media.type === 'album' ? (
              // Audio Player UI with Cover Art
              <div className="flex flex-col items-center justify-center p-8 w-full max-w-md text-center">
                <div className="relative w-48 h-48 sm:w-64 sm:h-64 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 mb-6 group">
                  <img
                    src={media.posterUrl || media.fanartUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80'}
                    alt={media.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80" />
                </div>
                <h3 className="text-xl font-bold text-white truncate max-w-full">
                  {currentTrack?.title || media.title}
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  {currentTrack?.artist || (media.artists && media.artists[0]) || media.studio || 'Album Track'}
                </p>

                <audio
                  ref={audioRef}
                  src={streamUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                  onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
                  onError={() => {
                    setPlaybackError('Direct audio streaming could not find the file at this network share path.');
                  }}
                  autoPlay
                />
              </div>
            ) : (
              // Video Player UI
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                <video
                  ref={videoRef}
                  src={streamUrl}
                  poster={media.fanartUrl || media.posterUrl}
                  className="w-full h-full max-h-[70vh] object-contain"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                  onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
                  onError={() => {
                    setPlaybackError('The browser could not play this video format directly. Try clicking "Attempt Transcode" or use the MKV Inspector.');
                  }}
                  onClick={togglePlay}
                  autoPlay
                />
              </div>
            )}

            {/* Bottom Controls Bar (when not in Matroska inspector mode) */}
            {!useMatroskaEngine && (
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
              <span>Share: <strong className="text-slate-200">//{sambaConfig.server}/{sambaConfig.share}</strong></span>
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800 text-[11px] flex items-center gap-1 font-mono">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Direct File Source (No API proxy)
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
