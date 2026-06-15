import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "../design-system/fonts.css";
import "../design-system/tokens.css";
import "../design-system/native.css";
import "../design-system/keyframes.css";
import { applyTheme, THEME_DEFAULTS } from "../design-system/theme";
import { getConfig, onConfigChanged, setConfig, type AppConfig } from "../state/config";
import { installNativeBehaviors } from "../native";
import { Dashboard } from "../components/Dashboard";
import { Onboarding } from "../components/Onboarding";

installNativeBehaviors();

// Apply defaults immediately (no flash) before the persisted config loads.
applyTheme(THEME_DEFAULTS);
// On macOS the window is transparent (rounded corners), so paint the body
// transparent; elsewhere paint the solid background.
const onMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
document.body.style.background = onMac ? "transparent" : "var(--bg)";

function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);

  useEffect(() => {
    let un: (() => void) | undefined;
    getConfig().then((c) => {
      applyTheme(c.theme);
      setCfg(c);
    });
    onConfigChanged((c) => {
      applyTheme(c.theme); // theme is CSS variables — no React work needed
      // Only re-render for the few fields this top-level view depends on, so a
      // settings save doesn't trigger a full-tree reconciliation.
      setCfg((prev) =>
        prev &&
        prev.onboarded === c.onboarded &&
        prev.userName === c.userName &&
        prev.theme.productName === c.theme.productName
          ? prev
          : c,
      );
    }).then((u) => (un = u));
    return () => un?.();
  }, []);

  if (!cfg) return null;

  if (!cfg.onboarded) {
    return (
      <Onboarding
        initialName={cfg.userName}
        onDone={(name) => {
          const next = { ...cfg, userName: name, onboarded: true };
          setCfg(next); // optimistic — switch to the dashboard immediately
          setConfig(next).catch(() => {});
        }}
      />
    );
  }

  return <Dashboard productName={cfg.theme.productName} userName={cfg.userName} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
