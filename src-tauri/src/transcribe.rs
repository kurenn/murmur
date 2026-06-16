// transcribe.rs — local Whisper transcription + model management.
//
// WhisperEngine lazily loads a ggml model (cached, reused across utterances) and
// runs inference on the resampled 16kHz mono audio. Models are ggml `.bin` files
// downloaded from the official whisper.cpp Hugging Face mirror into
// app_data_dir/models/. Audio never leaves the device — inference is fully local.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use tauri::{AppHandle, Emitter, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const HF_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

fn model_filename(id: &str) -> String {
    format!("ggml-{id}.bin")
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create models dir: {e}"))?;
    Ok(dir)
}

pub fn model_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(model_filename(id)))
}

pub fn is_downloaded(app: &AppHandle, id: &str) -> bool {
    model_path(app, id).map(|p| p.exists()).unwrap_or(false)
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    model: String,
    received: u64,
    total: u64,
}

/// Stream a model file from the HF mirror, emitting "model:progress" as it goes.
/// Writes to a .part file then renames on success (atomic-ish).
pub async fn download(app: &AppHandle, id: &str) -> Result<(), String> {
    let dest = model_path(app, id)?;
    if dest.exists() {
        return Ok(());
    }
    let url = format!("{HF_BASE}/{}?download=true", model_filename(id));
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("request: {e}"))?
        .error_for_status()
        .map_err(|e| format!("status: {e}"))?;
    let total = resp.content_length().unwrap_or(0);

    let part = dest.with_extension("part");
    let mut file = std::fs::File::create(&part).map_err(|e| format!("create file: {e}"))?;
    let mut received: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download chunk: {e}"))?;
        file.write_all(&chunk).map_err(|e| format!("write: {e}"))?;
        received += chunk.len() as u64;
        let _ = app.emit(
            "model:progress",
            DownloadProgress {
                model: id.to_string(),
                received,
                total,
            },
        );
    }
    file.flush().ok();
    drop(file);
    std::fs::rename(&part, &dest).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

/// Holds the loaded WhisperContext, keyed by model id so we only reload on change.
pub struct WhisperEngine {
    cached: Mutex<Option<(String, WhisperContext)>>,
}

impl WhisperEngine {
    pub fn new() -> Self {
        Self {
            cached: Mutex::new(None),
        }
    }

    /// Transcribe 16kHz mono f32 audio. `use_gpu` maps to the UI CPU/GPU toggle.
    pub fn transcribe(
        &self,
        app: &AppHandle,
        model_id: &str,
        audio_16k: &[f32],
        language: Option<&str>,
        use_gpu: bool,
    ) -> Result<String, String> {
        if audio_16k.len() < 16000 / 4 {
            return Ok(String::new()); // < ~0.25s, nothing meaningful to transcribe
        }

        let mut guard = self.cached.lock().unwrap();
        let needs_load = guard.as_ref().map(|(id, _)| id != model_id).unwrap_or(true);
        if needs_load {
            let path = model_path(app, model_id)?;
            if !path.exists() {
                return Err(format!(
                    "model '{model_id}' not downloaded ({})",
                    path.display()
                ));
            }
            let mut params = WhisperContextParameters::default();
            params.use_gpu(use_gpu);
            let ctx = WhisperContext::new_with_params(
                path.to_str().ok_or("non-utf8 model path")?,
                params,
            )
            .map_err(|e| format!("load model: {e}"))?;
            *guard = Some((model_id.to_string(), ctx));
        }
        let (_, ctx) = guard.as_ref().unwrap();

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        let threads = std::thread::available_parallelism()
            .map(|n| n.get() as i32)
            .unwrap_or(4)
            .clamp(1, 8);
        params.set_n_threads(threads);
        params.set_translate(false);
        params.set_language(language);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        let mut state = ctx.create_state().map_err(|e| format!("create state: {e}"))?;
        state
            .full(params, audio_16k)
            .map_err(|e| format!("inference: {e}"))?;

        let n = state.full_n_segments();
        let mut text = String::new();
        for i in 0..n {
            if let Some(seg) = state.get_segment(i) {
                if let Ok(s) = seg.to_str_lossy() {
                    text.push_str(&s);
                }
            }
        }
        Ok(text.trim().to_string())
    }
}

impl Default for WhisperEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Box-filter decimation to 16kHz mono. Used as the fallback when rubato is
/// unavailable or encounters an error. Adequate for speech → Whisper.
fn resample_box(input: &[f32], in_rate: u32) -> Vec<f32> {
    if input.is_empty() || in_rate == 16_000 {
        return input.to_vec();
    }
    let ratio = in_rate as f64 / 16_000.0;
    let out_len = (input.len() as f64 / ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);
    for j in 0..out_len {
        let start = (j as f64 * ratio) as usize;
        let end = (((j + 1) as f64 * ratio) as usize).clamp(start + 1, input.len());
        let slice = &input[start..end];
        out.push(slice.iter().sum::<f32>() / slice.len() as f32);
    }
    out
}

/// Resample `input` from `in_rate` Hz to 16 kHz mono using rubato sinc/polyphase
/// resampling (production quality). Falls back to the box-filter (`resample_box`)
/// if `in_rate` is already 16 kHz, the input is empty, or rubato returns any error
/// — so inference is never blocked regardless of the audio device's sample rate.
pub fn resample_to_16k(input: &[f32], in_rate: u32) -> Vec<f32> {
    use rubato::{
        Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType,
        WindowFunction,
    };

    if input.is_empty() || in_rate == 16_000 {
        return input.to_vec();
    }

    let resample_ratio = 16_000.0 / in_rate as f64;

    // Attempt to build a rubato sinc resampler.  Any construction or processing
    // error falls back to the box-filter so we never panic or regress quality
    // relative to the previous behaviour.
    let result = (|| -> Result<Vec<f32>, Box<dyn std::error::Error>> {
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: WindowFunction::BlackmanHarris2,
        };

        // chunk_size: number of *input* frames per call to process().
        let chunk_size = 1024usize;

        let mut resampler = SincFixedIn::<f32>::new(
            resample_ratio,
            2.0, // max_resample_ratio_relative
            params,
            chunk_size,
            1, // channels
        )?;

        let mut output: Vec<f32> = Vec::with_capacity((input.len() as f64 * resample_ratio * 1.01) as usize + 64);

        let mut pos = 0usize;
        while pos < input.len() {
            let end = (pos + chunk_size).min(input.len());
            let mut chunk = input[pos..end].to_vec();
            // Pad the last chunk to chunk_size so rubato never gets a short buffer.
            if chunk.len() < chunk_size {
                chunk.resize(chunk_size, 0.0);
            }
            let waves_in = vec![chunk];
            let waves_out = resampler.process(&waves_in, None)?;
            output.extend_from_slice(&waves_out[0]);
            pos = end;
        }

        // Flush any samples buffered inside the resampler.
        let waves_out = resampler.process_partial::<Vec<f32>>(None, None)?;
        output.extend_from_slice(&waves_out[0]);

        Ok(output)
    })();

    match result {
        Ok(resampled) => resampled,
        Err(_) => resample_box(input, in_rate), // graceful fallback
    }
}

// ── Remote transcription (OpenAI-compatible Whisper server) ────────────────
//
// When enabled, audio is sent to a Whisper server on another machine instead of
// being transcribed locally. The wire protocol is OpenAI's audio API
// (`POST /v1/audio/transcriptions`, multipart form, `{"text": ...}` back), so the
// same client works against a self-hosted openai/whisper wrapper, faster-whisper,
// or OpenAI's cloud. The caller falls back to local inference on any failure.

/// Settings for the remote Whisper server (persisted in Config). camelCase on the
/// wire to match the TypeScript config types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTranscribe {
    /// When true, transcription is delegated to `endpoint` instead of local Whisper.
    pub enabled: bool,
    /// Base URL of the server, e.g. "http://192.168.1.50:8000". The `/v1/audio/
    /// transcriptions` path is appended.
    pub endpoint: String,
    /// Model name sent in the request (OpenAI uses "whisper-1"). Self-hosted
    /// servers may ignore it and use whatever model they loaded.
    pub model: String,
    /// Optional bearer token (required for OpenAI cloud; usually blank for LAN servers).
    pub api_key: String,
}

impl Default for RemoteTranscribe {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: "http://localhost:8000".into(),
            model: "whisper-1".into(),
            api_key: String::new(),
        }
    }
}

/// Encode 16kHz mono f32 samples as a 16-bit PCM WAV (in memory). This is the
/// container we upload — every Whisper server decodes it without extra deps.
fn encode_wav_16k_mono(samples: &[f32]) -> Vec<u8> {
    const SAMPLE_RATE: u32 = 16_000;
    const BITS: u16 = 16;
    const CHANNELS: u16 = 1;
    let data_len = (samples.len() * 2) as u32;
    let byte_rate = SAMPLE_RATE * CHANNELS as u32 * (BITS / 8) as u32;
    let block_align = CHANNELS * (BITS / 8);

    let mut buf = Vec::with_capacity(44 + samples.len() * 2);
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(36 + data_len).to_le_bytes());
    buf.extend_from_slice(b"WAVE");
    buf.extend_from_slice(b"fmt ");
    buf.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    buf.extend_from_slice(&1u16.to_le_bytes()); // PCM
    buf.extend_from_slice(&CHANNELS.to_le_bytes());
    buf.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    buf.extend_from_slice(&byte_rate.to_le_bytes());
    buf.extend_from_slice(&block_align.to_le_bytes());
    buf.extend_from_slice(&BITS.to_le_bytes());
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&data_len.to_le_bytes());
    for &s in samples {
        let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        buf.extend_from_slice(&v.to_le_bytes());
    }
    buf
}

/// Upload audio to the configured remote Whisper server and return the transcript.
/// `language` is an optional ISO code / name; None lets the server auto-detect.
pub async fn transcribe_remote(
    s: &RemoteTranscribe,
    audio_16k: &[f32],
    language: Option<&str>,
) -> Result<String, String> {
    if audio_16k.len() < 16000 / 4 {
        return Ok(String::new()); // < ~0.25s, nothing meaningful to transcribe
    }
    let wav = encode_wav_16k_mono(audio_16k);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("client: {e}"))?;

    let part = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("part: {e}"))?;
    let mut form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", s.model.clone())
        .text("response_format", "json");
    if let Some(lang) = language {
        form = form.text("language", lang.to_string());
    }

    let url = format!(
        "{}/v1/audio/transcriptions",
        s.endpoint.trim_end_matches('/')
    );
    let mut req = client.post(&url).multipart(form);
    if !s.api_key.is_empty() {
        req = req.bearer_auth(&s.api_key);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("request: {e}"))?
        .error_for_status()
        .map_err(|e| format!("status: {e}"))?;
    let v: serde_json::Value = resp.json().await.map_err(|e| format!("decode: {e}"))?;
    Ok(v["text"].as_str().unwrap_or("").trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_filename_format() {
        assert_eq!(model_filename("base"), "ggml-base.bin");
        assert_eq!(model_filename("large-v3"), "ggml-large-v3.bin");
    }

    #[test]
    fn resample_16k_passthrough_and_empty() {
        let s = vec![0.1, -0.2, 0.3];
        assert_eq!(resample_to_16k(&s, 16_000), s);
        assert!(resample_to_16k(&[], 44_100).is_empty());
    }

    #[test]
    fn resample_box_halves_at_double_rate() {
        let n = 1000usize;
        let input: Vec<f32> = (0..n).map(|i| (i as f32 / n as f32) - 0.5).collect();
        let out = resample_box(&input, 32_000); // ratio 2.0
        assert!((out.len() as i64 - 500).abs() <= 1, "len {}", out.len());
        assert!(out.iter().all(|&v| (-0.6..=0.6).contains(&v)));
    }

    #[test]
    fn resample_to_16k_handles_odd_rate_without_panic() {
        let input: Vec<f32> = (0..1234).map(|i| (i as f32).sin() * 0.5).collect();
        assert!(!resample_to_16k(&input, 44_100).is_empty());
    }

    #[test]
    fn wav_header_is_well_formed() {
        let samples = vec![0.0f32; 8];
        let wav = encode_wav_16k_mono(&samples);
        assert_eq!(wav.len(), 44 + samples.len() * 2);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[12..16], b"fmt ");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(u16::from_le_bytes([wav[22], wav[23]]), 1); // mono
        assert_eq!(u32::from_le_bytes([wav[24], wav[25], wav[26], wav[27]]), 16_000);
        assert_eq!(u16::from_le_bytes([wav[34], wav[35]]), 16); // bit depth
    }

    #[test]
    fn wav_clamps_out_of_range_samples() {
        let wav = encode_wav_16k_mono(&[2.0, -2.0]);
        assert_eq!(i16::from_le_bytes([wav[44], wav[45]]), i16::MAX);
        assert_eq!(i16::from_le_bytes([wav[46], wav[47]]), -i16::MAX);
    }

    #[test]
    fn remote_transcribe_default_is_local_off() {
        let d = RemoteTranscribe::default();
        assert!(!d.enabled);
        assert_eq!(d.model, "whisper-1");
        assert!(d.api_key.is_empty());
    }
}
