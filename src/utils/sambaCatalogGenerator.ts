/**
 * High-capacity Samba media catalog generator and realistic path generator.
 * Used for building full multi-thousand file Samba directory trees in offline/preview
 * mode and populating test suites or benchmark scenarios.
 */

export interface GeneratedCatalogOptions {
  includeMovies?: boolean;
  includeSeries?: boolean;
  includeMusic?: boolean;
  includeAudiobooks?: boolean;
  includeBooks?: boolean;
  includeDocumentaries?: boolean;
  includeAnime?: boolean;
  includeFranchises?: boolean;
  seriesCount?: number;
  moviesCount?: number;
  musicAlbumsCount?: number;
}

const POPULAR_SERIES_TEMPLATES = [
  { title: 'Breaking Bad', year: 2008, seasons: 5, epsPerSeason: 13, ext: 'mkv' },
  { title: 'Better Call Saul', year: 2015, seasons: 6, epsPerSeason: 10, ext: 'mkv' },
  { title: 'Severance', year: 2022, seasons: 2, epsPerSeason: 9, ext: 'mkv' },
  { title: 'Stranger Things', year: 2016, seasons: 4, epsPerSeason: 8, ext: 'mkv' },
  { title: 'The Last of Us', year: 2023, seasons: 2, epsPerSeason: 9, ext: 'mkv' },
  { title: 'Game of Thrones', year: 2011, seasons: 8, epsPerSeason: 10, ext: 'mkv' },
  { title: 'House of the Dragon', year: 2022, seasons: 2, epsPerSeason: 10, ext: 'mkv' },
  { title: 'Succession', year: 2018, seasons: 4, epsPerSeason: 10, ext: 'mkv' },
  { title: 'The Bear', year: 2022, seasons: 3, epsPerSeason: 10, ext: 'mkv' },
  { title: 'The Sopranos', year: 1999, seasons: 6, epsPerSeason: 13, ext: 'mkv' },
  { title: 'The Wire', year: 2002, seasons: 5, epsPerSeason: 12, ext: 'mkv' },
  { title: 'Fargo', year: 2014, seasons: 5, epsPerSeason: 10, ext: 'mkv' },
  { title: 'True Detective', year: 2014, seasons: 4, epsPerSeason: 8, ext: 'mkv' },
  { title: 'Chernobyl', year: 2019, seasons: 1, epsPerSeason: 5, ext: 'mkv' },
  { title: 'Band of Brothers', year: 2001, seasons: 1, epsPerSeason: 10, ext: 'mkv' },
  { title: 'Ted Lasso', year: 2020, seasons: 3, epsPerSeason: 12, ext: 'mkv' },
  { title: 'Sherlock', year: 2010, seasons: 4, epsPerSeason: 3, ext: 'mkv' },
  { title: 'Black Mirror', year: 2011, seasons: 6, epsPerSeason: 6, ext: 'mkv' },
  { title: 'The Mandalorian', year: 2019, seasons: 3, epsPerSeason: 8, ext: 'mkv' },
  { title: 'Andor', year: 2022, seasons: 2, epsPerSeason: 12, ext: 'mkv' },
  { title: 'Dark', year: 2017, seasons: 3, epsPerSeason: 8, ext: 'mkv' },
  { title: 'Westworld', year: 2016, seasons: 4, epsPerSeason: 8, ext: 'mkv' },
  { title: 'Mindhunter', year: 2017, seasons: 2, epsPerSeason: 9, ext: 'mkv' },
  { title: 'Peaky Blinders', year: 2013, seasons: 6, epsPerSeason: 6, ext: 'mkv' },
  { title: 'Battlestar Galactica', year: 2004, seasons: 4, epsPerSeason: 20, ext: 'mp4' },
];

const POPULAR_MOVIES_TEMPLATES = [
  { title: 'Interstellar', year: 2014, res: '1080p BluRay x265', ext: 'mkv' },
  { title: 'Dune - Part Two', year: 2024, res: '2160p UHD HDR', ext: 'mkv' },
  { title: 'Dune - Part One', year: 2021, res: '2160p UHD HDR', ext: 'mkv' },
  { title: 'Oppenheimer', year: 2023, res: '2160p IMAX DTS-HD', ext: 'mkv' },
  { title: 'The Dark Knight', year: 2008, res: '1080p Remux', ext: 'mkv' },
  { title: 'Inception', year: 2010, res: '1080p DTS-MA', ext: 'mkv' },
  { title: 'Avatar - The Way of Water', year: 2022, res: '2160p 3D Atmos', ext: 'iso' },
  { title: 'Blade Runner 2049', year: 2017, res: '2160p HDR10', ext: 'mkv' },
  { title: 'The Matrix', year: 1999, res: '2160p Dolby Vision', ext: 'mkv' },
  { title: 'Pulp Fiction', year: 1994, res: '1080p Criterion', ext: 'mp4' },
  { title: 'Fight Club', year: 1999, res: '1080p Special Edition', ext: 'mkv' },
  { title: 'Gladiator', year: 2000, res: '2160p Extended Cut', ext: 'mkv' },
  { title: 'Spider-Man - Across the Spider-Verse', year: 2023, res: '2160p Atmos', ext: 'mkv' },
  { title: 'Top Gun - Maverick', year: 2022, res: '2160p IMAX Enhanced', ext: 'mkv' },
  { title: 'Everything Everywhere All at Once', year: 2022, res: '1080p TrueHD', ext: 'mp4' },
  { title: 'Alien', year: 1979, res: '2160p Director Cut', ext: 'mkv' },
  { title: 'Aliens', year: 1986, res: '1080p Special Edition', ext: 'mkv' },
  { title: 'Parasite', year: 2019, res: '1080p BluRay', ext: 'mkv' },
  { title: 'Whiplash', year: 2014, res: '1080p DTS', ext: 'mkv' },
  { title: 'Mad Max - Fury Road', year: 2015, res: '2160p Black and Chrome', ext: 'mkv' },
  { title: 'Arrival', year: 2016, res: '1080p DTS-HD', ext: 'mkv' },
  { title: 'The Grand Budapest Hotel', year: 2014, res: '1080p Criterion', ext: 'mp4' },
  { title: 'Spirited Away', year: 2001, res: '1080p Studio Ghibli', ext: 'mkv' },
  { title: 'Princess Mononoke', year: 1997, res: '1080p Studio Ghibli', ext: 'mkv' },
  { title: 'The Lord of the Rings - The Fellowship of the Ring', year: 2001, res: '2160p Extended Edition', ext: 'mkv' },
  { title: 'The Lord of the Rings - The Two Towers', year: 2002, res: '2160p Extended Edition', ext: 'mkv' },
  { title: 'The Lord of the Rings - The Return of the King', year: 2003, res: '2160p Extended Edition', ext: 'mkv' },
  { title: '2001 - A Space Odyssey', year: 1968, res: '2160p 70mm Transfer', ext: 'mkv' },
  { title: 'GoodFellas', year: 1990, res: '1080p 25th Anniversary', ext: 'mp4' },
  { title: 'Schindler\'s List', year: 1993, res: '2160p Definitive Edition', ext: 'mkv' },
];

const MUSIC_ALBUM_TEMPLATES = [
  {
    artist: 'Daft Punk',
    album: 'Random Access Memories (2013)',
    tracks: [
      '01 - Give Life Back to Music.flac',
      '02 - The Game of Love.flac',
      '03 - Giorgio by Moroder.flac',
      '04 - Within.flac',
      '05 - Instant Crush.flac',
      '06 - Lose Yourself to Dance.flac',
      '07 - Touch.flac',
      '08 - Get Lucky.flac',
      '09 - Beyond.flac',
      '10 - Motherboard.flac',
      '11 - Fragments of Time.flac',
      '12 - Doin\' It Right.flac',
      '13 - Contact.flac',
    ],
  },
  {
    artist: 'Pink Floyd',
    album: 'The Dark Side of the Moon (1973)',
    tracks: [
      '01 - Speak to Me.flac',
      '02 - Breathe (In the Air).flac',
      '03 - On the Run.flac',
      '04 - Time.flac',
      '05 - The Great Gig in the Sky.flac',
      '06 - Money.flac',
      '07 - Us and Them.flac',
      '08 - Any Colour You Like.flac',
      '09 - Brain Damage.flac',
      '10 - Eclipse.flac',
    ],
  },
  {
    artist: 'Radiohead',
    album: 'OK Computer (1997)',
    tracks: [
      '01 - Airbag.opus',
      '02 - Paranoid Android.opus',
      '03 - Subterranean Homesick Alien.opus',
      '04 - Exit Music (For a Film).opus',
      '05 - Let Down.opus',
      '06 - Karma Police.opus',
      '07 - Electioneering.opus',
      '08 - Climbing Up the Walls.opus',
      '09 - No Surprises.opus',
      '10 - Lucky.opus',
      '11 - The Tourist.opus',
    ],
  },
  {
    artist: 'Miles Davis',
    album: 'Kind of Blue (1959)',
    tracks: [
      '01 - So What.flac',
      '02 - Freddie Freeloader.flac',
      '03 - Blue in Green.flac',
      '04 - All Blues.flac',
      '05 - Flamenco Sketches.flac',
    ],
  },
  {
    artist: 'Hans Zimmer',
    album: 'Interstellar Original Motion Picture Soundtrack (2014)',
    tracks: [
      '01 - Dreaming of the Crash.flac',
      '02 - Cornfield Chase.flac',
      '03 - Dust.flac',
      '04 - Day One.flac',
      '05 - Stay.flac',
      '06 - Message from Home.flac',
      '07 - The Wormhole.flac',
      '08 - Mountains.flac',
      '09 - Afraid of Time.flac',
      '10 - A Place Among the Stars.flac',
      '11 - Running Out.flac',
      '12 - I\'m Going Home.flac',
      '13 - Coward.flac',
      '14 - Detach.flac',
      '15 - S.T.A.Y..flac',
      '16 - Where We\'re Going.flac',
    ],
  },
];

/**
 * Generates an extensive list of 1,000 to 5,000+ realistic Samba file paths
 * across Movies, Multi-season TV Series, Music Albums with multi-tracks, Audiobooks,
 * Books, Documentaries, Anime, and Franchises.
 */
export function generateLargeSambaCatalogPaths(options: GeneratedCatalogOptions = {}): string[] {
  const paths: string[] = [];

  // 1. Movies (with video file, nfo, poster, fanart, subtitles)
  const movies = POPULAR_MOVIES_TEMPLATES;
  for (const m of movies) {
    const dir = `Movies/${m.title} (${m.year})`;
    paths.push(`${dir}/${m.title} (${m.year}) [${m.res}].${m.ext}`);
    paths.push(`${dir}/${m.title} (${m.year}).en.srt`);
    paths.push(`${dir}/movie.nfo`);
    paths.push(`${dir}/poster.jpg`);
    paths.push(`${dir}/fanart.jpg`);
  }

  // 2. TV Series (All seasons and episodes)
  const series = POPULAR_SERIES_TEMPLATES;
  for (const s of series) {
    const seriesDir = `Series/${s.title} (${s.year})`;
    paths.push(`${seriesDir}/tvshow.nfo`);
    paths.push(`${seriesDir}/poster.jpg`);
    paths.push(`${seriesDir}/fanart.jpg`);

    for (let season = 1; season <= s.seasons; season++) {
      const sPad = season.toString().padStart(2, '0');
      const seasonDir = `${seriesDir}/Season ${sPad}`;
      paths.push(`${seasonDir}/season${sPad}-poster.jpg`);

      for (let ep = 1; ep <= s.epsPerSeason; ep++) {
        const epPad = ep.toString().padStart(2, '0');
        const epFile = `${s.title} - S${sPad}E${epPad}.${s.ext}`;
        paths.push(`${seasonDir}/${epFile}`);
        paths.push(`${seasonDir}/${s.title} - S${sPad}E${epPad}.en.srt`);
        paths.push(`${seasonDir}/${s.title} - S${sPad}E${epPad}.nfo`);
      }
    }

    // Add Specials / Extras
    paths.push(`${seriesDir}/Specials/${s.title} - S00E01 - Making of Season 1.${s.ext}`);
    paths.push(`${seriesDir}/Specials/${s.title} - S00E02 - Gag Reel.${s.ext}`);
  }

  // 3. Music (Artist / Album / CD tracks + cover.jpg)
  for (const a of MUSIC_ALBUM_TEMPLATES) {
    const albumDir = `Music/${a.artist}/${a.album}`;
    paths.push(`${albumDir}/album.nfo`);
    paths.push(`${albumDir}/folder.jpg`);
    paths.push(`${albumDir}/cover.jpg`);
    for (const tr of a.tracks) {
      paths.push(`${albumDir}/${tr}`);
    }
  }

  // 4. Franchises
  const franchises = [
    {
      name: 'Star Wars',
      titles: [
        { title: 'Star Wars - Episode IV - A New Hope', year: 1977 },
        { title: 'Star Wars - Episode V - The Empire Strikes Back', year: 1980 },
        { title: 'Star Wars - Episode VI - Return of the Jedi', year: 1983 },
        { title: 'Star Wars - Episode I - The Phantom Menace', year: 1999 },
        { title: 'Star Wars - Episode II - Attack of the Clones', year: 2002 },
        { title: 'Star Wars - Episode III - Revenge of the Sith', year: 2005 },
        { title: 'Rogue One - A Star Wars Story', year: 2016 },
      ],
    },
    {
      name: 'Marvel Cinematic Universe',
      titles: [
        { title: 'Iron Man', year: 2008 },
        { title: 'The Incredible Hulk', year: 2008 },
        { title: 'Iron Man 2', year: 2010 },
        { title: 'Thor', year: 2011 },
        { title: 'Captain America - The First Avenger', year: 2011 },
        { title: 'The Avengers', year: 2012 },
        { title: 'Guardians of the Galaxy', year: 2014 },
        { title: 'Avengers - Infinity War', year: 2018 },
        { title: 'Avengers - Endgame', year: 2019 },
      ],
    },
  ];

  for (const f of franchises) {
    for (const item of f.titles) {
      const itemDir = `Franchises/${f.name}/${item.title} (${item.year})`;
      paths.push(`${itemDir}/${item.title} (${item.year}).mkv`);
      paths.push(`${itemDir}/${item.title} (${item.year}).en.srt`);
      paths.push(`${itemDir}/movie.nfo`);
      paths.push(`${itemDir}/poster.jpg`);
      paths.push(`${itemDir}/fanart.jpg`);
    }
  }

  // 5. Audiobooks
  const audiobooks = [
    { author: 'J.R.R. Tolkien', title: 'The Lord of the Rings - The Fellowship of the Ring', chapters: 22 },
    { author: 'J.R.R. Tolkien', title: 'The Hobbit', chapters: 19 },
    { author: 'James Clear', title: 'Atomic Habits (2018)', chapters: 20 },
    { author: 'Frank Herbert', title: 'Dune (1965)', chapters: 48 },
  ];
  for (const ab of audiobooks) {
    const abDir = `Audio books/${ab.author}/${ab.title}`;
    paths.push(`${abDir}/book.nfo`);
    paths.push(`${abDir}/cover.jpg`);
    for (let c = 1; c <= ab.chapters; c++) {
      const cPad = c.toString().padStart(2, '0');
      paths.push(`${abDir}/Chapter ${cPad}.m4b`);
    }
  }

  // 6. Books / Comics
  paths.push('Books/Sci-Fi/Dune - Frank Herbert (1965).epub');
  paths.push('Books/Sci-Fi/Neuromancer - William Gibson (1984).epub');
  paths.push('Books/Sci-Fi/Snow Crash - Neal Stephenson (1992).epub');
  paths.push('Books/Non-Fiction/Thinking Fast and Slow - Daniel Kahneman.pdf');
  paths.push('Books/Non-Fiction/Sapiens - Yuval Noah Harari.pdf');
  paths.push('Books/Comics/Watchmen (1986).cbz');
  paths.push('Books/Comics/Batman - Year One (1987).cbr');

  // 7. Documentaries & Anime
  const anime = [
    { title: 'Attack on Titan', year: 2013, seasons: 4, eps: 25 },
    { title: 'Death Note', year: 2006, seasons: 1, eps: 37 },
    { title: 'Cowboy Bebop', year: 1998, seasons: 1, eps: 26 },
  ];
  for (const an of anime) {
    const anDir = `Anime/${an.title} (${an.year})`;
    paths.push(`${anDir}/tvshow.nfo`);
    paths.push(`${anDir}/poster.jpg`);
    for (let s = 1; s <= an.seasons; s++) {
      const sPad = s.toString().padStart(2, '0');
      for (let e = 1; e <= an.eps; e++) {
        const ePad = e.toString().padStart(2, '0');
        paths.push(`${anDir}/Season ${sPad}/${an.title} - S${sPad}E${ePad}.mkv`);
        paths.push(`${anDir}/Season ${sPad}/${an.title} - S${sPad}E${ePad}.ass`);
      }
    }
  }

  // 8. Documentaries
  const docs = [
    { title: 'Planet Earth III', year: 2023, eps: 8 },
    { title: 'Blue Planet II', year: 2017, eps: 7 },
    { title: 'Cosmos - A Spacetime Odyssey', year: 2014, eps: 13 },
  ];
  for (const doc of docs) {
    const docDir = `Documentaries/${doc.title} (${doc.year})`;
    paths.push(`${docDir}/tvshow.nfo`);
    paths.push(`${docDir}/poster.jpg`);
    for (let e = 1; e <= doc.eps; e++) {
      const ePad = e.toString().padStart(2, '0');
      paths.push(`${docDir}/Season 01/${doc.title} - S01E${ePad}.2160p.mkv`);
      paths.push(`${docDir}/Season 01/${doc.title} - S01E${ePad}.en.srt`);
    }
  }

  return paths;
}
