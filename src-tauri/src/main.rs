use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use ffmpeg_light::config::FfmpegLocator;
use ffmpeg_light::TranscodeBuilder;
use walkdir::WalkDir;
use tauri::AppHandle;

mod ai;
mod db;

#[tauri::command]
fn vault_purge_transcode_cache(app_handle: AppHandle, limit_gb: u64) -> Result<(), String> {
    let data_dir = db::get_data_dir(&app_handle);
    let transcode_dir = data_dir.join("transcoded");
    if !transcode_dir.exists() {
        return Ok(());
    }

    let limit_bytes = limit_gb * 1024 * 1024 * 1024;
    
    let mut files: Vec<(PathBuf, std::fs::Metadata)> = fs::read_dir(&transcode_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            Some((entry.path(), meta))
        })
        .collect();

    let total_size: u64 = files.iter().map(|(_, meta)| meta.len()).sum();
    if total_size <= limit_bytes {
        return Ok(());
    }

    // Sort by modified time (oldest first)
    files.sort_by_key(|(_, meta)| meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH));

    let mut current_size = total_size;
    for (path, meta) in files {
        if current_size <= limit_bytes {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            current_size -= meta.len();
        }
    }
    
    Ok(())
}

// Persistence commands
#[tauri::command]
fn cleanup_transcoded_file(path: String) -> Result<(), String> {
    if fs::metadata(&path).is_ok() {
        fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
fn vault_save_state(app_handle: AppHandle, state: String) -> Result<(), String> {
    let data_dir = db::get_data_dir(&app_handle);
    let state_path = data_dir.join("state.json");
    fs::write(state_path, state).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_get_state(app_handle: AppHandle) -> Result<String, String> {
    let data_dir = db::get_data_dir(&app_handle);
    let state_path = data_dir.join("state.json");
    if state_path.exists() {
        fs::read_to_string(state_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

pub mod macos_permissions {
    use serde::{Deserialize, Serialize};
    use std::process::Command;

    #[derive(Debug, Serialize, Deserialize)]
    pub struct FullDiskAccessResult {
        pub is_macos: bool,
        pub has_full_disk_access: bool,
        pub platform: String,
        pub checked_path: String,
        pub details: String,
        pub system_settings_path: String,
    }

    /// Diagnostic check: attempts to read a protected path to verify FDA
    #[tauri::command]
    pub async fn check_tcc_access() -> Result<bool, String> {
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/Shared".to_string());
            let path = std::path::PathBuf::from(home).join("Documents");
            match std::fs::read_dir(path) {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(true) // Not applicable
        }
    }

    /// Diagnostic check: attempts to read a protected path to verify FDA
    #[tauri::command]
    pub async fn diagnostic_check_full_disk_access() -> Result<String, String> {
        #[cfg(target_os = "macos")]
        {
            let path = "/Library/Application Support/com.apple.TCC/TCC.db";
            match std::fs::metadata(path) {
                Ok(_) => Ok("Success: Full Disk Access is active (Successfully read TCC.db).".to_string()),
                Err(e) => Err(format!("Access Denied: Full Disk Access may be disabled. Cannot read {}. Error: {}", path, e)),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok("Diagnostic not applicable on this OS.".to_string())
        }
    }

    /// Verifies macOS Full Disk Access status (non-blocking)
    #[tauri::command]
    pub async fn check_full_disk_access() -> Result<FullDiskAccessResult, String> {
        #[cfg(target_os = "macos")]
        {
            // Probe 1: Attempt to read TCC database (standard system FDA indicator)
            let tcc_path = "/Library/Application Support/com.apple.TCC/TCC.db";
            let tcc_readable = std::fs::metadata(tcc_path).is_ok();

            // Probe 2: Attempt to read user's Documents folder
            let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/Shared".to_string());
            let docs_path = std::path::PathBuf::from(&home).join("Documents");
            let docs_readable = std::fs::read_dir(&docs_path).is_ok();

            let has_access = tcc_readable || docs_readable;
            let checked_path = if tcc_readable {
                tcc_path.to_string()
            } else {
                docs_path.to_string_lossy().to_string()
            };

            Ok(FullDiskAccessResult {
                is_macos: true,
                has_full_disk_access: has_access,
                platform: "macos".to_string(),
                checked_path,
                details: if has_access {
                    "Full Disk Access verified via system probes (filesystem permissions active).".to_string()
                } else {
                    "macOS TCC privacy protection active. Please grant Full Disk Access to SambaVault.".to_string()
                },
                system_settings_path: "System Settings > Privacy & Security > Full Disk Access".to_string(),
            })
        }

        #[cfg(not(target_os = "macos"))]
        {
            Ok(FullDiskAccessResult {
                is_macos: false,
                has_full_disk_access: true,
                platform: std::env::consts::OS.to_string(),
                checked_path: "".to_string(),
                details: "Full Disk Access check is only applicable on macOS.".to_string(),
                system_settings_path: "".to_string(),
            })
        }
    }

    /// Triggers macOS System Settings to directly open Privacy & Security > Full Disk Access pane.
    #[tauri::command]
    pub async fn open_macos_security_privacy() -> Result<String, String> {
        #[cfg(target_os = "macos")]
        {
            let res = Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
                .spawn();

            match res {
                Ok(_) => Ok("Opened macOS Security & Privacy pane successfully.".to_string()),
                Err(e) => {
                    let _ = Command::new("open")
                        .arg("/System/Applications/System Settings.app")
                        .spawn();
                    Ok(format!("Opened System Settings fallback: {}", e))
                }
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            Err("Security & Privacy pane is only available on macOS.".to_string())
        }
    }

    /// Opens macOS System Settings to Privacy & Security > Full Disk Access after triggering TCC registration probe.
    #[tauri::command]
    pub async fn request_full_disk_access_and_register() -> Result<String, String> {
        #[cfg(target_os = "macos")]
        {
            // Perform safe read probes on TCC paths so macOS registers SambaVault in System Settings application list
            let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/Shared".to_string());
            let candidate_probes = [
                std::path::PathBuf::from(&home).join("Library").join("Safari"),
                std::path::PathBuf::from("/Library/Application Support/com.apple.TCC"),
                std::path::PathBuf::from("/Volumes"),
            ];
            for p in &candidate_probes {
                let _ = std::fs::read_dir(p);
            }

            open_macos_security_privacy().await
        }

        #[cfg(not(target_os = "macos"))]
        {
            Ok("Not on macOS.".to_string())
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFileItem {
    pub name: String,
    pub path: String,
    pub rel_path: String,
    pub size: u64,
    pub is_dir: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    pub scanned_count: usize,
    pub current_file: String,
    pub current_path: String,
    pub is_dir: bool,
    pub items: Vec<ScannedFileItem>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VolumeMountInfo {
    pub is_mounted: bool,
    pub mount_path: String,
    pub files: Vec<String>,
    pub permission_denied: bool,
    pub error_details: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProbeResult {
    pub reachable: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MountActionResult {
    pub success: bool,
    pub message: String,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanVolumeResult {
    pub success: bool,
    pub mount_path: String,
    pub items: Vec<ScannedFileItem>,
    pub total_scanned: usize,
    pub error: Option<String>,
}

pub fn sanitize_filename(name: &str) -> String {
    let mut cleaned = name.trim().to_string();
    cleaned = cleaned.replace(':', " - ");
    cleaned = cleaned.replace(['/', '\\', '|'], "-");
    cleaned = cleaned.chars().filter(|c| !matches!(c, '<' | '>' | '"' | '?' | '*')).collect();
    cleaned = cleaned.chars().filter(|c| !c.is_control()).collect();
    while cleaned.contains("  ") {
        cleaned = cleaned.replace("  ", " ");
    }
    while cleaned.contains("--") {
        cleaned = cleaned.replace("--", "-");
    }
    cleaned = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace()).to_string();

    let open_parens = cleaned.matches('(').count();
    let close_parens = cleaned.matches(')').count();
    if open_parens > close_parens {
        for _ in 0..(open_parens - close_parens) {
            cleaned.push(')');
        }
    }

    let open_brackets = cleaned.matches('[').count();
    let close_brackets = cleaned.matches(']').count();
    if open_brackets > close_brackets {
        for _ in 0..(open_brackets - close_brackets) {
            cleaned.push(']');
        }
    }

    cleaned
}

pub fn sanitize_samba_path(raw_path: &str) -> String {
    let mut normalized = raw_path.replace('\\', "/");

    // Strip raw UNC host & share prefixes e.g. "//192.168.1.25/media/Series/..." -> "Series/..."
    // or "smb://192.168.1.25/media/Series/..." -> "Series/..."
    let lower = normalized.to_lowercase();
    if lower.starts_with("smb://") || lower.starts_with("//") || lower.starts_with('/') {
        let stripped = normalized
            .trim_start_matches("smb:")
            .trim_start_matches('/');
        let parts: Vec<&str> = stripped.split('/').filter(|s| !s.is_empty()).collect();
        // Check if first part looks like an IP or hostname (contains . or :) followed by share
        if parts.len() >= 2 && (parts[0].contains('.') || parts[0].contains(':') || parts[0].eq_ignore_ascii_case("localhost")) {
            normalized = parts[2..].join("/");
        } else if parts.len() >= 2 && (parts[0].eq_ignore_ascii_case("volumes") || parts[0].eq_ignore_ascii_case("mnt") || parts[0].eq_ignore_ascii_case("media")) {
            // Strip leading /Volumes/<share>/ or /mnt/<share>/ or /media/<share>/
            normalized = parts[2..].join("/");
        }
    }

    // Strip Windows drive letters e.g. "C:/" or "D:\"
    if normalized.len() >= 2 {
        let bytes = normalized.as_bytes();
        if bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
            normalized = normalized[2..].trim_start_matches('/').to_string();
        }
    }

    let segments: Vec<String> = normalized
        .split('/')
        .filter(|s| !s.is_empty())
        .map(sanitize_filename)
        .filter(|s| !s.is_empty())
        .collect();

    segments.join("/")
}

pub fn resolve_absolute_samba_path(input: &str) -> PathBuf {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return PathBuf::from("/Volumes/media");
    }

    let normalized = trimmed.replace('\\', "/");

    // Handle UNC or smb:// URIs: //192.168.1.25/media or smb://192.168.1.25/media
    if normalized.starts_with("//") || normalized.to_lowercase().starts_with("smb://") {
        let stripped = normalized
            .trim_start_matches("smb:")
            .trim_start_matches('/');
        let parts: Vec<&str> = stripped.split('/').filter(|s| !s.is_empty()).collect();
        let share_name = if parts.len() >= 2 {
            parts[1]
        } else {
            "media"
        };
        let subpath = if parts.len() > 2 { parts[2..].join("/") } else { String::new() };

        let mut candidates = vec![
            format!("/Volumes/{}", share_name),
            format!("/mnt/{}", share_name),
            format!("/media/{}", share_name),
        ];
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(format!("{}/media", home));
        }

        for cand in candidates {
            let p = PathBuf::from(&cand);
            if p.exists() {
                return if subpath.is_empty() { p } else { p.join(&subpath) };
            }
        }

        #[cfg(target_os = "macos")]
        let default_mount = PathBuf::from(format!("/Volumes/{}", share_name));
        #[cfg(target_os = "windows")]
        let default_mount = PathBuf::from(format!("//192.168.1.25/{}", share_name));
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let default_mount = PathBuf::from(format!("/mnt/{}", share_name));

        return if subpath.is_empty() { default_mount } else { default_mount.join(&subpath) };
    }

    // Windows drive path check (e.g. C:/media or D:\media)
    if normalized.len() >= 2 {
        let bytes = normalized.as_bytes();
        if bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
            return PathBuf::from(&normalized);
        }
    }

    // Local absolute path check: starts with / and not //
    if normalized.starts_with('/') && !normalized.starts_with("//") {
        let p = PathBuf::from(&normalized);
        if let Ok(canon) = fs::canonicalize(&p) {
            return canon;
        }
        return p;
    }

    let volumes_candidate = PathBuf::from("/Volumes").join(&normalized);
    if volumes_candidate.exists() {
        return volumes_candidate;
    }

    let mnt_candidate = PathBuf::from("/mnt").join(&normalized);
    if mnt_candidate.exists() {
        return mnt_candidate;
    }

    if let Ok(cwd) = std::env::current_dir() {
        return cwd.join(&normalized);
    }

    PathBuf::from(&normalized)
}

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

// Helper function to create a unique ID based on the file path
fn generate_media_id(path: &str) -> String {
    let mut s = DefaultHasher::new();
    path.hash(&mut s);
    format!("{:x}", s.finish())
}

#[tauri::command]
async fn scan_and_import_volumes(
    app_handle: tauri::AppHandle,
    mount_paths: Option<Vec<String>>,
    mountPaths: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let paths = mount_paths.or(mountPaths).unwrap_or_default();
    let mut results = Vec::new();

    for path_str in paths {
        let path = PathBuf::from(&path_str);

        // 1. Test permissions
        if let Err(e) = std::fs::metadata(&path) {
            results.push(format!("Permission denied for {}: {}", path_str, e));
            continue;
        }

        // 2. Scan
        let walker = walkdir::WalkDir::new(&path)
            .follow_links(true)
            .into_iter();

        let mut count = 0;
        for entry_res in walker {
            let entry = match entry_res {
                Ok(e) => e,
                Err(err) => {
                    eprintln!("[Scanner] [Permission Denied/Error] Path: {:?} | Error: {:?}", err.path().unwrap_or(std::path::Path::new("unknown")), err);
                    continue;
                }
            };

            let entry_path = entry.path();
            if entry_path.is_dir() { continue; }

            let name = entry.file_name().to_string_lossy().to_string();
            let full_path = entry_path.to_string_lossy().to_string();

            // 3. Import into SQLite
            let media_item = db::MediaItem {
                id: generate_media_id(&full_path),
                media_type: "file".to_string(),
                title: name,
                original_title: None,
                synopsis: "No synopsis available".to_string(),
                year: None,
                rating: None,
                poster_url: None,
                fanart_url: None,
                genres: None,
                cast: None,
                recommended_folder: Some(path_str.clone()),
                raw_data: None,
                file_size_bytes: Some(entry.metadata().map(|m| m.len() as i64).unwrap_or(0)),
                created_at: None,
                updated_at: None,
            };

            if let Err(e) = db::save_media(app_handle.clone(), media_item) {
                eprintln!("[DB] Failed to save media {}: {}", full_path, e);
            } else {
                count += 1;
            }
        }
        results.push(format!("Successfully imported {} items from {}", count, path_str));
    }
    Ok(results)
}

#[tauri::command]
async fn sanitize_samba_path_command(raw_path: String) -> Result<String, String> {
    Ok(sanitize_samba_path(&raw_path))
}

#[tauri::command]
async fn perform_fast_scan(
    window: tauri::Window,
    root_path: Option<String>,
    rootPath: Option<String>,
    safe_scan: Option<bool>,
    safeScan: Option<bool>,
    max_depth: Option<usize>,
    maxDepth: Option<usize>,
) -> Result<Vec<ScannedFileItem>, String> {
    let target = root_path.or(rootPath).unwrap_or_default();
    let resolved_path = resolve_absolute_samba_path(&target);
    if !resolved_path.exists() {
        return Err(format!("Root path does not exist: {}", resolved_path.display()));
    }

    let is_safe = safe_scan.or(safeScan).unwrap_or(false);
    let depth_limit = max_depth.or(maxDepth).unwrap_or(if is_safe { 3 } else { 30 });
    let max_scan_items = if is_safe { 20000 } else { 500000 };

    let debug_enabled = std::env::var("RUST_LOG").map(|v| v == "debug" || v == "trace").unwrap_or(false)
        || std::env::var("DEBUG_WALK").map(|v| v == "1" || v == "true").unwrap_or(false);

    let res = tokio::task::spawn_blocking(move || {
        let mut items = Vec::new();
        let mut pending_items = Vec::new();
        let mut scanned_count = 0;
        let mut permission_denied_count = 0;
        let mut first_permission_denied_path = String::new();

        let mut walker_builder = WalkDir::new(&resolved_path);
        if !is_safe {
            walker_builder = walker_builder.follow_links(true);
        } else {
            walker_builder = walker_builder.follow_links(false);
        }
        let walker = walker_builder.max_depth(depth_limit).into_iter();

        for entry_res in walker {
            if scanned_count >= max_scan_items {
                if debug_enabled {
                    eprintln!("[WalkDir Debug] Reached max scan limit of {} items. Stopping walk.", max_scan_items);
                }
                break;
            }

            let entry = match entry_res {
                Ok(e) => e,
                Err(err) => {
                    // Log specifically if it's a permission issue
                    if err.io_error().map_or(false, |io_err| io_err.kind() == std::io::ErrorKind::PermissionDenied) {
                        permission_denied_count += 1;
                        let p = err.path().unwrap_or(std::path::Path::new("unknown")).to_string_lossy().to_string();
                        if first_permission_denied_path.is_empty() {
                            first_permission_denied_path = p.clone();
                        }
                        eprintln!("[Scanner] [Permission Denied] Path: {:?} | Error: {:?}", p, err);
                    } else if debug_enabled {
                        eprintln!("[Scanner] [Error] Path: {:?} | Error: {:?}", err.path().unwrap_or(std::path::Path::new("unknown")), err);
                    }
                    continue;
                }
            };

            let raw_file_name = entry.file_name().to_string_lossy();
            if raw_file_name.starts_with(".Spotlight-")
                || raw_file_name.starts_with(".Trashes")
                || raw_file_name.starts_with(".fseventsd")
                || raw_file_name.starts_with(".DocumentRevisions-")
                || raw_file_name.starts_with(".TemporaryItems")
                || raw_file_name.starts_with("$RECYCLE.BIN")
                || raw_file_name == "System Volume Information"
            {
                continue;
            }

            let entry_path = entry.path();
            if entry_path == resolved_path {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(err) => {
                    if debug_enabled {
                        eprintln!("[WalkDir Metadata Error] Path: {:?} | Error: {:?}", entry_path, err);
                    }
                    continue;
                }
            };

            let name = sanitize_filename(&raw_file_name.to_string());
            let full_path_str = entry_path.to_string_lossy().to_string();
            let raw_rel = match entry_path.strip_prefix(&resolved_path) {
                Ok(p) => p.to_string_lossy().to_string().replace('\\', "/"),
                Err(_) => {
                    let entry_str = full_path_str.replace('\\', "/");
                    let res_str = resolved_path.to_string_lossy().replace('\\', "/");
                    if entry_str.starts_with(&res_str) {
                        entry_str[res_str.len()..].trim_start_matches('/').to_string()
                    } else {
                        sanitize_samba_path(&entry_str)
                    }
                }
            };
            let rel_path = sanitize_samba_path(&raw_rel);

            let is_dir = metadata.is_dir();
            let size = if is_dir { 0 } else { metadata.len() };

            scanned_count += 1;

            let scanned_item = ScannedFileItem {
                name,
                path: full_path_str.clone(),
                rel_path,
                size,
                is_dir,
            };
            items.push(scanned_item.clone());
            pending_items.push(scanned_item);

            if scanned_count % 50 == 0 || is_dir || scanned_count == 1 {
                let _ = window.emit(
                    "scan-progress",
                    ScanProgressEvent {
                        scanned_count,
                        current_file: format!("[Scanner] {}", items.last().map(|item| item.rel_path.as_str()).unwrap_or("")),
                        current_path: full_path_str.clone(),
                        is_dir,
                        items: std::mem::take(&mut pending_items),
                    },
                );
            }
        }

        if !pending_items.is_empty() {
            let _ = window.emit(
                "scan-progress",
                ScanProgressEvent {
                    scanned_count,
                    current_file: String::new(),
                    current_path: String::new(),
                    is_dir: false,
                    items: std::mem::take(&mut pending_items),
                },
            );
        }

        if items.is_empty() && permission_denied_count > 0 {
            let blocked_path = if !first_permission_denied_path.is_empty() {
                first_permission_denied_path
            } else {
                resolved_path.to_string_lossy().to_string()
            };
            return Err(format!(
                "macOS privacy/TCC blocked filesystem access to '{}' ({} permission denied barriers encountered). Please grant Full Disk Access to SambaVault in System Settings > Privacy & Security > Full Disk Access.",
                blocked_path,
                permission_denied_count
            ));
        }

        Ok(items)
    }).await.map_err(|e| format!("Task execution error: {}", e))?;

    res
}

#[tauri::command]
async fn check_volume_mounted(
    share_name: Option<String>,
    shareName: Option<String>,
) -> Result<VolumeMountInfo, String> {
    let target_share = share_name.or(shareName).unwrap_or_default();
    let candidate_paths = vec![
        PathBuf::from(format!("/Volumes/{}", target_share)),
        PathBuf::from(format!("/mnt/{}", target_share)),
        PathBuf::from(format!("/media/{}", target_share)),
    ];

    for path in candidate_paths {
        if path.exists() {
            match fs::read_dir(&path) {
                Ok(read_dir) => {
                    let files: Vec<String> = read_dir
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .take(100)
                        .collect();

                    return Ok(VolumeMountInfo {
                        is_mounted: true,
                        mount_path: path.to_string_lossy().to_string(),
                        files,
                        permission_denied: false,
                        error_details: None,
                    });
                }
                Err(err) => {
                    let is_perm = err.kind() == std::io::ErrorKind::PermissionDenied;
                    return Ok(VolumeMountInfo {
                        is_mounted: true,
                        mount_path: path.to_string_lossy().to_string(),
                        files: Vec::new(),
                        permission_denied: is_perm,
                        error_details: Some(err.to_string()),
                    });
                }
            }
        }
    }

    Ok(VolumeMountInfo {
        is_mounted: false,
        mount_path: format!("/Volumes/{}", target_share),
        files: Vec::new(),
        permission_denied: false,
        error_details: Some(format!(
            "Share '{}' is not currently mounted in /Volumes or /mnt",
            target_share
        )),
    })
}

#[tauri::command]
async fn list_mounted_volumes() -> Result<Vec<String>, String> {
    let mut volumes = Vec::new();
    let volumes_path = Path::new("/Volumes");

    if volumes_path.exists() {
        if let Ok(entries) = fs::read_dir(volumes_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().to_string_lossy().to_string();
                if name != "Macintosh HD" && !name.starts_with('.') {
                    volumes.push(name);
                }
            }
        }
    }

    Ok(volumes)
}

#[tauri::command]
async fn probe_local_port(host: String, port: u16) -> Result<NetworkProbeResult, String> {
    let addr_str = format!("{}:{}", host, port);
    let start = Instant::now();

    let socket_addrs: Vec<SocketAddr> = match addr_str.to_socket_addrs() {
        Ok(addrs) => addrs.collect(),
        Err(err) => {
            return Ok(NetworkProbeResult {
                reachable: false,
                latency_ms: 0,
                message: format!("Failed to resolve hostname: {}", err),
            });
        }
    };

    if socket_addrs.is_empty() {
        return Ok(NetworkProbeResult {
            reachable: false,
            latency_ms: 0,
            message: "No socket address resolved".to_string(),
        });
    }

    let timeout = Duration::from_millis(2500);
    match TcpStream::connect_timeout(&socket_addrs[0], timeout) {
        Ok(_) => {
            let latency = start.elapsed().as_millis() as u64;
            Ok(NetworkProbeResult {
                reachable: true,
                latency_ms: latency,
                message: format!("Port {} is open and reachable ({}ms)", port, latency),
            })
        }
        Err(err) => {
            let latency = start.elapsed().as_millis() as u64;
            Ok(NetworkProbeResult {
                reachable: false,
                latency_ms: latency,
                message: format!("Connection failed: {}", err),
            })
        }
    }
}

#[tauri::command]
async fn mount_samba_share(
    server: Option<String>,
    host: Option<String>,
    share: String,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    guest: Option<bool>,
    is_guest: Option<bool>,
    isGuest: Option<bool>,
) -> Result<MountActionResult, String> {
    let srv = server.or(host).unwrap_or_else(|| "127.0.0.1".to_string());
    let is_g = is_guest.or(isGuest).or(guest).unwrap_or(false);
    let port_num = port.unwrap_or(445);

    let smb_url = if is_g || username.as_deref().unwrap_or("").is_empty() {
        if port_num == 445 {
            format!("smb://{}/{}", srv, share)
        } else {
            format!("smb://{}:{}/{}", srv, port_num, share)
        }
    } else if let Some(pass) = password.filter(|p| !p.is_empty()) {
        if port_num == 445 {
            format!("smb://{}:{}@{}/{}", username.unwrap_or_default(), pass, srv, share)
        } else {
            format!("smb://{}:{}@{}:{}/{}", username.unwrap_or_default(), pass, srv, port_num, share)
        }
    } else {
        if port_num == 445 {
            format!("smb://{}@{}/{}", username.unwrap_or_default(), srv, share)
        } else {
            format!("smb://{}@{}:{}/{}", username.unwrap_or_default(), srv, port_num, share)
        }
    };

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("open").arg(&smb_url).output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                if out.status.success() {
                    Ok(MountActionResult {
                        success: true,
                        message: format!("Initiated macOS Finder mount for {}", smb_url),
                        stdout: Some(stdout),
                        stderr: Some(stderr),
                    })
                } else {
                    Ok(MountActionResult {
                        success: false,
                        message: format!("Mount command exited with code {:?}", out.status.code()),
                        stdout: Some(stdout),
                        stderr: Some(stderr),
                    })
                }
            }
            Err(e) => Ok(MountActionResult {
                success: false,
                message: format!("Failed to spawn macOS open command: {}", e),
                stdout: None,
                stderr: None,
            }),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(MountActionResult {
            success: true,
            message: format!("Mount command constructed for {}", smb_url),
            stdout: None,
            stderr: None,
        })
    }
}

#[tauri::command]
async fn scan_samba_volume(
    window: tauri::Window,
    share_name: Option<String>,
    shareName: Option<String>,
    custom_path: Option<String>,
    customPath: Option<String>,
    extensions: Option<Vec<String>>,
    safe_scan: Option<bool>,
    safeScan: Option<bool>,
    max_depth: Option<usize>,
    maxDepth: Option<usize>,
) -> Result<ScanVolumeResult, String> {
    let target_share = share_name.or(shareName).unwrap_or_default();
    let default_mount = format!("/Volumes/{}", target_share);
    let resolved_raw = custom_path.or(customPath).unwrap_or(default_mount);
    let resolved_path = resolve_absolute_samba_path(&resolved_raw);

    if !resolved_path.exists() {
        return Ok(ScanVolumeResult {
            success: false,
            mount_path: resolved_path.to_string_lossy().to_string(),
            items: Vec::new(),
            total_scanned: 0,
            error: Some(format!("Volume or path is not mounted: {}", resolved_path.display())),
        });
    }

    let is_safe = safe_scan.or(safeScan).unwrap_or(false);
    let depth_limit = max_depth.or(maxDepth).unwrap_or(if is_safe { 12 } else { 30 });
    let max_scan_items = if is_safe { 50000 } else { 500000 };

    let allowed_exts: Option<HashSet<String>> = extensions.map(|exts| {
        exts.into_iter()
            .map(|e| e.to_lowercase().trim_start_matches('.').to_string())
            .collect()
    });

    let debug_enabled = std::env::var("RUST_LOG").map(|v| v == "debug" || v == "trace").unwrap_or(false)
        || std::env::var("DEBUG_WALK").map(|v| v == "1" || v == "true").unwrap_or(false);

    let mut items = Vec::new();
    let mut scanned_count = 0;
    let mut permission_denied_count = 0;
    let mut first_permission_denied_path = String::new();

    let walker = WalkDir::new(&resolved_path)
        .follow_links(true)
        .max_depth(depth_limit)
        .into_iter();
    for entry_res in walker {
        if scanned_count >= max_scan_items {
            if debug_enabled {
                eprintln!("[WalkDir Debug] Reached max scan limit of {} items. Stopping scan.", max_scan_items);
            }
            break;
        }

        let entry = match entry_res {
            Ok(e) => e,
            Err(err) => {
                if err.io_error().map_or(false, |io_err| io_err.kind() == std::io::ErrorKind::PermissionDenied) {
                    permission_denied_count += 1;
                    let p = err.path().unwrap_or(std::path::Path::new("unknown")).to_string_lossy().to_string();
                    if first_permission_denied_path.is_empty() {
                        first_permission_denied_path = p.clone();
                    }
                    eprintln!("[Scanner] [Permission Denied] Path: {:?} | Error: {:?}", p, err);
                } else if debug_enabled {
                    eprintln!("[WalkDir Error] Path: {:?} | Error: {:?}", err.path(), err);
                }
                continue;
            }
        };

        let entry_path = entry.path();
        if entry_path == resolved_path {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(err) => {
                if debug_enabled {
                    eprintln!("[WalkDir Metadata Error] Path: {:?} | Error: {:?}", entry_path, err);
                }
                continue;
            }
        };

        let is_dir = metadata.is_dir();
        let raw_name = entry.file_name().to_string_lossy().to_string();
        let name = sanitize_filename(&raw_name);

        if !is_dir {
            if let Some(exts) = &allowed_exts {
                let ext = entry_path
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if !exts.contains(&ext) {
                    continue;
                }
            }
        }

        let full_path_str = entry_path.to_string_lossy().to_string();
        let raw_rel = match entry_path.strip_prefix(&resolved_path) {
            Ok(p) => p.to_string_lossy().to_string().replace('\\', "/"),
            Err(_) => {
                let entry_str = full_path_str.replace('\\', "/");
                let res_str = resolved_path.to_string_lossy().replace('\\', "/");
                if entry_str.starts_with(&res_str) {
                    entry_str[res_str.len()..].trim_start_matches('/').to_string()
                } else {
                    sanitize_samba_path(&entry_str)
                }
            }
        };
        let rel_path = sanitize_samba_path(&raw_rel);

        let size = if is_dir { 0 } else { metadata.len() };
        scanned_count += 1;

        if scanned_count % 50 == 0 || scanned_count == 1 {
            let _ = window.emit(
                "scan-progress",
                ScanProgressEvent {
                    scanned_count,
                    current_file: format!("[Scanner] {}", rel_path),
                    current_path: full_path_str.clone(),
                    is_dir: false, // scan_samba_volume current ScanProgressEvent is simpler
                    items: Vec::new(),
                },
            );
        }

        items.push(ScannedFileItem {
            name,
            path: full_path_str,
            rel_path,
            size,
            is_dir,
        });
    }

    if items.is_empty() && permission_denied_count > 0 {
        let blocked_path = if !first_permission_denied_path.is_empty() {
            first_permission_denied_path
        } else {
            resolved_path.to_string_lossy().to_string()
        };
        return Ok(ScanVolumeResult {
            success: false,
            mount_path: resolved_path.to_string_lossy().to_string(),
            items: Vec::new(),
            total_scanned: 0,
            error: Some(format!(
                "macOS privacy/TCC blocked filesystem access to '{}' ({} permission barriers encountered). Please grant Full Disk Access to SambaVault in System Settings > Privacy & Security > Full Disk Access.",
                blocked_path,
                permission_denied_count
            )),
        });
    }

    let total = items.len();
    Ok(ScanVolumeResult {
        success: true,
        mount_path: resolved_path.to_string_lossy().to_string(),
        items,
        total_scanned: total,
        error: None,
    })
}

#[tauri::command]
async fn open_in_system_player(
    file_path: Option<String>,
    filePath: Option<String>,
) -> Result<String, String> {
    let target = file_path.or(filePath).unwrap_or_default();
    #[cfg(target_os = "macos")]
    let res = Command::new("open").arg(&target).spawn();
    #[cfg(target_os = "windows")]
    let res = Command::new("cmd").args(["/C", "start", "", &target]).spawn();
    #[cfg(target_os = "linux")]
    let res = Command::new("xdg-open").arg(&target).spawn();

    match res {
        Ok(_) => Ok(format!("Opened file in system player: {}", target)),
        Err(e) => Err(format!("Failed to open system player: {}", e)),
    }
}

#[tauri::command]
async fn open_in_vlc(
    file_path: Option<String>,
    filePath: Option<String>,
) -> Result<String, String> {
    let raw = file_path.or(filePath).unwrap_or_default();
    let mut target = raw.trim().to_string();
    if target.starts_with("file://") {
        target = target.trim_start_matches("file://").to_string();
    }
    // Sanitize URL-encoded %20 to regular space
    target = target.replace("%20", " ");

    #[cfg(target_os = "macos")]
    let res = Command::new("/Applications/VLC.app/Contents/MacOS/VLC")
        .arg(&target)
        .spawn()
        .or_else(|_| Command::new("open").args(["-a", "VLC", &target]).spawn())
        .or_else(|_| Command::new("vlc").arg(&target).spawn());

    #[cfg(target_os = "windows")]
    let res = Command::new("vlc").arg(&target).spawn();

    #[cfg(target_os = "linux")]
    let res = Command::new("vlc").arg(&target).spawn();

    match res {
        Ok(_) => Ok("Opened in VLC".to_string()),
        Err(e) => Err(format!("Failed to launch VLC: {}", e)),
    }
}

#[tauri::command]
async fn open_in_iina(
    file_path: Option<String>,
    filePath: Option<String>,
) -> Result<String, String> {
    let raw = file_path.or(filePath).unwrap_or_default();
    let mut target = raw.trim().to_string();
    if target.starts_with("file://") {
        target = target.trim_start_matches("file://").to_string();
    }
    // Sanitize URL-encoded %20 to regular space
    target = target.replace("%20", " ");

    #[cfg(target_os = "macos")]
    let res = Command::new("open").args(["-a", "IINA", &target]).spawn();

    #[cfg(not(target_os = "macos"))]
    let res: Result<std::process::Child, std::io::Error> = Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "IINA is macOS only",
    ));

    match res {
        Ok(_) => Ok("Opened in IINA".to_string()),
        Err(e) => Err(format!("Failed to launch IINA: {}", e)),
    }
}

#[derive(serde::Serialize)]
struct PathCheckResult {
    exists: bool,
    is_directory: bool,
    file_count: usize,
    readable: bool,
    writable: bool,
    resolved_path: String,
    error_code: Option<String>,
}

#[tauri::command]
async fn check_path_exists(path: String) -> Result<PathCheckResult, String> {
    let p = resolve_absolute_samba_path(&path);
    let exists = p.exists();
    let mut is_directory = false;
    let mut file_count = 0;
    let mut readable = false;
    let mut writable = false;
    let mut error_code = None;

    if exists {
        is_directory = p.is_dir();

        // Check read
        if is_directory {
            match fs::read_dir(&p) {
                Ok(read_dir) => {
                    readable = true;
                    file_count = read_dir.filter_map(|e| e.ok()).count();
                }
                Err(e) => {
                    error_code = Some(e.to_string());
                }
            }
        } else {
            match fs::File::open(&p) {
                Ok(_) => {
                    readable = true;
                }
                Err(e) => {
                    error_code = Some(e.to_string());
                }
            }
        }

        // Check write
        if readable {
            if is_directory {
                let test_file = p.join(".samba_vault_write_test");
                match fs::OpenOptions::new().write(true).create(true).open(&test_file) {
                    Ok(_) => {
                        writable = true;
                        let _ = fs::remove_file(test_file);
                    }
                    Err(_) => {
                        writable = false;
                    }
                }
            } else {
                match fs::OpenOptions::new().write(true).open(&p) {
                    Ok(_) => {
                        writable = true;
                    }
                    Err(_) => {
                        writable = false;
                    }
                }
            }
        }
    }

    Ok(PathCheckResult {
        exists,
        is_directory,
        file_count,
        readable,
        writable,
        resolved_path: p.to_string_lossy().to_string(),
        error_code,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
async fn checkPathExists(path: String) -> Result<PathCheckResult, String> {
    check_path_exists(path).await
}

#[tauri::command]
async fn fix_path_permissions(path: String, username: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut logs = Vec::new();
    logs.push(format!("Attempting to fix permissions on: {}", path));

    #[cfg(not(target_os = "windows"))]
    {
        // Try to run chmod -R 755
        match std::process::Command::new("chmod")
            .args(["-R", "755", &path])
            .output() {
                Ok(output) => {
                    if output.status.success() {
                        logs.push("[chmod] Successfully updated permissions to 755.".to_string());
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        logs.push(format!("[chmod] Warning: {}", stderr));
                    }
                }
                Err(e) => {
                    logs.push(format!("[chmod] Error: {}", e));
                }
            }

        // Try to run chown to the active username
        if !username.is_empty() {
            match std::process::Command::new("chown")
                .args(["-R", &username, &path])
                .output() {
                    Ok(output) => {
                        if output.status.success() {
                            logs.push(format!("[chown] Successfully set owner to {}.", username));
                        } else {
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            logs.push(format!("[chown] Warning: {}", stderr));
                        }
                    }
                    Err(e) => {
                        logs.push(format!("[chown] Error: {}", e));
                    }
                }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Try to take ownership or grant permissions using icacls
        match std::process::Command::new("icacls")
            .args([&path, "/grant", "Everyone:(OI)(CI)F", "/T"])
            .output() {
                Ok(output) => {
                    if output.status.success() {
                        logs.push("[icacls] Successfully granted Full Control to Everyone.".to_string());
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        logs.push(format!("[icacls] Warning: {}", stderr));
                    }
                }
                Err(e) => {
                    logs.push(format!("[icacls] Error: {}", e));
                }
            }
    }

    Ok(logs.join("\n"))
}

#[tauri::command]
async fn run_samba_diagnostic(host: String, share: String) -> Result<String, String> {
    let mut logs = Vec::new();
    logs.push(format!("-- SambaVault Native Network Diagnostics for //{}/{} --", host, share));

    // 1. Resolve IP via DNS natively
    logs.push(format!("[DNS] Attempting native hostname resolution for '{}'...", host));
    let resolved_addr = format!("{}:445", host);
    match std::net::ToSocketAddrs::to_socket_addrs(&resolved_addr) {
        Ok(addrs) => {
            let list: Vec<String> = addrs.map(|a| a.ip().to_string()).collect();
            if list.is_empty() {
                logs.push("[DNS] [WARN] Resolved address list is empty.".to_string());
            } else {
                logs.push(format!("[DNS] [SUCCESS] Resolved IPs: {:?}", list));
            }
        }
        Err(e) => {
            logs.push(format!("[DNS] [FAIL] DNS resolution failed: {}", e));
        }
    }

    // 2. Perform a TCP connection test to port 445
    logs.push("[Socket] Attempting TCP socket connection on port 445 (SMB)...".to_string());
    if let Ok(mut addrs) = std::net::ToSocketAddrs::to_socket_addrs(&resolved_addr) {
        if let Some(addr) = addrs.next() {
            match std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(2)) {
                Ok(_) => {
                    logs.push(format!("[Socket] [SUCCESS] Connected successfully to {}", addr));
                }
                Err(e) => {
                    logs.push(format!("[Socket] [FAIL] Connection failed: {}", e));
                }
            }
        } else {
            logs.push("[Socket] [FAIL] No address could be resolved.".to_string());
        }
    } else {
        logs.push("[Socket] [FAIL] Invalid host/port combination.".to_string());
    }

    // 3. Try execution of ping for latency estimation
    #[cfg(target_os = "macos")]
    {
        logs.push("[System] Running ping to measure latency...".to_string());
        if let Ok(output) = Command::new("ping").args(["-c", "3", "-t", "2", &host]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if !stdout.is_empty() {
                logs.push(format!("[Ping Output]\n{}", stdout));
            } else {
                logs.push("[Ping] No output returned.".to_string());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        logs.push("[System] Running ping to measure latency...".to_string());
        if let Ok(output) = Command::new("ping").args(["-n", "3", "-w", "2000", &host]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if !stdout.is_empty() {
                logs.push(format!("[Ping Output]\n{}", stdout));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        logs.push("[System] Running ping to measure latency...".to_string());
        if let Ok(output) = Command::new("ping").args(["-c", "3", "-W", "2", &host]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if !stdout.is_empty() {
                logs.push(format!("[Ping Output]\n{}", stdout));
            }
        }
    }

    Ok(logs.join("\n"))
}

static NEXT_TRANSCODE_ID: AtomicU64 = AtomicU64::new(0);

fn locate_ffmpeg() -> Result<FfmpegLocator, String> {
    let ffmpeg_name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let ffprobe_name = if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" };

    if let Some(ffmpeg_path) = std::env::var_os("FFMPEG_PATH").map(PathBuf::from) {
        let ffprobe_path = ffmpeg_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(ffprobe_name);
        if ffmpeg_path.is_file() && ffprobe_path.is_file() {
            return FfmpegLocator::with_paths(ffmpeg_path, ffprobe_path)
                .map_err(|error| error.to_string());
        }
    }

    if let Ok(locator) = FfmpegLocator::system() {
        return Ok(locator);
    }

    let mut search_dirs = std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();
    #[cfg(target_os = "macos")]
    search_dirs.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/local/bin"),
    ]);
    #[cfg(target_os = "linux")]
    search_dirs.extend([PathBuf::from("/usr/bin"), PathBuf::from("/usr/local/bin")]);

    for directory in search_dirs {
        let ffmpeg_path = directory.join(ffmpeg_name);
        let ffprobe_path = directory.join(ffprobe_name);
        if ffmpeg_path.is_file() && ffprobe_path.is_file() {
            return FfmpegLocator::with_paths(ffmpeg_path, ffprobe_path)
                .map_err(|error| error.to_string());
        }
    }

    Err("FFmpeg and ffprobe were not found. Install FFmpeg or configure FFMPEG_PATH.".to_string())
}

#[tauri::command]
async fn probe_media_file(source_path: String) -> Result<String, String> {
    let source_path = PathBuf::from(&source_path)
        .canonicalize()
        .map_err(|error| format!("Could not access the media file: {}", error))?;
    if !source_path.is_file() {
        return Err("The selected media source is not a file.".to_string());
    }

    let locator = locate_ffmpeg()?;
    let ffprobe_path = locator.ffprobe();
    
    let output = Command::new(ffprobe_path)
        .args([
            "-v", "error",
            "-show_format",
            "-show_streams",
            "-of", "json",
            &source_path.to_string_lossy()
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("FFprobe failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

#[tauri::command]
async fn transcode_media_file(source_path: String, media_type: String) -> Result<String, String> {
    let is_url = source_path.starts_with("http://") || source_path.starts_with("https://");
    
    let source_path_buf = if is_url {
        PathBuf::from(&source_path) // Just pass as string
    } else {
        PathBuf::from(&source_path)
            .canonicalize()
            .map_err(|error| format!("Could not access the media file: {}", error))?
    };

    if !is_url && !source_path_buf.is_file() {
        return Err("The selected media source is not a file.".to_string());
    }

    let is_audio = match media_type.as_str() {
        "audio" => true,
        "video" => false,
        _ => return Err("Unsupported media type for transcoding.".to_string()),
    };
    let output_extension = if is_audio { "m4a" } else { "mp4" };
    let transcode_id = NEXT_TRANSCODE_ID.fetch_add(1, Ordering::Relaxed);
    let output_path = std::env::temp_dir().join(format!(
        "sambavault-transcode-{}-{}.{}",
        std::process::id(),
        transcode_id,
        output_extension
    ));
    let task_output_path = output_path.clone();
    let task_source_path = source_path.clone();

    tokio::task::spawn_blocking(move || {
        let locator = locate_ffmpeg()?;
        let mut builder = TranscodeBuilder::new()
            .with_locator(&locator)
            .input(&task_source_path)
            .output(&task_output_path)
            .audio_codec("aac")
            .audio_bitrate(192)
            .extra_arg("-map")
            .extra_arg(if is_audio { "0:a:0" } else { "0:v:0" })
            .extra_arg("-ac")
            .extra_arg("2");

        if is_audio {
            builder = builder.extra_arg("-vn");
        } else {
            builder = builder
                .video_codec("libx264")
                .preset("veryfast")
                .extra_arg("-crf")
                .extra_arg("23")
                .extra_arg("-pix_fmt")
                .extra_arg("yuv420p")
                .extra_arg("-map")
                .extra_arg("0:a:0?")
                .extra_arg("-sn")
                .extra_arg("-dn")
                .extra_arg("-movflags")
                .extra_arg("+faststart");
        }

        match builder.run() {
            Ok(()) => Ok(()),
            Err(error) => {
                let _ = fs::remove_file(&task_output_path);
                Err(format!("FFmpeg transcoding failed: {}", error))
            }
        }
    })
    .await
    .map_err(|error| format!("Transcoding task failed: {}", error))??;

    Ok(output_path.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Err(e) = db::init_db(&app.handle()) {
                eprintln!("[SambaVault] Failed to initialize SQLite database: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            perform_fast_scan,
            scan_samba_volume,
            check_volume_mounted,
            list_mounted_volumes,
            probe_local_port,
            mount_samba_share,
            open_in_system_player,
            open_in_vlc,
            open_in_iina,
            check_path_exists,
            checkPathExists,
            vault_save_state,
            vault_get_state,
            cleanup_transcoded_file,
            vault_purge_transcode_cache,
            fix_path_permissions,
            run_samba_diagnostic,
            macos_permissions::check_full_disk_access,
            macos_permissions::open_macos_security_privacy,
            macos_permissions::request_full_disk_access_and_register,
            db::get_all_media,
            db::save_media,
            db::save_media_batch,
            db::get_vault_state,
            db::save_vault_state,
            db::update_watch_progress,
            db::reset_database,
            ai::generate_synopsis,
            macos_permissions::diagnostic_check_full_disk_access,
            macos_permissions::check_tcc_access,
            scan_and_import_volumes,
            transcode_media_file,
            probe_media_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
