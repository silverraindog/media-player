#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::process::Command;
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug)]
pub struct VolumeMountInfo {
    pub is_mounted: bool,
    pub mount_path: String,
    pub files: Vec<String>,
    pub permission_denied: bool,
    pub error_details: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct NetworkProbeResult {
    pub reachable: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MountCommandResult {
    pub success: bool,
    pub message: String,
    pub stdout: String,
    pub stderr: String,
}

// Recursively inspects /Volumes subdirectories and checks if share exists as a mount point
#[tauri::command]
fn check_volume_mounted(share_name: String) -> VolumeMountInfo {
    let clean_share = share_name.trim_start_matches('/').trim_end_matches('/');
    let target_name = clean_share.to_lowercase();
    let volumes_path = Path::new("/Volumes");

    if !volumes_path.exists() {
        return VolumeMountInfo {
            is_mounted: false,
            mount_path: format!("/Volumes/{}", clean_share),
            files: Vec::new(),
            permission_denied: false,
            error_details: Some("/Volumes directory does not exist on this OS".to_string()),
        };
    }

    // Attempt to read /Volumes directory
    let entries = match fs::read_dir(volumes_path) {
        Ok(e) => e,
        Err(err) => {
            let is_perm = err.kind() == std::io::ErrorKind::PermissionDenied;
            return VolumeMountInfo {
                is_mounted: false,
                mount_path: format!("/Volumes/{}", clean_share),
                files: Vec::new(),
                permission_denied: is_perm,
                error_details: Some(format!("Failed to read /Volumes (PermissionDenied: {}): {}", is_perm, err)),
            };
        }
    };

    let mut found_path: Option<String> = None;
    let mut permission_denied = false;
    let mut error_details = None;

    for entry in entries.flatten() {
        if let Ok(file_type) = entry.file_type() {
            if file_type.is_dir() || file_type.is_symlink() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.to_lowercase() == target_name {
                    found_path = Some(entry.path().to_string_lossy().to_string());
                    break;
                }
            }
        }
    }

    if let Some(ref mount_path) = found_path {
        let mut files = Vec::new();
        match fs::read_dir(mount_path) {
            Ok(sub_entries) => {
                for sub in sub_entries.flatten().take(50) {
                    if let Ok(name) = sub.file_name().into_string() {
                        if !name.starts_with('.') {
                            files.push(name);
                        }
                    }
                }
            }
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    permission_denied = true;
                }
                error_details = Some(format!("Error reading volume contents at {}: {}", mount_path, e));
            }
        }

        VolumeMountInfo {
            is_mounted: true,
            mount_path: mount_path.clone(),
            files,
            permission_denied,
            error_details,
        }
    } else {
        VolumeMountInfo {
            is_mounted: false,
            mount_path: format!("/Volumes/{}", clean_share),
            files: Vec::new(),
            permission_denied,
            error_details: Some(format!("Share '{}' not currently found in /Volumes", clean_share)),
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ScannedShareItem {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
    pub size_str: Option<String>,
    pub extension: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ScanVolumeResult {
    pub success: bool,
    pub mount_path: String,
    pub items: Vec<ScannedShareItem>,
    pub total_scanned: usize,
    pub error: Option<String>,
}

fn scan_dir_recursive(
    root: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    items: &mut Vec<ScannedShareItem>,
    limit: usize,
) {
    if depth > max_depth || items.len() >= limit {
        return;
    }

    if let Ok(entries) = fs::read_dir(current) {
        for entry in entries.flatten() {
            if items.len() >= limit {
                break;
            }
            if let Ok(name) = entry.file_name().into_string() {
                if name.starts_with('.') || name.starts_with('$') || name == "System Volume Information" {
                    continue;
                }

                let path = entry.path();
                let is_dir = path.is_dir();
                let rel_path = path.strip_prefix(root)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| name.clone());

                let (size_str, ext) = if !is_dir {
                    let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    let size_formatted = if len > 1024 * 1024 * 1024 {
                        format!("{:.1} GB", len as f64 / (1024.0 * 1024.0 * 1024.0))
                    } else if len > 1024 * 1024 {
                        format!("{:.1} MB", len as f64 / (1024.0 * 1024.0))
                    } else if len > 1024 {
                        format!("{:.0} KB", len as f64 / 1024.0)
                    } else {
                        format!("{} B", len)
                    };
                    let e = path.extension().map(|s| s.to_string_lossy().to_lowercase());
                    (Some(size_formatted), e)
                } else {
                    (None, None)
                };

                items.push(ScannedShareItem {
                    name,
                    rel_path,
                    is_dir,
                    size_str,
                    extension: ext,
                });

                if is_dir {
                    scan_dir_recursive(root, &path, depth + 1, max_depth, items, limit);
                }
            }
        }
    }
}

#[tauri::command]
fn scan_samba_volume(share_name: String, custom_path: Option<String>) -> ScanVolumeResult {
    let clean_share = share_name.trim_start_matches('/').trim_end_matches('/');
    let base_path = if let Some(cp) = custom_path {
        if !cp.is_empty() {
            Path::new(&cp).to_path_buf()
        } else {
            Path::new("/Volumes").join(clean_share)
        }
    } else {
        #[cfg(target_os = "macos")]
        {
            Path::new("/Volumes").join(clean_share)
        }
        #[cfg(target_os = "linux")]
        {
            let mnt_share = Path::new("/mnt").join(clean_share);
            if mnt_share.exists() {
                mnt_share
            } else {
                Path::new("/Volumes").join(clean_share)
            }
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            Path::new("/Volumes").join(clean_share)
        }
    };

    if !base_path.exists() {
        return ScanVolumeResult {
            success: false,
            mount_path: base_path.to_string_lossy().to_string(),
            items: Vec::new(),
            total_scanned: 0,
            error: Some(format!(
                "Mount path '{}' does not exist. Ensure the share is mounted first.",
                base_path.display()
            )),
        };
    }

    let mut items = Vec::new();
    scan_dir_recursive(&base_path, &base_path, 0, 10, &mut items, 10000);
    let total = items.len();

    ScanVolumeResult {
        success: true,
        mount_path: base_path.to_string_lossy().to_string(),
        items,
        total_scanned: total,
        error: None,
    }
}

#[tauri::command]
fn list_mounted_volumes() -> Vec<String> {
    let mut volumes = Vec::new();
    let volumes_path = Path::new("/Volumes");
    if volumes_path.exists() && volumes_path.is_dir() {
        if let Ok(entries) = fs::read_dir(volumes_path) {
            for entry in entries.flatten() {
                if let Ok(name) = entry.file_name().into_string() {
                    if !name.starts_with('.') {
                        volumes.push(name);
                    }
                }
            }
        }
    }
    volumes
}

#[tauri::command]
fn mount_samba_share(
    server: String,
    share: String,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    is_guest: Option<bool>,
) -> MountCommandResult {
    let target_port = port.unwrap_or(445);
    let guest_mode = is_guest.unwrap_or(false);
    let user = username.unwrap_or_default();
    let pass = password.unwrap_or_default();

    #[cfg(target_os = "macos")]
    {
        let port_str = if target_port != 445 {
            format!(":{}", target_port)
        } else {
            String::new()
        };

        // Construct smb URL
        let smb_url = if guest_mode || user.is_empty() {
            format!("smb://{}{}/{}", server, port_str, share)
        } else {
            format!("smb://{}:{}@{}{}/{}", user, pass, server, port_str, share)
        };

        // First attempt standard macOS open command which invokes Finder network mount
        let open_output = Command::new("open").arg(&smb_url).output();

        match open_output {
            Ok(output) if output.status.success() => MountCommandResult {
                success: true,
                message: format!("Triggered macOS Finder mount for {}", smb_url),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            },
            Ok(output) => {
                // If open failed, attempt mount_smbfs
                let mountpoint = format!("/Volumes/{}", share);
                let _ = std::fs::create_dir_all(&mountpoint);
                let mount_spec = if guest_mode || user.is_empty() {
                    format!("//guest@{}{}/{}", server, port_str, share)
                } else {
                    format!("//{}:{}@{}{}/{}", user, pass, server, port_str, share)
                };

                let smbfs_output = Command::new("mount_smbfs")
                    .arg(&mount_spec)
                    .arg(&mountpoint)
                    .output();

                match smbfs_output {
                    Ok(m_out) => MountCommandResult {
                        success: m_out.status.success(),
                        message: if m_out.status.success() {
                            format!("Successfully executed mount_smbfs to {}", mountpoint)
                        } else {
                            format!("mount_smbfs exited with code {:?}", m_out.status.code())
                        },
                        stdout: String::from_utf8_lossy(&m_out.stdout).to_string(),
                        stderr: String::from_utf8_lossy(&m_out.stderr).to_string(),
                    },
                    Err(e) => MountCommandResult {
                        success: false,
                        message: format!("Execution failed: {}", e),
                        stdout: String::new(),
                        stderr: e.to_string(),
                    },
                }
            }
            Err(e) => MountCommandResult {
                success: false,
                message: format!("Failed to run open or mount_smbfs: {}", e),
                stdout: String::new(),
                stderr: e.to_string(),
            },
        }
    }

    #[cfg(target_os = "linux")]
    {
        let mountpoint = format!("/mnt/{}", share);
        let _ = std::fs::create_dir_all(&mountpoint);
        let mut cmd = Command::new("mount");
        cmd.arg("-t").arg("cifs");
        cmd.arg(format!("//{}/{}", server, share));
        cmd.arg(&mountpoint);

        let options = if guest_mode {
            format!("guest,port={}", target_port)
        } else {
            format!("username={},password={},port={}", user, pass, target_port)
        };
        cmd.arg("-o").arg(options);

        match cmd.output() {
            Ok(output) => MountCommandResult {
                success: output.status.success(),
                message: if output.status.success() {
                    format!("Mounted to {}", mountpoint)
                } else {
                    "Linux mount failed. May require sudo / cifs-utils permissions.".to_string()
                },
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            },
            Err(e) => MountCommandResult {
                success: false,
                message: format!("Error executing mount: {}", e),
                stdout: String::new(),
                stderr: e.to_string(),
            },
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = target_port;
        let remote = format!("\\\\{}\\{}", server, share);
        let mut cmd = Command::new("net");
        cmd.arg("use").arg("*").arg(&remote);
        if !guest_mode && !user.is_empty() {
            cmd.arg(&pass).arg(format!("/user:{}", user));
        }
        match cmd.output() {
            Ok(output) => MountCommandResult {
                success: output.status.success(),
                message: format!("Executed net use for {}", remote),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            },
            Err(e) => MountCommandResult {
                success: false,
                message: format!("Windows net use execution failed: {}", e),
                stdout: String::new(),
                stderr: e.to_string(),
            },
        }
    }
}

#[tauri::command]
fn probe_local_port(host: String, port: u16) -> NetworkProbeResult {
    let start = std::time::Instant::now();
    let target = format!("{}:{}", host, port);

    match target.to_socket_addrs() {
        Ok(mut addrs) => {
            if let Some(addr) = addrs.next() {
                match TcpStream::connect_timeout(&addr, Duration::from_millis(3000)) {
                    Ok(_) => {
                        let latency = start.elapsed().as_millis() as u64;
                        NetworkProbeResult {
                            reachable: true,
                            latency_ms: latency,
                            message: format!("Successfully reached {}:{} in {}ms", host, port, latency),
                        }
                    }
                    Err(e) => NetworkProbeResult {
                        reachable: false,
                        latency_ms: 0,
                        message: format!("Connection to {}:{} refused or timed out: {}", host, port, e),
                    },
                }
            } else {
                NetworkProbeResult {
                    reachable: false,
                    latency_ms: 0,
                    message: format!("Could not resolve IP address for {}", host),
                }
            }
        }
        Err(e) => NetworkProbeResult {
            reachable: false,
            latency_ms: 0,
            message: format!("Address resolution error for {}: {}", host, e),
        },
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_volume_mounted,
            list_mounted_volumes,
            probe_local_port,
            mount_samba_share,
            scan_samba_volume
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

