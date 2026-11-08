import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchTmdbMetadata } from './tmdbMetadata';

test('TMDB metadata searches exact movie and series titles and years safely', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TMDB_READ_ACCESS_TOKEN;
  process.env.TMDB_READ_ACCESS_TOKEN = 'test-token';
  const diagnostics: { provider: string; outcome: string }[] = [];
  try {
    let response: unknown = {
      total_pages: 1,
      results: [
        { title: 'The First Omen', release_date: '2024-04-03', overview: 'Synopsis', poster_path: '/poster.jpg' },
        { title: 'The First Omen 2', release_date: '2024-04-03' },
      ],
    };
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('query'), 'The First Omen');
      assert.equal(url.searchParams.get('include_adult'), 'false');
      assert.ok(init?.signal);
      if (url.pathname.endsWith('/movie')) assert.equal(url.searchParams.get('primary_release_year'), '2024');
      else assert.equal(url.searchParams.get('first_air_date_year'), '2024');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
      return Response.json(response);
    };
    assert.deepEqual((await fetchTmdbMetadata('The First Omen', 'movie', 2024, diagnostics)).metadata, {
      source: 'tmdb', title: 'The First Omen', year: 2024,
      overview: 'Synopsis', posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    });
    response = { total_pages: 1, results: [{ name: 'The First Omen', first_air_date: '2024-01-01', poster_path: '//evil.example/image' }] };
    assert.equal((await fetchTmdbMetadata('The First Omen', 'series', 2024)).metadata?.posterUrl, undefined);
    response = { total_pages: 1, results: [{ title: 'The First Omen', release_date: '2023-01-01' }] };
    assert.equal((await fetchTmdbMetadata('The First Omen', 'movie', 2024)).metadata, undefined);
    response = { total_pages: 1, results: [
      { title: 'The First Omen', release_date: '2024-01-01' },
      { title: 'The First Omen', release_date: '2024-02-01' },
    ] };
    assert.equal((await fetchTmdbMetadata('The First Omen', 'movie', 2024)).unsafeToMatch, true);
    response = { total_pages: 2, results: [{ title: 'The First Omen', release_date: '2024-01-01' }] };
    assert.equal((await fetchTmdbMetadata('The First Omen', 'movie', 2024)).unsafeToMatch, true);
    assert.deepEqual(await fetchTmdbMetadata('The First Omen', 'album', 2024), {});
    assert.equal(diagnostics[0].outcome, 'Result returned');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = originalToken;
  }
});

test('TMDB metadata reports missing tokens, rejected tokens, and invalid responses without exposing tokens', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TMDB_READ_ACCESS_TOKEN;
  const diagnostics: { provider: string; outcome: string }[] = [];
  try {
    delete process.env.TMDB_READ_ACCESS_TOKEN;
    assert.deepEqual(await fetchTmdbMetadata('Example', 'movie', 2020, diagnostics), {});
    process.env.TMDB_READ_ACCESS_TOKEN = 'test-token';
    globalThis.fetch = async () => new Response(null, { status: 401 });
    assert.deepEqual(await fetchTmdbMetadata('Example', 'movie', 2020, diagnostics), {});
    globalThis.fetch = async () => Response.json({ results: [] });
    assert.deepEqual(await fetchTmdbMetadata('Example', 'movie', 2020, diagnostics), {});
    assert.deepEqual(diagnostics.map(entry => entry.outcome), [
      'No API token configured', 'HTTP 401: API token rejected; check Settings', 'Invalid provider response',
    ]);
    assert.ok(!JSON.stringify(diagnostics).includes('test-token'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = originalToken;
  }
});
