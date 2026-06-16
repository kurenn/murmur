import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { CONFIG_DEFAULTS } from "../state/config";
import { App } from "./App";

function mockBackend(overrides: Record<string, unknown>) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "get_config":
        return { ...CONFIG_DEFAULTS, ...overrides };
      case "model_downloaded":
      case "accessibility_trusted":
        return true;
      case "get_history":
      case "list_input_devices":
        return [];
      default:
        return undefined;
    }
  });
}

describe("App onboarding gate", () => {
  it("renders Onboarding when not onboarded", async () => {
    mockBackend({ onboarded: false });
    render(<App />);
    expect(await screen.findByText("How should I call you?")).toBeInTheDocument();
  });

  it("renders the dashboard (greeting with the name) when onboarded", async () => {
    mockBackend({ onboarded: true, userName: "Ada" });
    render(<App />);
    // greeting "Good <time>, Ada" + sidebar "Ada"
    expect(await screen.findAllByText(/Ada/)).not.toHaveLength(0);
    expect(screen.queryByText("How should I call you?")).not.toBeInTheDocument();
  });
});
