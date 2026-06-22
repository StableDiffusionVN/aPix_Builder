import http from "node:http";
import { WebSocketServer } from "ws";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Lightweight ComfyUI HTTP + WebSocket mock for integration tests.
 * @param {object} scenario
 * @param {string} [scenario.promptId]
 * @param {number} [scenario.promptHttpStatus]
 * @param {object|null} [scenario.nodeErrors]
 * @param {"success"|"execution_error"|"close_early"} [scenario.wsMode]
 * @param {object} [scenario.historyOutputs]
 */
export async function createMockComfyServer(scenario = {}) {
  const {
    promptId = "mock-prompt-1",
    promptHttpStatus = 200,
    nodeErrors = null,
    wsMode = "success",
    historyOutputs = {
      9: {
        images: [{ filename: "output.png", subfolder: "", type: "output" }]
      }
    },
    delayWsMs = 15
  } = scenario;

  const historyStore = new Map();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/prompt") {
      if (promptHttpStatus !== 200) {
        sendJson(res, promptHttpStatus, { error: "mock ComfyUI failure" });
        return;
      }
      await readJsonBody(req);
      if (nodeErrors) {
        sendJson(res, 200, { node_errors: nodeErrors });
        return;
      }
      historyStore.set(promptId, { outputs: historyOutputs, status: { completed: true } });
      sendJson(res, 200, { prompt_id: promptId, number: 1 });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/history/")) {
      const id = decodeURIComponent(url.pathname.slice("/history/".length));
      sendJson(res, 200, { [id]: historyStore.get(id) || { outputs: historyOutputs } });
      return;
    }

    if (req.method === "GET" && ["/system_stats", "/features", "/queue", "/prompt"].includes(url.pathname)) {
      sendJson(res, 200, url.pathname === "/system_stats"
        ? { system: { comfyui_version: "mock" } }
        : {});
      return;
    }

    if (req.method === "GET" && url.pathname === "/object_info") {
      sendJson(res, 200, { CheckpointLoaderSimple: { input: { required: {} }, output: [] } });
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    if (wsMode === "close_early") {
      ws.close();
      return;
    }

    setTimeout(() => {
      if (ws.readyState !== ws.OPEN) return;

      if (wsMode === "execution_error") {
        ws.send(JSON.stringify({
          type: "execution_error",
          data: {
            prompt_id: promptId,
            node_id: "4",
            exception_message: "mock node failure"
          }
        }));
        return;
      }

      ws.send(JSON.stringify({
        type: "executing",
        data: { node: "3", prompt_id: promptId }
      }));
      ws.send(JSON.stringify({
        type: "executing",
        data: { node: null, prompt_id: promptId }
      }));
    }, delayWsMs);
  });

  return {
    port,
    address: `127.0.0.1:${port}`,
    promptId,
    async close() {
      await new Promise(resolve => wss.close(() => resolve()));
      await new Promise(resolve => server.close(() => resolve()));
    }
  };
}
