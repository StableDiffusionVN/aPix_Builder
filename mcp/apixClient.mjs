// Client for a running aPix Builder server (desktop app or `npm run server`),
// shared by the MCP server (mcp/apix-mcp.mjs) and the `apix` CLI.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { lookupMenuSubFields, menuChoiceOptions, menuChoiceValue, parseMenuChoices, resolveMenuStoredValue } from "../shared/menuChoices.js";

const DEFAULT_URL = "http://127.0.0.1:8787";
const MEDIA_TYPES = new Set(["image", "image_mask", "file", "video", "audio"]);
const NUMBER_TYPES = new Set(["int", "float", "number", "slider"]);
const IMAGE_MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp" };
const RUN_KIND = "mcp";

function runtimeFile() {
  return process.env.APIX_RUNTIME_FILE || path.join(os.homedir(), ".apix", "server.json");
}

function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function candidateUrls() {
  const urls = [];
  if (process.env.APIX_URL) urls.push(process.env.APIX_URL.replace(/\/+$/, ""));
  try {
    const info = JSON.parse(readFileSync(runtimeFile(), "utf8"));
    if (info?.url && processAlive(info.pid)) urls.push(info.url);
  } catch {
    // No running app published its address.
  }
  urls.push(DEFAULT_URL);
  return [...new Set(urls)];
}

/** Hide user:password in addresses such as https://user:pass@host. */
export function maskAddress(address) {
  return String(address || "").replace(/\/\/[^/@]+@/, "//***@");
}

export class ApixError extends Error {}

export class ApixClient {
  constructor() {
    this.baseUrl = null;
  }

  async connect() {
    if (this.baseUrl) return this.baseUrl;
    for (const url of candidateUrls()) {
      try {
        const response = await fetch(`${url}/api/templates`, { signal: AbortSignal.timeout(2500) });
        if (response.ok) {
          this.baseUrl = url;
          return url;
        }
      } catch {
        // Try the next candidate.
      }
    }
    throw new ApixError("Không kết nối được aPix Builder. Hãy mở app aPix (desktop) hoặc chạy `npm run server`, hoặc đặt biến APIX_URL.");
  }

  async request(pathname, { method = "GET", body, timeoutMs = 60000 } = {}) {
    const base = await this.connect();
    const response = await fetch(`${base}${pathname}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!response.ok) throw new ApixError(data.error || `aPix ${method} ${pathname} → HTTP ${response.status}`);
    return data;
  }

  // ---- server / settings -------------------------------------------------

  async status() {
    const [settings, state, storage] = await Promise.all([
      this.request("/api/app-settings").catch(() => ({})),
      this.request("/api/run-state").catch(() => ({ runs: [] })),
      this.request("/api/storage-settings").catch(() => ({}))
    ]);
    const connection = (settings.settings || settings).connection || {};
    return {
      url: this.baseUrl,
      comfyAddress: maskAddress(connection.comfyAddress),
      savedServers: (connection.servers || []).map(server => ({ label: server.label, address: maskAddress(server.address) })),
      activeRuns: (state.runs || []).length,
      outputDir: storage.settings?.outputDir || "",
      inputDir: storage.settings?.inputDir || ""
    };
  }

  async comfyAddress(override) {
    if (override) {
      // Accept a saved server label ("Colab") as well as a URL.
      const settings = await this.request("/api/app-settings").catch(() => ({}));
      const servers = (settings.settings || settings).connection?.servers || [];
      const byLabel = servers.find(server => server.label?.toLowerCase() === String(override).toLowerCase());
      return byLabel ? byLabel.address : override;
    }
    const settings = await this.request("/api/app-settings");
    return (settings.settings || settings).connection?.comfyAddress || "";
  }

  async storagePaths() {
    if (!this.cachedStorage) {
      const storage = await this.request("/api/storage-settings").catch(() => ({}));
      this.cachedStorage = storage.settings || {};
    }
    return this.cachedStorage;
  }

  async outputDir() {
    return (await this.storagePaths()).outputDir || "";
  }

  async inputDir() {
    return (await this.storagePaths()).inputDir || "";
  }

  // ---- templates ---------------------------------------------------------

  async listTemplates() {
    const data = await this.request("/api/templates");
    return (data.templates || []).map(item => ({ id: item.id, name: item.name, isDefault: Boolean(item.isDefault) }));
  }

  async loadTemplate(templateId) {
    const data = await this.request(`/api/config?template=${encodeURIComponent(templateId)}`);
    if (!data.config) throw new ApixError(`Không tìm thấy template "${templateId}"`);
    return data;
  }

  async describeTemplate(templateId) {
    const { config, template } = await this.loadTemplate(templateId);
    return {
      id: template?.id || templateId,
      name: config.app?.name || template?.name || templateId,
      fields: describeFields(config.input || {}),
      outputs: Object.entries(config.output || {}).map(([key, item]) => ({ key, node: item?.id, label: item?.ui?.label || key }))
    };
  }

  // ---- input images ------------------------------------------------------

  async listInputImages(limit = 30) {
    const data = await this.request(`/api/input-images?limit=${Math.max(1, Math.min(200, limit))}`);
    return (data.images || []).map(image => ({ name: image.name, size: image.size, modifiedAt: image.modifiedAt || image.mtime }));
  }

  /** Local path, http(s) URL, data URL or the name of an image already in the input library. */
  async resolveImage(value) {
    if (value && typeof value === "object" && value.kind === "input-image" && value.name) return value;
    const text = String(value ?? "").trim();
    if (!text) return null;
    if (/^data:/i.test(text)) return text;
    if (/^https?:\/\//i.test(text)) {
      const data = await this.request("/api/input-images/from-url", { method: "POST", body: { url: text }, timeoutMs: 90000 });
      return { kind: "input-image", name: data.image.name };
    }
    const expanded = text.startsWith("~") ? path.join(os.homedir(), text.slice(1)) : text;
    if (path.isAbsolute(expanded) || existsSync(expanded)) {
      const filePath = path.resolve(expanded);
      if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new ApixError(`Không thấy file ảnh: ${filePath}`);
      // A file already in the aPix input folder is used as is, not uploaded again.
      const inputDir = await this.inputDir();
      if (inputDir && path.dirname(filePath) === path.resolve(inputDir)) return { kind: "input-image", name: path.basename(filePath) };
      const mime = IMAGE_MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      const dataUrl = `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
      const data = await this.request("/api/input-images", { method: "POST", body: { filename: path.basename(filePath), dataUrl }, timeoutMs: 120000 });
      return { kind: "input-image", name: data.image.name };
    }
    return { kind: "input-image", name: text };
  }

  async uploadImage(source) {
    const image = await this.resolveImage(source);
    return typeof image === "string" ? { kind: "data-url" } : image;
  }

  // ---- runs --------------------------------------------------------------

  async submitRun(templateId, values = {}, { count = 1, address } = {}) {
    const { config, template } = await this.loadTemplate(templateId);
    const target = await this.comfyAddress(address);
    const requestValues = await buildValues(config.input || {}, values, value => this.resolveImage(value));
    const jobs = [];
    const total = Math.max(1, Math.min(20, Number(count) || 1));
    for (let index = 0; index < total; index++) {
      const runId = randomUUID();
      jobs.push({
        endpoint: "/api/run",
        body: { runId, template: template?.id || templateId, address: target, values: requestValues, queuedAt: new Date().toISOString(), runKind: RUN_KIND },
        meta: { provider: "local", runKind: RUN_KIND }
      });
    }
    const data = await this.request("/api/run-queue/submit", { method: "POST", body: { jobs } });
    if (!data.acknowledged) throw new ApixError("aPix không nhận lệnh chạy");
    return { runIds: jobs.map(job => job.body.runId), address: maskAddress(target), values: summarizeValues(requestValues) };
  }

  async getRun(runId) {
    const [state, history] = await Promise.all([
      this.request("/api/run-state"),
      this.request("/api/output-history")
    ]);
    const live = (state.runs || []).find(run => run.runId === runId);
    const session = (state.sessions || []).find(item => item.runId === runId);
    const item = (history.history || []).find(entry => entry.id === runId);
    const status = item?.status === "success" || item?.outputs?.length
      ? "success"
      : live ? (live.status || "running") : session?.status || "unknown";
    return {
      runId,
      status,
      error: session?.error || item?.error || "",
      template: item?.templateName || session?.template || "",
      startedAt: session?.startedAt || item?.submittedAt || "",
      completedAt: item?.completedAt || session?.completedAt || "",
      durationMs: item?.durationMs ?? session?.durationMs ?? null,
      outputs: item ? await this.outputFiles(item) : []
    };
  }

  async waitForRuns(runIds, { timeoutMs = 15 * 60 * 1000, intervalMs = 2000, onUpdate } = {}) {
    const deadline = Date.now() + timeoutMs;
    const done = new Map();
    while (done.size < runIds.length) {
      for (const runId of runIds) {
        if (done.has(runId)) continue;
        const run = await this.getRun(runId);
        if (["success", "error", "cancelled", "failed"].includes(run.status)) {
          done.set(runId, run);
          onUpdate?.(run, done.size, runIds.length);
        }
      }
      if (done.size === runIds.length) break;
      if (Date.now() > deadline) {
        // Still running: report the current state so the caller can wait again.
        for (const runId of runIds) if (!done.has(runId)) done.set(runId, await this.getRun(runId));
        break;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return runIds.map(runId => done.get(runId));
  }

  async cancelRun(runId) {
    return this.request("/api/cancel", { method: "POST", body: { runId } });
  }

  async activeRuns() {
    const state = await this.request("/api/run-state");
    return (state.runs || []).map(run => ({ runId: run.runId, status: run.status || "running", template: run.template || run.templateId, provider: run.provider, startedAt: run.startedAt }));
  }

  async listHistory({ limit = 10, templateId = "" } = {}) {
    const data = await this.request("/api/output-history");
    const items = (data.history || []).filter(item => !templateId || item.templateId === templateId).slice(0, Math.max(1, Math.min(100, limit)));
    return Promise.all(items.map(async item => ({
      runId: item.id,
      template: item.templateName || item.templateId,
      status: item.status || (item.outputs?.length ? "success" : ""),
      createdAt: item.createdAt,
      durationMs: item.durationMs ?? null,
      outputs: await this.outputFiles(item)
    })));
  }

  async outputFiles(item) {
    const dir = await this.outputDir();
    return (item.outputs || []).map(output => ({
      filename: output.filename,
      path: dir && output.filename ? path.join(dir, output.filename) : "",
      url: output.url ? `${this.baseUrl}${output.url}` : ""
    }));
  }

  // ---- Google Colab (desktop app: drives the signed-in aPix Browser) -----

  async colab(action, body) {
    const route = `/api/colab/${action}`;
    return action === "status" || action === "session"
      ? this.request(route, { timeoutMs: 30000 })
      : this.request(route, { method: "POST", body: body || {}, timeoutMs: 90000 });
  }

  async deleteHistory(runId) {
    return this.request("/api/output-history/delete", { method: "POST", body: { id: runId } });
  }
}

// ---- template fields -------------------------------------------------------

function fieldInfo(key, item) {
  const ui = item?.ui || {};
  const info = { key, id: item?.id, type: ui.type || "text", label: ui.label || key };
  if (ui.value !== undefined) info.default = ui.value;
  if (ui.choices) info.choices = parseMenuChoices(ui.choices, menuChoiceOptions(ui)).map(choice => choice.label === choice.value ? choice.value : `${choice.label} (${choice.value})`);
  for (const prop of ["minimum", "maximum", "step"]) if (ui[prop] !== undefined) info[prop] = ui[prop];
  if (ui.inpaintCrop) info.inpaintCrop = true;
  if (ui.multiple || ui.multi) info.multiple = true;
  return info;
}

export function describeFields(input) {
  const fields = [];
  for (const [key, item] of Object.entries(input)) {
    const type = item?.ui?.type;
    if (type === "col") {
      for (const [childKey, child] of Object.entries(item.ui.col || {})) fields.push(fieldInfo(childKey, child));
      continue;
    }
    if (type === "menu-sub") {
      const info = fieldInfo(key, item);
      info.subFields = Object.fromEntries(Object.entries(item.ui.sub || {}).map(([choice, sub]) => [
        choice,
        Object.entries(sub || {}).map(([subKey, subItem]) => fieldInfo(subKey, subItem))
      ]));
      if (item.ui.workflows) info.workflowPerChoice = true;
      fields.push(info);
      continue;
    }
    fields.push(fieldInfo(key, item));
  }
  return fields;
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

// Sub-fields of a menu-sub can also be named "parent.child" (they may reuse the parent's name).
function takeValue(values, used, key, item, parentKey = "") {
  const candidates = [parentKey && `${parentKey}.${key}`, key, item?.id, item?.ui?.label].filter(Boolean).map(normalizeKey);
  for (const [name, value] of Object.entries(values)) {
    if (used.has(name)) continue;
    if (candidates.includes(normalizeKey(name))) {
      used.add(name);
      return { found: true, value };
    }
  }
  return { found: false };
}

async function coerce(item, raw, resolveImage) {
  const ui = item?.ui || {};
  const type = ui.type;
  if (MEDIA_TYPES.has(type)) {
    if (Array.isArray(raw)) return Promise.all(raw.map(resolveImage));
    return resolveImage(raw);
  }
  if (type === "seed") {
    if (raw === undefined || raw === null || /^(random|random_seed|ngẫu nhiên)$/i.test(String(raw))) return "random_seed";
    return Number(raw);
  }
  if (NUMBER_TYPES.has(type)) {
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new ApixError(`"${ui.label || item.id}" cần một số, nhận "${raw}"`);
    return number;
  }
  if (type === "menu") return resolveMenuStoredValue(String(raw), ui.choices || [], menuChoiceOptions(ui));
  if (type === "boolean" || type === "toggle" || type === "checkbox") return raw === true || /^(true|1|yes|on|có)$/i.test(String(raw));
  return raw;
}

async function assignField(request, values, used, key, item, resolveImage, parentKey = "") {
  if (!item?.id) return;
  const { found, value } = takeValue(values, used, key, item, parentKey);
  const ui = item.ui || {};
  if (!found) {
    if (ui.value === undefined || MEDIA_TYPES.has(ui.type)) return;
    request[Array.isArray(item.id) ? item.id[0] : item.id] = ui.type === "seed" ? await coerce(item, ui.value, resolveImage) : ui.value;
    return;
  }
  const coerced = await coerce(item, value, resolveImage);
  for (const id of Array.isArray(item.id) ? item.id : [item.id]) request[id] = coerced;
}

/** Map friendly values ({ image_swap: "~/a.jpg", menu: "+ Upscale" }) to the field-id keyed values /api/run expects. */
export async function buildValues(input, values = {}, resolveImage = async value => value) {
  const request = {};
  const used = new Set();
  for (const [key, item] of Object.entries(input)) {
    const type = item?.ui?.type;
    if (type === "col") {
      for (const [childKey, child] of Object.entries(item.ui.col || {})) await assignField(request, values, used, childKey, child, resolveImage);
      continue;
    }
    if (type === "menu-sub") {
      const options = menuChoiceOptions(item.ui);
      const choices = item.ui.choices || [];
      const picked = takeValue(values, used, key, item);
      const selected = resolveMenuStoredValue(picked.found ? String(picked.value) : item.ui.value ?? menuChoiceValue(choices[0], options), choices, options);
      if (!parseMenuChoices(choices, options).some(choice => choice.value === selected)) {
        throw new ApixError(`"${item.ui.label || key}" không có lựa chọn "${selected}". Có: ${choices.join(", ")}`);
      }
      request[`__menu__${key}`] = selected;
      if (item.id) request[item.id] = selected;
      const subs = lookupMenuSubFields(item.ui.sub || {}, selected, choices, options);
      for (const [subKey, subItem] of Object.entries(subs)) await assignField(request, values, used, subKey, subItem, resolveImage, key);
      continue;
    }
    await assignField(request, values, used, key, item, resolveImage);
  }
  const unknown = Object.keys(values).filter(name => !used.has(name));
  if (unknown.length) throw new ApixError(`Template không có trường: ${unknown.join(", ")}. Dùng get_template để xem danh sách trường.`);
  return request;
}

function summarizeValues(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => {
    if (typeof value === "string" && value.startsWith("data:")) return [key, "(ảnh)"];
    if (value?.kind === "input-image") return [key, value.name];
    if (Array.isArray(value)) return [key, value.map(entry => entry?.name || "(ảnh)")];
    return [key, value];
  }));
}
