const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

test('release synchronization embeds the selected tag version in frontend and build metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sambavault-version-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.copyFileSync(path.join(__dirname, 'sync-version.cjs'), path.join(dir, 'scripts', 'sync-version.cjs'));
    fs.copyFileSync(path.join(__dirname, '..', 'src', 'version.ts'), path.join(dir, 'src', 'version.ts'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.0.2' }));
    execFileSync(process.execPath, [path.join(dir, 'scripts', 'sync-version.cjs'), 'v0.0.81', 'abc123', '2026-01-01T00:00:00Z']);
    const source = fs.readFileSync(path.join(dir, 'src', 'version.ts'), 'utf8');
    assert.match(source, /export const APP_VERSION = '0\.0\.81';/);
    assert.match(source, /export const APP_RELEASE_TAG = '0\.0\.81';/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'public', 'version.json'), 'utf8')), {
      version: '0.0.81', commit: 'abc123', buildDate: '2026-01-01T00:00:00Z',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
