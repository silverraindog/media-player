import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerApiKeyRoutes } from './apiKeys';

test('key settings persist privately, take precedence and never return values', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sambavault-keys-'));
  const original = process.env.TMDB_READ_ACCESS_TOKEN;
  process.env.TMDB_READ_ACCESS_TOKEN = 'environment-test-token';
  let changes = 0;
  const app = express();
  app.use(express.json());
  registerApiKeyRoutes(app, dir, () => { changes++; });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (body: object, origin = base) => fetch(`${base}/api/settings/api-keys`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
  });
  try {
    const initial = await (await fetch(`${base}/api/settings/api-keys`)).json();
    assert.deepEqual(initial.keys.TMDB_READ_ACCESS_TOKEN, { configured: true, source: 'environment' });
    const response = await request({ name: 'TMDB_READ_ACCESS_TOKEN', value: 'saved-test-token' });
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /saved-test-token|environment-test-token/);
    assert.equal(process.env.TMDB_READ_ACCESS_TOKEN, 'saved-test-token');
    assert.equal(fs.statSync(path.join(dir, 'api-keys.json')).mode & 0o777, 0o600);
    assert.equal((await request({ name: 'TMDB_READ_ACCESS_TOKEN', value: 'bad key' })).status, 400);
    assert.equal((await request({ name: 'TMDB_READ_ACCESS_TOKEN', value: 'other' }, 'https://evil.example')).status, 403);
    const noOrigin = await fetch(`${base}/api/settings/api-keys`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TMDB_READ_ACCESS_TOKEN', value: 'other' }),
    });
    assert.equal(noOrigin.status, 403);
    const preflight = await fetch(`${base}/api/settings/api-keys`, {
      method: 'OPTIONS', headers: { Origin: 'tauri://localhost', 'Access-Control-Request-Method': 'PUT' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'tauri://localhost');
    const hostileStatus = await new Promise<number | undefined>((resolve, reject) => {
      http.get(`${base}/api/settings/api-keys`, { headers: { Host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject);
    });
    assert.equal(hostileStatus, 403);
    assert.equal(process.env.TMDB_READ_ACCESS_TOKEN, 'saved-test-token');
    const replacement = await request({ name: 'TMDB_READ_ACCESS_TOKEN', value: 'replacement-token' });
    assert.equal(replacement.status, 200);
    assert.equal(process.env.TMDB_READ_ACCESS_TOKEN, 'replacement-token');
    process.env.TMDB_READ_ACCESS_TOKEN = 'environment-test-token';
    const restarted = express();
    registerApiKeyRoutes(restarted, dir, () => {});
    assert.equal(process.env.TMDB_READ_ACCESS_TOKEN, 'replacement-token');
    const removed = await request({ name: 'TMDB_READ_ACCESS_TOKEN', value: '' });
    assert.equal((await removed.json()).keys.TMDB_READ_ACCESS_TOKEN.source, 'environment');
    assert.equal(process.env.TMDB_READ_ACCESS_TOKEN, 'environment-test-token');
    assert.equal(changes, 4);
  } finally {
    if (original === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = original;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
