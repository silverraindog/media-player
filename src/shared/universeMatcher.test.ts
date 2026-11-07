import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { cleanUniverseTitle, curatedUniverse, selectConfidentCandidate, universeItemKey, type UniverseCandidate } from './universeMatcher';
import type { MediaMetadata } from '../types';

test('cleans file and season names without dropping the title year hint', () => {
  assert.deepEqual(cleanUniverseTitle('Caprica Season 1 1080p x265'), { title: 'Caprica', year: undefined });
  assert.deepEqual(cleanUniverseTitle('The.Plan.(2009).1080p.x265.mkv'), { title: 'The Plan', year: 2009 });
  assert.deepEqual(cleanUniverseTitle('The Plan 2009'), { title: 'The Plan', year: 2009 });
  assert.equal(cleanUniverseTitle('24 S01E01 1080p.mkv').title, '24');
});

test('only selects a unique exact title and compatible year', () => {
  const first: UniverseCandidate = { id: 1, title: 'Battlestar Galactica', year: 1978, type: 'series' };
  const second: UniverseCandidate = { id: 2, title: 'Battlestar Galactica', year: 2004, type: 'series' };
  assert.equal(selectConfidentCandidate('Battlestar Galactica', undefined, [first, second]), null);
  assert.equal(selectConfidentCandidate('Battlestar Galactica', 2004, [first, second]), second);
  assert.equal(selectConfidentCandidate('Battlestar', undefined, [first]), null);
});

test('links Caprica and the 2009 Plan but not unrelated remakes', () => {
  const caprica = curatedUniverse({ id: 1, title: 'Caprica', type: 'series' });
  const plan = curatedUniverse({ id: 2, title: 'The Plan', type: 'movie', year: 2009 });
  assert.equal(caprica?.key, plan?.key);
  assert.equal(curatedUniverse({ id: 3, title: 'The Plan', type: 'movie', year: 2020 }), undefined);
});

test('uses the scanned series folder or movie file for stable group keys', () => {
  const series = { id: 'one', type: 'series', folderPath: '/media/show', path: '/media/show/ep.mkv' } as MediaMetadata;
  assert.equal(universeItemKey(series), 'series:/media/show');
  assert.equal(universeItemKey({ ...series, id: 'two' }), 'series:/media/show');
  assert.equal(universeItemKey({ ...series, type: 'movie' }), 'movie:/media/show/ep.mkv');
});
