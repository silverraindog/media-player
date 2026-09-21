#![allow(non_snake_case)]
use dioxus::prelude::*;

// Declare the modules that contain our migrated code logic
mod types;
mod components;
mod services;

fn main() {
    // Initialize our native data state before launching the UI view
    if let Err(e) = services::db::initialize_vault() {
        eprintln!("Failed to boot SQLite state vault: {}", e);
    }

    // Configure the window via the desktop module settings
    let window_config = dioxus::desktop::Config::default()
        .with_window(
            dioxus::desktop::WindowBuilder::new()
                .with_title("Rust Native Media Player")
                .with_inner_size(dioxus::desktop::LogicalSize::new(1280.0, 720.0))
        );

    // Launch the Dioxus Desktop runtime
    LaunchBuilder::desktop()
        .with_cfg(window_config)
        .launch(App);
}

fn App() -> Element {
    // In Dioxus v0.6, use_signal handle references don't require the mut keyword
    let current_tab = use_signal(|| "library".to_string());
    let samba_connected = use_signal(|| false);

    rsx! {
        link { rel: "stylesheet", href: "https://unpkg.com@^2/dist/tailwind.min.css" }
        
        div { class: "flex h-screen bg-gray-900 text-white font-sans",
            components::sidebar::Sidebar { 
                current: current_tab,
                samba_status: samba_connected 
            }
            
            main { class: "flex-1 overflow-y-auto p-6",
                match current_tab.read().as_str() {
                    "library" => rsx! { components::library::LibraryTab {} },
                    "samba" => rsx! { components::samba::SambaMountHub {} },
                    "stats" => rsx! { components::stats::LibraryStatsTab {} },
                    _ => rsx! { div { "Tab not found" } }
                }
            }
        }
    }
}
