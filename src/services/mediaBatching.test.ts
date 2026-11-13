import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { MediaMetadata } from '../types';
import { splitMediaBatches } from './mediaBatching';

test('splits large Unicode libraries below the backend request limit without losing items', () => {
  const items: MediaMetadata[] = Array.from({ length: 10 }, (_, index) => ({
    id: String(index), type: 'movie', title: `Film ${index}`, year: 2007,
    overview: 'é'.repeat(350_000), genres: [], rating: 0, posterUrl: '',
    recommendedFolderStructure: '', recommendedFilenames: [],
  }));
  const batches = splitMediaBatches(items);
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat().map(item => item.id), items.map(item => item.id));
  for (const batch of batches) {
    assert.ok(new TextEncoder().encode(JSON.stringify({ items: batch })).length <= 5 * 1024 * 1024);
  }
  assert.throws(() => splitMediaBatches([{ ...items[0], overview: 'é'.repeat(3_000_000) }]), /exceeds the maximum batch size/);
});

test('large imports flush immediately and retain failed batches for retry', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    globalThis.setInterval = () => 1;
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
    let attempts = 0, fail = true, errors = 0;
    const sizes = [];
    globalThis.window = {
      addEventListener() {},
      dispatchEvent(event) { if (event.type === 'sambavault-media-save-error') errors++; },
      async fetch(_url, options) {
        sizes.push(Buffer.byteLength(options.body));
        attempts++;
        if (fail && attempts === 2) return new Response('', { status: 500 });
        return Response.json({ success: true });
      },
    };
    const { sqliteBatchWriter: writer } = await import('./src/services/sqliteBatchWriter.ts');
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), title: 'Film ' + i, type: 'movie', year: 2007,
      overview: 'é'.repeat(350000), genres: [], rating: 0, posterUrl: '',
      recommendedFolderStructure: '', recommendedFilenames: [],
    }));
    writer.enqueueMany(items);
    while (writer.getStatus().isFlushing) await new Promise(resolve => setTimeout(resolve, 5));
    const pending = writer.getStatus().pendingCount;
    if (!(pending > 0 && pending < items.length && errors === 1)) throw new Error('Failed batch was not retained');
    fail = false;
    const retry = await writer.flushNow();
    if (!retry.success || writer.getStatus().pendingCount !== 0 || sizes.some(size => size > 5 * 1024 * 1024)) {
      throw new Error('Retry did not persist the remaining batches');
    }
  `], { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
