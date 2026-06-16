// Onboarding.tsx — first-run flow.
//   Step 1  "How should I call you?"   → captures the user's name.
//   Step 2  Setup                       → download a transcription model + grant
//                                          Microphone and Accessibility access.
//   Step 3  Welcome                      → "You're all set" → into the app.
// On finish it persists { userName, onboarded: true } via the caller's onDone.

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
  { id: "small", label: "Small", size: "466 MB", note: "More accurate" },
  { id: "medium", label: "Medium", size: "1.5 GB", note: "High accuracy" },
  { id: "large-v3", label: "Large v3", size: "2.9 GB", note: "Best quality" },
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

const enableBtn: CSSProperties = {
  flex: "0 0 auto",
  border: "0.5px solid var(--line)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  cursor: "pointer",
  borderRadius: "var(--radius-sm)",
  padding: "8px 14px",
  fontFamily: "var(--font-ui)",
  fontSize: 12.5,
  fontWeight: 600,
};

function DoneBadge({ label }: { label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--ok)", fontSize: 12.5, fontWeight: 600 }}>
      {Icons.check({ size: 14 })} {label}
    </span>
  );
}

export function Onboarding({ initialName, onDone }: { initialName: string; onDone: (name: string) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);

  // Step 2 state
  const [model, setModel] = useState("base");
  const [downloaded, setDownloaded] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [accessOk, setAccessOk] = useState(false);
  const [inputMonOk, setInputMonOk] = useState(false);
  const [micDone, setMicDone] = useState(false);

  // Reflect real download/permission state on the setup step — on entry AND when
  // the window regains focus (so granting a permission in System Settings flips
  // the row to "Granted" without re-entering the step).
  useEffect(() => {
    if (!isTauri || step !== 1) return;
    const refresh = async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      setDownloaded(await invoke<boolean>("model_downloaded", { model }));
      setAccessOk(await invoke<boolean>("accessibility_trusted"));
      setInputMonOk(await invoke<boolean>("input_monitoring_trusted"));
      setMicDone(await invoke<boolean>("microphone_trusted"));
    };
    refresh().catch(() => {});
    // The webview's window "focus" event is unreliable for app-level switches
    // (returning from System Settings), so poll while on the setup step.
    const onFocus = () => refresh().catch(() => {});
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => refresh().catch(() => {}), 1500);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
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

  const requestMic = async () => {
    if (!isTauri) {
      setMicDone(true);
      return;
    }
    const { invoke } = await import("@tauri-apps/api/core");
    // Shows the macOS prompt once; the poll above flips the row to "Granted".
    await invoke("request_microphone").catch(() => {});
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

  const grantInputMon = async () => {
    if (!isTauri) {
      setInputMonOk(true);
      return;
    }
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("request_input_monitoring");
    setTimeout(async () => setInputMonOk(await invoke<boolean>("input_monitoring_trusted")), 1500);
  };

  const finish = () => onDone(name.trim());
  const firstName = name.trim();

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", fontFamily: "var(--font-ui)", overflow: "hidden", borderRadius: 12 }}>
      {/* draggable strip + window controls */}
      <div style={{ height: 44, flex: "0 0 auto", display: "flex", alignItems: "center", padding: "0 16px" }} data-tauri-drag-region>
        <TrafficLights />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", overflowY: "auto", padding: "0 28px" }}>
        <div style={{ width: "100%", maxWidth: 440, margin: "auto", paddingTop: 12, paddingBottom: 40, display: "flex", flexDirection: "column" }}>
          {/* brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--ink)", color: "var(--surface)", display: "grid", placeItems: "center" }}>
              {Icons.waveDot({ size: 18 })}
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>Murmur</span>
          </div>

          {step === 0 && (
            // ── Step 1: name ───────────────────────────────────────────────
            <>
              <h1 style={{ margin: 0, fontSize: 27, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>How should I call you?</h1>
              <p style={{ margin: "8px 0 24px", fontSize: 14, color: "var(--ink-faint)", lineHeight: 1.5 }}>Just your first name — Murmur uses it to greet you.</p>
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
                style={{ width: "100%", boxSizing: "border-box", height: 48, padding: "0 16px", borderRadius: "var(--radius-sm)", background: "var(--surface)", border: "0.5px solid var(--line)", color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 16, outline: "none" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button disabled={!firstName} onClick={() => setStep(1)} style={btnPrimary(!firstName)}>Continue</button>
              </div>
            </>
          )}

          {step === 1 && (
            // ── Step 2: setup ──────────────────────────────────────────────
            <>
              <h1 style={{ margin: 0, fontSize: 27, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                Nice to meet you{firstName ? `, ${firstName}` : ""}.
              </h1>
              <p style={{ margin: "8px 0 22px", fontSize: 14, color: "var(--ink-faint)", lineHeight: 1.5 }}>A few quick things and you’re ready to dictate.</p>

              {/* model download */}
              <div style={{ background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                  <span style={{ color: "var(--ink-faint)", display: "inline-flex" }}>{Icons.chip({ size: 16 })}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", flex: 1 }}>Transcription model</span>
                  {downloaded && <DoneBadge label="Ready" />}
                </div>
                <div style={{ marginBottom: progress !== null || !downloaded ? 12 : 0 }}>
                  {MODEL_OPTIONS.map((m) => {
                    const sel = model === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        disabled={progress !== null}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 11,
                          width: "100%",
                          textAlign: "left",
                          marginBottom: 6,
                          padding: "9px 11px",
                          borderRadius: "var(--radius-sm)",
                          cursor: progress !== null ? "default" : "pointer",
                          border: sel ? "1px solid var(--accent)" : "0.5px solid var(--line)",
                          background: sel ? "var(--accent-soft)" : "var(--surface-2)",
                          fontFamily: "var(--font-ui)",
                        }}
                      >
                        <span style={{ width: 15, height: 15, flex: "0 0 auto", borderRadius: "50%", border: sel ? "5px solid var(--accent)" : "1.5px solid var(--ink-faint)", transition: "border .12s" }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", flex: "0 0 auto", minWidth: 66 }}>{m.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)", flex: "0 0 auto", minWidth: 52 }}>{m.size}</span>
                        <span style={{ fontSize: 11.5, color: sel ? "var(--accent)" : "var(--ink-faint)", flex: 1, textAlign: "right" }}>{m.note}</span>
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

              {/* microphone */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)", padding: 16, marginTop: 12 }}>
                <span style={{ width: 32, height: 32, flex: "0 0 auto", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>{Icons.mic({ size: 16 })}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Microphone</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Let Murmur hear you to transcribe speech.</div>
                </div>
                {micDone ? <DoneBadge label="Enabled" /> : <button onClick={requestMic} style={enableBtn}>Enable</button>}
              </div>

              {/* accessibility */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)", padding: 16, marginTop: 12 }}>
                <span style={{ width: 32, height: 32, flex: "0 0 auto", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>{Icons.shield({ size: 16 })}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Text insertion</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Grant Accessibility so Murmur can type at your cursor.</div>
                </div>
                {accessOk ? <DoneBadge label="Granted" /> : <button onClick={grantAccess} style={enableBtn}>Enable</button>}
              </div>

              {/* input monitoring (fn-key trigger) */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)", padding: 16, marginTop: 12 }}>
                <span style={{ width: 32, height: 32, flex: "0 0 auto", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>{Icons.keyboard({ size: 16 })}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>fn key trigger</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Grant Input Monitoring so holding the fn key starts dictation.</div>
                </div>
                {inputMonOk ? <DoneBadge label="Granted" /> : <button onClick={grantInputMon} style={enableBtn}>Enable</button>}
              </div>

              <div style={{ display: "flex", alignItems: "center", marginTop: 24 }}>
                <button onClick={() => setStep(0)} style={{ border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 13, padding: "8px 4px" }}>← Back</button>
                <div style={{ flex: 1 }} />
                <button onClick={finish} style={{ border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 13, padding: "8px 10px", marginRight: 4 }}>Skip for now</button>
                <button disabled={!downloaded} onClick={() => setStep(2)} style={btnPrimary(!downloaded)}>Continue</button>
              </div>
            </>
          )}

          {step === 2 && (
            // ── Step 3: welcome ────────────────────────────────────────────
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 12 }}>
              <div style={{ position: "relative", width: 96, height: 96, display: "grid", placeItems: "center", marginBottom: 22 }}>
                {[0, 0.9].map((d, i) => (
                  <span key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid var(--accent)", animation: `mm-ring 2.1s ease-out ${d}s infinite` }} />
                ))}
                <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
                  {Icons.check({ size: 30 })}
                </span>
              </div>
              <h1 style={{ margin: 0, fontSize: 27, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                You’re all set{firstName ? `, ${firstName}` : ""}!
              </h1>
              <p style={{ margin: "10px 0 28px", fontSize: 14, color: "var(--ink-faint)", lineHeight: 1.55, maxWidth: 340 }}>
                Hold{" "}
                <b style={{ color: "var(--ink-soft)", fontWeight: 600 }}>⌥ Space</b>{" "}
                anywhere — in any app — and start talking. Murmur transcribes it and types it at your cursor.
              </p>
              <button onClick={finish} style={btnPrimary()}>Start dictating</button>
              <button onClick={() => setStep(1)} style={{ border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 13, padding: "12px 4px", marginTop: 4 }}>← Back</button>
            </div>
          )}

          {/* step dots */}
          <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 34 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: i === step ? 18 : 7, height: 7, borderRadius: 999, background: i === step ? "var(--accent)" : "var(--line)", transition: "width .2s, background .2s" }} />
            ))}
          </div>
        </div>
      </div>

      {/* faint idle waveform for warmth */}
      <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, display: "grid", placeItems: "center", color: "var(--line)", pointerEvents: "none" }}>
        <Waveform active={false} bars={28} height={14} width={2.5} gap={3} color="currentColor" />
      </div>
    </div>
  );
}
