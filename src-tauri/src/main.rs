#![allow(unused_imports)]
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::Manager;
use walkdir::WalkDir;

mod ai;
mod db;

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

#[tauri::command]
async fn perform_fast_scan(
    window: tauri::Window,
    root_path: Option<String>,
    rootPath: Option<String>,
) -> Result<Vec<ScannedFileItem>, String> {
    let target = root_path.or(rootPath).unwrap_or_default();
    let path = Path::new(&target);
    if !path.exists() {
        return Err(format!("Root path does not exist: {}", target));
    }

    let mut items = Vec::new();
    let mut scanned_count = 0;

    let walker = WalkDir::new(path).follow_links(true).into_iter();

    for entry in walker.filter_map(|e| e.ok()) {
        let entry_path = entry.path();
        if entry_path == path {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();
        let full_path_str = entry_path.to_string_lossy().to_string();
        let rel_path = entry_path
            .strip_prefix(path)
            .unwrap_or(entry_path)
            .to_string_lossy()
            .to_string()
            .replace('\\', "/");

        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };

        scanned_count += 1;

        if scanned_count % 25 == 0 {
            let _ = window.emit(
                "scan-progress",
                ScanProgressEvent {
                    scanned_count,
                    current_file: name.clone(),
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

    Ok(items)
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
) -> Result<ScanVolumeResult, String> {
    let target_share = share_name.or(shareName).unwrap_or_default();
    let default_mount = format!("/Volumes/{}", target_share);
    let resolved_path = custom_path.or(customPath).unwrap_or(default_mount);
    let path = Path::new(&resolved_path);

    if !path.exists() {
        let err_msg = format!("Volume or path is not mounted: {}", path.display());
        return Ok(ScanVolumeResult {
            success: false,
            mount_path: resolved_path,
            items: Vec::new(),
            total_scanned: 0,
            error: Some(err_msg),
        });
    }

    let allowed_exts: Option<HashSet<String>> = extensions.map(|exts| {
        exts.into_iter()
            .map(|e| e.to_lowercase().trim_start_matches('.').to_string())
            .collect()
    });

    let mut items = Vec::new();
    let mut scanned_count = 0;

    let walker = WalkDir::new(path).follow_links(true).into_iter();
    for entry in walker.filter_map(|e| e.ok()) {
        let entry_path = entry.path();
        if entry_path == path {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let is_dir = metadata.is_dir();
        let name = entry.file_name().to_string_lossy().to_string();

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
        let rel_path = entry_path
            .strip_prefix(path)
            .unwrap_or(entry_path)
            .to_string_lossy()
            .to_string()
            .replace('\\', "/");

        let size = if is_dir { 0 } else { metadata.len() };
        scanned_count += 1;

        if scanned_count % 30 == 0 {
            let _ = window.emit(
                "scan-progress",
                ScanProgressEvent {
                    scanned_count,
                    current_file: name.clone(),
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

    let total = items.len();
    Ok(ScanVolumeResult {
        success: true,
        mount_path: resolved_path,
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
    let target = file_path.or(filePath).unwrap_or_default();
    #[cfg(target_os = "macos")]
    let res = Command::new("/Applications/VLC.app/Contents/MacOS/VLC")
        .arg(&target)
        .spawn()
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
    let target = file_path.or(filePath).unwrap_or_default();
    #[cfg(target_os = "macos")]
    let res = Command::new("open").args(["-a", "IINA", &target]).spawn();

    #[cfg(not(target_os = "macos"))]
    let res = Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "IINA is macOS only",
    ));

    match res {
        Ok(_) => Ok("Opened in IINA".to_string()),
        Err(e) => Err(format!("Failed to launch IINA: {}", e)),
    }
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
            db::get_all_media,
            db::save_media,
            db::update_watch_progress,
            ai::generate_synopsis,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
