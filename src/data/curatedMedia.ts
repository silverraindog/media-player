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
    recommendedFolderStructure: 'series/Breaking Bad (2008)/',
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
    id: 'series-the-walking-dead',
    type: 'series',
    title: 'The Walking Dead',
    originalTitle: 'The Walking Dead',
    year: 2010,
    premiered: '2010-10-31',
    overview: 'Sheriff Deputy Rick Grimes wakes up from a coma to learn the world is in ruins and must lead a group of survivors to stay alive in a zombie apocalypse.',
    tagline: 'Fight the dead. Fear the living.',
    genres: ['Drama', 'Horror', 'Sci-Fi', 'Thriller'],
    rating: 8.2,
    votes: 1080000,
    runtime: '44 min/ep',
    directors: ['Frank Darabont', 'Greg Nicotero'],
    studio: 'AMC Studios',
    certification: 'TV-MA',
    country: 'United States',
    language: 'English',
    imdbId: 'tt1520211',
    tmdbId: '1402',
    posterUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'series/The Walking Dead (2010)/',
    recommendedFilenames: [
      'The Walking Dead - S01E01 - Days Gone Bye.mkv',
      'The Walking Dead - S01E02 - Guts.mkv',
      'The Walking Dead - S01E03 - Tell It to the Frogs.mkv',
      'tvshow.nfo',
      'poster.jpg'
    ],
    seasons: [
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: 6,
        episodes: [
          { episodeNumber: 1, seasonNumber: 1, title: 'Days Gone Bye', airDate: '2010-10-31', plot: 'Deputy Sheriff Rick Grimes awakens from a coma to discover an apocalyptic world overrun by flesh-eating zombies.', rating: 9.2 },
          { episodeNumber: 2, seasonNumber: 1, title: 'Guts', airDate: '2010-11-07', plot: 'In Atlanta, Rick is rescued by a group of survivors, but they soon find themselves trapped inside a department store.', rating: 8.7 },
          { episodeNumber: 3, seasonNumber: 1, title: 'Tell It to the Frogs', airDate: '2010-11-14', plot: 'Rick returns to the survivor camp outside Atlanta and has an emotional reunion with Lori and Carl.', rating: 8.6 }
        ]
      }
    ],
    source: 'curated-database'
  },
  {
    id: 'series-fear-the-walking-dead',
    type: 'series',
    title: 'Fear the Walking Dead',
    originalTitle: 'Fear the Walking Dead',
    year: 2015,
    premiered: '2015-08-23',
    overview: 'A sign of the impending zombie apocalypse surfaces in Los Angeles, disrupting a blended family coping with the rapid collapse of civilization.',
    tagline: 'Fear begins here.',
    genres: ['Drama', 'Horror', 'Sci-Fi'],
    rating: 6.8,
    votes: 140000,
    runtime: '44 min/ep',
    directors: ['Dave Erickson', 'Robert Kirkman'],
    studio: 'AMC Studios',
    certification: 'TV-MA',
    country: 'United States',
    language: 'English',
    imdbId: 'tt3743822',
    tmdbId: '62286',
    posterUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'series/Fear the Walking Dead (2015)/',
    recommendedFilenames: [
      'Fear the Walking Dead - S01E01 - Pilot.mkv',
      'Fear the Walking Dead - S01E02 - So Close, Yet So Far.mkv',
      'tvshow.nfo',
      'poster.jpg'
    ],
    seasons: [
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: 6,
        episodes: [
          { episodeNumber: 1, seasonNumber: 1, title: 'Pilot', airDate: '2015-08-23', plot: 'A highly dysfunctional blended family is forced together when they realize a reported virus is actually the onset of the undead apocalypse.', rating: 7.7 },
          { episodeNumber: 2, seasonNumber: 1, title: 'So Close, Yet So Far', airDate: '2015-08-30', plot: 'While Madison struggles to keep Nick from sabotaging his recovery, Travis ventures out into the city to find his son.', rating: 7.5 }
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
    recommendedFolderStructure: 'series/Severance (2022)/',
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
    id: 'series-24',
    type: 'series',
    title: '24',
    originalTitle: '24',
    year: 2001,
    premiered: '2001-11-06',
    overview: 'Counter Terrorist Unit (CTU) agent Jack Bauer races against time to prevent terrorist attacks, rescue hostages, and protect the United States, with each 24-episode season unfolding in real time over the course of 24 consecutive hours.',
    tagline: 'Events occur in real time.',
    genres: ['Action', 'Crime', 'Drama', 'Thriller'],
    rating: 8.4,
    votes: 205000,
    runtime: '44 min/ep',
    directors: ['Jon Cassar', 'Brad Turner', 'Stephen Hopkins'],
    studio: '20th Century Fox Television / Imagine Television',
    certification: 'TV-14',
    country: 'United States',
    language: 'English',
    imdbId: 'tt0285331',
    tmdbId: '1973',
    posterUrl: 'https://static.tvmaze.com/uploads/images/original_untouched/4/10492.jpg',
    fanartUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'series/24 (2001)/',
    recommendedFilenames: [
      '24 - S01E01 - 12-00 AM - 1-00 AM.mkv',
      '24 - S01E02 - 1-00 AM - 2-00 AM.mkv',
      '24 - S01E03 - 2-00 AM - 3-00 AM.mkv',
      'tvshow.nfo',
      'poster.jpg',
      'fanart.jpg'
    ],
    actors: [
      { name: 'Kiefer Sutherland', role: 'Jack Bauer', thumb: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300' },
      { name: 'Dennis Haysbert', role: 'Senator David Palmer', thumb: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300' },
      { name: 'Elisha Cuthbert', role: 'Kim Bauer', thumb: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300' },
      { name: 'Carlos Bernard', role: 'Tony Almeida', thumb: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300' },
      { name: 'Mary Lynn Rajskub', role: 'Chloe O\'Brian', thumb: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300' }
    ],
    seasons: [
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: 24,
        episodes: [
          { episodeNumber: 1, seasonNumber: 1, title: '12:00 AM - 1:00 AM', airDate: '2001-11-06', plot: 'CTU Director Jack Bauer is called into work in the middle of the night to stop an assassination attempt against presidential candidate David Palmer.', rating: 8.6 },
          { episodeNumber: 2, seasonNumber: 1, title: '1:00 AM - 2:00 AM', airDate: '2001-11-13', plot: 'Jack discovers a keycard left by Walsh pointing to a conspiracy within CTU, while Kimberly and Janet find themselves trapped.', rating: 8.5 },
          { episodeNumber: 3, seasonNumber: 1, title: '2:00 AM - 3:00 AM', airDate: '2001-11-20', plot: 'Jack follows clues to a warehouse while Palmer tries to manage a potential family scandal.', rating: 8.4 },
          { episodeNumber: 24, seasonNumber: 1, title: '11:00 PM - 12:00 AM', airDate: '2002-05-21', plot: 'Jack engages the Drazens in a final dock shootout and rushes back to CTU to discover the tragic truth about Nina Myers.', rating: 9.3 }
        ]
      },
      {
        seasonNumber: 2,
        name: 'Season 2',
        episodeCount: 24,
        episodes: [
          { episodeNumber: 1, seasonNumber: 2, title: '8:00 AM - 9:00 AM', airDate: '2002-10-29', plot: 'President Palmer calls an isolated Jack Bauer back into service when intelligence detects a nuclear bomb threat in Los Angeles.', rating: 8.7 }
        ]
      }
    ],
    source: 'curated-database'
  },
  {
    id: 'series-battlestar-galactica',
    type: 'series',
    title: 'Battlestar Galactica',
    originalTitle: 'Battlestar Galactica',
    year: 2004,
    premiered: '2004-10-18',
    overview: 'When an old enemy, the Cylons, resurface and obliterate the 12 colonies, the crew of the aged battlestar Galactica protect a small civilian fleet - the last of humanity - as they journey toward the fabled 13th colony, Earth.',
    tagline: 'The Cylons were created by man. They evolved. They rebelled. There are many copies. And they have a plan.',
    genres: ['Action', 'Adventure', 'Drama', 'Sci-Fi'],
    rating: 8.7,
    votes: 175000,
    runtime: '44 min/ep',
    directors: ['Michael Rymer', 'Michael Nankin', 'Rod Hardy'],
    studio: 'Sci-Fi Channel / NBCUniversal Television',
    certification: 'TV-14',
    country: 'United States',
    language: 'English',
    imdbId: 'tt0407362',
    tmdbId: '1972',
    posterUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    fanartUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&auto=format&fit=crop&q=80',
    recommendedFolderStructure: 'Franchises/Battlestar Galactica/',
    recommendedFilenames: [
      'Battlestar Galactica - S01E01 - 33.mkv',
      'Battlestar Galactica - S01E02 - Water.mkv',
      'tvshow.nfo',
      'poster.jpg',
      'fanart.jpg'
    ],
    actors: [
      { name: 'Edward James Olmos', role: 'Commander William Adama', thumb: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300' },
      { name: 'Mary McDonnell', role: 'President Laura Roslin', thumb: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300' },
      { name: 'Katee Sackhoff', role: 'Kara \'Starbuck\' Thrace', thumb: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300' },
      { name: 'Jamie Bamber', role: 'Lee \'Apollo\' Adama', thumb: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300' },
      { name: 'James Callis', role: 'Dr. Gaius Baltar', thumb: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300' },
      { name: 'Tricia Helfer', role: 'Number Six', thumb: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300' }
    ],
    seasons: [
      {
        seasonNumber: 0,
        name: 'Specials & Extras',
        episodeCount: 5,
        episodes: [
          { episodeNumber: 1, seasonNumber: 0, title: 'The Miniseries: Part 1', airDate: '2003-12-08', plot: 'The Cylons launch a devastating nuclear sneak attack that annihilates the Twelve Colonies of Kobol.', rating: 8.6 },
          { episodeNumber: 2, seasonNumber: 0, title: 'The Miniseries: Part 2', airDate: '2003-12-09', plot: 'Commander Adama and Secretary of Education Laura Roslin gather the surviving civilian ships.', rating: 8.7 },
          { episodeNumber: 3, seasonNumber: 0, title: 'Razor', airDate: '2007-11-24', plot: 'Chronicles the tragic story of the Battlestar Pegasus under the command of Admiral Helena Cain.', rating: 8.4 },
          { episodeNumber: 4, seasonNumber: 0, title: 'Extras Disc 4: Behind the Scenes & Featurettes', airDate: '2004-10-18', plot: 'Production diaries, visual effects breakdowns, miniature modeling, and director commentaries.', rating: 8.2 },
          { episodeNumber: 5, seasonNumber: 0, title: 'Extras Disc 5: Deleted Scenes & Cast Retrospectives', airDate: '2005-01-24', plot: 'Exclusive deleted scenes, extended cuts, and in-depth cast interviews.', rating: 8.3 }
        ]
      },
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: 13,
        episodes: [
          { episodeNumber: 1, seasonNumber: 1, title: '33', airDate: '2004-10-18', plot: 'Relentlessly pursued by the Cylons every thirty-three minutes, the exhausted fleet struggles to survive.', rating: 9.2 },
          { episodeNumber: 2, seasonNumber: 1, title: 'Water', airDate: '2004-10-25', plot: 'When sabotage destroys the Galactica\'s water tanks, the search for a new source begins.', rating: 8.5 },
          { episodeNumber: 3, seasonNumber: 1, title: 'Bastille Day', airDate: '2004-11-01', plot: 'Prisoners aboard the Astral Queen are offered freedom in exchange for hazardous work collecting ice.', rating: 8.4 },
          { episodeNumber: 4, seasonNumber: 1, title: 'Act of Contrition', airDate: '2004-11-08', plot: 'A freak flight deck explosion kills several pilots, forcing Starbuck to train fresh recruits.', rating: 8.6 },
          { episodeNumber: 12, seasonNumber: 1, title: 'Kobol\'s Last Gleaming: Part 1', airDate: '2005-01-17', plot: 'The discovery of the legendary planet Kobol sparks a constitutional and spiritual crisis.', rating: 9.1 },
          { episodeNumber: 13, seasonNumber: 1, title: 'Kobol\'s Last Gleaming: Part 2', airDate: '2005-01-24', plot: 'Adama launches an assault on a Cylon basestar while Roslin sends Starbuck on a forbidden mission.', rating: 9.4 }
        ]
      },
      {
        seasonNumber: 2,
        name: 'Season 2',
        episodeCount: 20,
        episodes: [
          { episodeNumber: 1, seasonNumber: 2, title: 'Scattered', airDate: '2005-07-15', plot: 'With Adama fighting for his life, Colonel Tigh must take command when the fleet jumps to wrong coordinates.', rating: 8.9 },
          { episodeNumber: 10, seasonNumber: 2, title: 'Pegasus', airDate: '2005-09-23', plot: 'Galactica rejoices at the arrival of Battlestar Pegasus, but Admiral Cain\'s tyrannical rule quickly breeds tension.', rating: 9.5 }
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
    recommendedFolderStructure: 'series/Stranger Things (2016)/',
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
