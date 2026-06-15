// dictation.ts — the shared dictation state contract.
// The canonical FSM lives in Rust; the renderer mirrors these types and renders
// whatever state Rust emits over the "dictation:state" event. Keep in sync with
// src-tauri/src/state.rs.

import type { IconName } from "../design-system/icons";

export type DictationState =
  | "idle"
  | "listening"
  | "transcribing"
  | "polishing"
  | "done"
  | "error";

export type OverlayShape = "pill" | "orb" | "bar";

/** Per-state presentation: which glyph, the center label, and the mono right-meta.
 * Mirrors MM_STATE_META from design/overlay.jsx. The `right` value for several
 * states is dynamic at runtime (elapsed time, word count); these are the
 * design-spec defaults / fallbacks. */
export interface StateMeta {
  glyph: IconName | "live" | "spinner" | "sparkle" | "check";
  /** center label; null when the center is a waveform */
  label: string | null;
  tone: "faint" | "accent" | "soft" | "ink" | "ok";
  right: string | null;
}

export const STATE_META: Record<DictationState, StateMeta> = {
  idle: { glyph: "mic", label: "Hold to talk", tone: "faint", right: "⌥ Space" },
  listening: { glyph: "live", label: null, tone: "accent", right: "0:04" },
  transcribing: { glyph: "spinner", label: "Transcribing", tone: "soft", right: "whisper" },
  polishing: { glyph: "sparkle", label: "Polishing", tone: "accent", right: "auto-edit" },
  done: { glyph: "check", label: "Inserted", tone: "ink", right: "32 wds" },
  error: { glyph: "mic", label: "Couldn't transcribe", tone: "faint", right: null },
};

/** Auto-cycle timeline (ms per state) from the prototype showcase — used only
 * for the dev/mock driver, never in the real pipeline. The "error" state is
 * exceptional and not part of the auto-cycle (STATE_ORDER excludes it). */
export const MOCK_DURATIONS: Record<DictationState, number> = {
  idle: 1500,
  listening: 2700,
  transcribing: 1500,
  polishing: 1400,
  done: 2400,
  error: 0,
};

export const STATE_ORDER: DictationState[] = [
  "idle",
  "listening",
  "transcribing",
  "polishing",
  "done",
];
