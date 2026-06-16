import { describe, it, expect, vi, afterEach } from "vitest";
import { relTime, timeGreeting, computeStats, codeToKey } from "./Dashboard";

afterEach(() => vi.useRealTimers());

describe("relTime", () => {
  const NOW = 1_700_000_000; // unix seconds
  it("formats buckets relative to now", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
    expect(relTime(NOW)).toBe("just now");
    expect(relTime(NOW - 120)).toBe("2m ago");
    expect(relTime(NOW - 3 * 3600)).toBe("3h ago");
    expect(relTime(NOW - 26 * 3600)).toBe("Yesterday");
    expect(relTime(NOW - 3 * 86400)).toBe("3d ago");
  });
});

describe("timeGreeting", () => {
  it("changes with the hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9));
    expect(timeGreeting()).toBe("Good morning");
    vi.setSystemTime(new Date(2026, 0, 1, 14));
    expect(timeGreeting()).toBe("Good afternoon");
    vi.setSystemTime(new Date(2026, 0, 1, 20));
    expect(timeGreeting()).toBe("Good evening");
  });
});

describe("computeStats", () => {
  it("sums today's words and averages wpm", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    const now = Math.floor(Date.now() / 1000);
    const mk = (words: number, wpm: number, created_at: number) => ({
      text: "x",
      words,
      source: "Dictation",
      wpm,
      duration: "0:01",
      created_at,
    });
    const s = computeStats([mk(10, 100, now - 60), mk(30, 50, now - 3600)]);
    expect(s.wordsToday).toBe(40);
    expect(s.avgWpm).toBe(75);
    expect(s.minutesSaved).toBe(1); // 40 words / 40 wpm baseline
    expect(s.streak).toBeGreaterThanOrEqual(1);
  });

  it("returns zeros for no entries", () => {
    const s = computeStats([]);
    expect(s).toEqual({ wordsToday: 0, avgWpm: 0, minutesSaved: 0, streak: 0 });
  });
});

describe("codeToKey", () => {
  it("maps KeyboardEvent.code to accelerator tokens", () => {
    expect(codeToKey("KeyA")).toBe("A");
    expect(codeToKey("Space")).toBe("Space");
    expect(codeToKey("Digit5")).toBe("5");
    expect(codeToKey("ArrowUp")).toBe("Up");
    expect(codeToKey("F2")).toBe("F2");
    expect(codeToKey("Comma")).toBe(",");
    expect(codeToKey("Minus")).toBe("-");
  });
  it("returns null for modifier-only / unknown codes", () => {
    expect(codeToKey("ShiftLeft")).toBeNull();
    expect(codeToKey("Nonsense")).toBeNull();
  });
});
