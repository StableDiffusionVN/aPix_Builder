// Colab control for MCP (desktop app only): the Electron main process registers
// globalThis.apixDesktopBridge.colab, which drives the signed-in aPix Browser.
export function createColabRoutes({ readBody, send }) {
  return async function colabRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/colab/")) return false;
    const colab = globalThis.apixDesktopBridge?.colab;
    if (!colab) {
      send(res, 501, { error: "Điều khiển Colab chỉ có trên app aPix desktop (cần trình duyệt trong app đã đăng nhập Google)." });
      return true;
    }
    const body = req.method === "POST" ? JSON.parse(await readBody(req) || "{}") : {};
    const actions = {
      "GET /api/colab/status": () => colab.status(),
      "POST /api/colab/open": () => colab.open(body.url),
      "POST /api/colab/run": () => colab.run(),
      "POST /api/colab/find-server": () => colab.findServer({ apply: body.apply !== false }),
      "POST /api/colab/stop": () => colab.stop({ deleteRuntime: body.deleteRuntime !== false })
    };
    const action = actions[`${req.method} ${url.pathname}`];
    if (!action) return false;
    try {
      send(res, 200, await action());
    } catch (error) {
      send(res, 409, { error: error.message || String(error) });
    }
    return true;
  };
}
