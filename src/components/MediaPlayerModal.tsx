import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { MediaMetadata, EpisodeMetadata, TrackMetadata, SambaConfig } from '../types';

interface MediaPlayerModalProps {
  media: MediaMetadata;
  isOpen: boolean;
  onClose: () => void;
  sambaConfig: SambaConfig;
  initialEpisode?: EpisodeMetadata;
  initialTrack?: TrackMetadata;
}

export const MediaPlayerModal: React.FC<MediaPlayerModalProps> = ({
  media,
  isOpen,
  onClose,
  sambaConfig,
  initialEpisode,
  initialTrack,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [savedProgress, setSavedProgress] = useState(false);
  const [activeSpeedMenu, setActiveSpeedMenu] = useState(false);

  // Series Episode Tracking
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(
    initialEpisode?.seasonNumber || media.seasons?.[0]?.seasonNumber || 1
  );
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeMetadata | undefined>(
    initialEpisode || media.seasons?.[0]?.episodes?.[0]
  );

  // Track tracking for Music Albums / Audiobooks
  const [selectedTrack, setSelectedTrack] = useState<TrackMetadata | undefined>(
    initialTrack || media.tracks?.[0]
  );

  const isAudio = media.type === 'album' || media.recommendedFolderStructure.toLowerCase().includes('audio books');

  // Determine active streaming/playback source
  const currentStreamUrl =
    media.localBlobUrl ||
    selectedEpisode?.playbackUrl ||
    selectedTrack?.playbackUrl ||
    media.playbackUrl ||
    (isAudio
      ? 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
      : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');

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

  // Reset state when media changes
  useEffect(() => {
    if (initialEpisode) {
      setSelectedSeasonNum(initialEpisode.seasonNumber);
      setSelectedEpisode(initialEpisode);
    } else if (media.seasons?.[0]?.episodes?.[0]) {
      setSelectedSeasonNum(media.seasons[0].seasonNumber);
      setSelectedEpisode(media.seasons[0].episodes[0]);
    }

    if (initialTrack) {
      setSelectedTrack(initialTrack);
    } else if (media.tracks?.[0]) {
      setSelectedTrack(media.tracks[0]);
    }

    setCurrentTime(0);
    setIsPlaying(true);
  }, [media, initialEpisode, initialTrack]);

  // Handle Play/Pause
  const togglePlay = () => {
    const el = isAudio ? audioRef.current : videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  // Skip 10 seconds
  const handleSkip = (seconds: number) => {
    const el = isAudio ? audioRef.current : videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds));
  };

  // Time format helper (00:00 or 00:00:00)
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

  // Build direct Samba full path
  const fullNetworkPath = `smb://${sambaConfig.server}/${sambaConfig.share}/${media.recommendedFolderStructure}`;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(fullNetworkPath);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 truncate">
            <span
              className={`p-1.5 rounded-lg text-white ${
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
                  <span>Position Saved!</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Save Where I Left Off</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Player Stage (Video or Audio) */}
        <div className="relative bg-black flex items-center justify-center overflow-hidden min-h-[260px] sm:min-h-[380px] max-h-[500px]">
          {isAudio ? (
            /* Audio Visualizer Stage */
            <div className="w-full py-12 px-6 flex flex-col items-center justify-center space-y-6 bg-gradient-to-b from-slate-900 via-slate-950 to-black">
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-2xl border border-emerald-500/30 group">
                <img
                  src={media.posterUrl}
                  alt={media.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/90 text-white flex items-center justify-center shadow-lg animate-pulse">
                    <Music className="w-7 h-7" />
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
              </div>

              <audio
                ref={audioRef}
                src={currentStreamUrl}
                autoPlay
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
          ) : (
            /* Video Stage */
            <div className="w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                src={currentStreamUrl}
                autoPlay
                playsInline
                className="w-full max-h-[480px] object-contain"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={togglePlay}
              />
            </div>
          )}
        </div>

        {/* Player Controls Bar */}
        <div className="px-5 py-3.5 bg-slate-900/95 border-t border-slate-800 space-y-2.5">
          {/* Progress Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400 w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                setCurrentTime(newTime);
                if (videoRef.current) videoRef.current.currentTime = newTime;
                if (audioRef.current) audioRef.current.currentTime = newTime;
              }}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition"
            />
            <span className="text-xs font-mono text-slate-400 w-12">
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
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                id="player-btn-toggle-play"
                onClick={togglePlay}
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition shadow-md shadow-indigo-600/30 cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
              </button>

              <button
                onClick={() => handleSkip(10)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Fast-forward 10 seconds"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 text-slate-400 hover:text-white transition"
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

            {/* Right: Playback Speed, Fullscreen, Open in VLC / IINA */}
            <div className="flex items-center gap-2 text-xs">
              {/* Speed Switcher */}
              <div className="relative">
                <button
                  onClick={() => setActiveSpeedMenu(!activeSpeedMenu)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold flex items-center gap-1 transition"
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
                        className={`w-full text-left px-2.5 py-1 rounded-lg text-xs font-semibold ${
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
                    if (videoRef.current) {
                      if (videoRef.current.requestFullscreen) {
                        videoRef.current.requestFullscreen();
                      }
                    }
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="Fullscreen"
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
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
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
                        }}
                        className={`text-left p-2 rounded-lg border transition text-xs flex items-center justify-between ${
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
                      }}
                      className={`text-left p-2 rounded-lg border transition text-xs flex items-center justify-between ${
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
              <span className="font-mono truncate max-w-md">
                //{sambaConfig.server}/{sambaConfig.share}/{media.recommendedFolderStructure}
              </span>
              <button
                onClick={handleCopyPath}
                className="hover:text-white underline cursor-pointer"
              >
                {copiedUrl ? 'Copied SMB URL!' : 'Copy SMB Path'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`vlc://${currentStreamUrl}`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 font-semibold border border-amber-500/30 flex items-center gap-1 transition"
                title="Launch VLC media player with this stream"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in VLC</span>
              </a>
              <a
                href={`iina://weblink?url=${encodeURIComponent(currentStreamUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 font-semibold border border-indigo-500/30 flex items-center gap-1 transition"
                title="Launch IINA on macOS"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in IINA</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
