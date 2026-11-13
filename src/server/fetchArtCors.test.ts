import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('fetch-art handles Tauri preflight and responses on the real backend', async () => {
  const reservation = net.createServer();
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));

  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sambavault-cors-test-'));
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', '--import', './src/server/testFixtures/mockMetadataProviders.ts', 'server.ts'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), SAMBA_VAULT_DATA_DIR: dataDir, TMDB_READ_ACCESS_TOKEN: 'test-token' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const exited = once(child, 'exit');
  const url = `http://127.0.0.1:${port}/api/media/fetch-art`;
  try {
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Backend exited with code ${child.exitCode}: ${stderr}`);
      try {
        await fetch(`http://127.0.0.1:${port}/api/health`);
        ready = true;
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    assert.ok(ready, 'Backend did not start in time');
    const savedMedia = await fetch(`http://127.0.0.1:${port}/api/db/media/batch`, {
      method: 'POST',
      headers: { Origin: 'tauri://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: 'persistence-test', type: 'movie', title: 'Saved title', overview: 'Saved synopsis', cast: [{ name: 'Actor' }] }] }),
    });
    assert.equal(savedMedia.status, 200);
    const storedMedia = await fetch(`http://127.0.0.1:${port}/api/db/media`, {
      headers: { Origin: 'tauri://localhost' },
    }).then(response => response.json());
    const savedItem = storedMedia.items.find((item: { id: string }) => item.id === 'persistence-test');
    assert.equal(savedItem.title, 'Saved title');
    assert.equal(JSON.parse(savedItem.cast)[0].name, 'Actor');
    assert.equal(JSON.parse(savedItem.raw_data).overview, 'Saved synopsis');
    for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:1420']) {
      const preflight = await fetch(url, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.match(preflight.headers.get('access-control-allow-methods') || '', /POST/);
      assert.match(preflight.headers.get('access-control-allow-headers') || '', /content-type/i);
      const response = await fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }
    const untrusted = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(untrusted.headers.get('access-control-allow-origin'), null);
    const lookup = (title: string) => fetch(url, {
      method: 'POST', headers: { Origin: 'tauri://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type: 'movie', year: 2024, requireProviderYear: true, diagnostics: true }),
    }).then(response => response.json());
    const match = await lookup('The First Omen');
    assert.equal(match.source, 'tmdb');
    assert.equal(match.title, 'The First Omen');
    assert.equal(match.year, 2024);
    assert.equal(match.overview, 'Provider synopsis');
    assert.equal(match.posterUrl, 'https://image.tmdb.org/t/p/w500/poster.jpg');
    assert.ok(match.diagnostics.some((entry: { provider: string; outcome: string }) =>
      entry.provider === 'TMDB' && entry.outcome === 'Result returned'));
    assert.ok(match.diagnostics.some((entry: { outcome: string }) =>
      entry.outcome.startsWith('Request: GET https://api.themoviedb.org/')));
    const collectionResponse = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'The Evil Dead', type: 'movie', requireProviderYear: true, allowUniqueMovie: true, diagnostics: true }),
    }).then(response => response.json());
    assert.equal(collectionResponse.matchMode, 'unique-title');
    assert.equal(collectionResponse.title, 'The Evil Dead');
    assert.equal(collectionResponse.year, 1981);
    const wishmasterCollection = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Wishmaster', type: 'movie', requireProviderYear: true, collectionLookup: true, diagnostics: true }),
    }).then(response => response.json());
    assert.equal(wishmasterCollection.matchMode, 'unique-collection');
    assert.equal(wishmasterCollection.collectionName, 'Wishmaster Collection');
    assert.equal(wishmasterCollection.collectionFilms.length, 2);
    assert.match(wishmasterCollection.overview, /The djinn returns/);
    assert.equal(wishmasterCollection.posterUrl, 'https://image.tmdb.org/t/p/w500/wishmaster-collection.jpg');
    const deerHunter = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'The Deer Hunter', type: 'movie', requireProviderYear: true, allowRanked: true, allowUniqueMovie: true, diagnostics: true }),
    }).then(response => response.json());
    assert.equal(deerHunter.source, 'tmdb');
    assert.equal(deerHunter.title, 'The Deer Hunter');
    assert.equal(deerHunter.year, 1978);
    assert.equal(deerHunter.matchMode, 'unique-title');
    const ambiguousMovie = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ambiguous', type: 'movie', requireProviderYear: true, allowRanked: true, allowUniqueMovie: true, diagnostics: true }),
    }).then(response => response.json());
    assert.equal(ambiguousMovie.source, 'fallback');
    assert.equal(ambiguousMovie.candidates.length, 2);
    const ambiguous = await lookup('Ambiguous');
    assert.equal(ambiguous.source, 'fallback');
    assert.equal(ambiguous.title, undefined);
    assert.ok(ambiguous.diagnostics.some((entry: { outcome: string }) => entry.outcome === 'Ambiguous results; review manually'));
    const rankedLookup = (title: string) => fetch(url, {
      method: 'POST', headers: { Origin: 'tauri://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type: 'movie', year: 2024, requireProviderYear: true, allowRanked: true, diagnostics: true }),
    }).then(response => response.json());
    const ranked = await rankedLookup('Ambiguous');
    assert.equal(ranked.matchMode, 'ranked');
    assert.ok(ranked.diagnostics.some((entry: { outcome: string }) => entry.outcome.includes('popularity 20')));
    const review = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ambiguous', type: 'movie', year: 2024, requireProviderYear: true, allowRanked: true, reviewYearMatches: true, diagnostics: true }),
    }).then(response => response.json());
    assert.equal(review.source, 'fallback');
    assert.equal(review.candidates.length, 2);
    const nearby = await rankedLookup('Nearby Year');
    assert.equal(nearby.year, 2023);
    assert.equal(nearby.matchMode, 'ranked');
    const alternate = await rankedLookup('Local - Alternate');
    assert.equal(alternate.title, 'Alternate');
    assert.equal(alternate.matchMode, 'ranked');
    const showLookup = (title: string) => fetch(url, {
      method: 'POST', headers: { Origin: 'tauri://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type: 'series', requireProviderYear: true, allowRanked: true, diagnostics: true }),
    }).then(response => response.json());
    const show = await showLookup('Futurama');
    assert.equal(show.matchMode, 'unique-title');
    assert.equal(show.year, 1999);
    const nonLatin = await showLookup('Доктор кто');
    assert.ok(nonLatin.diagnostics.some((entry: { provider: string; outcome: string }) =>
      entry.provider === 'OMDb' && entry.outcome.startsWith('Skipped non-Latin')));
    assert.ok(!nonLatin.diagnostics.some((entry: { provider: string; outcome: string }) =>
      entry.provider === 'OMDb' && entry.outcome.startsWith('Request:')));
    const keyResponse = await fetch(`http://127.0.0.1:${port}/api/settings/api-keys`, {
      method: 'PUT', headers: { Origin: 'tauri://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'OMDB_API_KEY', value: 'saved-test-key' }),
    });
    assert.equal(keyResponse.status, 200);
    const omdb = await lookup('OMDb Test');
    assert.equal(omdb.source, 'omdb');
    assert.equal(omdb.title, 'OMDb Test');
    assert.equal(omdb.year, 2024);
    assert.equal(omdb.overview, 'OMDb synopsis');
    const omdbWhenTmdbFails = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'OMDb Unavailable', type: 'movie', year: 2024, requireProviderYear: true, allowRanked: true, reviewYearMatches: true, diagnostics: true }),
    }).then(response => response.json());
    assert.equal(omdbWhenTmdbFails.source, 'omdb');
    assert.equal(omdbWhenTmdbFails.title, 'OMDb Unavailable');
    assert.equal(omdbWhenTmdbFails.year, 2024);
    assert.ok(omdb.diagnostics.some((entry: { provider: string; outcome: string }) =>
      entry.provider === 'OMDb' && entry.outcome === 'Result returned'));
    const omdbRequest = omdb.diagnostics.find((entry: { provider: string; outcome: string }) =>
      entry.provider === 'OMDb' && entry.outcome.startsWith('Request: GET'));
    assert.ok(omdbRequest);
    const omdbUrl = new URL(omdbRequest.outcome.slice('Request: GET '.length));
    assert.equal(omdbUrl.searchParams.get('apikey'), '[REDACTED]');
    assert.equal(omdbUrl.searchParams.get('t'), 'OMDb Test');
    assert.equal(omdbUrl.searchParams.get('y'), '2024');
    assert.ok(!JSON.stringify(omdb.diagnostics).includes('saved-test-key'));
    const albumResponse = await fetch(url, {
      method: 'POST', headers: { Origin: 'tauri://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Parachutes', artist: 'Coldplay', type: 'album', requireProviderYear: true, diagnostics: true }),
    });
    const album = await albumResponse.json();
    assert.equal(album.source, 'musicbrainz-audiodb');
    assert.equal(album.artist, 'Coldplay');
    assert.equal(album.overview, 'Album description');
    assert.equal(album.posterUrl, 'https://example.com/album.jpg');
    assert.deepEqual(album.diagnostics.filter((entry: { outcome: string }) => entry.outcome === 'Result returned')
      .map((entry: { provider: string }) => entry.provider), ['MusicBrainz', 'TheAudioDB']);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
    await rm(dataDir, { recursive: true, force: true });
  }
});
