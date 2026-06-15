// hooks.ts — shared renderer hooks.
// useTypewriter: reveals `text` char-by-char with organic jitter, for the
// auto-edit polished-text reveal. Ported from design/theme.jsx useMMTypewriter.
// Returns [visibleSlice, done]. Restarts whenever `runKey` changes.

import { useEffect, useState } from "react";

export interface TypewriterOpts {
  /** base ms per char; actual is speed + random(0, speed*0.7) */
  speed?: number;
  startDelay?: number;
  runKey?: number | string;
  play?: boolean;
}

export function useTypewriter(
  text: string,
  { speed = 26, startDelay = 0, runKey = 0, play = true }: TypewriterOpts = {},
): [string, boolean] {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!play) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setN(0);

    const begin = setTimeout(function step() {
      if (!alive) return;
      setN((c) => {
        const next = Math.min(text.length, c + 1);
        if (next < text.length) timer = setTimeout(step, speed + Math.random() * speed * 0.7);
        return next;
      });
    }, startDelay);

    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(begin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, runKey, play]);

  return [text.slice(0, n), n >= text.length];
}
