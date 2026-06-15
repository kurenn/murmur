// primitives.tsx — shared animated primitives, ported 1:1 from design/theme.jsx
// and design/overlay.jsx. Waveform, Dots, Spinner, LiveDot.
//
// The Waveform is seeded (per-bar base height / duration / delay) so the motion
// looks organic. When `levels` is provided (real mic amplitude, 0..1 per bar) it
// drives scaleY directly instead of the canned animation — this is how the live
// overlay waveform reflects the analyser stream.

import type { CSSProperties } from "react";

const MM_SEED = Array.from({ length: 48 }, (_, i) => ({
  base: 0.26 + ((Math.sin(i * 1.7) + 1) / 2) * 0.42,
  dur: 0.62 + ((Math.cos(i * 0.9) + 1) / 2) * 0.62,
  delay: (i * 0.067) % 1.0,
}));

export interface WaveformProps {
  active?: boolean;
  bars?: number;
  height?: number;
  width?: number;
  gap?: number;
  color?: string;
  round?: boolean;
  /** Optional live amplitude per bar (0..1). When set, drives scaleY directly. */
  levels?: number[];
  style?: CSSProperties;
}

export function Waveform({
  active = true,
  bars = 24,
  height = 30,
  width = 3,
  gap = 3,
  color = "currentColor",
  round = true,
  levels,
  style,
}: WaveformProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap, height, ...style }}>
      {Array.from({ length: bars }).map((_, i) => {
        const s = MM_SEED[i % MM_SEED.length];
        const live = levels?.[i];
        const driven = live !== undefined;
        const scale = driven ? Math.max(0.12, Math.min(1, live)) : active ? s.base : 0.2;
        return (
          <span
            key={i}
            style={{
              display: "block",
              width,
              height: "100%",
              flex: "0 0 auto",
              background: color,
              borderRadius: round ? width : 1,
              transformOrigin: "center",
              transform: `scaleY(${scale})`,
              animation: driven
                ? "none"
                : active
                  ? `mm-wf ${s.dur}s ease-in-out ${s.delay}s infinite`
                  : `mm-wf-idle 3.4s ease-in-out ${s.delay}s infinite`,
              transition: driven ? "transform 0.06s linear" : undefined,
              ["--b" as string]: s.base,
            }}
          />
        );
      })}
    </div>
  );
}

export interface DotsProps {
  size?: number;
  gap?: number;
  color?: string;
}

export function Dots({ size = 5, gap = 5, color = "currentColor" }: DotsProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: color,
            animation: `mm-dot 1.1s ease-in-out ${i * 0.16}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export interface SpinnerProps {
  size?: number;
  stroke?: number;
  color?: string;
}

export function Spinner({ size = 16, stroke = 2, color = "currentColor" }: SpinnerProps) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${stroke}px solid color-mix(in oklch, ${color} 22%, transparent)`,
        borderTopColor: color,
        animation: "mm-spin 0.7s linear infinite",
      }}
    />
  );
}

export interface LiveDotProps {
  size?: number;
}

/** Accent dot with two concentric pulse rings (mm-ring, staggered 0s / 0.9s). */
export function LiveDot({ size = 11 }: LiveDotProps) {
  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {[0, 0.9].map((d, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "var(--accent)",
            animation: `mm-ring 1.8s ease-out ${d}s infinite`,
          }}
        />
      ))}
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--accent)",
          position: "relative",
        }}
      />
    </span>
  );
}
