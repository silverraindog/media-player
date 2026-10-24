pub mod sidebar {
    use dioxus::prelude::*;

    #[component]
    pub fn Sidebar(current: Signal<String>, samba_status: Signal<bool>) -> Element {
        let mut curr = current;
        rsx! {
            aside { class: "w-64 bg-gray-800 p-4 flex flex-col justify-between",
                div { class: "space-y-4",
                    h1 { class: "text-xl font-bold text-white mb-6", "Media Vault" }
                    button { 
                        class: "w-full text-left py-2 px-3 rounded hover:bg-gray-700", 
                        onclick: move |_| curr.set("library".to_string()), 
                        "Library" 
                    }
                    button { 
                        class: "w-full text-left py-2 px-3 rounded hover:bg-gray-700", 
                        onclick: move |_| curr.set("samba".to_string()), 
                        "Samba Mount Hub" 
                    }
                    button { 
                        class: "w-full text-left py-2 px-3 rounded hover:bg-gray-700", 
                        onclick: move |_| curr.set("stats".to_string()), 
                        "Stats & Analytics" 
                    }
                }
            }
        }
    }
}

pub mod library {
    use dioxus::prelude::*;
    #[component]
    pub fn LibraryTab() -> Element { 
        rsx! { 
            div { "Library Dashboard Module" } 
        } 
    }
}

pub mod stats {
    use dioxus::prelude::*;
    #[component]
    pub fn LibraryStatsTab() -> Element { 
        rsx! { 
            div { "Analytics Module" } 
        } 
    }
}

pub mod samba;
