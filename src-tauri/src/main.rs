#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;

#[tauri::command]
fn check_volume_mounted(share_name: String) -> bool {
    let mount_path = format!("/Volumes/{}", share_name);
    Path::new(&mount_path).exists()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_volume_mounted
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
