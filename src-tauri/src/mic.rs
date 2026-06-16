//! mic.rs — microphone authorization via AVFoundation (macOS).
//!
//! Requesting mic access by opening a cpal stream re-triggers the system prompt
//! repeatedly while the decision is pending (the user saw it ~8×). The canonical
//! API, `AVCaptureDevice.requestAccessForMediaType:completionHandler:`, shows the
//! prompt exactly once, and `authorizationStatusForMediaType:` lets the UI poll
//! the real state.
#![cfg(target_os = "macos")]

use block2::RcBlock;
use objc2::runtime::{AnyClass, Bool};
use objc2::{class, msg_send};
use objc2_foundation::NSString;

#[link(name = "AVFoundation", kind = "framework")]
extern "C" {
    static AVMediaTypeAudio: *const NSString;
}

/// AVAuthorizationStatus discriminants: 0 notDetermined, 1 restricted, 2 denied, 3 authorized.
const AUTHORIZED: isize = 3;

/// True when microphone access has been granted.
pub fn authorized() -> bool {
    unsafe {
        let audio: &NSString = &*AVMediaTypeAudio;
        let cls: &AnyClass = class!(AVCaptureDevice);
        let status: isize = msg_send![cls, authorizationStatusForMediaType: audio];
        status == AUTHORIZED
    }
}

/// Show the macOS microphone prompt once. No-op if the user already decided.
/// The completion handler is irrelevant — the UI polls `authorized()`.
pub fn request() {
    unsafe {
        let audio: &NSString = &*AVMediaTypeAudio;
        let cls: &AnyClass = class!(AVCaptureDevice);
        let handler = RcBlock::new(|_granted: Bool| {});
        let _: () = msg_send![cls, requestAccessForMediaType: audio, completionHandler: &*handler];
    }
}

#[cfg(test)]
mod tests {
    /// Exercises the AVFoundation FFI (selector + arg/return marshalling) — must
    /// return a bool without panicking, whatever the test process's mic status is.
    #[test]
    fn authorized_queries_without_panicking() {
        let _: bool = super::authorized();
    }
}
