// state.rs — the canonical dictation FSM. Rust is the single source of truth;
// webviews are pure views that render whatever we emit on "dictation:state".
// Keep these variants in sync with src/state/dictation.ts.

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

use crate::audio::CaptureSinks;
use crate::polish::PolishSettings;
use crate::transcribe::{RemoteTranscribe, WhisperEngine};

/// Default transcription model (multilingual, ~142MB).
pub const DEFAULT_MODEL: &str = "base";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TriggerMode {
    /// Hold to record, release to stop.
    #[default]
    PushToTalk,
    /// Tap to start, tap again to stop.
    Toggle,
}

impl TriggerMode {
    pub fn from_label(s: &str) -> Self {
        match s {
            "Toggle" => TriggerMode::Toggle,
            _ => TriggerMode::PushToTalk,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum DictationState {
    #[default]
    Idle,
    Listening,
    Transcribing,
    Polishing,
    Done,
    /// A fatal error occurred; the UI shows an error badge. Keep in sync with
    /// src/state/dictation.ts (DictationState union and STATE_META).
    Error,
}

/// Shared app state managed by Tauri (`app.state::<AppState>()`).
pub struct AppState {
    pub current: Mutex<DictationState>,
    /// Set to signal the active audio-capture thread to stop and drop its stream.
    pub audio_stop: Mutex<Option<Arc<AtomicBool>>>,
    /// Sinks for the in-flight recording (mono samples + sample rate).
    pub capture: Mutex<Option<CaptureSinks>>,
    /// When listening started, for wpm/duration stats.
    pub listen_started: Mutex<Option<std::time::Instant>>,
    /// Active Whisper model id.
    pub model: Mutex<String>,
    /// CPU vs GPU (UI toggle). CPU until per-platform GPU backends are built in.
    pub use_gpu: AtomicBool,
    /// Selected input device name ("default" = system default).
    pub mic_device: Mutex<String>,
    /// Loaded Whisper context, reused across utterances.
    pub whisper: WhisperEngine,
    /// Auto-edit provider configuration.
    pub polish: Mutex<PolishSettings>,
    /// Remote Whisper server config. When enabled, transcription is delegated
    /// to it (with fallback to local on failure).
    pub transcribe: Mutex<RemoteTranscribe>,
    /// Push-to-talk vs Toggle.
    pub trigger_mode: Mutex<TriggerMode>,
    /// Currently registered global hotkey (compared in the shortcut handler).
    pub hotkey: Mutex<Shortcut>,
    /// True when the fn (Globe) key is the active trigger (macOS). The fn-key
    /// listener only fires while this is set, and the global shortcut is left
    /// unregistered. See lib.rs `apply_trigger_key`.
    pub use_fn_trigger: AtomicBool,
    /// Whether the macOS fn-key listener thread has been spawned (spawn-once).
    pub fn_listener_started: AtomicBool,
    /// Last-applied overlay shape, so we only resize/reposition on change.
    pub overlay_shape: Mutex<String>,
    /// Display name of the transcription language (e.g. "English", "Español").
    /// Mapped to an ISO 639-1 code in lib.rs unless auto_detect_language is set.
    pub language: Mutex<String>,
    /// When true, pass no language hint to Whisper so it auto-detects per utterance.
    pub auto_detect_language: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current: Mutex::new(DictationState::default()),
            audio_stop: Mutex::new(None),
            capture: Mutex::new(None),
            listen_started: Mutex::new(None),
            model: Mutex::new(DEFAULT_MODEL.to_string()),
            use_gpu: AtomicBool::new(false),
            mic_device: Mutex::new("default".to_string()),
            whisper: WhisperEngine::new(),
            polish: Mutex::new(PolishSettings::default()),
            transcribe: Mutex::new(RemoteTranscribe::default()),
            trigger_mode: Mutex::new(TriggerMode::default()),
            hotkey: Mutex::new(Shortcut::new(Some(Modifiers::ALT), Code::Space)),
            use_fn_trigger: AtomicBool::new(false),
            fn_listener_started: AtomicBool::new(false),
            overlay_shape: Mutex::new("pill".to_string()),
            language: Mutex::new("English".to_string()),
            auto_detect_language: AtomicBool::new(true),
        }
    }
}

/// The polished/transcribed result, sent to both windows when ready.
#[derive(Clone, Serialize)]
pub struct DictationResult {
    pub text: String,
    pub words: usize,
}

/// Push a state transition to both windows. The overlay renders the widget;
/// the dashboard updates its status pill.
pub fn emit(app: &AppHandle, s: DictationState) {
    let _ = app.emit_to("overlay", "dictation:state", s);
    let _ = app.emit_to("main", "dictation:state", s);
}

/// Push the finished transcript to both windows ("dictation:result").
pub fn emit_result(app: &AppHandle, text: &str, words: usize) {
    let payload = DictationResult {
        text: text.to_string(),
        words,
    };
    let _ = app.emit_to("overlay", "dictation:result", payload.clone());
    let _ = app.emit_to("main", "dictation:result", payload);
}

/// Payload for the "dictation:error" event.
#[derive(Clone, Serialize)]
pub struct DictationError {
    pub message: String,
}

/// Push an error message to both windows ("dictation:error").
pub fn emit_error(app: &AppHandle, message: &str) {
    let payload = DictationError {
        message: message.to_string(),
    };
    let _ = app.emit_to("overlay", "dictation:error", payload.clone());
    let _ = app.emit_to("main", "dictation:error", payload);
}

#[cfg(test)]
mod tests {
    use super::{DictationState, TriggerMode};

    #[test]
    fn dictation_state_serializes_lowercase() {
        // Must stay in sync with the TS DictationState union (src/state/dictation.ts).
        assert_eq!(serde_json::to_string(&DictationState::Idle).unwrap(), "\"idle\"");
        assert_eq!(serde_json::to_string(&DictationState::Listening).unwrap(), "\"listening\"");
        assert_eq!(serde_json::to_string(&DictationState::Transcribing).unwrap(), "\"transcribing\"");
        assert_eq!(serde_json::to_string(&DictationState::Polishing).unwrap(), "\"polishing\"");
        assert_eq!(serde_json::to_string(&DictationState::Done).unwrap(), "\"done\"");
        assert_eq!(serde_json::to_string(&DictationState::Error).unwrap(), "\"error\"");
    }

    #[test]
    fn trigger_mode_from_label() {
        assert_eq!(TriggerMode::from_label("Toggle"), TriggerMode::Toggle);
        assert_eq!(TriggerMode::from_label("Push-to-talk"), TriggerMode::PushToTalk);
        assert_eq!(TriggerMode::from_label("whatever"), TriggerMode::PushToTalk);
    }
}
