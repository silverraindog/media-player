pub mod sidebar {
    use dioxus::prelude::*;

    #[component]
    pub fn Sidebar(current: Signal<String>, samba_status: Signal<bool>) -> Element {
        let mut curr = current;
        rsx! {
            aside { class: "w-64 bg-gray-800 p-4 flex flex-col gap-2",
                h1 { class: "text-lg font-bold mb-4", "Media Studio" }
                button { class: "text-left hover:text-blue-400", onclick: move |_| curr.set("library".to_string()), "Library" }
                button { class: "text-left hover:text-blue-400", onclick: move |_| curr.set("samba".to_string()), "Samba Hub" }
                button { class: "text-left hover:text-blue-400", onclick: move |_| curr.set("stats".to_string()), "Stats" }
            }
        }
    }
}

pub mod library {
    use dioxus::prelude::*;
    #[component]
    pub fn LibraryTab() -> Element { rsx! { div { "Library Dashboard Module" } } }
}

pub mod stats {
    use dioxus::prelude::*;
    #[component]
    pub fn LibraryStatsTab() -> Element { rsx! { div { "Analytics Module" } } }
}

// Links your fixed samba.rs submodule into the view layer compilation tree
pub mod samba;
