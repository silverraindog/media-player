use ffmpeg_light::config::FfmpegLocator;
use ffmpeg_light::TranscodeBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

mod ai;
mod db;
mod vlc_player;
pub mod scanner;

struct BackendProcess(Mutex<Option<Child>>);

fn wait_for_backend(child: &mut Child) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], 3000));
    let deadline = Instant::now() + Duration::from_secs(20);

    while Instant::now() < deadline {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            return Err(format!("Backend process exited during startup: {}", status));
        }

        // Check for health endpoint BEFORE waiting another interval
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) {
            stream.set_read_timeout(Some(Duration::from_secs(1)));

            let mut response = String::new();
            if stream.write_all(b"GET /api/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").is_err() {
                continue;
            }

            match stream.read_line(&mut response) {
                Ok(_) => {
                    // Check for success and that process didn't exit
                    if (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
                        && child.try_wait().is_ok() {
                        return Ok(());
                    }
                }
                Err(_) => {}
            }
        }

        thread::sleep(Duration::from_millis(200));
    }

    Err("Backend did not become healthy on http://127.0.0.1:3000 within 20 seconds".to_string())
}

fn start_packaged_backend(app: &tauri::App) -> Result<Child, Box<dyn std::error::Error>> {
    let runtime_dir = app
        .path_resolver()
        .resource_dir()
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Packaged backend resources were not found",
            )
        })?;
    let runtime_dir = runtime_dir.join("backend-runtime");
    let node_path = runtime_dir.join(if cfg!(windows) { "node.exe" } else { "node" });
    let server_path = runtime_dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
    let ffprobe_path = runtime_dir.join(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" });

    for required_path in &[&node_path, &server_path, &ffmpeg_path, &ffprobe_path] {
        if !required_path.is_file() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Required packaged backend file is missing: {}", required_path.display()),
            )
            .into());
        }
    }

    let mut child = Command::new(&node_path)
        .arg(&server_path)
        .current_dir(&runtime_dir)
        .env("NODE_ENV", "production")
        .env("HOST", "127.0.0.1")
        .env("PORT", "3000")
        .env("FFMPEG_PATH", &ffmpeg_path)
        .env("FFPROBE_PATH", &ffprobe_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().flatten() {
                eprintln!("[SambaVault backend] {}", line);
            }
        });
    }

    let stdout_read = thread::spawn(move || -> io::Result<()> {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(child.stdout.take().unwrap_or_else(|| std::process::Stdio::null(),)).lines().flatten() {
            eprintln!("[SambaVault backend] {}", line);
        }
        Ok(())
    });

    let stderr_read = thread::spawn(move || -> io::Result<()> {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(child.stderr.take().unwrap_or_else(|| std::process::Stdio::null(),)).lines().flatten() {
            eprintln!("[SambaVault backend] {}", line);
        }
        Ok(())
    });

    let stdout_handle = stdout_read.handle().map_err(|e| e.to_string());
    let stderr_handle = stderr_read.handle().map_err(|e| e.to_string());

    match (stdout_handle, stderr_handle) {
        (Ok(_), Ok(_)) => {}
        (Err(e), _) => return Err(format!("[SambaVault] Stdout read error: {}", e)),
        (_, Err(e)) => return Err(format!("[SambaVault] Stderr read error: {}", e)),
        (Ok(_), Err(e)) => return Err(format!("[SambaVault] Stderr read error: {}", e)),
    }

    // Wait for child to finish
    let mut result = Ok(());
    if let Some(status) = child.wait() {
        if status.success() {
            result = Ok(());
        } else {
            result = Err(format!("[SambaVault] Backend exited with status: {}", status));
        }
    }

    if !result.is_ok() {
        return Err(result.unwrap());
    }

    Ok(())
}

fn transcode_media_file(input_path: &str, output_path: &str) -> Result<io::Result<()>, Box<dyn std::error::Error>> {
    let ffmpeg_path = resolve_ffmpeg_path();
    let ffprobe_path = resolve_ffprobe_path();
    
    let mut child = Command::new(&ffmpeg_path)
        .arg("-i")
        .arg(input_path)
        .arg("-y")
        .arg("-c:v")
        .arg("libx264")
        .arg("-crf")
        .arg("23")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-movflags")
        .arg("+faststart")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    let output = child.wait().map_err(|e| format!("[SambaVault] Transcoding failed: {}", e))?;

    if !output {
        Err(std::io::Error::new(std::io::ErrorKind::Other, "Transcode was cancelled")).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

fn resolve_ffmpeg_path() -> String {
    if process.env.FFMPEG_PATH.is_some() {
        let path = process.env.FFMPEG_PATH.clone().unwrap();
        if fs::exists(&path) {
            return path;
        }
    }
    let candidates = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/opt/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/bin/ffmpeg",
    ];
    for cand in candidates {
        if fs::exists(cand) {
            return cand;
        }
    }
    process.env.FFMPEG_PATH.unwrap_or("ffmpeg")
}

fn resolve_ffprobe_path() -> String {
    if process.env.FFPROBE_PATH.is_some() {
        let path = process.env.FFPROBE_PATH.clone().unwrap();
        if fs::exists(&path) {
            return path;
        }
    }
    let candidates = [
        "/opt/homebrew/bin/ffprobe",
        "/usr/local/bin/ffprobe",
        "/opt/local/bin/ffprobe",
        "/usr/bin/ffprobe",
        "/bin/ffprobe",
    ];
    for cand in candidates {
        if fs::exists(cand) {
            return cand;
        }
    }
    process.env.FFPROBE_PATH.unwrap_or("ffprobe")
}

fn main() {
    let app = tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .manage(vlc_player::VlcPlayerState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                Ok(());
            } else {
                let backend = start_packaged_backend(app)?;
                *app.state::<BackendProcess>().0.lock().unwrap() = Some(backend);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vlc_player::vlc_available,
            vlc_player::vlc_open,
            vlc_player::vlc_set_rect,
            vlc_player::vlc_status,
            vlc_player::vlc_control,
            vlc_player::vlc_stop,
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
            check_path_integrity,
            check_path_metadata,
            resolve_path_verbose,
            debug_path_resolution,
            find_episode_media_file,
            vault_save_state,
            vault_get_state,
            cleanup_transcoded_file,
            vault_purge_transcode_cache,
            fix_path_permissions,
            run_samba_diagnostic,
            macos_permissions::check_full_disk_access,
            macos_permissions::verify_full_disk_access_preflight,
            macos_permissions::open_macos_security_privacy,
            macos_permissions::request_full_disk_access_and_register,
            ai::generate_synopsis,
            macos_permissions::diagnostic_check_full_disk_access,
            macos_permissions::check_tcc_access,
            scan_and_import_volumes,
            transcode_media_file,
            probe_media_file,
            check_ffmpeg_codecs,
            set_custom_ffmpeg_path,
            get_detected_ffmpeg_path,
            validate_ffmpeg_sidecar,
            check_bundled_ffmpeg,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<BackendProcess>();
            let mut child = state.0.lock().unwrap();
            if let Some(backend) = child.as_mut() {
                let _ = backend.kill();
                let _ = backend.wait();
            }
        }
    });
}
