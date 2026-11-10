import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

function run(dataDir: string, code: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    cwd: root,
    env: { ...process.env, SAMBA_VAULT_DATA_DIR: dataDir },
    encoding: 'utf8',
    timeout: 30000,
  });
}

test('database and state survive an immediate backend restart with concurrent initial requests', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sambavault-persistence-'));
  try {
    const write = run(dir, `
      import { batchSaveMediaToDb, saveMediaToDb, saveVaultStateToDisk } from './src/server/database.ts';
      await Promise.all([
        batchSaveMediaToDb([{id:'one', media_type:'movie', title:'One', synopsis:'Synopsis', cast:'[{"name":"Actor"}]'}]),
        saveMediaToDb({id:'two', media_type:'series', title:'Two', synopsis:'Synopsis'}),
      ]);
      saveVaultStateToDisk({sambaTree:[{name:'Share'}]});
    `);
    assert.equal(write.status, 0, write.stderr);
    const read = run(dir, `
      import { getAllMediaFromDb, getVaultStateFromDisk } from './src/server/database.ts';
      const items = await getAllMediaFromDb();
      console.log(JSON.stringify({items, state:getVaultStateFromDisk()}));
    `);
    assert.equal(read.status, 0, read.stderr);
    const result = JSON.parse(read.stdout);
    assert.deepEqual(result.items.map((item: { id: string }) => item.id).sort(), ['one', 'two']);
    assert.equal(result.items.find((item: { id: string }) => item.id === 'one').cast, '[{"name":"Actor"}]');
    assert.equal(result.state.sambaTree[0].name, 'Share');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unreadable existing database and state are never replaced with empty data', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sambavault-corrupt-'));
  try {
    const dbPath = path.join(dir, 'media_vault.sqlite');
    const statePath = path.join(dir, 'vault_state.json');
    writeFileSync(dbPath, 'not a sqlite database');
    writeFileSync(statePath, '{invalid');
    const result = run(dir, `
      import { getAllMediaFromDb, saveVaultStateToDisk } from './src/server/database.ts';
      try { await getAllMediaFromDb(); process.exit(1); } catch (e) {
        if (!String(e).includes('not replaced')) throw e;
      }
      try { saveVaultStateToDisk({sambaTree:[]}); process.exit(2); } catch (e) {
        if (!String(e).includes('not replaced')) throw e;
      }
    `);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(dbPath, 'utf8'), 'not a sqlite database');
    assert.equal(readFileSync(statePath, 'utf8'), '{invalid');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
