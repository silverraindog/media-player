import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isMalformedMediaSource } from './mediaSourceDiagnostics';

test('accepts encoded filesystem paths in Express query parameters', () => {
  assert.equal(isMalformedMediaSource('http://localhost:3000/api/samba/stream?path=%2FVolumes%2Fmedia%2FFranchises%2FBSG%20-%20Catch%20The%20Frak%20Up.mkv'), false);
  assert.equal(isMalformedMediaSource('asset://localhost/Volumes/media/movie.mkv'), false);
  assert.equal(isMalformedMediaSource('blob:http://localhost:3000/1234'), false);
});

test('detects nested schemes and duplicated volume prefixes in paths', () => {
  assert.equal(isMalformedMediaSource('/Volumes/media/asset://localhost/file.mkv'), true);
  assert.equal(isMalformedMediaSource('http://localhost:3000/Volumes/media/asset%3A%2F%2Ffile.mkv'), true);
  assert.equal(isMalformedMediaSource('/Volumes/media/Volumes/media/file.mkv'), true);
  assert.equal(isMalformedMediaSource('http://localhost:3000/localhost/%2FVolumes%2Fmedia%2Ffile.mkv'), true);
});
