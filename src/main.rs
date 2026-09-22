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
