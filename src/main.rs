#![allow(non_snake_case)]
use dioxus::prelude::*;

mod components;

fn main() {
    let window_config = dioxus::desktop::Config::default()
        .with_window(
            dioxus::desktop::WindowBuilder::new()
                .with_title("Rust Native Media Player")
                .with_inner_size(dioxus::desktop::LogicalSize::new(1280.0, 720.0))
        );

    LaunchBuilder::desktop()
        .with_cfg(window_config)
        .launch(App);
}

#[component]
fn App() -> Element {
    let current_tab: Signal<String> = use_signal(|| "library".to_string());
    let samba_connected: Signal<bool> = use_signal(|| false);

    rsx! {
        link { rel: "stylesheet", href: "https://unpkg.com@^2/dist/tailwind.min.css" }
        
        div { class: "flex h-screen bg-gray-900 text-white font-sans",
            components::sidebar::Sidebar { 
                current: current_tab,
                samba_status: samba_connected 
            }
            
            main { class: "flex-1 overflow-y-auto p-6",
                if current_tab() == "library" {
                    components::library::LibraryTab {}
                } else if current_tab() == "samba" {
                    components::samba::SambaMountHub {}
                } else if current_tab() == "stats" {
                    components::stats::LibraryStatsTab {}
                } else {
                    div { "Tab not found" }
                }
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct PathMetadataResult {
    pub exists: bool,
    pub is_dir: bool,
    pub is_file: bool,
    pub permissions: String,
    pub size: u64,
    pub error: Option<String>,
}

pub fn check_path_integrity(path: &str) -> Result<PathMetadataResult, String> {
    use std::fs;
    use std::path::Path;

    let p = Path::new(path);
    match fs::metadata(p) {
        Ok(meta) => Ok(PathMetadataResult {
            exists: true,
            is_dir: meta.is_dir(),
            is_file: meta.is_file(),
            permissions: format!("{:?}", meta.permissions()),
            size: meta.len(),
            error: None,
        }),
        Err(e) => Ok(PathMetadataResult {
            exists: false,
            is_dir: false,
            is_file: false,
            permissions: "".to_string(),
            size: 0,
            error: Some(format!("Error: {}", e)),
        }),
    }
}

pub fn check_path_metadata(path: &str) -> Result<PathMetadataResult, String> {
    check_path_integrity(path)
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct OsStringArtifactReport {
    pub name: String,
    pub raw_os_string: String,
    pub is_valid_unicode: bool,
    pub is_dir: bool,
    pub is_file: bool,
    pub size_bytes: u64,
    pub permissions: String,
    pub hex_bytes: String,
    pub has_hidden_control_chars: bool,
    pub has_trailing_space: bool,
    pub is_appledouble: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct DebugPathResolutionReport {
    pub target_path: String,
    pub resolved_path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub is_file: bool,
    pub permissions: String,
    pub size_bytes: u64,
    pub file_count: usize,
    pub metadata_error: Option<String>,
    pub read_dir_error: Option<String>,
    pub parent_path: Option<String>,
    pub parent_exists: bool,
    pub inspected_dir: String,
    pub artifacts: Vec<OsStringArtifactReport>,
    pub raw_input_hex: String,
    pub encountered_artifacts_count: usize,
    pub diagnostic_notes: Vec<String>,
    pub timestamp: String,
}

/// Diagnostic function that performs a full fs::metadata and fs::read_dir check
pub fn debug_path_resolution(path: &str) -> Result<DebugPathResolutionReport, String> {
    use std::fs;
    use std::path::{Path, PathBuf};

    let p = Path::new(path);
    let resolved_path = p.to_string_lossy().to_string();
    let mut exists = false;
    let mut is_dir = false;
    let mut is_file = false;
    let mut permissions = String::new();
    let mut size_bytes = 0u64;
    let mut metadata_error = None;
    let mut read_dir_error = None;
    let mut diagnostic_notes = Vec::new();

    match fs::metadata(p) {
        Ok(meta) => {
            exists = true;
            is_dir = meta.is_dir();
            is_file = meta.is_file();
            permissions = format!("{:?}", meta.permissions());
            size_bytes = meta.len();
            diagnostic_notes.push(format!("fs::metadata success: permissions={:?}", meta.permissions()));
        }
        Err(e) => {
            metadata_error = Some(e.to_string());
        }
    }

    let parent_path = p.parent().map(|par| par.to_string_lossy().to_string());
    let parent_exists = p.parent().map(|par| par.exists()).unwrap_or(false);
    let mut artifacts = Vec::new();
    let mut file_count = 0;

    let dir_to_read = if is_dir {
        p.to_path_buf()
    } else {
        p.parent().unwrap_or_else(|| Path::new("/")).to_path_buf()
    };

    if let Ok(entries) = fs::read_dir(&dir_to_read) {
        for entry in entries.filter_map(|e| e.ok()) {
            file_count += 1;
            let os_name = entry.file_name();
            let raw_os_string = format!("{:?}", os_name);
            let name = os_name.to_string_lossy().to_string();
            let is_valid_unicode = os_name.to_str().is_some();
            artifacts.push(OsStringArtifactReport {
                name,
                raw_os_string,
                is_valid_unicode,
                is_dir: entry.metadata().map(|m| m.is_dir()).unwrap_or(false),
                is_file: entry.metadata().map(|m| m.is_file()).unwrap_or(false),
                size_bytes: entry.metadata().map(|m| m.len()).unwrap_or(0),
                permissions: "".to_string(),
                hex_bytes: "".to_string(),
                has_hidden_control_chars: false,
                has_trailing_space: false,
                is_appledouble: false,
            });
        }
    } else if let Err(e) = fs::read_dir(&dir_to_read) {
        read_dir_error = Some(e.to_string());
    }

    let encountered_artifacts_count = artifacts.len();

    Ok(DebugPathResolutionReport {
        target_path: path.to_string(),
        resolved_path,
        exists,
        is_dir,
        is_file,
        permissions,
        size_bytes,
        file_count,
        metadata_error,
        read_dir_error,
        parent_path,
        parent_exists,
        inspected_dir: dir_to_read.to_string_lossy().to_string(),
        artifacts,
        raw_input_hex: "".to_string(),
        encountered_artifacts_count,
        diagnostic_notes,
        timestamp: "".to_string(),
    })
}
