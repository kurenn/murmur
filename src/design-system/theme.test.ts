import { describe, it, expect } from "vitest";
import { applyTheme, MM_THEMES, MM_FONTS, MM_DENSITY, THEME_DEFAULTS } from "./theme";

describe("theme maps", () => {
  it("light and dark share the same variable keys", () => {
    expect(Object.keys(MM_THEMES.light).sort()).toEqual(Object.keys(MM_THEMES.dark).sort());
    expect(MM_THEMES.light["--bg"]).toMatch(/^oklch/);
  });
  it("Clean pairing is the design's Hanken Grotesk; density is scaled", () => {
    expect(MM_FONTS.Clean.ui).toContain("Hanken Grotesk");
    expect(MM_DENSITY.Regular).toBe(1);
    expect(MM_DENSITY.Compact).toBeLessThan(1);
  });
});

describe("applyTheme", () => {
  it("writes CSS custom properties + data-theme to the root", () => {
    const root = document.documentElement;
    applyTheme({ ...THEME_DEFAULTS, dark: true, radius: 20 });
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.style.getPropertyValue("--bg")).toBe(MM_THEMES.dark["--bg"]);
    expect(root.style.getPropertyValue("--font-ui")).toContain("Hanken Grotesk");
    expect(root.style.getPropertyValue("--radius")).toBe("20px");
    applyTheme({ ...THEME_DEFAULTS, dark: false });
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(root.style.getPropertyValue("--bg")).toBe(MM_THEMES.light["--bg"]);
  });
});
