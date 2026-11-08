import { useEffect, useRef, useState } from "react";

/** ComfyUI started by the desktop app (electron/comfyLocal.mjs); api is null on the web. */
export function useComfyLocal() {
  const api = typeof window !== "undefined" ? window.apixDesktop?.comfyLocal || null : null;
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!api) return undefined;
    api.getState().then(next => next && setState(next)).catch(() => {});
    return api.onState(setState);
  }, [api]);
  return { api, state };
}

/**
 * The app window switches to the local ComfyUI the moment it becomes ready (Settings button,
 * Run gate, MCP / Canvas auto-start) — not when it was already running before.
 */
export function useComfyLocalAutoSwitch(onReady) {
  const { state } = useComfyLocal();
  const lastPhaseRef = useRef(null);
  useEffect(() => {
    const previous = lastPhaseRef.current;
    lastPhaseRef.current = state?.phase || null;
    if (state?.phase === "ready" && previous && previous !== "ready" && state.address) onReady?.(state.address);
  }, [state?.phase, state?.address, onReady]);
}
