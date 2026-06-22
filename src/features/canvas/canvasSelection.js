function isMacPlatform() {
  return typeof navigator !== "undefined"
    && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || "");
}

/** Box-select modifier for React Flow: ⌘ on macOS, Ctrl elsewhere. */
export function canvasMultiSelectKeyCode() {
  return isMacPlatform() ? "Meta" : "Control";
}
