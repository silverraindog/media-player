const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === 'musicbrainz.org') {
    return Response.json({ count: 1, 'release-groups': [{
      id: '1dc4c347-a1db-32aa-b14f-bc9cc507b843', title: 'Parachutes',
      'artist-credit': [{ artist: { name: 'Coldplay' } }],
    }] });
  }
  if (url.hostname === 'www.theaudiodb.com') {
    return Response.json({ album: [{
      strMusicBrainzID: '1dc4c347-a1db-32aa-b14f-bc9cc507b843', strAlbum: 'Parachutes',
      strArtist: 'Coldplay', strDescription: 'Album description', strAlbumThumb: 'https://example.com/album.jpg',
    }] });
  }
  if (url.hostname === 'api.themoviedb.org') {
    const query = url.searchParams.get('query');
    if (query === 'OMDb Test') return Response.json({ total_pages: 1, results: [] });
    const results = query === 'Ambiguous' ? [
      { title: 'Ambiguous', release_date: '2024-01-01' },
      { title: 'Ambiguous', release_date: '2024-02-01' },
    ] : [{ title: 'The First Omen', release_date: '2024-04-03', overview: 'Provider synopsis', poster_path: '/poster.jpg' }];
    return Response.json({ total_pages: 1, results });
  }
  if (url.hostname === 'www.omdbapi.com' && url.searchParams.get('t') === 'OMDb Test') {
    if (url.searchParams.get('apikey') !== 'saved-test-key') return new Response(null, { status: 401 });
    return Response.json({ Response: 'True', Title: 'OMDb Test', Year: '2024', Plot: 'OMDb synopsis' });
  }
  if (['www.omdbapi.com', 'itunes.apple.com', 'api.tvmaze.com'].includes(url.hostname)) {
    return new Response(null, { status: 503 });
  }
  return originalFetch(input, init);
};
