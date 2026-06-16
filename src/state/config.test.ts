import { describe, it, expect, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { CONFIG_DEFAULTS, getConfig } from "./config";

describe("CONFIG_DEFAULTS", () => {
  it("has the expected first-run shape", () => {
    expect(CONFIG_DEFAULTS.userName).toBe("");
    expect(CONFIG_DEFAULTS.onboarded).toBe(false);
    expect(CONFIG_DEFAULTS.model).toBe("base");
    expect(CONFIG_DEFAULTS.transcribe.enabled).toBe(false);
    expect(CONFIG_DEFAULTS.theme.dark).toBe(false);
  });
});

describe("getConfig", () => {
  it("returns the backend config via invoke('get_config')", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ...CONFIG_DEFAULTS, userName: "Ada", onboarded: true });
    const c = await getConfig();
    expect(invoke).toHaveBeenCalledWith("get_config");
    expect(c.userName).toBe("Ada");
    expect(c.onboarded).toBe(true);
  });
});
