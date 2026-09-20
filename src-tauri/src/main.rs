use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScannedFileItem {
    pub name: String,
    pub path: String,
    pub rel_path: String,
    pub size: u64,
    pub is_dir: bool,
}

#[derive(Serialize, Clone)]
pub struct ScanProgressEvent {
    pub scanned_count: usize,
    pub current_file: String,
}

#[tauri::command]
async fn perform_fast_scan(window: tauri::Window, root_path: String) -> Result<Vec<ScannedFileItem>, String> {
    let path = Path::new(&root_path);
    if !path.exists() {
        return Err(format!("Root path does not exist: {}", root_path));
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

        // Emit progress every 25 items
        if scanned_count % 25 == 0 {
            let _ = window.emit("scan-progress", ScanProgressEvent {
                scanned_count,
                current_file: name.clone(),
            });
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![perform_fast_scan])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
