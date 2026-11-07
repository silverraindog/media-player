import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { SambaShareNode } from '../types';
import { normalizeFranchiseHierarchy } from './franchiseHierarchy';
import { stripVirtualFranchiseSuffix } from './pathSanitizer';

const root: SambaShareNode = {
  id: 'franchises', name: 'Franchises', path: '/media/Franchises', type: 'folder',
  children: [{
    id: 'folder', name: 'Uncharted Example', path: '/media/Franchises/Uncharted Example',
    type: 'folder', children: [{
      id: 'season', name: 'Season 01', path: '/media/Franchises/Uncharted Example/Season 01',
      type: 'folder', children: [{
        id: 'episode', name: 'Example S01E01.mkv',
        path: '/media/Franchises/Uncharted Example/Season 01/Example S01E01.mkv', type: 'file',
      }],
    }],
  }],
};

test('labels synthetic franchise series Universe while retaining real paths', () => {
  const series = normalizeFranchiseHierarchy([root])[0].children![0].children![0];
  assert.equal(series.name, 'Uncharted Example (Universe)');
  assert.equal(series.path, '/media/Franchises/Uncharted Example');
  assert.equal(series.matchedMedia?.title, series.name);
  assert.equal(series.children![0].children![0].path, '/media/Franchises/Uncharted Example/Season 01/Example S01E01.mkv');
});

test('renames only old synthetic nodes when normalizing saved trees', () => {
  const normalized = normalizeFranchiseHierarchy([root]);
  const folder = normalized[0].children![0];
  const series = folder.children![0];
  series.name = 'Uncharted Example (Main Series)';
  series.matchedMedia!.title = series.name;
  folder.children!.push({ id: 'real', name: 'Another Show (Main Series)', path: '/media/Another Show (Main Series)', type: 'folder' });
  const updated = normalizeFranchiseHierarchy(normalized)[0].children![0].children!;
  assert.equal(updated[0].name, 'Uncharted Example (Universe)');
  assert.equal(updated[0].matchedMedia?.title, 'Uncharted Example (Universe)');
  assert.equal(updated[1].name, 'Another Show (Main Series)');
});

test('strips duplicate virtual Universe paths without changing real Universe directories', () => {
  assert.equal(stripVirtualFranchiseSuffix('/media/Franchises/Example/Example (Universe)/Season 01'), '/media/Franchises/Example/Season 01');
  assert.equal(stripVirtualFranchiseSuffix('Example/Example (Universe)'), 'Example');
  assert.equal(stripVirtualFranchiseSuffix('/media/Example (Universe)/Season 01'), '/media/Example (Universe)/Season 01');
  assert.equal(stripVirtualFranchiseSuffix('/media/Example/Example (Main Series)'), '/media/Example');
});
