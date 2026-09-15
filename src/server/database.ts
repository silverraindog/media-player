import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

let dbInstance: Database | null = null;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'media_vault.sqlite');

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
  recommended_folder?: string;
  raw_data?: string; // JSON string
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

function persistDbToDisk() {
  if (!dbInstance) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const binaryArray = dbInstance.export();
    const buffer = Buffer.from(binaryArray);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Error persisting SQLite database to disk:', err);
  }
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
      series_id TEXT,
      title TEXT NOT NULL,
      season_number INTEGER,
      episode_number INTEGER,
      episode_title TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_thumb_media_path ON thumbnail_metadata_cache(media_path);
  `);

  // Seed default items if empty
  const countResult = dbInstance.exec(`SELECT COUNT(*) as count FROM media_items`);
  const count = countResult.length > 0 && countResult[0].values[0] ? (countResult[0].values[0][0] as number) : 0;

  if (count === 0) {
    seedInitialSqliteData(dbInstance);
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
      'TV Shows/Breaking Bad (2008)/Season 01/'
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
      'TV Shows/Severance (2022)/Season 01/'
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
    `INSERT INTO watch_history_log (id, series_id, title, season_number, episode_number, episode_title, watched_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-2 days'))`,
    ['hist-1', 'series-breaking-bad', 'Breaking Bad', 1, 1, 'Pilot']
  );
  db.run(
    `INSERT INTO watch_history_log (id, series_id, title, season_number, episode_number, episode_title, watched_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-1 day'))`,
    ['hist-2', 'series-breaking-bad', 'Breaking Bad', 1, 2, "Cat's in the Bag..."]
  );
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

export async function saveMediaToDb(media: MediaItemDb): Promise<void> {
  const db = await getDatabase();
  db.run(
    `INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, recommended_folder, raw_data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
      media.raw_data || null
    ]
  );
  persistDbToDisk();
}

export async function deleteMediaFromDb(id: string): Promise<void> {
  const db = await getDatabase();
  db.run(`DELETE FROM media_items WHERE id = ?`, [id]);
  db.run(`DELETE FROM series_watch_progress WHERE series_id = ?`, [id]);
  persistDbToDisk();
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
  const res = db.exec(`SELECT * FROM series_watch_progress WHERE series_id = ? LIMIT 1`, [seriesId]);
  if (res.length === 0 || res[0].values.length === 0) return null;
  const columns = res[0].columns;
  const row = res[0].values[0];
  const item: any = {};
  columns.forEach((col, idx) => {
    item[col] = row[idx];
  });
  return item as WatchProgressDb;
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
  const id = `prog-${progress.series_id}`;
  const pos = progress.playback_position_seconds || 0;
  const total = progress.total_duration_seconds || 3000;
  const percent = progress.progress_percentage !== undefined ? progress.progress_percentage : (total > 0 ? (pos / total) * 100 : 0);
  const completed = progress.is_completed ? 1 : (percent >= 90 ? 1 : 0);

  db.run(
    `INSERT INTO series_watch_progress (id, series_id, series_title, season_number, episode_number, episode_title, playback_position_seconds, total_duration_seconds, progress_percentage, is_completed, last_watched_at, notes)
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
       notes = excluded.notes`,
    [
      id,
      progress.series_id,
      progress.series_title,
      progress.season_number,
      progress.episode_number,
      progress.episode_title,
      pos,
      total,
      percent,
      completed,
      progress.notes || null
    ]
  );

  // If marked completed, add to watch history log
  if (completed) {
    db.run(
      `INSERT INTO watch_history_log (id, series_id, title, season_number, episode_number, episode_title, watched_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        `hist-${Date.now()}-${Math.random()}`,
        progress.series_id,
        progress.series_title,
        progress.season_number,
        progress.episode_number,
        progress.episode_title
      ]
    );
  }

  persistDbToDisk();
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
