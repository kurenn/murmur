// Vitest setup — jsdom matchers + mocks for the Tauri API modules so components
// (which import @tauri-apps/api/* dynamically) render under test.

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Make config.ts's `isTauri` true so components take the real (mocked) code path
// instead of the browser fallback.
(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};

// Default Tauri mocks. Tests override per-case, e.g.
//   vi.mocked(invoke).mockImplementation(async (cmd) => ...)
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    hide: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
