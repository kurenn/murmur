import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { CONFIG_DEFAULTS } from "../state/config";
import { Dashboard } from "./Dashboard";

type Hist = { text: string; words: number; source: string; wpm: number; duration: string; created_at: number };

function mockBackend(config: Record<string, unknown>, history: Hist[] = []) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "get_config":
        return { ...CONFIG_DEFAULTS, ...config };
      case "get_history":
        return history;
      case "model_downloaded":
      case "accessibility_trusted":
        return true;
      case "list_input_devices":
        return ["Default"];
      default:
        return undefined;
    }
  });
}

describe("Settings (regression: hooks-order black page)", () => {
  it("renders without throwing when config loads", async () => {
    mockBackend({});
    render(<Dashboard initialView="settings" userName="x" />);
    // The Rules-of-Hooks crash would unmount the tree before this appears.
    expect(await screen.findByText("Voice & model")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });
});

describe("Home", () => {
  const now = Math.floor(Date.now() / 1000);
  const history: Hist[] = [
    { text: "Hello world", words: 2, source: "Dictation", wpm: 100, duration: "0:02", created_at: now - 60 },
    { text: "Goodbye now", words: 2, source: "Dictation", wpm: 90, duration: "0:01", created_at: now - 120 },
  ];

  it("copies a transcript via the copy_text command", async () => {
    const user = userEvent.setup();
    mockBackend({}, history);
    render(<Dashboard initialView="home" userName="x" />);
    await screen.findByText("Hello world");
    // Rows render newest-first; the first copy button is "Hello world".
    const copyButtons = screen.getAllByLabelText("Copy transcript");
    await user.click(copyButtons[0]);
    expect(invoke).toHaveBeenCalledWith("copy_text", { text: "Hello world" });
  });

  it("filters the list as you search (case-insensitive)", async () => {
    const user = userEvent.setup();
    mockBackend({}, history);
    render(<Dashboard initialView="home" userName="x" />);
    await screen.findByText("Hello world");
    await user.type(screen.getByPlaceholderText("Search transcripts"), "GOOD");
    expect(screen.queryByText("Hello world")).not.toBeInTheDocument();
    expect(screen.getByText("Goodbye now")).toBeInTheDocument();
  });
});

describe("Settings Field (regression: per-keystroke save freeze)", () => {
  it("only persists on blur, not on each keystroke", async () => {
    const user = userEvent.setup();
    mockBackend({ transcribe: { ...CONFIG_DEFAULTS.transcribe, enabled: true } });
    render(<Dashboard initialView="settings" userName="x" />);
    const input = await screen.findByPlaceholderText("http://192.168.1.50:8000");
    await user.clear(input);
    await user.type(input, "http://x:8000");
    expect(invoke).not.toHaveBeenCalledWith("set_config", expect.anything());
    await user.tab(); // blur commits
    expect(invoke).toHaveBeenCalledWith("set_config", expect.anything());
  });
});
