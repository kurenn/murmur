// inject.rs — put the cleaned text into whatever app holds focus.
//
// Primary path is clipboard-paste (Unicode/emoji-safe): save the clipboard, set
// it to our text, synthesize ⌘V / Ctrl+V, then restore the old clipboard shortly
// after. A "type instead" path uses synthetic typing for apps that block paste.
//
// On macOS, synthetic input requires the Accessibility permission; we check
// AXIsProcessTrusted first and prompt (deep-linking happens from the UI). Note:
// the permission is tied to the *signed* app identity and resets on re-sign, so
// it must be validated against a signed+notarized build (see plan, M6 spike).

use std::time::Duration;

use enigo::{Direction, Enigo, Key, Keyboard, Settings};

#[cfg(target_os = "macos")]
pub fn accessibility_trusted() -> bool {
    macos_accessibility_client::accessibility::application_is_trusted()
}

#[cfg(target_os = "macos")]
pub fn prompt_accessibility() -> bool {
    macos_accessibility_client::accessibility::application_is_trusted_with_prompt()
}

#[cfg(not(target_os = "macos"))]
pub fn accessibility_trusted() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
pub fn prompt_accessibility() -> bool {
    true
}

/// Set the clipboard, returning the previous text (if any) so it can be restored.
fn set_clipboard(text: &str) -> Result<Option<String>, String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let prev = cb.get_text().ok();
    cb.set_text(text.to_owned()).map_err(|e| e.to_string())?;
    Ok(prev)
}

fn paste_combo() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;
    enigo.key(modifier, Direction::Press).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| e.to_string())?;
    enigo
        .key(modifier, Direction::Release)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Inject `text` at the OS cursor of the focused app.
/// `type_instead`: use synthetic typing rather than clipboard-paste.
/// `restore_clipboard`: put the user's prior clipboard back after pasting.
pub fn inject(text: &str, type_instead: bool, restore_clipboard: bool) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }
    let debug = std::env::var_os("MURMUR_DEBUG").is_some();
    let trusted = accessibility_trusted();
    if debug {
        eprintln!("[inject] accessibility_trusted={trusted} type_instead={type_instead} len={}", text.len());
    }
    if !trusted {
        // Do NOT pop the system Accessibility dialog here — inject runs on every
        // dictation, so prompting here nags the user with that modal every single
        // time (and it can't help: the grant only applies to a process launched
        // after it exists). The caller emits `inject:needs-permission`, which the
        // dashboard turns into a one-time "grant + restart" notice instead.
        return Err("accessibility permission not granted".into());
    }

    if type_instead {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        enigo.text(text).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let prev = set_clipboard(text)?;
    if debug {
        eprintln!("[inject] clipboard set; firing paste…");
    }
    // Let the focused app observe the new clipboard before we paste.
    std::thread::sleep(Duration::from_millis(40));
    paste_combo()?;
    if debug {
        eprintln!("[inject] paste fired (⌘V synthesized) — if no text appeared, the keystroke was dropped");
    }

    if restore_clipboard {
        if let Some(prev) = prev {
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(350));
                if let Ok(mut cb) = arboard::Clipboard::new() {
                    let _ = cb.set_text(prev);
                }
            });
        }
    }
    Ok(())
}
