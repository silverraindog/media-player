import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { MediaMetadata } from '../types';
import { fetchLibraryMetadata, isCategorizerFolderLabel, isIndividualAudioTrack, isMissingArtwork, isMissingSynopsis, isVerifiedMatch, mergeFetchedMetadata, trustedMediaYear, type MetadataLookupDetails } from './libraryMetadataFetch';
import { nodeToMediaMetadata, parseTitleAndYear, parsedFileToMediaMetadata } from './mediaExtractor';

const item: MediaMetadata = {
  id: 'local-1', title: 'Example', type: 'series', year: 2020, yearSource: 'user', overview: '',
  posterUrl: 'https://images.unsplash.com/example', genres: [], rating: 0,
  path: '/media/example', seasons: [{ seasonNumber: 1, episodeCount: 1, episodes: [
    { seasonNumber: 1, episodeNumber: 1, title: 'Pilot', filePath: '/media/example/pilot.mkv' },
  ] }], recommendedFolderStructure: 'Example', recommendedFilenames: [],
};

test('excludes exact category folder labels but keeps titles and standalone files', () => {
  for (const title of ['Pictures', 'Collections', 'Comedy', 'Animation', 'Horror - Supernatural', 'Scify', 'Reality', 'Documentory']) {
    assert.equal(isCategorizerFolderLabel({ ...item, title, path: `/media/${title}` }), true, title);
  }
  assert.equal(isCategorizerFolderLabel({ ...item, title: 'comedy', path: '/media/Comedy/a-film.mkv' }), true);
  assert.equal(isCategorizerFolderLabel({ ...item, title: 'Comedy', path: 'C:\\media\\Comedy.MKV' }), false);
  assert.equal(isCategorizerFolderLabel({ ...item, title: 'Comedy Nights', path: '/media/Comedy Nights' }), false);
});

test('identifies individual audio entries without excluding albums that point to an audio file', () => {
  const album = { ...item, type: 'album' as const, title: 'The Album', path: '/Music/Artist/The Album/01 - Track.mp3', recommendedFolderStructure: '/Music/Artist/The Album', matchedFilename: 'The Album' };
  assert.equal(isIndividualAudioTrack(album), false);
  assert.equal(isIndividualAudioTrack({ ...album, title: '01 - Track', recommendedFolderStructure: album.path!, matchedFilename: '01 - Track.mp3' }), true);
  assert.equal(isIndividualAudioTrack({ ...album, title: 'Track', path: 'C:\\Music\\Artist\\Album\\01 - Track.FLAC', recommendedFolderStructure: '', matchedFilename: undefined }), true);
  assert.equal(isIndividualAudioTrack({ ...album, title: 'Book', path: '/books/Book.epub', recommendedFolderStructure: '/books/Book.epub' }), false);
  assert.equal(isIndividualAudioTrack({ ...album, type: 'movie', recommendedFolderStructure: 'Film.mp3' }), false);
});

test('fills missing fields without changing identity, paths, episodes, or existing values', () => {
  const updated = mergeFetchedMetadata({ ...item, genres: ['Drama'], rating: 7 }, {
    overview: 'A real synopsis', posterUrl: 'https://example.com/poster.jpg',
    fanartUrl: 'https://example.com/fanart.jpg', genres: ['Comedy'], rating: 9,
  });
  assert.equal(updated.id, item.id);
  assert.equal(updated.path, item.path);
  assert.deepEqual(updated.seasons, item.seasons);
  assert.deepEqual(updated.genres, ['Drama']);
  assert.equal(updated.rating, 7);
  assert.equal(updated.overview, 'A real synopsis');
  assert.equal(updated.posterUrl, 'https://example.com/poster.jpg');
  assert.equal(isMissingSynopsis(updated), false);
  assert.equal(isMissingArtwork(updated.posterUrl), false);
});

test('treats placeholders as missing and refuses placeholder replacements', () => {
  assert.equal(isMissingSynopsis({ ...item, overview: 'No synopsis available', synopsis: '' }), true);
  assert.equal(isMissingSynopsis({ ...item, overview: '', synopsis: 'Actual synopsis' }), false);
  assert.equal(isMissingArtwork(item.posterUrl), true);
  assert.deepEqual(mergeFetchedMetadata(item, { overview: 'Placeholder synopsis', posterUrl: item.posterUrl }), item);
});

test('requires a provider match with the same title and compatible year', () => {
  assert.equal(isVerifiedMatch(item, { title: 'Example', year: 2020, source: 'tvmaze' }), true);
  assert.equal(isVerifiedMatch(item, { title: 'Different', source: 'tvmaze' }), false);
  assert.equal(isVerifiedMatch(item, { title: 'Example', year: 2021, source: 'tvmaze' }), false);
  assert.equal(isVerifiedMatch(item, { title: 'Example', source: 'fallback' }), false);
  assert.equal(isVerifiedMatch(item, { title: 'Example', source: 'tvmaze' }), false);
  assert.equal(isVerifiedMatch({ ...item, yearSource: 'placeholder' }, { title: 'Example', year: 2020, source: 'tvmaze' }), false);
  assert.equal(isVerifiedMatch({ ...item, type: 'album' }, { title: 'Example', year: 2020, source: 'itunes' }), false);
});

test('records detected and placeholder years without confusing a current-year release', () => {
  const currentYear = new Date().getFullYear();
  assert.equal(parseTitleAndYear(`Example (${currentYear}).mkv`).hasYear, true);
  assert.equal(parseTitleAndYear('Example.mkv').hasYear, false);
  const folder = nodeToMediaMetadata({ id: 'f', name: `Example (${currentYear})`, path: `Example (${currentYear})`, type: 'folder', mediaType: 'movie' });
  assert.equal(folder?.yearSource, 'folder');
  const file = nodeToMediaMetadata({ id: 'a', name: 'Example.mkv', path: 'Example.mkv', type: 'file', mediaType: 'movie' });
  assert.equal(file?.yearSource, 'placeholder');
  const series = nodeToMediaMetadata({
    id: 's', name: 'Example S01E01.mkv', type: 'file', mediaType: 'series',
    path: `Series/Example (${currentYear})/Season 1/Example S01E01.mkv`,
  });
  assert.equal(series?.year, currentYear);
  assert.equal(series?.yearSource, 'folder');
  const imported = parsedFileToMediaMetadata({
    id: 'b', originalFilename: 'Example.mkv', detectedType: 'movie', detectedTitle: 'Example', detectedYear: 2024,
    cleanFormattedFilename: 'Example.mkv', cleanFolderPath: 'Example', status: 'pending',
  });
  assert.equal(imported.yearSource, undefined);
});

test('only trusts legacy years supported by the matching original name', () => {
  assert.equal(trustedMediaYear({ ...item, yearSource: undefined, matchedFilename: 'Example (2020).mkv' }), 2020);
  assert.equal(trustedMediaYear({ ...item, yearSource: undefined, folderPath: '/Series/Example (2020)' }), 2020);
  assert.equal(trustedMediaYear({ ...item, yearSource: undefined, matchedFilename: 'Another (2020).mkv' }), undefined);
  assert.equal(trustedMediaYear({ ...item, yearSource: undefined }), undefined);
  assert.equal(trustedMediaYear({ ...item, yearSource: 'placeholder', matchedFilename: 'Example (2020).mkv' }), undefined);
});

test('omits untrusted years from lookup and asks for review', async () => {
  const originalFetch = globalThis.fetch;
  const details: MetadataLookupDetails[] = [];
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal('year' in JSON.parse(String(init?.body)), false);
      return Response.json({ success: true, source: 'tvmaze', title: 'Example', year: 1999 });
    };
    assert.equal(await fetchLibraryMetadata({ ...item, yearSource: 'placeholder' }, new AbortController().signal, entry => details.push(entry)), null);
    assert.match(details[0].reason, /unverified/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('surfaces failed responses and does not treat fallback data as a match', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, source: 'fallback', title: 'Example' }));
    assert.equal(await fetchLibraryMetadata(item, new AbortController().signal), null);
    globalThis.fetch = async () => new Response('', { status: 500 });
    await assert.rejects(fetchLibraryMetadata(item, new AbortController().signal), /HTTP 500/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reports provider outcomes and rejection reasons without changing match behavior', async () => {
  const originalFetch = globalThis.fetch;
  const details: MetadataLookupDetails[] = [];
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).diagnostics, true);
      return Response.json({
        success: true, source: 'tvmaze', title: 'Example', year: 2021,
        overview: 'A story', diagnostics: [{ provider: 'OMDb', outcome: 'Key, quota, or request rejected' }, { provider: 'TVMaze', outcome: 'Result returned' }],
      });
    };
    assert.equal(await fetchLibraryMetadata(item, new AbortController().signal, (entry) => details.push(entry)), null);
    assert.equal(details[0].reason, 'Year does not match the library item');
    assert.deepEqual(details[0].fields, ['synopsis']);
    assert.deepEqual(details[0].providers?.map((entry) => entry.provider), ['OMDb', 'TVMaze']);
    globalThis.fetch = async () => Response.json({ success: true, source: 'itunes', title: 'Different' });
    await fetchLibraryMetadata(item, new AbortController().signal, (entry) => details.push(entry));
    assert.equal(details[1].reason, 'Title does not match the library item');
    assert.equal(details[1].providers, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
