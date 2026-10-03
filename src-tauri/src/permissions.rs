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

/// Probes standard macOS TCC directories using secure metadata/stat inspections
/// to verify if Full Disk Access (FDA) has been granted to the application.
#[tauri::command]
pub async fn check_full_disk_access() -> Result<FullDiskAccessResult, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/Shared".to_string());
        let candidate_paths = [
            std::path::PathBuf::from(&home).join("Library").join("Safari"),
            std::path::PathBuf::from(&home).join("Library").join("Mail"),
            std::path::PathBuf::from(&home).join("Library").join("Messages"),
            std::path::PathBuf::from("/Library/Application Support/com.apple.TCC"),
            std::path::PathBuf::from("/Volumes"),
        ];

        let mut has_access = false;
        let mut checked_path = candidate_paths[0].to_string_lossy().to_string();
        let mut details = "Checked standard macOS TCC directories via secure stat probes.".to_string();

        for p in &candidate_paths {
            if p.exists() {
                checked_path = p.to_string_lossy().to_string();
                // Perform secure stat and directory read inspection
                match std::fs::metadata(p).and_then(|_| std::fs::read_dir(p)) {
                    Ok(_) => {
                        has_access = true;
                        details = format!("Successfully verified stat and read access to {}.", p.display());
                        break;
                    }
                    Err(e) => {
                        has_access = false;
                        details = format!("Access denied to {} ({}). Full Disk Access required.", p.display(), e);
                        break;
                    }
                }
            }
        }

        if !has_access && checked_path == candidate_paths[0].to_string_lossy() && !candidate_paths[0].exists() {
            let volumes = std::path::PathBuf::from("/Volumes");
            match std::fs::metadata(&volumes).and_then(|_| std::fs::read_dir(&volumes)) {
                Ok(_) => {
                    has_access = true;
                    details = "Verified read access to /Volumes root.".to_string();
                }
                Err(e) => {
                    has_access = false;
                    details = format!("Access denied to /Volumes ({}). Full Disk Access required.", e);
                }
            }
        }

        Ok(FullDiskAccessResult {
            is_macos: true,
            has_full_disk_access: has_access,
            platform: "macos".to_string(),
            checked_path,
            details,
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

/// Triggers macOS System Settings to directly open the Privacy & Security > Full Disk Access pane.
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
                    .arg("/System/Library/PreferencePanes/Security.prefPane")
                    .spawn();
                Ok(format!("Opened Security.prefPane fallback: {}", e))
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Security & Privacy pane is only available on macOS.".to_string())
    }
}
