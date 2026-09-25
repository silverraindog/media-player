import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

let dbInstance: Database | null = null;

// Determine persistent data directory across app re-installs / zip extractions
function resolveDataDirectory(): string {
  // 1. Explicit override via env variable
  if (process.env.SAMBA_VAULT_DATA_DIR) {
    try {
      if (!fs.existsSync(process.env.SAMBA_VAULT_DATA_DIR)) {
        fs.mkdirSync(process.env.SAMBA_VAULT_DATA_DIR, { recursive: true });
      }
      return process.env.SAMBA_VAULT_DATA_DIR;
    } catch {}
  }

  // 2. Primary: User's permanent home directory (~/.sambavault)
  // This directory survives app package deletion, unzipping in Downloads, and system updates
  try {
    const homeDir = os.homedir();
    if (homeDir) {
      const userVaultDir = path.join(homeDir, '.sambavault');
      if (!fs.existsSync(userVaultDir)) {
        fs.mkdirSync(userVaultDir, { recursive: true });
      }
      return userVaultDir;
    }
  } catch (e) {
    console.warn('[SambaVault Storage] Could not access user home directory, falling back to local folder:', e);
  }

  // 3. Fallback: local project data directory
  const localData = path.join(process.cwd(), 'data');
  if (!fs.existsSync(localData)) {
    try {
      fs.mkdirSync(localData, { recursive: true });
    } catch {}
  }
  return localData;
}

const DATA_DIR = resolveDataDirectory();
const DB_PATH = path.join(DATA_DIR, 'media_vault.sqlite');
const VAULT_STATE_FILE = path.join(DATA_DIR, 'vault_state.json');

// Automatic Migration: If ~/.sambavault is active but empty and ./data/ has previous database or state, copy it over
try {
  const localDataDir = path.join(process.cwd(), 'data');
  if (DATA_DIR !== localDataDir) {
    const localDb = path.join(localDataDir, 'media_vault.sqlite');
    if (fs.existsSync(localDb) && !fs.existsSync(DB_PATH)) {
      fs.copyFileSync(localDb, DB_PATH);
      console.info(`[SambaVault Storage] Successfully migrated SQLite database to permanent location: ${DB_PATH}`);
    }
    const localState = path.join(localDataDir, 'vault_state.json');
    if (fs.existsSync(localState) && !fs.existsSync(VAULT_STATE_FILE)) {
      fs.copyFileSync(localState, VAULT_STATE_FILE);
      console.info(`[SambaVault Storage] Successfully migrated vault state to permanent location: ${VAULT_STATE_FILE}`);
    }
  }
} catch (e) {
  console.warn('[SambaVault Storage] Migration check error:', e);
}

export interface MediaItemDb {
  id: string;
  media_type: 'series' | 'movie' | 'album';
  title: string;
  original_title?: string;
  synopsis: string;
  year?: number;
  rating?: number;
  poster_url?: string;
  fanart_url?: string;
  genres?: string; // JSON array
  cast?: string; // JSON array
  recommended_folder?: string;
  raw_data?: string; // JSON string
  file_size_bytes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface WatchProgressDb {
  id: string;
  series_id: string;
  series_title: string;
  season_number: number;
  episode_number: number;
  episode_title: string;
  playback_position_seconds: number;
  total_duration_seconds: number;
  progress_percentage: number;
  is_completed: number; // 0 or 1
  last_watched_at: string;
  notes?: string;
}

export interface WatchHistoryLogDb {
  id: string;
  series_id?: string;
  title: string;
  season_number?: number;
  episode_number?: number;
  episode_title?: string;
  watched_at: string;
}

let persistTimer: NodeJS.Timeout | null = null;

function persistDbToDisk() {
  if (!dbInstance) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const binaryArray = dbInstance!.export();
      const buffer = Buffer.from(binaryArray);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
      console.error('Error persisting SQLite database to disk:', err);
    }
  }, 250);
}

export async function getDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (e) {
      console.warn('Could not read existing SQLite DB file, creating fresh database...', e);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  // Initialize SQLite Tables
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      original_title TEXT,
      synopsis TEXT NOT NULL,
      year INTEGER,
      rating REAL,
      poster_url TEXT,
      fanart_url TEXT,
      genres TEXT,
      cast TEXT,
      recommended_folder TEXT,
      raw_data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS series_watch_progress (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL,
      series_title TEXT NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      episode_title TEXT NOT NULL,
      playback_position_seconds INTEGER DEFAULT 0,
      total_duration_seconds INTEGER DEFAULT 0,
      progress_percentage REAL DEFAULT 0.0,
      is_completed INTEGER DEFAULT 0,
      last_watched_at TEXT DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS watch_history_log (
      id TEXT PRIMARY KEY,
      media_id TEXT,
      series_id TEXT,
      media_type TEXT DEFAULT 'movie',
      title TEXT NOT NULL,
      season_number INTEGER,
      episode_number INTEGER,
      episode_title TEXT,
      poster_url TEXT,
      duration_seconds INTEGER DEFAULT 0,
      playback_position_seconds INTEGER DEFAULT 0,
      progress_percentage REAL DEFAULT 0.0,
      is_completed INTEGER DEFAULT 0,
      watched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS thumbnail_metadata_cache (
      id TEXT PRIMARY KEY,
      media_path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      media_type TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL,
      fanart_url TEXT,
      width INTEGER DEFAULT 600,
      height INTEGER DEFAULT 900,
      aspect_ratio TEXT DEFAULT 'poster',
      color_dominant TEXT DEFAULT '#1e293b',
      source TEXT DEFAULT 'matched_media',
      file_size_bytes INTEGER DEFAULT 0,
      format TEXT DEFAULT 'jpg',
      resolution_label TEXT DEFAULT '600 × 900 (2:3)',
      cached_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      hit_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS smart_playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      rules_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_watchlist (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      media_type TEXT NOT NULL,
      year INTEGER,
      rating REAL,
      poster_url TEXT,
      genres TEXT,
      synopsis TEXT,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_thumb_media_path ON thumbnail_metadata_cache(media_path);
    CREATE INDEX IF NOT EXISTS idx_watchlist_media_id ON user_watchlist(media_id);
    CREATE INDEX IF NOT EXISTS idx_media_items_title ON media_items(title);
    CREATE INDEX IF NOT EXISTS idx_media_items_type ON media_items(media_type);
    CREATE INDEX IF NOT EXISTS idx_watch_history_watched ON watch_history_log(watched_at);
    CREATE INDEX IF NOT EXISTS idx_watch_progress_series ON series_watch_progress(series_id);
  `);

  // Migration: ensure file_size_bytes exists on media_items
  try {
    dbInstance.run(`ALTER TABLE media_items ADD COLUMN file_size_bytes INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }

  // Migration: ensure cast exists on media_items
  try {
    dbInstance.run(`ALTER TABLE media_items ADD COLUMN cast TEXT`);
  } catch {
    // Column already exists
  }

  // Migration: ensure all watch_history_log columns exist for existing databases
  const historyColumnsToAdd = [
    `ALTER TABLE watch_history_log ADD COLUMN media_id TEXT`,
    `ALTER TABLE watch_history_log ADD COLUMN media_type TEXT DEFAULT 'movie'`,
    `ALTER TABLE watch_history_log ADD COLUMN poster_url TEXT`,
    `ALTER TABLE watch_history_log ADD COLUMN duration_seconds INTEGER DEFAULT 0`,
    `ALTER TABLE watch_history_log ADD COLUMN playback_position_seconds INTEGER DEFAULT 0`,
    `ALTER TABLE watch_history_log ADD COLUMN progress_percentage REAL DEFAULT 0.0`,
    `ALTER TABLE watch_history_log ADD COLUMN is_completed INTEGER DEFAULT 0`,
  ];
  for (const query of historyColumnsToAdd) {
    try {
      dbInstance.run(query);
    } catch {
      // Column already exists
    }
  }

  // Seed default items if empty
  const countResult = dbInstance.exec(`SELECT COUNT(*) as count FROM media_items`);
  const count = countResult.length > 0 && countResult[0].values[0] ? (countResult[0].values[0][0] as number) : 0;

  if (count === 0) {
    seedInitialSqliteData(dbInstance);
  } else {
    // Ensure richer catalog has items populated
    seedExtraCuratedIfMissing(dbInstance);
  }

  persistDbToDisk();
  return dbInstance;
}

function seedInitialSqliteData(db: Database) {
  // Pre-seed series with Title and Synopsis
  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'series-breaking-bad',
      'series',
      'Breaking Bad',
      'Breaking Bad',
      'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student in order to secure his family\'s financial future.',
      2008,
      9.5,
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Crime', 'Drama', 'Thriller']),
      'series/Breaking Bad (2008)/Season 01/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'series-severance',
      'series',
      'Severance',
      'Severance',
      'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. When a mysterious colleague appears outside of work, it begins a journey to discover the truth about their jobs.',
      2022,
      8.7,
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Drama', 'Mystery', 'Sci-Fi', 'Thriller']),
      'series/Severance (2022)/Season 01/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'movie-interstellar',
      'movie',
      'Interstellar',
      'Interstellar',
      'When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft, along with a team of researchers, to find a new planet for humans.',
      2014,
      8.7,
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Adventure', 'Drama', 'Sci-Fi']),
      'Movies/Interstellar (2014)/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 hours'))`,
    [
      'movie-dune-two',
      'movie',
      'Dune - Part Two',
      'Dune: Part Two',
      'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future only he can foresee.',
      2024,
      8.6,
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Action', 'Adventure', 'Sci-Fi', 'Drama']),
      'Movies/Dune - Part Two (2024)/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-8 hours'))`,
    [
      'series-ted-lasso',
      'series',
      'Ted Lasso',
      'Ted Lasso',
      'An American college football coach is hired to manage a British soccer team. What he lacks in knowledge, he makes up for with optimism, determination... and biscuits.',
      2020,
      8.8,
      'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Comedy', 'Drama', 'Sport']),
      'series/Ted Lasso (2020)/Season 01/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-12 hours'))`,
    [
      'movie-dark-knight',
      'movie',
      'The Dark Knight',
      'The Dark Knight',
      'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.',
      2008,
      9.0,
      'https://images.unsplash.com/photo-1509281373149-e957c6296406?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Action', 'Crime', 'Drama', 'Thriller']),
      'Movies/The Dark Knight (2008)/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-18 hours'))`,
    [
      'series-succession',
      'series',
      'Succession',
      'Succession',
      'The Roy family is known for controlling the biggest media and entertainment company in the world. However, their world changes when their aging father steps down from the company.',
      2018,
      8.9,
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Drama']),
      'series/Succession (2018)/Season 01/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'))`,
    [
      'series-edgerunners',
      'series',
      'Cyberpunk: Edgerunners',
      'Cyberpunk: Edgerunners',
      'A street kid trying to survive in a technology and body modification-obsessed city of the future. Having everything to lose, he chooses to stay alive by becoming an edgerunner: a mercenary outlaw also known as a cyberpunk.',
      2022,
      8.3,
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Animation', 'Action', 'Sci-Fi']),
      'Anime/Cyberpunk Edgerunners (2022)/Season 01/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 days'))`,
    [
      'album-daft-punk',
      'album',
      'Random Access Memories',
      'Random Access Memories',
      'The fourth and final studio album by French electronic music duo Daft Punk. Paying tribute to late 1970s and early 1980s American music, featuring live instrumentation with session musicians.',
      2013,
      9.1,
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Electronic', 'Disco', 'Funk']),
      'Music/Daft Punk - Random Access Memories (2013)/'
    ]
  );

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-3 days'))`,
    [
      'series-planet-earth-3',
      'series',
      'Planet Earth III',
      'Planet Earth III',
      'Sir David Attenborough narrates this landmark natural history series celebrating the wonders of our natural world from the deepest oceans to the highest mountains.',
      2023,
      9.2,
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1600&auto=format&fit=crop&q=80',
      JSON.stringify(['Documentary']),
      'Documentaries/Planet Earth III (2023)/Season 01/'
    ]
  );

  // Seed default watchlist items
  db.run(
    `INSERT INTO user_watchlist (id, media_id, title, media_type, year, rating, poster_url, genres, synopsis, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 hour'))`,
    [
      'wl-seed-1',
      'series-severance',
      'Severance',
      'series',
      2022,
      8.7,
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
      JSON.stringify(['Drama', 'Mystery', 'Sci-Fi', 'Thriller']),
      'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.'
    ]
  );

  db.run(
    `INSERT INTO user_watchlist (id, media_id, title, media_type, year, rating, poster_url, genres, synopsis, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 hours'))`,
    [
      'wl-seed-2',
      'movie-interstellar',
      'Interstellar',
      'movie',
      2014,
      8.7,
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
      JSON.stringify(['Adventure', 'Drama', 'Sci-Fi']),
      'When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot is tasked to find a new planet for humans.'
    ]
  );

  // Seed "Where you left off in the series" records
  db.run(
    `INSERT INTO series_watch_progress (id, series_id, series_title, season_number, episode_number, episode_title, playback_position_seconds, total_duration_seconds, progress_percentage, is_completed, last_watched_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 hours'), ?)`,
    [
      'prog-breaking-bad',
      'series-breaking-bad',
      'Breaking Bad',
      1,
      3,
      "...And the Bag's in the River",
      1920, // 32 mins in
      2880, // 48 mins total
      66.7,
      0,
      'Walt dealing with the basement dilemma'
    ]
  );

  db.run(
    `INSERT INTO series_watch_progress (id, series_id, series_title, season_number, episode_number, episode_title, playback_position_seconds, total_duration_seconds, progress_percentage, is_completed, last_watched_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), ?)`,
    [
      'prog-severance',
      'series-severance',
      'Severance',
      1,
      2,
      'Half Loop',
      2450,
      3180,
      77.0,
      0,
      'Helly undergoing Macrodata Refinement orientation'
    ]
  );

  // Seed watch history
  db.run(
    `INSERT INTO watch_history_log (id, media_id, series_id, media_type, title, season_number, episode_number, episode_title, poster_url, duration_seconds, playback_position_seconds, progress_percentage, is_completed, watched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 days'))`,
    [
      'hist-1',
      'series-breaking-bad',
      'series-breaking-bad',
      'series',
      'Breaking Bad',
      1,
      1,
      'Pilot',
      'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&auto=format&fit=crop&q=80',
      3480,
      3480,
      100.0,
      1,
    ]
  );
  db.run(
    `INSERT INTO watch_history_log (id, media_id, series_id, media_type, title, season_number, episode_number, episode_title, poster_url, duration_seconds, playback_position_seconds, progress_percentage, is_completed, watched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'))`,
    [
      'hist-2',
      'series-breaking-bad',
      'series-breaking-bad',
      'series',
      'Breaking Bad',
      1,
      2,
      "Cat's in the Bag...",
      'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&auto=format&fit=crop&q=80',
      2880,
      2880,
      100.0,
      1,
    ]
  );
  db.run(
    `INSERT INTO watch_history_log (id, media_id, series_id, media_type, title, season_number, episode_number, episode_title, poster_url, duration_seconds, playback_position_seconds, progress_percentage, is_completed, watched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-6 hours'))`,
    [
      'hist-3',
      'movie-interstellar',
      null,
      'movie',
      'Interstellar',
      null,
      null,
      null,
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
      10140,
      8920,
      87.9,
      0,
    ]
  );
  db.run(
    `INSERT INTO watch_history_log (id, media_id, series_id, media_type, title, season_number, episode_number, episode_title, poster_url, duration_seconds, playback_position_seconds, progress_percentage, is_completed, watched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 hours'))`,
    [
      'hist-4',
      'series-severance',
      'series-severance',
      'series',
      'Severance',
      1,
      1,
      'Good News About Hell',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
      3300,
      3300,
      100.0,
      1,
    ]
  );
}

function seedExtraCuratedIfMissing(db: Database) {
  const existingRes = db.exec(`SELECT id FROM media_items`);
  const existingIds = new Set<string>();
  if (existingRes.length > 0 && existingRes[0].values) {
    existingRes[0].values.forEach((r) => existingIds.add(String(r[0])));
  }

  const extraItems = [
    {
      id: 'movie-oppenheimer',
      media_type: 'movie',
      title: 'Oppenheimer',
      original_title: 'Oppenheimer',
      synopsis: 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.',
      year: 2023,
      rating: 8.9,
      poster_url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&auto=format&fit=crop&q=80',
      fanart_url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&auto=format&fit=crop&q=80',
      genres: JSON.stringify(['Biography', 'Drama', 'History']),
      recommended_folder: 'Movies/Oppenheimer (2023)/',
      file_size_bytes: 26500000000 // 26.5 GB
    },
    {
      id: 'series-stranger-things',
      media_type: 'series',
      title: 'Stranger Things',
      original_title: 'Stranger Things',
      synopsis: 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
      year: 2016,
      rating: 8.7,
      poster_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
      fanart_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
      genres: JSON.stringify(['Drama', 'Fantasy', 'Horror', 'Sci-Fi']),
      recommended_folder: 'series/Stranger Things (2016)/Season 01/',
      file_size_bytes: 38600000000 // 38.6 GB
    },
    {
      id: 'album-pink-floyd-dsotm',
      media_type: 'album',
      title: 'The Dark Side of the Moon',
      original_title: 'The Dark Side of the Moon',
      synopsis: 'The Dark Side of the Moon is the eighth studio album by English rock band Pink Floyd. A landmark concept album exploring themes such as conflict, greed, time, and death.',
      year: 1973,
      rating: 9.8,
      poster_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
      fanart_url: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1600&auto=format&fit=crop&q=80',
      genres: JSON.stringify(['Progressive Rock', 'Psychedelic Rock', 'Art Rock']),
      recommended_folder: 'Music/Pink Floyd/The Dark Side of the Moon (1973)/',
      file_size_bytes: 1120000000 // 1.12 GB
    },
    {
      id: 'album-abbey-road',
      media_type: 'album',
      title: 'Abbey Road',
      original_title: 'Abbey Road',
      synopsis: 'Abbey Road is the eleventh studio album by the English rock band the Beatles, featuring timeless tracks like Come Together, Something, and Here Comes the Sun.',
      year: 1969,
      rating: 9.7,
      poster_url: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800&auto=format&fit=crop&q=80',
      fanart_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&auto=format&fit=crop&q=80',
      genres: JSON.stringify(['Rock', 'Pop Rock', 'Psychedelic Pop']),
      recommended_folder: 'Music/The Beatles/Abbey Road (1969)/',
      file_size_bytes: 980000000 // 980 MB
    }
  ];

  for (const item of extraItems) {
    if (!existingIds.has(item.id)) {
      try {
        db.run(
          `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, file_size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 days'))`,
          [
            item.id,
            item.media_type,
            item.title,
            item.original_title,
            item.synopsis,
            item.year,
            item.rating,
            item.poster_url,
            item.fanart_url,
            item.genres,
            item.recommended_folder,
            item.file_size_bytes
          ]
        );
      } catch (err) {
        console.error('Error inserting extra curated item:', err);
      }
    }
  }
}

// ==========================================
// SQLITE OPERATIONS
// ==========================================

export async function getAllMediaFromDb(): Promise<MediaItemDb[]> {
  const db = await getDatabase();
  const res = db.exec(`SELECT * FROM media_items ORDER BY updated_at DESC`);
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: any = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item as MediaItemDb;
  });
}

export async function getRecentlyAddedMediaFromDb(limit: number = 10): Promise<MediaItemDb[]> {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  const res = db.exec(`SELECT * FROM media_items ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC LIMIT ${safeLimit}`);
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: any = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item as MediaItemDb;
  });
}

export interface WatchlistItemDb {
  id: string;
  media_id: string;
  title: string;
  media_type: string;
  year?: number;
  rating?: number;
  poster_url?: string;
  genres?: string;
  synopsis?: string;
  added_at: string;
}

export async function getAllWatchlistFromDb(): Promise<WatchlistItemDb[]> {
  const db = await getDatabase();
  const res = db.exec(`SELECT * FROM user_watchlist ORDER BY datetime(added_at) DESC`);
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: any = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item as WatchlistItemDb;
  });
}

export async function toggleWatchlistInDb(item: {
  mediaId: string;
  title: string;
  mediaType: string;
  year?: number;
  rating?: number;
  posterUrl?: string;
  genres?: string[] | string;
  synopsis?: string;
}): Promise<{ inWatchlist: boolean; item?: WatchlistItemDb }> {
  const db = await getDatabase();
  const safeId = (item.mediaId || '').replace(/'/g, "''");
  const existing = db.exec(`SELECT id FROM user_watchlist WHERE media_id = '${safeId}'`);

  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(`DELETE FROM user_watchlist WHERE media_id = ?`, [item.mediaId]);
    persistDbToDisk();
    return { inWatchlist: false };
  } else {
    const id = `wl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const genresStr = Array.isArray(item.genres) ? JSON.stringify(item.genres) : (item.genres || '[]');
    db.run(
      `INSERT INTO user_watchlist (id, media_id, title, media_type, year, rating, poster_url, genres, synopsis, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        id,
        item.mediaId,
        item.title,
        item.mediaType,
        item.year || null,
        item.rating || null,
        item.posterUrl || null,
        genresStr,
        item.synopsis || '',
      ]
    );
    persistDbToDisk();
    return {
      inWatchlist: true,
      item: {
        id,
        media_id: item.mediaId,
        title: item.title,
        media_type: item.mediaType,
        year: item.year,
        rating: item.rating,
        poster_url: item.posterUrl,
        genres: genresStr,
        synopsis: item.synopsis,
        added_at: new Date().toISOString(),
      },
    };
  }
}

export async function removeWatchlistInDb(mediaId: string): Promise<boolean> {
  const db = await getDatabase();
  db.run(`DELETE FROM user_watchlist WHERE media_id = ? OR id = ?`, [mediaId, mediaId]);
  persistDbToDisk();
  return true;
}

export async function saveMediaToDb(media: MediaItemDb): Promise<void> {
  const db = await getDatabase();
  const calculatedSize = media.file_size_bytes && media.file_size_bytes > 0
    ? media.file_size_bytes
    : calculateMediaSizeBytes(media);

  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, cast, recommended_folder, raw_data, file_size_bytes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       media_type = excluded.media_type,
       title = excluded.title,
       original_title = excluded.original_title,
       synopsis = excluded.synopsis,
       year = excluded.year,
       rating = excluded.rating,
       poster_url = excluded.poster_url,
       fanart_url = excluded.fanart_url,
       genres = excluded.genres,
       cast = excluded.cast,
       recommended_folder = excluded.recommended_folder,
       raw_data = excluded.raw_data,
       file_size_bytes = excluded.file_size_bytes,
       updated_at = datetime('now')`,
    [
      media.id,
      media.media_type,
      media.title,
      media.original_title || media.title,
      media.synopsis,
      media.year || null,
      media.rating || null,
      media.poster_url || null,
      media.fanart_url || null,
      media.genres || null,
      media.cast || null,
      media.recommended_folder || null,
      media.raw_data || null,
      calculatedSize
    ]
  );
  persistDbToDisk();
}

export async function batchSaveMediaToDb(items: MediaItemDb[]): Promise<number> {
  if (!items || items.length === 0) return 0;
  const db = await getDatabase();

  try {
    db.run('BEGIN TRANSACTION;');

    for (const media of items) {
      const calculatedSize = media.file_size_bytes && media.file_size_bytes > 0
        ? media.file_size_bytes
        : calculateMediaSizeBytes(media);

      db.run(
        `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, raw_data, file_size_bytes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           media_type = excluded.media_type,
           title = excluded.title,
           original_title = excluded.original_title,
           synopsis = excluded.synopsis,
           year = excluded.year,
           rating = excluded.rating,
           poster_url = excluded.poster_url,
           fanart_url = excluded.fanart_url,
           genres = excluded.genres,
           recommended_folder = excluded.recommended_folder,
           raw_data = excluded.raw_data,
           file_size_bytes = excluded.file_size_bytes,
           updated_at = datetime('now')`,
        [
          media.id,
          media.media_type,
          media.title,
          media.original_title || media.title,
          media.synopsis,
          media.year || null,
          media.rating || null,
          media.poster_url || null,
          media.fanart_url || null,
          media.genres || null,
          media.recommended_folder || null,
          media.raw_data || null,
          calculatedSize
        ]
      );
    }

    db.run('COMMIT;');
    persistDbToDisk();
    return items.length;
  } catch (err) {
    try {
      db.run('ROLLBACK;');
    } catch {}
    console.error('Failed to batch save media to SQLite:', err);
    throw err;
  }
}

export async function deleteMediaFromDb(id: string): Promise<void> {
  const db = await getDatabase();
  db.run(`DELETE FROM media_items WHERE id = ?`, [id]);
  db.run(`DELETE FROM series_watch_progress WHERE series_id = ?`, [id]);
  persistDbToDisk();
}

export async function renameVaultMediaFile(
  oldPath: string,
  newPath: string,
  newFileName: string,
  mediaId?: string
): Promise<{ success: boolean; updatedCount: number; newTitle: string }> {
  const db = await getDatabase();
  let updatedCount = 0;

  // Clean title without file extension
  const cleanTitle = newFileName
    .replace(/\.[^/.]+$/, '')
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/[._]/g, ' ')
    .trim() || newFileName;

  const oldBaseName = path.basename(oldPath);
  const oldBaseNoExt = oldBaseName.replace(/\.[^/.]+$/, '').trim();

  // 1. Update matching media_items by mediaId if specified
  if (mediaId) {
    try {
      db.run(
        `UPDATE media_items 
         SET title = COALESCE(NULLIF(?, ''), title),
             recommended_folder = REPLACE(COALESCE(recommended_folder, ''), ?, ?),
             updated_at = datetime('now')
         WHERE id = ?`,
        [cleanTitle, oldPath, newPath, mediaId]
      );
      updatedCount++;
    } catch (e) {
      console.warn('Error updating media item by ID during rename:', e);
    }
  }

  // 2. Update media_items where recommended_folder contains oldPath or oldBaseName
  try {
    db.run(
      `UPDATE media_items 
       SET recommended_folder = REPLACE(recommended_folder, ?, ?),
           updated_at = datetime('now')
       WHERE recommended_folder LIKE ? OR recommended_folder LIKE ?`,
      [oldPath, newPath, `%${oldPath}%`, `%${oldBaseName}%`]
    );
  } catch (e) {
    console.warn('Error updating recommended_folder in media_items:', e);
  }

  // 3. Update thumbnail_metadata_cache for oldPath
  try {
    db.run(
      `UPDATE thumbnail_metadata_cache 
       SET media_path = ?, title = COALESCE(NULLIF(?, ''), title), last_accessed_at = ?
       WHERE media_path = ? OR media_path = ?`,
      [newPath, cleanTitle, Date.now(), oldPath, oldBaseName]
    );
  } catch (e) {
    console.warn('Error updating thumbnail cache during rename:', e);
  }

  // 4. Update user_watchlist if title matches
  if (mediaId) {
    try {
      db.run(
        `UPDATE user_watchlist SET title = COALESCE(NULLIF(?, ''), title) WHERE media_id = ?`,
        [cleanTitle, mediaId]
      );
    } catch (e) {
      console.warn('Error updating user_watchlist during rename:', e);
    }
  }

  // 5. Update watch_history_log if matching old title or mediaId
  try {
    if (mediaId) {
      db.run(
        `UPDATE watch_history_log SET title = COALESCE(NULLIF(?, ''), title) WHERE media_id = ? OR series_id = ?`,
        [cleanTitle, mediaId, mediaId]
      );
    } else if (oldBaseNoExt) {
      db.run(
        `UPDATE watch_history_log SET title = COALESCE(NULLIF(?, ''), title) WHERE title LIKE ?`,
        [cleanTitle, `%${oldBaseNoExt}%`]
      );
    }
  } catch (e) {
    console.warn('Error updating watch_history_log during rename:', e);
  }

  persistDbToDisk();
  return { success: true, updatedCount, newTitle: cleanTitle };
}

export async function getAllWatchProgress(): Promise<WatchProgressDb[]> {
  const db = await getDatabase();
  const res = db.exec(`
    SELECT p.*, m.poster_url, m.rating, m.synopsis 
    FROM series_watch_progress p
    LEFT JOIN media_items m ON p.series_id = m.id
    ORDER BY p.last_watched_at DESC
  `);
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: any = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item as WatchProgressDb;
  });
}

export async function getSeriesProgress(seriesId: string): Promise<WatchProgressDb | null> {
  const db = await getDatabase();
  const res = db.exec(
    `SELECT * FROM series_watch_progress WHERE series_id = ? OR id = ? ORDER BY last_watched_at DESC LIMIT 1`,
    [seriesId, `prog-${seriesId}`]
  );
  if (res.length === 0 || res[0].values.length === 0) return null;
  const columns = res[0].columns;
  const row = res[0].values[0];
  const item: any = {};
  columns.forEach((col, idx) => {
    item[col] = row[idx];
  });
  return item as WatchProgressDb;
}

export async function getAllProgressForSeries(seriesId: string): Promise<WatchProgressDb[]> {
  const db = await getDatabase();
  const res = db.exec(
    `SELECT * FROM series_watch_progress WHERE series_id = ? OR id LIKE ? ORDER BY season_number ASC, episode_number ASC`,
    [seriesId, `prog-${seriesId}%`]
  );
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: any = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item as WatchProgressDb;
  });
}

export async function updateWatchProgressInDb(progress: {
  series_id: string;
  series_title: string;
  season_number: number;
  episode_number: number;
  episode_title: string;
  playback_position_seconds?: number;
  total_duration_seconds?: number;
  progress_percentage?: number;
  is_completed?: boolean;
  notes?: string;
}): Promise<void> {
  const db = await getDatabase();
  const episodeId = `prog-${progress.series_id}-s${progress.season_number}-e${progress.episode_number}`;
  const seriesSummaryId = `prog-${progress.series_id}`;
  const pos = progress.playback_position_seconds !== undefined ? progress.playback_position_seconds : 0;
  const total = progress.total_duration_seconds && progress.total_duration_seconds > 0 ? progress.total_duration_seconds : 2880;
  const percent = progress.progress_percentage !== undefined ? progress.progress_percentage : (total > 0 ? (pos / total) * 100 : 0);
  const completed = progress.is_completed ? 1 : (percent >= 90 ? 1 : 0);

  const stmt = `INSERT INTO series_watch_progress (id, series_id, series_title, season_number, episode_number, episode_title, playback_position_seconds, total_duration_seconds, progress_percentage, is_completed, last_watched_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(id) DO UPDATE SET
       series_title = excluded.series_title,
       season_number = excluded.season_number,
       episode_number = excluded.episode_number,
       episode_title = excluded.episode_title,
       playback_position_seconds = excluded.playback_position_seconds,
       total_duration_seconds = excluded.total_duration_seconds,
       progress_percentage = excluded.progress_percentage,
       is_completed = excluded.is_completed,
       last_watched_at = datetime('now'),
       notes = excluded.notes`;

  // Upsert episode-specific record
  db.run(stmt, [
    episodeId,
    progress.series_id,
    progress.series_title,
    progress.season_number,
    progress.episode_number,
    progress.episode_title,
    pos,
    total,
    percent,
    completed,
    progress.notes || null,
  ]);

  // Upsert overall series summary record (left off pointer)
  db.run(stmt, [
    seriesSummaryId,
    progress.series_id,
    progress.series_title,
    progress.season_number,
    progress.episode_number,
    progress.episode_title,
    pos,
    total,
    percent,
    completed,
    progress.notes || null,
  ]);

  // If marked completed, add to watch history log
  if (completed) {
    recordWatchHistoryInDb({
      series_id: progress.series_id,
      media_type: 'series',
      title: progress.series_title,
      season_number: progress.season_number,
      episode_number: progress.episode_number,
      episode_title: progress.episode_title,
      playback_position_seconds: pos,
      duration_seconds: total,
      progress_percentage: percent,
      is_completed: 1,
    }).catch((e) => console.warn('Failed recording completed history:', e));
  }

  persistDbToDisk();
}

// ==========================================
// WATCH HISTORY LOG OPERATIONS
// ==========================================

export interface WatchHistoryDbRecord {
  id: string;
  media_id?: string;
  series_id?: string;
  media_type: 'movie' | 'series' | 'album';
  title: string;
  season_number?: number;
  episode_number?: number;
  episode_title?: string;
  poster_url?: string;
  duration_seconds?: number;
  playback_position_seconds?: number;
  progress_percentage?: number;
  is_completed?: number;
  watched_at: string;
}

export async function getWatchHistoryFromDb(options?: {
  limit?: number;
  mediaType?: string;
  search?: string;
}): Promise<WatchHistoryDbRecord[]> {
  const db = await getDatabase();
  const limit = options?.limit || 100;
  let query = `SELECT * FROM watch_history_log`;
  const conditions: string[] = [];
  const params: any[] = [];

  if (options?.mediaType && options.mediaType !== 'all') {
    conditions.push(`media_type = ?`);
    params.push(options.mediaType);
  }

  if (options?.search && options.search.trim().length > 0) {
    conditions.push(`(title LIKE ? OR episode_title LIKE ?)`);
    const term = `%${options.search.trim()}%`;
    params.push(term, term);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  query += ` ORDER BY watched_at DESC LIMIT ?`;
  params.push(limit);

  const res = db.exec(query, params);
  if (res.length === 0) return [];

  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: any = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item as WatchHistoryDbRecord;
  });
}

export async function recordWatchHistoryInDb(item: {
  id?: string;
  media_id?: string;
  series_id?: string;
  media_type?: 'movie' | 'series' | 'album';
  title: string;
  season_number?: number;
  episode_number?: number;
  episode_title?: string;
  poster_url?: string;
  duration_seconds?: number;
  playback_position_seconds?: number;
  progress_percentage?: number;
  is_completed?: number | boolean;
}): Promise<WatchHistoryDbRecord> {
  const db = await getDatabase();
  const historyId = item.id || `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const mediaType = item.media_type || (item.series_id || item.season_number ? 'series' : 'movie');
  const pos = Math.max(0, Math.floor(item.playback_position_seconds || 0));
  const dur = Math.max(0, Math.floor(item.duration_seconds || 0));
  const pct =
    item.progress_percentage !== undefined
      ? Number(item.progress_percentage)
      : dur > 0
      ? Number(((pos / dur) * 100).toFixed(1))
      : 0;
  const completed = item.is_completed ? 1 : pct >= 90 ? 1 : 0;

  // If a recent entry for this exact movie/episode exists in the last 60 minutes, update it rather than creating a duplicate
  const checkSql = item.series_id && item.season_number && item.episode_number
    ? `SELECT id FROM watch_history_log WHERE series_id = ? AND season_number = ? AND episode_number = ? ORDER BY watched_at DESC LIMIT 1`
    : item.media_id
    ? `SELECT id FROM watch_history_log WHERE media_id = ? ORDER BY watched_at DESC LIMIT 1`
    : `SELECT id FROM watch_history_log WHERE title = ? ORDER BY watched_at DESC LIMIT 1`;
  
  const checkParams = item.series_id && item.season_number && item.episode_number
    ? [item.series_id, item.season_number, item.episode_number]
    : item.media_id
    ? [item.media_id]
    : [item.title];

  const checkRes = db.exec(checkSql, checkParams);
  const existingId = checkRes.length > 0 && checkRes[0].values.length > 0 ? (checkRes[0].values[0][0] as string) : null;

  if (existingId) {
    db.run(
      `UPDATE watch_history_log 
       SET playback_position_seconds = ?, 
           duration_seconds = ?, 
           progress_percentage = ?, 
           is_completed = ?, 
           poster_url = COALESCE(?, poster_url),
           watched_at = datetime('now')
       WHERE id = ?`,
      [pos, dur, pct, completed, item.poster_url || null, existingId]
    );
  } else {
    db.run(
      `INSERT INTO watch_history_log (
        id, media_id, series_id, media_type, title, season_number, episode_number, 
        episode_title, poster_url, duration_seconds, playback_position_seconds, 
        progress_percentage, is_completed, watched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        historyId,
        item.media_id || null,
        item.series_id || null,
        mediaType,
        item.title,
        item.season_number || null,
        item.episode_number || null,
        item.episode_title || null,
        item.poster_url || null,
        dur,
        pos,
        pct,
        completed,
      ]
    );
  }

  persistDbToDisk();

  return {
    id: existingId || historyId,
    media_id: item.media_id,
    series_id: item.series_id,
    media_type: mediaType,
    title: item.title,
    season_number: item.season_number,
    episode_number: item.episode_number,
    episode_title: item.episode_title,
    poster_url: item.poster_url,
    duration_seconds: dur,
    playback_position_seconds: pos,
    progress_percentage: pct,
    is_completed: completed,
    watched_at: new Date().toISOString(),
  };
}

export async function deleteWatchHistoryItemFromDb(id: string): Promise<boolean> {
  const db = await getDatabase();
  db.run(`DELETE FROM watch_history_log WHERE id = ?`, [id]);
  persistDbToDisk();
  return true;
}

export async function clearWatchHistoryFromDb(): Promise<void> {
  const db = await getDatabase();
  db.run(`DELETE FROM watch_history_log`);
  persistDbToDisk();
}

export async function getWatchHistoryStats(): Promise<{
  totalWatched: number;
  moviesWatched: number;
  seriesEpisodesWatched: number;
  albumsPlayed: number;
  completedCount: number;
  totalSecondsWatched: number;
  totalHoursWatched: number;
}> {
  const db = await getDatabase();
  const res = db.exec(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN media_type = 'movie' THEN 1 ELSE 0 END) as movies,
      SUM(CASE WHEN media_type = 'series' THEN 1 ELSE 0 END) as series,
      SUM(CASE WHEN media_type = 'album' THEN 1 ELSE 0 END) as albums,
      SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed,
      COALESCE(SUM(playback_position_seconds), 0) as total_seconds
    FROM watch_history_log
  `);

  if (res.length === 0 || res[0].values.length === 0) {
    return {
      totalWatched: 0,
      moviesWatched: 0,
      seriesEpisodesWatched: 0,
      albumsPlayed: 0,
      completedCount: 0,
      totalSecondsWatched: 0,
      totalHoursWatched: 0,
    };
  }

  const row = res[0].values[0];
  const total = Number(row[0] || 0);
  const movies = Number(row[1] || 0);
  const series = Number(row[2] || 0);
  const albums = Number(row[3] || 0);
  const completed = Number(row[4] || 0);
  const totalSecs = Number(row[5] || 0);

  return {
    totalWatched: total,
    moviesWatched: movies,
    seriesEpisodesWatched: series,
    albumsPlayed: albums,
    completedCount: completed,
    totalSecondsWatched: totalSecs,
    totalHoursWatched: Number((totalSecs / 3600).toFixed(1)),
  };
}

export async function executeRawSqlQuery(sql: string): Promise<{ columns: string[]; values: any[][] }> {
  const db = await getDatabase();
  const res = db.exec(sql);
  persistDbToDisk();
  if (res.length === 0) {
    return { columns: [], values: [] };
  }
  return {
    columns: res[0].columns,
    values: res[0].values
  };
}

export async function getDbStats(): Promise<{
  dbFilePath: string;
  fileSizeBytes: number;
  totalMediaItems: number;
  totalSeriesTracked: number;
  totalWatchedHistory: number;
}> {
  const db = await getDatabase();
  let fileSize = 0;
  if (fs.existsSync(DB_PATH)) {
    const stats = fs.statSync(DB_PATH);
    fileSize = stats.size;
  }

  const mediaCountRes = db.exec(`SELECT COUNT(*) FROM media_items`);
  const seriesTrackedRes = db.exec(`SELECT COUNT(*) FROM series_watch_progress`);
  const historyCountRes = db.exec(`SELECT COUNT(*) FROM watch_history_log`);

  const mediaCount = mediaCountRes.length > 0 && mediaCountRes[0].values[0] ? (mediaCountRes[0].values[0][0] as number) : 0;
  const seriesTracked = seriesTrackedRes.length > 0 && seriesTrackedRes[0].values[0] ? (seriesTrackedRes[0].values[0][0] as number) : 0;
  const historyCount = historyCountRes.length > 0 && historyCountRes[0].values[0] ? (historyCountRes[0].values[0][0] as number) : 0;

  return {
    dbFilePath: DB_PATH,
    fileSizeBytes: fileSize,
    totalMediaItems: mediaCount,
    totalSeriesTracked: seriesTracked,
    totalWatchedHistory: historyCount
  };
}

export function calculateMediaSizeBytes(m: {
  media_type: string;
  title: string;
  raw_data?: string;
  file_size_bytes?: number;
}): number {
  if (m.file_size_bytes && m.file_size_bytes > 0) return m.file_size_bytes;

  if (m.raw_data) {
    try {
      const raw = JSON.parse(m.raw_data);
      if (raw.fileSizeBytes && typeof raw.fileSizeBytes === 'number') return raw.fileSizeBytes;
      if (raw.seasons && Array.isArray(raw.seasons)) {
        let epCount = 0;
        raw.seasons.forEach((s: any) => {
          epCount += (s.episodes?.length || s.episodeCount || 8);
        });
        return Math.max(1, epCount) * 2900000000; // ~2.9 GB per episode
      }
    } catch {}
  }

  const titleLower = (m.title || '').toLowerCase();
  if (m.media_type === 'album') {
    if (titleLower.includes('random access')) return 1450000000; // 1.45 GB
    if (titleLower.includes('dark side')) return 1120000000; // 1.12 GB
    if (titleLower.includes('abbey road')) return 980000000; // 0.98 GB
    return 880000000; // 880 MB
  }

  if (m.media_type === 'series') {
    if (titleLower.includes('breaking bad')) return 44500000000; // 44.5 GB
    if (titleLower.includes('severance')) return 12800000000; // 12.8 GB
    if (titleLower.includes('stranger things')) return 38600000000; // 38.6 GB
    if (titleLower.includes('ted lasso')) return 24200000000; // 24.2 GB
    if (titleLower.includes('succession')) return 36400000000; // 36.4 GB
    if (titleLower.includes('planet earth')) return 32000000000; // 32.0 GB (4K HDR)
    if (titleLower.includes('cyberpunk') || titleLower.includes('edgerunners')) return 8500000000; // 8.5 GB
    return 26000000000; // 26.0 GB
  }

  // Movie
  if (titleLower.includes('interstellar')) return 22400000000; // 22.4 GB
  if (titleLower.includes('dune')) return 24800000000; // 24.8 GB
  if (titleLower.includes('dark knight')) return 21200000000; // 21.2 GB
  if (titleLower.includes('oppenheimer')) return 26500000000; // 26.5 GB
  if (titleLower.includes('spirited away')) return 8400000000; // 8.4 GB
  return 14500000000; // 14.5 GB
}

export async function getMediaDistributionStatsFromDb() {
  const allMedia = await getAllMediaFromDb();

  let totalSizeBytes = 0;
  let movieCount = 0;
  let movieSizeBytes = 0;
  let seriesCount = 0;
  let seriesSizeBytes = 0;
  let albumCount = 0;
  let albumSizeBytes = 0;
  let totalRatingSum = 0;
  let ratedCount = 0;

  // Metadata Health Metrics
  let fullyEnrichedCount = 0; // synopsis + poster + fanart
  let partiallyEnrichedCount = 0; // missing one or two but has something
  let poorMetadataCount = 0; // missing critical fields (synopsis or poster)

  const genreMap = new Map<string, {
    genre: string;
    totalCount: number;
    movieCount: number;
    seriesCount: number;
    albumCount: number;
    totalBytes: number;
    ratingSum: number;
    ratingCount: number;
  }>();

  const decadeMap = new Map<string, {
    decade: string;
    count: number;
    movieCount: number;
    seriesCount: number;
    albumCount: number;
    totalBytes: number;
  }>();

  const largestItemsList: {
    id: string;
    title: string;
    mediaType: 'movie' | 'series' | 'album';
    year?: number;
    rating?: number;
    totalGB: number;
    genres: string[];
    posterUrl?: string;
    folderPath?: string;
  }[] = [];

  for (const item of allMedia) {
    const sizeBytes = calculateMediaSizeBytes(item);
    totalSizeBytes += sizeBytes;

    if (item.rating) {
      totalRatingSum += item.rating;
      ratedCount++;
    }

    // Calculate Health
    const hasSynopsis = item.synopsis && item.synopsis.length > 50;
    const hasPoster = item.poster_url && !item.poster_url.includes('unsplash.com');
    const hasFanart = item.fanart_url && !item.fanart_url.includes('unsplash.com');

    if (hasSynopsis && hasPoster && hasFanart) {
      fullyEnrichedCount++;
    } else if (hasSynopsis && hasPoster) {
      partiallyEnrichedCount++;
    } else {
      poorMetadataCount++;
    }

    if (item.media_type === 'movie') {
      movieCount++;
      movieSizeBytes += sizeBytes;
    } else if (item.media_type === 'series') {
      seriesCount++;
      seriesSizeBytes += sizeBytes;
    } else if (item.media_type === 'album') {
      albumCount++;
      albumSizeBytes += sizeBytes;
    }

    // Parse genres
    let genres: string[] = [];
    if (item.genres) {
      try {
        genres = JSON.parse(item.genres);
      } catch {
        genres = item.genres.split(',').map((g) => g.trim());
      }
    }
    if (!Array.isArray(genres) || genres.length === 0) {
      genres = [item.media_type === 'series' ? 'TV Show' : item.media_type === 'movie' ? 'Cinema' : 'Music'];
    }

    genres.forEach((g) => {
      const cleanG = g.trim();
      if (!cleanG) return;
      const existing = genreMap.get(cleanG) || {
        genre: cleanG,
        totalCount: 0,
        movieCount: 0,
        seriesCount: 0,
        albumCount: 0,
        totalBytes: 0,
        ratingSum: 0,
        ratingCount: 0,
      };
      existing.totalCount++;
      if (item.media_type === 'movie') existing.movieCount++;
      else if (item.media_type === 'series') existing.seriesCount++;
      else if (item.media_type === 'album') existing.albumCount++;

      existing.totalBytes += sizeBytes;
      if (item.rating) {
        existing.ratingSum += item.rating;
        existing.ratingCount++;
      }
      genreMap.set(cleanG, existing);
    });

    // Decade grouping
    const yr = item.year || 2024;
    let decadeLabel = '2020s';
    if (yr < 1980) decadeLabel = '1960s-1970s';
    else if (yr < 1990) decadeLabel = '1980s';
    else if (yr < 2000) decadeLabel = '1990s';
    else if (yr < 2010) decadeLabel = '2000s';
    else if (yr < 2020) decadeLabel = '2010s';
    else decadeLabel = '2020s';

    const dec = decadeMap.get(decadeLabel) || {
      decade: decadeLabel,
      count: 0,
      movieCount: 0,
      seriesCount: 0,
      albumCount: 0,
      totalBytes: 0,
    };
    dec.count++;
    if (item.media_type === 'movie') dec.movieCount++;
    else if (item.media_type === 'series') dec.seriesCount++;
    else if (item.media_type === 'album') dec.albumCount++;
    dec.totalBytes += sizeBytes;
    decadeMap.set(decadeLabel, dec);

    const sizeGB = Number((sizeBytes / (1024 * 1024 * 1024)).toFixed(2));
    largestItemsList.push({
      id: item.id,
      title: item.title,
      mediaType: item.media_type as 'movie' | 'series' | 'album',
      year: item.year,
      rating: item.rating,
      totalGB: sizeGB,
      genres,
      posterUrl: item.poster_url,
      folderPath: item.recommended_folder,
    });
  }

  // Sort largest items descending
  largestItemsList.sort((a, b) => b.totalGB - a.totalGB);

  const totalGB = Number((totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2));
  const movieSizeGB = Number((movieSizeBytes / (1024 * 1024 * 1024)).toFixed(2));
  const seriesSizeGB = Number((seriesSizeBytes / (1024 * 1024 * 1024)).toFixed(2));
  const albumSizeGB = Number((albumSizeBytes / (1024 * 1024 * 1024)).toFixed(2));

  // Convert genreMap to array, sorted by totalGB desc
  const genreDistribution = Array.from(genreMap.values())
    .map((g) => {
      const gGB = Number((g.totalBytes / (1024 * 1024 * 1024)).toFixed(2));
      const percent = totalSizeBytes > 0 ? Number(((g.totalBytes / totalSizeBytes) * 100).toFixed(1)) : 0;
      const avgR = g.ratingCount > 0 ? Number((g.ratingSum / g.ratingCount).toFixed(1)) : 0;
      return {
        genre: g.genre,
        totalCount: g.totalCount,
        movieCount: g.movieCount,
        seriesCount: g.seriesCount,
        albumCount: g.albumCount,
        totalBytes: g.totalBytes,
        totalGB: gGB,
        avgRating: avgR,
        percentOfStorage: percent,
      };
    })
    .sort((a, b) => b.totalGB - a.totalGB);

  const totalCount = allMedia.length;

  const mediaTypeDistribution = [
    {
      name: 'Movies',
      typeKey: 'movie' as const,
      count: movieCount,
      totalGB: movieSizeGB,
      percent: totalCount > 0 ? Number(((movieCount / totalCount) * 100).toFixed(1)) : 0,
      color: '#6366f1',
    },
    {
      name: 'TV Series',
      typeKey: 'series' as const,
      count: seriesCount,
      totalGB: seriesSizeGB,
      percent: totalCount > 0 ? Number(((seriesCount / totalCount) * 100).toFixed(1)) : 0,
      color: '#a855f7',
    },
    {
      name: 'Music Albums',
      typeKey: 'album' as const,
      count: albumCount,
      totalGB: albumSizeGB,
      percent: totalCount > 0 ? Number(((albumCount / totalCount) * 100).toFixed(1)) : 0,
      color: '#06b6d4',
    },
  ];

  const orderedDecades = ['1960s-1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  const decadeDistribution = orderedDecades.map((d) => {
    const item = decadeMap.get(d) || { decade: d, count: 0, movieCount: 0, seriesCount: 0, albumCount: 0, totalBytes: 0 };
    return {
      decade: item.decade,
      count: item.count,
      movieCount: item.movieCount,
      seriesCount: item.seriesCount,
      albumCount: item.albumCount,
      totalGB: Number((item.totalBytes / (1024 * 1024 * 1024)).toFixed(2)),
    };
  });

  const dbStats = await getDbStats();

  return {
    success: true,
    summary: {
      totalMediaItems: totalCount,
      totalSizeBytes,
      totalSizeGB: totalGB,
      movieCount,
      movieSizeGB,
      seriesCount,
      seriesSizeGB,
      albumCount,
      albumSizeGB,
      uniqueGenresCount: genreMap.size,
      avgRating: ratedCount > 0 ? Number((totalRatingSum / ratedCount).toFixed(1)) : 0,
      dbFileSizeBytes: dbStats.fileSizeBytes,
      totalWatchProgressTracked: dbStats.totalSeriesTracked,
    },
    genreDistribution,
    mediaTypeDistribution,
    decadeDistribution,
    largestItems: largestItemsList.slice(0, 10),
  };
}

// ==========================================
// THUMBNAIL METADATA CACHE OPERATIONS
// ==========================================

export interface ThumbnailDbRecord {
  id: string;
  media_path: string;
  title: string;
  media_type: string;
  thumbnail_url: string;
  fanart_url?: string;
  width: number;
  height: number;
  aspect_ratio: string;
  color_dominant: string;
  source: string;
  file_size_bytes: number;
  format: string;
  resolution_label: string;
  cached_at: number;
  last_accessed_at: number;
  hit_count: number;
}

export async function getAllCachedThumbnailsFromDb(): Promise<ThumbnailDbRecord[]> {
  const db = await getDatabase();
  const res = db.exec(`SELECT * FROM thumbnail_metadata_cache ORDER BY last_accessed_at DESC`);
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: any = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item as ThumbnailDbRecord;
  });
}

export async function getCachedThumbnailByPath(mediaPath: string): Promise<ThumbnailDbRecord | null> {
  const db = await getDatabase();
  const res = db.exec(`SELECT * FROM thumbnail_metadata_cache WHERE media_path = ? LIMIT 1`, [mediaPath]);
  if (res.length === 0 || res[0].values.length === 0) return null;
  const columns = res[0].columns;
  const row = res[0].values[0];
  const item: any = {};
  columns.forEach((col, idx) => {
    item[col] = row[idx];
  });
  return item as ThumbnailDbRecord;
}

export async function saveThumbnailToDb(thumb: ThumbnailDbRecord): Promise<void> {
  const db = await getDatabase();
  db.run(
    `INSERT INTO thumbnail_metadata_cache (
      id, media_path, title, media_type, thumbnail_url, fanart_url, width, height, aspect_ratio,
      color_dominant, source, file_size_bytes, format, resolution_label, cached_at, last_accessed_at, hit_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_path) DO UPDATE SET
      title = excluded.title,
      media_type = excluded.media_type,
      thumbnail_url = excluded.thumbnail_url,
      fanart_url = excluded.fanart_url,
      width = excluded.width,
      height = excluded.height,
      aspect_ratio = excluded.aspect_ratio,
      color_dominant = excluded.color_dominant,
      source = excluded.source,
      file_size_bytes = excluded.file_size_bytes,
      format = excluded.format,
      resolution_label = excluded.resolution_label,
      last_accessed_at = excluded.last_accessed_at,
      hit_count = thumbnail_metadata_cache.hit_count + 1`,
    [
      thumb.id,
      thumb.media_path,
      thumb.title,
      thumb.media_type,
      thumb.thumbnail_url,
      thumb.fanart_url || null,
      thumb.width || 600,
      thumb.height || 900,
      thumb.aspect_ratio || 'poster',
      thumb.color_dominant || '#1e293b',
      thumb.source || 'matched_media',
      thumb.file_size_bytes || 0,
      thumb.format || 'jpg',
      thumb.resolution_label || '600 × 900 (2:3)',
      thumb.cached_at || Date.now(),
      thumb.last_accessed_at || Date.now(),
      thumb.hit_count || 1,
    ]
  );
  persistDbToDisk();
}

export async function batchSaveThumbnailsToDb(thumbs: ThumbnailDbRecord[]): Promise<number> {
  const db = await getDatabase();
  let count = 0;
  for (const thumb of thumbs) {
    try {
      db.run(
        `INSERT INTO thumbnail_metadata_cache (
          id, media_path, title, media_type, thumbnail_url, fanart_url, width, height, aspect_ratio,
          color_dominant, source, file_size_bytes, format, resolution_label, cached_at, last_accessed_at, hit_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(media_path) DO UPDATE SET
          title = excluded.title,
          media_type = excluded.media_type,
          thumbnail_url = excluded.thumbnail_url,
          fanart_url = excluded.fanart_url,
          width = excluded.width,
          height = excluded.height,
          aspect_ratio = excluded.aspect_ratio,
          color_dominant = excluded.color_dominant,
          source = excluded.source,
          file_size_bytes = excluded.file_size_bytes,
          format = excluded.format,
          resolution_label = excluded.resolution_label,
          last_accessed_at = excluded.last_accessed_at,
          hit_count = thumbnail_metadata_cache.hit_count + 1`,
        [
          thumb.id,
          thumb.media_path,
          thumb.title,
          thumb.media_type,
          thumb.thumbnail_url,
          thumb.fanart_url || null,
          thumb.width || 600,
          thumb.height || 900,
          thumb.aspect_ratio || 'poster',
          thumb.color_dominant || '#1e293b',
          thumb.source || 'matched_media',
          thumb.file_size_bytes || 0,
          thumb.format || 'jpg',
          thumb.resolution_label || '600 × 900 (2:3)',
          thumb.cached_at || Date.now(),
          thumb.last_accessed_at || Date.now(),
          thumb.hit_count || 1,
        ]
      );
      count++;
    } catch (e) {
      console.warn('Failed saving thumbnail record:', thumb.media_path, e);
    }
  }
  persistDbToDisk();
  return count;
}

export async function incrementThumbnailHitInDb(mediaPathOrId: string): Promise<void> {
  const db = await getDatabase();
  db.run(
    `UPDATE thumbnail_metadata_cache 
     SET hit_count = hit_count + 1, last_accessed_at = ? 
     WHERE media_path = ? OR id = ?`,
    [Date.now(), mediaPathOrId, mediaPathOrId]
  );
  persistDbToDisk();
}

export async function clearThumbnailCacheInDb(idOrPath?: string): Promise<void> {
  const db = await getDatabase();
  if (idOrPath) {
    db.run(`DELETE FROM thumbnail_metadata_cache WHERE id = ? OR media_path = ?`, [idOrPath, idOrPath]);
  } else {
    db.run(`DELETE FROM thumbnail_metadata_cache`);
  }
  persistDbToDisk();
}

export async function getThumbnailCacheDbStats(): Promise<{
  totalCached: number;
  totalHits: number;
  oldestTimestamp: number;
  newestTimestamp: number;
}> {
  const db = await getDatabase();
  const res = db.exec(`
    SELECT 
      COUNT(*) as total, 
      COALESCE(SUM(hit_count), 0) as hits,
      COALESCE(MIN(cached_at), 0) as oldest,
      COALESCE(MAX(last_accessed_at), 0) as newest
    FROM thumbnail_metadata_cache
  `);
  if (res.length === 0 || res[0].values.length === 0) {
    return { totalCached: 0, totalHits: 0, oldestTimestamp: 0, newestTimestamp: 0 };
  }
  const row = res[0].values[0];
  return {
    totalCached: Number(row[0] || 0),
    totalHits: Number(row[1] || 0),
    oldestTimestamp: Number(row[2] || 0),
    newestTimestamp: Number(row[3] || 0),
  };
}

// SMART PLAYLISTS
export async function getAllSmartPlaylists() {
  const db = await getDatabase();
  const res = db.exec("SELECT * FROM smart_playlists ORDER BY created_at DESC");
  if (res.length === 0) return [];

  return res[0].values.map((row: any) => ({
    id: row[0],
    name: row[1],
    description: row[2],
    rules: JSON.parse(row[3]),
    createdAt: row[4]
  }));
}

export async function saveSmartPlaylist(playlist: any) {
  const db = await getDatabase();
  db.run(
    `INSERT OR REPLACE INTO smart_playlists (id, name, description, rules_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      playlist.id,
      playlist.name,
      playlist.description || '',
      JSON.stringify(playlist.rules),
      playlist.createdAt || new Date().toISOString()
    ]
  );
  persistDbToDisk();
}

export async function deleteSmartPlaylist(id: string) {
  const db = await getDatabase();
  db.run("DELETE FROM smart_playlists WHERE id = ?", [id]);
  persistDbToDisk();
}

// PERSISTENT VAULT STATE STORAGE (Persists across app re-installs, update extraction, and deletions)
export interface PersistentVaultState {
  version: number;
  lastSavedAt: string;
  sambaTree?: any[];
  syncLogs?: any[];
  sambaConfig?: any;
  classifierSettings?: any;
  mediaExtensionConfig?: any;
  mediaLibrarySummary?: {
    totalItems: number;
    syncedSeriesCount: number;
  };
  customData?: Record<string, any>;
}

export function getPersistentStorageInfo() {
  const homeDir = os.homedir();
  const existsDb = fs.existsSync(DB_PATH);
  const existsState = fs.existsSync(VAULT_STATE_FILE);
  let dbSizeBytes = 0;
  let stateSizeBytes = 0;
  let stateModifiedAt: string | null = null;

  try {
    if (existsDb) {
      dbSizeBytes = fs.statSync(DB_PATH).size;
    }
    if (existsState) {
      const st = fs.statSync(VAULT_STATE_FILE);
      stateSizeBytes = st.size;
      stateModifiedAt = st.mtime.toISOString();
    }
  } catch {}

  return {
    dataDir: DATA_DIR,
    dbPath: DB_PATH,
    stateFilePath: VAULT_STATE_FILE,
    isPermanentHomeLocation: DATA_DIR.startsWith(homeDir),
    dbExists: existsDb,
    stateFileExists: existsState,
    dbSizeBytes,
    stateSizeBytes,
    lastSavedAt: stateModifiedAt,
  };
}

export function getVaultStateFromDisk(): PersistentVaultState | null {
  try {
    if (fs.existsSync(VAULT_STATE_FILE)) {
      const raw = fs.readFileSync(VAULT_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch (e) {
    console.error('[SambaVault Storage] Error reading vault_state.json:', e);
  }
  return null;
}

let vaultStatePersistTimer: NodeJS.Timeout | null = null;
let pendingVaultState: PersistentVaultState | null = null;

export function saveVaultStateToDisk(state: Partial<PersistentVaultState>): PersistentVaultState {
  const existing = getVaultStateFromDisk() || {
    version: 1,
    lastSavedAt: new Date().toISOString(),
  };

  const updated: PersistentVaultState = {
    ...existing,
    ...state,
    version: 1,
    lastSavedAt: new Date().toISOString(),
  };

  pendingVaultState = updated;

  if (vaultStatePersistTimer) clearTimeout(vaultStatePersistTimer);
  vaultStatePersistTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempPath = `${VAULT_STATE_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(pendingVaultState, null, 2), 'utf-8');
      fs.renameSync(tempPath, VAULT_STATE_FILE);
    } catch (e) {
      console.error('[SambaVault Storage] Failed saving vault_state.json to disk:', e);
    }
  }, 150);

  return updated;
}

