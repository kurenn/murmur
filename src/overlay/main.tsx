import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "../design-system/fonts.css";
import "../design-system/tokens.css";
import "../design-system/native.css";
import "../design-system/keyframes.css";
import { applyTheme, THEME_DEFAULTS } from "../design-system/theme";
import { Overlay } from "../components/Overlay";
import { useDictation } from "../state/useDictation";
import { getConfig, isTauri, onConfigChanged } from "../state/config";
import { installNativeBehaviors } from "../native";
import type { OverlayShape } from "../state/dictation";

installNativeBehaviors();

// In the real shell, pill/bar windows are sized to the widget, so the widget
// fills the window. macOS (vibrancy) and Windows (acrylic) get true OS desktop
// blur → a lighter surface; Linux/WebKitGTK falls back to the CSS frost card.
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isMac = /Mac/.test(ua);
const isWindows = /Win/.test(ua);

// The overlay window is transparent; never paint a background here.
applyTheme(THEME_DEFAULTS);
document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";

function OverlayApp() {
  const { state, levels, result, error } = useDictation();
  // URL ?shape= forces a shape for previewing; otherwise it comes from config.
  const forced = new URLSearchParams(location.search).get("shape") as OverlayShape | null;
  const [shape, setShape] = useState<OverlayShape>(forced ?? "pill");

  useEffect(() => {
    if (forced) return;
    let un: (() => void) | undefined;
    getConfig().then((c) => {
      applyTheme(c.theme);
      setShape(c.overlayShape);
    });
    onConfigChanged((c) => {
      applyTheme(c.theme);
      setShape(c.overlayShape);
    }).then((u) => (un = u));
    return () => un?.();
  }, [forced]);

  // Live recording timer: count up from 0:00 while listening (the listening
  // state's right-meta). Resets whenever listening ends.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (state !== "listening") {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [state]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const rightMeta =
    state === "listening"
      ? fmtTime(elapsed)
      : state === "done" && result
        ? `${result.words} wds`
        : undefined;
  // pill/bar windows are sized to the widget in the shell → fill them.
  const fill = isTauri && (shape === "pill" || shape === "bar");
  // macOS vibrancy / Windows acrylic provide real desktop blur; Linux does not.
  const osFrost = fill && (isMac || isWindows);
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        placeItems: fill ? "stretch" : "center",
        padding: fill ? 0 : shape === "bar" ? 0 : 8,
        // Fade with the lifecycle: invisible at idle, visible while dictating.
        // Rust shows the window before the first non-idle state (fade in) and
        // delays hide() until this fade-out completes.
        opacity: state === "idle" ? 0 : 1,
        transform: state === "idle" ? "scale(0.96)" : "scale(1)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        transformOrigin: "center bottom",
      }}
    >
      <Overlay
        shape={shape}
        state={state}
        levels={levels}
        rightMeta={rightMeta}
        fill={fill}
        osFrost={osFrost}
        width={!fill && shape === "pill" ? 280 : undefined}
        error={error}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
