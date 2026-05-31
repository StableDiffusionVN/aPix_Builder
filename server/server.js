import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  getHistory,
  getComfyDiscovery,
  getComfyHealth,
  interruptComfy,
  listComfyModels,
  normalizeComfyTarget,
  normalizeValues,
  parseDataUrl,
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
const defaultTemplateDir = path.join(configDir, "default");
const userTemplatesDir = path.join(configDir, "templates");
const uploadDir = path.join(root, "uploads");
const inputDir = path.join(root, "input");
const outputDir = path.join(root, "output");
const outputHistoryPath = path.join(outputDir, "history.json");
const presetsDir = path.join(root, "presets");
const presetsFilePath = path.join(presetsDir, "presets.json");
const port = Number(process.env.PORT || 8787);
const comfyTimeoutMs = Number(process.env.COMFY_TIMEOUT_MS || 10 * 60 * 1000);
const maxImageBodyBytes = Number(process.env.MAX_IMAGE_BODY_BYTES || 512 * 1024 * 1024);
const activeRuns = new Map();
const templates = createTemplateService({ configDir, defaultDir: defaultTemplateDir, templatesDir: userTemplatesDir });

async function readCustomPresets() {
  try {
    await mkdir(presetsDir, { recursive: true });
    const raw = await readFile(presetsFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCustomPresets(presets) {
  await mkdir(presetsDir, { recursive: true });
  await writeFile(presetsFilePath, JSON.stringify(presets, null, 2), "utf8");
}

async function assertTemplateWorkflow(config, template) {
  const workflow = JSON.parse(await readFile(template.workflowPath, "utf8"));
  validateWorkflowMappings(config, workflow);
  return workflow;
}

async function handleRun(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const runId = body.runId || randomUUID();
  const submittedAt = new Date().toISOString();
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
      inputDir,
      uploadDir,
      uploadImageToComfy,
      uploadedImageUrl,
      urlUploadMode: template.id === "image-adjust" ? "local_path" : "comfy_view_url"
    };
    for (const [id, value] of Object.entries(request)) {
      const patchedValue = await setWorkflowValue(workflow, id, value, target, abortController.signal, patchOptions);
      responseRequest[id] = value?.kind === "upload" || value?.kind === "input-image" ? patchedValue : value;
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
    const historyItem = await archiveOutputRun({
      runId,
      promptId: queued.prompt_id,
      template,
      address: target.label,
      target,
      config,
      history,
      values: body.values || {},
      submittedAt
    });
    send(res, 200, {
      runId,
      promptId: queued.prompt_id,
      template: template.id,
      address: target.label,
      submittedAt: historyItem.submittedAt,
      completedAt: historyItem.completedAt,
      durationMs: historyItem.durationMs,
      request: responseRequest,
      outputs: historyItem.outputs,
      rawOutputs: history?.outputs || {},
      historyItem
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

async function handleComfyModels(req, res, url) {
  const target = normalizeComfyTarget(url.searchParams.get("address"));
  send(res, 200, await listComfyModels(target));
}

async function handleComfyDiscovery(req, res, url) {
  const target = normalizeComfyTarget(url.searchParams.get("address"));
  const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
  send(res, 200, await getComfyDiscovery(target, { refresh }));
}

async function handleComfyHealth(req, res, url) {
  const target = normalizeComfyTarget(url.searchParams.get("address"));
  send(res, 200, await getComfyHealth(target));
}

function safeInputName(rawName = "") {
  return path.basename(String(rawName)).replace(/[^\w.-]+/g, "_");
}

function safeOutputName(rawName = "") {
  return path.basename(String(rawName)).replace(/[^\w.-]+/g, "_");
}

function inputImageUrl(filename) {
  return `/api/input-image?name=${encodeURIComponent(filename)}`;
}

async function listInputImages() {
  await mkdir(inputDir, { recursive: true });
  const entries = await readdir(inputDir, { withFileTypes: true });
  const images = await Promise.all(entries
    .filter(entry => entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name))
    .map(async entry => {
      const fileStat = await stat(path.join(inputDir, entry.name));
      const createdAt = fileStat.birthtimeMs > 0 ? fileStat.birthtime : fileStat.mtime;
      return {
        name: entry.name,
        url: inputImageUrl(entry.name),
        createdAt: createdAt.toISOString(),
        modifiedAt: fileStat.mtime.toISOString()
      };
    }));
  return images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function handleInputUpload(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) {
    send(res, 400, { error: "Invalid image data" });
    return;
  }
  const extension = parsed.mimeType.includes("jpeg") ? "jpg" : parsed.mimeType.split("/")[1] || "png";
  const originalName = safeInputName(body.filename || `input.${extension}`);
  const base = originalName.replace(/\.[^.]+$/, "") || "input";
  const filename = `${base}_${Date.now()}.${extension}`;
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(inputDir, filename), parsed.buffer);
  send(res, 200, {
    image: {
      name: filename,
      url: inputImageUrl(filename)
    },
    images: await listInputImages()
  });
}

async function handleInputImage(req, res, url) {
  const filename = safeInputName(url.searchParams.get("name"));
  if (!filename) {
    send(res, 400, { error: "Missing image name" });
    return;
  }
  const filePath = path.join(inputDir, filename);
  if (!filePath.startsWith(inputDir)) {
    send(res, 400, { error: "Invalid image path" });
    return;
  }
  const data = await readFile(filePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".jpg" || ext === ".jpeg"
    ? "image/jpeg"
    : ext === ".webp"
      ? "image/webp"
      : ext === ".gif"
        ? "image/gif"
        : "image/png";
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
  res.end(data);
}

async function handleDeleteInputImage(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const filename = safeInputName(body.name);
  if (!filename) {
    send(res, 400, { error: "Missing image name" });
    return;
  }
  const filePath = path.join(inputDir, filename);
  const relative = path.relative(inputDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    send(res, 400, { error: "Invalid image path" });
    return;
  }
  await rm(filePath, { force: true });
  send(res, 200, { images: await listInputImages() });
}

function outputImageUrl(filename) {
  return `/api/output-image?name=${encodeURIComponent(filename)}`;
}

async function readOutputHistory() {
  try {
    const raw = await readFile(outputHistoryPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOutputHistory(items) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputHistoryPath, JSON.stringify(items.slice(0, 50), null, 2));
}

function trimHistoryValues(values = {}) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    typeof value === "string" && value.length > 200000 ? "" : value
  ]));
}

async function archiveOutputRun({ runId, promptId, template, address, target, config, history, values, submittedAt }) {
  await mkdir(outputDir, { recursive: true });
  const completedAt = new Date().toISOString();
  const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(submittedAt || completedAt).getTime());
  const outputIds = Object.values(config.output || {}).map(item => String(item.id));
  const archivedOutputs = [];
  let index = 0;

  for (const nodeId of outputIds) {
    const images = history?.outputs?.[nodeId]?.images || [];
    for (const image of images) {
      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder || "",
        type: image.type || "output"
      });
      const response = await fetch(`${target.httpBase}/view?${query.toString()}`, {
        headers: target.headers
      });
      if (!response.ok) continue;
      const originalName = safeOutputName(image.filename || `output_${index}.png`);
      const ext = path.extname(originalName) || ".png";
      const base = originalName.replace(/\.[^.]+$/, "") || "output";
      const filename = `${Date.now()}_${runId}_${index}_${base}${ext}`;
      await writeFile(path.join(outputDir, filename), Buffer.from(await response.arrayBuffer()));
      archivedOutputs.push({
        nodeId,
        filename,
        originalFilename: image.filename,
        url: outputImageUrl(filename)
      });
      index += 1;
    }
  }

  const item = {
    id: runId,
    templateId: template.id,
    templateName: template.name || template.id,
    address,
    promptId,
    createdAt: completedAt,
    submittedAt: submittedAt || completedAt,
    completedAt,
    durationMs,
    outputs: archivedOutputs,
    status: "success",
    values: trimHistoryValues(values),
    result: {
      runId,
      promptId,
      template: template.id,
      address,
      submittedAt: submittedAt || completedAt,
      completedAt,
      durationMs,
      outputs: archivedOutputs
    }
  };
  const current = await readOutputHistory();
  await writeOutputHistory([item, ...current]);
  return item;
}

async function handleOutputImage(req, res, url) {
  const filename = safeOutputName(url.searchParams.get("name"));
  if (!filename) {
    send(res, 400, { error: "Missing output image name" });
    return;
  }
  const filePath = path.join(outputDir, filename);
  if (!filePath.startsWith(outputDir)) {
    send(res, 400, { error: "Invalid output image path" });
    return;
  }
  const data = await readFile(filePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".jpg" || ext === ".jpeg"
    ? "image/jpeg"
    : ext === ".webp"
      ? "image/webp"
      : ext === ".gif"
        ? "image/gif"
        : "image/png";
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
  res.end(data);
}

async function handleDeleteOutputHistory(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const current = await readOutputHistory();
  const targetItem = current.find(item => item.id === body.id);
  const next = current.filter(item => item.id !== body.id);
  if (targetItem) {
    await Promise.all((targetItem.outputs || []).map(output => (
      output.filename
        ? rm(path.join(outputDir, safeOutputName(output.filename)), { force: true })
        : Promise.resolve()
    )));
  }
  await writeOutputHistory(next);
  send(res, 200, { history: next });
}

async function handleSaveEditedOutput(req, res) {
  const body = JSON.parse(await readBody(req, maxImageBodyBytes) || "{}");
  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) {
    send(res, 400, { error: "Invalid image data" });
    return;
  }

  await mkdir(outputDir, { recursive: true });
  const runId = randomUUID();
  const completedAt = new Date().toISOString();
  const extension = parsed.mimeType.includes("jpeg") ? "jpg" : parsed.mimeType.split("/")[1] || "png";
  const sourceName = safeOutputName(body.sourceFilename || `output.${extension}`);
  const base = sourceName.replace(/\.[^.]+$/, "") || "output";
  const filename = `${Date.now()}_${runId}_0_${base}_edited.${extension}`;
  await writeFile(path.join(outputDir, filename), parsed.buffer);

  const outputs = [{
    nodeId: "image-editor",
    filename,
    originalFilename: sourceName,
    url: outputImageUrl(filename)
  }];
  const item = {
    id: runId,
    templateId: "image-editor",
    templateName: "Image Editor",
    address: body.address || "Image Editor",
    promptId: "editor",
    createdAt: completedAt,
    submittedAt: completedAt,
    completedAt,
    durationMs: 0,
    outputs,
    status: "success",
    values: {},
    result: {
      runId,
      promptId: "editor",
      template: "image-editor",
      address: body.address || "Image Editor",
      submittedAt: completedAt,
      completedAt,
      durationMs: 0,
      outputs
    }
  };

  const current = await readOutputHistory();
  const history = [item, ...current];
  await writeOutputHistory(history);
  send(res, 200, { historyItem: item, history: history.slice(0, 50) });
}

function slugifyTemplateId(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `template-${Date.now()}`;
}

function assertWritableTemplatePath(baseDir, targetDir) {
  const relative = path.relative(baseDir, targetDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid template path");
  }
}

async function handleTemplateEditor(req, res, url) {
  const { config, raw, template } = await templates.loadConfig(url.searchParams.get("template"));
  const workflow = JSON.parse(await readFile(template.workflowPath, "utf8"));
  send(res, 200, {
    config,
    raw,
    workflow,
    template: {
      id: template.id,
      name: template.name,
      isDefault: template.isDefault,
      yaml: template.yaml,
      workflow: template.workflow
    }
  });
}

async function handleTemplateSave(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const workflow = body.workflow;
  const config = body.config;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    send(res, 400, { error: "Missing workflow JSON object" });
    return;
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    send(res, 400, { error: "Missing YAML config object" });
    return;
  }
  const templateId = slugifyTemplateId(body.templateId || config?.template?.id || config?.app?.name);
  const existing = (await templates.loadTemplateRegistry()).templates.find(item => item.id === templateId);
  const targetRoot = existing
    ? (await templates.loadConfig(templateId)).template.baseDir
    : path.join(userTemplatesDir, templateId);
  assertWritableTemplatePath(configDir, targetRoot);

  const nextConfig = {
    app: {
      name: config.app?.name || templateId
    },
    input: config.input || {},
    output: config.output || {}
  };
  if (config.server && Object.keys(config.server).length > 0) {
    nextConfig.server = config.server;
  }

  validateWorkflowMappings(nextConfig, workflow);
  await mkdir(targetRoot, { recursive: true });
  await writeFile(path.join(targetRoot, "api.json"), `${JSON.stringify(workflow, null, 2)}\n`);
  await writeFile(path.join(targetRoot, "app_build.yaml"), YAML.stringify(nextConfig));

  const registry = await templates.loadTemplateRegistry();
  send(res, 200, {
    template: {
      id: templateId,
      name: nextConfig.app.name,
      yaml: "app_build.yaml",
      workflow: "api.json"
    },
    registry
  });
}
async function cleanupUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const now = Date.now();
    const files = await readdir(uploadDir);
    let count = 0;
    for (const file of files) {
      if (file === ".gitkeep" || file === ".DS_Store") continue;
      const filePath = path.join(uploadDir, file);
      const fileStat = await stat(filePath);
      if (now - fileStat.mtimeMs > maxAgeMs) {
        await rm(filePath, { force: true });
        count++;
      }
    }
    if (count > 0) {
      console.log(`[Cleanup] Cleaned up ${count} old upload file(s) in /uploads`);
    }
  } catch (error) {
    // Ignore error if directory doesn't exist yet
  }
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
    } else if (req.method === "GET" && url.pathname === "/api/template-editor") {
      await handleTemplateEditor(req, res, url);
    } else if (req.method === "POST" && url.pathname === "/api/templates/save") {
      await handleTemplateSave(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/run") {
      await handleRun(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/cancel") {
      await handleCancel(req, res);
    } else if (req.method === "GET" && url.pathname === "/api/comfy-view") {
      await handleComfyView(req, res, url);
    } else if (req.method === "GET" && url.pathname === "/api/comfy-models") {
      await handleComfyModels(req, res, url);
    } else if (req.method === "GET" && url.pathname === "/api/comfy-discovery") {
      await handleComfyDiscovery(req, res, url);
    } else if (req.method === "GET" && url.pathname === "/api/comfy-health") {
      await handleComfyHealth(req, res, url);
    } else if (req.method === "GET" && url.pathname === "/api/input-images") {
      send(res, 200, { images: await listInputImages() });
    } else if (req.method === "POST" && url.pathname === "/api/input-images") {
      await handleInputUpload(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/input-images/delete") {
      await handleDeleteInputImage(req, res);
    } else if (req.method === "GET" && url.pathname === "/api/input-image") {
      await handleInputImage(req, res, url);
    } else if (req.method === "GET" && url.pathname === "/api/output-history") {
      send(res, 200, { history: await readOutputHistory() });
    } else if (req.method === "POST" && url.pathname === "/api/output-history/delete") {
      await handleDeleteOutputHistory(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/output-history/edit") {
      await handleSaveEditedOutput(req, res);
    } else if (req.method === "GET" && url.pathname === "/api/output-image") {
      await handleOutputImage(req, res, url);
    } else if (req.method === "GET" && url.pathname === "/api/presets") {
      send(res, 200, { presets: await readCustomPresets() });
    } else if (req.method === "POST" && url.pathname === "/api/presets") {
      const body = JSON.parse(await readBody(req) || "{}");
      const nextPresets = body.presets || [];
      await writeCustomPresets(nextPresets);
      send(res, 200, { success: true, presets: nextPresets });
    } else {
      send(res, 404, { error: "Not found" });
    }
  } catch (error) {
    send(res, 500, { error: error.message || String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ComfyUI YAML app server listening on http://127.0.0.1:${port}`);
  cleanupUploads().catch(console.error);
  setInterval(() => {
    cleanupUploads().catch(console.error);
  }, 6 * 60 * 60 * 1000).unref();
});
