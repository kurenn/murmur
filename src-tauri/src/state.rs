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
    /// Last-applied overlay shape, so we only resize/reposition on change.
    pub overlay_shape: Mutex<String>,
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
            overlay_shape: Mutex::new("pill".to_string()),
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
