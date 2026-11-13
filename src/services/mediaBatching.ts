import type { MediaMetadata } from '../types';

const MAX_BATCH_BYTES = 5 * 1024 * 1024;

export function splitMediaBatches(items: MediaMetadata[]): MediaMetadata[][] {
  const batches: MediaMetadata[][] = [];
  let batch: MediaMetadata[] = [];
  let bytes = 12;
  for (const item of items) {
    const itemBytes = new TextEncoder().encode(JSON.stringify(item)).length + 1;
    if (itemBytes + 12 > MAX_BATCH_BYTES) throw new Error(`Media item "${item.title}" exceeds the maximum batch size.`);
    if (bytes + itemBytes > MAX_BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      bytes = 12;
    }
    batch.push(item);
    bytes += itemBytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
