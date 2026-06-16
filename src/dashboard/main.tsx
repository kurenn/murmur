import React from "react";
import ReactDOM from "react-dom/client";
import "../design-system/fonts.css";
import "../design-system/tokens.css";
import "../design-system/native.css";
import "../design-system/keyframes.css";
import { applyTheme, THEME_DEFAULTS } from "../design-system/theme";
import { installNativeBehaviors } from "../native";
import { App } from "../components/App";

installNativeBehaviors();

// Apply defaults immediately (no flash) before the persisted config loads.
applyTheme(THEME_DEFAULTS);
// On macOS the window is transparent (rounded corners), so paint the body
// transparent; elsewhere paint the solid background.
const onMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
document.body.style.background = onMac ? "transparent" : "var(--bg)";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
