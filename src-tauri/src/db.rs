use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MediaItem {
    pub id: String,
    pub media_type: String,
    pub title: String,
    pub original_title: Option<String>,
    pub synopsis: String,
    pub year: Option<i32>,
    pub rating: Option<f64>,
    pub poster_url: Option<String>,
    pub fanart_url: Option<String>,
    pub genres: Option<String>,
    pub cast: Option<String>,
    pub recommended_folder: Option<String>,
    pub raw_data: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WatchProgress {
    pub id: String,
    pub series_id: String,
    pub series_title: String,
    pub season_number: i32,
    pub episode_number: i32,
    pub episode_title: String,
    pub playback_position_seconds: i32,
    pub total_duration_seconds: i32,
    pub progress_percentage: f64,
    pub is_completed: i32,
    pub last_watched_at: String,
    pub notes: Option<String>,
}

pub fn get_data_dir(app_handle: &AppHandle) -> PathBuf {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok();
    let base_dir = if let Some(h) = home {
        PathBuf::from(h).join(".media-player")
    } else {
        app_handle.path_resolver().app_data_dir().unwrap_or_else(|| PathBuf::from("./data"))
    };
    if !base_dir.exists() {
        let _ = fs::create_dir_all(&base_dir);
    }
    // Migration: If ~/.media-player doesn't have media_vault.sqlite, check ~/.sambavault or ./data
    let target_sqlite = base_dir.join("media_vault.sqlite");
    if !target_sqlite.exists() {
        if let Ok(h) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            let old_dir = PathBuf::from(h).join(".sambavault");
            let old_sqlite = old_dir.join("media_vault.sqlite");
            if old_sqlite.exists() {
                let _ = fs::copy(&old_sqlite, &target_sqlite);
            }
        }
    }
    base_dir
}

pub fn get_db_path(app_handle: &AppHandle) -> PathBuf {
    get_data_dir(app_handle).join("media_vault.sqlite")
}

pub fn init_db(app_handle: &AppHandle) -> Result<()> {
    let path = get_db_path(app_handle);
    let conn = Connection::open(path)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS media_items (
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
            file_size_bytes INTEGER DEFAULT 0,
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

        CREATE INDEX IF NOT EXISTS idx_watchlist_media_id ON user_watchlist(media_id);
        CREATE INDEX IF NOT EXISTS idx_media_items_title ON media_items(title);
        CREATE INDEX IF NOT EXISTS idx_media_items_type ON media_items(media_type);
        CREATE INDEX IF NOT EXISTS idx_watch_history_watched ON watch_history_log(watched_at);
        CREATE INDEX IF NOT EXISTS idx_watch_progress_series ON series_watch_progress(series_id);"
    )?;

    Ok(())
}

#[tauri::command]
pub fn get_all_media(app_handle: AppHandle) -> Result<Vec<MediaItem>, String> {
    let path = get_db_path(&app_handle);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT * FROM media_items ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let media_iter = stmt
        .query_map([], |row| {
            Ok(MediaItem {
                id: row.get(0)?,
                media_type: row.get(1)?,
                title: row.get(2)?,
                original_title: row.get(3)?,
                synopsis: row.get(4)?,
                year: row.get(5)?,
                rating: row.get(6)?,
                poster_url: row.get(7)?,
                fanart_url: row.get(8)?,
                genres: row.get(9)?,
                cast: row.get(10)?,
                recommended_folder: row.get(11)?,
                raw_data: row.get(12)?,
                file_size_bytes: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for item in media_iter {
        results.push(item.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn save_media(app_handle: AppHandle, media: MediaItem) -> Result<(), String> {
    let path = get_db_path(&app_handle);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, cast, recommended_folder, raw_data, file_size_bytes, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'))
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
           updated_at = datetime('now')",
        params![
            media.id,
            media.media_type,
            media.title,
            media.original_title,
            media.synopsis,
            media.year,
            media.rating,
            media.poster_url,
            media.fanart_url,
            media.genres,
            media.cast,
            media.recommended_folder,
            media.raw_data,
            media.file_size_bytes,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_watch_progress(app_handle: AppHandle, progress: WatchProgress) -> Result<(), String> {
    let path = get_db_path(&app_handle);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO series_watch_progress (id, series_id, series_title, season_number, episode_number, episode_title, playback_position_seconds, total_duration_seconds, progress_percentage, is_completed, last_watched_at, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'), ?11)
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
           notes = excluded.notes",
        params![
            progress.id,
            progress.series_id,
            progress.series_title,
            progress.season_number,
            progress.episode_number,
            progress.episode_title,
            progress.playback_position_seconds,
            progress.total_duration_seconds,
            progress.progress_percentage,
            progress.is_completed,
            progress.notes,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn reset_database(app_handle: AppHandle) -> Result<(), String> {
    let path = get_db_path(&app_handle);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "DELETE FROM media_items;
         DELETE FROM series_watch_progress;
         DELETE FROM watch_history_log;
         DELETE FROM user_watchlist;"
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn save_media_batch(app_handle: AppHandle, items: Vec<MediaItem>) -> Result<(), String> {
    let path = get_db_path(&app_handle);
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
        let mut stmt = tx.prepare(
            "INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, cast, recommended_folder, raw_data, file_size_bytes, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'))
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
               updated_at = datetime('now')"
        ).map_err(|e| e.to_string())?;

        for media in items {
            stmt.execute(params![
                media.id,
                media.media_type,
                media.title,
                media.original_title,
                media.synopsis,
                media.year,
                media.rating,
                media.poster_url,
                media.fanart_url,
                media.genres,
                media.cast,
                media.recommended_folder,
                media.raw_data,
                media.file_size_bytes,
            ]).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_vault_state(app_handle: AppHandle) -> Result<Option<String>, String> {
    let state_file = get_data_dir(&app_handle).join("vault_state.json");
    if state_file.exists() {
        let content = fs::read_to_string(&state_file).map_err(|e| e.to_string())?;
        Ok(Some(content))
    } else {
        if let Ok(h) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            let old_state = PathBuf::from(h).join(".sambavault").join("vault_state.json");
            if old_state.exists() {
                if let Ok(content) = fs::read_to_string(&old_state) {
                    let _ = fs::write(&state_file, &content);
                    return Ok(Some(content));
                }
            }
        }
        Ok(None)
    }
}

#[tauri::command]
pub fn save_vault_state(app_handle: AppHandle, state_json: String) -> Result<(), String> {
    let state_file = get_data_dir(&app_handle).join("vault_state.json");
    fs::write(&state_file, state_json).map_err(|e| e.to_string())?;
    Ok(())
}
