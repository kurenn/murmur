import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useElapsedSeconds, fmtClock } from "./useElapsed";

describe("useElapsedSeconds", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts up while active and resets when it stops", () => {
    const { result, rerender } = renderHook(({ active }) => useElapsedSeconds(active), {
      initialProps: { active: true },
    });
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(3);
    // Regression: it actually advances (was hardcoded to "0:04").
    rerender({ active: false });
    expect(result.current).toBe(0);
  });
});

describe("fmtClock", () => {
  it("formats whole seconds as m:ss", () => {
    expect(fmtClock(0)).toBe("0:00");
    expect(fmtClock(7)).toBe("0:07");
    expect(fmtClock(83)).toBe("1:23");
    expect(fmtClock(605)).toBe("10:05");
  });
});
