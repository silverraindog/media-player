import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchAlbumMetadata } from './albumMetadata';

test('looks up a uniquely identified MusicBrainz album in TheAudioDB', async () => {
  const originalFetch = globalThis.fetch;
  const id = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
  const diagnostics: { provider: string; outcome: string }[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'musicbrainz.org') {
        assert.match(url.searchParams.get('query') || '', /releasegroup:"Parachutes" AND artist:"Coldplay"/);
        assert.match(new Headers(init?.headers).get('User-Agent') || '', /SambaVault/);
        return Response.json({ count: 1, 'release-groups': [{
          id, title: 'Parachutes', 'artist-credit': [{ artist: { name: 'Coldplay' } }],
        }] });
      }
      assert.equal(url.hostname, 'www.theaudiodb.com');
      assert.equal(url.searchParams.get('i'), id);
      return Response.json({ album: [{
        strMusicBrainzID: id, strAlbum: 'Parachutes', strArtist: 'Coldplay',
        strDescription: 'Album description', strAlbumThumb: 'https://example.com/album.jpg',
      }] });
    };
    assert.deepEqual(await fetchAlbumMetadata('Parachutes', 'Coldplay', diagnostics), {
      source: 'musicbrainz-audiodb', title: 'Parachutes', artist: 'Coldplay', musicBrainzId: id,
      overview: 'Album description', posterUrl: 'https://example.com/album.jpg',
    });
    assert.deepEqual(diagnostics.map(entry => entry.provider), ['MusicBrainz', 'TheAudioDB']);
  } finally { globalThis.fetch = originalFetch; }
});

test('refuses ambiguous or different artists before looking up album artwork', async () => {
  const originalFetch = globalThis.fetch;
  const id = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
  const diagnostics: { provider: string; outcome: string }[] = [];
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ count: 2, 'release-groups': [
        { id, title: 'Parachutes', 'artist-credit': [{ artist: { name: 'Coldplay' } }] },
        { id: '2dc4c347-a1db-32aa-b14f-bc9cc507b843', title: 'Parachutes', 'artist-credit': [{ artist: { name: 'Coldplay' } }] },
      ] });
    };
    assert.equal(await fetchAlbumMetadata('Parachutes', 'Coldplay', diagnostics), null);
    assert.equal(calls, 1);
    assert.match(diagnostics[0].outcome, /Ambiguous/);
  } finally { globalThis.fetch = originalFetch; }
});

test('reports rate limits and prevents queued retries during provider cooldown', async () => {
  const originalFetch = globalThis.fetch;
  const diagnostics: { provider: string; outcome: string }[] = [];
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(null, { status: 503 });
    };
    assert.equal(await fetchAlbumMetadata('Example', 'Artist', diagnostics), null);
    assert.equal(await fetchAlbumMetadata('Example', 'Artist', diagnostics), null);
    assert.equal(calls, 1);
    assert.equal(diagnostics[0].outcome, 'HTTP 503');
    assert.equal(diagnostics[1].outcome, 'Provider cooling down; retry later');
  } finally { globalThis.fetch = originalFetch; }
});
