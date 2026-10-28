import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  Sliders,
  Cpu,
  Layers,
  AlertTriangle,
  RefreshCw,
  Film,
  Music,
  Tv,
  CheckCircle2,
  Info,
  ChevronDown
} from 'lucide-react';
import { logger } from '../utils/loggerService';

export interface StreamProbeData {
  format: {
    format_name: string;
    format_long_name?: string;
    duration: number;
    size: number;
    bit_rate?: number;
  };
  video?: {
    codec_name: string;
    codec_long_name?: string;
    profile?: string;
    width: number;
    height: number;
    pix_fmt?: string;
    r_frame_rate?: string;
    fps?: number;
    bit_rate?: number;
  };
  audio?: {
    codec_name: string;
    codec_long_name?: string;
    channels?: number;
    sample_rate?: number;
    bit_rate?: number;
    channel_layout?: string;
  };
  audioStreams?: Array<{
    index: number;
    audioIndex: number;
    codec_name: string;
    codec_long_name?: string;
    channels?: number;
    sample_rate?: number;
    bit_rate?: number;
    channel_layout?: string;
    tags?: {
      language?: string;
      title?: string;
      [key: string]: any;
    };
  }>;
  subtitleStreams?: Array<{
    index: number;
    codec_name: string;
    codec_long_name?: string;
    tags?: {
      language?: string;
      title?: string;
      [key: string]: any;
    };
  }>;
  chapters?: Array<{
    id: number;
    start_time: number;
    end_time: number;
    tags?: {
      title?: string;
      [key: string]: any;
    };
  }>;
  needsVideoTranscode: boolean;
  needsAudioTranscode: boolean;
  needsTranscoding: boolean;
  reasons: string[];
}

interface HLSPlayerProps {
  mediaId: string;
  filePath?: string;
  title: string;
  posterUrl?: string;
  isAudio?: boolean;
  currentTrackTitle?: string;
  currentEpisodeTitle?: string;
  initialPreset?: string;
  initialHwAccel?: boolean;
  initialCodec?: string;
  initialForceTranscode?: boolean;
  onClose?: () => void;
  onFallbackDirect?: () => void;
}

export const HLSPlayer: React.FC<HLSPlayerProps> = ({
  mediaId,
  filePath,
  title,
  posterUrl,
  isAudio = false,
  currentTrackTitle,
  currentEpisodeTitle,
  initialPreset = '',
  initialHwAccel = false,
  initialCodec = 'h264',
  initialForceTranscode = false,
  onClose,
  onFallbackDirect,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);

  // Stream & probe state
  const [probeData, setProbeData] = useState<StreamProbeData | null>(null);
  const [probeLoading, setProbeLoading] = useState(true);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [resolvedSourcePath, setResolvedSourcePath] = useState<string>(filePath || '');

  // Keep resolvedSourcePath in sync with filePath prop
  useEffect(() => {
    if (filePath) setResolvedSourcePath(filePath);
  }, [filePath]);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showProbeDetails, setShowProbeDetails] = useState(false);

  // Transcoding presets & HW accel & Audio Track & Subtitle Track configuration
  const [activePreset, setActivePreset] = useState<string>(initialPreset);
  const [hwAccel, setHwAccel] = useState<boolean>(initialHwAccel);
  const [activeCodec, setActiveCodec] = useState<string>(initialCodec);
  const [forceTranscode, setForceTranscode] = useState<boolean>(initialForceTranscode);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number>(0);
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<number>(-1); // -1 = Disabled
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0); // ms
  const [retryCount, setRetryCount] = useState<number>(0);
  const [forceRemount, setForceRemount] = useState<number>(0);
  const [hlsStatus, setHlsStatus] = useState<'initializing' | 'streaming' | 'buffering' | 'error'>('initializing');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const [restartNonce, setRestartNonce] = useState<number>(0);
  const lastKnownTimeRef = useRef<number>(0);
  const initialSeekPendingRef = useRef<number | null>(null);
  const lastFailureTimestampRef = useRef<number>(0);
  const mediaRecoveryAttemptsRef = useRef<number>(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch backend ffprobe metadata for this file
  const fetchProbeData = useCallback(async () => {
    if (!mediaId && !filePath && !resolvedSourcePath) return;
    setProbeLoading(true);
    setProbeError(null);
    try {
      const targetP = resolvedSourcePath || filePath;
      const qPath = targetP ? `?path=${encodeURIComponent(targetP)}` : '';
      const res = await fetch(`/api/media/stream/${encodeURIComponent(mediaId)}/probe${qPath}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.probe) {
        setProbeData(data.probe);
      }
      if (data.filePath && !resolvedSourcePath) {
        setResolvedSourcePath(data.filePath);
      }
    } catch (err: any) {
      console.warn('[HLSPlayer] ffprobe fetch error:', err);
      setProbeError(err.message || 'Could not probe media streams');
    } finally {
      setProbeLoading(false);
    }
  }, [mediaId, filePath, resolvedSourcePath]);

  useEffect(() => {
    fetchProbeData();
  }, [fetchProbeData]);

  // Reset retry count when media changes
  useEffect(() => {
    setRetryCount(0);
    lastKnownTimeRef.current = 0;
    initialSeekPendingRef.current = null;
    setStreamError(null);
  }, [mediaId]);

  // Safe seek helper: avoids out-of-bounds seeks that crash HTMLMediaElement pipelines
  const safeSeek = useCallback((targetTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (isNaN(targetTime) || !isFinite(targetTime) || targetTime < 0) return;

    const maxDuration = video.duration && isFinite(video.duration) && video.duration > 0
      ? Math.max(0, video.duration - 0.5)
      : (probeData?.format?.duration ? Math.max(0, probeData.format.duration - 0.5) : targetTime);

    const clamped = Math.min(targetTime, maxDuration);
    try {
      video.currentTime = clamped;
      setCurrentTime(clamped);
      lastKnownTimeRef.current = clamped;
    } catch (e) {
      console.warn('[HLSPlayer] Safe seek warning:', e);
    }
  }, [probeData]);

  // Fetch settings on mount (stores initial timestamp in pending ref without crashing video element)
  useEffect(() => {
    fetch(`/api/media/settings/${encodeURIComponent(mediaId)}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.settings) {
          setSubtitleOffset(d.settings.subtitle_offset_ms || 0);
          if (d.settings.last_watched_seconds > 0) {
            initialSeekPendingRef.current = d.settings.last_watched_seconds;
          }
        }
      })
      .catch(e => console.warn('Failed to fetch media settings', e));
  }, [mediaId]);

  // Save settings (debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`/api/media/settings/${encodeURIComponent(mediaId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitleOffsetMs: subtitleOffset,
          lastWatchedSeconds: Math.floor(currentTime)
        })
      }).catch(e => console.warn('Failed to save media settings', e));
    }, 1000);
    return () => clearTimeout(timer);
  }, [subtitleOffset, currentTime, mediaId]);

  // Playback stabilization monitor: resets retryCount after 4 seconds of uninterrupted playing
  useEffect(() => {
    if (!isPlaying || isRecovering || hlsStatus !== 'streaming') return;
    const timer = setTimeout(() => {
      mediaRecoveryAttemptsRef.current = 0;
      setRetryCount((prev) => {
        if (prev > 0) {
          console.log('[HLSPlayer] Stream stabilized without errors. Resetting retry count.');
          return 0;
        }
        return prev;
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [isPlaying, isRecovering, hlsStatus]);

  // Stream failure auto-recovery state machine
  const handleStreamFailure = useCallback(async (reason: string = 'Stream stall') => {
    const now = Date.now();
    // Debounce duplicate triggers within 2000ms
    if (now - lastFailureTimestampRef.current < 2000) {
      return;
    }
    lastFailureTimestampRef.current = now;

    if (videoRef.current && videoRef.current.currentTime > 0) {
      lastKnownTimeRef.current = videoRef.current.currentTime;
    }
    console.warn(`[HLSPlayer] Stream failure: ${reason}. Retry attempt: ${retryCount + 1}/3`);
    logger.warn(`[FFmpeg HLS Transcode] Stream interruption: ${reason} (Attempt ${retryCount + 1}/3)`, 'Transcode');

    // If max retries reached, halt auto-recovery loop and show actionable error UI
    if (retryCount >= 2) {
      console.error('[HLSPlayer] Maximum recovery retries reached (3). Halting auto-recovery loop.');
      logger.error(`[FFmpeg HLS Transcode Error] Transcode session failed after 3 recovery attempts: ${reason}`, 'Transcode', { mediaId, title });
      setIsRecovering(false);
      setHlsStatus('error');
      setStreamError('Playback interrupted: stream decoding or network error persisted after 3 recovery attempts. The source media or transcode settings may need adjustment.');
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
      return;
    }

    const nextCount = retryCount + 1;
    setRetryCount(nextCount);
    setIsRecovering(true);
    setHlsStatus('initializing');

    // On recovery, automatically fall back to software H.264 transcoding
    if (activeCodec !== 'h264') {
      console.warn('[HLSPlayer] Stream recovery: Switching codec from', activeCodec, 'to h264 for maximum compatibility');
      setActiveCodec('h264');
    }
    if (hwAccel) {
      console.warn('[HLSPlayer] Stream recovery: Disabling hardware acceleration for retry attempt', nextCount);
      setHwAccel(false);
    }
    setForceTranscode(true);

    // Force video element re-creation on attempt 2 to purge corrupted WebGL/decoder pipeline
    if (nextCount >= 2) {
      setForceRemount(prev => prev + 1);
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    }

    try {
      await fetch(`/api/media/stream/${encodeURIComponent(mediaId)}/stop`, {
        method: 'POST',
        keepalive: true,
      });
    } catch {}

    setTimeout(() => {
      setStreamError(null);
      setRestartNonce((prev) => prev + 1);
      setIsRecovering(false);
    }, 1200);
  }, [mediaId, hwAccel, retryCount]);

  // 2. Build HLS Master stream URL with explicit /index.m3u8 path
  const streamSrc = useMemo(() => {
    const params = new URLSearchParams();
    const effectivePath = resolvedSourcePath || filePath;
    if (effectivePath) params.set('path', effectivePath);
    if (activePreset) params.set('preset', activePreset);
    if (hwAccel) params.set('hwaccel', 'true');
    if (activeCodec) params.set('codec', activeCodec);
    if (forceTranscode || retryCount > 0) params.set('forceTranscode', 'true');
    if (activeAudioTrack > 0) params.set('audioTrack', String(activeAudioTrack));
    params.set('nonce', String(restartNonce));
    const qs = params.toString();
    return `/api/media/stream/${encodeURIComponent(mediaId)}/index.m3u8${qs ? `?${qs}` : ''}`;
  }, [mediaId, resolvedSourcePath, filePath, activePreset, hwAccel, activeCodec, forceTranscode, retryCount, activeAudioTrack, restartNonce]);

  // 3. Initialize HLS.js or native HLS video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamSrc) return;

    setHlsStatus('initializing');
    setStreamError(null);

    // Timeout safety: if stuck in 'initializing' for > 4.5s, transition to 'streaming'
    const initTimer = setTimeout(() => {
      setHlsStatus((prev) => (prev === 'initializing' ? 'streaming' : prev));
    }, 4500);

    // Destroy existing instance if preset or params changed
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        fragLoadingTimeOut: 30000,
        manifestLoadingTimeOut: 20000,
        levelLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 8,
        manifestLoadingMaxRetry: 8,
        fragLoadingMaxRetryTimeout: 10000,
        maxBufferHole: 0.8,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 5,
        startPosition: 0,
      });

      // Bind media first, then load source on MEDIA_ATTACHED
      hls.attachMedia(video);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(streamSrc);
      });

      hls.on(Hls.Events.MANIFEST_LOADED, () => {
        setHlsStatus('streaming');
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsStatus('streaming');
        video.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_e, data) => {
        setHlsStatus('streaming');
        if (data.details && data.details.totalduration) {
          setDuration(data.details.totalduration);
        }
        // Only seek if the target timestamp is already within the loaded/generated duration
        const totalAvail = data.details?.totalduration || 0;
        if (initialSeekPendingRef.current !== null && initialSeekPendingRef.current > 0) {
          const seekTo = initialSeekPendingRef.current;
          if (totalAvail > 0 && seekTo <= totalAvail) {
            initialSeekPendingRef.current = null;
            safeSeek(seekTo);
          }
        } else if (lastKnownTimeRef.current > 0 && Math.abs(video.currentTime - lastKnownTimeRef.current) > 2) {
          if (totalAvail > 0 && lastKnownTimeRef.current <= totalAvail) {
            safeSeek(lastKnownTimeRef.current);
          }
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        setHlsStatus('streaming');
        if (video.buffered.length > 0) {
          setBufferedEnd(video.buffered.end(video.buffered.length - 1));
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn('[HLS.js Stream Event]:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.MEDIA_ERROR: {
              const attempts = mediaRecoveryAttemptsRef.current;
              mediaRecoveryAttemptsRef.current += 1;
              if (attempts === 0) {
                console.warn('[HLS.js] Fatal media error (attempt 1): calling recoverMediaError()...');
                try {
                  hls.recoverMediaError();
                } catch {
                  handleStreamFailure('Media error recovery failed');
                }
              } else if (attempts === 1) {
                console.warn('[HLS.js] Fatal media error (attempt 2): swapping audio codec and recovering...');
                try {
                  hls.swapAudioCodec();
                  hls.recoverMediaError();
                } catch {
                  handleStreamFailure('Swap audio codec recovery failed');
                }
              } else {
                console.warn('[HLS.js] Fatal media error persists after internal recovery. Auto-recovering stream...');
                mediaRecoveryAttemptsRef.current = 0;
                handleStreamFailure('Decode error persistent');
              }
              break;
            }
            case Hls.ErrorTypes.NETWORK_ERROR: {
              const netRetries = (hls as any).__netRetryCount || 0;
              if (netRetries < 2) {
                (hls as any).__netRetryCount = netRetries + 1;
                console.warn(`[HLS.js] Network error, reloading segments (attempt ${netRetries + 1}/2)...`);
                try {
                  hls.startLoad();
                } catch {
                  handleStreamFailure('Network error');
                }
              } else {
                console.warn('[HLS.js] Fatal network error persists, auto-restarting FFmpeg stream...');
                handleStreamFailure('Network error');
              }
              break;
            }
            default:
              setHlsStatus('error');
              setStreamError(`HLS stream playback error: ${data.details || 'Transcoder stream stalled'}`);
              hls.destroy();
              break;
          }
        }
      });

      hlsInstanceRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Apple Safari / iOS HLS
      video.src = streamSrc;
      video.load();
      video.addEventListener('loadedmetadata', () => {
        setHlsStatus('streaming');
        if (initialSeekPendingRef.current !== null && initialSeekPendingRef.current > 0) {
          const seekTo = initialSeekPendingRef.current;
          initialSeekPendingRef.current = null;
          safeSeek(seekTo);
        } else if (lastKnownTimeRef.current > 0) {
          safeSeek(lastKnownTimeRef.current);
        }
        video.play().catch(() => setIsPlaying(false));
      });
      video.addEventListener('canplay', () => setHlsStatus('streaming'));
      video.addEventListener('error', () => {
        const errCode = video.error?.code;
        if (errCode === 2 || errCode === 3) {
          handleStreamFailure(`Native HLS error code ${errCode}`);
        } else {
          setHlsStatus('error');
          setStreamError('Native browser HLS pipeline could not play stream.');
        }
      });
    } else {
      setHlsStatus('error');
      setStreamError('HLS streaming is not supported in this browser environment.');
    }

    return () => {
      clearTimeout(initTimer);
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [streamSrc, handleStreamFailure, safeSeek, forceRemount]);

  // 4. Send stop command to backend on unmount to release FFmpeg child process
  useEffect(() => {
    return () => {
      if (mediaId) {
        fetch(`/api/media/stream/${encodeURIComponent(mediaId)}/stop`, {
          method: 'POST',
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [mediaId]);

  // Update subtitle tracks visibility & offset
  useEffect(() => {
    if (!videoRef.current) return;
    const tracks = videoRef.current.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (i === activeSubtitleTrack) {
        track.mode = 'showing';
        // Apply offset to cues
        if (track.cues) {
          for (let j = 0; j < track.cues.length; j++) {
            const cue = track.cues[j] as VTTCue;
            if (!(cue as any).originalStartTime) {
                (cue as any).originalStartTime = cue.startTime;
                (cue as any).originalEndTime = cue.endTime;
            }
            cue.startTime = (cue as any).originalStartTime + (subtitleOffset / 1000);
            cue.endTime = (cue as any).originalEndTime + (subtitleOffset / 1000);
          }
        }
      } else {
        track.mode = 'disabled';
      }
    }
  }, [activeSubtitleTrack, subtitleOffset]);

  // Video event handlers
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.buffered.length > 0) {
      setBufferedEnd(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const vidDuration = videoRef.current.duration;
    if (vidDuration && !isNaN(vidDuration) && isFinite(vidDuration)) {
      setDuration(vidDuration);
    } else if (probeData?.format?.duration) {
      setDuration(probeData.format.duration);
    }

    if (initialSeekPendingRef.current !== null && initialSeekPendingRef.current > 0) {
      const seekTo = initialSeekPendingRef.current;
      initialSeekPendingRef.current = null;
      safeSeek(seekTo);
    } else if (lastKnownTimeRef.current > 0) {
      safeSeek(lastKnownTimeRef.current);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch((err) => {
        console.warn('Playback error:', err);
      });
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (newTime: number) => {
    if (!videoRef.current) return;
    const startTime = currentTime;
    const endTime = newTime;
    const animDuration = 180; // ms
    let startTimestamp: number | null = null;

    // Apply single safe seek to video player
    safeSeek(endTime);

    // Smoothly animate the scrub needle across timeline to avoid abrupt visual jumps
    const animate = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / animDuration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      
      const needleTime = startTime + (endTime - startTime) * easedProgress;
      setCurrentTime(needleTime);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCurrentTime(endTime);
      }
    };
    requestAnimationFrame(animate);
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || !isFinite(secs)) return '00:00';
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Auto-hide controls when mouse is inactive
  const triggerUserActivity = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3500);
  };

  const bufferSecondsAhead = Math.max(0, bufferedEnd - currentTime);

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerUserActivity}
      className="relative w-full h-full flex flex-col bg-slate-950 select-none overflow-hidden text-slate-100 group"
    >
      {/* Top Floating Badge & Status */}
      <div
        className={`absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-slate-950/90 via-slate-950/60 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden max-w-[65%]">
          <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 shrink-0">
            {isAudio ? <Music className="w-4 h-4" /> : <Film className="w-4 h-4" />}
          </div>
          <div className="truncate">
            <h3 className="text-sm font-semibold text-white truncate flex items-center gap-2">
              {title}
              {currentEpisodeTitle && (
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-medium">
                  {currentEpisodeTitle}
                </span>
              )}
              {currentTrackTitle && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-medium">
                  {currentTrackTitle}
                </span>
              )}
            </h3>
            <div className="text-[11px] text-slate-400 truncate font-mono">
              {filePath || 'FFmpeg Stream'}
            </div>
          </div>
        </div>

        {/* Top Right Quick Badges */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Visual Stream Status Indicator Badge */}
          <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
            probeData?.needsTranscoding
              ? 'bg-amber-950/85 text-amber-300 border-amber-500/50 shadow'
              : 'bg-emerald-950/85 text-emerald-300 border-emerald-500/50 shadow'
          }`} title={probeData?.needsTranscoding ? (probeData.reasons.join(', ') || 'Transcoded to H.264 / AAC') : 'Direct Stream Copy'}>
            <span className={`w-2 h-2 rounded-full ${probeData?.needsTranscoding ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span className="hidden md:inline">{probeData?.needsTranscoding ? 'Transcoded' : 'Direct Stream'}</span>
            {probeData?.video && (
              <span className="text-[10px] font-mono opacity-90 border-l border-current/30 pl-1.5">
                {probeData.video.codec_name.toUpperCase()} • {probeData.video.width}x{probeData.video.height}
              </span>
            )}
          </div>

          <button
            onClick={() => setShowProbeDetails(!showProbeDetails)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
              showProbeDetails
                ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                : 'bg-slate-900/80 hover:bg-slate-800 text-indigo-300 border-indigo-500/30'
            }`}
            title="Inspect FFprobe detected codecs and transcode stream specs"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Stream Specs</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showProbeDetails ? 'rotate-180' : ''}`} />
          </button>

          <button
            onClick={() => setHwAccel(!hwAccel)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
              hwAccel
                ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Toggle Hardware Accelerated Transcoding"
          >
            <Cpu className={`w-3.5 h-3.5 ${hwAccel ? 'animate-pulse' : ''}`} />
            <span className="hidden md:inline">GPU Accel: {hwAccel ? 'ON' : 'OFF'}</span>
          </button>

          {/* Encoder / Codec Selector Dropdown */}
          <select
            value={activeCodec}
            onChange={(e) => setActiveCodec(e.target.value)}
            className="bg-slate-900/90 text-cyan-300 border border-cyan-500/40 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-cyan-500"
            title="Select Hardware Acceleration Encoder (H.264, HEVC, AV1)"
          >
            <option value="h264">Encoder: H.264</option>
            <option value="hevc">Encoder: HEVC</option>
            <option value="av1">Encoder: AV1</option>
          </select>

          {/* Audio Track Selector Dropdown */}
          {probeData?.audioStreams && probeData.audioStreams.length > 0 && (
            <div className="relative">
              <select
                value={activeAudioTrack}
                onChange={(e) => setActiveAudioTrack(parseInt(e.target.value, 10))}
                className="bg-slate-900/90 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500"
                title="Select Audio Track / Language Channel"
              >
                {probeData.audioStreams.map((a, idx) => {
                  const lang = a.tags?.language ? `[${a.tags.language.toUpperCase()}]` : '';
                  const trackTitle = a.tags?.title || `Track ${idx + 1}`;
                  const codec = a.codec_name ? a.codec_name.toUpperCase() : 'AUDIO';
                  const channels = a.channels ? `${a.channels}ch` : '';
                  return (
                    <option key={idx} value={idx}>
                      Audio {idx + 1}: {lang} {trackTitle} ({codec} {channels})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Subtitle Track Selector Dropdown */}
          {probeData?.subtitleStreams && probeData.subtitleStreams.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={activeSubtitleTrack}
                onChange={(e) => setActiveSubtitleTrack(parseInt(e.target.value, 10))}
                className="bg-slate-900/90 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500"
                title="Select Subtitle Track"
              >
                <option value="-1">Subtitles: Off</option>
                {probeData.subtitleStreams.map((s, idx) => {
                  const lang = s.tags?.language ? `[${s.tags.language.toUpperCase()}]` : '';
                  const trackTitle = s.tags?.title || `Track ${idx + 1}`;
                  return (
                    <option key={idx} value={idx}>
                      {lang} {trackTitle} ({s.codec_name.toUpperCase()})
                    </option>
                  );
                })}
              </select>
              <div className="flex items-center gap-1 bg-slate-900/90 rounded-lg border border-slate-700">
                <button
                    onClick={() => setSubtitleOffset(prev => prev - 100)}
                    className="px-2 py-1 hover:bg-slate-800 rounded-l-lg text-xs"
                    title="Subtitle Delay -100ms"
                >-</button>
                <span className="text-[10px] font-mono w-16 text-center">{subtitleOffset > 0 ? '+' : ''}{subtitleOffset}ms</span>
                <button
                    onClick={() => setSubtitleOffset(prev => prev + 100)}
                    className="px-2 py-1 hover:bg-slate-800 rounded-r-lg text-xs"
                    title="Subtitle Delay +100ms"
                >+</button>
              </div>
            </div>
          )}

        {/* Resolution Selector Dropdown */}
          <div className="relative">
            <select
              value={activePreset}
              onChange={(e) => setActivePreset(e.target.value)}
              className="bg-slate-900/90 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500"
              title="Select Streaming Resolution"
            >
              <option value="">Auto (Direct/H.264)</option>
              <option value="1080p-HighBitrate">1080p (High Bitrate)</option>
              <option value="720p-LowBandwidth">720p (Low Bandwidth)</option>
              <option value="480p-Mobile">480p (Mobile Fast)</option>
            </select>
          </div>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Close player"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* FFprobe Specs Overlay Panel */}
      {showProbeDetails && (
        <div className="absolute top-14 right-4 z-40 w-96 max-w-[90vw] bg-slate-900/95 border border-slate-700 rounded-xl p-4 shadow-2xl backdrop-blur-md text-xs space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>FFmpeg Stream Detection</span>
            </div>
            <button
              onClick={() => setShowProbeDetails(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {probeLoading ? (
            <div className="flex items-center gap-2 py-4 text-slate-400 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Analyzing streams with ffprobe...</span>
            </div>
          ) : probeError ? (
            <div className="p-2 bg-rose-950/60 border border-rose-800 rounded text-rose-300">
              {probeError}
            </div>
          ) : probeData ? (
            <div className="space-y-2.5">
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                <div className="text-slate-400 font-mono text-[11px] uppercase tracking-wider">Container Format</div>
                <div className="font-medium text-slate-200">
                  {probeData.format.format_name}
                  {probeData.format.duration ? ` (${formatTime(probeData.format.duration)})` : ''}
                </div>
              </div>

              {probeData.video && (
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                  <div className="text-slate-400 font-mono text-[11px] uppercase tracking-wider flex items-center justify-between">
                    <span>Video Stream</span>
                    <span className={probeData.needsVideoTranscode ? 'text-amber-400' : 'text-emerald-400'}>
                      {probeData.needsVideoTranscode ? 'Transcoded to H.264' : 'Direct Copy'}
                    </span>
                  </div>
                  <div className="text-slate-200">
                    <span className="font-semibold">{probeData.video.codec_name.toUpperCase()}</span>
                    {` • ${probeData.video.width}x${probeData.video.height} @ ${probeData.video.fps || 24}fps`}
                    {probeData.video.pix_fmt ? ` (${probeData.video.pix_fmt})` : ''}
                  </div>
                </div>
              )}

              {probeData.audio && (
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                  <div className="text-slate-400 font-mono text-[11px] uppercase tracking-wider flex items-center justify-between">
                    <span>Audio Stream</span>
                    <span className={probeData.needsAudioTranscode ? 'text-amber-400' : 'text-emerald-400'}>
                      {probeData.needsAudioTranscode ? 'Transcoded to AAC' : 'Direct Copy'}
                    </span>
                  </div>
                  <div className="text-slate-200">
                    <span className="font-semibold">{probeData.audio.codec_name.toUpperCase()}</span>
                    {` • ${probeData.audio.channels || 2} Channels (${probeData.audio.sample_rate || 48000} Hz)`}
                  </div>
                </div>
              )}

              {probeData.reasons.length > 0 && (
                <div className="bg-amber-950/30 border border-amber-800/50 p-2 rounded text-[11px] text-amber-300/90 space-y-0.5">
                  <div className="font-semibold text-amber-200 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" /> Transcoding Strategy:
                  </div>
                  {probeData.reasons.map((r, i) => (
                    <div key={i} className="list-disc pl-2">• {r}</div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Main Video Viewport or Audio Stage */}
      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        {/* Loading / Buffering / Recovering Overlay */}
        {(hlsStatus === 'initializing' || hlsStatus === 'buffering' || isRecovering) && (
          <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center animate-spin mb-3">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-white">
              {isRecovering ? 'Restarting FFmpeg Stream & Resuming...' : hlsStatus === 'initializing' ? 'Spawning FFmpeg HLS Transcoder...' : 'Buffering HLS Segments...'}
            </div>
            <div className="text-xs text-slate-400 mt-1 max-w-sm">
              {isRecovering ? 'Auto-recovering from stream decode or network interruption' : 'Analyzing media format via ffprobe and dynamically generating MPEG-TS chunks'}
            </div>
            {hlsStatus === 'initializing' && (
              <button
                onClick={() => {
                  setHlsStatus('streaming');
                  if (videoRef.current) {
                    videoRef.current.play().catch(() => setIsPlaying(false));
                  }
                }}
                className="mt-4 px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-xs text-white font-medium border border-indigo-500 shadow transition-colors flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Start Playback
              </button>
            )}
          </div>
        )}

        {/* Fatal Stream Error Banner */}
        {streamError && (
          <div className="absolute inset-x-6 top-16 z-30 bg-rose-950/95 border border-rose-800 rounded-xl p-4 shadow-2xl flex items-start gap-3 text-rose-200 backdrop-blur-md">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <div className="font-bold text-sm text-white">HLS Playback Interruption</div>
              <p className="mt-1">{streamError}</p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    setRetryCount(0);
                    setStreamError(null);
                    setForceRemount((prev) => prev + 1);
                    fetchProbeData();
                    setRestartNonce((prev) => prev + 1);
                  }}
                  className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Transcode
                </button>
                <button
                  onClick={async () => {
                    setStreamError(null);
                    setHlsStatus('initializing');
                    try {
                        await fetch(`/api/media/stream/${encodeURIComponent(mediaId)}/stop`, {
                            method: 'POST',
                            keepalive: true,
                        });
                    } catch {}
                    setRestartNonce((prev) => prev + 1);
                  }}
                  className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Force Restart Stream
                </button>
                {onFallbackDirect && (
                  <button
                    onClick={onFallbackDirect}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
                  >
                    Switch to Direct Stream
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {isAudio ? (
          // Audio Album Art & Visualization Stage
          <div className="flex flex-col items-center justify-center p-8 w-full max-w-md text-center z-10">
            <div className="relative w-48 h-48 sm:w-60 sm:h-60 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 mb-6 group">
              <img
                src={posterUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80'}
                alt={title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80" />
              <div className="absolute bottom-3 inset-x-3 flex items-center justify-center gap-1">
                {[40, 70, 90, 60, 30, 80, 50, 95, 45, 65, 85, 35].map((h, i) => (
                  <span
                    key={i}
                    className={`w-1 rounded-full bg-indigo-400 ${isPlaying ? 'animate-pulse' : 'opacity-40'}`}
                    style={{
                      height: `${isPlaying ? h : 15}%`,
                      transition: 'height 0.2s ease',
                      animationDelay: `${i * 100}ms`
                    }}
                  />
                ))}
              </div>
            </div>
            <h3 className="text-xl font-bold text-white truncate max-w-full">
              {currentTrackTitle || title}
            </h3>
            <p className="text-xs text-indigo-400 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              FFmpeg HLS Transcode Stream
            </p>
          </div>
        ) : null}

        {/* Central Play Watermark Button when stream is ready but paused */}
        {!isPlaying && hlsStatus === 'streaming' && !isRecovering && (
          <button
            onClick={togglePlay}
            className="absolute z-20 w-16 h-16 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl shadow-indigo-500/50 backdrop-blur-sm transition-transform transform hover:scale-110 active:scale-95 cursor-pointer"
            title="Click to Play"
          >
            <Play className="w-8 h-8 ml-1 fill-white" />
          </button>
        )}

        {/* Underlying Video Element */}
        <video
          key={forceRemount}
          ref={videoRef}
          poster={posterUrl}
          className={`w-full h-full object-contain ${isAudio ? 'hidden' : 'block'}`}
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => setHlsStatus('streaming')}
          onLoadedData={() => setHlsStatus('streaming')}
          onPlaying={() => {
            setIsPlaying(true);
            setHlsStatus('streaming');
          }}
          onError={(e) => {
            const vid = e.currentTarget;
            const code = vid.error?.code;
            console.warn(`[HLSPlayer] Video element error (code ${code}):`, vid.error?.message);
            // When Hls.js is active, allow Hls.js to manage buffer and decode recovery through its events
            // Only trigger manual stream failure if Hls.js is not active (native HLS) or fatal stall
            if (!hlsInstanceRef.current && (code === 2 || code === 3)) {
              handleStreamFailure(`Native video error code ${code}`);
            }
          }}
          onClick={togglePlay}
          playsInline
        />
      </div>

      {/* Bottom Floating Control Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-slate-950/95 via-slate-950/85 to-transparent px-4 py-3 flex flex-col gap-2 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Chapter Navigation Bar */}
        {probeData?.chapters && probeData.chapters.length > 0 && (
           <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
             {probeData.chapters.map((c) => (
               <button
                 key={c.id}
                 onClick={() => handleSeek(c.start_time)}
                 className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-[10px] text-slate-300 hover:text-white truncate whitespace-nowrap min-w-max"
                 title={c.tags?.title || `Chapter ${c.id}`}
               >
                 {c.tags?.title || `Chapter ${c.id}`}
               </button>
             ))}
           </div>
        )}

        {/* Scrubber Progress Bar */}
        <div className="relative w-full group/scrub py-1 cursor-pointer">
          {/* Buffer Progress */}
          <div className="relative w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            {/* Chapter Markers */}
            {probeData?.chapters?.map((c) => (
              <div
                key={c.id}
                className="absolute h-full bg-indigo-500/40"
                style={{
                  left: `${(c.start_time / (duration || 1)) * 100}%`,
                  width: `${Math.max(0.5, ((c.end_time - c.start_time) / (duration || 1)) * 100)}%`,
                }}
                title={c.tags?.title || `Chapter ${c.id}`}
              />
            ))}
            <div
              className="absolute left-0 top-0 bottom-0 bg-slate-700/80 transition-all duration-200"
              style={{ width: `${(bufferedEnd / (duration || 1)) * 100}%` }}
            />
            {/* Playback Progress */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-4">
          {/* Play/Pause & Time */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-600/30"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => handleSeek(Math.max(0, currentTime - 10))}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors hidden sm:inline"
              title="Rewind 10 seconds"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="text-xs font-mono text-slate-300">
              <span className="text-white font-semibold">{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Live Buffer Health Tag */}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Buffer: {bufferSecondsAhead.toFixed(1)}s</span>
            </div>
          </div>

          {/* Volume, Speed & Fullscreen */}
          <div className="flex items-center gap-3">
            {/* Volume */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={toggleMute}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
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
                className="w-16 sm:w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Playback Speed */}
            <select
              value={playbackSpeed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="bg-slate-900 text-slate-300 border border-slate-700 rounded-lg px-2 py-0.5 text-xs font-mono focus:outline-none hidden sm:inline"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>

            {!isAudio && (
              <button
                onClick={toggleFullscreen}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
