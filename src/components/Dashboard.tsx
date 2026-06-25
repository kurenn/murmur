// Dashboard.tsx — the windowed desktop app. Ported from design/dashboard.jsx
// (MMDesktopApp / MMHome / MMSettings and their building blocks). Settings
// controls hold local state here; M7 wires them to the Rust-backed config store.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icons, type IconName } from "../design-system/icons";
import { Waveform } from "../design-system/primitives";
import { getConfig, isTauri, setConfig, type AppConfig } from "../state/config";
import { appVersion, checkForUpdate, type PendingUpdate } from "../state/updater";

const TRAFFIC = ["#e06c5a", "#e3b341", "#5bb574"];

interface HistoryEntry {
  text: string;
  words: number;
  source: string;
  wpm: number;
  duration: string;
  created_at: number;
}

/** Format a unix-seconds timestamp as the design's relative time. */
export function relTime(createdAt: number): string {
  const diff = Math.max(0, Date.now() / 1000 - createdAt);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── window chrome ──────────────────────────────────────────────────────
// Real, working traffic lights styled in the app's own palette. Close hides the
// window to the tray (so "Open Murmur" can bring it back); minimize/zoom are the
// native window ops. onMouseDown stopPropagation keeps the title-bar drag region
// from swallowing the click.
export function TrafficLights() {
  const [hover, setHover] = useState(false);
  const ctl = async (action: "hide" | "minimize" | "toggleMaximize") => {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (action === "hide") await w.hide();
    else if (action === "minimize") await w.minimize();
    else await w.toggleMaximize();
  };
  const lights: { c: string; glyph: string; action: "hide" | "minimize" | "toggleMaximize"; label: string }[] = [
    { c: TRAFFIC[0], glyph: "✕", action: "hide", label: "Close" },
    { c: TRAFFIC[1], glyph: "–", action: "minimize", label: "Minimize" },
    { c: TRAFFIC[2], glyph: "+", action: "toggleMaximize", label: "Zoom" },
  ];
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {lights.map((l) => (
        <button
          key={l.c}
          aria-label={l.label}
          title={l.label}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => ctl(l.action)}
          style={{
            width: 12,
            height: 12,
            padding: 0,
            border: "none",
            borderRadius: "50%",
            background: l.c,
            cursor: "default",
            display: "grid",
            placeItems: "center",
            color: "rgba(0,0,0,0.5)",
            fontSize: 8,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          <span style={{ opacity: hover ? 1 : 0, transition: "opacity .1s" }}>{l.glyph}</span>
        </button>
      ))}
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: IconName; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "calc(8px * var(--dsc)) 10px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        cursor: "pointer",
        background: active ? "var(--surface-3)" : "transparent",
        color: active ? "var(--ink)" : "var(--ink-soft)",
        fontFamily: "var(--font-ui)",
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        transition: "background .12s, color .12s",
      }}
    >
      <span style={{ display: "inline-flex", color: active ? "var(--accent)" : "var(--ink-faint)" }}>{Icons[icon]({ size: 17 })}</span>
      {label}
    </button>
  );
}

// ── HOME ────────────────────────────────────────────────────────────────
function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div style={{ flex: 1, background: "var(--surface-2)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)", padding: "calc(16px * var(--dsc)) 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        <span style={{ fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 500 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export interface Recent {
  src: string;
  txt: string;
  t: string;
  wpm: number;
  dur: string;
}

async function copyToClipboard(text: string): Promise<void> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("copy_text", { text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}

function RecentRow({ r }: { r: Recent }) {
  const [hover, setHover] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyToClipboard(r.txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "calc(13px * var(--dsc)) 14px",
        borderRadius: "var(--radius-sm)",
        cursor: "default",
        background: hover ? "var(--surface-2)" : "transparent",
        transition: "background .12s",
      }}
    >
      <span style={{ width: 30, height: 30, flex: "0 0 auto", borderRadius: 8, background: "var(--surface-3)", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 600, color: "var(--ink-soft)" }}>
        {r.src.slice(0, 2)}
      </span>
      <div data-selectable style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.txt}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>{r.src} · {r.t}</div>
      </div>
      <button
        onClick={copy}
        title={copied ? "Copied" : "Copy transcript"}
        aria-label="Copy transcript"
        style={{
          flex: "0 0 auto",
          width: 28,
          height: 28,
          display: "grid",
          placeItems: "center",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          background: hover || copied ? "var(--surface-3)" : "transparent",
          color: copied ? "var(--ok)" : "var(--ink-faint)",
          opacity: hover || copied ? 1 : 0,
          transition: "opacity .12s, background .12s, color .12s",
        }}
      >
        {copied ? (
          Icons.check({ size: 14 })
        ) : (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <div style={{ textAlign: "right", flex: "0 0 auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ color: "var(--ink-soft)" }}>{r.wpm} wpm</div>
        <div style={{ marginTop: 2 }}>{r.dur}</div>
      </div>
    </div>
  );
}

interface DictStats {
  wordsToday: number;
  avgWpm: number;
  minutesSaved: number;
  streak: number;
}

export function timeGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function computeStats(entries: HistoryEntry[]): DictStats {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const todaySec = start.getTime() / 1000;
  const wordsToday = entries.filter((e) => e.created_at >= todaySec).reduce((s, e) => s + e.words, 0);
  const totalWords = entries.reduce((s, e) => s + e.words, 0);
  const avgWpm = entries.length ? Math.round(entries.reduce((s, e) => s + e.wpm, 0) / entries.length) : 0;
  const minutesSaved = Math.round(totalWords / 40); // ~40 wpm typing baseline
  const days = new Set(entries.map((e) => new Date(e.created_at * 1000).toDateString()));
  let streak = 0;
  const d = new Date();
  while (days.has(d.toDateString())) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return { wordsToday, avgWpm, minutesSaved, streak };
}

function SetupBanner({
  needsAccess,
  accessRequested,
  needsModel,
  dlProgress,
  onGrant,
  onReopen,
  onDownload,
}: {
  needsAccess: boolean;
  accessRequested: boolean;
  needsModel: string | null;
  dlProgress: number | null;
  onGrant: () => void;
  onReopen: () => void;
  onDownload: () => void;
}) {
  if (!needsAccess && !needsModel) return null;
  const btn = (label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ flex: "0 0 auto", border: "none", cursor: "pointer", borderRadius: "var(--radius-sm)", padding: "7px 14px", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: 600 }}>
      {label}
    </button>
  );
  const row = (icon: IconName, title: string, desc: string, action: ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 30, height: 30, flex: "0 0 auto", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
        {Icons[icon]({ size: 15 })}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>{desc}</div>
      </div>
      {action}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "var(--surface)", border: "0.5px solid var(--accent)", borderRadius: "var(--radius)", padding: "16px 18px" }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Finish setting up</div>
      {needsModel &&
        row(
          "chip",
          `Download the ${needsModel} model`,
          "Required for on-device transcription.",
          dlProgress !== null ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)" }}>{dlProgress}%</span>
          ) : (
            btn("Download", onDownload)
          ),
        )}
      {needsAccess &&
        (accessRequested
          ? row(
              "shield",
              "Enable text insertion",
              "Enabled Murmur under Accessibility? Restart to activate it — the grant only applies on a fresh launch.",
              btn("Restart now", onReopen),
            )
          : row("shield", "Enable text insertion", "Grant Accessibility so Murmur can paste at your cursor.", btn("Grant access", onGrant)))}
    </div>
  );
}

function Home({ userName }: { userName: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [accessRequested, setAccessRequested] = useState(false);
  const [needsModel, setNeedsModel] = useState<string | null>(null);
  const [dlProgress, setDlProgress] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isTauri) return;
    let unlisten = () => {};
    const refreshAccess = async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      setNeedsAccess(!(await invoke<boolean>("accessibility_trusted")));
    };
    const refreshHistory = async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      setEntries(await invoke<HistoryEntry[]>("get_history"));
    };
    (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      setEntries(await invoke<HistoryEntry[]>("get_history"));
      const cfg = await getConfig();
      if (!(await invoke<boolean>("model_downloaded", { model: cfg.model }))) setNeedsModel(cfg.model);
      await refreshAccess();
      // A finished dictation appends to history on disk and emits "done" — pull
      // the updated list so it shows in Recent dictations (and the stats) live.
      unlisten = await listen<string>("dictation:state", (e) => {
        if (e.payload === "done") refreshHistory().catch(() => {});
      });
    })().catch(() => {});
    // Re-check access + resync history when the user returns to the window (the
    // dictation happens from the floating overlay while this may be unfocused).
    const onFocus = () => {
      refreshAccess().catch(() => {});
      refreshHistory().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    // Poll the permission state — the focus event is unreliable across app
    // switches, so the "Finish setting up" banner clears on its own once granted.
    const id = setInterval(() => refreshAccess().catch(() => {}), 2000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
      unlisten();
    };
  }, []);

  const grant = async () => {
    if (!isTauri) return;
    setAccessRequested(true); // opened Settings; it activates on the next launch
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("request_accessibility").catch(() => {});
  };

  const reopen = async () => {
    if (!isTauri) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("restart_app").catch(() => {});
  };

  const download = async () => {
    if (!isTauri || !needsModel) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");
    setDlProgress(0);
    const un = await listen<{ model: string; received: number; total: number }>("model:progress", (e) => {
      if (e.payload.total > 0) setDlProgress(Math.round((e.payload.received / e.payload.total) * 100));
    });
    try {
      await invoke("download_model", { model: needsModel });
      setNeedsModel(null);
    } catch {
      /* leave the banner up so the user can retry */
    } finally {
      setDlProgress(null);
      un();
    }
  };

  const stats = computeStats(entries);
  const wordsTodayStr = stats.wordsToday.toLocaleString();
  const recents: Recent[] = entries.map((e) => ({
    src: e.source,
    txt: e.text,
    t: relTime(e.created_at),
    wpm: e.wpm,
    dur: e.duration,
  }));
  const q = query.trim().toLowerCase();
  const filtered = q ? recents.filter((r) => r.txt.toLowerCase().includes(q)) : recents;

  return (
    <div style={{ padding: "calc(26px * var(--dsc)) 28px", display: "flex", flexDirection: "column", gap: "calc(20px * var(--dsc))", height: "100%", overflow: "hidden" }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>{timeGreeting()}{userName ? `, ${userName}` : ""}</div>
        <div style={{ fontSize: 13.5, color: "var(--ink-faint)", marginTop: 2 }}>
          {stats.wordsToday > 0 ? (
            <>
              You’ve spoken <b style={{ color: "var(--ink-soft)", fontWeight: 600 }}>{wordsTodayStr} words</b> today — about {stats.minutesSaved} minutes of typing saved.
            </>
          ) : (
            <>
              Hold <b style={{ color: "var(--ink-soft)", fontWeight: 600 }}>⌥ Space</b> anywhere to turn speech into text.
            </>
          )}
        </div>
      </div>

      <SetupBanner needsAccess={needsAccess} accessRequested={accessRequested} needsModel={needsModel} dlProgress={dlProgress} onGrant={grant} onReopen={reopen} onDownload={download} />

      <div style={{ display: "flex", gap: 12 }}>
        <Stat value={wordsTodayStr} unit="words" label="Dictated today" />
        <Stat value={String(stats.avgWpm)} unit="wpm" label="Average pace" />
        <Stat value={String(stats.minutesSaved)} unit="min" label="Time saved" />
        <Stat value={String(stats.streak)} unit="days" label="Current streak" />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "0.5px solid var(--line-soft)" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Recent dictations</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, height: 28, padding: "0 10px", borderRadius: 999, background: "var(--surface-2)", border: "0.5px solid var(--line)", color: "var(--ink-faint)" }}>
            {Icons.search({ size: 13 })}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transcripts"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              style={{ border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink)", width: 140 }}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center" }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface-2)", display: "grid", placeItems: "center", color: "var(--ink-faint)" }}>
              {Icons[q ? "search" : "mic"]({ size: 20 })}
            </span>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-soft)" }}>
              {q ? "No matching transcripts" : "No dictations yet"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)", maxWidth: 280 }}>
              {q ? `Nothing matches “${query.trim()}”. Try a different search.` : "Hold ⌥ Space anywhere and start talking — your transcripts will appear here."}
            </div>
          </div>
        ) : (
          <div style={{ padding: 6, overflow: "auto" }}>
            {filtered.map((r, i) => (
              <RecentRow key={i} r={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SETTINGS ──────────────────────────────────────────────────────────────
function Card({ title, icon, children, right }: { title: string; icon: IconName; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: "var(--radius)", padding: "calc(18px * var(--dsc)) 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <span style={{ color: "var(--ink-faint)", display: "inline-flex" }}>{Icons[icon]({ size: 16 })}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{title}</span>
        {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

// A real input picker backed by a native <select> — on macOS this renders the
// actual system popup menu, which is the most native control a webview can show.
function MicSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [devices, setDevices] = useState<string[]>([]);
  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      try {
        setDevices(await invoke<string[]>("list_input_devices"));
      } catch {
        /* leave empty → just the Default option */
      }
    })();
  }, []);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: 38, padding: "0 12px", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", border: "0.5px solid var(--line)" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          appearance: "none",
          WebkitAppearance: "none",
          border: "none",
          background: "transparent",
          color: "var(--ink)",
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          outline: "none",
          cursor: "pointer",
        }}
      >
        <option value="default">Default microphone</option>
        {value !== "default" && !devices.includes(value) && <option value={value}>{value}</option>}
        {devices.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <span style={{ color: "var(--ink-faint)", pointerEvents: "none" }}>{Icons.chevron({ size: 15 })}</span>
    </div>
  );
}

interface Model {
  id: string;
  size: string;
  speed: string;
  acc: number;
}
const MODELS: Model[] = [
  { id: "tiny", size: "75 MB", speed: "32×", acc: 2 },
  { id: "base", size: "142 MB", speed: "16×", acc: 3 },
  { id: "small", size: "466 MB", speed: "6×", acc: 3 },
  { id: "medium", size: "1.5 GB", speed: "2×", acc: 4 },
  { id: "large-v3", size: "2.9 GB", speed: "1×", acc: 5 },
];

function ModelRow({
  m,
  active,
  status,
  onClick,
}: {
  m: Model;
  active: boolean;
  /** "42%" while downloading, "download" if absent, undefined if ready */
  status?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "11px 12px",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        border: active ? "1px solid var(--accent)" : "0.5px solid var(--line)",
        background: active ? "var(--accent-soft)" : "var(--surface-2)",
        fontFamily: "var(--font-ui)",
        transition: "background .12s, border-color .12s",
      }}
    >
      <span style={{ width: 16, height: 16, flex: "0 0 auto", borderRadius: "50%", border: active ? "5px solid var(--accent)" : "1.5px solid var(--ink-faint)", transition: "border .12s" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", flex: "0 0 auto", minWidth: 78 }}>{m.id}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)", flex: "0 0 auto", minWidth: 54 }}>{m.size}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)", flex: 1 }}>{m.speed} realtime</span>
      {status && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent)", flex: "0 0 auto" }}>{status}</span>
      )}
      <span style={{ display: "inline-flex", gap: 3, flex: "0 0 auto" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} style={{ width: 5, height: 5, borderRadius: "50%", background: n <= m.acc ? "var(--accent)" : "var(--line)" }} />
        ))}
      </span>
    </button>
  );
}

const KEY_GLYPH: Record<string, string> = {
  alt: "⌥",
  option: "⌥",
  cmd: "⌘",
  command: "⌘",
  super: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  control: "⌃",
  shift: "⇧",
};

/** Map a KeyboardEvent.code to a Tauri accelerator key token (or null if it's
 * not a usable main key). */
export function codeToKey(code: string): string | null {
  if (code === "Space") return "Space";
  let m: RegExpExecArray | null;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Arrow(Up|Down|Left|Right)$/.exec(code))) return m[1];
  if (/^F\d{1,2}$/.test(code)) return code;
  const punct: Record<string, string> = {
    Enter: "Enter",
    Tab: "Tab",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
  };
  return punct[code] ?? null;
}

/** Render an accelerator like "Alt+Space" as kbd glyphs, and capture a new chord
 * on click. Persists via onRebind → config (Rust re-registers the global shortcut). */
/** Prompt to grant Input Monitoring (required for the fn-key trigger on macOS).
 *  macOS only exposes the grant to a process started *after* it exists, so the
 *  running app can't see it live — once the user opens Settings we offer a
 *  Restart to activate. If `input_monitoring_trusted` is true we already launched
 *  with it (the fn tap is global), so the notice hides. */
function InputMonitoringNotice() {
  const [trusted, setTrusted] = useState(true); // assume ok until a check says otherwise
  const [requested, setRequested] = useState(false);
  const check = async () => {
    if (!isTauri) return;
    const { invoke } = await import("@tauri-apps/api/core");
    setTrusted(await invoke<boolean>("input_monitoring_trusted"));
  };
  useEffect(() => {
    check().catch(() => {});
    const onFocus = () => check().catch(() => {});
    window.addEventListener("focus", onFocus);
    // Poll too — the webview focus event is unreliable across app switches.
    const id = setInterval(() => check().catch(() => {}), 2000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, []);
  if (trusted) return null;

  // Show the restart path once the user has opened Settings (we can't confirm the
  // grant from this process, so we can't wait for it).
  const denied = !requested;
  const onClick = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    if (denied) {
      await invoke("request_input_monitoring");
      setRequested(true);
    } else {
      await invoke("restart_app");
    }
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--accent-soft)",
        border: "0.5px solid color-mix(in oklch, var(--accent) 35%, transparent)",
        borderRadius: 10,
        padding: "11px 13px",
      }}
    >
      <div style={{ flex: 1, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45 }}>
        {denied ? (
          <>
            Grant <b style={{ color: "var(--ink)" }}>Input Monitoring</b> so Murmur can detect the fn key in every app.
          </>
        ) : (
          <>
            Enabled Murmur under <b style={{ color: "var(--ink)" }}>Input Monitoring</b>? Restart Murmur to activate the
            fn key — the grant only applies on a fresh launch.
          </>
        )}
      </div>
      <button
        onClick={onClick}
        style={{
          flex: "0 0 auto",
          border: "0.5px solid var(--line)",
          background: denied ? "var(--surface)" : "var(--ink)",
          color: denied ? "var(--ink)" : "var(--bg)",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
        }}
      >
        {denied ? "Open settings" : "Restart now"}
      </button>
    </div>
  );
}

function Hotkey({ accelerator, onRebind }: { accelerator: string; onRebind: (accel: string) => void }) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(false);
      const key = codeToKey(e.code);
      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Control");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      if (e.metaKey) mods.push("Super");
      // Require a modifier + a main key so the shortcut can't swallow typing.
      if (!key || mods.length === 0) return;
      onRebind([...mods, key].join("+"));
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onRebind]);

  const parts = accelerator.split("+").map((p) => KEY_GLYPH[p.toLowerCase()] ?? p);
  return (
    <button
      onClick={() => setRecording((r) => !r)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        fontFamily: "var(--font-ui)",
      }}
    >
      {recording ? (
        <span style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 500 }}>Press a shortcut… (Esc to cancel)</span>
      ) : (
        <>
          {parts.map((k, i) => (
            <span key={`${k}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>+</span>}
              <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--ink)", background: "var(--surface-2)", border: "0.5px solid var(--line)", borderBottomWidth: 2, borderRadius: 7, padding: "5px 10px", minWidth: 30, textAlign: "center" }}>{k}</kbd>
            </span>
          ))}
          <span style={{ fontSize: 12, color: "var(--ink-faint)", marginLeft: 4 }}>Click to rebind</span>
        </>
      )}
    </button>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ position: "relative", width: 38, height: 22, borderRadius: 999, border: "none", cursor: "pointer", background: on ? "var(--accent)" : "var(--line)", transition: "background .15s", padding: 0, flex: "0 0 auto" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .15s" }} />
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
}) {
  // Keep keystrokes local; only persist (which triggers an IPC save) on blur/Enter.
  // Saving per keystroke re-renders the whole app and makes typing feel frozen.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onChange(draft);
  };
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 6 }}>{label}</div>
      <input
        value={draft}
        type={type}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          height: 36,
          padding: "0 12px",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface-2)",
          border: "0.5px solid var(--line)",
          color: "var(--ink)",
          fontFamily: type === "password" ? "var(--font-mono)" : "var(--font-ui)",
          fontSize: 13,
          outline: "none",
        }}
      />
    </label>
  );
}

function Seg<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: "var(--radius-sm)", background: "var(--surface-3)" }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            flex: 1,
            border: "none",
            cursor: "pointer",
            borderRadius: "calc(var(--radius-sm) - 3px)",
            padding: "6px 8px",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            fontWeight: 500,
            background: value === o ? "var(--surface)" : "transparent",
            color: value === o ? "var(--ink)" : "var(--ink-soft)",
            boxShadow: value === o ? "var(--shadow-sm)" : "none",
            transition: "background .12s",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const LANGS = ["English", "Español", "Français", "日本語", "Deutsch", "中文"];

type ConnStatus = "idle" | "checking" | "ok" | "error";

type UpdateStatus = "checking" | "available" | "uptodate" | "installing" | "error";

/** Software-update card: auto-checks GitHub releases on mount, installs on request. */
function UpdateCard() {
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<UpdateStatus>("checking");
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [pct, setPct] = useState(0);

  const check = async () => {
    setStatus("checking");
    try {
      const u = await checkForUpdate();
      if (u) {
        setPending(u);
        setStatus("available");
      } else {
        setStatus("uptodate");
      }
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    if (!isTauri) {
      setStatus("uptodate");
      return;
    }
    appVersion().then(setVersion).catch(() => {});
    check().catch(() => {});
  }, []);

  const install = async () => {
    if (!pending) return;
    setStatus("installing");
    try {
      await pending.install(setPct); // relaunches the app on success
    } catch {
      setStatus("error");
    }
  };

  const line =
    status === "available"
      ? `Update available — v${pending?.version}`
      : status === "installing"
        ? `Installing… ${pct}%`
        : status === "checking"
          ? "Checking for updates…"
          : status === "error"
            ? "Couldn't check — try again"
            : "You're up to date";

  const ghost: CSSProperties = {
    flex: "0 0 auto",
    border: "0.5px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink)",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
  };

  return (
    <Card title="Software update" icon="bolt">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "var(--ink)" }}>{line}</div>
          {version && (
            <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
              Murmur v{version}
            </div>
          )}
        </div>
        {status === "available" ? (
          <button onClick={install} style={{ ...ghost, background: "var(--ink)", color: "var(--bg)", border: "none" }}>
            Install &amp; restart
          </button>
        ) : status === "installing" ? null : (
          <button onClick={() => check().catch(() => {})} style={ghost}>
            Check again
          </button>
        )}
      </div>
    </Card>
  );
}

function Settings() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg] = useState<string>("");
  const [showServerHelp, setShowServerHelp] = useState(false);

  // Load config + which models are present + listen for download progress.
  useEffect(() => {
    getConfig().then(setCfg);
  }, []);
  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const entries = await Promise.all(
        MODELS.map(async (m) => [m.id, await invoke<boolean>("model_downloaded", { model: m.id })] as const),
      );
      setDownloaded(Object.fromEntries(entries));
      const { listen } = await import("@tauri-apps/api/event");
      un = await listen<{ model: string; received: number; total: number }>("model:progress", (e) => {
        const { model, received, total } = e.payload;
        setProgress((p) => ({ ...p, [model]: total > 0 ? Math.round((received / total) * 100) : 0 }));
        if (total > 0 && received >= total) setDownloaded((d) => ({ ...d, [model]: true }));
      });
    })().catch(() => {});
    return () => un?.();
  }, []);

  // Reset connection test status whenever the endpoint changes. Must stay above
  // the early return below — hooks can't run conditionally.
  useEffect(() => {
    setConnStatus("idle");
    setConnMsg("");
  }, [cfg?.transcribe.endpoint]);

  if (!cfg) return <div style={{ padding: "calc(24px * var(--dsc)) 28px" }} />;

  const save = (patch: Partial<AppConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    setConfig(next).catch(() => {});
  };

  const testConnection = async () => {
    if (!isTauri || !cfg) return;
    setConnStatus("checking");
    setConnMsg("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<string>("health_check_remote", { endpoint: cfg.transcribe.endpoint, apiKey: cfg.transcribe.apiKey });
      setConnStatus("ok");
    } catch (err) {
      const raw = String(err);
      setConnMsg(raw.length > 120 ? raw.slice(0, 117) + "…" : raw);
      setConnStatus("error");
    }
  };

  const selectModel = async (id: string) => {
    save({ model: id });
    if (isTauri && !downloaded[id]) {
      const { invoke } = await import("@tauri-apps/api/core");
      setProgress((p) => ({ ...p, [id]: 0 }));
      invoke("download_model", { model: id })
        .then(() => setDownloaded((d) => ({ ...d, [id]: true })))
        .catch(() => {})
        .finally(() =>
          setProgress((p) => {
            const n = { ...p };
            delete n[id];
            return n;
          }),
        );
    }
  };

  const modelStatus = (id: string): string | undefined => {
    if (progress[id] !== undefined) return `${progress[id]}%`;
    if (isTauri && downloaded[id] === false) return "download";
    return undefined;
  };

  return (
    <div style={{ padding: "calc(24px * var(--dsc)) 28px", height: "100%", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 4 }}>Voice &amp; model</div>
      <div style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 18 }}>
        {cfg.transcribe.enabled
          ? "Audio is sent to your remote Whisper server for transcription."
          : "Speech is transcribed by Whisper running locally — nothing is uploaded."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Microphone" icon="mic">
            <MicSelect value={cfg.micDevice} onChange={(v) => save({ micDevice: v })} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <span style={{ fontSize: 12, color: "var(--ink-faint)", flex: "0 0 auto" }}>Input</span>
              <div style={{ flex: 1, height: 26, display: "flex", alignItems: "center", color: "var(--accent)" }}>
                <Waveform active bars={28} height={22} width={3} gap={3} color="currentColor" />
              </div>
            </div>
          </Card>

          <Card title="Activation" icon="keyboard">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 8 }}>Trigger</div>
                <Seg
                  options={["Fn key", "Custom shortcut"]}
                  value={cfg.triggerKey === "Hotkey" ? "Custom shortcut" : "Fn key"}
                  onChange={(v) => save({ triggerKey: v === "Custom shortcut" ? "Hotkey" : "Fn" })}
                />
              </div>
              {cfg.triggerKey === "Hotkey" ? (
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 8 }}>Dictation hotkey</div>
                  <Hotkey accelerator={cfg.hotkey} onRebind={(a) => save({ hotkey: a })} />
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                    Hold the{" "}
                    <kbd
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11.5,
                        background: "var(--surface-2)",
                        border: "0.5px solid var(--line)",
                        borderRadius: 6,
                        padding: "1px 6px",
                        color: "var(--ink)",
                      }}
                    >
                      fn
                    </kbd>{" "}
                    (Globe) key to dictate.
                  </div>
                  <InputMonitoringNotice />
                </>
              )}
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 8 }}>Trigger mode</div>
                <Seg
                  options={["Push-to-talk", "Toggle"]}
                  value={cfg.triggerMode}
                  onChange={(v) => save({ triggerMode: v })}
                />
              </div>
            </div>
          </Card>

          <Card
            title="Remote server"
            icon="globe"
            right={
              <Toggle
                on={cfg.transcribe.enabled}
                onClick={() => save({ transcribe: { ...cfg.transcribe, enabled: !cfg.transcribe.enabled } })}
              />
            }
          >
            <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: cfg.transcribe.enabled ? 14 : 0, lineHeight: 1.5 }}>
              Transcribe on another computer running a Whisper server instead of locally.
            </div>
            {cfg.transcribe.enabled && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field
                  label="Server address"
                  value={cfg.transcribe.endpoint}
                  placeholder="http://192.168.1.50:8000"
                  onChange={(v) => save({ transcribe: { ...cfg.transcribe, endpoint: v } })}
                />
                <Field
                  label="Model"
                  value={cfg.transcribe.model}
                  placeholder="whisper-1"
                  onChange={(v) => save({ transcribe: { ...cfg.transcribe, model: v } })}
                />
                <Field
                  label="API key (optional)"
                  type="password"
                  value={cfg.transcribe.apiKey}
                  placeholder="leave blank for a LAN server"
                  onChange={(v) => save({ transcribe: { ...cfg.transcribe, apiKey: v } })}
                />
                {/* Test connection row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 2 }}>
                  <button
                    onClick={testConnection}
                    disabled={!isTauri || connStatus === "checking"}
                    style={{
                      flex: "0 0 auto",
                      border: "0.5px solid var(--line)",
                      cursor: (!isTauri || connStatus === "checking") ? "default" : "pointer",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 13px",
                      background: "var(--surface-2)",
                      color: "var(--ink-soft)",
                      fontFamily: "var(--font-ui)",
                      fontSize: 12.5,
                      fontWeight: 500,
                      opacity: (!isTauri || connStatus === "checking") ? 0.6 : 1,
                      transition: "opacity .12s",
                    }}
                  >
                    {connStatus === "checking" ? "Checking…" : "Test connection"}
                  </button>
                  {connStatus === "ok" && (
                    <span style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--ok)",
                      background: "color-mix(in oklch, var(--ok) 12%, transparent)",
                      border: "0.5px solid color-mix(in oklch, var(--ok) 30%, transparent)",
                      borderRadius: 999,
                      padding: "3px 9px",
                    }}>
                      Connected
                    </span>
                  )}
                  {connStatus === "error" && (
                    <span
                      title={connMsg}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--err, #e06c5a)",
                        background: "color-mix(in oklch, var(--err, #e06c5a) 10%, transparent)",
                        border: "0.5px solid color-mix(in oklch, var(--err, #e06c5a) 25%, transparent)",
                        borderRadius: 999,
                        padding: "3px 9px",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      Unreachable{connMsg ? ` — ${connMsg}` : ""}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Setup hint — how to stand up a server on the other machine. */}
            <div style={{ marginTop: cfg.transcribe.enabled ? 14 : 12 }}>
              <button
                onClick={() => setShowServerHelp((v) => !v)}
                style={{ border: "none", background: "transparent", color: "var(--accent)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 12, fontWeight: 500, padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                {showServerHelp ? "Hide setup" : "How do I run a server?"}
                <span style={{ display: "inline-flex", transform: showServerHelp ? "rotate(180deg)" : "none", transition: "transform .15s" }}>{Icons.chevron({ size: 13 })}</span>
              </button>
              {showServerHelp && (
                <div style={{ marginTop: 10, background: "var(--surface-2)", border: "0.5px solid var(--line)", borderRadius: "var(--radius-sm)", padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5, marginBottom: 8 }}>
                    On the computer that will transcribe (needs Python 3 + ffmpeg):
                  </div>
                  <pre data-selectable style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink)", background: "var(--surface-3)", border: "0.5px solid var(--line)", borderRadius: 8, padding: "9px 11px", overflowX: "auto", lineHeight: 1.7 }}>
{`cd server
./install.sh     # installs whisper + deps
./run.sh         # serves on port 8000`}
                  </pre>
                  <div style={{ fontSize: 11.5, color: "var(--ink-faint)", lineHeight: 1.5, marginTop: 8 }}>
                    Then set the address above to{" "}
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>http://&lt;that-machine-ip&gt;:8000</span>. Full guide in{" "}
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>server/README.md</span>.
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card
            title="Transcription model"
            icon="chip"
            right={<span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-faint)" }}>openai/whisper</span>}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {MODELS.map((m) => (
                <ModelRow
                  key={m.id}
                  m={m}
                  active={cfg.model === m.id}
                  status={modelStatus(m.id)}
                  onClick={() => selectModel(m.id)}
                />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 14, borderTop: "0.5px solid var(--line-soft)" }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1 }}>Run on</span>
              <Seg options={["CPU", "GPU"]} value={cfg.compute} onChange={(v) => save({ compute: v })} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, color: cfg.transcribe.enabled ? "var(--ink-faint)" : "var(--ok)" }}>
              {Icons.shield({ size: 14 })}
              <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                {cfg.transcribe.enabled ? "Local model used as fallback if the server is unreachable." : "Audio never leaves your device."}
              </span>
            </div>
          </Card>

          <Card
            title="Language"
            icon="globe"
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>Auto-detect</span>
                <Toggle on={cfg.autoDetectLanguage} onClick={() => save({ autoDetectLanguage: !cfg.autoDetectLanguage })} />
              </div>
            }
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {LANGS.map((l) => {
                const sel = cfg.language === l;
                return (
                  <button
                    key={l}
                    onClick={() => save({ language: l })}
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "6px 11px",
                      borderRadius: 999,
                      border: "0.5px solid var(--line)",
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                      background: sel ? "var(--accent-soft)" : "var(--surface-2)",
                      color: sel ? "var(--accent)" : "var(--ink-soft)",
                    }}
                  >
                    {l}
                  </button>
                );
              })}
              <span style={{ fontSize: 12, fontWeight: 500, padding: "6px 11px", color: "var(--ink-faint)" }}>+94 more</span>
            </div>
          </Card>

          <Card title="Appearance" icon="sparkle">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1 }}>Theme</span>
              <Seg
                options={["Light", "Dark"]}
                value={cfg.theme.dark ? "Dark" : "Light"}
                onChange={(v) => save({ theme: { ...cfg.theme, dark: v === "Dark" } })}
              />
            </div>
          </Card>

          <UpdateCard />
        </div>
      </div>
    </div>
  );
}

// ── shell ────────────────────────────────────────────────────────────────
/** Shown when a dictation transcribed fine but the paste failed — almost always
 *  Accessibility not effective for the running process (macOS caches it, so a
 *  grant after launch needs a reopen). Gives the exact remedy. */
function PasteFailedNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    let un = () => {};
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      un = await listen("inject:needs-permission", () => setShow(true));
    })().catch(() => {});
    return () => un();
  }, []);
  if (!show) return null;
  const openSettings = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("request_accessibility").catch(() => {});
  };
  const reopen = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("restart_app").catch(() => {});
  };
  const btn: CSSProperties = {
    flex: "0 0 auto", border: "0.5px solid var(--line)", background: "var(--surface)", color: "var(--ink)",
    borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-ui)",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--accent-soft)", borderBottom: "0.5px solid color-mix(in oklch, var(--accent) 35%, transparent)" }}>
      <div style={{ flex: 1, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.4 }}>
        <b style={{ color: "var(--ink)" }}>Transcribed, but couldn't paste it.</b> Murmur needs Accessibility to insert at your cursor — enable it, then reopen Murmur so it takes effect.
      </div>
      <button onClick={openSettings} style={btn}>Open Settings</button>
      <button onClick={reopen} style={{ ...btn, background: "var(--ink)", color: "var(--bg)", border: "none" }}>Reopen</button>
      <button onClick={() => setShow(false)} aria-label="Dismiss" style={{ ...btn, padding: "5px 9px", color: "var(--ink-faint)" }}>✕</button>
    </div>
  );
}

export function Dashboard({ productName = "Murmur", userName = "", initialView = "home" }: { productName?: string; userName?: string; initialView?: "home" | "settings" }) {
  const [active, setActive] = useState<"home" | "history" | "settings">(initialView);
  const nav: { id: "home" | "history" | "settings"; icon: IconName; label: string }[] = [
    { id: "home", icon: "bolt", label: "Home" },
    { id: "history", icon: "clock", label: "History" },
    { id: "settings", icon: "sliders", label: "Settings" },
  ];
  const content = active === "settings" ? <Settings /> : <Home userName={userName} />;

  const titleBar: CSSProperties = {
    height: 44,
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "0 16px",
    borderBottom: "0.5px solid var(--line)",
    background: "var(--surface)",
  };

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: "transparent", fontFamily: "var(--font-ui)", overflow: "hidden", borderRadius: 12 }}>
      {/* title bar — data-tauri-drag-region makes it draggable as the window handle */}
      <div style={titleBar} data-tauri-drag-region>
        <TrafficLights />
      </div>

      <PasteFailedNotice />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* sidebar */}
        <div style={{ width: 210, flex: "0 0 auto", borderRight: "0.5px solid var(--line)", background: "var(--surface)", display: "flex", flexDirection: "column", padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px 16px" }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--ink)", color: "var(--surface)", display: "grid", placeItems: "center" }}>
              {Icons.waveDot({ size: 16 })}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>{productName}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {nav.map((n) => (
              <NavItem key={n.id} icon={n.icon} label={n.label} active={active === n.id} onClick={() => setActive(n.id === "history" ? "home" : n.id)} />
            ))}
          </div>
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: "0.5px solid var(--line-soft)" }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-3)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
              {(userName.trim()[0] ?? "M").toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName.trim() || "Murmur"}</div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>Local</div>
            </div>
          </div>
        </div>

        {/* content */}
        <div style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}>{content}</div>
      </div>
    </div>
  );
}
