// audio.rs — microphone capture + live level metering.
//
// On start we spawn a dedicated thread that opens the default input device,
// builds a cpal input stream (which the OS drives on its own audio thread), and
// loops at ~30fps emitting a `BARS`-wide amplitude array to the overlay as
// "audio:levels". The cpal Stream is !Send on macOS, so it must live and drop on
// the thread that created it — hence the park-until-stop loop holding it in scope.
//
// M4 will additionally tee the mono samples into a ring buffer for Whisper;
// for now we only compute display levels and discard the audio.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{AppHandle, Emitter};

/// Number of waveform bars the overlay renders (matches the listening center).
const BARS: usize = 22;
/// Visual gain applied to RMS so normal speech fills the bars.
const GAIN: f32 = 11.0;
const FLOOR: f32 = 0.06;

type Bars = Arc<Mutex<[f32; BARS]>>;

/// Shared sinks the capture thread writes into. The emit loop reads `bars`;
/// `samples` accumulates the full mono recording for Whisper; `rate` carries the
/// device's native sample rate (set once the stream opens) for resampling.
#[derive(Clone)]
pub struct CaptureSinks {
    pub samples: Arc<Mutex<Vec<f32>>>,
    pub rate: Arc<AtomicU32>,
}

impl CaptureSinks {
    pub fn new() -> Self {
        Self {
            samples: Arc::new(Mutex::new(Vec::new())),
            rate: Arc::new(AtomicU32::new(0)),
        }
    }
}

impl Default for CaptureSinks {
    fn default() -> Self {
        Self::new()
    }
}

/// Enumerate input device names for the settings mic picker.
pub fn list_input_devices() -> Vec<String> {
    let host = cpal::default_host();
    match host.input_devices() {
        Ok(devs) => devs.filter_map(|d| d.name().ok()).collect(),
        Err(_) => Vec::new(),
    }
}

/// Resolve a device by name, falling back to the system default for
/// "default"/empty/unknown names.
fn pick_input_device(host: &cpal::Host, name: &str) -> Result<cpal::Device, String> {
    if name.is_empty() || name == "default" {
        return host
            .default_input_device()
            .ok_or_else(|| "no default input device".to_string());
    }
    if let Ok(devs) = host.input_devices() {
        if let Some(d) = devs
            .filter(|d| d.name().map(|n| n == name).unwrap_or(false))
            .next()
        {
            return Ok(d);
        }
    }
    host.default_input_device()
        .ok_or_else(|| format!("input device '{name}' not found and no default"))
}

/// Begin capturing. Returns immediately; capture runs until `stop` is set.
/// `device_name` selects the input ("default" = system default).
pub fn start_capture(app: AppHandle, stop: Arc<AtomicBool>, sinks: CaptureSinks, device_name: String) {
    std::thread::spawn(move || {
        if let Err(e) = run(app, stop, sinks, &device_name) {
            eprintln!("[audio] capture ended: {e}");
        }
    });
}

fn run(app: AppHandle, stop: Arc<AtomicBool>, sinks: CaptureSinks, device_name: &str) -> Result<(), String> {
    let host = cpal::default_host();
    let device = pick_input_device(&host, device_name)?;
    let supported = device
        .default_input_config()
        .map_err(|e| format!("default_input_config: {e}"))?;

    let sample_format = supported.sample_format();
    let channels = supported.channels() as usize;
    let config: cpal::StreamConfig = supported.into();
    sinks.rate.store(config.sample_rate.0, Ordering::Relaxed);

    let bars: Bars = Arc::new(Mutex::new([0.0; BARS]));
    let bars_cb = bars.clone();
    let samples_cb = sinks.samples.clone();
    let err_fn = |e| eprintln!("[audio] stream error: {e}");

    // Each callback: convert to mono f32, append to the recording, update levels.
    let process = move |mono: Vec<f32>| {
        fill_bars(&mono, &bars_cb);
        if let Ok(mut buf) = samples_cb.lock() {
            buf.extend_from_slice(&mono);
        }
    };

    // Build the input stream for whatever sample format the device gives us.
    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _: &_| process(to_mono(data, channels, |s| s)),
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _: &_| {
                process(to_mono(data, channels, |s| s as f32 / i16::MAX as f32))
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _: &_| {
                process(to_mono(data, channels, |s| (s as f32 - 32768.0) / 32768.0))
            },
            err_fn,
            None,
        ),
        other => return Err(format!("unsupported sample format: {other:?}")),
    }
    .map_err(|e| format!("build_input_stream: {e}"))?;

    stream.play().map_err(|e| format!("play: {e}"))?;

    // Emit loop — keeps the stream alive and pushes levels to the overlay.
    while !stop.load(Ordering::Relaxed) {
        let snapshot = *bars.lock().unwrap();
        let _ = app.emit_to("overlay", "audio:levels", snapshot.to_vec());
        std::thread::sleep(Duration::from_millis(33));
    }
    // stream drops here on the same thread that created it.
    Ok(())
}

/// Interleaved samples → mono f32, averaging channels per frame.
fn to_mono<T: Copy>(data: &[T], channels: usize, conv: impl Fn(T) -> f32) -> Vec<f32> {
    if channels <= 1 {
        return data.iter().map(|&s| conv(s)).collect();
    }
    data.chunks(channels)
        .map(|frame| frame.iter().map(|&s| conv(s)).sum::<f32>() / channels as f32)
        .collect()
}

/// Split a mono buffer into BARS bins, RMS per bin, normalize for display.
fn fill_bars(mono: &[f32], bars: &Bars) {
    if mono.is_empty() {
        return;
    }
    let bin = (mono.len() / BARS).max(1);
    let mut out = [FLOOR; BARS];
    for (i, slot) in out.iter_mut().enumerate() {
        let start = i * bin;
        if start >= mono.len() {
            break;
        }
        let end = (start + bin).min(mono.len());
        let chunk = &mono[start..end];
        let rms = (chunk.iter().map(|s| s * s).sum::<f32>() / chunk.len() as f32).sqrt();
        *slot = (rms * GAIN).clamp(FLOOR, 1.0);
    }
    if let Ok(mut guard) = bars.lock() {
        *guard = out;
    }
}
