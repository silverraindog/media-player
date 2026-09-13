import { MediaMetadata } from '../types';

export const CURATED_MEDIA_DATABASE: MediaMetadata[] = [
  // TV Shows
  {
    id: 'series-breaking-bad',
    type: 'series',
    title: 'Breaking Bad',
    originalTitle: 'Breaking Bad',
    year: 2008,
    premiered: '2008-01-20',
    overview: 'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student in order to secure his family\'s financial future.',
    tagline: 'Change the equation.',
    genres: ['Crime', 'Drama', 'Thriller'],
    rating: 9.5,
    votes: 2150000,
    runtime: '49 min/ep',
    directors: ['Vince Gilligan'],
    studio: 'AMC / Sony Pictures Television',
    certification: 'TV-MA',
    country: 'United States',
    language: 'English',
    imdbId: 'tt0903747',
    tmdbId: '1396',
    posterUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'TV Shows/Breaking Bad (2008)/Season 01/',
    recommendedFilenames: [
      'Breaking Bad - S01E01 - Pilot.mkv',
      'Breaking Bad - S01E02 - Cat\'s in the Bag....mkv',
      'Breaking Bad - S01E03 - ...And the Bag\'s in the River.mkv',
      'tvshow.nfo',
      'poster.jpg',
      'fanart.jpg'
    ],
    seasons: [
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: 7,
        episodes: [
          { episodeNumber: 1, seasonNumber: 1, title: 'Pilot', airDate: '2008-01-20', plot: 'Diagnosed with terminal lung cancer, a chemistry teacher teams up with a former student to cook meth.', rating: 9.0 },
          { episodeNumber: 2, seasonNumber: 1, title: 'Cat\'s in the Bag...', airDate: '2008-01-27', plot: 'Walt and Jesse attempt to dispose of the two bodies in the RV, which becomes increasingly complicated.', rating: 8.7 },
          { episodeNumber: 3, seasonNumber: 1, title: '...And the Bag\'s in the River', airDate: '2008-02-10', plot: 'Walt wrestles with whether or not to kill Krazy-8, while Marie thinks Walter Jr. is smoking pot.', rating: 8.9 },
          { episodeNumber: 4, seasonNumber: 1, title: 'Cancer Man', airDate: '2008-02-17', plot: 'Walt tells the rest of his family about his cancer. Jesse tries to reconcile with his estranged parents.', rating: 8.3 },
          { episodeNumber: 5, seasonNumber: 1, title: 'Gray Matter', airDate: '2008-02-24', plot: 'Walt rejects financial help from former colleagues. Jesse tries to cook meth on his own.', rating: 8.4 },
          { episodeNumber: 6, seasonNumber: 1, title: 'Crazy Handful of Nothin\'', airDate: '2008-03-02', plot: 'The adverse side effects of chemo start to plague Walt as he and Jesse forge a deal with Tuco.', rating: 9.3 },
          { episodeNumber: 7, seasonNumber: 1, title: 'A No-Rough-Stuff-Type Deal', airDate: '2008-03-09', plot: 'Walt and Jesse face business difficulties when Tuco demands large quantities of product quickly.', rating: 8.9 }
        ]
      },
      {
        seasonNumber: 5,
        name: 'Season 5',
        episodeCount: 16,
        episodes: [
          { episodeNumber: 14, seasonNumber: 5, title: 'Ozymandias', airDate: '2013-09-15', plot: 'Walt goes on the run. Jesse is taken hostage. Marie and Skyler face off.', rating: 10.0 }
        ]
      }
    ],
    source: 'curated-database'
  },
  {
    id: 'series-severance',
    type: 'series',
    title: 'Severance',
    originalTitle: 'Severance',
    year: 2022,
    premiered: '2022-02-18',
    overview: 'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. When a mysterious colleague appears outside of work, it begins a journey to discover the truth about their jobs.',
    tagline: 'Please do not adjust your mind.',
    genres: ['Drama', 'Mystery', 'Sci-Fi', 'Thriller'],
    rating: 8.7,
    votes: 240000,
    runtime: '53 min/ep',
    directors: ['Ben Stiller', 'Aoife McArdle'],
    studio: 'Apple TV+ / Red Hour Productions',
    certification: 'TV-MA',
    country: 'United States',
    language: 'English',
    imdbId: 'tt11280740',
    tmdbId: '95396',
    posterUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'TV Shows/Severance (2022)/Season 01/',
    recommendedFilenames: [
      'Severance - S01E01 - Good News About Hell.mkv',
      'Severance - S01E02 - Half Loop.mkv',
      'Severance - S01E09 - The We We Are.mkv',
      'tvshow.nfo',
      'poster.jpg'
    ],
    seasons: [
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: 9,
        episodes: [
          { episodeNumber: 1, seasonNumber: 1, title: 'Good News About Hell', airDate: '2022-02-18', plot: 'Mark Scout leads a team at Lumon Industries, whose employees have undergone a severance procedure.', rating: 8.4 },
          { episodeNumber: 2, seasonNumber: 1, title: 'Half Loop', airDate: '2022-02-18', plot: 'The Macrodata Refinement team trains Helly on data refinement.', rating: 8.3 },
          { episodeNumber: 9, seasonNumber: 1, title: 'The We We Are', airDate: '2022-04-08', plot: 'The team awakens their innies outside of work using the Overtime Contingency protocol.', rating: 9.7 }
        ]
      }
    ],
    source: 'curated-database'
  },
  {
    id: 'series-stranger-things',
    type: 'series',
    title: 'Stranger Things',
    originalTitle: 'Stranger Things',
    year: 2016,
    premiered: '2016-07-15',
    overview: 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
    tagline: 'Every ending has a beginning.',
    genres: ['Drama', 'Fantasy', 'Horror', 'Sci-Fi'],
    rating: 8.7,
    votes: 1350000,
    runtime: '51 min/ep',
    directors: ['The Duffer Brothers'],
    studio: 'Netflix / 21 Laps Entertainment',
    certification: 'TV-14',
    country: 'United States',
    imdbId: 'tt4574334',
    posterUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'TV Shows/Stranger Things (2016)/Season 01/',
    recommendedFilenames: [
      'Stranger Things - S01E01 - Chapter One: The Vanishing of Will Byers.mkv',
      'tvshow.nfo',
      'poster.jpg'
    ],
    seasons: [
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: 8,
        episodes: [
          { episodeNumber: 1, seasonNumber: 1, title: 'Chapter One: The Vanishing of Will Byers', airDate: '2016-07-15', plot: 'A young boy vanishes into thin air near a top-secret government laboratory in 1983 Hawkins, Indiana.', rating: 8.5 }
        ]
      }
    ],
    source: 'curated-database'
  },

  // Movies
  {
    id: 'movie-interstellar',
    type: 'movie',
    title: 'Interstellar',
    originalTitle: 'Interstellar',
    year: 2014,
    premiered: '2014-11-07',
    overview: 'When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft, along with a team of researchers, to find a new planet for humans.',
    tagline: 'Mankind was born on Earth. It was never meant to die here.',
    genres: ['Adventure', 'Drama', 'Sci-Fi'],
    rating: 8.7,
    votes: 2050000,
    runtime: '169 min',
    directors: ['Christopher Nolan'],
    studio: 'Paramount Pictures / Warner Bros. / Syncopy',
    certification: 'PG-13',
    country: 'United States, United Kingdom',
    language: 'English',
    imdbId: 'tt0816692',
    tmdbId: '157336',
    posterUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'Movies/Interstellar (2014)/',
    recommendedFilenames: [
      'Interstellar (2014) [1080p].mp4',
      'Interstellar (2014).nfo',
      'poster.jpg',
      'fanart.jpg'
    ],
    source: 'curated-database'
  },
  {
    id: 'movie-dune-two',
    type: 'movie',
    title: 'Dune: Part Two',
    originalTitle: 'Dune: Part Two',
    year: 2024,
    premiered: '2024-03-01',
    overview: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future only he can foresee.',
    tagline: 'Long live the fighters.',
    genres: ['Action', 'Adventure', 'Drama', 'Sci-Fi'],
    rating: 8.6,
    votes: 560000,
    runtime: '166 min',
    directors: ['Denis Villeneuve'],
    studio: 'Warner Bros. / Legendary Entertainment',
    certification: 'PG-13',
    country: 'United States',
    language: 'English',
    imdbId: 'tt15239678',
    tmdbId: '693134',
    posterUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1542401886-65d6c61db217?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'Movies/Dune - Part Two (2024)/',
    recommendedFilenames: [
      'Dune - Part Two (2024) [2160p HDR].mkv',
      'Dune - Part Two (2024).nfo',
      'poster.jpg',
      'fanart.jpg'
    ],
    source: 'curated-database'
  },
  {
    id: 'movie-oppenheimer',
    type: 'movie',
    title: 'Oppenheimer',
    originalTitle: 'Oppenheimer',
    year: 2023,
    premiered: '2023-07-21',
    overview: 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.',
    tagline: 'The world forever changes.',
    genres: ['Biography', 'Drama', 'History'],
    rating: 8.9,
    votes: 810000,
    runtime: '180 min',
    directors: ['Christopher Nolan'],
    studio: 'Universal Pictures / Syncopy',
    certification: 'R',
    imdbId: 'tt15398776',
    posterUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'Movies/Oppenheimer (2023)/',
    recommendedFilenames: [
      'Oppenheimer (2023) [1080p BluRay].mkv',
      'movie.nfo',
      'poster.jpg',
      'fanart.jpg'
    ],
    source: 'curated-database'
  },

  // Albums
  {
    id: 'album-daft-punk-ram',
    type: 'album',
    title: 'Random Access Memories',
    artists: ['Daft Punk'],
    year: 2013,
    premiered: '2013-05-17',
    overview: 'Random Access Memories is the fourth and final studio album by French electronic music duo Daft Punk. Featuring collaborations with Giorgio Moroder, Nile Rodgers, Julian Casablancas, and Pharrell Williams, it won five Grammy Awards including Album of the Year.',
    tagline: 'Give Life Back to Music',
    genres: ['Electronic', 'Disco', 'Funk', 'Synth-pop'],
    rating: 9.3,
    votes: 95000,
    runtime: '74 min',
    recordLabel: 'Columbia / Daft Life',
    musicBrainzId: 'a12e3e58-f910-4bf6-96a9-d65fa3a5957b',
    posterUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'Music/Daft Punk/Random Access Memories (2013)/',
    recommendedFilenames: [
      '01 - Give Life Back to Music.flac',
      '02 - The Game of Love.flac',
      '03 - Giorgio by Moroder.flac',
      '08 - Get Lucky.flac',
      'album.nfo',
      'folder.jpg',
      'artist.nfo'
    ],
    tracks: [
      { trackNumber: 1, title: 'Give Life Back to Music', duration: '4:35', artist: 'Daft Punk' },
      { trackNumber: 2, title: 'The Game of Love', duration: '5:22', artist: 'Daft Punk' },
      { trackNumber: 3, title: 'Giorgio by Moroder', duration: '9:04', artist: 'Daft Punk feat. Giorgio Moroder' },
      { trackNumber: 4, title: 'Within', duration: '3:48', artist: 'Daft Punk' },
      { trackNumber: 5, title: 'Instant Crush', duration: '5:37', artist: 'Daft Punk feat. Julian Casablancas' },
      { trackNumber: 6, title: 'Lose Yourself to Dance', duration: '5:53', artist: 'Daft Punk feat. Pharrell Williams' },
      { trackNumber: 7, title: 'Touch', duration: '8:18', artist: 'Daft Punk feat. Paul Williams' },
      { trackNumber: 8, title: 'Get Lucky', duration: '6:09', artist: 'Daft Punk feat. Pharrell Williams & Nile Rodgers' },
      { trackNumber: 9, title: 'Beyond', duration: '4:50', artist: 'Daft Punk' },
      { trackNumber: 10, title: 'Motherboard', duration: '5:41', artist: 'Daft Punk' },
      { trackNumber: 11, title: 'Fragments of Time', duration: '4:39', artist: 'Daft Punk feat. Todd Edwards' },
      { trackNumber: 12, title: 'Doin\' It Right', duration: '4:11', artist: 'Daft Punk feat. Panda Bear' },
      { trackNumber: 13, title: 'Contact', duration: '6:21', artist: 'Daft Punk' }
    ],
    source: 'curated-database'
  },
  {
    id: 'album-pink-floyd-dsotm',
    type: 'album',
    title: 'The Dark Side of the Moon',
    artists: ['Pink Floyd'],
    year: 1973,
    premiered: '1973-03-01',
    overview: 'The Dark Side of the Moon is the eighth studio album by English rock band Pink Floyd. A concept album exploring themes such as conflict, greed, time, death, and mental illness.',
    tagline: 'There is no dark side in the moon, really. As a matter of fact it\'s all dark.',
    genres: ['Progressive Rock', 'Psychedelic Rock', 'Art Rock'],
    rating: 9.8,
    votes: 310000,
    runtime: '43 min',
    recordLabel: 'Harvest / EMI',
    musicBrainzId: 'f5093c06-23e3-404f-aeaa-40f720264821',
    posterUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'Music/Pink Floyd/The Dark Side of the Moon (1973)/',
    recommendedFilenames: [
      '01 - Speak to Me.flac',
      '02 - Breathe (In the Air).flac',
      '03 - On the Run.flac',
      '04 - Time.flac',
      '06 - Money.flac',
      'album.nfo',
      'cover.jpg'
    ],
    tracks: [
      { trackNumber: 1, title: 'Speak to Me', duration: '1:13', artist: 'Pink Floyd' },
      { trackNumber: 2, title: 'Breathe (In the Air)', duration: '2:43', artist: 'Pink Floyd' },
      { trackNumber: 3, title: 'On the Run', duration: '3:30', artist: 'Pink Floyd' },
      { trackNumber: 4, title: 'Time', duration: '7:01', artist: 'Pink Floyd' },
      { trackNumber: 5, title: 'The Great Gig in the Sky', duration: '4:44', artist: 'Pink Floyd' },
      { trackNumber: 6, title: 'Money', duration: '6:22', artist: 'Pink Floyd' },
      { trackNumber: 7, title: 'Us and Them', duration: '7:49', artist: 'Pink Floyd' },
      { trackNumber: 8, title: 'Any Colour You Like', duration: '3:26', artist: 'Pink Floyd' },
      { trackNumber: 9, title: 'Brain Damage', duration: '3:46', artist: 'Pink Floyd' },
      { trackNumber: 10, title: 'Eclipse', duration: '2:12', artist: 'Pink Floyd' }
    ],
    source: 'curated-database'
  },
  {
    id: 'album-abbey-road',
    type: 'album',
    title: 'Abbey Road',
    artists: ['The Beatles'],
    year: 1969,
    premiered: '1969-09-26',
    overview: 'Abbey Road is the eleventh studio album by the English rock band the Beatles, and the last album they recorded. It features timeless tracks like Come Together, Something, and Here Comes the Sun.',
    tagline: 'And in the end, the love you take is equal to the love you make.',
    genres: ['Rock', 'Pop Rock', 'Psychedelic Pop'],
    rating: 9.7,
    votes: 280000,
    runtime: '47 min',
    recordLabel: 'Apple Records / EMI',
    posterUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'Music/The Beatles/Abbey Road (1969)/',
    recommendedFilenames: [
      '01 - Come Together.flac',
      '02 - Something.flac',
      '07 - Here Comes the Sun.flac',
      'album.nfo',
      'cover.jpg'
    ],
    tracks: [
      { trackNumber: 1, title: 'Come Together', duration: '4:19', artist: 'The Beatles' },
      { trackNumber: 2, title: 'Something', duration: '3:03', artist: 'The Beatles' },
      { trackNumber: 3, title: 'Maxwell\'s Silver Hammer', duration: '3:27', artist: 'The Beatles' },
      { trackNumber: 4, title: 'Oh! Darling', duration: '3:27', artist: 'The Beatles' },
      { trackNumber: 5, title: 'Octopus\'s Garden', duration: '2:51', artist: 'The Beatles' },
      { trackNumber: 6, title: 'I Want You (She\'s So Heavy)', duration: '7:47', artist: 'The Beatles' },
      { trackNumber: 7, title: 'Here Comes the Sun', duration: '3:05', artist: 'The Beatles' },
      { trackNumber: 8, title: 'Because', duration: '2:45', artist: 'The Beatles' }
    ],
    source: 'curated-database'
  }
];
