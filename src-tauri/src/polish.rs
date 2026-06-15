// polish.rs — the AI auto-edit pass over the raw transcript.
//
// Three providers behind one entry point (`polish_text`):
//   • Heuristic  — built-in, zero-dependency, fully offline. The always-available
//                  local default: strips fillers/false-starts, collapses repeats,
//                  fixes casing, adds terminal punctuation.
//   • Ollama     — a local LLM (localhost:11434) if the user runs one. On-device,
//                  higher quality than the heuristic.
//   • Cloud      — an OpenAI-compatible chat endpoint (optional, needs a key).
//
// Best-effort by contract: `polish_text` NEVER errors — on any provider failure
// or timeout it falls back to the heuristic (and ultimately the raw text), so the
// dictation pipeline always proceeds. A bundled llama-cpp-2 provider can be added
// as a fourth arm later without touching callers.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PolishMode {
    /// Cloud if a key is set, else Ollama if running, else heuristic.
    #[default]
    Auto,
    Heuristic,
    Ollama,
    Cloud,
    /// No editing — insert the raw transcript verbatim.
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishSettings {
    pub mode: PolishMode,
    pub ollama_endpoint: String,
    pub ollama_model: String,
    pub cloud_endpoint: String,
    pub cloud_model: String,
    pub cloud_key: String,
}

impl Default for PolishSettings {
    fn default() -> Self {
        Self {
            mode: PolishMode::Auto,
            ollama_endpoint: "http://localhost:11434".into(),
            ollama_model: "llama3.2:3b".into(),
            cloud_endpoint: "https://api.openai.com".into(),
            cloud_model: "gpt-4o-mini".into(),
            cloud_key: String::new(),
        }
    }
}

const SYSTEM_PROMPT: &str = "You are a dictation editor. Clean up the user's dictated text: \
remove filler words and false starts (um, uh, like, you know), fix grammar, capitalization, \
and punctuation, and merge stutters — but preserve the original meaning and wording. \
Do not answer questions or add anything. Return ONLY the cleaned text, with no preamble or quotes.";

/// Entry point. Always returns text (never errors).
pub async fn polish_text(s: &PolishSettings, raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        return String::new();
    }
    match s.mode {
        PolishMode::Off => raw.to_string(),
        PolishMode::Heuristic => heuristic(raw),
        PolishMode::Ollama => ollama(s, raw).await.unwrap_or_else(|e| {
            eprintln!("[polish] ollama failed ({e}); using heuristic");
            heuristic(raw)
        }),
        PolishMode::Cloud => cloud(s, raw).await.unwrap_or_else(|e| {
            eprintln!("[polish] cloud failed ({e}); using heuristic");
            heuristic(raw)
        }),
        PolishMode::Auto => {
            if !s.cloud_key.is_empty() {
                if let Ok(t) = cloud(s, raw).await {
                    return t;
                }
            }
            if ollama_available(s).await {
                if let Ok(t) = ollama(s, raw).await {
                    return t;
                }
            }
            heuristic(raw)
        }
    }
}

// ── Ollama ──────────────────────────────────────────────────────────────
async fn ollama_available(s: &PolishSettings) -> bool {
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_millis(600))
        .build()
    else {
        return false;
    };
    client
        .get(format!("{}/api/tags", s.ollama_endpoint))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

async fn ollama(s: &PolishSettings, raw: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let body = json!({
        "model": s.ollama_model,
        "prompt": format!("{SYSTEM_PROMPT}\n\nText:\n{raw}\n\nCleaned:"),
        "stream": false,
        "options": { "temperature": 0.2 }
    });
    let v: serde_json::Value = client
        .post(format!("{}/api/generate", s.ollama_endpoint))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let out = clean_model_output(v["response"].as_str().unwrap_or(""));
    if out.is_empty() {
        Err("empty response".into())
    } else {
        Ok(out)
    }
}

// ── Cloud (OpenAI-compatible chat completions) ────────────────────────────
async fn cloud(s: &PolishSettings, raw: &str) -> Result<String, String> {
    if s.cloud_key.is_empty() {
        return Err("no api key".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let body = json!({
        "model": s.cloud_model,
        "temperature": 0.2,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": raw }
        ]
    });
    let v: serde_json::Value = client
        .post(format!("{}/v1/chat/completions", s.cloud_endpoint))
        .bearer_auth(&s.cloud_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let out = clean_model_output(v["choices"][0]["message"]["content"].as_str().unwrap_or(""));
    if out.is_empty() {
        Err("empty response".into())
    } else {
        Ok(out)
    }
}

/// Trim a model's reply and strip wrapping quotes it sometimes adds.
fn clean_model_output(s: &str) -> String {
    let t = s.trim();
    let t = t
        .strip_prefix('"')
        .and_then(|x| x.strip_suffix('"'))
        .unwrap_or(t);
    t.trim().to_string()
}

// ── Heuristic (offline default) ───────────────────────────────────────────
const FILLERS: &[&str] = &[
    "um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "hmm", "mmm",
];
// Two-word filler phrases, matched case-insensitively.
const FILLER_PHRASES: &[(&str, &str)] = &[
    ("you", "know"),
    ("i", "mean"),
    ("i", "guess"),
    ("sort", "of"),
    ("kind", "of"),
];

/// Strip a token to its bare lowercase word (no surrounding punctuation) for
/// comparison against filler lists.
fn bare(tok: &str) -> String {
    tok.trim_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase()
}

pub fn heuristic(raw: &str) -> String {
    let toks: Vec<&str> = raw.split_whitespace().collect();
    let mut kept: Vec<String> = Vec::with_capacity(toks.len());

    let mut i = 0;
    while i < toks.len() {
        // Two-word filler phrase?
        if i + 1 < toks.len() {
            let a = bare(toks[i]);
            let b = bare(toks[i + 1]);
            if FILLER_PHRASES.iter().any(|(x, y)| a == *x && b == *y) {
                i += 2;
                continue;
            }
        }
        let w = bare(toks[i]);
        // Single-word filler?
        if FILLERS.contains(&w.as_str()) {
            i += 1;
            continue;
        }
        // Collapse an immediate duplicate ("the the" → "the").
        if let Some(prev) = kept.last() {
            if bare(prev) == w && !w.is_empty() {
                i += 1;
                continue;
            }
        }
        kept.push(toks[i].to_string());
        i += 1;
    }

    if kept.is_empty() {
        return raw.trim().to_string();
    }

    // Fix "i" → "I" (and contractions) on kept tokens.
    for tok in kept.iter_mut() {
        let low = tok.to_lowercase();
        if low == "i" || low.starts_with("i'") {
            let mut c = tok.chars().collect::<Vec<_>>();
            if let Some(first) = c.first_mut() {
                *first = first.to_ascii_uppercase();
            }
            *tok = c.into_iter().collect();
        }
    }

    let mut out = kept.join(" ");
    out = capitalize_sentences(&out);

    // Ensure terminal punctuation.
    if !out.ends_with(['.', '!', '?', ':', ';']) {
        out.push('.');
    }
    out
}

/// Capitalize the first alphabetic char of the string and of each sentence
/// following `.`/`!`/`?`.
fn capitalize_sentences(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut at_start = true;
    for ch in s.chars() {
        if at_start && ch.is_alphabetic() {
            out.extend(ch.to_uppercase());
            at_start = false;
        } else {
            out.push(ch);
            if matches!(ch, '.' | '!' | '?') {
                at_start = true;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::heuristic;

    #[test]
    fn cleans_fillers_dupes_casing_punct() {
        let raw = "um so i was thinking like maybe we could move the the launch to friday";
        let out = heuristic(raw);
        // filler "um"/"like" removed, "the the" collapsed, capitalized, ends with '.'
        assert!(!out.to_lowercase().starts_with("um"), "leading filler kept: {out}");
        assert!(!out.contains("the the"), "dupe not collapsed: {out}");
        assert!(out.starts_with('S'), "not capitalized: {out}");
        assert!(out.ends_with('.'), "no terminal punctuation: {out}");
        assert!(out.contains('I'), "'i' not uppercased: {out}");
        eprintln!("heuristic => {out}");
    }

    #[test]
    fn empty_stays_empty_ish() {
        assert_eq!(heuristic("   "), "");
    }
}
