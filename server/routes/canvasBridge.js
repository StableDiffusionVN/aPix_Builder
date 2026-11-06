// /api/canvas-bridge/*: MCP / CLI ⇄ the Canvas in the app window (server/lib/canvasBridge.js).
import { createCanvasBridge, holdCanvasRunForColab } from "../lib/canvasBridge.js";

export function createCanvasBridgeRoutes({ readBody, send }) {
  const bridge = createCanvasBridge();
  let held = null;
  const heldStatus = () => (held ? { state: held.state, error: held.error, colab: globalThis.apixDesktopBridge?.colabSession?.getState() || null } : null);

  return async function canvasBridgeRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/canvas-bridge/")) return false;
    if (req.method === "GET" && url.pathname === "/api/canvas-bridge/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.flushHeaders?.();
      bridge.attachClient(res);
      return true;
    }
    if (req.method !== "POST") return false;
    const body = JSON.parse(await readBody(req) || "{}");
    try {
      if (url.pathname === "/api/canvas-bridge/result") {
        send(res, 200, { ok: bridge.settle(body) });
        return true;
      }
      if (url.pathname === "/api/canvas-bridge/command") {
        if (body.action === "run") held = null; // a new run replaces a finished / failed hold
        const data = await bridge.command(String(body.action || ""), body.args || {});
        send(res, 200, held && held.state !== "released" ? { ...data, held: heldStatus() } : data);
        return true;
      }
      if (url.pathname === "/api/canvas-bridge/run-when-colab") {
        const session = globalThis.apixDesktopBridge?.colabSession;
        if (!session) {
          send(res, 501, { error: "Tự bật Colab chỉ có trên app aPix desktop." });
          return true;
        }
        if (!bridge.hasClient()) throw new Error("Chưa có cửa sổ aPix nào đang mở — mở app aPix để điều khiển Canvas.");
        held = holdCanvasRunForColab({ bridge, session, args: body.args || {} });
        send(res, 200, heldStatus());
        return true;
      }
    } catch (error) {
      send(res, 409, { error: error.message || String(error) });
      return true;
    }
    return false;
  };
}
