use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

mod ai;
mod db;
mod vlc_player;
mod commands;

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
            let http_request = b"GET /api/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
            if stream.write_all(http_request).is_err() {
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
        .env("FFMPEG_PATH", std::env::var("FFMPEG_PATH").unwrap_or("ffmpeg"))
        .env("FFPROBE_PATH", std::env::var("FFPROBE_PATH").unwrap_or("ffprobe"))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let stdout_read = thread::spawn(move || -> std::io::Result<()> {
        let mut reader = BufReader::new(child.stdout.take().unwrap_or_else(|| std::process::Stdio::null(),));
        for line in reader.lines().flatten() {
            eprintln!("[SambaVault backend] {}", line);
        }
        Ok(())
    });

    let stderr_read = thread::spawn(move || -> std::io::Result<()> {
        let mut reader = BufReader::new(child.stderr.take().unwrap_or_else(|| std::process::Stdio::null(),));
        for line in reader.lines().flatten() {
            eprintln!("[SambaVault backend] {}", line);
        }
        Ok(())
    });

    if let Some(stdout_read) = stdout_read {
        if let Err(e) = stdout_read {
            eprintln!("Stdout read error: {}", e);
        }
    }

    if let Some(stderr_read) = stderr_read {
        if let Err(e) = stderr_read {
            eprintln!("Stderr read error: {}", e);
        }
    }

    let child_handle = child.take();

    std::thread::sleep(Duration::from_millis(100));

    Ok(())
}

fn transcode_media_file(input_path: &str, output_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    // This function would implement the actual transcoding logic
    Ok(())
}

fn probe_media_file(path: &str) -> Result<bool, String> {
    if fs::exists(path).unwrap_or(false) {
        Ok(true)
    } else {
        Ok(false)
    }
}

fn main() {
    let app = tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .manage(vlc_player::VlcPlayerState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                Ok(())
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
            commands::perform_fast_scan,
            commands::scan_samba_volume,
            commands::check_volume_mounted,
            commands::list_mounted_volumes,
            commands::probe_local_port,
            commands::mount_samba_share,
            commands::open_in_system_player,
            commands::open_in_vlc,
            commands::open_in_iina,
            commands::check_path_exists,
            commands::checkPathExists,
            commands::check_path_integrity,
            commands::check_path_metadata,
            commands::resolve_path_verbose,
            commands::debug_path_resolution,
            commands::find_episode_media_file,
            db::vault_save_state,
            db::vault_get_state,
            commands::cleanup_transcoded_file,
            commands::vault_purge_transcode_cache,
            commands::fix_path_permissions,
            commands::run_samba_diagnostic,
            commands::scan_and_import_volumes,
            transcode_media_file,
            probe_media_file,
            commands::check_ffmpeg_codecs,
            commands::set_custom_ffmpeg_path,
            commands::get_detected_ffmpeg_path,
            commands::validate_ffmpeg_sidecar,
            commands::check_bundled_ffmpeg,
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
