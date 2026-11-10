import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isExcludedPicturesMedia, isExcludedPicturesPath } from './excludedMedia';
import type { MediaMetadata } from '../types';
import { extractAllMediaFromSambaTree, extractAllMediaFromSambaTreeAsync } from './mediaExtractor';

test('excludes only the requested Pictures directory and descendants', () => {
  assert.equal(isExcludedPicturesPath('/Volumes/media/Pictures'), true);
  assert.equal(isExcludedPicturesPath('/Volumes/media/Pictures/nested/video.mp4'), true);
  assert.equal(isExcludedPicturesPath('/Volumes/media/Picturesque/video.mp4'), false);
  assert.equal(isExcludedPicturesPath('/Volumes/other/Pictures/video.mp4'), false);
  assert.equal(isExcludedPicturesMedia({ folderPath: '/Volumes/media/Pictures/album' } as MediaMetadata), true);
});

test('download containers are skipped but their media remains discoverable in both scanners', async () => {
  const nodes = [{
    id: 'folder', name: 'drive-download-20261031T084432Z-1-001',
    path: '/media/drive-download-20261031T084432Z-1-001', type: 'folder' as const,
    mediaType: 'movie' as const, children: [{
      id: 'file', name: 'Example (2020).mkv',
      path: '/media/drive-download-20261031T084432Z-1-001/Example (2020).mkv', type: 'file' as const,
    }],
  }];
  for (const items of [extractAllMediaFromSambaTree(nodes), await extractAllMediaFromSambaTreeAsync(nodes)]) {
    assert.ok(items.some(item => item.path?.endsWith('Example (2020).mkv')));
    assert.ok(!items.some(item => item.title.startsWith('drive-download')));
  }
});
