// updater.ts — thin wrapper over the Tauri updater plugin. Checks the GitHub
// releases manifest (latest.json), and on request downloads + installs the
// signed update, then relaunches. No-ops in a plain browser.

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface PendingUpdate {
  version: string;
  notes?: string;
  /** Download + install (with progress 0–100), then relaunch into the new version. */
  install: (onProgress?: (pct: number) => void) => Promise<void>;
}

/** The running app version (e.g. "0.1.3"), or "" outside Tauri. */
export async function appVersion(): Promise<string> {
  if (!inTauri) return "";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/** Returns an available update, or null if up to date. Throws if the check fails
 *  (e.g. offline / endpoint unreachable) — callers should handle that. */
export async function checkForUpdate(): Promise<PendingUpdate | null> {
  if (!inTauri) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body,
    install: async (onProgress) => {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          downloaded += e.data.chunkLength;
          if (total && onProgress) onProgress(Math.min(100, Math.round((downloaded / total) * 100)));
        } else if (e.event === "Finished" && onProgress) onProgress(100);
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}
