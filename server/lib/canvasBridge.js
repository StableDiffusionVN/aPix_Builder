// Bridge between MCP / CLI and the Canvas running in the app window. The graph, its live
// run state and the runner all live in the renderer, so commands are pushed to the
// window over SSE and answered through a POST.
import { randomUUID } from "node:crypto";

export const CANVAS_COMMAND_TIMEOUT_MS = 40000;

export function createCanvasBridge({ timeoutMs = CANVAS_COMMAND_TIMEOUT_MS } = {}) {
  let client = null;
  const pending = new Map();

  function sendEvent(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  return {
    /** The most recently opened window receives the commands. */
    attachClient(res) {
      client = res;
      sendEvent(res, "ready", {});
      const keepAlive = setInterval(() => res.write(": ping\n\n"), 25000);
      res.on("close", () => {
        clearInterval(keepAlive);
        if (client === res) client = null;
      });
    },
    hasClient: () => Boolean(client),
    command(action, args = {}) {
      if (!client) {
        return Promise.reject(new Error("Chưa có cửa sổ aPix nào đang mở — mở app aPix để điều khiển Canvas."));
      }
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Canvas trong app aPix không phản hồi."));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        sendEvent(client, "command", { id, action, args });
      });
    },
    settle({ id, ok, data, error }) {
      const entry = pending.get(id);
      if (!entry) return false;
      pending.delete(id);
      clearTimeout(entry.timer);
      if (ok) entry.resolve(data);
      else entry.reject(new Error(error || "Canvas báo lỗi"));
      return true;
    }
  };
}

/** Canvas run held until the Colab session is ready (ComfyUI was not answering). */
export function holdCanvasRunForColab({ bridge, session, args, pollMs = 3000, limitMs = 25 * 60 * 1000, settleMs = 1500 }) {
  const held = { state: "waiting-colab", error: "" };
  void session.start();
  (async () => {
    const deadline = Date.now() + limitMs;
    let started = false;
    while (Date.now() < deadline) {
      const { phase, message } = session.getState();
      if (phase !== "off" && phase !== "error") started = true;
      if (phase === "ready") {
        await new Promise(resolve => setTimeout(resolve, settleMs)); // the window applies the link
        await bridge.command("run", args);
        held.state = "released";
        return;
      }
      if (started && (phase === "error" || phase === "off")) throw new Error(`Không khởi động được Colab: ${message || phase}`);
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    throw new Error("Quá thời gian chờ ComfyUI trên Colab");
  })().catch(error => {
    held.state = "error";
    held.error = error.message || String(error);
  });
  return held;
}
