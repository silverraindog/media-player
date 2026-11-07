import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { registerUniverseRoutes } from './universeMatcher';

test('TMDB matching, collection resolution, persistence, and desktop CORS', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sambavault-universe-test-'));
  const app = express();
  app.use(express.json());
  registerUniverseRoutes(app, dir);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TMDB_READ_ACCESS_TOKEN;
  const requests: string[] = [];
  process.env.TMDB_READ_ACCESS_TOKEN = 'test-token';
  globalThis.fetch = async (input, init) => {
    const url = input instanceof URL ? input.toString() : String(input);
    if (!url.startsWith('https://api.themoviedb.org/')) return originalFetch(input, init);
    requests.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    if (url.includes('/search/movie')) {
      return Response.json({ results: [{ id: 10, title: 'The Plan', release_date: '2009-01-01', overview: 'Plot', poster_path: '/poster.jpg' }] });
    }
    return Response.json({ belongs_to_collection: { id: 7, name: 'Example Collection' } });
  };
  try {
    const search = await originalFetch(`${base}/api/universes/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'The.Plan.(2009).1080p.mkv', type: 'movie' }),
    });
    const result = await search.json();
    assert.equal(result.confidentId, 10);
    assert.equal(result.candidates[0].posterUrl, 'https://image.tmdb.org/t/p/w500/poster.jpg');
    assert.equal(new URL(requests[0]).searchParams.get('query'), 'The Plan');
    assert.equal(new URL(requests[0]).searchParams.has('api_key'), false);

    const resolved = await originalFetch(`${base}/api/universes/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: result.candidates[0] }),
    });
    assert.equal((await resolved.json()).match.key, 'curated:battlestar-galactica');
    const write = await originalFetch(`${base}/api/universes/assignment`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'tauri://localhost' },
      body: JSON.stringify({ itemKey: 'movie:/media/plan.mkv', assignment: { status: 'matched', match: { key: 'manual:test', name: 'Test', source: 'manual' } } }),
    });
    assert.equal(write.status, 200);
    assert.equal(write.headers.get('access-control-allow-origin'), 'tauri://localhost');
    const loaded = await (await originalFetch(`${base}/api/universes/assignments`)).json();
    assert.equal(loaded.assignments['movie:/media/plan.mkv'].match.name, 'Test');
    const invalid = await originalFetch(`${base}/api/universes/assignment`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemKey: '', assignment: {} }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = originalToken;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(path.join(dir, 'universe-assignments.json'), { force: true });
    fs.rmdirSync(dir);
  }
});
