import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { registerProviderSearchRoutes } from './providerSearch';

test('searches TVMaze without a key and OMDb only with a configured key', async () => {
  const app = express();
  app.use(express.json());
  registerProviderSearchRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/provider-search`;
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OMDB_API_KEY;
  delete process.env.OMDB_API_KEY;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.tvmaze.com') {
      assert.equal(url.searchParams.get('q'), 'Caprica');
      return Response.json([{ show: { id: 1, name: 'Caprica', premiered: '2010-01-22', summary: '<p>Story</p>' } }]);
    }
    if (url.hostname === 'www.omdbapi.com') {
      assert.equal(url.protocol, 'https:');
      assert.equal(url.searchParams.get('apikey'), 'test-key');
      assert.equal(url.searchParams.get('type'), 'movie');
      return Response.json({ Response: 'True', Search: [{ imdbID: 'tt123', Title: 'Example', Year: '2000', Type: 'movie' }] });
    }
    return originalFetch(input, init);
  };
  const search = (body: object, origin?: string) => originalFetch(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  });
  try {
    const tv = await search({ title: 'Caprica Season 1', type: 'series', provider: 'tvmaze' }, 'tauri://localhost');
    assert.equal(tv.status, 200);
    assert.equal(tv.headers.get('access-control-allow-origin'), 'tauri://localhost');
    assert.deepEqual((await tv.json()).results[0], {
      id: '1', title: 'Caprica', source: 'tvmaze', type: 'series', year: 2010,
      overview: 'Story', url: 'https://www.tvmaze.com/shows/1',
    });
    assert.equal((await search({ title: 'Example', type: 'movie', provider: 'tvmaze' })).status, 400);
    assert.equal((await search({ title: 'Example', type: 'movie', provider: 'omdb' })).status, 503);
    process.env.OMDB_API_KEY = 'test-key';
    const omdb = await search({ title: 'Example', type: 'movie', provider: 'omdb' });
    assert.equal((await omdb.json()).results[0].url, 'https://www.imdb.com/title/tt123/');
    globalThis.fetch = async () => Response.json({ Response: 'False', Error: 'Invalid API key!' });
    const error = await search({ title: 'Example', type: 'movie', provider: 'omdb' });
    assert.equal(error.status, 502);
    assert.match((await error.json()).error, /key and quota/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OMDB_API_KEY;
    else process.env.OMDB_API_KEY = originalKey;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
