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
    if (url.pathname === '/3/search/collection' && url.searchParams.get('query') === 'Wishmaster') {
      return Response.json({ total_pages: 1, results: [
        { id: 777, name: 'Wishmaster Collection', overview: 'A dark fantasy collection.' },
      ] });
    }
    if (url.pathname === '/3/collection/777') {
      return Response.json({
        id: 777,
        name: 'Wishmaster Collection',
        overview: 'A dark fantasy collection.',
        poster_path: '/wishmaster-collection.jpg',
        parts: [
          { title: 'Wishmaster', release_date: '1997-03-01', overview: 'The first djinn story.' },
          { title: 'Wishmaster 2', release_date: '1999-03-12', overview: 'The djinn returns.' },
        ],
      });
    }
    const query = url.searchParams.get('query');
    if (query === 'Доктор кто') return Response.json({ total_pages: 1, results: [] });
    if (query === 'The Evil Dead') return Response.json({ total_pages: 1, results: [
      { id: 88, title: 'The Evil Dead', release_date: '1981-10-15', overview: 'Film synopsis' },
    ] });
    if (query === 'The Deer Hunter') return Response.json({ total_pages: 1, results: [
      { id: 89, title: 'The Deer Hunter', release_date: '1978-12-08', overview: 'Drama synopsis', poster_path: '/deer-hunter.jpg' },
    ] });
    if (query === 'Futurama') return Response.json({ total_pages: 1, results: [
      { id: 33, name: 'Futurama', first_air_date: '1999-03-28', overview: 'Series synopsis' },
    ] });
    if (query === 'OMDb Test') return Response.json({ total_pages: 1, results: [] });
    if (query === 'Nearby Year') return Response.json({
      total_pages: 1,
      results: url.searchParams.has('primary_release_year') ? [] :
        [{ id: 101, title: 'Nearby Year', release_date: '2023-01-01', popularity: 12, vote_count: 7 }],
    });
    if (query === 'Local - Alternate') return Response.json({ total_pages: 1, results: [] });
    if (query === 'Local') return Response.json({ total_pages: 1, results: [] });
    if (query === 'Alternate') return Response.json({
      total_pages: 1, results: [{ id: 102, title: 'Alternate', release_date: '2024-01-01', popularity: 5 }],
    });
    const results = query === 'Ambiguous' ? [
      { id: 1, title: 'Ambiguous', release_date: '2024-01-01', popularity: 5 },
      { id: 2, title: 'Ambiguous', release_date: '2024-02-01', popularity: 20 },
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
