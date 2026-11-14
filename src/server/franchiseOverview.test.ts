import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchFranchiseOverview } from './franchiseOverview';

test('Wikipedia overview lookup verifies identity and extracts a premise with attribution', async () => {
  const originalFetch = globalThis.fetch;
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  delete process.env.TMDB_READ_ACCESS_TOKEN;
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      assert.equal(url.hostname, 'en.wikipedia.org');
      if (url.searchParams.get('prop') === 'pageprops') return Response.json({ query: { pages: [
        { pageid: 1, title: 'Example (franchise)' },
        { pageid: 2, title: 'Unrelated (franchise)' },
        { pageid: 3, title: 'Example', pageprops: { disambiguation: '' } },
      ] } });
      assert.equal(url.searchParams.get('pageids'), '1');
      return Response.json({ query: { pages: [{
        pageid: 1, fullurl: 'https://en.wikipedia.org/wiki/Example_(franchise)',
        extract: 'Introduction\n\n== Overview ==\nFirst paragraph.\n\nSecond paragraph.\n\n== Films ==\nIndividual films.',
      }] } });
    };
    const result = await fetchFranchiseOverview('Example', 'collection', []);
    assert.deepEqual(result.overview, {
      text: 'First paragraph.\n\nSecond paragraph.', source: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Example_(franchise)', license: 'CC BY-SA 4.0',
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (token === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = token;
  }
});

test('Wikipedia ambiguous results need selection and missing sections are not saved', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.searchParams.get('prop') === 'pageprops') return Response.json({ query: { pages: [
        { pageid: 1, title: 'Example (franchise)' },
        { pageid: 2, title: 'Example (TV series)' },
      ] } });
      return Response.json({ query: { pages: [{
        pageid: 2, fullurl: 'https://en.wikipedia.org/wiki/Example_(TV_series)',
        extract: 'Introduction\n\n== Production ==\nDetails.',
      }] } });
    };
    const result = await fetchFranchiseOverview('Example', 'series', []);
    assert.equal(result.candidates?.length, 2);
    const diagnostics: { provider: string; outcome: string }[] = [];
    assert.equal((await fetchFranchiseOverview('Example', 'series', diagnostics, result.candidates![1])).overview, undefined);
    assert.ok(diagnostics.some(entry => entry.outcome.includes('No premise or overview')));
    await assert.rejects(() => fetchFranchiseOverview('Example', 'series', [], { source: 'Wikipedia', title: 'Wrong', id: 99 }));
  } finally { globalThis.fetch = originalFetch; }
});

test('series without a matching verified year requires selection', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.searchParams.get('prop') === 'pageprops') return Response.json({ query: { pages: [
        { pageid: 2, title: 'Example (TV series)', pageprops: { 'wikibase-shortdesc': '2003 television series' } },
      ] } });
      return Response.json({ query: { pages: [{
        pageid: 2, fullurl: 'https://en.wikipedia.org/wiki/Example_(TV_series)',
        extract: 'Introduction\n\n== Premise ==\nSeries premise.',
      }] } });
    };
    const unverified = await fetchFranchiseOverview('Example', 'series', [], undefined, 2004);
    assert.equal(unverified.candidates?.length, 1);
    assert.ok((await fetchFranchiseOverview('Example', 'series', [], undefined, 2003)).overview);
    assert.ok((await fetchFranchiseOverview('Example', 'series', [], unverified.candidates![0], 2004)).overview);
  } finally { globalThis.fetch = originalFetch; }
});

test('a selected Wikipedia result that disappeared reports a specific error', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ query: { pages: [] } });
    await assert.rejects(
      () => fetchFranchiseOverview('Example', 'series', [], { source: 'Wikipedia', title: 'Example (TV series)', id: 2 }),
      /selected Wikipedia result is no longer available/,
    );
  } finally { globalThis.fetch = originalFetch; }
});

test('TMDB collection overview takes precedence over Wikipedia', async () => {
  const originalFetch = globalThis.fetch;
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  process.env.TMDB_READ_ACCESS_TOKEN = 'test-token';
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      assert.equal(url.hostname, 'api.themoviedb.org');
      return url.pathname === '/3/search/collection'
        ? Response.json({ total_pages: 1, results: [{ id: 9, name: 'Example Collection' }] })
        : Response.json({ id: 9, name: 'Example Collection', overview: 'Collection overview', parts: [{ title: 'Example' }] });
    };
    const result = await fetchFranchiseOverview('Example', 'collection', []);
    assert.deepEqual(result.overview, { source: 'TMDB', text: 'Collection overview', url: 'https://www.themoviedb.org/collection/9' });
  } finally {
    globalThis.fetch = originalFetch;
    if (token === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = token;
  }
});

test('Wikipedia is used when a verified TMDB collection has no descriptions', async () => {
  const originalFetch = globalThis.fetch;
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  process.env.TMDB_READ_ACCESS_TOKEN = 'test-token';
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.hostname === 'api.themoviedb.org') return url.pathname === '/3/search/collection'
        ? Response.json({ total_pages: 1, results: [{ id: 9, name: 'Example Collection' }] })
        : Response.json({ id: 9, name: 'Example Collection', parts: [{ title: 'Example' }] });
      if (url.searchParams.get('prop') === 'pageprops') return Response.json({ query: { pages: [{ pageid: 1, title: 'Example (franchise)' }] } });
      return Response.json({ query: { pages: [{
        pageid: 1, fullurl: 'https://en.wikipedia.org/wiki/Example_(franchise)', extract: '== Overview ==\nPremise.',
      }] } });
    };
    const result = await fetchFranchiseOverview('Example', 'collection', []);
    assert.equal(result.overview?.source, 'Wikipedia');
    assert.equal(result.overview?.text, 'Premise.');
  } finally {
    globalThis.fetch = originalFetch;
    if (token === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = token;
  }
});
