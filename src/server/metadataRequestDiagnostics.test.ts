import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchMetadataWithDiagnostics, type MetadataDiagnostic } from './metadataRequestDiagnostics';

test('reports sanitized requests, status, and safe network failures', async () => {
  const originalFetch = globalThis.fetch;
  const diagnostics: MetadataDiagnostic[] = [];
  try {
    globalThis.fetch = async () => new Response(null, { status: 401 });
    const url = new URL('https://www.omdbapi.com/?apikey=private-test-key&t=Example&y=2024&other=secret-value');
    const response = await fetchMetadataWithDiagnostics(url, {
      headers: { Authorization: 'Bearer private-test-token' },
    }, 'OMDb', diagnostics, ['t', 'y']);
    assert.equal(response.status, 401);
    const loggedUrl = new URL(diagnostics[0].outcome.slice('Request: GET '.length));
    assert.equal(loggedUrl.searchParams.get('apikey'), '[REDACTED]');
    assert.equal(loggedUrl.searchParams.get('t'), 'Example');
    assert.equal(loggedUrl.searchParams.get('y'), '2024');
    assert.equal(loggedUrl.searchParams.has('other'), false);
    assert.match(diagnostics[1].outcome, /^Response: HTTP 401 in \d+ms$/);
    globalThis.fetch = async () => { throw new Error('private-test-key'); };
    await assert.rejects(fetchMetadataWithDiagnostics(url, {}, 'OMDb', diagnostics, ['t']), /private-test-key/);
    assert.match(diagnostics.at(-1)!.outcome, /^Request failed after \d+ms$/);
    assert.doesNotMatch(JSON.stringify(diagnostics), /private-test-key|private-test-token|secret-value/);
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    await assert.rejects(fetchMetadataWithDiagnostics(url, {}, 'OMDb', diagnostics, ['t']));
    assert.match(diagnostics.at(-1)!.outcome, /^Request timed out after \d+ms$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
