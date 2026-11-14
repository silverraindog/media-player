import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isExcludedPicturesMedia, isExcludedPicturesPath, isIgnoredMediaFile, isIgnoredMediaItem } from './excludedMedia';
import type { MediaMetadata } from '../types';
import { DEFAULT_MEDIA_SCAN_CONFIG, extractAllMediaFromSambaTree, extractAllMediaFromSambaTreeAsync, isMediaFile } from './mediaExtractor';

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

test('ignores txt and torrent files without hiding playable media', () => {
  for (const name of ['readme.TXT', 'C:\\Downloads\\film.Torrent']) {
    assert.equal(isIgnoredMediaFile(name), true);
    assert.equal(isMediaFile(name, { ...DEFAULT_MEDIA_SCAN_CONFIG, customExtensions: ['txt', '.torrent'] }), false);
  }
  assert.equal(isIgnoredMediaFile('/media/folder.txt/movie.mkv'), false);
  assert.equal(isIgnoredMediaFile('movie.torrent.mkv'), false);
  assert.equal(isIgnoredMediaItem({ path: '/media/readme.txt' } as MediaMetadata), true);
  assert.equal(isIgnoredMediaItem({ matchedFilename: 'movie.torrent', recommendedFolderStructure: 'Movies/Movie' } as MediaMetadata), true);
  assert.equal(isIgnoredMediaItem({ path: '/media/movie.mkv', matchedFilename: 'readme.txt' } as MediaMetadata), false);
});

test('both scanners skip ignored files even when matched or configured as custom extensions', async () => {
  const nodes = [{
    id: 'root', name: 'Movies', path: '/media/Movies', type: 'folder' as const, children: [
      { id: 'txt', name: 'readme.TXT', path: '/media/Movies/readme.TXT', type: 'file' as const,
        matchedMedia: { id: 'matched', title: 'readme', type: 'movie' as const } as MediaMetadata },
      { id: 'torrent', name: 'film.torrent', path: '/media/Movies/film.torrent', type: 'file' as const },
      { id: 'movie', name: 'film.mkv', path: '/media/Movies/film.mkv', type: 'file' as const },
      { id: 'folder', name: 'folder.txt', path: '/media/Movies/folder.txt', type: 'folder' as const, children: [
        { id: 'nested', name: 'nested.mp4', path: '/media/Movies/folder.txt/nested.mp4', type: 'file' as const },
      ] },
    ],
  }];
  const config = { ...DEFAULT_MEDIA_SCAN_CONFIG, customExtensions: ['txt', 'torrent'] };
  for (const items of [extractAllMediaFromSambaTree(nodes, config), await extractAllMediaFromSambaTreeAsync(nodes, config)]) {
    assert.ok(items.some(item => item.path?.endsWith('film.mkv')));
    assert.ok(items.some(item => item.path?.endsWith('nested.mp4')));
    assert.ok(items.every(item => !isIgnoredMediaFile(item.path) && item.id !== 'matched'));
  }
});
