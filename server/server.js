import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getHistory,
  interruptComfy,
  normalizeComfyTarget,
  normalizeValues,
  queuePrompt,
  uploadImageToComfy,
  uploadedImageUrl,
  waitForPrompt
} from "./lib/comfyClient.js";
import { readBody, send } from "./lib/http.js";
import { createTemplateService } from "./lib/templateService.js";
import {
  collectOutputs,
  mapValuesToRequest,
  setWorkflowValue,
  validateWorkflowMappings
} from "./lib/workflowPatcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const configDir = path.join(root, "config");
const uploadDir = path.join(root, "uploads");
const configPath = process.env.APP_BUILD_YAML || path.join(configDir, "app_build.yaml");
const workflowPath = process.env.COMFY_WORKFLOW_JSON || path.join(configDir, "api.json");
const templatesPath = path.join(configDir, "templates.json");
const port = Number(process.env.PORT || 8787);
const comfyTimeoutMs = Number(process.env.COMFY_TIMEOUT_MS || 10 * 60 * 1000);
const activeRuns = new Map();
const templates = createTemplateService({ configDir, configPath, workflowPath, templatesPath });

async function assertTemplateWorkflow(config, template) {
  const workflow = JSON.parse(await readFile(template.workflowPath, "utf8"));
  validateWorkflowMappings(config, workflow);
  return workflow;
}

async function handleRun(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const runId = body.runId || randomUUID();
  const abortController = new AbortController();
  const run = {
    id: runId,
    abortController,
    cancelled: false,
    target: null,
    promptId: null,
    ws: null
  };
  activeRuns.set(runId, run);

  try {
    const { config, server, template } = await templates.loadConfig(body.template);
    const target = normalizeComfyTarget(body.address || server.address);
    const workflow = await assertTemplateWorkflow(config, template);
    run.target = target;

    const normalized = await normalizeValues(body.values || {});
    const request = mapValuesToRequest(config, normalized);
    const responseRequest = {};
    const patchOptions = {
      uploadDir,
      uploadImageToComfy,
      uploadedImageUrl,
      urlUploadMode: template.id === "image-adjust" ? "local_path" : "comfy_view_url"
    };
    for (const [id, value] of Object.entries(request)) {
      const patchedValue = await setWorkflowValue(workflow, id, value, target, abortController.signal, patchOptions);
      responseRequest[id] = value?.kind === "upload" ? patchedValue : value;
    }

    const clientId = randomUUID();
    const queued = await queuePrompt(target, workflow, clientId, abortController.signal);
    run.promptId = queued.prompt_id;
    await waitForPrompt(target, queued.prompt_id, clientId, run, comfyTimeoutMs);
    const historyRoot = await getHistory(target, queued.prompt_id, abortController.signal);
    const history = historyRoot[queued.prompt_id];
    const outputs = collectOutputs(config, history, target);
    if (outputs.length === 0) {
      const status = history?.status ? ` Status: ${JSON.stringify(history.status)}` : "";
      throw new Error(`ComfyUI finished prompt ${queued.prompt_id}, but no images were found for output node(s) in this template.${status}`);
    }
    send(res, 200, {
      runId,
      promptId: queued.prompt_id,
      template: template.id,
      address: target.label,
      request: responseRequest,
      outputs,
      rawOutputs: history?.outputs || {}
    });
  } finally {
    activeRuns.delete(runId);
  }
}

async function handleCancel(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const run = activeRuns.get(body.runId);
  if (!run) {
    send(res, 200, { cancelled: false, message: "Run is not active" });
    return;
  }
  run.cancelled = true;
  run.abortController.abort();
  try {
    run.ws?.close();
  } catch {
    // Ignore websocket close errors while cancelling.
  }
  if (run.target) {
    try {
      await interruptComfy(run.target);
    } catch (error) {
      send(res, 200, {
        cancelled: true,
        warning: error.message || String(error)
      });
      return;
    }
  }
  send(res, 200, { cancelled: true });
}

async function handleComfyView(req, res, url) {
  const target = normalizeComfyTarget(url.searchParams.get("address"));
  url.searchParams.delete("address");
  const response = await fetch(`${target.httpBase}/view?${url.searchParams.toString()}`, {
    headers: target.headers
  });
  if (!response.ok) {
    send(res, response.status, await response.text());
    return;
  }
  const contentType = response.headers.get("content-type") || "image/png";
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/") {
      res.writeHead(302, { location: process.env.FRONTEND_URL || "http://localhost:5173/" });
      res.end();
    } else if (req.method === "GET" && url.pathname === "/api/templates") {
      const registry = await templates.loadTemplateRegistry();
      send(res, 200, registry);
    } else if (req.method === "GET" && url.pathname === "/api/config") {
      const { config, raw, server: serverConfig, template } = await templates.loadConfig(url.searchParams.get("template"));
      await assertTemplateWorkflow(config, template);
      send(res, 200, {
        config,
        raw,
        server: serverConfig,
        template: {
          id: template.id,
          name: template.name,
          yaml: template.yaml,
          workflow: template.workflow
        }
      });
    } else if (req.method === "POST" && url.pathname === "/api/run") {
      await handleRun(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/cancel") {
      await handleCancel(req, res);
    } else if (req.method === "GET" && url.pathname === "/api/comfy-view") {
      await handleComfyView(req, res, url);
    } else {
      send(res, 404, { error: "Not found" });
    }
  } catch (error) {
    send(res, 500, { error: error.message || String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ComfyUI YAML app server listening on http://127.0.0.1:${port}`);
});
