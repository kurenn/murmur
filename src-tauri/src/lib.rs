mod audio;
mod config;
mod history;
mod inject;
mod polish;
mod state;
mod transcribe;

use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::menu::{IsMenuItem, Menu, MenuItem};
#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use audio::CaptureSinks;
use state::{emit, emit_error, emit_result, AppState, DictationState, TriggerMode};

/// Map a UI display-name to an ISO 639-1 language code for Whisper.
/// Returns None for unknown names so Whisper auto-detects.
fn lang_code(name: &str) -> Option<String> {
    match name {
        "English" => Some("en".into()),
        "Español" | "Espanol" => Some("es".into()),
        "Français" | "Francais" => Some("fr".into()),
        "日本語" | "Japanese" => Some("ja".into()),
        "Deutsch" => Some("de".into()),
        "中文" | "Chinese" => Some("zh".into()),
        _ => None,
    }
}

/// Begin a dictation: idle → listening, start mic capture.
fn start_dictation(app: &AppHandle) {
    let st = app.state::<AppState>();
    {
        let mut cur = st.current.lock().unwrap();
        if *cur != DictationState::Idle {
            return;
        }
        *cur = DictationState::Listening;
    }
    set_overlay_visible(app, true);
    emit(app, DictationState::Listening);

    let stop = Arc::new(AtomicBool::new(false));
    let sinks = CaptureSinks::new();
    *st.audio_stop.lock().unwrap() = Some(stop.clone());
    *st.capture.lock().unwrap() = Some(sinks.clone());
    *st.listen_started.lock().unwrap() = Some(Instant::now());
    let mic = st.mic_device.lock().unwrap().clone();
    audio::start_capture(app.clone(), stop, sinks, mic);
}

/// Stop a dictation: stop capture, transcribe → polish → inject → history → idle.
fn stop_dictation(app: &AppHandle) {
    let st = app.state::<AppState>();
    {
        let mut cur = st.current.lock().unwrap();
        if *cur != DictationState::Listening {
            return;
        }
        *cur = DictationState::Transcribing;
    }
    if let Some(stop) = st.audio_stop.lock().unwrap().take() {
        stop.store(true, Ordering::Relaxed);
    }
    let sinks = st.capture.lock().unwrap().take();
    let duration_secs = st
        .listen_started
        .lock()
        .unwrap()
        .take()
        .map(|t| t.elapsed().as_secs_f64())
        .unwrap_or(0.0);
    emit(app, DictationState::Transcribing);

    let app = app.clone();
    std::thread::spawn(move || {
        let to_idle = |app: &AppHandle| {
            let st = app.state::<AppState>();
            *st.current.lock().unwrap() = DictationState::Idle;
            emit(app, DictationState::Idle);
            // Let the overlay fade out (renderer animates opacity on idle) before
            // the window actually hides.
            std::thread::sleep(Duration::from_millis(240));
            set_overlay_visible(app, false);
        };

        let Some(sinks) = sinks else {
            return to_idle(&app);
        };
        // Give the audio thread a beat to flush its final callback.
        std::thread::sleep(Duration::from_millis(60));
        let mono = sinks.samples.lock().unwrap().clone();
        let rate = sinks.rate.load(Ordering::Relaxed);
        let audio_16k = transcribe::resample_to_16k(&mono, rate);

        let st = app.state::<AppState>();
        let model = st.model.lock().unwrap().clone();
        let use_gpu = st.use_gpu.load(Ordering::Relaxed);
        let remote = st.transcribe.lock().unwrap().clone();
        let language = st.language.lock().unwrap().clone();
        let auto_detect = st.auto_detect_language.load(Ordering::Relaxed);
        let lang: Option<String> = if auto_detect { None } else { lang_code(&language) };

        // Remote server if enabled, else local Whisper. A remote failure (server
        // down, bad URL) falls back to local so dictation still works offline.
        let transcribed = if remote.enabled {
            match tauri::async_runtime::block_on(transcribe::transcribe_remote(
                &remote, &audio_16k, lang.as_deref(),
            )) {
                Ok(t) => Ok(t),
                Err(e) => {
                    eprintln!("[transcribe] remote failed ({e}); falling back to local");
                    st.whisper.transcribe(&app, &model, &audio_16k, lang.as_deref(), use_gpu)
                }
            }
        } else {
            st.whisper.transcribe(&app, &model, &audio_16k, lang.as_deref(), use_gpu)
        };

        match transcribed {
            Ok(raw) if !raw.is_empty() => {
                println!("[transcribe] raw: {raw}");

                // ── polishing pass (best-effort; never blocks the pipeline) ──
                *st.current.lock().unwrap() = DictationState::Polishing;
                emit(&app, DictationState::Polishing);
                let settings = st.polish.lock().unwrap().clone();
                let polished =
                    tauri::async_runtime::block_on(polish::polish_text(&settings, &raw));
                let final_text = if polished.trim().is_empty() { raw } else { polished };

                let words = final_text.split_whitespace().count();
                println!("[polish] final ({words} words): {final_text}");
                emit_result(&app, &final_text, words);

                // ── inject at the OS cursor (clipboard-paste; Unicode-safe) ──
                // enigo's paste calls macOS Text Input Source APIs
                // (TSMGetInputSourceProperty) that assert they run on the main
                // thread — calling them from this worker thread hard-crashes on
                // macOS 14+. Marshal the injection onto the main thread and wait.
                let inject_text = final_text.clone();
                let (tx, rx) = std::sync::mpsc::channel();
                let dispatched = app.run_on_main_thread(move || {
                    let _ = tx.send(inject::inject(&inject_text, false, true));
                });
                let inject_result = match dispatched {
                    Ok(()) => rx
                        .recv_timeout(Duration::from_secs(5))
                        .unwrap_or_else(|_| Err("inject timed out".into())),
                    Err(e) => Err(format!("dispatch to main thread: {e}")),
                };
                if let Err(e) = inject_result {
                    eprintln!("[inject] {e}");
                    // Text is on the clipboard regardless; tell the UI it can
                    // prompt the user to grant Accessibility + paste manually.
                    let _ = app.emit_to("main", "inject:needs-permission", e);
                }

                // ── record to history ──
                history::append(
                    &app,
                    history::Entry {
                        text: final_text.clone(),
                        words,
                        source: "Dictation".into(),
                        wpm: history::wpm(words, duration_secs),
                        duration: history::fmt_duration(duration_secs),
                        created_at: history::now_secs(),
                    },
                );

                *st.current.lock().unwrap() = DictationState::Done;
                emit(&app, DictationState::Done);
                std::thread::sleep(Duration::from_millis(1800));
                to_idle(&app);
            }
            Ok(_) => {
                println!("[transcribe] (empty)");
                to_idle(&app);
            }
            Err(e) => {
                eprintln!("[transcribe] error: {e}");
                *st.current.lock().unwrap() = DictationState::Error;
                emit(&app, DictationState::Error);
                emit_error(&app, &e);
                std::thread::sleep(Duration::from_millis(2500));
                to_idle(&app);
            }
        }
    });
}

// ── commands (model management; wired into the UI in M7) ───────────────────
#[tauri::command]
async fn download_model(app: AppHandle, model: String) -> Result<(), String> {
    transcribe::download(&app, &model).await
}

#[tauri::command]
fn model_downloaded(app: AppHandle, model: String) -> bool {
    transcribe::is_downloaded(&app, &model)
}

#[tauri::command]
fn get_config(app: AppHandle) -> config::Config {
    config::load(&app)
}

/// Persist the full config and apply the live bits (model, compute, polish,
/// trigger mode, hotkey). Broadcasts "config:changed" so windows re-read theme
/// and overlay shape.
#[tauri::command]
fn set_config(app: AppHandle, config: config::Config) -> Result<(), String> {
    let st = app.state::<AppState>();
    *st.model.lock().unwrap() = config.model.clone();
    st.use_gpu
        .store(config.compute.eq_ignore_ascii_case("gpu"), Ordering::Relaxed);
    *st.polish.lock().unwrap() = config.polish.clone();
    *st.transcribe.lock().unwrap() = config.transcribe.clone();
    *st.mic_device.lock().unwrap() = config.mic_device.clone();
    *st.trigger_mode.lock().unwrap() = TriggerMode::from_label(&config.trigger_mode);
    *st.language.lock().unwrap() = config.language.clone();
    st.auto_detect_language
        .store(config.auto_detect_language, Ordering::Relaxed);
    apply_hotkey(&app, &config.hotkey);

    // Reconfigure the overlay window only when its shape actually changed.
    {
        let mut shape = st.overlay_shape.lock().unwrap();
        if *shape != config.overlay_shape {
            *shape = config.overlay_shape.clone();
            drop(shape);
            configure_overlay(&app, &config.overlay_shape);
        }
    }

    config::save(&app, &config)?;
    let _ = app.emit("config:changed", config);
    Ok(())
}

/// HTTP health check for the remote Whisper server endpoint. Returns Ok("ok") on
/// any 2xx response, Err with a human-readable reason otherwise. The frontend
/// calls invoke("health_check_remote", { endpoint, apiKey }).
#[tauri::command]
async fn health_check_remote(endpoint: String, api_key: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("client: {e}"))?;

    let url = format!("{}/health", endpoint.trim_end_matches('/'));
    let mut req = client.get(&url);
    if !api_key.is_empty() {
        req = req.bearer_auth(&api_key);
    }

    let resp = req.send().await.map_err(|e| format!("request: {e}"))?;
    if resp.status().is_success() {
        Ok("ok".into())
    } else {
        Err(format!("server returned {}", resp.status()))
    }
}

/// Re-register the global hotkey from an accelerator string ("Alt+Space").
fn apply_hotkey(app: &AppHandle, accelerator: &str) {
    let Ok(new) = Shortcut::from_str(accelerator) else {
        eprintln!("[hotkey] invalid accelerator: {accelerator}");
        return;
    };
    let st = app.state::<AppState>();
    let current = *st.hotkey.lock().unwrap();
    if new == current {
        return;
    }
    let gs = app.global_shortcut();
    let _ = gs.unregister(current);
    match gs.register(new) {
        Ok(()) => *st.hotkey.lock().unwrap() = new,
        Err(e) => eprintln!("[hotkey] failed to register {accelerator}: {e}"),
    }
}

/// Show/hide the overlay. It's hidden when idle so the pill only appears while
/// dictating (and never steals focus — it stays click-through).
fn set_overlay_visible(app: &AppHandle, visible: bool) {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = if visible { win.show() } else { win.hide() };
    }
}

/// Size + position the overlay window for a shape and apply the OS frost.
/// pill/bar are single rounded rects (frosted via vibrancy with a matching
/// corner radius); orb keeps its CSS frost (circle + caption — a follow-up).
fn configure_overlay(app: &AppHandle, shape: &str) {
    let Some(win) = app.get_webview_window("overlay") else {
        return;
    };
    let (w, h): (f64, f64) = match shape {
        "bar" => (560.0, 64.0),
        "orb" => (160.0, 160.0),
        _ => (300.0, 56.0), // pill
    };
    let _ = win.set_size(tauri::LogicalSize::new(w, h));
    if let Ok(Some(monitor)) = win.current_monitor() {
        let msize = monitor.size().to_logical::<f64>(monitor.scale_factor());
        let x = ((msize.width - w) / 2.0).max(0.0);
        let y = (msize.height - h - 90.0).max(0.0);
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
    }
    apply_overlay_frost(&win, shape);
}

#[cfg(target_os = "macos")]
fn apply_overlay_frost(win: &tauri::WebviewWindow, shape: &str) {
    use window_vibrancy::{apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
    let _ = clear_vibrancy(win);
    let radius = match shape {
        "bar" => 16.0,
        "pill" => 28.0,
        _ => return, // orb: CSS frost only
    };
    let _ = apply_vibrancy(
        win,
        NSVisualEffectMaterial::HudWindow,
        Some(NSVisualEffectState::Active),
        Some(radius),
    );
}

#[cfg(target_os = "windows")]
fn apply_overlay_frost(win: &tauri::WebviewWindow, shape: &str) {
    use window_vibrancy::apply_acrylic;
    if shape == "orb" {
        return; // orb keeps CSS frost (circle + caption)
    }
    // Acrylic blurs the desktop behind; a faint tint, the webview surface layers
    // the theme color on top. (Corners are rounded by Windows 11 DWM.)
    let _ = apply_acrylic(win, Some((255, 255, 255, 18)));
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_overlay_frost(_win: &tauri::WebviewWindow, _shape: &str) {
    // Linux/WebKitGTK has no portable desktop blur — the renderer falls back to
    // the CSS frost card filling the (transparent, rounded-via-CSS) window.
}

#[tauri::command]
fn get_history(app: AppHandle) -> Vec<history::Entry> {
    history::load(&app)
}

/// Input device names for the settings mic picker.
#[tauri::command]
fn list_input_devices() -> Vec<String> {
    audio::list_input_devices()
}

#[tauri::command]
fn accessibility_trusted() -> bool {
    inject::accessibility_trusted()
}

/// Trigger the macOS Accessibility prompt; returns current trust state.
#[tauri::command]
fn request_accessibility() -> bool {
    inject::prompt_accessibility()
}

/// The global-shortcut handler: dispatches on the configured hotkey + trigger mode.
fn on_shortcut(app: &AppHandle, sc: &Shortcut, event_state: ShortcutState) {
    let st = app.state::<AppState>();
    if *sc != *st.hotkey.lock().unwrap() {
        return;
    }
    let mode = *st.trigger_mode.lock().unwrap();
    match (mode, event_state) {
        (TriggerMode::PushToTalk, ShortcutState::Pressed) => start_dictation(app),
        (TriggerMode::PushToTalk, ShortcutState::Released) => stop_dictation(app),
        (TriggerMode::Toggle, ShortcutState::Pressed) => {
            let listening = *st.current.lock().unwrap() == DictationState::Listening;
            if listening {
                stop_dictation(app);
            } else {
                start_dictation(app);
            }
        }
        (TriggerMode::Toggle, ShortcutState::Released) => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, sc, event| on_shortcut(app, sc, event.state()))
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            download_model,
            model_downloaded,
            get_config,
            set_config,
            get_history,
            list_input_devices,
            accessibility_trusted,
            request_accessibility,
            health_check_remote
        ])
        .setup(|app| {
            // Hydrate live state from persisted config.
            let cfg = config::load(app.handle());
            {
                let st = app.state::<AppState>();
                *st.model.lock().unwrap() = cfg.model.clone();
                st.use_gpu
                    .store(cfg.compute.eq_ignore_ascii_case("gpu"), Ordering::Relaxed);
                *st.polish.lock().unwrap() = cfg.polish.clone();
                *st.transcribe.lock().unwrap() = cfg.transcribe.clone();
                *st.mic_device.lock().unwrap() = cfg.mic_device.clone();
                *st.trigger_mode.lock().unwrap() = TriggerMode::from_label(&cfg.trigger_mode);
                *st.overlay_shape.lock().unwrap() = cfg.overlay_shape.clone();
                *st.language.lock().unwrap() = cfg.language.clone();
                st.auto_detect_language
                    .store(cfg.auto_detect_language, Ordering::Relaxed);

                // Register the configured hotkey.
                if let Ok(hk) = Shortcut::from_str(&cfg.hotkey) {
                    *st.hotkey.lock().unwrap() = hk;
                }
                let hk = *st.hotkey.lock().unwrap();
                if let Err(e) = app.global_shortcut().register(hk) {
                    eprintln!("[hotkey] failed to register {}: {e}", cfg.hotkey);
                }
            }

            // Overlay: click-through (never steals focus) + sized/frosted per shape.
            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.set_ignore_cursor_events(true);
            }
            configure_overlay(app.handle(), &cfg.overlay_shape);

            // Native frosted sidebar — the main window gets the macOS "sidebar"
            // vibrancy material. The renderer paints the content opaque and leaves
            // the sidebar translucent, so the frost shows only there.
            #[cfg(target_os = "macos")]
            if let Some(main) = app.get_webview_window("main") {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
                let _ = apply_vibrancy(
                    &main,
                    NSVisualEffectMaterial::Sidebar,
                    Some(NSVisualEffectState::Active),
                    None,
                );
            }

            // Native macOS menu bar (App / Edit / Window). Beyond looking native,
            // the Edit submenu wires the standard ⌘X/⌘C/⌘V/⌘A actions inside the
            // settings text fields.
            #[cfg(target_os = "macos")]
            {
                let app_menu = SubmenuBuilder::new(app.handle(), "Murmur")
                    .about(Some(AboutMetadata::default()))
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;
                let edit_menu = SubmenuBuilder::new(app.handle(), "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let window_menu = SubmenuBuilder::new(app.handle(), "Window")
                    .minimize()
                    .separator()
                    .close_window()
                    .build()?;
                let menu = MenuBuilder::new(app.handle())
                    .item(&app_menu)
                    .item(&edit_menu)
                    .item(&window_menu)
                    .build()?;
                app.set_menu(menu)?;
            }

            // System tray: open the dashboard / quit.
            let show = MenuItem::with_id(app, "show", "Open Murmur", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Murmur", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show as &dyn IsMenuItem<_>, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Murmur")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
