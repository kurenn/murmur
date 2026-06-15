// config.ts — typed mirror of the Rust Config (src-tauri/src/config.rs).
// The renderer hydrates from get_config and persists via set_config. In a plain
// browser (no shell) it returns defaults and no-ops on save.

import type { ThemePrefs } from "../design-system/theme";
import { THEME_DEFAULTS } from "../design-system/theme";
import type { OverlayShape } from "./dictation";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type Compute = "CPU" | "GPU";
export type TriggerMode = "Push-to-talk" | "Toggle";

/** Remote Whisper server (OpenAI-compatible /v1/audio/transcriptions). */
export interface RemoteTranscribe {
  enabled: boolean;
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface AppConfig {
  model: string;
  compute: Compute;
  triggerMode: TriggerMode;
  hotkey: string;
  overlayShape: OverlayShape;
  autoDetectLanguage: boolean;
  language: string;
  micDevice: string;
  /** Opaque to the UI for now (no auto-edit provider screen yet) — round-tripped verbatim. */
  polish: Record<string, unknown>;
  /** Remote transcription server; off → fully local. */
  transcribe: RemoteTranscribe;
  theme: ThemePrefs;
}

export const CONFIG_DEFAULTS: AppConfig = {
  model: "base",
  compute: "GPU",
  triggerMode: "Push-to-talk",
  hotkey: "Alt+Space",
  overlayShape: "pill",
  autoDetectLanguage: true,
  language: "English",
  micDevice: "default",
  polish: {
    mode: "auto",
    ollama_endpoint: "http://localhost:11434",
    ollama_model: "llama3.2:3b",
    cloud_endpoint: "https://api.openai.com",
    cloud_model: "gpt-4o-mini",
    cloud_key: "",
  },
  transcribe: {
    enabled: false,
    endpoint: "http://localhost:8000",
    model: "whisper-1",
    apiKey: "",
  },
  theme: THEME_DEFAULTS,
};

export async function getConfig(): Promise<AppConfig> {
  if (!inTauri) return structuredClone(CONFIG_DEFAULTS);
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<AppConfig>("get_config");
}

export async function setConfig(config: AppConfig): Promise<void> {
  if (!inTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_config", { config });
}

/** Subscribe to config changes broadcast by the Rust core. Returns an unlisten fn. */
export async function onConfigChanged(cb: (c: AppConfig) => void): Promise<() => void> {
  if (!inTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return await listen<AppConfig>("config:changed", (e) => cb(e.payload));
}

export const isTauri = inTauri;
