use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
    pub file_path: Option<String>,
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
    conn.execute_batch("CREATE TABLE IF NOT EXISTS media_items (id TEXT PRIMARY KEY, media_type TEXT NOT NULL, title TEXT NOT NULL, original_title TEXT, synopsis TEXT NOT NULL, year INTEGER, rating REAL, poster_url TEXT, fanart_url TEXT, genres TEXT, cast TEXT, recommended_folder TEXT, raw_data TEXT, file_size_bytes INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), file_path TEXT) CREATE TABLE IF NOT EXISTS series_watch_progress (id TEXT PRIMARY KEY, series_id TEXT NOT NULL, series_title TEXT NOT NULL, season_number INTEGER NOT NULL, episode_number INTEGER NOT NULL, episode_title TEXT NOT NULL, playback_position_seconds INTEGER DEFAULT 0, total_duration_seconds INTEGER DEFAULT 0, progress_percentage REAL DEFAULT 0.0, is_completed INTEGER DEFAULT 0, last_watched_at TEXT DEFAULT (datetime('now')), notes TEXT) CREATE TABLE IF NOT EXISTS watch_history_log (id TEXT PRIMARY KEY, media_id TEXT NOT NULL, episode_number INTEGER NOT NULL, watched_at TEXT DEFAULT (datetime('now'))) CREATE TABLE IF NOT EXISTS user_watchlist (id TEXT PRIMARY KEY, series_id TEXT NOT NULL, series_title TEXT NOT NULL, season_number INTEGER NOT NULL, episode_number INTEGER NOT NULL, episode_title TEXT NOT NULL, watched_at TEXT DEFAULT (datetime('now')))"
).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_media_batch(app_handle: AppHandle, items: Vec<MediaItem>) -> Result<(), String> {
    let path = get_db_path(&app_handle);
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare("INSERT INTO media_items (id, media_type, title, original_title, synopsis, year, rating, poster_url, fanart_url, genres, cast, recommended_folder, raw_data, file_size_bytes, file_path, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, datetime('now'))").map_err(|e| e.to_string())?;
        for media in items {
            stmt.execute(params![media.id, media.media_type, media.title, media.original_title, media.synopsis, media.year, media.rating, media.poster_url, media.fanart_url, media.genres, media.cast, media.recommended_folder, media.raw_data, media.file_size_bytes, media.file_path]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_vault_state(app_handle: AppHandle) -> Result<Option<String>, String> {
    let state_file = get_data_dir(&app_handle).join("vault_state.json");
    if state_file.exists() {
        let content = fs::read_to_string(&state_file).map_err(|e| e.to_string())?;
        Ok(Some(content))
    } else {
        return Err(String::from("No vault state file found"));
    }
}

#[tauri::command]
pub async fn save_vault_state(app_handle: AppHandle, state_json: String) -> Result<(), String> {
    let state_file = get_data_dir(&app_handle).join("vault_state.json");
    fs::write(&state_file, &state_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_save_state(app_handle: AppHandle) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn vault_get_state(app_handle: AppHandle) -> Result<(), String> {
    let result = get_vault_state(app_handle).await;
    let error_msg = if let Err(e) = result {
        format!("Vault state read task failed: {}", e)
    } else {
        "vault_get_state".to_string()
    };
    Err(error_msg)
}
