import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
import { fetchWithRetry } from "./lib/fetchRetry.js";
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
  getWebappCallDemo,
  getWebappNodes,
  getWorkflowJson,
  parsePromptTips,
  prepareNodeInfoList,
  submitAiAppTask,
  submitWorkflowTask,
  waitForTaskOutputs,
  extractRhConsumeCoins,
  fetchFullAccountStatus,
  fetchAccountRemainCoins,
  resolveRhTaskCoins,
  inspectRhTask,
  submitRhTaskWhenReady,
  waitForRhApiKeyIdle
} from "./lib/runningHubClient.js";
import { withRhTokenFailover, resolveRhApiKeys, RH_TOKEN_POLICY } from "./lib/rhTokenFailover.js";
import { scanLocalImageFolder } from "./lib/localImageFolder.js";
import {
  createSignedRunningHubShortcut,
  resolveShortcutAssetsDir
} from "../electron/runninghub-shortcut.mjs";
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
const resourceRoot = path.resolve(process.env.APIX_RESOURCE_ROOT || root);
const dataRoot = path.resolve(process.env.APIX_DATA_ROOT || root);
const resourceConfigDir = path.join(resourceRoot, "config");
const defaultTemplateDir = path.join(resourceConfigDir, "default");
const defaultRhDir = path.join(resourceConfigDir, "default-rh");
const resourceRhDefaultAppsFilePath = path.join(defaultRhDir, "apps.json");
const storageSettingsPath = path.join(dataRoot, "storage-settings.json");
const sourceMode = resourceRoot === dataRoot;
const defaultUserDir = path.join(dataRoot, "user");
const defaultStorageSettings = {
  inputDir: path.join(defaultUserDir, "input"),
  outputDir: path.join(defaultUserDir, "output"),
  configDir: path.join(defaultUserDir, "config"),
  personalDataDir: defaultUserDir
};
let configDir;
let userTemplatesDir;
let templatesRhDir;
let inputDir;
let outputDir;
let outputHistoryPath;
let personalDataDir;
let rhSavedAppsFilePath;
let rhDefaultAppsFilePath;
let templates;
let appSettingsPath;
let canvasProjectPath;
let canvasProjectsPath;
let uploadDir;
let presetsDir;
let presetsFilePath;
let workflowPresetsFilePath;
const legacyRhAppsDir = path.join(dataRoot, "rh-apps");
const legacyRhSavedAppsFilePath = path.join(legacyRhAppsDir, "apps.json");
const legacyRhDefaultAppsFilePath = path.join(legacyRhAppsDir, "defaults.json");
const frontendDir = path.join(resourceRoot, "dist");
const shortcutAssetsDir = resolveShortcutAssetsDir(resourceRoot);
const RH_DEFAULT_WEBAPP_IDS = [
  "2039924771751731201",
  "2064284416448491522"
];
export const port = Number(process.env.PORT || 8787);
const comfyTimeoutMs = Number(process.env.COMFY_TIMEOUT_MS || 10 * 60 * 1000);
const maxImageBodyBytes = Number(process.env.MAX_IMAGE_BODY_BYTES || 512 * 1024 * 1024);
const maxOutputHistoryItems = 500;
const activeRuns = new Map();
const activeRhRuns = new Map();
const pendingSseClients = new Map();
const runningHubTimeoutMs = Number(process.env.RUNNINGHUB_TIMEOUT_MS || 10 * 60 * 1000);

function resolveStoragePath(value, fallback) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  const expanded = trimmed === "~"
    ? os.homedir()
    : trimmed.startsWith("~/")
      ? path.join(os.homedir(), trimmed.slice(2))
      : trimmed;
  return path.resolve(dataRoot, expanded);
}

function normalizeStorageSettings(settings = {}) {
  const requestedConfigDir = resolveStoragePath(settings.configDir, defaultStorageSettings.configDir);
  const configDirValue = path.resolve(requestedConfigDir) === path.resolve(resourceConfigDir)
    ? defaultStorageSettings.configDir
    : requestedConfigDir;
  return {
    inputDir: resolveStoragePath(settings.inputDir, defaultStorageSettings.inputDir),
    outputDir: resolveStoragePath(settings.outputDir, defaultStorageSettings.outputDir),
    configDir: configDirValue,
    personalDataDir: resolveStoragePath(settings.personalDataDir, defaultStorageSettings.personalDataDir)
  };
}

function buildResolvedPaths() {
  return {
    appSettings: appSettingsPath,
    colorPresets: presetsFilePath,
    workflowPresets: workflowPresetsFilePath,
    uploads: uploadDir
  };
}

async function migratePersonalDataFile(sourcePath, targetPath) {
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return;
  try {
    await access(targetPath);
    return;
  } catch {}
  try {
    await access(sourcePath);
  } catch {
    return;
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { errorOnExist: false });
}

async function migratePersonalDataDir(sourceDir, targetDir) {
  if (path.resolve(sourceDir) === path.resolve(targetDir)) return;
  try {
    await access(sourceDir);
  } catch {
    return;
  }
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    force: false,
    errorOnExist: false
  });
}

async function migrateLegacyUserFolders(normalized) {
  if (path.resolve(normalized.inputDir) === path.resolve(defaultStorageSettings.inputDir)) {
    await migratePersonalDataDir(path.join(dataRoot, "input"), normalized.inputDir);
  }
  if (path.resolve(normalized.outputDir) === path.resolve(defaultStorageSettings.outputDir)) {
    await migratePersonalDataDir(path.join(dataRoot, "output"), normalized.outputDir);
  }
  if (path.resolve(normalized.configDir) === path.resolve(defaultStorageSettings.configDir)) {
    await migratePersonalDataDir(path.join(dataRoot, "user-config"), normalized.configDir);
    if (!sourceMode) {
      await migratePersonalDataDir(path.join(dataRoot, "config"), normalized.configDir);
    }
  }
}

async function applyPersonalDataPaths(nextPersonalDataDir, previousPersonalDataDir) {
  personalDataDir = nextPersonalDataDir;
  appSettingsPath = path.join(personalDataDir, "app-settings.json");
  canvasProjectPath = path.join(personalDataDir, "canvas-project.json");
  canvasProjectsPath = path.join(personalDataDir, "canvas-projects.json");
  presetsDir = path.join(personalDataDir, "presets");
  presetsFilePath = path.join(presetsDir, "presets.json");
  workflowPresetsFilePath = path.join(presetsDir, "workflow-presets.json");
  uploadDir = path.join(personalDataDir, "uploads");

  await Promise.all([
    mkdir(personalDataDir, { recursive: true }),
    mkdir(presetsDir, { recursive: true }),
    mkdir(uploadDir, { recursive: true })
  ]);

  if (previousPersonalDataDir && path.resolve(previousPersonalDataDir) !== path.resolve(personalDataDir)) {
    await migratePersonalDataFile(path.join(previousPersonalDataDir, "app-settings.json"), appSettingsPath);
    await migratePersonalDataDir(path.join(previousPersonalDataDir, "presets"), presetsDir);
    await migratePersonalDataDir(path.join(previousPersonalDataDir, "uploads"), uploadDir);
  }

  if (path.resolve(personalDataDir) === path.resolve(defaultStorageSettings.personalDataDir)) {
    await migratePersonalDataFile(path.join(dataRoot, "app-settings.json"), appSettingsPath);
    await migratePersonalDataDir(path.join(dataRoot, "presets"), presetsDir);
    await migratePersonalDataDir(path.join(dataRoot, "uploads"), uploadDir);
  }
}

async function migrateLegacyUserConfig(targetTemplatesDir, targetTemplatesRhDir) {
  if (!sourceMode) return;
  const legacyTemplatesDir = path.join(resourceConfigDir, "templates");
  const legacyTemplatesRhDir = path.join(resourceConfigDir, "templates-rh");
  await Promise.all([
    cp(legacyTemplatesDir, targetTemplatesDir, {
      recursive: true,
      force: false,
      errorOnExist: false
    }).catch(error => {
      if (error?.code !== "ENOENT") throw error;
    }),
    cp(legacyTemplatesRhDir, targetTemplatesRhDir, {
      recursive: true,
      force: false,
      errorOnExist: false
    }).catch(error => {
      if (error?.code !== "ENOENT") throw error;
    })
  ]);
}

async function applyStorageSettings(settings) {
  const normalized = normalizeStorageSettings(settings);
  const previousPersonalDataDir = personalDataDir;
  await Promise.all([
    mkdir(normalized.inputDir, { recursive: true }),
    mkdir(normalized.outputDir, { recursive: true }),
    mkdir(normalized.configDir, { recursive: true })
  ]);

  const nextUserTemplatesDir = path.join(normalized.configDir, "templates");
  const nextTemplatesRhDir = path.join(normalized.configDir, "templates-rh");
  await Promise.all([
    mkdir(nextUserTemplatesDir, { recursive: true }),
    mkdir(nextTemplatesRhDir, { recursive: true })
  ]);
  if (path.resolve(normalized.configDir) === path.resolve(defaultStorageSettings.configDir)) {
    await migrateLegacyUserFolders(normalized);
    await migrateLegacyUserConfig(nextUserTemplatesDir, nextTemplatesRhDir);
  }

  inputDir = normalized.inputDir;
  outputDir = normalized.outputDir;
  outputHistoryPath = path.join(outputDir, "history.json");
  configDir = normalized.configDir;
  userTemplatesDir = nextUserTemplatesDir;
  templatesRhDir = nextTemplatesRhDir;
  rhSavedAppsFilePath = path.join(templatesRhDir, "apps.json");
  rhDefaultAppsFilePath = path.join(configDir, "runninghub-default-apps.json");
  await applyPersonalDataPaths(normalized.personalDataDir, previousPersonalDataDir);
  templates = createTemplateService({
    configDir,
    defaultDir: defaultTemplateDir,
    templatesDir: userTemplatesDir,
    defaultRhDir,
    templatesRhDir
  });
  return normalized;
}

async function loadStorageSettings() {
  try {
    const raw = await readFile(storageSettingsPath, "utf8");
    return normalizeStorageSettings(JSON.parse(raw));
  } catch {
    return normalizeStorageSettings();
  }
}

async function writeStorageSettings(settings) {
  await mkdir(dataRoot, { recursive: true });
  await writeFile(storageSettingsPath, JSON.stringify(settings, null, 2), "utf8");
}

function normalizeAppSettings(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function readAppSettings() {
  try {
    return normalizeAppSettings(JSON.parse(await readFile(appSettingsPath, "utf8")));
  } catch {
    return {};
  }
}

async function writeAppSettings(settings) {
  const normalized = normalizeAppSettings(settings);
  delete normalized.canvas;
  await mkdir(dataRoot, { recursive: true });
  await writeFile(appSettingsPath, JSON.stringify(normalized, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
  await chmod(appSettingsPath, 0o600);
  return normalized;
}

async function handleAppSettings(req, res) {
  if (req.method === "GET") {
    send(res, 200, { settings: await readAppSettings() });
    return;
  }
  const body = JSON.parse(await readBody(req) || "{}");
  const settings = await writeAppSettings(body.settings);
  send(res, 200, { success: true, settings });
}

async function readCanvasProjectsStore() {
  try {
    const parsed = JSON.parse(await readFile(canvasProjectsPath, "utf8"));
    const store = normalizeCanvasProjectsStore(parsed);
    if (!Object.keys(store.projects).length) throw new Error("empty store");
    return store;
  } catch {
    let legacy = { nodes: [], edges: [] };
    try {
      legacy = JSON.parse(await readFile(canvasProjectPath, "utf8"));
    } catch {}
    const store = {
      activeId: "p_default",
      projects: {
        p_default: {
          id: "p_default",
          name: "Project 1",
          updatedAt: new Date().toISOString(),
          nodes: Array.isArray(legacy?.nodes) ? legacy.nodes : [],
          edges: Array.isArray(legacy?.edges) ? legacy.edges : []
        }
      }
    };
    await writeCanvasProjectsStore(store);
    return store;
  }
}

function normalizeCanvasProjectsStore(raw = {}) {
  const projects = raw.projects && typeof raw.projects === "object" ? raw.projects : {};
  const activeId = raw.activeId && projects[raw.activeId]
    ? raw.activeId
    : Object.keys(projects)[0] || "p_default";
  return { activeId, projects };
}

function summarizeCanvasProjects(store) {
  return Object.values(store.projects || {})
    .map(project => ({
      id: project.id,
      name: project.name || project.id,
      updatedAt: project.updatedAt || null,
      nodeCount: Array.isArray(project.nodes) ? project.nodes.length : 0,
      edgeCount: Array.isArray(project.edges) ? project.edges.length : 0
    }))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function writeCanvasProjectsStore(store) {
  const payload = normalizeCanvasProjectsStore(store);
  await mkdir(personalDataDir, { recursive: true });
  await writeFile(canvasProjectsPath, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
  await chmod(canvasProjectsPath, 0o600);
  return payload;
}

async function handleCanvasProject(req, res, url) {
  const pathname = url?.pathname || "/api/canvas-project";

  if (pathname === "/api/canvas-project") {
    if (req.method === "GET") {
      const store = await readCanvasProjectsStore();
      const active = store.projects[store.activeId] || { nodes: [], edges: [], name: "Project" };
      send(res, 200, {
        activeId: store.activeId,
        name: active.name || "Project",
        nodes: Array.isArray(active.nodes) ? active.nodes : [],
        edges: Array.isArray(active.edges) ? active.edges : [],
        projects: summarizeCanvasProjects(store)
      });
      return;
    }
    if (req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const store = await readCanvasProjectsStore();
      const active = store.projects[store.activeId];
      if (!active) {
        send(res, 404, { error: "Không tìm thấy project đang mở" });
        return;
      }
      active.nodes = Array.isArray(body.nodes) ? body.nodes : [];
      active.edges = Array.isArray(body.edges) ? body.edges : [];
      active.updatedAt = new Date().toISOString();
      await writeCanvasProjectsStore(store);
      send(res, 200, {
        success: true,
        activeId: store.activeId,
        projects: summarizeCanvasProjects(store)
      });
      return;
    }
    send(res, 405, { error: "Method not allowed" });
    return;
  }

  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = JSON.parse(await readBody(req) || "{}");
  const store = await readCanvasProjectsStore();

  if (pathname === "/api/canvas-project/switch") {
    const id = String(body.id || "").trim();
    if (!id || !store.projects[id]) {
      send(res, 404, { error: "Không tìm thấy project" });
      return;
    }
    store.activeId = id;
    await writeCanvasProjectsStore(store);
    const active = store.projects[id];
    send(res, 200, {
      success: true,
      activeId: id,
      name: active.name,
      nodes: active.nodes || [],
      edges: active.edges || [],
      projects: summarizeCanvasProjects(store)
    });
    return;
  }

  if (pathname === "/api/canvas-project/create") {
    const name = String(body.name || "Project mới").trim() || "Project mới";
    const id = `p_${randomUUID().slice(0, 8)}`;
    store.projects[id] = {
      id,
      name,
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: []
    };
    store.activeId = id;
    await writeCanvasProjectsStore(store);
    send(res, 200, {
      success: true,
      activeId: id,
      name,
      nodes: [],
      edges: [],
      projects: summarizeCanvasProjects(store)
    });
    return;
  }

  if (pathname === "/api/canvas-project/rename") {
    const id = String(body.id || store.activeId).trim();
    const name = String(body.name || "").trim();
    const project = store.projects[id];
    if (!project || !name) {
      send(res, 400, { error: "Thiếu tên project" });
      return;
    }
    project.name = name;
    project.updatedAt = new Date().toISOString();
    await writeCanvasProjectsStore(store);
    send(res, 200, { success: true, projects: summarizeCanvasProjects(store) });
    return;
  }

  if (pathname === "/api/canvas-project/delete") {
    const id = String(body.id || "").trim();
    if (!id || !store.projects[id]) {
      send(res, 404, { error: "Không tìm thấy project" });
      return;
    }
    if (Object.keys(store.projects).length <= 1) {
      send(res, 400, { error: "Không thể xóa project cuối cùng" });
      return;
    }
    delete store.projects[id];
    if (store.activeId === id) {
      store.activeId = Object.keys(store.projects)[0];
    }
    await writeCanvasProjectsStore(store);
    const active = store.projects[store.activeId];
    send(res, 200, {
      success: true,
      activeId: store.activeId,
      name: active?.name,
      nodes: active?.nodes || [],
      edges: active?.edges || [],
      projects: summarizeCanvasProjects(store)
    });
    return;
  }

  send(res, 404, { error: "Not found" });
}

async function handleStorageSettings(req, res) {
  if (req.method === "GET") {
    send(res, 200, {
      settings: normalizeStorageSettings({ inputDir, outputDir, configDir, personalDataDir }),
      defaults: defaultStorageSettings,
      bundledConfigDir: resourceConfigDir,
      resolvedPaths: buildResolvedPaths()
    });
    return;
  }
  if (activeRuns.size || activeRhRuns.size) {
    send(res, 409, { error: "Không thể đổi thư mục khi workflow đang chạy" });
    return;
  }
  const body = JSON.parse(await readBody(req) || "{}");
  const settings = await applyStorageSettings(body.settings || body);
  await writeStorageSettings(settings);
  send(res, 200, {
    success: true,
    settings,
    defaults: defaultStorageSettings,
    bundledConfigDir: resourceConfigDir,
    resolvedPaths: buildResolvedPaths()
  });
}

async function openDirectory(directoryPath) {
  const resolvedPath = resolveStoragePath(directoryPath, "");
  if (!resolvedPath) throw new Error("Đường dẫn thư mục không hợp lệ");
  let directoryStat;
  try {
    directoryStat = await stat(resolvedPath);
  } catch {
    throw new Error("Thư mục không tồn tại");
  }
  if (!directoryStat.isDirectory()) throw new Error("Đường dẫn không phải là thư mục");

  const command = process.platform === "win32"
    ? "explorer.exe"
    : process.platform === "darwin"
      ? "open"
      : "xdg-open";
  await new Promise((resolve, reject) => {
    const child = spawn(command, [resolvedPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  return resolvedPath;
}

async function handleOpenDirectory(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  try {
    const openedPath = await openDirectory(body.path);
    send(res, 200, { success: true, path: openedPath });
  } catch (error) {
    send(res, 400, { error: error?.message || "Không thể mở thư mục" });
  }
}

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
await applyStorageSettings(await loadStorageSettings());

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

function normalizeRhSavedApps(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .map(entry => {
      const id = String(entry?.id || "").trim();
      if (!id) return null;
      const name = String(entry?.name || "").trim() || id;
      return { id, name };
    })
    .filter(entry => {
      if (!entry || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
}

async function migrateRhAppsFile(legacyPath, targetPath) {
  try {
    await access(targetPath);
    return;
  } catch {}
  try {
    const raw = await readFile(legacyPath, "utf8");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, raw, "utf8");
  } catch {}
}

async function readRhSavedApps() {
  try {
    await migrateRhAppsFile(legacyRhSavedAppsFilePath, rhSavedAppsFilePath);
    await mkdir(templatesRhDir, { recursive: true });
    const raw = await readFile(rhSavedAppsFilePath, "utf8");
    return normalizeRhSavedApps(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeRhSavedApps(apps) {
  const normalized = normalizeRhSavedApps(apps);
  await mkdir(templatesRhDir, { recursive: true });
  await writeFile(rhSavedAppsFilePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function buildRhDefaultApps(entries = []) {
  const normalized = normalizeRhSavedApps(entries);
  const byId = new Map(normalized.map(app => [app.id, app]));
  const canonical = {
    "2039924771751731201": "SDVN Klein Upscale",
    "2064284416448491522": "SDVN Make Cosplay"
  };
  const built = RH_DEFAULT_WEBAPP_IDS.map(id => {
    const fromFile = byId.get(id);
    const name = String(fromFile?.name || canonical[id] || id).trim() || id;
    return { id, name };
  });
  const nameCounts = new Map();
  for (const app of built) {
    nameCounts.set(app.name, (nameCounts.get(app.name) || 0) + 1);
  }
  return built.map(app => {
    if ((nameCounts.get(app.name) || 0) <= 1) return app;
    return { id: app.id, name: canonical[app.id] || `${app.name} · ${app.id.slice(-6)}` };
  });
}

async function readRhDefaultApps() {
  try {
    await migrateRhAppsFile(legacyRhDefaultAppsFilePath, rhDefaultAppsFilePath);
    let raw;
    try {
      raw = await readFile(rhDefaultAppsFilePath, "utf8");
    } catch {
      raw = await readFile(resourceRhDefaultAppsFilePath, "utf8");
    }
    return buildRhDefaultApps(JSON.parse(raw));
  } catch {
    return buildRhDefaultApps();
  }
}

async function writeRhDefaultApps(apps) {
  const normalized = buildRhDefaultApps(apps);
  await mkdir(configDir, { recursive: true });
  await writeFile(rhDefaultAppsFilePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

async function refreshRhDefaultApps(apiKey) {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    throw new Error("Missing RunningHub API key");
  }
  const current = buildRhDefaultApps(await readRhDefaultApps());
  const byId = new Map(current.map(app => [app.id, app]));
  for (const id of RH_DEFAULT_WEBAPP_IDS) {
    try {
      const demo = await getWebappCallDemo(trimmedKey, id);
      const name = String(demo.webappName || "").trim();
      if (name) {
        byId.set(id, { id, name });
      }
    } catch (error) {
      console.warn(`Failed to refresh RunningHub default app ${id}:`, error.message || error);
    }
  }
  return writeRhDefaultApps(RH_DEFAULT_WEBAPP_IDS.map(id => byId.get(id)));
}

async function handleRhDefaultApps(req, res) {
  send(res, 200, { apps: await readRhDefaultApps() });
}

async function handleRhDefaultAppsRefresh(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const apps = await refreshRhDefaultApps(body.apiKey);
    send(res, 200, { success: true, apps });
  } catch (error) {
    send(res, 400, { error: error.message || "Không cập nhật được app mặc định RunningHub" });
  }
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
      responseRequest[id] = value?.kind === "upload" || value?.kind === "input-image" || value?.kind === "local-file"
        ? patchedValue
        : value;
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
      submittedAt,
      signal: abortController.signal,
      onDownloadRetry: ({ label, attempt }) => {
        broadcastRunEvent(run, {
          type: "output_download_retry",
          data: { label, attempt }
        });
      }
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

async function handleInputScanFolder(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const folderPath = String(body.folderPath || "").trim();
  const includeFiles = body.includeFiles !== false;
  if (!folderPath) {
    send(res, 400, { error: "Thiếu đường dẫn thư mục" });
    return;
  }
  try {
    const result = await scanLocalImageFolder(folderPath, { includeFiles });
    if (!result.imageCount) {
      send(res, 400, { error: "Thư mục không có ảnh hợp lệ" });
      return;
    }
    send(res, 200, result);
  } catch (error) {
    send(res, 400, { error: error.message || "Không quét được thư mục ảnh" });
  }
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

function imageContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

async function serveLocalImageFile(req, res, filePath, filename) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not a file");
  } catch {
    send(res, 404, { error: "Image not found" });
    return;
  }
  res.writeHead(200, {
    "content-type": imageContentType(filename),
    "cache-control": "no-store",
    "content-length": fileStat.size
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(await readFile(filePath));
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
  await serveLocalImageFile(req, res, filePath, filename);
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

async function archiveOutputRun({
  runId,
  promptId,
  template,
  address,
  target,
  config,
  history,
  values,
  submittedAt,
  signal,
  onDownloadRetry
}) {
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
      try {
        const response = await fetchWithRetry(`${target.httpBase}/view?${query.toString()}`, {
          headers: target.headers,
          signal,
          onRetry: ({ attempt, waitMs }) => {
            onDownloadRetry?.({
              attempt,
              waitMs,
              filename: image.filename,
              label: `Đang thử tải lại ảnh kết quả (${attempt})...`
            });
          }
        });
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
      } catch {
        // Try remaining outputs; fail only if nothing could be archived.
      }
    }
  }

  if (!archivedOutputs.length) {
    throw new Error("ComfyUI hoàn tất nhưng không tải được ảnh kết quả sau nhiều lần thử");
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
  await serveLocalImageFile(req, res, filePath, filename);
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

async function replaceOutputInHistory(body, parsed, res) {
  const historyId = body.historyId;
  const outputFilename = body.outputFilename ? safeOutputName(body.outputFilename) : "";
  const outputIndex = Number.isFinite(body.outputIndex) ? body.outputIndex : 0;
  if (!historyId && !outputFilename) {
    send(res, 400, { error: "Missing history id" });
    return;
  }

  const current = await readOutputHistory();
  let itemIndex = historyId ? current.findIndex(item => item.id === historyId) : -1;
  let resolvedOutputIndex = outputIndex;

  if (itemIndex === -1 && outputFilename) {
    itemIndex = current.findIndex(item => {
      const outputs = item.outputs || item.result?.outputs || [];
      const matchIndex = outputs.findIndex(output => safeOutputName(output.filename) === outputFilename);
      if (matchIndex !== -1) {
        resolvedOutputIndex = matchIndex;
        return true;
      }
      return false;
    });
  }

  if (itemIndex === -1) {
    send(res, 404, { error: "History item not found" });
    return;
  }

  const item = current[itemIndex];
  const outputs = [...(item.outputs || item.result?.outputs || [])];
  const targetOutput = outputs[resolvedOutputIndex];
  if (!targetOutput?.filename) {
    send(res, 404, { error: "Output not found" });
    return;
  }

  const filename = safeOutputName(targetOutput.filename);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, filename), parsed.buffer);

  const updatedOutput = {
    ...targetOutput,
    url: `${outputImageUrl(filename)}&v=${Date.now()}`
  };
  outputs[resolvedOutputIndex] = updatedOutput;

  const updatedItem = {
    ...item,
    outputs,
    result: item.result ? { ...item.result, outputs } : item.result
  };

  const history = [...current];
  history[itemIndex] = updatedItem;
  await writeOutputHistory(history);
  send(res, 200, { historyItem: updatedItem, history: history.slice(0, maxOutputHistoryItems) });
}

async function handleSaveEditedOutput(req, res) {
  const body = JSON.parse(await readBody(req, maxImageBodyBytes) || "{}");
  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) {
    send(res, 400, { error: "Invalid image data" });
    return;
  }

  if (body.replace) {
    await replaceOutputInHistory(body, parsed, res);
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

async function handleReplaceOutputImage(req, res) {
  const body = JSON.parse(await readBody(req, maxImageBodyBytes) || "{}");
  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) {
    send(res, 400, { error: "Invalid image data" });
    return;
  }
  await replaceOutputInHistory(body, parsed, res);
}

function normalizeStoredColorAdjust(value) {
  if (!value || typeof value !== "object") return null;
  const adjustments = value.adjustments && typeof value.adjustments === "object"
    ? trimHistoryValue(value.adjustments)
    : null;
  const healingStrokes = Array.isArray(value.healingStrokes)
    ? trimHistoryValue(value.healingStrokes)
    : [];
  const healingBrushSize = Number.isFinite(value.healingBrushSize) ? value.healingBrushSize : undefined;
  return {
    ...(adjustments ? { adjustments } : {}),
    healingStrokes,
    ...(healingBrushSize !== undefined ? { healingBrushSize } : {}),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
  };
}

async function resolveHistoryOutputTarget(current, body) {
  const historyId = body.historyId;
  const outputFilename = body.outputFilename ? safeOutputName(body.outputFilename) : "";
  const outputIndex = Number.isFinite(body.outputIndex) ? body.outputIndex : 0;
  let itemIndex = historyId ? current.findIndex(item => item.id === historyId) : -1;
  let resolvedOutputIndex = outputIndex;

  if (itemIndex === -1 && outputFilename) {
    itemIndex = current.findIndex(item => {
      const outputs = item.outputs || item.result?.outputs || [];
      const matchIndex = outputs.findIndex(output => safeOutputName(output.filename) === outputFilename);
      if (matchIndex !== -1) {
        resolvedOutputIndex = matchIndex;
        return true;
      }
      return false;
    });
  }

  if (itemIndex === -1) return null;
  const item = current[itemIndex];
  const outputs = [...(item.outputs || item.result?.outputs || [])];
  const targetOutput = outputs[resolvedOutputIndex];
  if (!targetOutput) return null;

  return { itemIndex, item, outputs, resolvedOutputIndex, targetOutput };
}

async function handleSaveColorAdjust(req, res) {
  const body = JSON.parse(await readBody(req, maxImageBodyBytes) || "{}");
  const colorAdjust = normalizeStoredColorAdjust(body.colorAdjust);
  if (!colorAdjust) {
    send(res, 400, { error: "Invalid color adjust data" });
    return;
  }

  const current = await readOutputHistory();
  const target = await resolveHistoryOutputTarget(current, body);
  if (!target) {
    send(res, 404, { error: "History item not found" });
    return;
  }

  const { itemIndex, item, outputs, resolvedOutputIndex } = target;
  outputs[resolvedOutputIndex] = {
    ...outputs[resolvedOutputIndex],
    colorAdjust
  };

  const updatedItem = {
    ...item,
    outputs,
    result: item.result ? { ...item.result, outputs } : item.result
  };

  const history = [...current];
  history[itemIndex] = updatedItem;
  await writeOutputHistory(history);
  send(res, 200, {
    historyItem: updatedItem,
    history: history.slice(0, maxOutputHistoryItems)
  });
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
    workflowId: String(rh.workflowId || "").trim()
  };
  if (rh.saveWorkflowJson === true) next.saveWorkflowJson = true;
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
  const saveWorkflowJson = isRhWf ? config?.runninghub?.saveWorkflowJson === true : true;
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
  const webapp = await getWebappCallDemo(apiKey, webappId);
  send(res, 200, {
    nodes: webapp.nodeInfoList,
    webappId,
    webappName: webapp.webappName,
    accessEncrypted: webapp.accessEncrypted,
    statisticsInfo: webapp.statisticsInfo,
    covers: webapp.covers,
    tags: webapp.tags
  });
}

async function handleRunningHubAccountStatus(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const apiKey = String(body.apiKey || "").trim();
  if (!apiKey) {
    send(res, 400, { error: "Missing RunningHub API key" });
    return;
  }

  const data = await fetchFullAccountStatus(apiKey);
  send(res, 200, {
    account: {
      keyStatus: "valid",
      apiType: data.apiType ?? null,
      remainCoins: data.remainCoins ?? null,
      remainMoney: data.remainMoney ?? null,
      currency: data.currency ?? null,
      currentTaskCounts: data.currentTaskCounts ?? null,
      refreshedAt: new Date().toISOString()
    }
  });
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
  submittedAt,
  signal,
  onDownloadRetry
}) {
  await mkdir(outputDir, { recursive: true });
  const completedAt = new Date().toISOString();
  const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(submittedAt || completedAt).getTime());
  const archivedOutputs = [];
  let index = 0;

  for (const output of outputs) {
    const fileUrl = output.fileUrl || output.url;
    if (!fileUrl) continue;
    try {
      const response = await fetchWithRetry(fileUrl, {
        signal,
        onRetry: ({ attempt, waitMs }) => {
          onDownloadRetry?.({
            attempt,
            waitMs,
            fileUrl,
            label: `Đang thử tải lại ảnh kết quả RunningHub (${attempt})...`
          });
        }
      });
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
    } catch {
      // Try remaining outputs; fail only if nothing could be archived.
    }
  }

  if (!archivedOutputs.length) {
    throw new Error("RunningHub hoàn tất nhưng không tải được file kết quả sau nhiều lần thử");
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
  const apiKeys = resolveRhApiKeys(body);
  const tokenPolicy = body.tokenPolicy === RH_TOKEN_POLICY.ROTATE
    ? RH_TOKEN_POLICY.ROTATE
    : RH_TOKEN_POLICY.PRIORITY;
  const rotateIndex = Number(body.rotateIndex) || 0;
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
  const onTokenSwitch = ({ label, reason }) => {
    const status = reason === "resource_access" ? "warning" : "waiting";
    emitRhStatus(status, label || "Đang chuyển sang token RunningHub kế tiếp...");
  };
  const onResourceAccessExhausted = ({ label, status }) => {
    emitRhStatus(status || "warning", label);
  };

  try {
    if (!apiKeys.length) throw new Error("Missing RunningHub API key");
    if (!webappId) throw new Error("Missing RunningHub webappId");
    if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
      throw new Error("Missing RunningHub node list");
    }

    await withRhTokenFailover({
      apiKeys,
      tokenPolicy,
      rotateIndex,
      resourceKind: "app",
      runId,
      signal: abortController.signal,
      onWait: onTokenWait,
      onSwitch: onTokenSwitch,
      onExhausted: onResourceAccessExhausted
    }, async (apiKey) => {
      await waitForRhApiKeyIdle(apiKey, {
        signal: abortController.signal,
        onWait: onTokenWait
      });

      const coinsBefore = await fetchAccountRemainCoins(apiKey, abortController.signal);
      emitRhStatus("upload", "Đang upload dữ liệu lên RunningHub...");
      const nodeInfoList = await prepareNodeInfoList(apiKey, body.nodes, {
        inputDir,
        outputDir,
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
        submittedAt,
        signal: abortController.signal,
        onDownloadRetry: ({ label, attempt }) => {
          emitRhStatus("download", label, taskId);
          broadcastRunEvent(run, {
            type: "output_download_retry",
            data: { label, attempt, taskId: String(taskId) }
          });
        }
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
    });
  } finally {
    closeRhRun(run, runId);
  }
}

async function handleRunningHubWfRun(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const runId = body.runId || randomUUID();
  const submittedAt = new Date().toISOString();
  const apiKeys = resolveRhApiKeys(body);
  const tokenPolicy = body.tokenPolicy === RH_TOKEN_POLICY.ROTATE
    ? RH_TOKEN_POLICY.ROTATE
    : RH_TOKEN_POLICY.PRIORITY;
  const rotateIndex = Number(body.rotateIndex) || 0;
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
  const onTokenSwitch = ({ label, reason }) => {
    const status = reason === "resource_access" ? "warning" : "waiting";
    emitRhStatus(status, label || "Đang chuyển sang token RunningHub kế tiếp...");
  };
  const onResourceAccessExhausted = ({ label, status }) => {
    emitRhStatus(status || "warning", label);
  };

  try {
    if (!apiKeys.length) throw new Error("Missing RunningHub API key");
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

    await withRhTokenFailover({
      apiKeys,
      tokenPolicy,
      rotateIndex,
      resourceKind: "workflow",
      runId,
      signal: abortController.signal,
      onWait: onTokenWait,
      onSwitch: onTokenSwitch,
      onExhausted: onResourceAccessExhausted
    }, async (apiKey) => {
      await waitForRhApiKeyIdle(apiKey, {
        signal: abortController.signal,
        onWait: onTokenWait
      });

      const coinsBefore = await fetchAccountRemainCoins(apiKey, abortController.signal);
      emitRhStatus("upload", "Đang chuẩn bị dữ liệu workflow...");
      const emitPrepareProgress = ({ type, status, label } = {}) => {
        if (!label) return;
        emitRhStatus(type || status || "upload", label);
      };
      const mappedFieldCount = Object.keys(request).length;
      let submitData;
      if (useSavedWorkflowJson) {
        if (!template.workflowPath) {
          throw new Error("Template bật lưu JSON nhưng thiếu file api.json");
        }
        emitRhStatus("upload", `Đang đọc api.json và patch ${mappedFieldCount} input...`);
        const workflow = structuredClone(JSON.parse(await readFile(template.workflowPath, "utf8")));
        const patchedWorkflow = await buildPatchedRunningHubWorkflow(workflow, request, apiKey, {
          inputDir,
          outputDir,
          signal: abortController.signal,
          onProgress: emitPrepareProgress
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
        emitRhStatus("upload", `Đang chuẩn bị ${mappedFieldCount} input cho workflow...`);
        const nodeInfoList = await buildRunningHubNodeInfoList(request, apiKey, {
          inputDir,
          outputDir,
          signal: abortController.signal,
          onProgress: emitPrepareProgress
        });
        emitRhStatus("submit", `Đang gửi workflow lên RunningHub (${nodeInfoList.length} field)...`);
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
        submittedAt,
        signal: abortController.signal,
        onDownloadRetry: ({ label, attempt }) => {
          emitRhStatus("download", label, taskId);
          broadcastRunEvent(run, {
            type: "output_download_retry",
            data: { label, attempt, taskId: String(taskId) }
          });
        }
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

function shortcutDownloadName(value) {
  const base = String(value || "RunningHub Shortcut")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "RunningHub-Shortcut"}.shortcut`;
}

async function handleRunningHubShortcutExport(req, res) {
  if (process.platform !== "darwin") {
    send(res, 400, { error: "Export Shortcut requires macOS." });
    return;
  }
  const body = JSON.parse(await readBody(req) || "{}");
  const config = body.config;
  const apiKey = String(body.apiKey || "").trim();
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    send(res, 400, { error: "Missing RunningHub configuration." });
    return;
  }
  if (!apiKey) {
    send(res, 400, { error: "Missing RunningHub API key." });
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "apix-shortcut-download-"));
  const outputPath = path.join(tempDir, shortcutDownloadName(body.name));
  try {
    const result = await createSignedRunningHubShortcut({
      config,
      apiKey,
      outputPath,
      assetsDir: shortcutAssetsDir,
      kind: body.kind,
      resourceId: body.resourceId
    });
    const data = await readFile(outputPath);
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${path.basename(outputPath)}"`,
      "content-length": data.length,
      "x-runninghub-shortcut-kind": result.kind,
      "x-runninghub-resource-id": result.resourceId,
      "x-runninghub-mapping": encodeURIComponent(result.mapping.join(","))
    });
    res.end(data);
  } catch (error) {
    send(res, 400, { error: error.message || "Could not export Shortcut." });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function cleanupUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
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

const staticContentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export async function serveFrontend(req, res, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const resolvedPath = path.resolve(frontendDir, requestedPath);
  const relativePath = path.relative(frontendDir, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return false;

  let filePath = resolvedPath;
  try {
    if (!(await stat(filePath)).isFile()) return false;
  } catch {
    if (path.extname(requestedPath)) return false;
    filePath = path.join(frontendDir, "index.html");
  }

  const data = await readFile(filePath);
  res.writeHead(200, {
    "content-type": staticContentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
  });
  if (req.method === "HEAD") res.end();
  else res.end(data);
  return true;
}

export async function initializeServerRuntime() {
  await initRunLogStore();
}

export const routeContext = {
  TEMPLATE_SCOPES,
  appendRunLog,
  assertTemplateWorkflow,
  cancelQueueItems,
  clearRunLogSessions,
  deleteRunLogSession,
  endRunLogSession,
  handleAppSettings,
  handleCanvasProject,
  handleCancel,
  handleComfyDiscovery,
  handleComfyHealth,
  handleComfyModels,
  handleComfyView,
  handleDeleteInputImage,
  handleDeleteOutputHistory,
  handleInputFromUrl,
  handleInputImage,
  handleInputScanFolder,
  handleInputUpload,
  handleOpenDirectory,
  handleOutputImage,
  handleReplaceOutputImage,
  handleRhDefaultApps,
  handleRhDefaultAppsRefresh,
  handleRun,
  handleRunEvents,
  handleRunLogMutate,
  handleRunLogSessions,
  handleRunningHubAccountStatus,
  handleRunningHubCancel,
  handleRunningHubNodes,
  handleRunningHubRun,
  handleRunningHubTaskCheck,
  handleRunningHubShortcutExport,
  handleRunningHubWfRun,
  handleRunningHubWfWorkflowJson,
  handleSaveColorAdjust,
  handleSaveEditedOutput,
  handleStorageSettings,
  handleTemplateDelete,
  handleTemplateEditor,
  handleTemplateSave,
  listInputImages,
  normalizeComfyTarget,
  readBody,
  readCustomPresets,
  readOutputHistory,
  readRhSavedApps,
  readWorkflowPresets,
  send,
  startRunLogSession,
  templateScopeFromUrl,
  templates: () => templates,
  updateRunLogSession,
  writeCustomPresets,
  writeRhSavedApps,
  writeWorkflowPresets
};
