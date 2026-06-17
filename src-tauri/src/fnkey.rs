// fnkey.rs — macOS fn (Globe) key trigger.
//
// The fn key is a special hardware modifier that the global-shortcut system
// can't bind, so we watch `FlagsChanged` events on a dedicated thread with a
// CGEventTap and translate the fn key's down/up into start/stop dictation.
// This avoids the flaky Carbon global-hotkey path entirely.
//
// Installing a listen-only keyboard tap requires the **Input Monitoring**
// permission (System Settings → Privacy & Security → Input Monitoring).

#![cfg(target_os = "macos")]

use std::cell::Cell;
use std::sync::atomic::Ordering;

use core_foundation::runloop::CFRunLoop;
use core_graphics::event::{
    CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, CallbackResult, EventField,
};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// Virtual keycode of the fn / Globe key (kVK_Function).
const KEYCODE_FN: i64 = 63;

/// Whether we can install a keyboard event tap — i.e. Input Monitoring is
/// granted. Creating a listen-only keyboard tap returns NULL without the
/// permission, so the attempt itself is the probe. The tap is dropped at once.
pub fn access_granted() -> bool {
    CGEventTap::new(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        vec![CGEventType::FlagsChanged],
        |_, _, _| CallbackResult::Keep,
    )
    .is_ok()
}

/// Open System Settings → Privacy & Security → Input Monitoring.
pub fn open_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
        .spawn();
}

/// Spawn the fn-key listener on its own thread. It blocks that thread on a run
/// loop for the life of the app. The callback only acts while the Fn trigger is
/// the active mode (`AppState::use_fn_trigger`); window ops are marshalled to
/// the main thread. Safe to call once.
pub fn spawn_listener(app: AppHandle) {
    std::thread::spawn(move || {
        // fn down/up state, so we only fire on transitions (FlagsChanged can
        // repeat). Cell gives interior mutability for the `Fn` callback.
        let down = Cell::new(false);
        let app_cb = app.clone();

        let res = CGEventTap::with_enabled(
            CGEventTapLocation::HID,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![CGEventType::FlagsChanged],
            move |_proxy, _etype, event| {
                let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                let secondary = event.get_flags().contains(CGEventFlags::CGEventFlagSecondaryFn);
                // Opt-in diagnostic (run with MURMUR_FN_DEBUG=1): logs every modifier
                // change so we can see what the fn (Globe) key emits on this machine.
                if std::env::var_os("MURMUR_FN_DEBUG").is_some() {
                    eprintln!("[fn-diag] flagsChanged keycode={keycode} secondaryFn={secondary}");
                }
                if keycode == KEYCODE_FN {
                    let now_down = secondary;
                    if now_down != down.get() {
                        down.set(now_down);
                        eprintln!("[fn] {}", if now_down { "down" } else { "up" });
                        if app_cb.state::<AppState>().use_fn_trigger.load(Ordering::Relaxed) {
                            let app2 = app_cb.clone();
                            let _ = app_cb
                                .run_on_main_thread(move || crate::handle_trigger(&app2, now_down));
                        }
                    }
                }
                CallbackResult::Keep
            },
            || {
                app.state::<AppState>()
                    .fn_listener_active
                    .store(true, Ordering::Relaxed);
                eprintln!("[fn] listener active — hold the fn (Globe) key to dictate");
                CFRunLoop::run_current()
            },
        );

        if res.is_err() {
            // Input Monitoring wasn't granted — clear the spawn guard so the
            // listener can be re-spawned the moment it is granted (no restart).
            app.state::<AppState>()
                .fn_listener_started
                .store(false, Ordering::Relaxed);
            eprintln!("[fn] event tap not created — grant Input Monitoring, then it retries");
        }
    });
}
