import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isExcludedPicturesMedia, isExcludedPicturesPath } from './excludedMedia';
import type { MediaMetadata } from '../types';

test('excludes only the requested Pictures directory and descendants', () => {
  assert.equal(isExcludedPicturesPath('/Volumes/media/Pictures'), true);
  assert.equal(isExcludedPicturesPath('/Volumes/media/Pictures/nested/video.mp4'), true);
  assert.equal(isExcludedPicturesPath('/Volumes/media/Picturesque/video.mp4'), false);
  assert.equal(isExcludedPicturesPath('/Volumes/other/Pictures/video.mp4'), false);
  assert.equal(isExcludedPicturesMedia({ folderPath: '/Volumes/media/Pictures/album' } as MediaMetadata), true);
});
