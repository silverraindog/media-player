use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use std::env;

#[derive(Serialize, Deserialize, Debug)]
pub struct GeminiResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub async fn call_gemini(prompt: &str) -> Result<serde_json::Value, String> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not found in environment".to_string())?;
    
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={}",
        api_key
    );

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("sambavault-tauri"));

    let body = serde_json::json!({
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "response_mime_type": "application/json"
        }
    });

    let res = client.post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    
    // Extract the text from Gemini response structure
    let text = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| format!("Invalid Gemini response structure: {:?}", json))?;

    let parsed_data: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    Ok(parsed_data)
}

#[tauri::command]
pub async fn generate_synopsis(title: String, media_type: String, year: Option<i32>) -> Result<serde_json::Value, String> {
    let prompt = format!(
        "Generate detailed metadata for a {} titled '{}' from year {:?}. Return JSON with fields: title, overview, tagline, genres (array), rating (float), runtime, certification, seasons (array of season objects with episodes if series).",
        media_type, title, year
    );

    call_gemini(&prompt).await
}
