// AutoEdit.tsx — the AI auto-edit feature surface. Ported from design/autoedit.jsx.
// <AutoEditHero> animates a raw, rambly transcript into clean prose: filler words
// fade out, then the polished sentence types itself on the right. Content is
// parameterized so the real pipeline can feed actual raw→polished output; it
// falls back to the spec demo content for onboarding/marketing surfaces.

import { useEffect, useState } from "react";
import { Icons, type IconName } from "../design-system/icons";
import { Dots } from "../design-system/primitives";

export interface RawSegment {
  t: string;
  kill: boolean;
}

const DEMO_RAW: RawSegment[] = [
  { t: "um ", kill: true },
  { t: "so ", kill: false },
  { t: "I was thinking ", kill: false },
  { t: "like ", kill: true },
  { t: "maybe we could move ", kill: false },
  { t: "the ", kill: true },
  { t: "the launch to friday ", kill: false },
  { t: "and ", kill: false },
  { t: "uh ", kill: true },
  { t: "send the recap notes tonight ", kill: false },
  { t: "if that works ", kill: false },
  { t: "i guess", kill: true },
];
const DEMO_POLISHED = "Let’s move the launch to Friday and send the recap notes tonight, if that works.";
const DEMO_CHIPS = ["4 fillers removed", "casing fixed", "punctuation added"];

type Phase = "show" | "strike" | "type" | "done";

export interface AutoEditHeroProps {
  raw?: RawSegment[];
  polished?: string;
  chips?: string[];
  productName?: string;
  modelNote?: string;
  /** loop the demo animation (default true). Set false to drive externally. */
  loop?: boolean;
}

export function AutoEditHero({
  raw = DEMO_RAW,
  polished = DEMO_POLISHED,
  chips = DEMO_CHIPS,
  productName = "Murmur",
  modelNote = "whisper-large-v3 · on-device",
  loop = true,
}: AutoEditHeroProps) {
  const [phase, setPhase] = useState<Phase>("show");
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (!loop) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        const id = setTimeout(r, ms);
        timers.push(id);
      });
    (async function run() {
      while (alive) {
        setPhase("show");
        setTyped(0);
        await wait(2300);
        if (!alive) return;
        setPhase("strike");
        await wait(1500);
        if (!alive) return;
        setPhase("type");
        for (let k = 0; k <= polished.length; k++) {
          if (!alive) return;
          setTyped(k);
          await wait(16 + Math.random() * 24);
        }
        setPhase("done");
        await wait(2600);
        if (!alive) return;
      }
    })();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [loop, polished]);

  const cleaned = phase !== "show";
  const showRight = phase === "type" || phase === "done";

  const col: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: "22px 26px",
    display: "flex",
    flexDirection: "column",
  };
  const head: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--ink-faint)",
    marginBottom: 16,
  };

  return (
    <div style={{ width: "100%", height: "100%", background: "var(--surface)", display: "flex", flexDirection: "column", fontFamily: "var(--font-ui)" }}>
      <div style={{ flex: 1, display: "flex", position: "relative", minHeight: 0 }}>
        {/* RAW */}
        <div style={col}>
          <div style={head}>
            <span style={{ color: "var(--ink-faint)" }}>{Icons.mic({ size: 14 })}</span>
            What you said
          </div>
          <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 16, lineHeight: 1.85, color: "var(--ink-soft)", letterSpacing: "-0.01em" }}>
            {raw.map((w, i) => (
              <span
                key={i}
                style={{
                  color: w.kill ? "var(--ink-faint)" : "inherit",
                  textDecoration: w.kill ? "line-through" : "none",
                  textDecorationColor: "color-mix(in oklch, var(--accent) 60%, transparent)",
                  textDecorationThickness: "1.5px",
                  opacity: w.kill && cleaned ? 0.18 : w.kill ? 0.7 : 1,
                  transition: "opacity .5s ease",
                }}
              >
                {w.t}
              </span>
            ))}
          </p>
        </div>

        {/* divider + transform badge */}
        <div style={{ width: 0, borderLeft: "0.5px solid var(--line)", position: "relative" }}>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              transform: "translate(-50%,-50%)",
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--surface)",
              border: "0.5px solid var(--line)",
              boxShadow: "var(--shadow-sm)",
              display: "grid",
              placeItems: "center",
              color: "var(--accent)",
              animation: phase === "strike" || phase === "type" ? "mm-breathe 1.5s ease-in-out infinite" : "none",
            }}
          >
            {Icons.sparkle({ size: 20 })}
          </div>
        </div>

        {/* POLISHED */}
        <div style={{ ...col, background: "color-mix(in oklch, var(--accent-soft) 55%, transparent)" }}>
          <div style={{ ...head, color: "var(--accent)" }}>
            {Icons.sparkle({ size: 14 })}
            {productName + " wrote"}
          </div>
          <div style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1.7, color: "var(--ink)", letterSpacing: "-0.01em", fontWeight: 440 }}>
            {showRight ? (
              <>
                {polished.slice(0, typed)}
                {phase === "type" && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: "1.05em",
                      background: "var(--accent)",
                      verticalAlign: "text-bottom",
                      marginLeft: 1,
                      animation: "mm-caret 1s steps(1) infinite",
                    }}
                  />
                )}
              </>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, color: "var(--accent)", fontFamily: "var(--font-ui)", fontSize: 14 }}>
                Polishing <Dots size={4} gap={4} />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* footer chips */}
      <div style={{ height: 50, flex: "0 0 auto", borderTop: "0.5px solid var(--line)", display: "flex", alignItems: "center", gap: 8, padding: "0 26px" }}>
        {chips.map((c, i) => (
          <span
            key={c}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 26,
              padding: "0 11px",
              borderRadius: 999,
              background: "var(--surface-2)",
              border: "0.5px solid var(--line)",
              fontSize: 11.5,
              fontWeight: 500,
              color: "var(--ink-soft)",
              opacity: phase === "done" ? 1 : 0,
              transform: phase === "done" ? "none" : "translateY(4px)",
              transition: `opacity .4s ease ${i * 0.08}s, transform .4s ease ${i * 0.08}s`,
            }}
          >
            <span style={{ color: "var(--ok)", display: "inline-flex" }}>{Icons.check({ size: 12, sw: 2.4 })}</span>
            {c}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-faint)" }}>{modelNote}</span>
      </div>
    </div>
  );
}

// ── Capability list ───────────────────────────────────────────────────
interface Fix {
  icon: IconName;
  title: string;
  raw: string;
  clean: string;
}

const FIXES: Fix[] = [
  { icon: "sparkle", title: "Removes filler & false starts", raw: "um, so like, I was—", clean: "I was" },
  { icon: "check", title: "Fixes grammar & casing", raw: "me and him is going friday", clean: "He and I are going Friday" },
  { icon: "waveDot", title: "Adds punctuation", raw: "wait really thats great", clean: "Wait, really? That’s great." },
  { icon: "command", title: "Formats on command", raw: "“make that three bullets”", clean: "• one\n• two\n• three" },
];

export function FixList() {
  return (
    <div style={{ width: "100%", height: "100%", background: "var(--surface)", padding: "24px 24px", display: "flex", flexDirection: "column", fontFamily: "var(--font-ui)" }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: 3 }}>What it cleans up</div>
      <div style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 18 }}>Every transcript, automatically — no editing pass.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {FIXES.map((f) => (
          <div key={f.title} style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
            <span style={{ width: 30, height: 30, flex: "0 0 auto", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", marginTop: 1 }}>
              {Icons[f.icon]({ size: 15 })}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>{f.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.45 }}>
                <span style={{ color: "var(--ink-faint)", textDecoration: "line-through", textDecorationColor: "color-mix(in oklch, var(--accent) 50%, transparent)", whiteSpace: "pre-line" }}>{f.raw}</span>
                <span style={{ color: "var(--accent)", flex: "0 0 auto", display: "inline-flex", transform: "rotate(-90deg)" }}>{Icons.chevron({ size: 13, sw: 2 })}</span>
                <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{f.clean}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
