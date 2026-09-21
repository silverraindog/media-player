use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct MediaMetadata {
    pub id: String,
    pub title: String,
    pub path: String,
    pub duration: u64,
    pub resolution: Option<String>,
}
