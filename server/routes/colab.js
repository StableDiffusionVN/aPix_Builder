// Colab control for MCP (desktop app only): the Electron main process registers
// globalThis.apixDesktopBridge.colab, which drives the signed-in aPix Browser.
const WAIT_LIMIT_MS = 25 * 60 * 1000;
// Runs submitted (MCP) while no ComfyUI server answered: held here until the Colab
// session is ready, then sent to the normal run queue with the Colab address.
const pendingRuns = new Map(); // runId → { runId, template, status, error, queuedAt }

function publicPending() {
  return [...pendingRuns.values()].map(({ runId, template, status, error, queuedAt }) => ({ runId, template, status, error, queuedAt }));
}

async function releaseWhenReady({ session, jobs, port }) {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  let address = "";
  while (Date.now() < deadline) {
    const state = session.getState();
    address = session.getServerAddress?.() || "";
    if (state.phase === "ready" && address) break;
    if (state.phase === "error" || state.phase === "off") {
      throw new Error(`Không khởi động được Colab: ${state.message || state.phase}`);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  if (!address) throw new Error("Quá thời gian chờ ComfyUI trên Colab");
  const ready = jobs.map(job => ({ ...job, body: { ...job.body, address } }));
  const response = await fetch(`http://127.0.0.1:${port}/api/run-queue/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobs: ready })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.acknowledged) throw new Error(data.error || "aPix không nhận lệnh chạy");
}

function holdForColab({ session, jobs, port }) {
  for (const job of jobs) {
    pendingRuns.set(job.body.runId, {
      runId: job.body.runId,
      template: job.body.template,
      status: "waiting-colab",
      error: "",
      queuedAt: job.body.queuedAt || new Date().toISOString()
    });
  }
  void session.start();
  releaseWhenReady({ session, jobs, port })
    .then(() => jobs.forEach(job => pendingRuns.delete(job.body.runId)))
    .catch(error => jobs.forEach(job => {
      const entry = pendingRuns.get(job.body.runId);
      if (entry) Object.assign(entry, { status: "error", error: error.message || String(error) });
    }));
}

export function createColabRoutes({ readBody, send }) {
  return async function colabRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/colab/")) return false;
    const colab = globalThis.apixDesktopBridge?.colab;
    if (!colab) {
      send(res, 501, { error: "Điều khiển Colab chỉ có trên app aPix desktop (cần trình duyệt trong app đã đăng nhập Google)." });
      return true;
    }
    const body = req.method === "POST" ? JSON.parse(await readBody(req) || "{}") : {};
    const session = globalThis.apixDesktopBridge?.colabSession;
    const actions = {
      // One-button flow (same as the top-bar Colab button): start returns at once, poll GET.
      "GET /api/colab/session": () => session.getState(),
      "POST /api/colab/session/start": () => {
        void session.start();
        return session.getState();
      },
      "POST /api/colab/session/stop": () => session.stop(),
      // ComfyUI not answering: start Colab and run these queue jobs once its link is up.
      "POST /api/colab/run-when-ready": () => {
        const jobs = Array.isArray(body.jobs) ? body.jobs.filter(job => job?.body?.runId) : [];
        if (!jobs.length) throw new Error("Thiếu lệnh chạy");
        holdForColab({ session, jobs, port: req.socket.localPort });
        return { acknowledged: true, runIds: jobs.map(job => job.body.runId), colab: session.getState() };
      },
      "GET /api/colab/pending": () => ({ runs: publicPending(), colab: session.getState() }),
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
