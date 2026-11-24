/// <reference lib="webworker" />
import {
  MediaMetadata,
  MediaScanExtensionConfig,
} from '../types';
import {
  DEFAULT_MEDIA_SCAN_CONFIG,
  extractMediaFromNodeEntries,
  NodeExtractionTaskEntry,
  parseTitleAndYear,
  detectMediaType,
} from '../utils/mediaParserCore';

export interface RawScannedItemInput {
  path?: string;
  rel_path?: string;
  name?: string;
  is_dir?: boolean;
  size_str?: string;
}

export type ScannerWorkerRequest =
  | {
      id: number;
      type: 'PING';
    }
  | {
      id: number;
      type: 'EXTRACT_NODES_CHUNK';
      payload: {
        entries: NodeExtractionTaskEntry[];
        config?: MediaScanExtensionConfig;
      };
    }
  | {
      id: number;
      type: 'PARSE_RAW_FILES_CHUNK';
      payload: {
        files: RawScannedItemInput[];
        effectivePrefix: string;
        config?: MediaScanExtensionConfig;
      };
    };

export type ScannerWorkerResponse =
  | {
      id: number;
      ok: true;
      type: 'PONG';
      durationMs: number;
    }
  | {
      id: number;
      ok: true;
      type: 'EXTRACT_RESULT';
      items: MediaMetadata[];
      processedCount: number;
      durationMs: number;
    }
  | {
      id: number;
      ok: true;
      type: 'PARSE_RAW_RESULT';
      parsedEntries: Array<{
        path: string;
        name: string;
        title: string;
        year: number;
        season?: number;
        episode?: number;
        mediaType: 'movie' | 'series' | 'album';
      }>;
      processedCount: number;
      durationMs: number;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<ScannerWorkerRequest>) => {
  const req = event.data;
  const startedAt = performance.now();

  try {
    if (req.type === 'PING') {
      const resp: ScannerWorkerResponse = {
        id: req.id,
        ok: true,
        type: 'PONG',
        durationMs: performance.now() - startedAt,
      };
      ctx.postMessage(resp);
      return;
    }

    if (req.type === 'EXTRACT_NODES_CHUNK') {
      const { entries, config } = req.payload;
      const items = extractMediaFromNodeEntries(entries, config || DEFAULT_MEDIA_SCAN_CONFIG);
      const resp: ScannerWorkerResponse = {
        id: req.id,
        ok: true,
        type: 'EXTRACT_RESULT',
        items,
        processedCount: entries.length,
        durationMs: performance.now() - startedAt,
      };
      ctx.postMessage(resp);
      return;
    }

    if (req.type === 'PARSE_RAW_FILES_CHUNK') {
      const { files, effectivePrefix } = req.payload;
      const parsedEntries = files.map((item) => {
        const cleanRel = (item.rel_path || item.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const fullPath = item.path || (effectivePrefix ? `${effectivePrefix}/${cleanRel}` : cleanRel);
        const name = item.name || cleanRel.split('/').pop() || cleanRel;
        const parsed = parseTitleAndYear(name);
        const mediaType = detectMediaType(fullPath);
        return {
          path: fullPath,
          name,
          title: parsed.title,
          year: parsed.year,
          season: parsed.season,
          episode: parsed.episode,
          mediaType,
        };
      });

      const resp: ScannerWorkerResponse = {
        id: req.id,
        ok: true,
        type: 'PARSE_RAW_RESULT',
        parsedEntries,
        processedCount: files.length,
        durationMs: performance.now() - startedAt,
      };
      ctx.postMessage(resp);
      return;
    }
  } catch (err: any) {
    const resp: ScannerWorkerResponse = {
      id: req.id,
      ok: false,
      error: err?.message || String(err),
    };
    ctx.postMessage(resp);
  }
};
