#![allow(non_snake_case)]
use dioxus::prelude::*;
use dioxus_desktop::{Config, WindowBuilder};

// Import our migrated shared types and components
mod types;
mod components;
mod services;

fn main() {
    // 1. Initialize native backends directly at app startup
    if let Err(e) = services::db::initialize_vault() {
        eprintln!("Failed to boot SQLite state vault: {}", e);
    }

    // 2. Build the desktop app window configuration
    let window_config = Config::default()
        .with_window(
            WindowBuilder::new()
                .with_title("Rust Native Media Player")
                .with_inner_size(dioxus_desktop::winit::dpi::LogicalSize::new(1280.0, 720.0))
        );

    // 3. Hand control off to the Dioxus Desktop runtime loop
    LaunchBuilder::desktop()
        .with_cfg(window_config)
        .launch(App);
}

// Root UI entry point replacing React's App.tsx
fn App() -> Element {
    // State management uses Signals instead of React's useState hook
    let mut current_tab = use_signal(|| "library".to_string());
    let samba_connected = use_signal(|| false);

    rsx! {
        // You can import Tailwind CSS globally or via cdn link inside your markup
        link { rel: "stylesheet", href: "https://unpkg.com@^2/dist/tailwind.min.css" }
        
        div { class: "flex h-screen bg-gray-900 text-white font-sans",
            // Sidebar Navigation Component
            components::sidebar::Sidebar { 
                current: current_tab,
                samba_status: samba_connected 
            }
            
            // Main App Body routing
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
