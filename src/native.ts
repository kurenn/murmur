// native.ts — install desktop behaviours that the webview otherwise handles like
// a web page. Call once per window (dashboard + overlay).

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/** Suppress the browser context menu and image/text drag everywhere except in
 * editable fields, where a native paste menu is expected. */
export function installNativeBehaviors(): void {
  if (typeof document === "undefined") return;
  document.addEventListener("contextmenu", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  document.addEventListener("dragstart", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
}
