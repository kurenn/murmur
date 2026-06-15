import React from "react";
import ReactDOM from "react-dom/client";
import "../design-system/fonts.css";
import "../design-system/tokens.css";
import "../design-system/native.css";
import "../design-system/keyframes.css";
import { applyTheme, THEME_DEFAULTS } from "../design-system/theme";
import { getConfig, onConfigChanged } from "../state/config";
import { installNativeBehaviors } from "../native";
import { Dashboard } from "../components/Dashboard";

installNativeBehaviors();

// Apply defaults immediately (no flash), then hydrate from persisted config and
// keep the theme live as settings change.
applyTheme(THEME_DEFAULTS);
// On macOS the window carries vibrancy (frosted sidebar), so the body must be
// transparent for the material to show; elsewhere paint the solid background.
const onMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
document.body.style.background = onMac ? "transparent" : "var(--bg)";

let productName = THEME_DEFAULTS.productName;
getConfig().then((c) => {
  applyTheme(c.theme);
  productName = c.theme.productName;
  render();
});
// On live config changes, re-apply the theme (CSS variables — no React work) and
// only re-render the tree when productName, the one React-visible prop, changes.
// Re-rendering the whole app on every save caused a reconciliation storm that
// froze the window.
onConfigChanged((c) => {
  applyTheme(c.theme);
  if (c.theme.productName !== productName) {
    productName = c.theme.productName;
    render();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
function render() {
  root.render(
    <React.StrictMode>
      <Dashboard productName={productName} />
    </React.StrictMode>,
  );
}
render();
