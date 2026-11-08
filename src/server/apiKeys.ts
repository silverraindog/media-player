import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Router } from 'express';

const names = ['TMDB_READ_ACCESS_TOKEN', 'OMDB_API_KEY', 'GEMINI_API_KEY'] as const;
type KeyName = typeof names[number];
type KeyValues = Partial<Record<KeyName, string>>;

export function registerApiKeyRoutes(router: Router, dataDir: string, onChange: () => void): void {
  const file = path.join(dataDir, 'api-keys.json');
  const inherited: KeyValues = {};
  for (const name of names) if (process.env[name]) inherited[name] = process.env[name];
  let saved: KeyValues = {};
  if (fs.existsSync(file)) {
    const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid API key settings file.');
    for (const name of names) {
      const value = (data as Record<string, unknown>)[name];
      if (value !== undefined && (typeof value !== 'string' || !value || /[\s\0]/.test(value))) {
        throw new Error(`Invalid stored value for ${name}.`);
      }
      if (typeof value === 'string') saved[name] = value;
    }
  }
  const apply = () => {
    for (const name of names) {
      const value = saved[name] || inherited[name];
      if (value) process.env[name] = value;
      else delete process.env[name];
    }
    onChange();
  };
  apply();
  const status = () => Object.fromEntries(names.map((name) => [name, {
    configured: Boolean(saved[name] || inherited[name]),
    source: saved[name] ? 'settings' : inherited[name] ? 'environment' : 'none',
  }]));

  router.use('/api/settings/api-keys', (req, res, next) => {
    const remote = req.socket.remoteAddress || '';
    const host = req.headers.host || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) ||
        !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
      return res.status(403).json({ error: 'API key settings are available only on this computer.' });
    }
    const origin = req.headers.origin;
    const allowed = origin === 'tauri://localhost' || origin === 'http://tauri.localhost' ||
      origin === 'https://tauri.localhost' || origin === `http://${host}` || origin === `https://${host}` ||
      origin === 'http://localhost:1420';
    if (origin && allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if ((origin && !allowed) || (req.method === 'PUT' && !origin)) {
      return res.status(403).json({ error: 'Untrusted request origin.' });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/api/settings/api-keys', (_req, res) => res.json({ keys: status() }));
  router.put('/api/settings/api-keys', (req, res) => {
    const { name, value } = req.body || {};
    if (!names.includes(name) || typeof value !== 'string' || value.length > 4096 ||
        (value !== '' && /[\s\0]/.test(value))) {
      return res.status(400).json({ error: 'Provide a valid key without whitespace, or an empty value to remove the saved key.' });
    }
    const next = { ...saved };
    if (value) next[name as KeyName] = value;
    else delete next[name as KeyName];
    const temporary = `${file}.${randomUUID()}.tmp`;
    let created = false;
    let fd: number | undefined;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      created = true;
      fs.writeFileSync(fd, JSON.stringify(next, null, 2));
      fs.fchmodSync(fd, 0o600);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporary, file);
      created = false;
      saved = next;
      apply();
      res.json({ success: true, keys: status() });
    } catch (error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); }
        catch { console.error('[API key settings] Failed to close temporary settings file.'); }
      }
      if (created) {
        try { fs.unlinkSync(temporary); }
        catch { console.error('[API key settings] Failed to remove temporary settings file.'); }
      }
      console.error('[API key settings] Failed to save settings:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ error: 'Could not save API key settings.' });
    }
  });
}
