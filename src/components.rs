pub mod sidebar {
    use dioxus::prelude::*;

    #[derive(Props, Clone, PartialEq)]
    pub struct SidebarProps {
        pub current: Signal<String>,
        pub samba_status: Signal<bool>,
    }

    pub fn Sidebar(cx: SidebarProps) -> Element {
        let mut curr = cx.current;
        rsx! {
            aside { class: "w-64 bg-gray-800 p-4 flex flex-col gap-2",
                h1 { class: "text-lg font-bold mb-4", "Media Studio" }
                button { onclick: move |_| curr.set("library".to_string()), "Library" }
                button { onclick: move |_| curr.set("samba".to_string()), "Samba Hub" }
                button { onclick: move |_| curr.set("stats".to_string()), "Stats" }
            }
        }
    }
}

pub mod library {
    use dioxus::prelude::*;
    pub fn LibraryTab() -> Element { rsx! { div { "Library Dashboard Module" } } }
}

pub mod stats {
    use dioxus::prelude::*;
    pub fn LibraryStatsTab() -> Element { rsx! { div { "Analytics Module" } } }
}

// Include our existing Samba component module layout
pub mod samba;
