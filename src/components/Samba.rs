// src/components/samba.rs
use dioxus::prelude::*;
use crate::services::samba_service;

pub fn SambaMountHub() -> Element {
    // Standard inputs managed reactively via use_signal
    let mut host = use_signal(|| String::new());
    let mut share = use_signal(|| String::new());
    let mut username = use_signal(|| String::new());
    let mut status_message = use_signal(|| String::new());
    let mut is_loading = use_signal(|| false);

    // Async click event handler executing native code natively
    let handle_mount = move |_| {
        spawn(async move {
            is_loading.set(true);
            status_message.set("Attempting to mount remote share...".to_string());
            
            // Native background filesystem operation executing in a Tokio worker thread
            match samba_service::mount_share(&host.read(), &share.read(), &username.read()).await {
                Ok(_) => status_message.set("Samba share successfully mounted!".to_string()),
                Err(err) => status_message.set(format!("Mount error: {}", err)),
            }
            is_loading.set(false);
        });
    };

    rsx! {
        div { class: "max-w-xl mx-auto bg-gray-800 p-8 rounded-lg shadow-md",
            h2 { class: "text-2xl font-bold mb-6 border-b border-gray-700 pb-2", "Samba Mount Storage Hub" }
            
            div { class: "space-y-4",
                div { class: "flex flex-col",
                    label { class: "text-sm text-gray-400 mb-1", "Server Host IP / Domain" }
                    input { 
                        class: "bg-gray-700 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-white",
                        value: "{host}",
                        oninput: move |e| host.set(e.value())
                    }
                }
                div { class: "flex flex-col",
                    label { class: "text-sm text-gray-400 mb-1", "Share Directory Name" }
                    input { 
                        class: "bg-gray-700 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-white",
                        value: "{share}",
                        oninput: move |e| share.set(e.value())
                    }
                }
                
                button { 
                    class: "w-full py-2 px-4 rounded font-bold text-white transition-colors bg-blue-600 hover:bg-blue-700 disabled:opacity-50",
                    disabled: *is_loading.read(),
                    onclick: handle_mount,
                    if *is_loading.read() { "Connecting..." } else { "Mount Remote Directory" }
                }

                if !status_message.read().is_empty() {
                    rsx! {
                        div { class: "mt-4 p-3 bg-gray-900 rounded border border-gray-700 text-sm text-blue-400",
                            "{status_message}"
                        }
                    }
                }
            }
        }
    }
}
