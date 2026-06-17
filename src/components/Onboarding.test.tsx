import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { Onboarding } from "./Onboarding";

function mockBackend() {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "model_downloaded" || cmd === "accessibility_trusted") return true;
    return undefined;
  });
}

describe("Onboarding flow", () => {
  it("walks name → setup (all 5 models) → welcome → onDone", async () => {
    const user = userEvent.setup();
    mockBackend();
    const onDone = vi.fn();
    render(<Onboarding initialName="" onDone={onDone} />);

    // Step 1 — name
    expect(screen.getByText("How should I call you?")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Your name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Step 2 — all five models + mic + accessibility
    expect(await screen.findByText("Tiny")).toBeInTheDocument();
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getByText("Small")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Large v3")).toBeInTheDocument();
    expect(screen.getByText("Microphone")).toBeInTheDocument();
    // model already downloaded → "Ready", Continue enabled
    await screen.findByText("Ready");
    // pick large-v3 — the selection must survive into the saved config
    await user.click(screen.getByText("Large v3"));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Step 3 — welcome → finish
    expect(await screen.findByText(/You.re all set/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start dictating" }));
    expect(onDone).toHaveBeenCalledWith("Ada", "large-v3");
  });

  it("disables Continue on step 1 until a name is entered", async () => {
    mockBackend();
    render(<Onboarding initialName="" onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
