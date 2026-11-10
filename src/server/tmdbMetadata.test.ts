import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchRankedTmdbMetadata, fetchTmdbMetadata } from './tmdbMetadata';

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

    await test('ranked TMDB search supports title variants and nearby years with deterministic ranking', async () => {
      const originalFetch = globalThis.fetch;
      const originalToken = process.env.TMDB_READ_ACCESS_TOKEN;
      process.env.TMDB_READ_ACCESS_TOKEN = 'test-token';
      const diagnostics: { provider: string; outcome: string }[] = [];
      try {
        let responses: Record<string, unknown> = {
          'Il convento - Heretiks - The Convent': { total_pages: 1, results: [] },
          'Il convento': { total_pages: 1, results: [] },
          Heretiks: { total_pages: 1, results: [] },
          'The Convent': { total_pages: 1, results: [
            { id: 2, title: 'The Convent', release_date: '2018-05-01', popularity: 2, vote_count: 10 },
            { id: 3, title: 'The Convent', release_date: '2018-06-01', popularity: 10, vote_count: 20 },
            { id: 4, title: 'The Convent', release_date: '2017-01-01', popularity: 100 },
            { id: 5, title: 'The Convent', release_date: '2016-01-01', popularity: 1000 },
          ] },
        };
        globalThis.fetch = async input => {
          const url = new URL(String(input));
          assert.equal(url.searchParams.has('primary_release_year'), false);
          return Response.json(responses[url.searchParams.get('query') || '']);
        };
        const result = await fetchRankedTmdbMetadata('Il convento - Heretiks - The Convent', 'movie', 2018, diagnostics);
        assert.equal(result.metadata?.title, 'The Convent');
        assert.equal(result.metadata?.year, 2018);
        assert.equal(result.metadata?.matchMode, 'ranked');
        assert.ok(diagnostics.some(entry => entry.outcome.includes('popularity 10, votes 20')));
        responses = { Skinamarink: { total_pages: 1, results: [
          { id: 1, title: 'Skinamarink', release_date: '2023-01-01', popularity: 1 },
          { id: 2, title: 'Skinamarink', release_date: '2024-01-01', popularity: 100 },
        ] } };
        assert.equal((await fetchRankedTmdbMetadata('Skinamarink', 'movie', 2022)).metadata?.year, 2023);
        globalThis.fetch = async input => {
          const url = new URL(String(input));
          return Response.json({
            total_pages: 2,
            results: url.searchParams.get('page') === '2'
              ? [{ id: 8, title: 'Skinamarink', release_date: '2022-01-01', popularity: 1 }]
              : [{ id: 7, title: 'Skinamarink', release_date: '2023-01-01', popularity: 100 }],
          });
        };
        assert.equal((await fetchRankedTmdbMetadata('Skinamarink', 'movie', 2022)).metadata?.year, 2022);
        responses = { Skinamarink: { total_pages: 6, results: [] } };
        globalThis.fetch = async input => Response.json(responses[new URL(String(input)).searchParams.get('query') || '']);
        assert.equal((await fetchRankedTmdbMetadata('Skinamarink', 'movie', 2022)).unsafeToMatch, true);
        globalThis.fetch = async () => new Response(null, { status: 503 });
        assert.equal((await fetchRankedTmdbMetadata('Skinamarink', 'movie', 2022)).unsafeToMatch, true);
        assert.equal((await fetchRankedTmdbMetadata('Skinamarink', 'movie', undefined)).metadata, undefined);
      } finally {
        globalThis.fetch = originalFetch;
        if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
        else process.env.TMDB_READ_ACCESS_TOKEN = originalToken;
      }
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
    assert.ok(diagnostics.some(entry => entry.outcome === 'Result returned'));
    assert.ok(diagnostics.some(entry => entry.outcome.startsWith('Request: GET https://api.themoviedb.org/')));
    assert.ok(diagnostics.some(entry => /^Response: HTTP 200 in \d+ms$/.test(entry.outcome)));
    assert.ok(!JSON.stringify(diagnostics).includes('test-token'));
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
    assert.deepEqual(diagnostics.map(entry => entry.outcome).filter(outcome =>
      !outcome.startsWith('Request:') && !outcome.startsWith('Response:')), [
      'No API token configured', 'HTTP 401: API token rejected; check Settings', 'Invalid provider response',
    ]);
    assert.ok(!JSON.stringify(diagnostics).includes('test-token'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = originalToken;
  }
});
