import { isTauriEnvironment, detectFFmpegPath } from '../utils/tauriBridge';

export interface MediaInfo {
  format: {
    format_name: string;
    duration: string;
    size: string;
  };
  streams: Array<{
    codec_name: string;
    codec_type: string;
    channels?: number;
  }>;
}

export type TranscodeState = 'idle' | 'probing' | 'transcoding' | 'ready' | 'native' | 'error';

export interface TranscodeStatusInfo {
  state: TranscodeState;
  progressPercent: number;
  message: string;
  outputPath?: string;
}

class TranscodeService {
  private activeStatus: Map<string, TranscodeStatusInfo> = new Map();
  private listeners: Set<(path: string, status: TranscodeStatusInfo) => void> = new Set();

  public getStatus(path: string): TranscodeStatusInfo {
    return this.activeStatus.get(path) || {
      state: 'native',
      progressPercent: 0,
      message: 'Native Playback',
    };
  }

  public setStatus(path: string, status: TranscodeStatusInfo) {
    this.activeStatus.set(path, status);
    this.listeners.forEach((listener) => {
      try {
        listener(path, status);
      } catch (e) {
        console.error('TranscodeService listener error:', e);
      }
    });
  }

  public subscribe(listener: (path: string, status: TranscodeStatusInfo) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async probe(path: string): Promise<MediaInfo> {
    if (isTauriEnvironment()) {
      try {
        await detectFFmpegPath();
        const { invoke } = await import('@tauri-apps/api/tauri');
        const result = await invoke<string>('probe_media_file', { sourcePath: path });
        return JSON.parse(result);
      } catch (e) {
        console.warn('Tauri probe_media_file failed:', e);
      }
    }

    // Heuristic fallback for non-Tauri or unsupported probe
    const lower = path.toLowerCase();
    const isMkv = lower.endsWith('.mkv');
    const isDts = lower.includes('dts') || lower.endsWith('.dts');
    return {
      format: {
        format_name: isMkv ? 'matroska,webm' : 'mov,mp4,m4a,3gp,3g2,mj2',
        duration: '0',
        size: '0',
      },
      streams: [
        {
          codec_name: isMkv ? 'hevc' : 'h264',
          codec_type: 'video',
        },
        {
          codec_name: isDts ? 'dts' : 'aac',
          codec_type: 'audio',
          channels: 2,
        },
      ],
    };
  }

  public async transcode(path: string, mediaType: 'audio' | 'video'): Promise<string> {
    this.setStatus(path, {
      state: 'transcoding',
      progressPercent: 10,
      message: 'Transcoding: 10%',
    });

    if (isTauriEnvironment()) {
      try {
        await detectFFmpegPath();
        const { invoke } = await import('@tauri-apps/api/tauri');
        const res = await invoke<string>('transcode_media_file', { sourcePath: path, mediaType });
        this.setStatus(path, {
          state: 'ready',
          progressPercent: 100,
          message: 'Ready',
          outputPath: res,
        });
        return res;
      } catch (e: any) {
        this.setStatus(path, {
          state: 'error',
          progressPercent: 0,
          message: e?.message || 'Transcode Failed',
        });
        throw e;
      }
    }

    // In web preview / non-Tauri mode
    this.setStatus(path, {
      state: 'ready',
      progressPercent: 100,
      message: 'Ready',
      outputPath: path,
    });
    return path;
  }

  public isUnsupported(info: MediaInfo): boolean {
    // Check for DTS audio or MKV format which are problematic in HTML5 players
    const hasDts = info.streams.some((s) => s.codec_type === 'audio' && s.codec_name?.toLowerCase() === 'dts');
    const isMkv = info.format.format_name?.toLowerCase().includes('matroska');
    return hasDts || isMkv;
  }
}

export const transcodeService = new TranscodeService();
