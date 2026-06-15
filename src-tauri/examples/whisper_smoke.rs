// Headless proof that the local Whisper path works end-to-end.
// Reads a 16kHz mono f32 WAV and transcribes it directly via whisper-rs.
//
//   cargo run --example whisper_smoke -- <model.bin> <audio_16k_mono.wav>
//
// This bypasses the Tauri AppHandle (which model_path() needs) and loads the
// model file directly, so it exercises the same whisper-rs calls as
// transcribe.rs::WhisperEngine::transcribe.

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

fn main() {
    let mut args = std::env::args().skip(1);
    let model = args.next().expect("usage: whisper_smoke <model.bin> <wav>");
    let wav = args.next().expect("usage: whisper_smoke <model.bin> <wav>");

    let mut reader = hound::WavReader::open(&wav).expect("open wav");
    let spec = reader.spec();
    assert_eq!(spec.channels, 1, "expected mono");
    assert_eq!(spec.sample_rate, 16_000, "expected 16kHz");
    let samples: Vec<f32> = reader.samples::<f32>().map(|s| s.unwrap()).collect();
    println!("loaded {} samples ({:.2}s)", samples.len(), samples.len() as f32 / 16_000.0);

    let mut params = WhisperContextParameters::default();
    params.use_gpu(false);
    let ctx = WhisperContext::new_with_params(&model, params).expect("load model");
    let mut state = ctx.create_state().expect("create state");

    let mut fp = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    fp.set_n_threads(4);
    fp.set_print_special(false);
    fp.set_print_progress(false);
    fp.set_print_realtime(false);
    fp.set_print_timestamps(false);
    state.full(fp, &samples).expect("inference");

    let n = state.full_n_segments();
    let mut text = String::new();
    for i in 0..n {
        if let Some(seg) = state.get_segment(i) {
            text.push_str(&seg.to_str_lossy().unwrap());
        }
    }
    println!("TRANSCRIPT: {}", text.trim());
}
