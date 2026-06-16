// history.rs — persisted dictation history (app_data_dir/history.json).
// Feeds the dashboard Home recents + stats with real data. Newest first, capped.

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MAX_ENTRIES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub text: String,
    pub words: usize,
    /// Best-effort source app (frontmost app capture is a follow-up).
    pub source: String,
    pub wpm: u32,
    /// Formatted "m:ss".
    pub duration: String,
    /// Unix seconds; the UI formats relative time.
    pub created_at: u64,
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&dir).ok();
    Ok(dir.join("history.json"))
}

pub fn load(app: &AppHandle) -> Vec<Entry> {
    history_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Vec<Entry>>(&s).ok())
        .unwrap_or_default()
}

pub fn append(app: &AppHandle, entry: Entry) {
    let mut all = load(app);
    all.insert(0, entry);
    all.truncate(MAX_ENTRIES);
    if let Ok(p) = history_path(app) {
        if let Ok(json) = serde_json::to_string(&all) {
            let _ = fs::write(p, json);
        }
    }
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn fmt_duration(secs: f64) -> String {
    let s = secs.round().max(0.0) as u64;
    format!("{}:{:02}", s / 60, s % 60)
}

pub fn wpm(words: usize, secs: f64) -> u32 {
    if secs <= 0.0 {
        return 0;
    }
    ((words as f64) / (secs / 60.0)).round() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fmt_duration_formats_mss() {
        assert_eq!(fmt_duration(0.0), "0:00");
        assert_eq!(fmt_duration(7.4), "0:07");
        assert_eq!(fmt_duration(83.0), "1:23");
        assert_eq!(fmt_duration(-5.0), "0:00"); // clamps negatives
    }

    #[test]
    fn wpm_basic_and_zero_guard() {
        assert_eq!(wpm(120, 60.0), 120); // 120 words in 1 min
        assert_eq!(wpm(30, 30.0), 60); // 30 words in 30s -> 60 wpm
        assert_eq!(wpm(100, 0.0), 0); // no division by zero
        assert_eq!(wpm(100, -1.0), 0);
    }

    #[test]
    fn entry_serde_round_trip() {
        let e = Entry {
            text: "hi".into(),
            words: 1,
            source: "Dictation".into(),
            wpm: 60,
            duration: "0:01".into(),
            created_at: 1_700_000_000,
        };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("\"created_at\":1700000000"));
        let back: Entry = serde_json::from_str(&json).unwrap();
        assert_eq!(back.text, e.text);
        assert_eq!(back.created_at, e.created_at);
    }
}
