import { useEffect, useRef } from "react";
import { getCanvasBridgeHandler } from "./canvasBridge.js";

/**
 * Receives Canvas commands from MCP / CLI. Mounted with the app (not with the Canvas),
 * so a command can bring the Canvas view up first.
 */
export function useCanvasBridgeClient({ showCanvas }) {
  const showCanvasRef = useRef(showCanvas);
  showCanvasRef.current = showCanvas;

  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    const source = new EventSource("/api/canvas-bridge/events");
    const onCommand = async event => {
      const { id, action, args } = JSON.parse(event.data);
      let reply;
      try {
        if (!getCanvasBridgeHandler()) showCanvasRef.current?.();
        for (let i = 0; i < 100 && !getCanvasBridgeHandler(); i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const handler = getCanvasBridgeHandler();
        if (!handler) throw new Error("Không mở được Canvas trong app aPix.");
        reply = { id, ok: true, data: await handler(action, args) };
      } catch (error) {
        reply = { id, ok: false, error: error?.message || String(error) };
      }
      await fetch("/api/canvas-bridge/result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reply)
      }).catch(() => {});
    };
    source.addEventListener("command", onCommand);
    return () => source.close();
  }, []);
}
