// Overlay.tsx — the floating dictation widget. One <Overlay> renders any shape
// (pill | orb | bar) at any lifecycle state. Ported from design/overlay.jsx
// (MMOverlay / MMGlyph / MMCenter / MMMeta), with the auto-cycling showcase and
// faux-desktop scaffolding removed — real state arrives via props from Rust.

import type { CSSProperties, ReactNode } from "react";
import { Icons } from "../design-system/icons";
import { Dots, LiveDot, Spinner, Waveform } from "../design-system/primitives";
import { STATE_META, type DictationState, type OverlayShape } from "../state/dictation";

// Self-contained frost (CSS blur over a translucent surface) — used in the
// browser preview and on platforms without OS vibrancy.
const frost: CSSProperties = {
  background: "color-mix(in oklch, var(--surface) 82%, transparent)",
  backdropFilter: "blur(20px) saturate(140%)",
  WebkitBackdropFilter: "blur(20px) saturate(140%)",
  border: "0.5px solid var(--line)",
  boxShadow: "var(--shadow)",
};

// When the OS provides the blur (window-vibrancy), the widget fills the frosted
// window with only a light tint + hairline so the desktop blur shows through.
const vibrancySurface: CSSProperties = {
  background: "color-mix(in oklch, var(--surface) 26%, transparent)",
  border: "0.5px solid color-mix(in oklch, var(--line) 55%, transparent)",
};

const surfaceFor = (osFrost?: boolean): CSSProperties => (osFrost ? vibrancySurface : frost);

export interface OverlayProps {
  shape?: OverlayShape;
  state?: DictationState;
  /** live amplitude bars (0..1) while listening */
  levels?: number[];
  /** dynamic right-meta override (e.g. live "0:04", final "32 wds") */
  rightMeta?: string;
  /** pixel width for the pill (the bar is always full-width) */
  width?: number;
  /** widget fills the (window-sized) frosted surface — true in the real shell
   * for pill/bar; false in the browser preview (centered card). */
  fill?: boolean;
  /** OS provides the blur (macOS vibrancy / Windows acrylic) → lighten the
   * surface so the desktop shows through. False on Linux (CSS-only frost). */
  osFrost?: boolean;
  /** error message from "dictation:error" — shown when state === "error" */
  error?: string | null;
}

function Glyph({ state, size = 30 }: { state: DictationState; size?: number }) {
  const inner: ReactNode = (() => {
    switch (state) {
      case "idle":
        return <span style={{ color: "var(--ink-soft)" }}>{Icons.mic({ size: 17 })}</span>;
      case "listening":
        return <LiveDot />;
      case "transcribing":
        return <Spinner size={16} color="var(--ink-soft)" />;
      case "polishing":
        return <span style={{ color: "var(--accent)" }}>{Icons.sparkle({ size: 16 })}</span>;
      case "done":
        return (
          <span style={{ color: "var(--ok)", display: "inline-flex", animation: "mm-pop .35s ease-out" }}>
            {Icons.check({ size: 16 })}
          </span>
        );
      case "error":
        return (
          <span style={{ color: "var(--error, #e05252)", display: "inline-flex", animation: "mm-pop .35s ease-out" }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
        );
    }
  })();
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: state === "idle" ? "var(--surface-2)" : "transparent",
      }}
    >
      {inner}
    </span>
  );
}

function Center({ state, levels, error }: { state: DictationState; levels?: number[]; error?: string | null }) {
  const meta = STATE_META[state];
  if (state === "listening") {
    return (
      <Waveform active bars={22} height={26} width={3} gap={3} color="var(--ink)" levels={levels} style={{ flex: 1 }} />
    );
  }
  if (state === "transcribing" || state === "polishing") {
    return (
      <span
        style={{
          flex: 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          color: state === "polishing" ? "var(--accent)" : "var(--ink-soft)",
          fontSize: 14.5,
          fontWeight: 500,
        }}
      >
        {meta.label}
        <Dots size={4} gap={4} color="currentColor" />
      </span>
    );
  }
  if (state === "done") {
    return (
      <span style={{ flex: 1, color: "var(--ink)", fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {meta.label}
      </span>
    );
  }
  if (state === "error") {
    const caption = error ? error.slice(0, 40) : meta.label;
    return (
      <span style={{ flex: 1, color: "var(--error, #e05252)", fontSize: 14.5, fontWeight: 500 }}>
        {caption}
      </span>
    );
  }
  return <span style={{ flex: 1, color: "var(--ink-faint)", fontSize: 14.5, fontWeight: 500 }}>{meta.label}</span>;
}

function Meta({ state, value }: { state: DictationState; value?: string }) {
  const text = value ?? STATE_META[state].right;
  if (!text) return null;
  const color =
    state === "listening" ? "var(--accent)" :
    state === "error" ? "var(--error, #e05252)" :
    "var(--ink-faint)";
  return (
    <span
      style={{
        flex: "0 0 auto",
        fontFamily: "var(--font-mono)",
        fontSize: 11.5,
        fontWeight: 500,
        color,
        letterSpacing: "0.01em",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export function Overlay({ shape = "pill", state = "idle", levels, rightMeta, width, fill, osFrost, error }: OverlayProps) {
  // ── PILL ──────────────────────────────────────────────────────────
  if (shape === "pill") {
    return (
      <div
        style={{
          ...surfaceFor(osFrost),
          display: "flex",
          alignItems: "center",
          gap: 11,
          height: fill ? "100%" : 52,
          padding: "0 16px 0 11px",
          borderRadius: 999,
          minWidth: fill ? 0 : 244,
          width: fill ? "100%" : (width ?? "auto"),
          ...(fill ? { boxShadow: "none" } : null),
          fontFamily: "var(--font-ui)",
        }}
      >
        <Glyph state={state} />
        <Center state={state} levels={levels} error={error} />
        <Meta state={state} value={rightMeta} />
      </div>
    );
  }

  // ── ORB ───────────────────────────────────────────────────────────
  if (shape === "orb") {
    const meta = STATE_META[state];
    const center: ReactNode = (() => {
      switch (state) {
        case "idle":
          return <span style={{ color: "var(--ink-soft)" }}>{Icons.mic({ size: 24 })}</span>;
        case "listening":
          return <Waveform active bars={7} height={34} width={3.5} gap={3.5} color="var(--ink)" levels={levels} />;
        case "transcribing":
          return <Spinner size={26} stroke={2.4} color="var(--ink-soft)" />;
        case "polishing":
          return (
            <span style={{ color: "var(--accent)", display: "inline-flex", animation: "mm-breathe 1.4s ease-in-out infinite" }}>
              {Icons.sparkle({ size: 26 })}
            </span>
          );
        case "done":
          return (
            <span style={{ color: "var(--ok)", display: "inline-flex", animation: "mm-pop .4s ease-out" }}>
              {Icons.check({ size: 30, sw: 2.4 })}
            </span>
          );
        case "error":
          return (
            <span style={{ color: "var(--error, #e05252)", display: "inline-flex", animation: "mm-pop .35s ease-out" }}>
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          );
      }
    })();
    return (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12, fontFamily: "var(--font-ui)" }}>
        <div style={{ position: "relative", width: 92, height: 92, display: "grid", placeItems: "center" }}>
          {state === "listening" &&
            [0, 0.9].map((d, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "1.5px solid var(--accent)",
                  animation: `mm-ring 2.1s ease-out ${d}s infinite`,
                }}
              />
            ))}
          <div style={{ ...frost, position: "absolute", inset: 0, borderRadius: "50%", display: "grid", placeItems: "center" }}>
            {center}
          </div>
        </div>
        <div
          style={{
            ...frost,
            height: 26,
            padding: "0 11px",
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color:
                state === "done" ? "var(--ink)" :
                state === "error" ? "var(--error, #e05252)" :
                "var(--ink-soft)",
            }}
          >
            {state === "error" ? ((error ? error.slice(0, 40) : null) ?? meta.label ?? "Couldn't transcribe") : (meta.label ?? "Listening")}
          </span>
          {(rightMeta ?? meta.right) && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color:
                  state === "listening" ? "var(--accent)" :
                  state === "error" ? "var(--error, #e05252)" :
                  "var(--ink-faint)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {rightMeta ?? meta.right}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── BAR ───────────────────────────────────────────────────────────
  return (
    <div
      style={{
        ...surfaceFor(osFrost),
        display: "flex",
        alignItems: "center",
        gap: 13,
        height: fill ? "100%" : 56,
        padding: "0 16px 0 13px",
        borderRadius: "var(--radius)",
        width: fill ? "100%" : (width ?? "100%"),
        ...(fill ? { boxShadow: "none" } : null),
        fontFamily: "var(--font-ui)",
      }}
    >
      <Glyph state={state} size={32} />
      <Center state={state} levels={levels} error={error} />
      <span style={{ width: 1, height: 22, background: "var(--line)", flex: "0 0 auto" }} />
      <Meta state={state} value={rightMeta} />
    </div>
  );
}
