// useDictation — subscribes the overlay to the Rust FSM. Under Tauri it listens
// for "dictation:state" transitions and the "audio:levels" stream; in a plain
// browser (vite dev without the shell) it falls back to the auto-cycle mock so
// the visuals can still be previewed.

import { useEffect, useState } from "react";
import { MOCK_DURATIONS, STATE_ORDER, type DictationState } from "./dictation";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface DictationResult {
  text: string;
  words: number;
}

export function useDictation(): {
  state: DictationState;
  levels: number[];
  result: DictationResult | null;
  error: string | null;
} {
  const [state, setState] = useState<DictationState>("idle");
  const [levels, setLevels] = useState<number[]>([]);
  const [result, setResult] = useState<DictationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Tauri: real events from the Rust core ──────────────────────────
  useEffect(() => {
    if (!inTauri) return;
    const unlisteners: Array<() => void> = [];
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisteners.push(
        await listen<DictationState>("dictation:state", (e) => {
          setState(e.payload);
          if (e.payload !== "listening") setLevels([]);
          if (e.payload === "listening") {
            setResult(null);
            setError(null);
          }
        }),
      );
      unlisteners.push(await listen<number[]>("audio:levels", (e) => setLevels(e.payload)));
      unlisteners.push(
        await listen<DictationResult>("dictation:result", (e) => setResult(e.payload)),
      );
      unlisteners.push(
        await listen<{ message: string }>("dictation:error", (e) => setError(e.payload.message)),
      );
    })();
    return () => unlisteners.forEach((u) => u());
  }, []);

  // ── Browser fallback: auto-cycle + synthetic levels ────────────────
  useEffect(() => {
    if (inTauri) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = STATE_ORDER[i];
      setState(s);
      timer = setTimeout(() => {
        i = (i + 1) % STATE_ORDER.length;
        tick();
      }, MOCK_DURATIONS[s]);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (inTauri || state !== "listening") return;
    const id = setInterval(() => {
      setLevels(Array.from({ length: 22 }, () => 0.2 + Math.random() * 0.8));
    }, 90);
    return () => clearInterval(id);
  }, [state]);

  return { state, levels, result, error };
}
