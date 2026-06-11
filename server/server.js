import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  cancelQueueItems,
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
  uploadMaskToComfy,
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
import { buildPatchedRunningHubWorkflow, buildRunningHubNodeInfoList } from "./lib/runningHubWorkflow.js";
import { TEMPLATE_SCOPES } from "./lib/templateService.js";
import {
  getWebappNodes,
  getWorkflowJson,
  parsePromptTips,
  prepareNodeInfoList,
  submitAiAppTask,
  submitWorkflowTask,
  waitForTaskOutputs,
  extractRhConsumeCoins,
  fetchAccountRemainCoins,
  resolveRhTaskCoins,
  inspectRhTask,
  submitRhTaskWhenReady,
  waitForRhApiKeyIdle
} from "./lib/runningHubClient.js";
import { withRhApiKeyLock } from "./lib/rhTokenLock.js";
import {
  appendRunLog,
  clearRunLogSessions,
  deleteRunLogSession,
  endRunLogSession,
  getRunLogSessions,
  initRunLogStore,
  startRunLogSession,
  updateRunLogSession
} from "./lib/runLogStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const configDir = path.join(root, "config");
const defaultTemplateDir = path.join(configDir, "default");
const userTemplatesDir = path.join(configDir, "templates");
const defaultRhDir = path.join(configDir, "default-rh");
const templatesRhDir = path.join(configDir, "templates-rh");
const uploadDir = path.join(root, "uploads");
const inputDir = path.join(root, "input");
const outputDir = path.join(root, "output");
const outputHistoryPath = path.join(outputDir, "history.json");
const presetsDir = path.join(root, "presets");
const presetsFilePath = path.join(presetsDir, "presets.json");
const workflowPresetsFilePath = path.join(presetsDir, "workflow-presets.json");
const port = Number(process.env.PORT || 8787);
const comfyTimeoutMs = Number(process.env.COMFY_TIMEOUT_MS || 10 * 60 * 1000);
const maxImageBodyBytes = Number(process.env.MAX_IMAGE_BODY_BYTES || 512 * 1024 * 1024);
const maxOutputHistoryItems = 500;
const activeRuns = new Map();
const activeRhRuns = new Map();
const pendingSseClients = new Map();
const runningHubTimeoutMs = Number(process.env.RUNNINGHUB_TIMEOUT_MS || 10 * 60 * 1000);

function broadcastRunEvent(run, message) {
  if (!run.sseClients?.size) return;
  const data = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of run.sseClients) {
    try { client.res.write(data); } catch { run.sseClients.delete(client); }
  }
}

async function handleRunEvents(req, res, url) {
  const runId = url.searchParams.get("runId");
  if (!runId) { send(res, 400, { error: "Missing runId" }); return; }
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "connection": "keep-alive"
  });
  res.flushHeaders?.();
  const client = { res };
  const run = activeRuns.get(runId) || activeRhRuns.get(runId);
  if (run) {
    run.sseClients.add(client);
  } else {
    if (!pendingSseClients.has(runId)) pendingSseClients.set(runId, new Set());
    pendingSseClients.get(runId).add(client);
    // Auto-cleanup pending client after 60s if run never starts
    setTimeout(() => {
      if (pendingSseClients.get(runId)?.has(client)) {
        pendingSseClients.get(runId).delete(client);
        try { res.end(); } catch {}
      }
    }, 60000);
  }
  req.on("close", () => {
    activeRuns.get(runId)?.sseClients?.delete(client);
    activeRhRuns.get(runId)?.sseClients?.delete(client);
    pendingSseClients.get(runId)?.delete(client);
  });
}

function attachRhRun(runId, abortController) {
  const pending = pendingSseClients.get(runId);
  const run = {
    abortController,
    cancelled: false,
    sseClients: new Set(pending || []),
    taskId: null
  };
  pendingSseClients.delete(runId);
  activeRhRuns.set(runId, run);
  return run;
}

function closeRhRun(run, runId) {
  broadcastRunEvent(run, { type: "run_end", data: { runId } });
  for (const client of run.sseClients) {
    try { client.res.end(); } catch {}
  }
  activeRhRuns.delete(runId);
}
const templates = createTemplateService({
  configDir,
  defaultDir: defaultTemplateDir,
  templatesDir: userTemplatesDir,
  defaultRhDir,
  templatesRhDir
});

function templateScopeFromUrl(url) {
  return templates.normalizeScope(url.searchParams.get("scope"));
}

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

async function readWorkflowPresets() {
  try {
    await mkdir(presetsDir, { recursive: true });
    const raw = await readFile(workflowPresetsFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeWorkflowPresets(presets) {
  await mkdir(presetsDir, { recursive: true });
  await writeFile(workflowPresetsFilePath, JSON.stringify(presets, null, 2), "utf8");
}

async function assertTemplateWorkflow(config, template, options = {}) {
  const workflow = JSON.parse(await readFile(template.workflowPath, "utf8"));
  validateWorkflowMappings(config, workflow, options);
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
    ws: null,
    sseClients: new Set(pendingSseClients.get(runId) || [])
  };
  pendingSseClients.delete(runId);
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
      uploadMaskToComfy,
      parseDataUrl,
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
    const onEvent = (message) => broadcastRunEvent(run, message);
    await waitForPrompt(target, queued.prompt_id, clientId, run, comfyTimeoutMs, onEvent);
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
    broadcastRunEvent(run, { type: "run_end", data: { runId } });
    for (const client of run.sseClients) {
      try { client.res.end(); } catch {}
    }
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
      if (run.promptId) {
        await cancelQueueItems(run.target, { promptIds: [run.promptId] }).catch(() => {});
      }
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

function imageExtensionFromMime(mimeType = "") {
  const normalized = String(mimeType).split(";")[0].trim().toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/avif") return "avif";
  return "";
}

function imageMimeFromExt(filename = "") {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".avif") return "image/avif";
  return "";
}

function sourceFilenameFromUrl(sourceUrl, fallbackExt = "png") {
  try {
    const parsed = new URL(sourceUrl);
    const basename = safeInputName(path.basename(parsed.pathname || ""));
    if (basename && /\.[a-z0-9]+$/i.test(basename)) return basename;
  } catch {
    // Fall back below.
  }
  return `url-image.${fallbackExt || "png"}`;
}

async function saveInputImageBuffer(buffer, sourceName, mimeType = "") {
  const extFromMime = imageExtensionFromMime(mimeType);
  const originalName = safeInputName(sourceName || `input.${extFromMime || "png"}`);
  const ext = path.extname(originalName) || `.${extFromMime || "png"}`;
  const base = originalName.replace(/\.[^.]+$/, "") || "input";
  const filename = `${base}_${Date.now()}${ext}`;
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(inputDir, filename), buffer);
  return {
    name: filename,
    url: inputImageUrl(filename)
  };
}

async function walkFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function runProcess(command, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: error.message || stderr });
    });
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function runGalleryDl(sourceUrl, destinationDir) {
  const galleryArgs = ["-m", "gallery_dl", "--no-input", "--range", "1", "-D", destinationDir, sourceUrl];
  const pythonCandidates = [process.env.PYTHON || "", "python3", "python"].filter(Boolean);
  let lastResult = null;
  for (const python of pythonCandidates) {
    const result = await runProcess(python, galleryArgs);
    lastResult = result;
    if (result.ok) return result;
  }
  return lastResult || { ok: false, stderr: "Không tìm thấy Python/gallery-dl" };
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
  const extension = imageExtensionFromMime(parsed.mimeType) || "png";
  const image = await saveInputImageBuffer(parsed.buffer, body.filename || `input.${extension}`, parsed.mimeType);
  send(res, 200, {
    image,
    images: await listInputImages()
  });
}

async function handleInputFromUrl(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const sourceUrl = String(body.url || "").trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    send(res, 400, { error: "URL không hợp lệ" });
    return;
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    send(res, 400, { error: "Chỉ hỗ trợ URL http/https" });
    return;
  }

  try {
    const response = await fetch(sourceUrl, {
      headers: { "user-agent": "aPix-Builder/1.0" },
      signal: AbortSignal.timeout(45000)
    });
    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (response.ok && contentType.toLowerCase().startsWith("image/")) {
      if (contentLength > maxImageBodyBytes) throw new Error("Ảnh vượt quá giới hạn dung lượng");
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = imageExtensionFromMime(contentType) || path.extname(parsedUrl.pathname).replace(/^\./, "") || "png";
      const image = await saveInputImageBuffer(buffer, sourceFilenameFromUrl(sourceUrl, ext), contentType);
      send(res, 200, {
        image,
        images: await listInputImages(),
        source: "direct"
      });
      return;
    }
  } catch {
    // Non-direct pages and blocked direct downloads are handled by gallery-dl below.
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "apix-gallery-dl-"));
  try {
    const result = await runGalleryDl(sourceUrl, tempDir);
    if (!result.ok) {
      const message = result.stderr || result.stdout || "gallery-dl không tải được ảnh từ URL này";
      send(res, 502, { error: message.trim().slice(0, 800) });
      return;
    }
    const downloadedFiles = (await walkFiles(tempDir))
      .filter(filePath => /\.(png|jpe?g|webp|gif|avif)$/i.test(filePath))
      .sort();
    if (!downloadedFiles.length) {
      send(res, 502, { error: "gallery-dl chạy xong nhưng không tìm thấy file ảnh" });
      return;
    }
    const firstFile = downloadedFiles[0];
    const buffer = await readFile(firstFile);
    if (buffer.byteLength > maxImageBodyBytes) {
      send(res, 413, { error: "Ảnh vượt quá giới hạn dung lượng" });
      return;
    }
    const image = await saveInputImageBuffer(buffer, path.basename(firstFile), imageMimeFromExt(firstFile));
    send(res, 200, {
      image,
      images: await listInputImages(),
      source: "gallery-dl"
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
  await writeFile(outputHistoryPath, JSON.stringify(items.slice(0, maxOutputHistoryItems), null, 2));
}

function trimHistoryValue(value) {
  if (typeof value === "string") return value.length > 200000 ? "" : value;
  if (Array.isArray(value)) return value.map(trimHistoryValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, trimHistoryValue(child)]));
  }
  return value;
}

function trimHistoryValues(values = {}) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, trimHistoryValue(value)]));
}

function runningHubHistoryValues(nodes = []) {
  const values = {};
  for (const node of nodes) {
    if (!node?.nodeId || !node?.fieldName) continue;
    values[`${node.nodeId}|${node.fieldName}`] = trimHistoryValue(node.fieldValue ?? "");
  }
  return values;
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
  send(res, 200, { historyItem: item, history: history.slice(0, maxOutputHistoryItems) });
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

async function readTemplateWorkflow(config, template) {
  if (!template.workflowPath) return null;
  if (templates.usesSavedWorkflowJson(config, template) === false) return null;
  return JSON.parse(await readFile(template.workflowPath, "utf8"));
}

async function handleTemplateEditor(req, res, url) {
  const scope = templateScopeFromUrl(url);
  const { config, raw, template } = await templates.loadConfig(url.searchParams.get("template"), scope);
  const workflow = await readTemplateWorkflow(config, template);
  send(res, 200, {
    config,
    raw,
    workflow,
    scope,
    template: {
      id: template.id,
      name: template.name,
      isDefault: template.isDefault,
      yaml: template.yaml,
      workflow: template.workflow,
      scope
    }
  });
}

async function handleTemplateDelete(req, res, url) {
  const body = JSON.parse(await readBody(req) || "{}");
  const scope = templates.normalizeScope(body.scope || url?.searchParams?.get("scope"));
  const templateId = String(body.templateId || "").trim();
  if (!templateId) {
    send(res, 400, { error: "Missing template id" });
    return;
  }
  try {
    const registry = await templates.deleteTemplate(templateId, scope);
    send(res, 200, { scope, registry });
  } catch (error) {
    send(res, 400, { error: error.message || "Không xóa được template" });
  }
}

function buildRunningHubConfigSection(config = {}) {
  const rh = config.runninghub || {};
  const next = {
    workflowId: String(rh.workflowId || "").trim(),
    saveWorkflowJson: rh.saveWorkflowJson !== false
  };
  if (rh.saveWorkflowJson === false) next.saveWorkflowJson = false;
  if (rh.addMetadata) next.addMetadata = true;
  if (rh.usePersonalQueue) next.usePersonalQueue = true;
  const accessPassword = String(rh.accessPassword || "").trim();
  if (accessPassword) next.accessPassword = accessPassword;
  return next;
}

async function handleTemplateSave(req, res, url) {
  const body = JSON.parse(await readBody(req) || "{}");
  const scope = templates.normalizeScope(body.scope || url?.searchParams?.get("scope"));
  const isRhWf = scope === TEMPLATE_SCOPES.runninghubWf;
  const workflow = body.workflow;
  const config = body.config;
  const saveWorkflowJson = isRhWf ? config?.runninghub?.saveWorkflowJson !== false : true;
  if (!isRhWf || saveWorkflowJson) {
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
      send(res, 400, { error: "Missing workflow JSON object" });
      return;
    }
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    send(res, 400, { error: "Missing YAML config object" });
    return;
  }
  if (isRhWf && !String(config.runninghub?.workflowId || "").trim()) {
    send(res, 400, { error: "YAML thiếu runninghub.workflowId" });
    return;
  }
  const templateId = slugifyTemplateId(body.templateId || config?.template?.id || config?.app?.name);
  const { targetRoot, savedAsCopy } = await templates.resolveSaveTargetRoot(templateId, scope);
  assertWritableTemplatePath(configDir, targetRoot);

  const nextConfig = {
    app: {
      name: config.app?.name || templateId
    },
    input: config.input || {}
  };
  if (isRhWf) {
    nextConfig.runninghub = buildRunningHubConfigSection(config);
  } else {
    nextConfig.output = config.output || {};
  }
  if (config.server && Object.keys(config.server).length > 0) {
    nextConfig.server = config.server;
  }

  if (!isRhWf || saveWorkflowJson) {
    validateWorkflowMappings(nextConfig, workflow, { requireOutput: !isRhWf });
  }
  await mkdir(targetRoot, { recursive: true });
  const workflowPath = path.join(targetRoot, "api.json");
  if (!isRhWf || saveWorkflowJson) {
    await writeFile(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`);
  } else {
    await rm(workflowPath, { force: true });
  }
  await writeFile(path.join(targetRoot, "app_build.yaml"), YAML.stringify(nextConfig));

  const nextRegistry = await templates.loadTemplateRegistry(scope);
  send(res, 200, {
    scope,
    savedAsCopy,
    template: {
      id: templateId,
      name: nextConfig.app.name,
      yaml: "app_build.yaml",
      workflow: "api.json",
      scope,
      isDefault: false
    },
    registry: nextRegistry
  });
}

async function handleRunningHubWfWorkflowJson(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const apiKey = String(body.apiKey || "").trim();
    const workflowId = String(body.workflowId || "").trim();
    if (!apiKey) {
      send(res, 400, { error: "Missing RunningHub API key" });
      return;
    }
    if (!workflowId) {
      send(res, 400, { error: "Missing RunningHub workflowId" });
      return;
    }
    const workflow = await getWorkflowJson(apiKey, workflowId);
    send(res, 200, { workflow, workflowId });
  } catch (error) {
    send(res, 500, { error: error.message || "Không load được workflow từ RunningHub" });
  }
}
async function handleRunningHubNodes(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const apiKey = String(body.apiKey || "").trim();
  const webappId = String(body.webappId || "").trim();
  if (!apiKey) {
    send(res, 400, { error: "Missing RunningHub API key" });
    return;
  }
  if (!webappId) {
    send(res, 400, { error: "Missing RunningHub webappId" });
    return;
  }
  const nodes = await getWebappNodes(apiKey, webappId);
  send(res, 200, { nodes, webappId });
}

async function archiveRunningHubOutputs({
  runId,
  webappId,
  workflowId,
  rhMode = "app",
  rhWfTemplateId = "",
  taskId,
  outputs,
  rhCoins = null,
  nodes,
  values: savedValues,
  submittedAt
}) {
  await mkdir(outputDir, { recursive: true });
  const completedAt = new Date().toISOString();
  const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(submittedAt || completedAt).getTime());
  const archivedOutputs = [];
  let index = 0;

  for (const output of outputs) {
    const fileUrl = output.fileUrl || output.url;
    if (!fileUrl) continue;
    const response = await fetch(fileUrl);
    if (!response.ok) continue;
    const ext = String(output.fileType || path.extname(fileUrl).slice(1) || "png").replace(/^\./, "");
    const filename = `${Date.now()}_${runId}_${index}_rh.${ext}`;
    await writeFile(path.join(outputDir, filename), Buffer.from(await response.arrayBuffer()));
    archivedOutputs.push({
      nodeId: output.nodeId || "runninghub",
      filename,
      originalFilename: path.basename(fileUrl.split("?")[0]),
      url: outputImageUrl(filename),
      remoteUrl: fileUrl
    });
    index += 1;
  }

  if (!archivedOutputs.length) {
    throw new Error("RunningHub hoàn tất nhưng không tải được file kết quả");
  }

  const resolvedRhCoins = rhCoins ?? extractRhConsumeCoins(outputs, { data: outputs });

  const isWf = rhMode === "wf";
  const resourceId = isWf ? workflowId : webappId;
  const templatePrefix = isWf ? "runninghub-wf" : "runninghub-app";
  const templateId = `${templatePrefix}:${resourceId}`;
  const templateName = isWf
    ? (rhWfTemplateId ? `RH Wf · ${rhWfTemplateId}` : `RunningHub Wf ${workflowId}`)
    : `RunningHub App ${webappId}`;

  const item = {
    id: runId,
    templateId: isWf && rhWfTemplateId ? `runninghub-wf-template:${rhWfTemplateId}` : templateId,
    templateName,
    address: "RunningHub Cloud",
    promptId: String(taskId),
    createdAt: completedAt,
    submittedAt: submittedAt || completedAt,
    completedAt,
    durationMs,
    rhCoins: resolvedRhCoins,
    outputs: archivedOutputs,
    status: "success",
    provider: "runninghub",
    rhMode,
    rhWfTemplateId: isWf ? (rhWfTemplateId || undefined) : undefined,
    webappId: isWf ? undefined : webappId,
    workflowId: isWf ? workflowId : undefined,
    nodes: trimHistoryValue(Array.isArray(nodes) ? nodes : []),
    values: savedValues && Object.keys(savedValues).length
      ? trimHistoryValues(savedValues)
      : runningHubHistoryValues(nodes),
    result: {
      runId,
      taskId: String(taskId),
      template: templateId,
      address: "RunningHub Cloud",
      provider: "runninghub",
      rhMode,
      rhWfTemplateId: isWf ? (rhWfTemplateId || undefined) : undefined,
      webappId: isWf ? undefined : webappId,
      workflowId: isWf ? workflowId : undefined,
      submittedAt: submittedAt || completedAt,
      completedAt,
      durationMs,
      rhCoins: resolvedRhCoins,
      outputs: archivedOutputs
    }
  };
  const current = await readOutputHistory();
  await writeOutputHistory([item, ...current]);
  return item;
}

async function handleRunningHubRun(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const runId = body.runId || randomUUID();
  const submittedAt = new Date().toISOString();
  const apiKey = String(body.apiKey || "").trim();
  const webappId = String(body.webappId || "").trim();
  const abortController = new AbortController();
  const run = attachRhRun(runId, abortController);
  const emitRhStatus = (status, label, taskId = run.taskId) => {
    broadcastRunEvent(run, {
      type: "rh_task_status",
      data: { taskId: taskId ? String(taskId) : null, status, label }
    });
  };

  const onTokenWait = ({ label, status }) => {
    emitRhStatus(status || "waiting", label || "Đang chờ API key RunningHub rảnh...");
  };

  try {
    if (!apiKey) throw new Error("Missing RunningHub API key");
    if (!webappId) throw new Error("Missing RunningHub webappId");
    if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
      throw new Error("Missing RunningHub node list");
    }

    await withRhApiKeyLock(apiKey, runId, async () => {
      await waitForRhApiKeyIdle(apiKey, {
        signal: abortController.signal,
        onWait: onTokenWait
      });

      const coinsBefore = await fetchAccountRemainCoins(apiKey, abortController.signal);
      emitRhStatus("upload", "Đang upload dữ liệu lên RunningHub...");
      const nodeInfoList = await prepareNodeInfoList(apiKey, body.nodes, {
        inputDir,
        signal: abortController.signal,
        onProgress: ({ label }) => emitRhStatus("upload", label || "Đang upload dữ liệu...")
      });
      emitRhStatus("submit", "Đang gửi task lên RunningHub...");
      const submitData = await submitRhTaskWhenReady(
        apiKey,
        () => submitAiAppTask(apiKey, webappId, nodeInfoList, abortController.signal),
        { signal: abortController.signal, onWait: onTokenWait }
      );
      const taskId = submitData.taskId;
      if (!taskId) throw new Error("RunningHub không trả về taskId");
      run.taskId = taskId;
      broadcastRunEvent(run, {
        type: "rh_task_submitted",
        data: { taskId: String(taskId) }
      });

      const promptTips = parsePromptTips(submitData.promptTips);
      if (promptTips?.node_errors && Object.keys(promptTips.node_errors).length > 0) {
        const firstError = Object.entries(promptTips.node_errors)[0];
        throw new Error(`Node ${firstError[0]} lỗi: ${JSON.stringify(firstError[1])}`);
      }

      const { outputs, rhCoins } = await waitForTaskOutputs(apiKey, taskId, {
        timeoutMs: runningHubTimeoutMs,
        signal: abortController.signal,
        onStatus: ({ type, label }) => emitRhStatus(type || "waiting", label || "Đang chờ RunningHub...", taskId)
      });
      const resolvedRhCoins = await resolveRhTaskCoins(apiKey, {
        outputs,
        rhCoins,
        coinsBefore,
        signal: abortController.signal
      });
      const historyItem = await archiveRunningHubOutputs({
        runId,
        webappId,
        rhMode: "app",
        taskId,
        outputs,
        rhCoins: resolvedRhCoins,
        nodes: body.nodes,
        submittedAt
      });
      send(res, 200, {
        runId,
        taskId: String(taskId),
        provider: "runninghub",
        rhMode: "app",
        webappId,
        submittedAt: historyItem.submittedAt,
        completedAt: historyItem.completedAt,
        durationMs: historyItem.durationMs,
        rhCoins: historyItem.rhCoins,
        outputs: historyItem.outputs,
        historyItem
      });
    }, {
      signal: abortController.signal,
      onWait: onTokenWait
    });
  } finally {
    closeRhRun(run, runId);
  }
}

async function handleRunningHubWfRun(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const runId = body.runId || randomUUID();
  const submittedAt = new Date().toISOString();
  const apiKey = String(body.apiKey || "").trim();
  const templateId = String(body.templateId || "").trim();
  const abortController = new AbortController();
  const run = attachRhRun(runId, abortController);
  const emitRhStatus = (status, label, taskId = run.taskId) => {
    broadcastRunEvent(run, {
      type: "rh_task_status",
      data: { taskId: taskId ? String(taskId) : null, status, label }
    });
  };

  const onTokenWait = ({ label, status }) => {
    emitRhStatus(status || "waiting", label || "Đang chờ API key RunningHub rảnh...");
  };

  try {
    if (!apiKey) throw new Error("Missing RunningHub API key");
    if (!templateId) throw new Error("Missing RunningHub Workflow template");

    const { config, template } = await templates.loadConfig(templateId, TEMPLATE_SCOPES.runninghubWf);
    const sourceWorkflowId = String(config.runninghub?.workflowId || "").trim();
    const taskOptions = templates.runningHubTaskOptions(config);
    const useSavedWorkflowJson = templates.usesSavedWorkflowJson(config, template);
    if (!sourceWorkflowId && !useSavedWorkflowJson) {
      throw new Error("Template thiếu runninghub.workflowId");
    }

    const normalized = await normalizeValues(body.values || {});
    const request = mapValuesToRequest(config, normalized);
    if (!Object.keys(request).length) {
      throw new Error("Template chưa có input nào để gửi");
    }

    await withRhApiKeyLock(apiKey, runId, async () => {
      await waitForRhApiKeyIdle(apiKey, {
        signal: abortController.signal,
        onWait: onTokenWait
      });

      const coinsBefore = await fetchAccountRemainCoins(apiKey, abortController.signal);
      emitRhStatus("upload", "Đang chuẩn bị dữ liệu workflow...");
      let submitData;
      if (useSavedWorkflowJson) {
        if (!template.workflowPath) {
          throw new Error("Template bật lưu JSON nhưng thiếu file api.json");
        }
        const workflow = structuredClone(JSON.parse(await readFile(template.workflowPath, "utf8")));
        const patchedWorkflow = await buildPatchedRunningHubWorkflow(workflow, request, apiKey, {
          inputDir,
          signal: abortController.signal
        });
        emitRhStatus("submit", "Đang gửi workflow lên RunningHub...");
        submitData = await submitRhTaskWhenReady(
          apiKey,
          () => submitWorkflowTask(apiKey, {
            workflow: patchedWorkflow,
            ...taskOptions,
            workflowId: sourceWorkflowId
          }, abortController.signal),
          { signal: abortController.signal, onWait: onTokenWait }
        );
      } else {
        const nodeInfoList = await buildRunningHubNodeInfoList(request, apiKey, {
          inputDir,
          signal: abortController.signal
        });
        emitRhStatus("submit", "Đang gửi workflow lên RunningHub...");
        submitData = await submitRhTaskWhenReady(
          apiKey,
          () => submitWorkflowTask(apiKey, {
            nodeInfoList,
            ...taskOptions,
            workflowId: sourceWorkflowId
          }, abortController.signal),
          { signal: abortController.signal, onWait: onTokenWait }
        );
      }
      const taskId = submitData.taskId;
      if (!taskId) throw new Error("RunningHub không trả về taskId");
      run.taskId = taskId;
      broadcastRunEvent(run, {
        type: "rh_task_submitted",
        data: { taskId: String(taskId) }
      });

      const promptTips = parsePromptTips(submitData.promptTips);
      if (promptTips?.node_errors && Object.keys(promptTips.node_errors).length > 0) {
        const firstError = Object.entries(promptTips.node_errors)[0];
        throw new Error(`Node ${firstError[0]} lỗi: ${JSON.stringify(firstError[1])}`);
      }

      const { outputs, rhCoins } = await waitForTaskOutputs(apiKey, taskId, {
        timeoutMs: runningHubTimeoutMs,
        signal: abortController.signal,
        onStatus: ({ type, label }) => emitRhStatus(type || "waiting", label || "Đang chờ RunningHub...", taskId)
      });
      const resolvedRhCoins = await resolveRhTaskCoins(apiKey, {
        outputs,
        rhCoins,
        coinsBefore,
        signal: abortController.signal
      });
      const historyItem = await archiveRunningHubOutputs({
        runId,
        workflowId: sourceWorkflowId,
        rhMode: "wf",
        rhWfTemplateId: templateId,
        taskId,
        outputs,
        rhCoins: resolvedRhCoins,
        nodes: [],
        values: body.values || {},
        submittedAt
      });
      send(res, 200, {
        runId,
        taskId: String(taskId),
        provider: "runninghub",
        rhMode: "wf",
        workflowId: sourceWorkflowId,
        templateId,
        submittedAt: historyItem.submittedAt,
        completedAt: historyItem.completedAt,
        durationMs: historyItem.durationMs,
        rhCoins: historyItem.rhCoins,
        outputs: historyItem.outputs,
        historyItem
      });
    }, {
      signal: abortController.signal,
      onWait: onTokenWait
    });
  } finally {
    closeRhRun(run, runId);
  }
}

async function handleRunningHubCancel(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const run = activeRhRuns.get(body.runId);
  if (!run) {
    send(res, 200, { cancelled: false, message: "Run is not active" });
    return;
  }
  run.cancelled = true;
  run.abortController.abort();
  send(res, 200, { cancelled: true, message: "Đã hủy task RunningHub đang chờ" });
}

function handleRunLogSessions(_req, res) {
  send(res, 200, { sessions: getRunLogSessions() });
}

async function handleRunLogMutate(req, res, mutate) {
  const body = JSON.parse(await readBody(req) || "{}");
  const sessions = mutate(body);
  send(res, 200, { sessions });
}

async function handleRunningHubTaskCheck(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const apiKey = String(body.apiKey || "").trim();
  const taskId = String(body.taskId || "").trim();
  if (!apiKey) {
    send(res, 400, { error: "Missing RunningHub API key" });
    return;
  }
  if (!taskId) {
    send(res, 400, { error: "Missing taskId" });
    return;
  }
  const detail = await inspectRhTask(apiKey, taskId);
  send(res, 200, { detail });
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
      const registry = await templates.loadTemplateRegistry(templateScopeFromUrl(url));
      send(res, 200, registry);
    } else if (req.method === "GET" && url.pathname === "/api/config") {
      const scope = templateScopeFromUrl(url);
      const { config, raw, server: serverConfig, template } = await templates.loadConfig(url.searchParams.get("template"), scope);
      if (scope !== TEMPLATE_SCOPES.runninghubWf || templates.usesSavedWorkflowJson(config, template)) {
        await assertTemplateWorkflow(config, template, {
          requireOutput: scope !== TEMPLATE_SCOPES.runninghubWf
        });
      }
      send(res, 200, {
        config,
        raw,
        server: serverConfig,
        scope,
        template: {
          id: template.id,
          name: template.name,
          yaml: template.yaml,
          workflow: template.workflow,
          scope
        }
      });
    } else if (req.method === "GET" && url.pathname === "/api/template-editor") {
      await handleTemplateEditor(req, res, url);
    } else if (req.method === "POST" && url.pathname === "/api/templates/save") {
      await handleTemplateSave(req, res, url);
    } else if (req.method === "POST" && url.pathname === "/api/templates/delete") {
      await handleTemplateDelete(req, res, url);
    } else if (req.method === "POST" && url.pathname === "/api/runninghub-wf/workflow-json") {
      await handleRunningHubWfWorkflowJson(req, res);
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
    } else if (req.method === "POST" && url.pathname === "/api/comfy-queue-cancel") {
      const body = JSON.parse(await readBody(req) || "{}");
      const target = normalizeComfyTarget(body.address);
      await cancelQueueItems(target, { clear: Boolean(body.clear), promptIds: body.promptIds || [] });
      send(res, 200, { ok: true });
    } else if (req.method === "GET" && url.pathname === "/api/run-events") {
      await handleRunEvents(req, res, url);
    } else if (req.method === "GET" && url.pathname === "/api/input-images") {
      const all = await listInputImages();
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10)));
      const start = (page - 1) * limit;
      send(res, 200, { images: all.slice(start, start + limit), total: all.length, page, limit });
    } else if (req.method === "POST" && url.pathname === "/api/input-images") {
      await handleInputUpload(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/input-images/from-url") {
      await handleInputFromUrl(req, res);
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
    } else if (req.method === "GET" && url.pathname === "/api/workflow-presets") {
      send(res, 200, { presets: await readWorkflowPresets() });
    } else if (req.method === "POST" && url.pathname === "/api/workflow-presets") {
      const body = JSON.parse(await readBody(req) || "{}");
      const nextPresets = body.presets && typeof body.presets === "object" && !Array.isArray(body.presets)
        ? body.presets
        : {};
      await writeWorkflowPresets(nextPresets);
      send(res, 200, { success: true, presets: nextPresets });
    } else if (req.method === "POST" && url.pathname === "/api/runninghub/nodes") {
      await handleRunningHubNodes(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/runninghub/run") {
      await handleRunningHubRun(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/runninghub-wf/run") {
      await handleRunningHubWfRun(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/runninghub/cancel") {
      await handleRunningHubCancel(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/runninghub/task-check") {
      await handleRunningHubTaskCheck(req, res);
    } else if (req.method === "GET" && url.pathname === "/api/run-log/sessions") {
      handleRunLogSessions(req, res);
    } else if (req.method === "POST" && url.pathname === "/api/run-log/session/start") {
      await handleRunLogMutate(req, res, body => startRunLogSession(body.job, body.meta || {}));
    } else if (req.method === "POST" && url.pathname === "/api/run-log/session/update") {
      await handleRunLogMutate(req, res, body => updateRunLogSession(body.runId, body.patch || {}));
    } else if (req.method === "POST" && url.pathname === "/api/run-log/append") {
      await handleRunLogMutate(req, res, body => appendRunLog(body.runId, body.level, body.message, body.meta || {}));
    } else if (req.method === "POST" && url.pathname === "/api/run-log/session/end") {
      await handleRunLogMutate(req, res, body => endRunLogSession(body.runId, body.status, body.meta || {}));
    } else if (req.method === "POST" && url.pathname === "/api/run-log/session/delete") {
      await handleRunLogMutate(req, res, body => deleteRunLogSession(body.sessionId));
    } else if (req.method === "POST" && url.pathname === "/api/run-log/clear") {
      await handleRunLogMutate(req, res, () => clearRunLogSessions());
    } else {
      send(res, 404, { error: "Not found" });
    }
  } catch (error) {
    send(res, 500, { error: error.message || String(error) });
  }
});

initRunLogStore()
  .then(() => {
    server.listen(port, "127.0.0.1", () => {
      console.log(`ComfyUI YAML app server listening on http://127.0.0.1:${port}`);
      cleanupUploads().catch(console.error);
      setInterval(() => {
        cleanupUploads().catch(console.error);
      }, 6 * 60 * 60 * 1000).unref();
    });
  })
  .catch(error => {
    console.error("Failed to initialize run log store:", error);
    process.exit(1);
  });
