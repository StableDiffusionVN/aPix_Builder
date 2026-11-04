import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createColabRoutes } from "../server/routes/colab.js";

const readBody = req => new Promise(resolve => {
  let data = "";
  req.on("data", chunk => { data += chunk; });
  req.on("end", () => resolve(data));
});
const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

function fakeSession({ failWith } = {}) {
  let state = { phase: "off", message: "" };
  return {
    started: 0,
    start() {
      this.started++;
      state = { phase: "waiting", message: "Đang khởi động" };
      setTimeout(() => {
        state = failWith ? { phase: "error", message: failWith } : { phase: "ready", message: "ok", address: "https://***@x.pinggy.link" };
      }, 50);
    },
    getState: () => state,
    getServerAddress: () => (state.phase === "ready" ? "https://user:pass@x.pinggy.link" : "")
  };
}

let server;
afterEach(() => {
  server?.close();
  delete globalThis.apixDesktopBridge;
});

async function startServer(session) {
  globalThis.apixDesktopBridge = { colab: {}, colabSession: session };
  const submitted = [];
  const routes = createColabRoutes({ readBody, send });
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/run-queue/submit") {
      submitted.push(JSON.parse(await readBody(req)));
      return send(res, 200, { acknowledged: true });
    }
    if (!(await routes(req, res, url))) send(res, 404, {});
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, submitted };
}

const job = runId => ({ endpoint: "/api/run", body: { runId, template: "t1", address: "https://dead.link", values: {} }, meta: { provider: "local" } });
const waitFor = async check => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 50));
};

describe("Colab run-when-ready", () => {
  it("holds runs, starts Colab, then submits them with the Colab address", async () => {
    const session = fakeSession();
    const { base, submitted } = await startServer(session);
    const held = await fetch(`${base}/api/colab/run-when-ready`, { method: "POST", body: JSON.stringify({ jobs: [job("r1")] }) }).then(r => r.json());
    expect(held.acknowledged).toBe(true);
    expect(session.started).toBe(1);
    const pending = await fetch(`${base}/api/colab/pending`).then(r => r.json());
    expect(pending.runs).toEqual([expect.objectContaining({ runId: "r1", status: "waiting-colab" })]);
    await waitFor(() => submitted.length);
    expect(submitted[0].jobs[0].body.address).toBe("https://user:pass@x.pinggy.link");
    await waitFor(() => false);
    const after = await fetch(`${base}/api/colab/pending`).then(r => r.json());
    expect(after.runs).toEqual([]);
    expect(JSON.stringify(after)).not.toContain("pass@");
  }, 15000);

  it("marks held runs as errors when Colab fails", async () => {
    const { base, submitted } = await startServer(fakeSession({ failWith: "Chưa đăng nhập Google" }));
    await fetch(`${base}/api/colab/run-when-ready`, { method: "POST", body: JSON.stringify({ jobs: [job("r2")] }) });
    let runs = [];
    await waitFor(() => runs[0]?.status === "error");
    for (let i = 0; i < 40 && runs[0]?.status !== "error"; i++) {
      runs = (await fetch(`${base}/api/colab/pending`).then(r => r.json())).runs;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(runs[0]).toEqual(expect.objectContaining({ runId: "r2", status: "error" }));
    expect(runs[0].error).toContain("Chưa đăng nhập Google");
    expect(submitted).toEqual([]);
  }, 15000);
});
