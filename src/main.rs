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

/// Diagnostic function that performs a full fs::metadata and fs::read_dir check
pub fn debug_path_resolution(path: &str) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    let p = Path::new(path);
    let mut report = format!("Debug Path Resolution for: {}\n", path);

    match fs::metadata(p) {
        Ok(meta) => {
            report.push_str(&format!(
                "Exists: true | Dir: {} | File: {} | Permissions: {:?} | Size: {} bytes\n",
                meta.is_dir(), meta.is_file(), meta.permissions(), meta.len()
            ));
        }
        Err(e) => {
            report.push_str(&format!("fs::metadata error: {}\n", e));
        }
    }

    if let Ok(entries) = fs::read_dir(p) {
        let mut count = 0;
        report.push_str("Directory Entries (OsString check):\n");
        for entry in entries.filter_map(|e| e.ok()) {
            count += 1;
            let os_name = entry.file_name();
            let lossy = os_name.to_string_lossy();
            let is_valid = os_name.to_str().is_some();
            report.push_str(&format!(" - [ValidUnicode: {}] {:?} (lossy: {})\n", is_valid, os_name, lossy));
        }
        report.push_str(&format!("Total Count: {}\n", count));
    }

    Ok(report)
}
