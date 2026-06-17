// App — the entry component. Loads config, gates first-run onboarding vs the
// dashboard, and keeps the theme live without re-rendering the tree on every
// settings save (only when a top-level-visible field changes).

import { useEffect, useState } from "react";
import { applyTheme } from "../design-system/theme";
import { getConfig, onConfigChanged, setConfig, type AppConfig } from "../state/config";
import { Dashboard } from "./Dashboard";
import { Onboarding } from "./Onboarding";

export function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);

  useEffect(() => {
    let un: (() => void) | undefined;
    getConfig().then((c) => {
      applyTheme(c.theme);
      setCfg(c);
    });
    onConfigChanged((c) => {
      applyTheme(c.theme); // theme is CSS variables — no React work needed
      // Only re-render for the few fields this top-level view depends on.
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
        onDone={(name, model) => {
          const next = { ...cfg, userName: name, model, onboarded: true };
          setCfg(next); // optimistic — switch to the dashboard immediately
          setConfig(next).catch(() => {});
        }}
      />
    );
  }

  return <Dashboard productName={cfg.theme.productName} userName={cfg.userName} />;
}
