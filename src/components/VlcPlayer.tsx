import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';

interface VlcTrack {
  id: number;
  name: string;
}

interface VlcStatus {
  state: string;
  timeMs: number;
  lengthMs: number;
  seekable: boolean;
  volume: number;
  muted: boolean;
  audioTracks: VlcTrack[];
  subtitleTracks: VlcTrack[];
  audioTrack: number;
  subtitleTrack: number;
}

export interface VlcPlayerProps {
  mediaId: string;
  filePath: string;
  title?: string;
  episodeTitle?: string;
  onClose?: () => void;
  // Called when libvlc cannot open or play the file so the caller can use the FFmpeg pipeline
  onFallback: (reason: string) => void;
}

type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const formatTime = (ms: number) => {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const VlcPlayer: React.FC<VlcPlayerProps> = ({
  mediaId,
  filePath,
  title,
  episodeTitle,
  onClose,
  onFallback,
}) => {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const invokeRef = useRef<Invoke | null>(null);
  const openedRef = useRef(false);
  const timeRef = useRef(0);
  const failedRef = useRef(false);
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;
  const [status, setStatus] = useState<VlcStatus | null>(null);
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Episodes keep their own resume position
  const settingsId = episodeTitle ? `${mediaId}::${episodeTitle}` : mediaId;

  const readRect = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, []);

  const control = useCallback((action: string, value?: number) => {
    invokeRef.current?.('vlc_control', { action, value }).catch((e) => console.warn('[VlcPlayer] control failed:', e));
  }, []);

  const fail = useCallback((reason: string) => {
    if (failedRef.current) return;
    failedRef.current = true;
    setError(reason);
    onFallbackRef.current(reason);
  }, []);

  useEffect(() => {
    let cancelled = false;
    failedRef.current = false;
    openedRef.current = false;

    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        invokeRef.current = invoke as Invoke;

        let startMs = 0;
        try {
          const res = await fetch(`/api/media/settings/${encodeURIComponent(settingsId)}`);
          const data = await res.json();
          if (data.success && data.settings?.last_watched_seconds > 5) {
            startMs = Math.floor(data.settings.last_watched_seconds * 1000);
          }
        } catch {
          // Resume position is optional
        }

        const rect = readRect();
        if (cancelled || !rect) return;
        await invoke('vlc_open', { path: filePath, startMs, rect });
        openedRef.current = true;
        if (cancelled) {
          await invoke('vlc_stop');
        }
      } catch (e: any) {
        if (!cancelled) fail(typeof e === 'string' ? e : e?.message || 'libvlc failed to start');
      }
    })();

    return () => {
      cancelled = true;
      if (openedRef.current && invokeRef.current) {
        invokeRef.current('vlc_stop').catch(() => {});
      }
      openedRef.current = false;
    };
  }, [filePath, settingsId, readRect, fail]);

  // Keep the native view glued to the placeholder
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const sync = () => {
      const rect = readRect();
      if (!rect || !openedRef.current) return;
      invokeRef.current?.('vlc_set_rect', { rect, visible: rect.width > 1 && rect.height > 1 }).catch(() => {});
    };
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    const interval = setInterval(sync, 500);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      clearInterval(interval);
    };
  }, [readRect]);

  // Poll playback status
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!openedRef.current || !invokeRef.current) return;
      try {
        const s = await invokeRef.current<VlcStatus>('vlc_status');
        setStatus(s);
        timeRef.current = s.timeMs;
        if (s.state === 'error') fail('libvlc reported a playback error');
      } catch {
        // Session may be starting or closing
      }
    }, 500);
    return () => clearInterval(timer);
  }, [fail]);

  // Persist the resume position
  useEffect(() => {
    const timer = setInterval(() => {
      if (timeRef.current <= 0) return;
      fetch(`/api/media/settings/${encodeURIComponent(settingsId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitleOffsetMs: 0, lastWatchedSeconds: Math.floor(timeRef.current / 1000) }),
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [settingsId]);

  const isPlaying = status?.state === 'playing' || status?.state === 'buffering';
  const lengthMs = status?.lengthMs || 0;
  const shownMs = scrubMs ?? status?.timeMs ?? 0;

  return (
    <div className="relative w-full h-full flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-300 bg-slate-950 border-b border-slate-800">
        <div className="truncate">
          <span className="font-semibold text-white">{title}</span>
          {episodeTitle && <span className="ml-2 text-indigo-300">{episodeTitle}</span>}
          <span className="ml-2 text-slate-500">libvlc</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white" title="Close">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div ref={surfaceRef} className="flex-1 min-h-0 bg-black flex items-center justify-center">
        {!status && !error && <span className="text-xs text-slate-500">Starting libvlc…</span>}
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>

      <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={lengthMs || 1}
          step={1000}
          value={Math.min(shownMs, lengthMs || 1)}
          disabled={!status?.seekable}
          onChange={(e) => {
            setScrubMs(Number(e.target.value));
          }}
          onMouseUp={() => {
            if (scrubMs !== null) control('seek', scrubMs);
            setScrubMs(null);
          }}
          onKeyUp={() => {
            if (scrubMs !== null) control('seek', scrubMs);
            setScrubMs(null);
          }}
          className="w-full accent-indigo-500"
        />
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <button
            onClick={() => control(isPlaying ? 'pause' : 'play')}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          </button>
          <button
            onClick={() => control('seek', Math.max(0, (status?.timeMs ?? 0) - 10000))}
            className="p-1.5 text-slate-400 hover:text-white"
            title="Rewind 10 seconds"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <span className="font-mono">
            <span className="text-white font-semibold">{formatTime(shownMs)}</span>
            <span className="text-slate-500 mx-1">/</span>
            {formatTime(lengthMs)}
          </span>

          <div className="ml-auto flex items-center gap-3">
            {status && status.audioTracks.length > 1 && (
              <select
                value={status.audioTrack}
                onChange={(e) => control('audioTrack', Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 max-w-[160px]"
                title="Audio track"
              >
                {status.audioTracks.map((t) => (
                  <option key={t.id} value={t.id}>{t.name || `Track ${t.id}`}</option>
                ))}
              </select>
            )}
            {status && status.subtitleTracks.length > 1 && (
              <select
                value={status.subtitleTrack}
                onChange={(e) => control('subtitleTrack', Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 max-w-[160px]"
                title="Subtitles"
              >
                {status.subtitleTracks.map((t) => (
                  <option key={t.id} value={t.id}>{t.name || `Track ${t.id}`}</option>
                ))}
              </select>
            )}
            <select
              defaultValue="1"
              onChange={(e) => control('rate', Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1"
              title="Speed"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <option key={r} value={r}>{r}x</option>
              ))}
            </select>
            <button
              onClick={() => control(status?.muted ? 'unmute' : 'mute')}
              className="p-1.5 text-slate-400 hover:text-white"
              title={status?.muted ? 'Unmute' : 'Mute'}
            >
              {status?.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.min(100, status?.volume ?? 100)}
              onChange={(e) => control('volume', Number(e.target.value))}
              className="w-20 accent-indigo-500"
              title="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
