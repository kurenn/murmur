// config.rs — typed, persisted user configuration (app_data_dir/config.json).
//
// The renderer reads/writes this through the get_config / set_config commands
// (typed both sides) rather than a generic key-value store, so there's one
// schema. On startup we hydrate the live AppState from it; on save we persist
// and re-apply (model, compute, polish, trigger mode, hotkey).
//
// camelCase on the wire to match the TypeScript config types.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::polish::PolishSettings;
use crate::transcribe::RemoteTranscribe;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePrefs {
    pub product_name: String,
    pub dark: bool,
    pub font_pairing: String,
    pub radius: u32,
    pub density: String,
}

impl Default for ThemePrefs {
    fn default() -> Self {
        Self {
            product_name: "Murmur".into(),
            dark: false,
            font_pairing: "Clean".into(),
            radius: 16,
            density: "Regular".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    /// What to call the user (greeting + sidebar). Empty until onboarding.
    pub user_name: String,
    /// First-run onboarding completed.
    pub onboarded: bool,
    pub model: String,
    /// "CPU" | "GPU"
    pub compute: String,
    /// "Push-to-talk" | "Toggle"
    pub trigger_mode: String,
    /// global-shortcut accelerator, e.g. "Alt+Space"
    pub hotkey: String,
    /// "pill" | "orb" | "bar"
    pub overlay_shape: String,
    pub auto_detect_language: bool,
    pub language: String,
    pub mic_device: String,
    pub polish: PolishSettings,
    /// Remote Whisper server (off by default → fully local transcription).
    pub transcribe: RemoteTranscribe,
    pub theme: ThemePrefs,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            user_name: String::new(),
            onboarded: false,
            model: "base".into(),
            compute: "GPU".into(),
            trigger_mode: "Push-to-talk".into(),
            hotkey: "Alt+Space".into(),
            overlay_shape: "pill".into(),
            auto_detect_language: true,
            language: "English".into(),
            mic_device: "default".into(),
            polish: PolishSettings::default(),
            transcribe: RemoteTranscribe::default(),
            theme: ThemePrefs::default(),
        }
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&dir).ok();
    Ok(dir.join("config.json"))
}

pub fn load(app: &AppHandle) -> Config {
    config_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Config>(&s).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_round_trips() {
        let c = Config::default();
        let json = serde_json::to_string(&c).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(back.model, c.model);
        assert_eq!(back.onboarded, c.onboarded);
        assert_eq!(back.theme.dark, c.theme.dark);
        assert_eq!(back.transcribe.enabled, c.transcribe.enabled);
    }

    #[test]
    fn partial_json_fills_defaults() {
        // Backward-compat: an old config.json missing newer fields must still load
        // (every config migration relied on #[serde(default)]).
        let json = r#"{ "model": "small", "userName": "Bob" }"#;
        let c: Config = serde_json::from_str(json).unwrap();
        assert_eq!(c.model, "small"); // provided
        assert_eq!(c.user_name, "Bob"); // provided (camelCase)
        assert!(!c.onboarded); // defaulted
        assert_eq!(c.hotkey, "Alt+Space"); // defaulted
        assert!(c.auto_detect_language); // defaulted
        assert_eq!(c.theme.product_name, "Murmur"); // whole nested theme defaulted
    }

    #[test]
    fn wire_keys_are_camel_case() {
        let json = serde_json::to_string(&Config::default()).unwrap();
        assert!(json.contains("\"userName\""), "{json}");
        assert!(json.contains("\"autoDetectLanguage\""), "{json}");
        assert!(json.contains("\"micDevice\""), "{json}");
    }
}

pub fn save(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let p = config_path(app)?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(p, json).map_err(|e| e.to_string())
}
