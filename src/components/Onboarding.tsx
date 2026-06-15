// Onboarding.tsx — first-run flow. Step 1 asks the user's name; step 2 installs
// the local "dependencies": a transcription model (download) + the macOS
// Accessibility permission (so Murmur can type at the cursor). On finish it
// persists { userName, onboarded: true } via the caller's onDone.

import { useEffect, useState, type CSSProperties } from "react";
import { Icons } from "../design-system/icons";
import { Waveform } from "../design-system/primitives";
import { isTauri } from "../state/config";
import { TrafficLights } from "./Dashboard";

interface ModelOption {
  id: string;
  label: string;
  size: string;
  note: string;
}
const MODEL_OPTIONS: ModelOption[] = [
  { id: "tiny", label: "Tiny", size: "75 MB", note: "Fastest" },
  { id: "base", label: "Base", size: "142 MB", note: "Recommended" },
  { id: "small", label: "Small", size: "466 MB", note: "Most accurate" },
];

const btnPrimary = (disabled?: boolean): CSSProperties => ({
  border: "none",
  cursor: disabled ? "default" : "pointer",
  borderRadius: "var(--radius-sm)",
  padding: "11px 20px",
  background: "var(--accent)",
  color: "#fff",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  fontWeight: 600,
  opacity: disabled ? 0.5 : 1,
  transition: "opacity .12s",
});

export function Onboarding({ initialName, onDone }: { initialName: string; onDone: (name: string) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);

  // Step 2 state
  const [model, setModel] = useState("base");
  const [downloaded, setDownloaded] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [accessOk, setAccessOk] = useState(false);

  // Reflect the actual download/permission state when entering step 2 or
  // switching the selected model.
  useEffect(() => {
    if (!isTauri || step !== 1) return;
    (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      setDownloaded(await invoke<boolean>("model_downloaded", { model }));
      setAccessOk(await invoke<boolean>("accessibility_trusted"));
    })().catch(() => {});
  }, [step, model]);

  const downloadModel = async () => {
    if (!isTauri) {
      setDownloaded(true);
      return;
    }
    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");
    setProgress(0);
    const un = await listen<{ model: string; received: number; total: number }>("model:progress", (e) => {
      if (e.payload.model === model && e.payload.total > 0) {
        setProgress(Math.round((e.payload.received / e.payload.total) * 100));
      }
    });
    try {
      await invoke("download_model", { model });
      setDownloaded(true);
    } catch {
      /* leave the action up so the user can retry */
    } finally {
      setProgress(null);
      un();
    }
  };

  const grantAccess = async () => {
    if (!isTauri) {
      setAccessOk(true);
      return;
    }
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("request_accessibility");
    setTimeout(async () => setAccessOk(await invoke<boolean>("accessibility_trusted")), 1200);
  };

  const finish = () => onDone(name.trim());

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", fontFamily: "var(--font-ui)", overflow: "hidden", borderRadius: 12 }}>
      {/* draggable strip + window controls */}
      <div style={{ height: 44, flex: "0 0 auto", display: "flex", alignItems: "center", padding: "0 16px" }} data-tauri-drag-region>
        <TrafficLights />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 28px 40px" }}>
        <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column" }}>
          {/* brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--ink)", color: "var(--surface)", display: "grid", placeItems: "center" }}>
              {Icons.waveDot({ size: 18 })}
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>Murmur</span>
          </div>

          {step === 0 ? (
            // ── Step 1: name ───────────────────────────────────────────────
            <>
              <h1 style={{ margin: 0, fontSize: 27, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                How should I call you?
              </h1>
              <p style={{ margin: "8px 0 24px", fontSize: 14, color: "var(--ink-faint)", lineHeight: 1.5 }}>
                Just your first name — Murmur uses it to greet you.
              </p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) setStep(1);
                }}
                placeholder="Your name"
                spellCheck={false}
                autoComplete="off"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  height: 48,
                  padding: "0 16px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                  border: "0.5px solid var(--line)",
                  color: "var(--ink)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 16,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button disabled={!name.trim()} onClick={() => setStep(1)} style={btnPrimary(!name.trim())}>
                  Continue
                </button>
              </div>
            </>
          ) : (
            // ── Step 2: dependencies + model ───────────────────────────────
            <>
              <h1 style={{ margin: 0, fontSize: 27, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                Nice to meet you{name.trim() ? `, ${name.trim()}` : ""}.
              </h1>
              <p style={{ margin: "8px 0 22px", fontSize: 14, color: "var(--ink-faint)", lineHeight: 1.5 }}>
                Two quick things and you’re ready to dictate.
              </p>

              {/* model download */}
              <div style={{ background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                  <span style={{ color: "var(--ink-faint)", display: "inline-flex" }}>{Icons.chip({ size: 16 })}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", flex: 1 }}>Transcription model</span>
                  {downloaded && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--ok)", fontSize: 12.5, fontWeight: 600 }}>
                      {Icons.check({ size: 14 })} Ready
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {MODEL_OPTIONS.map((m) => {
                    const sel = model === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        disabled={progress !== null}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          cursor: progress !== null ? "default" : "pointer",
                          border: sel ? "1px solid var(--accent)" : "0.5px solid var(--line)",
                          background: sel ? "var(--accent-soft)" : "var(--surface-2)",
                          borderRadius: "var(--radius-sm)",
                          padding: "9px 11px",
                          fontFamily: "var(--font-ui)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2, fontFamily: "var(--font-mono)" }}>{m.size}</div>
                        <div style={{ fontSize: 10.5, color: sel ? "var(--accent)" : "var(--ink-faint)", marginTop: 3 }}>{m.note}</div>
                      </button>
                    );
                  })}
                </div>
                {downloaded ? null : progress !== null ? (
                  <div style={{ height: 8, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", transition: "width .2s" }} />
                  </div>
                ) : (
                  <button onClick={downloadModel} style={{ ...btnPrimary(), width: "100%", padding: "10px 16px", fontSize: 13.5 }}>
                    Download {MODEL_OPTIONS.find((m) => m.id === model)?.label} model
                  </button>
                )}
              </div>

              {/* accessibility */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)", padding: 16, marginTop: 12 }}>
                <span style={{ width: 32, height: 32, flex: "0 0 auto", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
                  {Icons.shield({ size: 16 })}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Text insertion</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Grant Accessibility so Murmur can type at your cursor.</div>
                </div>
                {accessOk ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--ok)", fontSize: 12.5, fontWeight: 600 }}>
                    {Icons.check({ size: 14 })} Granted
                  </span>
                ) : (
                  <button onClick={grantAccess} style={{ flex: "0 0 auto", border: "0.5px solid var(--line)", background: "var(--surface-2)", color: "var(--ink)", cursor: "pointer", borderRadius: "var(--radius-sm)", padding: "8px 14px", fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: 600 }}>
                    Enable
                  </button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", marginTop: 24 }}>
                <button onClick={() => setStep(0)} style={{ border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 13, padding: "8px 4px" }}>
                  ← Back
                </button>
                <div style={{ flex: 1 }} />
                <button onClick={finish} style={{ border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 13, padding: "8px 10px", marginRight: 4 }}>
                  Skip for now
                </button>
                <button disabled={!downloaded} onClick={finish} style={btnPrimary(!downloaded)}>
                  Start dictating
                </button>
              </div>
            </>
          )}

          {/* step dots */}
          <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 36 }}>
            {[0, 1].map((i) => (
              <span key={i} style={{ width: i === step ? 18 : 7, height: 7, borderRadius: 999, background: i === step ? "var(--accent)" : "var(--line)", transition: "width .2s, background .2s" }} />
            ))}
          </div>
        </div>
      </div>

      {/* a faint idle waveform for warmth at the bottom */}
      <div style={{ position: "absolute", bottom: 26, left: 0, right: 0, display: "grid", placeItems: "center", color: "var(--line)", pointerEvents: "none" }}>
        <Waveform active={false} bars={28} height={16} width={2.5} gap={3} color="currentColor" />
      </div>
    </div>
  );
}
