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
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), SAMBA_VAULT_DATA_DIR: dataDir },
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
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
    await rm(dataDir, { recursive: true, force: true });
  }
});
