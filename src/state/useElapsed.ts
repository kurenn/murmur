import { useEffect, useState } from "react";

/** Seconds elapsed since `active` last became true; resets to 0 when inactive.
 * Drives the overlay's live recording timer while listening. */
export function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

/** Format whole seconds as `M:SS`. */
export function fmtClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
