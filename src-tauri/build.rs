use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    let target = env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let binaries_dir = Path::new(&manifest_dir).join("binaries");

    if !binaries_dir.exists() {
        let _ = fs::create_dir_all(&binaries_dir);
    }

    let is_windows = target.contains("windows");
    let ext = if is_windows { ".exe" } else { "" };

    for tool in &["ffmpeg", "ffprobe"] {
        let target_filename = format!("{}-{}{}", tool, target, ext);
        let dest_path = binaries_dir.join(&target_filename);

        if !dest_path.exists() {
            let mut found_source: Option<PathBuf> = None;

            #[cfg(target_os = "macos")]
            let common_paths = [
                format!("/opt/homebrew/bin/{}", tool),
                format!("/usr/local/bin/{}", tool),
                format!("/usr/bin/{}", tool),
            ];
            #[cfg(not(target_os = "macos"))]
            let common_paths = [
                format!("/usr/bin/{}", tool),
                format!("/usr/local/bin/{}", tool),
            ];

            for p in &common_paths {
                let candidate = PathBuf::from(p);
                if candidate.exists() {
                    found_source = Some(candidate);
                    break;
                }
            }

            if found_source.is_none() {
                let cmd = if is_windows { "where" } else { "which" };
                if let Ok(output) = Command::new(cmd).arg(tool).output() {
                    if output.status.success() {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        if let Some(first_line) = stdout.lines().next() {
                            let p = PathBuf::from(first_line.trim());
                            if p.exists() {
                                found_source = Some(p);
                            }
                        }
                    }
                }
            }

            if let Some(src) = found_source {
                println!("cargo:warning=Copying system {} from {:?} to {:?}", tool, src, dest_path);
                let _ = fs::copy(&src, &dest_path);
            } else {
                println!("cargo:warning=Creating stub sidecar placeholder at {:?}", dest_path);
                if is_windows {
                    let _ = fs::write(&dest_path, b"");
                } else {
                    let stub_script = format!(
                        "#!/bin/sh\necho \"Bundled FFmpeg sidecar placeholder. Please install ffmpeg or configure PATH.\"\nexit 1\n"
                    );
                    let _ = fs::write(&dest_path, stub_script);
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = fs::set_permissions(&dest_path, fs::Permissions::from_mode(0o755));
                    }
                }
            }
        }
    }

    tauri_build::build();
}
