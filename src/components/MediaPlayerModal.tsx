import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  RotateCw,
  ExternalLink,
  Tv,
  Film,
  Music,
  Bookmark,
  Check,
  Sparkles,
  HardDrive,
  Copy,
  Sliders,
  ListMusic,
  Radio,
  FileVideo,
  FileAudio,
  FolderOpen,
  AlertCircle,
  RefreshCw,
  Layers,
  Info,
  FileText,
  SkipForward,
  Globe,
  Link,
  UploadCloud,
  Activity,
} from 'lucide-react';
import { MediaMetadata, EpisodeMetadata, TrackMetadata, SambaConfig } from '../types';
import { openInVlc, openInIina, openInSystemPlayer, validateSambaPlaybackPath, listMountedVolumes, checkPathExists, resolveLocalMountPath, checkFfmpegCodecsViaTauri, FfmpegCodecDiagnostics } from '../utils/tauriBridge';
import { apiCall } from '../lib/api';
import { useSambaErrorMonitor } from '../hooks/useSambaErrorMonitor';
import { transcodeService } from '../services/TranscodeService';

interface MediaPlayerModalProps {
  media: MediaMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  sambaConfig: SambaConfig;
  initialEpisode?: EpisodeMetadata;
  initialTrack?: TrackMetadata;
  mediaLibrary?: MediaMetadata[];
  onSelectMedia?: (media: MediaMetadata) => void;
  onTestConnection?: () => void;
  onNavigateToMountHub?: () => void;
}

interface StreamOption {
  id: string;
  name: string;
  url: string;
  badge: string;
  type: 'video' | 'audio';
}

// Helper to filter out deprecated external buckets that return 403 Forbidden
function sanitizeStreamUrl(url?: string | null): string | null {
  if (!url) return null;
  if (
    url.includes('commondatastorage.googleapis.com/gtv-videos-bucket') ||
    url.includes('gtv-videos-bucket')
  ) {
    return null;
  }
  return url;
}

function isTauriPlaybackEnvironment(): boolean {
  return typeof window !== 'undefined' && (
    Boolean((window as any).__TAURI_IPC__) ||
    Boolean((window as any).__TAURI__) ||
    window.location.protocol === 'tauri:' ||
    window.location.origin.includes('tauri.localhost')
  );
}

export const MediaPlayerModal: React.FC<MediaPlayerModalProps> = ({
  media,
  isOpen,
  onClose,
  sambaConfig,
  initialEpisode,
  initialTrack,
  onTestConnection,
  onNavigateToMountHub,
}) => {
  const { suggestTestConnection, mountFailureReason, evaluateError, resetMonitor } = useSambaErrorMonitor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const subtitleFileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [savedProgress, setSavedProgress] = useState(false);
  const [activeSpeedMenu, setActiveSpeedMenu] = useState(false);
  const [activeSourceMenu, setActiveSourceMenu] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [transcodedPlaybackUrl, setTranscodedPlaybackUrl] = useState<string | null>(null);
  const [transcodedFilePath, setTranscodedFilePath] = useState<string | null>(null);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [transcodingProgress, setTranscodingProgress] = useState(0);
  const transcodeAttemptedRef = useRef(false);
  const [nativeTranscodeSourcePath, setNativeTranscodeSourcePath] = useState<string | null>(null);

  useEffect(() => {
    let interval: number;
    if (isTranscoding) {
      interval = setInterval(() => {
        setTranscodingProgress(prev => (prev < 90 ? prev + Math.random() * 10 : prev));
      }, 500) as any;
    }
    return () => clearInterval(interval);
  }, [isTranscoding]);
  const resetTranscodedPlayback = () => {
    transcodeAttemptedRef.current = false;
    setTranscodedPlaybackUrl(null);
    setIsTranscoding(false);
    setTranscodingProgress(0);
    setNativeTranscodeSourcePath(null);
  };

  useEffect(() => {
    if (playbackError) {
      evaluateError(playbackError);
    } else {
      resetMonitor();
    }
  }, [playbackError, evaluateError, resetMonitor]);
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);
  const [customLocalBlobUrl, setCustomLocalBlobUrl] = useState<string | null>(null);
  const [customStreamInputUrl, setCustomStreamInputUrl] = useState<string>('');
  const [showCustomUrlInput, setShowCustomUrlInput] = useState(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<FfmpegCodecDiagnostics | null>(null);
  const [isCheckingDiagnostics, setIsCheckingDiagnostics] = useState(false);
  const [isVerifyingSystem, setIsVerifyingSystem] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);
  const [transcodeReadinessStatus, setTranscodeReadinessStatus] = useState<{
    checked: boolean;
    ready: boolean;
    message: string;
  }>({ checked: false, ready: true, message: 'Checking codecs...' });

  const runFfmpegDiagnostics = useCallback(async () => {
    setIsCheckingDiagnostics(true);
    try {
      const data = await checkFfmpegCodecsViaTauri();
      setDiagnosticsData(data);
      const isReady = Boolean(data.available && (data.hasH264 || data.hasHevc));
      setTranscodeReadinessStatus({
        checked: true,
        ready: isReady,
        message: isReady
          ? `Codecs OK (${[data.hasH264 && 'H.264', data.hasHevc && 'HEVC'].filter(Boolean).join('/')})`
          : 'FFmpeg misconfigured - Click to repair',
      });
      return data;
    } catch (e: any) {
      const fallback: FfmpegCodecDiagnostics = {
        available: false,
        version: '',
        hasH264: false,
        hasHevc: false,
        codecs: [],
        os: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
        error: e?.message || 'Could not probe local codecs',
        source: 'fallback',
      };
      setDiagnosticsData(fallback);
      setTranscodeReadinessStatus({
        checked: true,
        ready: false,
        message: 'FFmpeg missing - Click to repair',
      });
      return fallback;
    } finally {
      setIsCheckingDiagnostics(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    runFfmpegDiagnostics();
  }, [isOpen, runFfmpegDiagnostics]);

  const handleDownloadInstallFfmpeg = async () => {
    const docUrl = 'https://ffmpeg.org/download.html';
    // 1. Open system-appropriate documentation / download link
    try {
      if (typeof window !== 'undefined' && '__TAURI_IPC__' in (window as any)) {
        const { open } = await import('@tauri-apps/api/shell');
        await open(docUrl);
      } else if (typeof window !== 'undefined') {
        (window as any).open(docUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      if (typeof window !== 'undefined') {
        (window as any).open(docUrl, '_blank', 'noopener,noreferrer');
      }
    }

    // 2. Trigger system-level verification check
    setIsVerifyingSystem(true);
    setVerificationFeedback('Opened FFmpeg installation documentation. Probing local system bridge for newly installed binaries...');
    try {
      const res = await checkFfmpegCodecsViaTauri();
      setDiagnosticsData(res);
      if (res.available) {
        setVerificationFeedback(`System verification passed! Located: ${res.version} (H.264: ${res.hasH264 ? 'Yes' : 'No'}, HEVC: ${res.hasHevc ? 'Yes' : 'No'})`);
      } else {
        setVerificationFeedback(`Verification completed: FFmpeg is not yet active in your system PATH. Follow the install guide above and click 'Verify System Codecs' once installed.`);
      }
    } catch (verErr: any) {
      setVerificationFeedback(`Verification check error: ${verErr?.message || verErr}`);
    } finally {
      setIsVerifyingSystem(false);
    }
  };
  const [isDragOver, setIsDragOver] = useState(false);
  const [isManualStreamOverride, setIsManualStreamOverride] = useState(false);
  const [isVolumeMounted, setIsVolumeMounted] = useState<boolean>(true);
  const [systemVolumes, setSystemVolumes] = useState<string[]>([]);

  // Persistent mapping table that links library entries to verified local mount points
  const [mountMappings, setMountMappings] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('samba_vault_mount_mappings');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveMountMapping = (mediaIdOrPath: string, localVerifiedPath: string) => {
    if (!mediaIdOrPath || !localVerifiedPath) return;
    setMountMappings((prev) => {
      const updated = { ...prev, [mediaIdOrPath]: localVerifiedPath };
      try {
        localStorage.setItem('samba_vault_mount_mappings', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save mount mapping:', e);
      }
      return updated;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const verifyVolume = async () => {
      try {
        const vols = await listMountedVolumes();
        setSystemVolumes(vols || []);
        const share = sambaConfig.share || 'media';
        const expectedPath = sambaConfig.mountPath || sambaConfig.baseMountPath || `/Volumes/${share}`;
        const targetPath = media?.folderPath || media?.playbackUrl || expectedPath;

        const found = (vols || []).some((v) =>
          targetPath.toLowerCase().includes(v.toLowerCase()) ||
          v.toLowerCase().includes(share.toLowerCase()) ||
          v.toLowerCase().includes('volumes')
        );

        const isTauriEnv = typeof window !== 'undefined' && (
          Boolean((window as any).__TAURI_IPC__) ||
          Boolean((window as any).__TAURI__) ||
          window.location.protocol === 'tauri:'
        );
        if (isTauriEnv && vols && vols.length > 0) {
          setIsVolumeMounted(found);
        } else {
          setIsVolumeMounted(true);
        }
      } catch (err) {
        console.warn('[MediaPlayerModal] Volume verification check error:', err);
        setIsVolumeMounted(true);
      }
    };
    verifyVolume();
  }, [isOpen, media, sambaConfig]);

  // Info Overlay & Subtitles state
  const [showInfoOverlay, setShowInfoOverlay] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ name: string; url: string; lang: string }>>([
    { name: 'English (CC)', url: '', lang: 'en' },
    { name: 'Spanish', url: '', lang: 'es' },
  ]);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState<number>(-1); // -1 = off
  const [activeSubtitleMenu, setActiveSubtitleMenu] = useState(false);

  // Smart Resume & Subtitle Offset state
  const [smartResumeEnabled, setSmartResumeEnabled] = useState(true);
  const [resumingToast, setResumingToast] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0); // in seconds (-5.0 to +5.0)

  useEffect(() => {
    if (!isOpen || !smartResumeEnabled) return;
    const checkSmartResume = async () => {
      try {
        const titleQuery = media?.title || '';
        if (!titleQuery) return;
        const res = await fetch(`/api/db/history?search=${encodeURIComponent(titleQuery)}&limit=10`);
        const data = await res.json();
        if (data.success && Array.isArray(data.history) && data.history.length > 0) {
          const match = data.history.find((h: any) => h.title?.toLowerCase() === titleQuery.toLowerCase() || h.media_id === media?.id);
          if (match && match.playback_position_seconds > 5) {
            const pos = match.playback_position_seconds;
            if (videoRef.current) {
              videoRef.current.currentTime = pos;
            }
            const mins = Math.floor(pos / 60);
            const secs = Math.floor(pos % 60);
            const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            setResumingToast(`Resuming playback at ${timeStr}`);
            setTimeout(() => setResumingToast(null), 4000);
          }
        }
      } catch (err) {
        console.warn('Smart resume error:', err);
      }
    };
    checkSmartResume();
  }, [isOpen, media?.id]);

  // Audio Track Languages (MKV / Media Stream audio tracks)
  const [audioTracks, setAudioTracks] = useState<Array<{ id: string; name: string; language: string; codec: string; channels: string }>>([
    { id: 'track-1', name: 'English (Original)', language: 'en', codec: 'AC3 5.1', channels: '5.1' },
    { id: 'track-2', name: 'English (Director Commentary)', language: 'en', codec: 'AAC Stereo', channels: '2.0' },
    { id: 'track-3', name: 'Spanish (Dub)', language: 'es', codec: 'AC3 5.1', channels: '5.1' },
    { id: 'track-4', name: 'Japanese (Original Dub)', language: 'ja', codec: 'DTS-HD 7.1', channels: '7.1' },
  ]);
  const [activeAudioTrackId, setActiveAudioTrackId] = useState<string>('track-1');
  const [activeAudioMenu, setActiveAudioMenu] = useState<boolean>(false);
  const [audioToastMessage, setAudioToastMessage] = useState<string | null>(null);

  const showAudioToast = (msg: string) => {
    setAudioToastMessage(msg);
    setTimeout(() => setAudioToastMessage(null), 3500);
  };

  // Series Episode Tracking
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(
    initialEpisode?.seasonNumber || media?.seasons?.[0]?.seasonNumber || 1
  );
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeMetadata | undefined>(
    initialEpisode || media?.seasons?.[0]?.episodes?.[0]
  );

  // Track tracking for Music Albums / Audiobooks
  const [selectedTrack, setSelectedTrack] = useState<TrackMetadata | undefined>(
    initialTrack || media?.tracks?.[0]
  );

  const isAudio = Boolean(
    media?.type === 'album' ||
    media?.recommendedFolderStructure?.toLowerCase().includes('audio books')
  );

  const handleSubtitleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const newTrack = {
      name: file.name,
      url,
      lang: 'en',
    };
    setSubtitleTracks((prev) => [...prev, newTrack]);
    setActiveSubtitleIndex(subtitleTracks.length);
  };

  const recordWatchHistory = () => {
    try {
      const pos = videoRef.current?.currentTime || currentTime || 0;
      const dur = videoRef.current?.duration || duration || 0;
      const pct = dur > 0 ? Number(((pos / dur) * 100).toFixed(1)) : 0;
      fetch('/api/db/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_id: media?.id,
          series_id: media?.type === 'series' ? media.id : undefined,
          media_type: media?.type || 'movie',
          title: selectedEpisode ? `${media?.title} - S${selectedSeasonNum}E${selectedEpisode.episodeNumber}` : (media?.title || 'Unknown Media'),
          season_number: selectedSeasonNum,
          episode_number: selectedEpisode?.episodeNumber,
          episode_title: selectedEpisode?.title,
          poster_url: media?.posterUrl,
          duration_seconds: dur,
          playback_position_seconds: pos,
          progress_percentage: pct,
          is_completed: pct >= 90 ? 1 : 0,
        }),
      }).catch(() => {});
    } catch {}
  };

  // Real-time heartbeat / progress-save signal every 10 seconds while playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      recordWatchHistory();
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, currentTime, duration, selectedEpisode, selectedSeasonNum]);

  // Next episode finder helper
  const getNextEpisode = (): { seasonNum: number; episode: EpisodeMetadata } | null => {
    if (!media?.seasons || media.seasons.length === 0 || !selectedEpisode) return null;
    const currentSeason = media.seasons.find((s) => s.seasonNumber === selectedSeasonNum);
    if (!currentSeason || !currentSeason.episodes) return null;

    const currentEpIndex = currentSeason.episodes.findIndex((e) => e.episodeNumber === selectedEpisode.episodeNumber);
    if (currentEpIndex !== -1 && currentEpIndex + 1 < currentSeason.episodes.length) {
      return { seasonNum: selectedSeasonNum, episode: currentSeason.episodes[currentEpIndex + 1] };
    } else {
      const seasonIndex = media.seasons.findIndex((s) => s.seasonNumber === selectedSeasonNum);
      if (seasonIndex !== -1 && seasonIndex + 1 < media.seasons.length) {
        const nextSeason = media.seasons[seasonIndex + 1];
        if (nextSeason.episodes && nextSeason.episodes.length > 0) {
          return { seasonNum: nextSeason.seasonNumber, episode: nextSeason.episodes[0] };
        }
      }
    }
    return null;
  };

  const nextEpInfo = media?.type === 'series' ? getNextEpisode() : null;
  const isNearEnd = duration > 0 && currentTime >= duration - 30;

  // Selected stream source preset - defaults to direct Samba network stream
  const [selectedStreamId, setSelectedStreamId] = useState<string>('direct-stream');

  // Implement resolveStreamableUri using Tauri's convertFileSrc for local file protocol access
  const resolveStreamableUri = async (pathCandidate: string): Promise<string> => {
    if (!pathCandidate) return '';
    let cleanPath = pathCandidate.replace(/^file:\/\//, '');

    // Strip legacy UNC prefix if present
    const shareName = sambaConfig.share || 'media';
    if (cleanPath.startsWith('//') || cleanPath.startsWith('smb://')) {
      cleanPath = resolveLocalMountPath(cleanPath, shareName);
    }

    const isTauriEnv = typeof window !== 'undefined' && (
      Boolean((window as any).__TAURI_IPC__) ||
      Boolean((window as any).__TAURI__) ||
      window.location.protocol === 'tauri:' ||
      window.location.origin.includes('tauri.localhost')
    );

    if (isTauriEnv && (cleanPath.startsWith('/') || cleanPath.match(/^[a-zA-Z]:\\/))) {
      try {
        const { convertFileSrc } = await import('@tauri-apps/api/tauri');
        return convertFileSrc(cleanPath);
      } catch (e) {
        console.warn('[MediaPlayerModal] convertFileSrc failed, falling back to stream proxy:', e);
      }
    }

    const params = new URLSearchParams();
    params.set('path', cleanPath);
    if (selectedSeasonNum !== undefined) {
      params.set('season', String(selectedSeasonNum));
    }
    if (selectedEpisode?.episodeNumber !== undefined) {
      params.set('episode', String(selectedEpisode.episodeNumber));
    }
    if (selectedEpisode?.filename) {
      params.set('file', selectedEpisode.filename);
    }
    return `/api/samba/stream?${params.toString()}`;
  };

  const [resolvedStreamUrl, setResolvedStreamUrl] = useState<string | null>(null);
  const [resolvedLocalFilePath, setResolvedLocalFilePath] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setResolvedLocalFilePath(null);
    const runResolver = async () => {
      let dbRecord: any = null;
      if (media?.id || media?.title) {
        try {
          const res = await apiCall<{ success: boolean; items: any[] }>('/api/db/media');
          if (res.success && Array.isArray(res.items)) {
            dbRecord = res.items.find((m: any) =>
              m.id === media.id || (m.title && media.title && m.title.toLowerCase() === media.title.toLowerCase())
            );
          }
        } catch (e) {
          console.warn('[MediaPlayerModal] Failed to query media from SQLite DB:', e);
        }
      }

      // Parse dbRecord.raw_data if available
      let parsedDbMedia: any = null;
      if (dbRecord?.raw_data) {
        try {
          parsedDbMedia = typeof dbRecord.raw_data === 'string' ? JSON.parse(dbRecord.raw_data) : dbRecord.raw_data;
        } catch {}
      }

      const activeFolder = media?.folderPath ||
        parsedDbMedia?.folderPath ||
        media?.recommendedFolderStructure ||
        parsedDbMedia?.recommendedFolderStructure ||
        dbRecord?.recommended_folder ||
        '';

      const episodeFilePath = selectedEpisode?.filePath || (
        selectedEpisode?.filename && activeFolder
          ? `${activeFolder}/${selectedEpisode.filename}`
          : ''
      );

      // Direct file path (e.g. /Volumes/media/Movies/Movie.mkv)
      const directFilePath = (media?.path && /\.(mp4|mkv|m4v|avi|mov|webm|flv|ts|mp3|flac|aac|wav|m4a)$/i.test(media.path))
        ? media.path
        : (parsedDbMedia?.path && /\.(mp4|mkv|m4v|avi|mov|webm|flv|ts|mp3|flac|aac|wav|m4a)$/i.test(parsedDbMedia.path))
          ? parsedDbMedia.path
          : '';

      const matchedFileWithFolder = (media?.matchedFilename && activeFolder)
        ? `${activeFolder}/${media.matchedFilename}`
        : (parsedDbMedia?.matchedFilename && activeFolder)
          ? `${activeFolder}/${parsedDbMedia.matchedFilename}`
          : '';

      const rawPlaybackUrl = episodeFilePath ||
        directFilePath ||
        matchedFileWithFolder ||
        selectedTrack?.playbackUrl ||
        parsedDbMedia?.playbackUrl ||
        dbRecord?.playbackUrl ||
        selectedEpisode?.playbackUrl ||
        media?.playbackUrl ||
        '';

      const targetPath =
        episodeFilePath ||
        directFilePath ||
        matchedFileWithFolder ||
        selectedEpisode?.filename ||
        activeFolder ||
        selectedTrack?.playbackUrl ||
        selectedEpisode?.playbackUrl ||
        media?.title ||
        '';

      const pathCandidate = (rawPlaybackUrl || targetPath).replace(/\\/g, '/');
      const mediaIdOrTitle = media?.id || media?.title || 'generic';
      const shareName = sambaConfig.share || 'media';

      // Normalize candidate using resolveLocalMountPath to ensure no UNC prefix
      const mappedCandidate = resolveLocalMountPath(pathCandidate, shareName);

      // 1. Check if we already have a persistent verified mapping for this entry
      const existingMappedPath = episodeFilePath ? undefined : mountMappings[mediaIdOrTitle];
      let finalPathToResolve = mappedCandidate;
      let matchedAndVerified = false;

      // Primary check: Check if mappedCandidate exists directly on system
      if (mappedCandidate) {
        try {
          const check = await checkPathExists(mappedCandidate);
          if (check.exists) {
            let foundPath = check.resolvedPath || mappedCandidate;
            if (check.isDirectory) {
              const fname = media?.matchedFilename || parsedDbMedia?.matchedFilename;
              if (fname) {
                const subCandidate = `${foundPath}/${fname}`;
                const subCheck = await checkPathExists(subCandidate);
                if (subCheck.exists) foundPath = subCheck.resolvedPath || subCandidate;
              } else if (media?.seasons?.[0]?.episodes?.[0]?.filename) {
                const epCandidate = `${foundPath}/${media.seasons[0].episodes[0].filename}`;
                const epCheck = await checkPathExists(epCandidate);
                if (epCheck.exists) foundPath = epCheck.resolvedPath || epCandidate;
              }
            }
            finalPathToResolve = foundPath;
            matchedAndVerified = true;
            if (isMounted) {
              setIsVolumeMounted(true);
            }
          }
        } catch (e) {
          console.warn('[Mount Mapping] checkPathExists error for candidate:', e);
        }
      }

      if (!matchedAndVerified && existingMappedPath) {
        try {
          const checkRes = await checkPathExists(existingMappedPath);
          if (checkRes.exists) {
            finalPathToResolve = checkRes.resolvedPath || existingMappedPath;
            matchedAndVerified = true;
            if (isMounted) {
              setIsVolumeMounted(true);
            }
          }
        } catch (e) {
          console.warn('[Mount Mapping] Failed to verify existing mapping:', e);
        }
      }

      // 2. If no persistent mapping, or mapping is invalid, perform dynamic mount scan
      if (!matchedAndVerified) {
        let vols = systemVolumes;
        if (vols.length === 0) {
          try {
            vols = await listMountedVolumes();
            if (isMounted && vols && vols.length > 0) {
              setSystemVolumes(vols);
            }
          } catch (e) {
            console.warn('[Mount Mapping] Failed to list system volumes:', e);
          }
        }

        if (vols && vols.length > 0) {
          // Construct candidates across all volumes, titles, and typical categories
          const cleanTitle = (media?.title || '').trim();
          const year = media?.year;
          const mediaType = media?.type || 'series';

          const titleVariants: string[] = [];
          if (cleanTitle) {
            titleVariants.push(cleanTitle);
            if (year) titleVariants.push(`${cleanTitle} (${year})`);
            const noBrackets = cleanTitle.replace(/\s*\([^)]*\)/g, '').trim();
            if (noBrackets && noBrackets !== cleanTitle) {
              titleVariants.push(noBrackets);
              if (year) titleVariants.push(`${noBrackets} (${year})`);
            }
          }

          const categories = [
            'series', 'tv shows', 'tv', 'shows', 'movies', 'music', 'comedy', "comedy's", 'comedy’s',
            'drama', 'dramas', 'action', 'thriller', 'terror', 'horror', 'scifi', 'sci-fi', ''
          ];

          let seasonStr = '';
          if (mediaType === 'series') {
            const sNum = selectedSeasonNum || selectedEpisode?.seasonNumber || 1;
            seasonStr = `Season ${String(sNum).padStart(2, '0')}`;
          }

          const candidates: string[] = [];
          for (const vol of vols) {
            if (!vol) continue;
            const normVol = vol.replace(/\\/g, '/');

            // Formulate candidates for matching
            for (const cat of categories) {
              for (const tVar of titleVariants) {
                const parts = [normVol];
                if (cat) parts.push(cat);
                parts.push(tVar);
                if (seasonStr) parts.push(seasonStr);

                const dirCandidate = parts.join('/');
                candidates.push(dirCandidate);

                if (media?.matchedFilename) {
                  candidates.push(`${dirCandidate}/${media.matchedFilename}`);
                }
                if (selectedEpisode?.filename) {
                  candidates.push(`${dirCandidate}/${selectedEpisode.filename}`);
                }
                if (selectedEpisode?.filePath) {
                  const filename = selectedEpisode.filePath.replace(/\\/g, '/').split('/').pop();
                  if (filename) {
                    candidates.push(`${dirCandidate}/${filename}`);
                  }
                }
              }
            }
          }

          // Add general mappings
          if (pathCandidate) {
            const cleanRel = pathCandidate.replace(/^[/\\]+/, '').replace(/^TV Shows\//i, 'series/');
            const cleanRelDirect = pathCandidate.replace(/^[/\\]+/, '').replace(/^TV Shows\//i, '');
            for (const vol of vols) {
              const normVol = vol.replace(/\\/g, '/');
              candidates.push(`${normVol}/${cleanRel}`);
              candidates.push(`${normVol}/${cleanRelDirect}`);
              candidates.push(`${normVol}/${pathCandidate.replace(/^[/\\]+/, '')}`);
            }
          }

          const uniqueCandidates = Array.from(new Set(candidates)).filter(Boolean);

          for (const cand of uniqueCandidates) {
            try {
              const check = await checkPathExists(cand);
              if (check.exists) {
                console.log(`[Mount Mapping] Dynamic scan successfully resolved local path: ${check.resolvedPath || cand}`);
                finalPathToResolve = check.resolvedPath || cand;
                saveMountMapping(mediaIdOrTitle, finalPathToResolve);
                matchedAndVerified = true;
                if (isMounted) {
                  setIsVolumeMounted(true);
                }
                break;
              }
            } catch (e) {
              // try next candidate
            }
          }
        }
      }

      const uri = await resolveStreamableUri(finalPathToResolve);
      if (isMounted) {
        setResolvedLocalFilePath(finalPathToResolve || null);
        setResolvedStreamUrl(uri);
      }
    };

    runResolver();
    return () => { isMounted = false; };
  }, [selectedEpisode, selectedTrack, media, selectedSeasonNum, mountMappings, systemVolumes]);

  const sambaStreamUrl = resolvedStreamUrl;

  // Determine active streaming/playback source safely (prioritizing direct Samba/HDD stream)
  const currentStreamUrl =
    transcodedPlaybackUrl ||
    customLocalBlobUrl ||
    sanitizeStreamUrl(media?.localBlobUrl) ||
    sambaStreamUrl ||
    sanitizeStreamUrl(selectedEpisode?.playbackUrl) ||
    sanitizeStreamUrl(selectedTrack?.playbackUrl) ||
    sanitizeStreamUrl(media?.playbackUrl) ||
    '';

  const validatedPlaybackPath = useMemo(() => {
    const res = validateSambaPlaybackPath(currentStreamUrl, sambaConfig);
    console.info(`[MediaPlayerEngine] Validated Samba Playback Path:`, res);
    return res;
  }, [currentStreamUrl, sambaConfig]);

  const [externalPlayerStatus, setExternalPlayerStatus] = useState<string | null>(null);
  const [isProbeRunning, setIsProbeRunning] = useState(false);
  const [probeResult, setProbeResult] = useState<{ success: boolean; message: string; latencyMs?: number; probedBytes?: number } | null>(null);

  const handleProbeSambaStream = async () => {
    setIsProbeRunning(true);
    setProbeResult(null);
    try {
      const targetPath = media?.recommendedFolderStructure || selectedEpisode?.playbackUrl || currentStreamUrl || '';
      const response = await fetch('/api/samba/probe-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: targetPath,
          server: sambaConfig.server,
          share: sambaConfig.share,
        }),
      });
      const data = await response.json();
      setProbeResult({
        success: Boolean(data.success),
        message: data.message || data.error || 'Probe completed',
        latencyMs: data.latencyMs,
        probedBytes: data.probedBytes,
      });
    } catch (err: any) {
      setProbeResult({
        success: false,
        message: `Probe failed: ${err.message}`,
      });
    } finally {
      setIsProbeRunning(false);
    }
  };

  const handleLaunchExternalVlc = async () => {
    const shareName = sambaConfig.share || 'media';
    const cleanFolder = (media?.recommendedFolderStructure || media?.title || '').replace(/^[/\\]+/, '');
    const fallbackVolumePath = `/Volumes/${shareName}/${cleanFolder}`;

    // Prefer exact verified local file path
    let localPath = validatedPlaybackPath.resolvedPath || media?.path || media?.folderPath || fallbackVolumePath;
    localPath = localPath.replace(/^file:\/\//, '');
    if (localPath.startsWith('//') || localPath.startsWith('smb://')) {
      localPath = resolveLocalMountPath(localPath, shareName);
    }

    const fullStreamUrl = currentStreamUrl.startsWith('http')
      ? currentStreamUrl
      : `${window.location.origin}${currentStreamUrl}`;

    setExternalPlayerStatus('Launching VLC...');
    let res = await openInVlc(localPath);
    if (!res.success && localPath !== fallbackVolumePath) {
      res = await openInVlc(fallbackVolumePath);
    }
    if (!res.success) {
      res = await openInVlc(fullStreamUrl);
    }
    setExternalPlayerStatus(res.success ? 'Launched in VLC' : res.message);
    setTimeout(() => setExternalPlayerStatus(null), 3000);
  };

  const handleLaunchExternalIina = async () => {
    const shareName = sambaConfig.share || 'media';
    const cleanFolder = (media?.recommendedFolderStructure || media?.title || '').replace(/^[/\\]+/, '');
    const fallbackVolumePath = `/Volumes/${shareName}/${cleanFolder}`;

    let localPath = validatedPlaybackPath.resolvedPath || media?.path || media?.folderPath || fallbackVolumePath;
    localPath = localPath.replace(/^file:\/\//, '');
    if (localPath.startsWith('//') || localPath.startsWith('smb://')) {
      localPath = resolveLocalMountPath(localPath, shareName);
    }

    const fullStreamUrl = currentStreamUrl.startsWith('http')
      ? currentStreamUrl
      : `${window.location.origin}${currentStreamUrl}`;

    setExternalPlayerStatus('Launching IINA...');
    let res = await openInIina(localPath);
    if (!res.success && localPath !== fallbackVolumePath) {
      res = await openInIina(fallbackVolumePath);
    }
    if (!res.success) {
      res = await openInIina(fullStreamUrl);
    }
    setExternalPlayerStatus(res.success ? 'Launched in IINA' : res.message);
    setTimeout(() => setExternalPlayerStatus(null), 3000);
  };

  // Sync volume to element
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = isMuted ? 0 : volume;
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Sync playback rate
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Safe playback starter that handles browser autoplay policies cleanly
  const startPlayback = useCallback(() => {
    const el = isAudio ? audioRef.current : videoRef.current;
    if (!el) return;

    setPlaybackError(null);
    try {
      el.load();
    } catch (e) {
      console.warn('Media load error:', e);
    }
    const playPromise = el.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch((err) => {
          console.warn('Autoplay prevented by browser or user interaction required:', err);
          setIsPlaying(false);
          setAutoplayBlocked(true);
        });
    }
  }, [isAudio]);

  // Reset playback state when the active media changes.
  useEffect(() => {
    if (!isOpen || !media) return;

    if (initialEpisode) {
      setSelectedSeasonNum(initialEpisode.seasonNumber);
      setSelectedEpisode(initialEpisode);
    } else if (media?.seasons?.[0]?.episodes?.[0]) {
      setSelectedSeasonNum(media.seasons[0].seasonNumber);
      setSelectedEpisode(media.seasons[0].episodes[0]);
    }

    if (initialTrack) {
      setSelectedTrack(initialTrack);
    } else if (media?.tracks?.[0]) {
      setSelectedTrack(media.tracks[0]);
    }

    setCurrentTime(0);
    setPlaybackError(null);
    setIsManualStreamOverride(false);
    setResolvedStreamUrl(null);
  }, [media, initialEpisode, initialTrack, isOpen]);

  useEffect(() => {
    if (!isOpen || !resolvedStreamUrl) return;
    const timer = setTimeout(startPlayback, 150);
    return () => clearTimeout(timer);
  }, [isOpen, resolvedStreamUrl, startPlayback]);

  useEffect(() => {
    transcodeAttemptedRef.current = false;
    setTranscodedPlaybackUrl(null);
    setIsTranscoding(false);
  }, [resolvedStreamUrl]);

  useEffect(() => {
    if (!isOpen || !transcodedPlaybackUrl) return;
    const timer = setTimeout(startPlayback, 150);
    return () => clearTimeout(timer);
  }, [isOpen, transcodedPlaybackUrl, startPlayback]);

  useEffect(() => {
    if (!isOpen && transcodedFilePath) {
      const cleanup = async () => {
        try {
          const { cleanupTranscodedFile } = await import('../utils/tauriBridge');
          await cleanupTranscodedFile(transcodedFilePath);
          setTranscodedFilePath(null);
        } catch (e) {
          console.error('Cleanup failed:', e);
        }
      };
      cleanup();
    }
  }, [isOpen, transcodedFilePath]);

  // Handle Play/Pause toggle
  const togglePlay = () => {
    const el = isAudio ? audioRef.current : videoRef.current;
    if (!el) return;

    if (el.paused || !isPlaying) {
      setPlaybackError(null);
      el.play()
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch((err) => {
          console.error('Play failed:', err);
          setAutoplayBlocked(true);
        });
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  const handleMediaDecodeError = useCallback(async (initialReason?: string) => {
    // If all transcode attempts failed, report the explicit error
    if (transcodeAttemptedRef.current || isTranscoding) {
      console.warn('[MediaPlayerModal] Transcoding already attempted or failed.');
      setIsTranscoding(false);
      setTranscodingProgress(0);
      setIsPlaying(false);
      const detail = initialReason || (
        `Unable to play "${media?.title || 'media'}": The browser cannot decode this file format (such as MKV container, HEVC/H.265 video, or DTS/AC3 audio) and transcoding is not active. ` +
        `Please open this file directly in VLC or IINA, or check system FFmpeg codecs in Diagnostics.`
      );
      setPlaybackError(detail);
      return;
    }
    
    transcodeAttemptedRef.current = true;
    setIsTranscoding(true);
    setPlaybackError(null);

    try {
      if (isTauriPlaybackEnvironment()) {
        const isResolvedSource = !isManualStreamOverride &&
          (!customLocalBlobUrl || customLocalBlobUrl === resolvedStreamUrl);
        const sourcePath = nativeTranscodeSourcePath || (isResolvedSource ? resolvedLocalFilePath : null) || currentStreamUrl;
        
        if (!sourcePath) {
          throw new Error('Transcoding in the desktop app requires a local media file or a valid stream.');
        }
        
        try {
          const outputPath = await transcodeService.transcode(sourcePath, isAudio ? 'audio' : 'video');
          setTranscodedFilePath(outputPath);
          const { convertFileSrc } = await import('@tauri-apps/api/tauri');
          setTranscodedPlaybackUrl(convertFileSrc(outputPath));
        } catch (tauriErr: any) {
          console.warn('[MediaPlayerModal] Native desktop transcode failed:', tauriErr);
          setPlaybackError(
            `Desktop FFmpeg Transcoding Failed: ${tauriErr?.message || tauriErr}. ` +
            `Ensure FFmpeg is installed in your system PATH or launch in VLC/IINA.`
          );
          setIsPlaying(false);
        }
      } else if (localVideoFile) {
        const response = await fetch('/api/media/transcode/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: localVideoFile,
        });
        const result = await response.json();
        if (!response.ok || !result.token) {
          throw new Error(result.error || 'Could not prepare this media for transcoding.');
        }
        setTranscodedPlaybackUrl(`/api/media/transcode/${result.token}?type=${isAudio ? 'audio' : 'video'}`);
      } else {
        const payload = {
          sourceUrl: currentStreamUrl,
          sourcePath: resolvedLocalFilePath || validatedPlaybackPath.resolvedPath || media?.path || media?.folderPath || media?.recommendedFolderStructure || '',
          mediaTitle: media?.title || '',
          mediaType: isAudio ? 'audio' : 'video',
        };
        const response = await fetch('/api/media/transcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || !result.token) {
          throw new Error(result.error || 'Could not prepare this media for transcoding.');
        }
        setTranscodedPlaybackUrl(`/api/media/transcode/${result.token}?type=${isAudio ? 'audio' : 'video'}`);
      }
    } catch (error: any) {
      console.warn('[MediaPlayerModal] Transcoding initialization error:', error);
      setIsTranscoding(false);
      setPlaybackError(
        `Playback Error: ${error?.message || initialReason || 'Could not play or transcode this media file.'}`
      );
      setIsPlaying(false);
    } finally {
      setIsTranscoding(false);
    }
  }, [currentStreamUrl, customLocalBlobUrl, isAudio, isManualStreamOverride, isTranscoding, localVideoFile, media, nativeTranscodeSourcePath, resolvedLocalFilePath, resolvedStreamUrl, validatedPlaybackPath.resolvedPath]);

  const handleMediaElementError = useCallback(async () => {
    const el = isAudio ? audioRef.current : videoRef.current;
    const mediaError = el?.error;
    let detailMessage = 'HTML5 media element failed to load or decode the file.';

    // Check if the server stream returned an explicit error response (e.g. 404 with JSON details)
    let serverReportedError: string | null = null;
    if (currentStreamUrl && !currentStreamUrl.startsWith('blob:') && !currentStreamUrl.startsWith('data:')) {
      try {
        const testRes = await fetch(currentStreamUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-100' },
        });
        if (!testRes.ok) {
          const contentType = testRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errJson = await testRes.json();
            if (errJson?.error) {
              serverReportedError = errJson.error;
            }
          } else {
            const text = await testRes.text();
            if (text && text.length < 250 && !text.includes('<!DOCTYPE')) {
              serverReportedError = text;
            } else {
              serverReportedError = `Stream endpoint returned HTTP ${testRes.status} (${testRes.statusText}).`;
            }
          }
        }
      } catch (err: any) {
        console.warn('[MediaPlayerModal] Stream probe network error:', err);
      }
    }

    if (serverReportedError) {
      console.warn('[MediaPlayerModal] Server reported error:', serverReportedError);
      setPlaybackError(serverReportedError);
      setIsPlaying(false);
      return;
    }

    if (mediaError) {
      switch (mediaError.code) {
        case 1:
          detailMessage = 'Playback was aborted by user or browser.';
          break;
        case 2:
          detailMessage = `Network error fetching stream from Samba server (${sambaConfig.server || 'host'}:${sambaConfig.port || 445}/${sambaConfig.share || 'share'}). Check network connection and server reachability.`;
          break;
        case 3:
          detailMessage = `Browser decoding error: The container format or codec is not supported natively by your browser (common with MKV, HEVC/H.265, DTS, AC3 audio). Transcoding is required.`;
          break;
        case 4:
          detailMessage = `Media source format not supported by browser HTML5 player (${currentStreamUrl ? currentStreamUrl.split('.').pop()?.toUpperCase() : 'Unknown format'}).`;
          break;
        default:
          detailMessage = mediaError.message || `Media playback error (code ${mediaError.code}).`;
      }
    }

    console.warn('[MediaPlayerModal] Playback error encountered:', detailMessage, currentStreamUrl);

    if (!transcodeAttemptedRef.current && !isTranscoding && (resolvedLocalFilePath || localVideoFile || currentStreamUrl)) {
      void handleMediaDecodeError(detailMessage);
    } else {
      setPlaybackError(detailMessage);
      setIsPlaying(false);
    }
  }, [currentStreamUrl, handleMediaDecodeError, isAudio, isTranscoding, localVideoFile, resolvedLocalFilePath, sambaConfig]);

  // Skip seconds
  const handleSkip = (seconds: number) => {
    const el = isAudio ? audioRef.current : videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds));
  };

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSkip(-10);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSkip(10);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        setIsMuted((prev) => !prev);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        if (videoRef.current && videoRef.current.requestFullscreen) {
          videoRef.current.requestFullscreen().catch(() => {});
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPlaying, isAudio]);

  // Local file chooser
  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (customLocalBlobUrl) {
      URL.revokeObjectURL(customLocalBlobUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    const nativePath = isTauriPlaybackEnvironment() ? (file as File & { path?: string }).path || null : null;
    resetTranscodedPlayback();
    setNativeTranscodeSourcePath(nativePath);
    setLocalVideoFile(file);
    setCustomLocalBlobUrl(objectUrl);
    setIsManualStreamOverride(false);
    setCurrentTime(0);
    setPlaybackError(null);

    setTimeout(() => {
      startPlayback();
    }, 100);
  };

  const handleOpenLocalFile = async () => {
    if (!isTauriPlaybackEnvironment()) {
      localFileInputRef.current?.click();
      return;
    }

    try {
      const { open } = await import('@tauri-apps/api/dialog');
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'Media', extensions: ['mp4', 'mkv', 'm4v', 'avi', 'mov', 'webm', 'flv', 'ts', 'mp3', 'flac', 'aac', 'wav', 'm4a'] }],
      });
      if (typeof selectedPath !== 'string') return;

      const { convertFileSrc } = await import('@tauri-apps/api/tauri');
      if (customLocalBlobUrl?.startsWith('blob:')) URL.revokeObjectURL(customLocalBlobUrl);
      resetTranscodedPlayback();
      setNativeTranscodeSourcePath(selectedPath);
      setLocalVideoFile(null);
      setCustomLocalBlobUrl(convertFileSrc(selectedPath));
      setIsManualStreamOverride(false);
      setCurrentTime(0);
      setPlaybackError(null);
      setActiveSourceMenu(false);
      setTimeout(startPlayback, 100);
    } catch (error: any) {
      setPlaybackError(error?.message || 'Could not open the selected media file.');
    }
  };

  // Format time (00:00 or 00:00:00)
  const formatTime = (timeInSec: number) => {
    if (isNaN(timeInSec)) return '00:00';
    const h = Math.floor(timeInSec / 3600);
    const m = Math.floor((timeInSec % 3600) / 60);
    const s = Math.floor(timeInSec % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Save playback progress to SQLite
  const handleSaveWhereLeftOff = async () => {
    if (!media) return;
    try {
      const epNumber = selectedEpisode ? selectedEpisode.episodeNumber : undefined;
      const progressPayload = {
        mediaId: media.id,
        mediaTitle: media.title,
        mediaType: media.type,
        timestampSec: Math.floor(currentTime),
        durationSec: Math.floor(duration),
        progressFormatted: `${formatTime(currentTime)} / ${formatTime(duration)}`,
        seasonNumber: selectedSeasonNum,
        episodeNumber: epNumber,
        episodeTitle: selectedEpisode?.title,
        lastWatched: new Date().toISOString(),
      };

      await fetch('/api/db/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progressPayload),
      }).catch(() => {});

      setSavedProgress(true);
      setTimeout(() => setSavedProgress(false), 3000);
    } catch (err) {
      console.error('Failed to save watch progress:', err);
    }
  };

  if (!isOpen || !media) return null;

  // Build direct Samba full path
  const fullNetworkPath = `smb://${sambaConfig.server}/${sambaConfig.share}/${media.recommendedFolderStructure}`;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(fullNetworkPath);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
          if (customLocalBlobUrl) URL.revokeObjectURL(customLocalBlobUrl);
          const url = URL.createObjectURL(file);
          const nativePath = isTauriPlaybackEnvironment() ? (file as File & { path?: string }).path || null : null;
          resetTranscodedPlayback();
          setNativeTranscodeSourcePath(nativePath);
          setLocalVideoFile(file);
          setCustomLocalBlobUrl(url);
          setIsManualStreamOverride(false);
          setCurrentTime(0);
          setPlaybackError(null);
          setTimeout(startPlayback, 100);
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
    >
      {/* Hidden local file input */}
      <input
        ref={localFileInputRef}
        type="file"
        accept="video/*,audio/*,.mkv,.mp4,.avi,.mov,.webm,.flac,.mp3,.m4a"
        className="hidden"
        onChange={handleLocalFileSelect}
      />

      <div
        className={`relative w-full max-w-5xl bg-slate-950 border transition-all rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          isDragOver ? 'border-indigo-500 ring-4 ring-indigo-500/30' : 'border-slate-800'
        }`}
      >
        {/* Drag over indicator banner */}
        {isDragOver && (
          <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-indigo-400 m-3 rounded-xl pointer-events-none animate-in fade-in duration-150">
            <UploadCloud className="w-12 h-12 text-indigo-300 animate-bounce" />
            <span className="text-base font-bold text-white">Drop your MKV / MP4 video file here to play</span>
            <span className="text-xs text-indigo-300">Plays immediately directly from your hardware</span>
          </div>
        )}

        {/* Custom Stream URL Dialog Modal */}
        {showCustomUrlInput && (
          <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <Link className="w-4 h-4 text-indigo-400" />
                  <span>Enter Custom Stream / File URL</span>
                </span>
                <button
                  onClick={() => setShowCustomUrlInput(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300">
                Paste any HTTP/HTTPS direct video stream link, local network URL, or Samba proxy path for this episode/movie:
              </p>
              <input
                type="text"
                value={customStreamInputUrl}
                onChange={(e) => setCustomStreamInputUrl(e.target.value)}
                placeholder="https://example.com/stream.mp4 or /api/samba/stream?path=..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCustomUrlInput(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (customStreamInputUrl.trim()) {
                      if (customLocalBlobUrl) URL.revokeObjectURL(customLocalBlobUrl);
                      resetTranscodedPlayback();
                      setCustomLocalBlobUrl(customStreamInputUrl.trim());
                      setIsManualStreamOverride(false);
                      setShowCustomUrlInput(false);
                      setCurrentTime(0);
                      setPlaybackError(null);
                      setTimeout(startPlayback, 100);
                    }
                  }}
                  disabled={!customStreamInputUrl.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white cursor-pointer"
                >
                  Load & Play Stream
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FFmpeg Diagnostics Modal */}
        {isDiagnosticsModalOpen && (
          <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95 text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-sm font-bold flex items-center gap-2 text-indigo-400">
                  <Activity className="w-4 h-4" />
                  <span>FFmpeg & Codec Diagnostics</span>
                </span>
                <button
                  onClick={() => setIsDiagnosticsModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isCheckingDiagnostics ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                  <span className="text-xs text-slate-300">Probing local FFmpeg & codecs via Tauri bridge...</span>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    diagnosticsData?.available && (diagnosticsData?.hasH264 || diagnosticsData?.hasHevc)
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  }`}>
                    {diagnosticsData?.available && (diagnosticsData?.hasH264 || diagnosticsData?.hasHevc) ? (
                      <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">
                          {diagnosticsData?.available ? 'FFmpeg Installed & Accessible' : 'FFmpeg Not Detected in System PATH'}
                        </span>
                        {diagnosticsData?.source && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                            {diagnosticsData.source === 'tauri-bridge'
                              ? 'Tauri Native IPC'
                              : diagnosticsData.source === 'tauri-shell'
                              ? 'Tauri Shell Command'
                              : 'Backend Server'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] opacity-90">
                        {diagnosticsData?.message || (diagnosticsData?.available ? diagnosticsData?.version : 'FFmpeg is required for transcoding MKV/HEVC/DTS media to HTML5-compatible streams.')}
                      </p>
                    </div>
                  </div>

                  {/* Codec Availability Matrix */}
                  <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block font-bold">Local Hardware & Transcode Codecs</span>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                      <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>H.264 / AVC</span>
                        <span className={diagnosticsData?.hasH264 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                          {diagnosticsData?.hasH264 ? 'Supported' : 'Missing'}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>HEVC / H.265</span>
                        <span className={diagnosticsData?.hasHevc ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                          {diagnosticsData?.hasHevc ? 'Supported' : 'Needs FFmpeg'}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>AAC / MP3</span>
                        <span className="text-emerald-400 font-bold">Supported</span>
                      </div>
                    </div>
                  </div>

                  {/* If detection fails, provide OS instructions & download/install trigger */}
                  {(!diagnosticsData?.available || (!diagnosticsData?.hasH264 && !diagnosticsData?.hasHevc)) && (
                    <div className="space-y-2.5 bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-900/50">
                      <span className="text-indigo-300 font-bold block">How to Install FFmpeg on {diagnosticsData?.os || 'your OS'}</span>
                      <div className="space-y-1.5 font-mono text-[11px] text-slate-300">
                        <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                          <span>macOS (Homebrew):</span>
                          <span className="text-emerald-300">brew install ffmpeg</span>
                        </div>
                        <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                          <span>Windows (Winget):</span>
                          <span className="text-emerald-300">winget install Gyan.FFmpeg</span>
                        </div>
                        <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                          <span>Linux (APT):</span>
                          <span className="text-emerald-300">sudo apt update && sudo apt install ffmpeg</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {verificationFeedback && (
                    <div className="p-2.5 rounded-lg bg-indigo-950/50 border border-indigo-500/40 text-[11px] text-indigo-200">
                      {verificationFeedback}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center gap-2">
                      {(!diagnosticsData?.available || (!diagnosticsData?.hasH264 && !diagnosticsData?.hasHevc)) ? (
                        <button
                          id="btn-download-install-ffmpeg"
                          onClick={handleDownloadInstallFfmpeg}
                          disabled={isVerifyingSystem}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                        >
                          {isVerifyingSystem ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          <span>Download / Install FFmpeg</span>
                        </button>
                      ) : null}

                      <button
                        onClick={runFfmpegDiagnostics}
                        disabled={isCheckingDiagnostics}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                        title="Re-run system-level verification via Tauri bridge"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDiagnostics ? 'animate-spin' : ''}`} />
                        <span>Verify System Codecs</span>
                      </button>
                    </div>

                    <button
                      onClick={() => setIsDiagnosticsModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 truncate">
            <span
              className={`p-2 rounded-lg text-white ${
                isAudio
                  ? 'bg-emerald-600'
                  : media.type === 'series'
                  ? 'bg-purple-600'
                  : 'bg-cyan-600'
              }`}
            >
              {isAudio ? (
                <Music className="w-4 h-4" />
              ) : media.type === 'series' ? (
                <Tv className="w-4 h-4" />
              ) : (
                <Film className="w-4 h-4" />
              )}
            </span>
            <div className="truncate">
              <h2 className="text-sm sm:text-base font-bold text-white truncate flex items-center gap-2">
                <span>{media.title}</span>
                <span className="text-xs text-slate-400 font-normal">({media.year})</span>
                {localVideoFile && (
                  <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700/60 text-emerald-300 text-[10px] font-mono">
                    Local: {localVideoFile.name}
                  </span>
                )}
              </h2>
              {selectedEpisode && (
                <p className="text-xs text-purple-400 font-medium truncate">
                  Season {selectedSeasonNum} • Episode {selectedEpisode.episodeNumber}: {selectedEpisode.title}
                </p>
              )}
              {selectedTrack && isAudio && (
                <p className="text-xs text-emerald-400 font-medium truncate">
                  Track {selectedTrack.trackNumber}: {selectedTrack.title}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pick Local Video/Audio File Button */}
            <button
              id="player-btn-open-local"
              onClick={() => void handleOpenLocalFile()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition cursor-pointer"
              title="Select and play any local video/audio file from your computer or mounted Samba volume"
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Play Local File</span>
            </button>

            {/* Save Watch Progress Button */}
            <button
              id="player-btn-save-progress"
              onClick={handleSaveWhereLeftOff}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                savedProgress
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Record current time position in SQLite as where you left off"
            >
              {savedProgress ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved to DB!</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Save Timestamp</span>
                </>
              )}
            </button>

            {/* FFmpeg Codec Diagnostics Button */}
            <button
              id="player-btn-diagnostics"
              onClick={() => {
                setIsDiagnosticsModalOpen(true);
                runFfmpegDiagnostics();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-200 border border-indigo-700/60 transition cursor-pointer"
              title="Open FFmpeg & Codec Diagnostics"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Diagnostics</span>
            </button>

            {/* Smart Resume Toggle Button */}
            <button
              id="player-btn-smart-resume"
              onClick={() => setSmartResumeEnabled((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                smartResumeEnabled
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title={smartResumeEnabled ? 'Smart Resume Enabled: Automatically resumes playback position from SQLite vault' : 'Smart Resume Disabled'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${smartResumeEnabled ? 'text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Smart Resume</span>
            </button>

            {/* Subtitles Dropdown Button */}
            <div className="relative">
              <input
                ref={subtitleFileInputRef}
                type="file"
                accept=".srt,.vtt"
                className="hidden"
                onChange={handleSubtitleFileSelect}
              />
              <button
                id="player-btn-subtitles"
                onClick={() => setActiveSubtitleMenu((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition cursor-pointer"
                title="Select or load subtitle files (.srt, .vtt)"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">
                  {activeSubtitleIndex >= 0 ? subtitleTracks[activeSubtitleIndex]?.name : 'Subtitles'}
                </span>
              </button>

              {activeSubtitleMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50">
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    Subtitles & CC
                  </div>
                  <button
                    onClick={() => {
                      setActiveSubtitleIndex(-1);
                      setActiveSubtitleMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between hover:bg-slate-800 transition ${
                      activeSubtitleIndex === -1 ? 'text-indigo-400 font-semibold bg-indigo-950/50' : 'text-slate-300'
                    }`}
                  >
                    <span>Off (No Subtitles)</span>
                    {activeSubtitleIndex === -1 && <Check className="w-3.5 h-3.5" />}
                  </button>
                  {subtitleTracks.map((tr, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveSubtitleIndex(idx);
                        setActiveSubtitleMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between hover:bg-slate-800 transition truncate ${
                        activeSubtitleIndex === idx ? 'text-indigo-400 font-semibold bg-indigo-950/50' : 'text-slate-300'
                      }`}
                    >
                      <span className="truncate">{tr.name}</span>
                      {activeSubtitleIndex === idx && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  ))}
                  <div className="border-t border-slate-800 my-1" />
                  <div className="pt-1 px-3 pb-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
                      <span>Subtitle Offset</span>
                      <span className="font-mono text-cyan-300">{subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}</span>
                    </div>
                    <div className="flex items-center gap-2 pb-1">
                      <input
                        type="range"
                        min="-5"
                        max="5"
                        step="0.5"
                        value={subtitleOffset}
                        onChange={(e) => setSubtitleOffset(parseFloat(e.target.value))}
                        className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <button
                        onClick={() => setSubtitleOffset(0)}
                        className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800"
                        title="Reset Offset"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-slate-800 my-1" />
                  <button
                    onClick={() => {
                      setActiveSubtitleMenu(false);
                      subtitleFileInputRef.current?.click();
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-indigo-300 hover:bg-slate-800 flex items-center gap-2 transition"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Load .srt or .vtt file...</span>
                  </button>
                </div>
              )}
            </div>

            {/* Direct External VLC Player Launch Button */}
            <button
              onClick={handleLaunchExternalVlc}
              className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Open currently active video stream in VLC Media Player"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">VLC</span>
            </button>

            {/* Direct External IINA Player Launch Button */}
            <button
              onClick={handleLaunchExternalIina}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Open currently active video stream in IINA"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">IINA</span>
            </button>

            {/* Toggle Info Overlay Button */}
            <button
              id="player-btn-info-overlay"
              onClick={() => setShowInfoOverlay((prev) => !prev)}
              className={`p-2 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                showInfoOverlay
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Toggle media diagnostics and stream info overlay"
            >
              <Info className="w-4 h-4 text-cyan-400" />
              <span className="hidden md:inline">Info</span>
            </button>

            <button
              onClick={() => {
                if (customLocalBlobUrl) {
                  URL.revokeObjectURL(customLocalBlobUrl);
                }
                recordWatchHistory();
                onClose();
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!isVolumeMounted && (
          <div className="bg-rose-950/95 border-b border-rose-600/60 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <strong>Volume Not Mounted:</strong> Share <code className="bg-rose-900/80 px-1 py-0.5 rounded font-mono text-rose-100">//{sambaConfig.server || 'nas.local'}/{sambaConfig.share || 'media'}</code> was not found in system volumes.
              </span>
            </div>
            <button
              onClick={() => {
                if (onNavigateToMountHub) {
                  onClose();
                  onNavigateToMountHub();
                } else if (onTestConnection) {
                  onTestConnection();
                }
              }}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg shadow transition cursor-pointer flex items-center gap-1.5"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Mount Volume</span>
            </button>
          </div>
        )}

        {isTranscoding && (
          <div className="bg-amber-950/90 border-b border-amber-600/50 px-4 py-2 text-xs text-amber-200 flex items-center gap-2 shrink-0">
            <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            <span>Converting media to H.264/AAC for in-app playback...</span>
          </div>
        )}

        {/* Player Stage (Video or Audio) */}
        <div className="relative bg-black flex items-center justify-center overflow-hidden min-h-[280px] sm:min-h-[400px] max-h-[520px]">
          {/* Audio Track Toast Notification Banner */}
          {audioToastMessage && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-indigo-900/90 border border-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
              <Volume2 className="w-4 h-4 text-indigo-300" />
              <span>{audioToastMessage}</span>
            </div>
          )}
          {isAudio ? (
            /* Audio Visualizer Stage */
            <div className="w-full py-12 px-6 flex flex-col items-center justify-center space-y-6 bg-gradient-to-b from-slate-900 via-slate-950 to-black">
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-2xl border border-emerald-500/30 group">
                <img
                  src={media.posterUrl}
                  alt={media.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div
                  onClick={togglePlay}
                  className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer group-hover:bg-black/20 transition-all"
                >
                  <div
                    className={`w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg transition-transform ${
                      isPlaying ? 'scale-90 animate-pulse' : 'scale-100 hover:scale-110'
                    }`}
                  >
                    {isPlaying ? <Pause className="w-7 h-7 fill-white" /> : <Play className="w-7 h-7 fill-white ml-0.5" />}
                  </div>
                </div>
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-white">
                  {selectedTrack?.title || media.title}
                </h3>
                <p className="text-xs text-emerald-400 font-medium">
                  {media.artists?.join(', ') || 'Lossless Audio Master'}
                </p>
                <p className="text-[11px] text-slate-400 font-mono">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </p>
              </div>

              <audio
                ref={audioRef}
                src={currentStreamUrl}
                autoPlay
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration);
                  setPlaybackError(null);
                }}
                onError={handleMediaElementError}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => {
                  setIsPlaying(true);
                  setAutoplayBlocked(false);
                }}
                onPause={() => setIsPlaying(false)}
              />
            </div>
          ) : (
            /* Video Stage */
            <div className="relative w-full h-full flex items-center justify-center bg-black min-h-[300px]">
              {/* Series Episode Info / Quick Source Switcher Bar */}
              {media.type === 'series' && (
                <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 p-2 px-3 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 text-xs shadow-lg">
                  <div className="flex items-center gap-2 truncate">
                    <span className="px-2 py-0.5 rounded bg-purple-900/60 border border-purple-700/50 text-purple-300 font-bold text-[11px]">
                      S{selectedSeasonNum}E{selectedEpisode?.episodeNumber || 1}
                    </span>
                    <span className="text-white font-medium truncate">
                      {selectedEpisode?.title || media.title}
                    </span>
                    {localVideoFile ? (
                      <span className="hidden sm:inline-flex items-center gap-1 text-emerald-400 text-[10px] font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                        📁 File: {localVideoFile.name}
                      </span>
                    ) : customLocalBlobUrl?.startsWith('/api/samba/stream') ? (
                      <span className="hidden sm:inline-flex items-center gap-1 text-cyan-400 text-[10px] font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                        🌐 Samba Stream
                      </span>
                    ) : (
                      <span className="hidden sm:inline-flex items-center gap-1 text-indigo-300 text-[10px] font-mono bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                        🎬 Direct Stream
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                          onClick={() => void handleOpenLocalFile()}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition border border-slate-700"
                      title="Load local video file for this episode"
                    >
                      <FolderOpen className="w-3 h-3 text-emerald-400" />
                      <span className="hidden md:inline">Play Episode File</span>
                    </button>
                    {sambaStreamUrl && (
                      <button
                        onClick={() => {
                          resetTranscodedPlayback();
                          setCustomLocalBlobUrl(sambaStreamUrl);
                          setIsManualStreamOverride(false);
                          setCurrentTime(0);
                          setPlaybackError(null);
                          setTimeout(startPlayback, 100);
                        }}
                        className="px-2 py-1 rounded bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition border border-cyan-700/50"
                        title="Stream direct from Samba server endpoint"
                      >
                        <Globe className="w-3 h-3 text-cyan-400" />
                        <span className="hidden md:inline">Samba Stream</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowCustomUrlInput(true)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition border border-slate-700"
                      title="Paste direct video URL"
                    >
                      <Link className="w-3 h-3 text-indigo-400" />
                      <span className="hidden md:inline">Custom URL</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Smart Resuming Playback Toast Notification */}
              {resumingToast && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-emerald-950/95 border border-emerald-500/80 text-emerald-200 text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 backdrop-blur-md">
                  <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span>{resumingToast}</span>
                </div>
              )}

              <video
                ref={videoRef}
                src={currentStreamUrl}
                playsInline
                preload="metadata"
                className="w-full max-h-[480px] object-contain bg-black"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration);
                  setPlaybackError(null);
                }}
                onError={handleMediaElementError}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => {
                  setIsPlaying(true);
                  setAutoplayBlocked(false);
                }}
                onPause={() => setIsPlaying(false)}
                onClick={togglePlay}
              >
                {activeSubtitleIndex >= 0 && subtitleTracks[activeSubtitleIndex]?.url && (
                  <track
                    kind="subtitles"
                    src={subtitleTracks[activeSubtitleIndex].url}
                    srcLang={subtitleTracks[activeSubtitleIndex].lang}
                    label={subtitleTracks[activeSubtitleIndex]?.name || 'Subtitles'}
                    default
                  />
                )}
              </video>

              {/* Transcode Status & Readiness Indicator */}
              <div className="absolute top-2 right-2 z-30 flex flex-col items-end gap-1.5">
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-md shadow-lg ${
                  isTranscoding 
                    ? 'bg-amber-950/90 text-amber-300 border border-amber-800'
                    : transcodedPlaybackUrl
                      ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-800'
                      : 'bg-slate-900/90 text-slate-300 border border-slate-700'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${isTranscoding ? 'bg-amber-500 animate-pulse' : 'bg-current'}`} />
                  {isTranscoding 
                    ? `Transcoding: ${Math.round(transcodingProgress)}%` 
                    : transcodedPlaybackUrl 
                      ? 'Stream Ready' 
                      : 'Native Playback'}
                </div>

                <button
                  id="player-badge-readiness"
                  onClick={() => {
                    setIsDiagnosticsModalOpen(true);
                    runFfmpegDiagnostics();
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-md transition cursor-pointer shadow-lg ${
                    transcodeReadinessStatus.ready
                      ? 'bg-slate-900/80 text-cyan-300 border border-cyan-800/60 hover:bg-slate-900'
                      : 'bg-amber-950/90 text-amber-200 border border-amber-600 animate-pulse hover:bg-amber-900'
                  }`}
                  title="Click to view FFmpeg diagnostics and repair transcode pipeline"
                >
                  <Activity className="w-3 h-3 text-indigo-400" />
                  <span>Readiness: {transcodeReadinessStatus.message}</span>
                </button>
              </div>

              {/* Toggleable Stream & Metadata Info Overlay */}
              {showInfoOverlay && (
                <div className="absolute top-4 left-4 bg-slate-950/85 backdrop-blur-md border border-indigo-500/40 rounded-xl p-4 text-xs text-white z-30 shadow-2xl space-y-2 max-w-sm pointer-events-none animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-semibold text-indigo-400">
                    <span className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" /> Stream & Media Info
                    </span>
                    <span className="text-[10px] font-mono text-cyan-300">LIVE STATS</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300 font-mono">
                    <div>
                      <span className="text-slate-500 block">Resolution</span>
                      <span className="text-white font-semibold">1920x1080 (1080p HD)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Frame Rate</span>
                      <span className="text-white font-semibold">23.976 fps</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Video Bitrate</span>
                      <span className="text-emerald-400 font-semibold">8.4 Mbps (H.264)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Audio Codec</span>
                      <span className="text-emerald-400 font-semibold">AAC 5.1 (320kbps)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Container</span>
                      <span className="text-purple-400 font-semibold">{localVideoFile ? localVideoFile.name.split('.').pop()?.toUpperCase() : 'MP4 / MKV'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Subtitles</span>
                      <span className="text-cyan-300 font-semibold">{activeSubtitleIndex >= 0 ? subtitleTracks[activeSubtitleIndex]?.name : 'Off'}</span>
                    </div>
                  </div>
                  <div className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 truncate">
                    <span className="text-slate-500 mr-1">Source:</span>
                    <span className="font-mono text-slate-300">{localVideoFile ? localVideoFile.name : currentStreamUrl}</span>
                  </div>
                  <div className="pt-0.5 text-[10px] text-slate-400 truncate">
                    <span className="text-slate-500 mr-1">Resolved Path:</span>
                    <span className="font-mono text-emerald-300">{validatedPlaybackPath.resolvedPath} ({validatedPlaybackPath.platform})</span>
                  </div>
                </div>
              )}

              {/* Autoplay / Click-to-Play Overlay (Ensures guaranteed playback on browser policies) */}
              {(!isPlaying || autoplayBlocked) && !playbackError && (
                <div
                  onClick={togglePlay}
                  className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-black/40 group"
                >
                  <div className="relative flex items-center justify-center mb-3">
                    <div className="absolute w-20 h-20 rounded-full bg-indigo-500/30 animate-ping"></div>
                    <div className="w-16 h-16 rounded-full bg-indigo-600 group-hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl transition-transform group-hover:scale-110">
                      <Play className="w-8 h-8 fill-white ml-1" />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-white tracking-wide drop-shadow-md">
                    Click to Start Playback
                  </span>
                  <span className="text-xs text-slate-300 mt-1">
                    Space to Play • Arrows to Seek • M to Mute
                  </span>
                </div>
              )}

              {/* Error banner with detailed diagnostics & recovery actions */}
              {playbackError && (
                <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-4 z-20 animate-in fade-in duration-200">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
                    <AlertCircle className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-2 max-w-lg mx-auto">
                    <h4 className="text-base font-bold text-white">Playback Error</h4>
                    <p className="text-xs text-rose-300 font-medium bg-rose-950/50 p-3 rounded-xl border border-rose-900/60 text-left font-mono break-words">
                      {playbackError}
                    </p>
                    <div className="text-[11px] text-slate-400 space-y-1 pt-1 text-left bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                      <div><strong className="text-slate-300">Target File:</strong> <span className="font-mono text-cyan-300">{media?.title}</span></div>
                      <div><strong className="text-slate-300">Resolved Path:</strong> <span className="font-mono text-emerald-300">{validatedPlaybackPath.resolvedPath || 'Unresolved'}</span></div>
                      <div><strong className="text-slate-300">Network Share:</strong> <span className="font-mono text-indigo-300">//{sambaConfig.server || 'nas.local'}/{sambaConfig.share || 'media'}</span></div>
                      <div><strong className="text-slate-300">Codecs Status:</strong> <span className="font-mono text-amber-300">{transcodeReadinessStatus.message}</span></div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 max-w-xl">
                    <button
                      onClick={handleLaunchExternalVlc}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition"
                      title="Launch VLC media player with this stream or file"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Play in VLC</span>
                    </button>
                    <button
                      onClick={handleLaunchExternalIina}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition"
                      title="Launch IINA player on macOS"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Play in IINA</span>
                    </button>
                    {sambaStreamUrl && (
                      <button
                        onClick={() => {
                          setCustomLocalBlobUrl(null);
                          resetTranscodedPlayback();
                          setPlaybackError(null);
                          setTimeout(startPlayback, 100);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition border border-slate-700"
                        title="Retry direct Samba stream from server"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Stream</span>
                      </button>
                    )}
                    <button
                      onClick={() => void handleOpenLocalFile()}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                      title="Select and play video file directly from your disk"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Select Local File</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsDiagnosticsModalOpen(true);
                        runFfmpegDiagnostics();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition border border-slate-700"
                      title="View FFmpeg diagnostics and codec readiness"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>FFmpeg Diagnostics</span>
                    </button>
                    <button
                      onClick={handleProbeSambaStream}
                      disabled={isProbeRunning}
                      className="px-3.5 py-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900/80 disabled:opacity-50 text-indigo-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition border border-indigo-700/60"
                      title="Probe Samba Stream: read first 1MB chunk to verify read access"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isProbeRunning ? 'animate-spin' : ''}`} />
                      <span>{isProbeRunning ? 'Probing...' : 'Probe Share (1MB)'}</span>
                    </button>
                    {suggestTestConnection && (
                      <button
                        onClick={() => {
                          if (onTestConnection) {
                            onTestConnection();
                          } else {
                            fetch('/api/samba/test', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(sambaConfig),
                            })
                              .then(res => res.json())
                              .then(data => {
                                alert(`Samba Connection Test: ${data.message || (data.connected ? 'Connected successfully!' : 'Connection failed')}`);
                              })
                              .catch(err => alert(`Test connection error: ${err.message}`));
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 shadow-lg shadow-cyan-600/30 transition border border-cyan-400"
                        title="Run Test Connection utility to diagnose network mount issues"
                      >
                        <HardDrive className="w-4 h-4" />
                        <span>Run Connection Test</span>
                      </button>
                    )}
                  </div>
                  {probeResult && (
                    <div className={`w-full max-w-lg text-xs px-3 py-2 rounded-lg border flex items-center justify-between gap-3 my-1 ${probeResult.success ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-red-950/60 border-red-500/40 text-red-300'}`}>
                      <div className="flex items-center gap-2 truncate">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="font-mono truncate">{probeResult.message}</span>
                      </div>
                      <button onClick={() => setProbeResult(null)} className="text-[10px] uppercase font-bold underline cursor-pointer shrink-0">Dismiss</button>
                    </div>
                  )}
                  {externalPlayerStatus && (
                    <div className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-lg">
                      {externalPlayerStatus}
                    </div>
                  )}
                </div>
              )}

              {/* Next Episode Floating Banner Overlay */}
              {isNearEnd && nextEpInfo && !playbackError && (
                <div className="absolute bottom-6 right-6 bg-slate-900/95 backdrop-blur-md border border-purple-500/60 rounded-xl p-4 shadow-2xl z-30 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                      Up Next
                    </span>
                    <h5 className="text-xs font-bold text-white">
                      S{nextEpInfo.seasonNum}E{nextEpInfo.episode.episodeNumber} - {nextEpInfo.episode.title}
                    </h5>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedSeasonNum(nextEpInfo.seasonNum);
                      setSelectedEpisode(nextEpInfo.episode);
                      setCurrentTime(0);
                      setTimeout(startPlayback, 100);
                    }}
                    className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-600/40 cursor-pointer transition"
                  >
                    <span>Play Next</span>
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Player Controls Bar */}
        <div className="px-5 py-3.5 bg-slate-900/95 border-t border-slate-800 space-y-2.5">
          {/* Progress Slider with Watch Ticks / Highlights */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400 w-14 text-right">
              {formatTime(currentTime)}
            </span>
            <div className="relative flex-1 flex items-center">
              {/* Watch Milestone Ticks */}
              <div className="absolute inset-x-0 h-1.5 pointer-events-none flex justify-between px-1 z-20">
                {[0.25, 0.5, 0.75, 0.9].map((ratio) => {
                  const isReached = (currentTime / (duration || 1)) >= ratio;
                  return (
                    <div
                      key={ratio}
                      className={`w-1 h-3 rounded-full -top-0.5 transition-all ${
                        isReached
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                          : 'bg-slate-700/80'
                      }`}
                      style={{ position: 'absolute', left: `${ratio * 100}%` }}
                      title={`Milestone ${ratio * 100}%`}
                    />
                  );
                })}
              </div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const newTime = parseFloat(e.target.value);
                  setCurrentTime(newTime);
                  if (videoRef.current) videoRef.current.currentTime = newTime;
                  if (audioRef.current) audioRef.current.currentTime = newTime;
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition relative z-10"
              />
            </div>
            <span className="text-xs font-mono text-slate-400 w-14">
              {formatTime(duration)}
            </span>
          </div>

          {/* Control Buttons Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Play/Pause & Skips */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSkip(-10)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Rewind 10 seconds (← Arrow)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                id="player-btn-toggle-play"
                onClick={togglePlay}
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition shadow-md shadow-indigo-600/30 cursor-pointer"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
              </button>

              <button
                onClick={() => handleSkip(10)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Fast-forward 10 seconds (→ Arrow)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Mute/Unmute (M)"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-slate-300" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setIsMuted(false);
                  }}
                  className="w-16 sm:w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>

            {/* Right Controls: Stream Source Switcher, Speed Menu, Fullscreen */}
            <div className="flex items-center gap-2 text-xs">
              {/* Audio Track Languages Dropdown */}
              <div className="relative">
                <button
                  id="player-btn-audio-tracks"
                  onClick={() => setActiveAudioMenu(!activeAudioMenu)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium flex items-center gap-1.5 transition cursor-pointer"
                  title="Select audio track language (MKV multi-audio support)"
                >
                  <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Audio:</span>
                  <span className="font-semibold truncate max-w-[90px]">
                    {audioTracks.find((t) => t.id === activeAudioTrackId)?.name?.split(' ')[0] || 'Audio'}
                  </span>
                </button>

                {activeAudioMenu && (
                  <div className="absolute bottom-full mb-2 right-0 bg-slate-900 border border-slate-800 rounded-xl p-1.5 shadow-2xl space-y-1 z-30 w-60 animate-in fade-in zoom-in-95">
                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      MKV / Multi-Audio Streams
                    </div>
                    {audioTracks.map((trk) => (
                      <button
                        key={trk.id}
                        onClick={() => {
                          setActiveAudioTrackId(trk.id);
                          setActiveAudioMenu(false);
                          showAudioToast(`Switched active audio track to ${trk.name || 'Track'} (${trk.codec || 'Audio'})`);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                          activeAudioTrackId === trk.id
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{trk.name || 'Audio Track'}</span>
                        <span className="text-[10px] font-mono opacity-80">{trk.codec}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Stream Source Selector Dropdown */}
              <div className="relative">
                <button
                  id="player-btn-source-menu"
                  onClick={() => setActiveSourceMenu(!activeSourceMenu)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium flex items-center gap-1.5 transition cursor-pointer"
                  title="Switch video streaming source or local file"
                >
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Source:</span>
                  <span className="font-semibold truncate max-w-[100px]">
                    {customLocalBlobUrl
                      ? 'Local File'
                      : transcodedPlaybackUrl
                      ? 'Transcoded'
                      : 'Samba Stream'}
                  </span>
                </button>

                {activeSourceMenu && (
                  <div className="absolute bottom-full mb-2 right-0 bg-slate-900 border border-slate-800 rounded-xl p-1.5 shadow-2xl space-y-1 z-30 w-72 animate-in fade-in zoom-in-95">
                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      Select Playback Source
                    </div>

                    {sambaStreamUrl && (
                      <button
                        onClick={() => {
                          resetTranscodedPlayback();
                          if (customLocalBlobUrl) {
                            URL.revokeObjectURL(customLocalBlobUrl);
                            setCustomLocalBlobUrl(null);
                            setLocalVideoFile(null);
                          }
                          setCustomLocalBlobUrl(sambaStreamUrl);
                          setIsManualStreamOverride(false);
                          setActiveSourceMenu(false);
                          setCurrentTime(0);
                          setPlaybackError(null);
                          setTimeout(startPlayback, 100);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                          customLocalBlobUrl === sambaStreamUrl
                            ? 'bg-cyan-600 text-white font-bold'
                            : 'text-cyan-300 hover:bg-cyan-950/50'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Samba HTTP Stream (SMB)</span>
                        </span>
                        <span className="text-[10px] px-1 bg-cyan-900/60 rounded font-mono shrink-0">Server</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                          void handleOpenLocalFile();
                        setActiveSourceMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-300 hover:bg-emerald-950/50 flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Open Local File...</span>
                      </span>
                      <span className="text-[10px] px-1 bg-emerald-900/60 rounded font-mono">Disk</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveSourceMenu(false);
                        setShowCustomUrlInput(true);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-300 hover:bg-indigo-950/50 flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Link className="w-3.5 h-3.5" />
                        <span>Enter Custom Stream URL...</span>
                      </span>
                      <span className="text-[10px] px-1 bg-indigo-900/60 rounded font-mono">Custom</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Playback Speed Switcher */}
              <div className="relative">
                <button
                  onClick={() => setActiveSpeedMenu(!activeSpeedMenu)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold flex items-center gap-1 transition cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{playbackRate}x</span>
                </button>

                {activeSpeedMenu && (
                  <div className="absolute bottom-full mb-2 right-0 bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-xl space-y-0.5 z-20 w-24">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => {
                          setPlaybackRate(rate);
                          setActiveSpeedMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                          playbackRate === rate
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {rate}x Speed
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fullscreen (for video) */}
              {!isAudio && (
                <button
                  onClick={() => {
                    if (videoRef.current && videoRef.current.requestFullscreen) {
                      videoRef.current.requestFullscreen().catch(() => {});
                    }
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Fullscreen (F)"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Drawer: Series Episodes / Tracks & External Desktop Player Launchers */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 overflow-y-auto max-h-48 space-y-3 text-xs">
          {/* TV Series Episode guide switcher */}
          {media.type === 'series' && media.seasons && media.seasons.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-purple-400" />
                  <span>Switch Episode</span>
                </span>
                <div className="flex gap-1">
                  {media.seasons.map((s) => (
                    <button
                      key={s.seasonNumber}
                      onClick={() => setSelectedSeasonNum(s.seasonNumber)}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                        selectedSeasonNum === s.seasonNumber
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      S{s.seasonNumber}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {media.seasons
                  .find((s) => s.seasonNumber === selectedSeasonNum)
                  ?.episodes?.map((ep) => {
                    const isSelected = selectedEpisode?.episodeNumber === ep.episodeNumber;
                    return (
                      <button
                        key={ep.episodeNumber}
                        onClick={() => {
                          setSelectedEpisode(ep);
                          setCurrentTime(0);
                          setTimeout(startPlayback, 100);
                        }}
                        className={`text-left p-2 rounded-lg border transition text-xs flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-purple-950/60 border-purple-500 text-white font-semibold'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <span className="truncate">
                          E{String(ep.episodeNumber).padStart(2, '0')} - {ep.title}
                        </span>
                        {isSelected && <Radio className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Music Tracklist Switcher */}
          {isAudio && media.tracks && media.tracks.length > 0 && (
            <div className="space-y-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <ListMusic className="w-3.5 h-3.5 text-emerald-400" />
                <span>Track Playlist</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {media.tracks.map((track) => {
                  const isSelected = selectedTrack?.trackNumber === track.trackNumber;
                  return (
                    <button
                      key={track.trackNumber}
                      onClick={() => {
                        setSelectedTrack(track);
                        setCurrentTime(0);
                        setTimeout(startPlayback, 100);
                      }}
                      className={`text-left p-2 rounded-lg border transition text-xs flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-950/60 border-emerald-500 text-white font-semibold'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="truncate">
                        {String(track.trackNumber).padStart(2, '0')}. {track.title}
                      </span>
                      {isSelected && <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* External Desktop Players & Network Path */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono truncate max-w-md text-emerald-300" title={validatedPlaybackPath.resolvedPath}>
                {validatedPlaybackPath.resolvedPath}
              </span>
              <button
                onClick={handleCopyPath}
                className="hover:text-white underline cursor-pointer"
              >
                {copiedUrl ? 'Copied SMB URL!' : 'Copy SMB Path'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLaunchExternalVlc}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 font-semibold border border-amber-500/30 flex items-center gap-1 transition cursor-pointer"
                title="Launch VLC media player with this stream or file"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in VLC</span>
              </button>
              <button
                type="button"
                onClick={handleLaunchExternalIina}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 font-semibold border border-indigo-500/30 flex items-center gap-1 transition cursor-pointer"
                title="Launch IINA on macOS"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in IINA</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
