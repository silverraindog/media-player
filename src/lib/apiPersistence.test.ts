import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('desktop database and vault requests use the backend and surface failures', async () => {
  const requests: string[] = [];
  let fail = false;
  const fakeWindow = {
    __TAURI__: {},
    __EXPRESS_PORT__: 4321,
    fetch: async (url: string) => {
      requests.push(url);
      return fail
        ? new Response('storage error', { status: 500 })
        : Response.json({ success: true, items: [] });
    },
  };
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
  try {
    const { apiCall } = await import('./api');
    await apiCall('/api/db/media');
    await apiCall('/api/db/media/batch', { method: 'POST', body: '{}' });
    await apiCall('/api/db/progress/update', { method: 'POST', body: '{}' });
    await apiCall('/api/vault/state');
    assert.deepEqual(requests, [
      'http://localhost:4321/api/db/media',
      'http://localhost:4321/api/db/media/batch',
      'http://localhost:4321/api/db/progress',
      'http://localhost:4321/api/vault/state',
    ]);
    fail = true;
    await assert.rejects(apiCall('/api/db/media'), /API error/);
    await assert.rejects(apiCall('/api/vault/state', { method: 'POST' }), /API error/);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});
