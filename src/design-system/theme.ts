// theme.ts — theme variable maps, font pairings, density, and applyTheme().
// Ported from design/theme.jsx (MM_THEMES / MM_FONTS / MM_DENSITY / mmApplyTheme)
// and design/app.jsx (TWEAK_DEFAULTS). These prefs are user-tunable and persist
// to the Rust-side config (tauri-plugin-store); applyTheme() writes them as inline
// CSS custom properties on a root element so the change is live and per-window.

export type FontPairing = "Clean" | "Editorial" | "Geometric";
export type Density = "Compact" | "Regular" | "Comfy";

export interface ThemePrefs {
  productName: string;
  dark: boolean;
  fontPairing: FontPairing;
  /** corner radius in px, user-tunable 4–24 */
  radius: number;
  density: Density;
}

/** Defaults — from design/app.jsx TWEAK_DEFAULTS. */
export const THEME_DEFAULTS: ThemePrefs = {
  productName: "Murmur",
  dark: false,
  fontPairing: "Clean",
  radius: 16,
  density: "Regular",
};

type VarMap = Record<string, string>;

export const MM_THEMES: { light: VarMap; dark: VarMap } = {
  light: {
    "--bg": "oklch(0.958 0.0045 80)",
    "--surface": "oklch(0.998 0.0015 85)",
    "--surface-2": "oklch(0.95 0.005 80)",
    "--surface-3": "oklch(0.928 0.006 80)",
    "--ink": "oklch(0.245 0.008 70)",
    "--ink-soft": "oklch(0.47 0.008 70)",
    "--ink-faint": "oklch(0.64 0.006 70)",
    "--line": "oklch(0.9 0.005 80)",
    "--line-soft": "oklch(0.925 0.004 80)",
    "--accent": "oklch(0.60 0.13 248)",
    "--accent-soft": "oklch(0.60 0.13 248 / 0.12)",
    "--ok": "oklch(0.58 0.11 155)",
    "--shadow": "0 1px 2px rgba(40,34,26,0.05), 0 12px 34px rgba(40,34,26,0.10)",
    "--shadow-sm": "0 1px 2px rgba(40,34,26,0.06), 0 4px 14px rgba(40,34,26,0.07)",
  },
  dark: {
    "--bg": "oklch(0.175 0.006 70)",
    "--surface": "oklch(0.215 0.007 70)",
    "--surface-2": "oklch(0.255 0.008 70)",
    "--surface-3": "oklch(0.30 0.009 70)",
    "--ink": "oklch(0.945 0.004 85)",
    "--ink-soft": "oklch(0.74 0.006 85)",
    "--ink-faint": "oklch(0.56 0.007 80)",
    "--line": "oklch(0.33 0.009 70)",
    "--line-soft": "oklch(0.28 0.008 70)",
    "--accent": "oklch(0.74 0.12 246)",
    "--accent-soft": "oklch(0.74 0.12 246 / 0.16)",
    "--ok": "oklch(0.74 0.12 158)",
    "--shadow": "0 1px 2px rgba(0,0,0,0.4), 0 18px 48px rgba(0,0,0,0.5)",
    "--shadow-sm": "0 1px 2px rgba(0,0,0,0.4), 0 6px 18px rgba(0,0,0,0.4)",
  },
};

// The native macOS UI stack. "Clean" maps to this so the app reads as a real
// Mac app by default; Editorial/Geometric still offer the brand web fonts.
const SYSTEM_UI =
  '-apple-system, system-ui, "SF Pro Text", BlinkMacSystemFont, "Segoe UI", sans-serif';
const SYSTEM_DISPLAY =
  '-apple-system, system-ui, "SF Pro Display", BlinkMacSystemFont, "Segoe UI", sans-serif';

export const MM_FONTS: Record<FontPairing, { ui: string; display: string }> = {
  Clean: {
    ui: SYSTEM_UI,
    display: SYSTEM_DISPLAY,
  },
  Editorial: {
    ui: '"Hanken Grotesk", system-ui, sans-serif',
    display: '"Newsreader", Georgia, serif',
  },
  Geometric: {
    ui: '"Schibsted Grotesk", system-ui, sans-serif',
    display: '"Schibsted Grotesk", system-ui, sans-serif',
  },
};

export const MM_DENSITY: Record<Density, number> = {
  Compact: 0.85,
  Regular: 1,
  Comfy: 1.16,
};

const MONO = 'ui-monospace, "SF Mono", "Menlo", "Spline Sans Mono", monospace';

/** Write a ThemePrefs object onto a root element's inline CSS variables. */
export function applyTheme(t: ThemePrefs, root: HTMLElement = document.documentElement): void {
  const vars = MM_THEMES[t.dark ? "dark" : "light"];
  for (const k in vars) root.style.setProperty(k, vars[k]);

  const f = MM_FONTS[t.fontPairing] ?? MM_FONTS.Clean;
  root.style.setProperty("--font-ui", f.ui);
  root.style.setProperty("--font-display", f.display);
  root.style.setProperty("--font-mono", MONO);

  root.style.setProperty("--radius", `${t.radius}px`);
  root.style.setProperty("--radius-sm", `${Math.max(4, Math.round(t.radius * 0.62))}px`);
  root.style.setProperty("--dsc", String(MM_DENSITY[t.density] ?? 1));

  root.setAttribute("data-theme", t.dark ? "dark" : "light");
}
