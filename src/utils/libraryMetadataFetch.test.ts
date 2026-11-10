import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { MediaMetadata } from '../types';
import { fetchLibraryMetadata, isCategorizerFolderLabel, isIndividualAudioTrack, isMetadataSidecar, isMissingArtwork, isMissingSynopsis, isVerifiedMatch, libraryLookupTitle, mergeFetchedMetadata, MetadataBackendUnavailableError, MetadataReviewRequiredError, trustedMediaYear, type MetadataLookupDetails } from './libraryMetadataFetch';
import { nodeToMediaMetadata, parseTitleAndYear, parsedFileToMediaMetadata } from './mediaExtractor';
import { localDbFallback } from './localDatabaseFallback';

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

test('excludes sidecar entries but preserves folders with media paths', () => {
  for (const file of ['3 Eng.srt', 'Example.nfo', 'poster.jpg', 'Example.en.SSA']) {
    assert.equal(isMetadataSidecar({ ...item, path: `/media/${file}`, recommendedFolderStructure: `/media/${file}`, matchedFilename: file }), true);
  }
  assert.equal(isMetadataSidecar({ ...item, path: '/media/Example/film.mkv', recommendedFolderStructure: '/media/Example', matchedFilename: 'Example.srt' }), false);
  assert.equal(isMetadataSidecar({ ...item, path: '/media/Example/film.mkv', folderPath: '/media/Example', recommendedFolderStructure: '/media/Example' }), false);
});

test('cleans release tags from lookup titles while requiring the correct year', async () => {
  const media = { ...item, title: 'The First Omen 2024  WEBRip  -', year: 2024, yearSource: 'filename' as const };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).title, 'The First Omen');
      return Response.json({ success: true, source: 'omdb', title: 'The First Omen', year: 2024 });
    };
    assert.ok(await fetchLibraryMetadata(media, new AbortController().signal));
    assert.equal(isVerifiedMatch(media, { source: 'omdb', title: 'The First Omen', year: 2006 }), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('cleans explicit collection and encoding annotations without guessing sequel titles', () => {
  const examples = [
    ['01 Hellraiser I - Horror 1987 Eng Subs', 'Hellraiser I'],
    ['02 Hellraiser II Hellbound - Horror 1988 Eng Subs', 'Hellraiser II Hellbound'],
    ['08 Hellraiser VIII Hellworld - Horror 2005 Eng Subs', 'Hellraiser VIII Hellworld'],
    ['04 Hellraiser IV Bloodline - Horror 1996 Eng Subs', 'Hellraiser IV Bloodline'],
    ['06 Hellraiser VI Hellseeker - Horror 2002 Eng Subs', 'Hellraiser VI Hellseeker'],
    ['07 Hellraiser VII Deader - Horror 2005 Eng Subs', 'Hellraiser VII Deader'],
    ['Battlestar Galactica The Plan 2009   10-bit   5 1', 'Battlestar Galactica The Plan'],
    ['Toy Story 2 1999  BRrip  YIFY', 'Toy Story 2'],
    ['02 Return To House On Haunted Hill - Unrated Horror 2007 Eng Subs', 'Return To House On Haunted Hill'],
    ['01 House On Haunted Hill - Horror Mystery 1999 Eng Subs', 'House On Haunted Hill'],
    ['04 Insidious The Last Key - 2018 Eng Ita Multi-Subs', 'Insidious The Last Key'],
    ['03 Insidious Chapter 3 - Horror 2015 Eng Ita Multi-Subs', 'Insidious Chapter 3'],
    ['01 Insidious Chapter 1 - 2011 Eng Ita Multi-Subs', 'Insidious Chapter 1'],
    ['02 Insidious Chapter 2 - 2013 Eng Ita Multi-Subs', 'Insidious Chapter 2'],
    ['Dragonfly 2002   -OFT', 'Dragonfly'],
    ['Mr Brooks 2007  BRrip  YIFY', 'Mr Brooks'],
    ['The Postman 1997  BrRip  YIFY', 'The Postman'],
    ['01 Wishmaster - Horror 1997 Eng Rus Multi Subs', 'Wishmaster'],
    ['Sinister 2012  BRrip  GAZ YIFY', 'Sinister'],
    ['Predator 2 1990  BrRip  bitloks YIFY', 'Predator 2'],
    ['House of Spoils 2024  AMZN WEBRip 800MB -GalaxyRG', 'House of Spoils'],
    ['13 Sins 2014    YIFY', '13 Sins'],
    ['The Visit 2015    -JYK', 'The Visit'],
    ['Hollow Man 2000 DC  BRRip  YIFY', 'Hollow Man'],
    ['The Sacrament 2013   -', 'The Sacrament'],
    ['The Witches Of Eastwick 1987    anoXmous', 'The Witches Of Eastwick'],
    ['Beauty And The Beast 1991    anoXmous', 'Beauty And The Beast'],
    ['Swing VoteDvDrip-aXXo', 'Swing Vote'],
    ['The MessengersDvDrip AC3-aXXo', 'The Messengers'],
    ['December BoysDvDrip-FXG', 'December Boys'],
    ['Snow White And The Seven Dwarfs 1937   DDP5 1  10bit-GalaxyRG265', 'Snow White And The Seven Dwarfs'],
    ['The Strangers Chapter 2 2025     5 1 BONE', 'The Strangers Chapter 2'],
    ['Happy Death Day 2U 2019   -MkvCage ws', 'Happy Death Day 2U'],
    ['Order Of The Phoenix 2007    -ETRG', 'Order Of The Phoenix'],
    ['Terrifier 2016 Uncut    AC3 -MgB', 'Terrifier'],
    ['Scary Movie 4 2006    750MB-Mkvking', 'Scary Movie 4'],
    ['Back To The Future Part II 1989 Remastered     5 1 BONE', 'Back To The Future Part II'],
    ['Men in Black 2 2002    Dual Audio  ESub', 'Men in Black 2'],
    ['scream vi 2023   dd5 1   rmteam', 'scream vi'],
    ['Alien 3 1992 Assembly Cut     5 1 BONE', 'Alien 3'],
    ['Eden Lake 2008   DDP5 1  10bit-GalaxyRG265', 'Eden Lake'],
    ['Free Guy 2021    5 1-', 'Free Guy'],
    ['Freaks 2018   1400MB DD5 1 -GalaxyRG', 'Freaks'],
    ['Mercy 2023  AMZN  DDP5 1 H 264-FLUX', 'Mercy'],
    ['Asteroid City 2023 REPACK  WEBRip 1400MB DD5 1 -GalaxyRG', 'Asteroid City'],
    ['The Horse Whisperer 1998  DSNP  H264-GPRS', 'The Horse Whisperer'],
    ['The Ring Two 2005   KATRG', 'The Ring Two'],
    ['Terrifier 2 2022    5 1-', 'Terrifier 2'],
    ['Interstellar 2014 2014    YIFY', 'Interstellar'],
    ['2016 Terrifier 1912 BDRip  -HD MA', 'Terrifier'],
  ];
  for (const [title, expected] of examples) assert.equal(libraryLookupTitle({ title, type: 'movie' }), expected);
  assert.equal(libraryLookupTitle({ title: '10 Things I Hate About You (1999)', type: 'movie' }), '10 Things I Hate About You');
  assert.equal(libraryLookupTitle({ title: '10-bit Heroes (2020)', type: 'movie' }), '10-bit Heroes');
  assert.equal(libraryLookupTitle({ title: '01 The Horror (1987)', type: 'movie' }), '01 The Horror');
  assert.equal(libraryLookupTitle({ title: '10 Things I Hate About You - Comedy 1999 Eng Subs', type: 'movie' }), '10 Things I Hate About You - Comedy');
  assert.equal(libraryLookupTitle({ title: 'Dragonfly 2002 -Director', type: 'movie' }), 'Dragonfly -Director');
  assert.equal(libraryLookupTitle({ title: 'The BRrip Chronicles (2012)', type: 'movie' }), 'The BRrip Chronicles');
  assert.equal(libraryLookupTitle({ title: 'Movie 2012 BRripper', type: 'movie' }), 'Movie BRripper');
  assert.equal(libraryLookupTitle({ title: 'AMZN Story (2024)', type: 'movie' }), 'AMZN Story');
  assert.equal(libraryLookupTitle({ title: 'Movie 2024 AMZN', type: 'movie' }), 'Movie AMZN');
  assert.equal(libraryLookupTitle({ title: 'Movie 2024 DC Comics', type: 'movie' }), 'Movie DC Comics');
  assert.equal(libraryLookupTitle({ title: 'YIFY (2014)', type: 'movie' }), 'YIFY');
  assert.equal(libraryLookupTitle({ title: 'The Visit 2015 -JYK Story', type: 'movie' }), 'The Visit -JYK Story');
  assert.equal(libraryLookupTitle({ title: 'The Bone Collector 1999', type: 'movie' }), 'The Bone Collector');
  assert.equal(libraryLookupTitle({ title: 'Movie 2024 Remastered Story', type: 'movie' }), 'Movie Remastered Story');
  assert.equal(libraryLookupTitle({ title: 'Swing VoteDvDrip Documentary', type: 'movie' }), 'Swing VoteDvDrip Documentary');
  assert.equal(libraryLookupTitle({ title: '01 Hellraiser I - Horror 1987 Eng Subs', type: 'album' }), '01 Hellraiser I - Horror 1987 Eng Subs');
});

test('uses cleaned release filenames while still requiring the original title and year', async () => {
  const originalFetch = globalThis.fetch;
  const examples = [
    { title: '01 Wishmaster - Horror 1997 Eng Rus Multi Subs', clean: 'Wishmaster', year: 1997 },
    { title: 'Sinister 2012  BRrip  GAZ YIFY', clean: 'Sinister', year: 2012 },
    { title: 'Predator 2 1990  BrRip  bitloks YIFY', clean: 'Predator 2', year: 1990 },
    { title: 'House of Spoils 2024  AMZN WEBRip 800MB -GalaxyRG', clean: 'House of Spoils', year: 2024 },
    { title: '13 Sins 2014    YIFY', clean: '13 Sins', year: 2014 },
    { title: 'The Visit 2015    -JYK', clean: 'The Visit', year: 2015 },
    { title: 'Hollow Man 2000 DC  BRRip  YIFY', clean: 'Hollow Man', year: 2000 },
    { title: 'The Sacrament 2013   -', clean: 'The Sacrament', year: 2013 },
    { title: 'Snow White And The Seven Dwarfs 1937   DDP5 1  10bit-GalaxyRG265', clean: 'Snow White And The Seven Dwarfs', year: 1937 },
    { title: 'Swing VoteDvDrip-aXXo', clean: 'Swing Vote', year: 2008, yearSource: 'user' as const },
  ];
  try {
    for (const example of examples) {
      const media: MediaMetadata = { ...item, type: 'movie', title: example.title, year: example.year, yearSource: example.yearSource || 'filename' };
      globalThis.fetch = async (_url, init) => {
        const request = JSON.parse(String(init?.body));
        assert.equal(request.title, example.clean);
        assert.equal(request.year, example.year);
        return Response.json({ success: true, source: 'tmdb', title: example.clean, year: example.year, overview: 'Synopsis' });
      };
      assert.ok(await fetchLibraryMetadata(media, new AbortController().signal));
      assert.equal(isVerifiedMatch(media, { source: 'tmdb', title: example.clean, year: example.year + 1 }), false);
      assert.equal(isVerifiedMatch(media, { source: 'tmdb', title: `${example.clean} 2`, year: example.year }), false);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('removes specific specials and audio encoding suffixes without choosing movie aliases', () => {
  const series: MediaMetadata = { ...item, title: 'Doctor Who 2005 Specials   -GalaxyTV', year: 2005, yearSource: 'filename' };
  assert.equal(libraryLookupTitle(series), 'Doctor Who');
  assert.equal(isVerifiedMatch(series, { source: 'tvmaze', title: 'Doctor Who', year: 2005 }), true);
  assert.equal(isVerifiedMatch(series, { source: 'tvmaze', title: 'Doctor Who', year: 1963 }), false);
  assert.equal(libraryLookupTitle({ title: 'Doctor Who 2005 Specials', type: 'series' }), 'Doctor Who Specials');
  assert.equal(libraryLookupTitle({ title: 'The Specials (2000)', type: 'series' }), 'The Specials');
  const movie = 'Il convento - Heretiks - The Convent  AC3 5 1 ITA ENG  H265 sub ita eng Sp33dy94-MIRCrew';
  assert.equal(libraryLookupTitle({ title: movie, type: 'movie' }), 'Il convento - Heretiks - The Convent');
  assert.equal(isVerifiedMatch({ ...item, type: 'movie', title: movie, year: 2018, yearSource: 'filename' },
    { source: 'tmdb', title: 'The Convent', year: 2018 }), false);
  assert.equal(libraryLookupTitle({ title: 'AC3 5 1 Story (2018)', type: 'movie' }), 'AC3 5 1 Story');
});

test('searches and verifies cleaned titles without accepting a different sequel or year', async () => {
  const media: MediaMetadata = { ...item, type: 'movie', title: 'Battlestar Galactica The Plan 2009   10-bit   5 1', year: 2009, yearSource: 'filename' };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.title, 'Battlestar Galactica The Plan');
      assert.equal(request.year, 2009);
      return Response.json({ success: true, source: 'tmdb', title: 'Battlestar Galactica: The Plan', year: 2009, overview: 'Synopsis' });
    };
    assert.ok(await fetchLibraryMetadata(media, new AbortController().signal));
    assert.equal(isVerifiedMatch(media, { source: 'tmdb', title: 'Battlestar Galactica: The Plan', year: 2008 }), false);
    const sequel = { ...media, title: '02 Hellraiser II Hellbound - Horror 1988 Eng Subs', year: 1988 };
    assert.equal(isVerifiedMatch(sequel, { source: 'tmdb', title: 'Hellraiser', year: 1988 }), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('uses the cleaned filename for lookup and exact match verification', async () => {
  const media: MediaMetadata = { ...item, type: 'movie', title: 'Toy Story 2 1999  BRrip  YIFY', year: 1999, yearSource: 'filename' };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.title, 'Toy Story 2');
      assert.equal(request.year, 1999);
      return Response.json({ success: true, source: 'tmdb', title: 'Toy Story 2', year: 1999, overview: 'Synopsis' });
    };
    assert.ok(await fetchLibraryMetadata(media, new AbortController().signal));
    assert.equal(isVerifiedMatch(media, { source: 'tmdb', title: 'Toy Story', year: 1999 }), false);
    assert.equal(isVerifiedMatch(media, { source: 'tmdb', title: 'Toy Story 2', year: 2000 }), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('ranked matches permit only title variants and years within one year', async () => {
  const media: MediaMetadata = { ...item, type: 'movie', title: 'Il convento - Heretiks - The Convent', year: 2018, yearSource: 'user' };
  const result = { source: 'tmdb', title: 'The Convent', year: 2019, matchMode: 'ranked' as const };
  assert.equal(isVerifiedMatch(media, result), true);
  assert.equal(isVerifiedMatch(media, { ...result, year: 2020 }), false);
  assert.equal(isVerifiedMatch(media, { ...result, title: 'The Convent 2' }), false);
  assert.equal(isVerifiedMatch(media, { ...result, source: 'omdb' }), false);
  assert.equal(isVerifiedMatch({ ...media, yearSource: 'placeholder' }, result), false);
  assert.equal(isVerifiedMatch(media, { ...result, matchMode: undefined }), false);
  const originalFetch = globalThis.fetch;
  try {
    let details: MetadataLookupDetails | undefined;
    globalThis.fetch = async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).allowRanked, true);
      return Response.json({ success: true, ...result });
    };
    assert.ok(await fetchLibraryMetadata(media, new AbortController().signal, value => { details = value; }));
    assert.match(details?.reason || '', /Ranked match/);
  } finally { globalThis.fetch = originalFetch; }
});

test('unique TMDB series with unverified years can be saved without relaxing movie or ambiguous matching', () => {
  for (const [title, year] of [['The Walking Dead', 2010], ['Futurama', 1999], ['Twin Peaks', 1990]] as const) {
    const media: MediaMetadata = { ...item, title, year: 2024, yearSource: 'placeholder' };
    const result = { source: 'tmdb', title, year, matchMode: 'unique-title' as const };
    assert.equal(isVerifiedMatch(media, result), true);
    assert.equal(mergeFetchedMetadata(media, result).year, year);
    assert.equal(mergeFetchedMetadata(media, result).yearSource, 'provider');
    assert.equal(isVerifiedMatch({ ...media, type: 'movie' }, result), false);
    assert.equal(isVerifiedMatch(media, { ...result, title: `${title} 2` }), false);
    assert.equal(isVerifiedMatch(media, { ...result, source: 'omdb' }), false);
  }
});

test('TV folder context corrects numbered entries but never guesses from a movie folder', async () => {
  const media: MediaMetadata = { ...item, type: 'movie', title: 'Доктор кто 01', folderPath: '/TV/Доктор кто 01', yearSource: 'placeholder' };
  const result = { source: 'tmdb', title: 'Доктор кто', year: 2005, matchMode: 'unique-title' as const };
  assert.equal(isVerifiedMatch(media, result), true);
  assert.equal(mergeFetchedMetadata(media, result).type, 'series');
  assert.equal(isVerifiedMatch({ ...media, folderPath: '/Movies/Доктор кто 01' }, result), false);
  for (const path of ['/Franchises/Доктор кто/Доктор кто 01.mkv', '/Cartoons/Доктор кто/Доктор кто 01.mkv', '/Сериалы/Доктор кто 01.mkv']) {
    const file = { ...media, folderPath: path.slice(0, path.lastIndexOf('/')), path };
    assert.equal(isVerifiedMatch(file, result), true, path);
    assert.equal(mergeFetchedMetadata(file, result).type, 'series', path);
  }
  assert.equal(isVerifiedMatch({ ...media, folderPath: '/Franchises/Other', path: '/Franchises/Other/Доктор кто 01.mkv' }, result), false);
  assert.equal(libraryLookupTitle({ title: 'Studio 60', type: 'series' }), 'Studio 60');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.title, 'Доктор кто');
      assert.equal(request.type, 'series');
      return Response.json({ success: true, ...result });
    };
    assert.ok(await fetchLibraryMetadata(media, new AbortController().signal));
  } finally { globalThis.fetch = originalFetch; }
});

test('generic download containers are excluded and collections match one unique film', async () => {
  for (const title of ['drive-download-20261031T084432Z-1-001', 'New Folder (2)', 'Downloads']) {
    assert.equal(isCategorizerFolderLabel({ ...item, title, folderPath: `/media/${title}` }), true);
  }
  assert.equal(isCategorizerFolderLabel({ ...item, title: 'Downloads', folderPath: '/media/Downloads/Downloads', path: '/media/Downloads/Downloads.mkv' }), false);
  assert.equal(libraryLookupTitle({ title: 'Our Friends in the North      BONE', type: 'series' }), 'Our Friends in the North');
  assert.equal(libraryLookupTitle({ title: 'The Evil Dead Collection 1981-2013 Mkvking', type: 'movie' }), 'The Evil Dead');
  assert.equal(libraryLookupTitle({ title: 'The Evil Dead Trilogy (2013)', type: 'movie' }), 'The Evil Dead');
  assert.equal(libraryLookupTitle({ title: 'The Collection (2012)', type: 'movie' }), 'The Collection');
  assert.equal(libraryLookupTitle({ title: 'The Collection', type: 'movie' }), 'The Collection');
  const originalFetch = globalThis.fetch;
  try {
    const collection: MediaMetadata = { ...item, type: 'movie', title: 'The Evil Dead Collection 1981-2013 Mkvking', year: 1981, yearSource: 'folder' };
    const movie = { source: 'tmdb', title: 'The Evil Dead', year: 1981, matchMode: 'unique-variant' as const };
    let details: MetadataLookupDetails | undefined;
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.title, 'The Evil Dead');
      assert.equal(request.allowUniqueMovie, true);
      assert.equal(request.year, undefined);
      return Response.json({ success: true, ...movie });
    };
    assert.ok(await fetchLibraryMetadata(collection, new AbortController().signal, value => { details = value; }));
    assert.match(details?.reason || '', /collection matched to one film/);
    assert.equal(mergeFetchedMetadata(collection, movie).yearSource, 'provider');
    assert.equal(isVerifiedMatch(collection, { ...movie, title: 'The Evil Dead 2' }), false);
    assert.equal(isVerifiedMatch({ ...collection, title: 'The Evil Dead' }, movie), false);
    assert.equal(trustedMediaYear({ ...collection, title: 'The Evil Dead Trilogy (2013)', year: 2013, yearSource: 'folder' }), undefined);
    assert.equal(trustedMediaYear({ ...collection, yearSource: 'user' }), 1981);
    globalThis.fetch = async () => Response.json({
      success: true, source: 'fallback', diagnostics: [{ provider: 'TMDB', outcome: 'Ambiguous results without a trusted year; review manually' }],
    });
    await assert.rejects(fetchLibraryMetadata(collection, new AbortController().signal), MetadataReviewRequiredError);
    globalThis.fetch = async () => Response.json({
      success: true, source: 'fallback', diagnostics: [{ provider: 'TMDB', outcome: 'No API token configured' }],
    });
    await assert.rejects(fetchLibraryMetadata(collection, new AbortController().signal), /TMDB token is required/);
    globalThis.fetch = async () => Response.json({ success: true, source: 'fallback' });
    assert.equal(await fetchLibraryMetadata({ ...item, title: 'The Collection', type: 'movie' }, new AbortController().signal), null);
    assert.equal(await fetchLibraryMetadata({ ...item, title: 'Greatest Collection', type: 'album' }, new AbortController().signal), null);
  } finally { globalThis.fetch = originalFetch; }
});

test('provider failures without a match are surfaced rather than recorded as no-match', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({
      success: true, source: 'fallback', title: 'Example',
      diagnostics: [{ provider: 'OMDb', outcome: 'HTTP 401: API key rejected; check Settings or OMDB_API_KEY' }, { provider: 'iTunes movies', outcome: 'No result found' }],
    });
    await assert.rejects(fetchLibraryMetadata(item, new AbortController().signal), /providers failed/);
    globalThis.fetch = async () => Response.json({
      success: true, source: 'fallback',
      diagnostics: [{ provider: 'MusicBrainz', outcome: 'Too many results to verify uniquely; review manually' }],
    });
    await assert.rejects(fetchLibraryMetadata(item, new AbortController().signal), MetadataReviewRequiredError);
    globalThis.fetch = async () => Response.json({
      success: true, source: 'fallback',
      diagnostics: [{ provider: 'MusicBrainz', outcome: 'Ambiguous results; review manually' }, { provider: 'OMDb', outcome: 'HTTP 401' }],
    });
    await assert.rejects(fetchLibraryMetadata(item, new AbortController().signal), /providers failed/);
    globalThis.fetch = async () => Response.json({
      success: true, source: 'fallback',
      diagnostics: [{ provider: 'TMDB', outcome: 'Ambiguous results; review manually' }],
    });
    await assert.rejects(fetchLibraryMetadata(item, new AbortController().signal), MetadataReviewRequiredError);
    globalThis.fetch = async () => Response.json({
      success: true, source: 'tvmaze', title: 'Example', year: 2020,
      diagnostics: [{ provider: 'OMDb', outcome: 'HTTP 401' }, { provider: 'TVMaze', outcome: 'Result returned' }],
    });
    assert.ok(await fetchLibraryMetadata(item, new AbortController().signal));
  } finally { globalThis.fetch = originalFetch; }
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

test('requires a unique known artist and verified provider identity for albums', () => {
  const album = { ...item, type: 'album' as const, title: 'Parachutes', artists: ['Coldplay'] };
  const result = { source: 'musicbrainz-audiodb', title: 'Parachutes', artist: 'Coldplay', musicBrainzId: 'id' };
  assert.equal(isVerifiedMatch(album, result), true);
  assert.equal(isVerifiedMatch({ ...album, artists: ['Other'] }, result), false);
  assert.equal(isVerifiedMatch({ ...album, artists: ['Imported Artist'] }, result), false);
  assert.equal(isVerifiedMatch({ ...album, artists: ['Coldplay', 'Other'] }, result), false);
  assert.equal(isVerifiedMatch(album, { ...result, source: 'itunes' }), false);
  assert.equal(mergeFetchedMetadata(album, result).musicBrainzId, 'id');
});

test('sends album artist and accepts verified album metadata without a trusted year', async () => {
  const originalFetch = globalThis.fetch;
  const album = { ...item, type: 'album' as const, title: 'Parachutes', yearSource: 'placeholder' as const, artists: ['Coldplay'] };
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.title, 'Parachutes');
      assert.equal(request.artist, 'Coldplay');
      assert.equal(request.year, undefined);
      return Response.json({
        success: true, source: 'musicbrainz-audiodb', title: 'Parachutes', artist: 'Coldplay',
        musicBrainzId: '1dc4c347-a1db-32aa-b14f-bc9cc507b843', overview: 'Description',
      });
    };
    const result = await fetchLibraryMetadata(album, new AbortController().signal);
    assert.equal(result?.overview, 'Description');
  } finally { globalThis.fetch = originalFetch; }
});

test('records detected and placeholder years without confusing a current-year release', () => {
  const currentYear = new Date().getFullYear();
  assert.equal(parseTitleAndYear(`Example (${currentYear}).mkv`).hasYear, true);
  assert.equal(parseTitleAndYear('Example.mkv').hasYear, false);
  assert.equal(parseTitleAndYear('Example.2024').year, 2024);
  assert.equal(parseTitleAndYear('Example.20261031.mkv').hasYear, false);
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
  const noYearSeries = nodeToMediaMetadata({
    id: 's2', name: 'Our Friends in the North      BONE', path: '/Series/Our Friends in the North      BONE',
    type: 'folder', mediaType: 'series',
  });
  assert.equal(noYearSeries?.yearSource, 'placeholder');
  assert.equal(trustedMediaYear(noYearSeries!), undefined);
});

test('only trusts legacy years supported by the matching original name', () => {
  assert.equal(trustedMediaYear({ ...item, yearSource: undefined, matchedFilename: 'Example (2020).mkv' }), 2020);
  assert.equal(trustedMediaYear({ ...item, yearSource: undefined, folderPath: '/Series/Example (2020)' }), 2020);
  assert.equal(trustedMediaYear({ ...item, yearSource: undefined, matchedFilename: 'Another (2020).mkv' }), undefined);
  assert.equal(trustedMediaYear({ ...item, yearSource: undefined }), undefined);
  assert.equal(trustedMediaYear({ ...item, yearSource: 'placeholder', matchedFilename: 'Example (2020).mkv' }), undefined);
  assert.equal(trustedMediaYear({ ...item, title: 'Our Friends in the North      BONE', year: 2024, yearSource: 'filename', path: '/2024/Series/Our Friends in the North BONE' }), undefined);
  assert.equal(trustedMediaYear({ ...item, title: 'Example', yearSource: 'folder', folderPath: '/Series/Example (2020)' }), 2020);
  assert.equal(trustedMediaYear({ ...item, title: 'Example', yearSource: 'user' }), 2020);
  assert.equal(trustedMediaYear({ ...item, title: 'Example', yearSource: 'provider' }), 2020);
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

test('omits unsupported filename years and saves a unique series provider year', async () => {
  const media: MediaMetadata = {
    ...item, title: 'Our Friends in the North      BONE', year: 2024, yearSource: 'filename',
    matchedFilename: 'Our Friends in the North      BONE', path: '/Series/Our Friends in the North BONE',
  };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.title, 'Our Friends in the North');
      assert.equal(request.year, undefined);
      return Response.json({ success: true, source: 'tmdb', title: 'Our Friends in the North', year: 1996, matchMode: 'unique-title' });
    };
    const result = await fetchLibraryMetadata(media, new AbortController().signal);
    assert.ok(result);
    assert.equal(mergeFetchedMetadata(media, result).year, 1996);
    assert.equal(mergeFetchedMetadata(media, result).yearSource, 'provider');
  } finally { globalThis.fetch = originalFetch; }
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

test('does not use offline cache for metadata lookups and reports connection failures', async () => {
  assert.equal(localDbFallback.handleDbRequestFallback('/api/media/fetch-art', 'POST'), null);
  assert.equal(localDbFallback.handleDbRequestFallback('http://localhost:3000/api/media/fetch-art?x=1', 'POST'), null);
  assert.ok(localDbFallback.handleDbRequestFallback('/api/other', 'GET'));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ success: true, fallback: true, source: 'local_storage_cache' });
    await assert.rejects(fetchLibraryMetadata(item, new AbortController().signal), MetadataBackendUnavailableError);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(fetchLibraryMetadata(item, new AbortController().signal), MetadataBackendUnavailableError);
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = async () => { throw new DOMException('Aborted', 'AbortError'); };
    await assert.rejects(fetchLibraryMetadata(item, controller.signal), { name: 'AbortError' });
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
