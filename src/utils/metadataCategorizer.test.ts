import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { categorizeMediaWithRetry, parseCategorizerTitle } from './metadataCategorizer';

test('categorizer sends a bracketed or trailing release year separately from the title', async () => {
  assert.deepEqual(parseCategorizerTitle('Example (2007)'), { title: 'Example', year: 2007 });
  assert.deepEqual(parseCategorizerTitle('Example 2007', 2008), { title: 'Example', year: 2008 });
  assert.deepEqual(parseCategorizerTitle('1917'), { title: '1917', year: undefined });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.name, 'Example');
      assert.equal(request.year, 2007);
      return Response.json({ success: true, source: 'test', data: { title: 'Example' } });
    };
    assert.ok(await categorizeMediaWithRetry('Example (2007)', 'movie', undefined, { maxRetries: 0 }));
  } finally { globalThis.fetch = originalFetch; }
});
