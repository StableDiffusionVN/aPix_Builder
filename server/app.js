import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { readBody, send } from "./lib/http.js";
import { TEMPLATE_SCOPES } from "./lib/templateService.js";
import { validateWorkflowMappings } from "./lib/workflowPatcher.js";
import {
  appendRunLog,
  appendRunLogs,
  clearRunLogSessions,
  deleteRunLogSession,
  endRunLogSession,
  getRunLogSessions,
  initRunLogStore,
  startRunLogSession,
  updateRunLogSession
} from "./lib/runLogStore.js";
import { createStorageService } from "./services/storageService.js";
import { createComfyService } from "./services/comfyService.js";
import { createRunningHubService } from "./services/runningHubService.js";
import { createShortcutService } from "./services/shortcutService.js";
import { backendQueueHasRunId, createBackendRunQueueStore } from "./lib/backendRunQueueStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const resourceRoot = path.resolve(process.env.APIX_RESOURCE_ROOT || root);
const dataRoot = path.resolve(process.env.APIX_DATA_ROOT || root);
const frontendDir = path.join(resourceRoot, "dist");

export const port = Number(process.env.PORT || 8787);

const activeRuns = new Map();
const activeRhRuns = new Map();
const backendRunQueue = [];
let backendRunQueueActive = false;
let backendRunQueueCurrent = null;
let backendRunQueueWakeTimer = null;
let backendRunQueueStore = null;
const pendingSseClients = new Map();

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

const QUEUE_RUN_ENDPOINTS = new Set([
  "/api/run",
  "/api/runninghub/run",
  "/api/runninghub-wf/run"
]);

function persistBackendRunQueue() {
  if (!backendRunQueueStore) return Promise.resolve();
  backendRunQueueStore.setSnapshot({
    pending: [...backendRunQueue],
    current: backendRunQueueCurrent
  });
  return backendRunQueueStore.persist();
}

async function restoreBackendRunQueueFromDisk() {
  if (!backendRunQueueStore) return;
  const saved = await backendRunQueueStore.load();
  if (saved.current) {
    const job = saved.current;
    ensureBackendQueueLogSession(job, "running");
    appendRunLog(job.runId, "error", "Job bị gián đoạn khi ứng dụng khởi động lại", {
      provider: queuedJobProvider(job.endpoint, job.meta)
    });
    endRunLogSession(job.runId, "error", { error: "interrupted_by_restart" });
  }
  for (const job of saved.pending) {
    backendRunQueue.push(job);
    if (!isBackendQueueAlreadyLogged(job.runId)) {
      ensureBackendQueueLogSession(job, "queued");
      appendRunLog(job.runId, "queue", `Khôi phục hàng chờ backend: ${job.endpoint}`, {
        provider: queuedJobProvider(job.endpoint, job.meta)
      });
    }
  }
  backendRunQueueStore.setSnapshot({ pending: backendRunQueue, current: null });
  await backendRunQueueStore.persist();
  drainBackendRunQueue();
}

function queuedJobProvider(endpoint, meta = {}) {
  if (meta.provider) return meta.provider;
  return endpoint === "/api/run" ? "local" : "runninghub";
}

function queuedJobLogJob(job) {
  const body = job.body || {};
  return {
    runId: body.runId || job.runId,
    template: body.template || "",
    templateId: body.templateId || "",
    webappId: body.webappId || ""
  };
}

function queuedJobLogMeta(job, status = "queued") {
  return {
    ...(job.meta || {}),
    provider: queuedJobProvider(job.endpoint, job.meta),
    status,
    startedAt: job.queuedAt
  };
}

function ensureRunLogSession({ runId, provider = "local", status = "running", job = {}, meta = {} }) {
  if (!runId) return;
  const existing = getRunLogSessions().find(session => session.runId === runId);
  if (!existing) {
    startRunLogSession({ runId, ...job }, { provider, status, ...meta });
    return;
  }
  updateRunLogSession(runId, {
    provider: existing.provider || provider,
    status,
    completedAt: null,
    error: "",
    ...meta,
    runKind: meta.runKind || existing.runKind || ""
  });
}

function queuedRunSummary(job) {
  const body = job.body || {};
  return {
    runId: body.runId || job.runId,
    provider: queuedJobProvider(job.endpoint, job.meta),
    promptId: "",
    taskId: "",
    template: body.template || "",
    templateId: body.templateId || "",
    webappId: body.webappId || "",
    canvasNodeId: job.meta?.canvasNodeId || "",
    canvasProjectId: job.meta?.canvasProjectId || "",
    runKind: job.meta?.runKind || "",
    startedAt: job.queuedAt || ""
  };
}

function queuedJobWaitsForActiveRun(job) {
  const waitForRunId = String(job.meta?.waitForRunId || "").trim();
  if (!waitForRunId) return false;
  const session = getRunLogSessions().find(item => item.runId === waitForRunId);
  if (session?.status === "queued") return false;
  if (session && !["running", "queued"].includes(session.status)) return false;
  if (activeRuns.has(waitForRunId) || activeRhRuns.has(waitForRunId)) return true;

  // The browser may submit queue jobs milliseconds before /api/run registers
  // the active request. Hold briefly so queued form jobs do not leapfrog it.
  const queuedAt = job.queuedAt ? new Date(job.queuedAt).getTime() : 0;
  return queuedAt > 0 && Date.now() - queuedAt < 10000;
}

async function executeQueuedBackendRun(job) {
  const runId = job.body?.runId || job.runId;
  const provider = queuedJobProvider(job.endpoint, job.meta);
  updateRunLogSession(runId, { status: "running" });
  appendRunLog(runId, "info", `Backend queue dispatch: ${job.endpoint}`, { provider });
  try {
    const response = await fetch(`http://127.0.0.1:${port}${job.endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job.body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.msg || `HTTP ${response.status}`);
    endRunLogSession(runId, "success", {
      taskId: data.taskId || data.promptId || "",
      durationMs: data.durationMs ?? data.historyItem?.durationMs,
      rhCoins: data.rhCoins ?? data.historyItem?.rhCoins
    });
  } catch (error) {
    appendRunLog(runId, "error", error.message || String(error), { provider });
    endRunLogSession(runId, "error", { error: error.message || String(error) });
  }
}

async function drainBackendRunQueue() {
  if (backendRunQueueActive) return;
  if (activeRuns.size || activeRhRuns.size) return;
  const job = backendRunQueue[0];
  if (!job) return;
  if (queuedJobWaitsForActiveRun(job)) {
    if (!backendRunQueueWakeTimer) {
      backendRunQueueWakeTimer = setTimeout(() => {
        backendRunQueueWakeTimer = null;
        void drainBackendRunQueue();
      }, 1000);
    }
    return;
  }
  backendRunQueue.shift();
  backendRunQueueCurrent = job;
  backendRunQueueActive = true;
  try {
    await persistBackendRunQueue();
  } catch (error) {
    backendRunQueue.unshift(job);
    backendRunQueueCurrent = null;
    backendRunQueueActive = false;
    appendRunLog(job.runId, "error", `Không thể lưu hàng chờ backend: ${error.message || error}`, {
      provider: queuedJobProvider(job.endpoint, job.meta)
    });
    return;
  }
  void executeQueuedBackendRun(job)
    .finally(async () => {
      if (backendRunQueueCurrent?.runId === job.runId) backendRunQueueCurrent = null;
      backendRunQueueActive = false;
      try {
        await persistBackendRunQueue();
        setImmediate(() => void drainBackendRunQueue());
      } catch (error) {
        appendRunLog(job.runId, "error", `Không thể cập nhật hàng chờ backend: ${error.message || error}`, {
          provider: queuedJobProvider(job.endpoint, job.meta)
        });
      }
    });
}

async function cancelQueuedBackendRun(runId) {
  if (!runId) return false;
  const index = backendRunQueue.findIndex(job => job.runId === runId || job.body?.runId === runId);
  if (index < 0) return false;
  const [job] = backendRunQueue.splice(index, 1);
  try {
    await persistBackendRunQueue();
  } catch (error) {
    backendRunQueue.splice(index, 0, job);
    throw error;
  }
  appendRunLog(runId, "warn", "Đã xóa khỏi hàng chờ backend", {
    provider: queuedJobProvider(job.endpoint, job.meta)
  });
  endRunLogSession(runId, "cancelled");
  return true;
}

async function clearQueuedBackendRuns(filter = null) {
  const removed = [];
  for (let index = backendRunQueue.length - 1; index >= 0; index -= 1) {
    const job = backendRunQueue[index];
    if (filter && !filter(job)) continue;
    removed.unshift(...backendRunQueue.splice(index, 1));
  }
  try {
    await persistBackendRunQueue();
  } catch (error) {
    backendRunQueue.push(...removed);
    backendRunQueue.sort((a, b) => String(a.queuedAt || "").localeCompare(String(b.queuedAt || "")));
    throw error;
  }
  for (const job of removed) {
    const runId = job.runId || job.body?.runId;
    appendRunLog(runId, "warn", "Đã xóa khỏi hàng chờ backend", {
      provider: queuedJobProvider(job.endpoint, job.meta)
    });
    endRunLogSession(runId, "cancelled");
  }
  return removed.length;
}

function getRunLogSessionByRunId(runId) {
  if (!runId) return null;
  return getRunLogSessions().find(session => session.runId === runId) || null;
}

function isBackendQueueAlreadyLogged(runId) {
  const session = getRunLogSessionByRunId(runId);
  if (!session) return false;
  return session.status === "queued" || session.status === "running";
}

function ensureBackendQueueLogSession(job, status = "queued") {
  if (!job?.runId) return;
  const existing = getRunLogSessionByRunId(job.runId);
  if (!existing) {
    startRunLogSession(queuedJobLogJob(job), queuedJobLogMeta(job, status));
    return;
  }
  if (existing.status !== status) {
    updateRunLogSession(job.runId, {
      ...queuedJobLogMeta(job, status),
      status,
      completedAt: null,
      error: ""
    });
  }
}

const QUEUE_RECONCILE_GRACE_MS = 30000;

function sessionWithinQueueReconcileGrace(session) {
  const startedAt = session?.startedAt ? new Date(session.startedAt).getTime() : 0;
  if (!startedAt) return true;
  return Date.now() - startedAt < QUEUE_RECONCILE_GRACE_MS;
}

function reconcileBackendRunLogState() {
  if (backendRunQueueCurrent) {
    ensureBackendQueueLogSession(backendRunQueueCurrent, "running");
  }
  for (const job of backendRunQueue) {
    if (isBackendQueueAlreadyLogged(job.runId)) continue;
    ensureBackendQueueLogSession(job, "queued");
  }

  const queueRunIds = new Set([
    ...backendRunQueue.map(job => job.body?.runId || job.runId),
    backendRunQueueCurrent?.body?.runId || backendRunQueueCurrent?.runId
  ].filter(Boolean));
  for (const session of getRunLogSessions()) {
    const runKind = String(session.runKind || "");
    // Canvas queued jobs may live in the browser queue; only form orphans are reconciled here.
    if (runKind.startsWith("canvas")) continue;
    const isBackendQueuedKind = runKind === "form";
    if (!isBackendQueuedKind || session.status !== "queued") continue;
    if (queueRunIds.has(session.runId)) continue;
    if (activeRuns.has(session.runId) || activeRhRuns.has(session.runId)) {
      updateRunLogSession(session.runId, { status: "running", completedAt: null, error: "" });
      continue;
    }
    if (sessionWithinQueueReconcileGrace(session)) continue;
    endRunLogSession(session.runId, "cancelled", { error: "missing_from_backend_queue" });
  }
}

async function handleRunQueueSubmit(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const accepted = [];
  const existing = [];
  for (const item of jobs) {
    const endpoint = String(item?.endpoint || "");
    const jobBody = item?.body && typeof item.body === "object" ? item.body : null;
    const runId = String(jobBody?.runId || item?.runId || "").trim();
    if (!QUEUE_RUN_ENDPOINTS.has(endpoint) || !jobBody || !runId) continue;
    if (backendQueueHasRunId(runId, {
      pending: backendRunQueue,
      current: backendRunQueueCurrent,
      activeRunIds: [...activeRuns.keys(), ...activeRhRuns.keys()],
      sessions: getRunLogSessions()
    })) {
      const queued = backendRunQueue.find(job => job.runId === runId || job.body?.runId === runId)
        || (backendRunQueueCurrent?.runId === runId ? backendRunQueueCurrent : null);
      existing.push(queued ? queuedRunSummary(queued) : { runId, status: "existing" });
      continue;
    }
    const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
    const queuedAt = new Date().toISOString();
    const queued = {
      id: runId,
      runId,
      endpoint,
      body: { ...jobBody, runId },
      meta,
      queuedAt
    };
    backendRunQueue.push(queued);
    accepted.push(queuedRunSummary(queued));
  }
  try {
    if (accepted.length) await persistBackendRunQueue();
  } catch (error) {
    const acceptedIds = new Set(accepted.map(job => job.runId));
    for (let index = backendRunQueue.length - 1; index >= 0; index -= 1) {
      if (acceptedIds.has(backendRunQueue[index].runId)) backendRunQueue.splice(index, 1);
    }
    throw error;
  }
  for (const summary of accepted) {
    const queued = backendRunQueue.find(job => job.runId === summary.runId);
    if (!queued || isBackendQueueAlreadyLogged(summary.runId)) continue;
    ensureBackendQueueLogSession(queued, "queued");
    appendRunLog(summary.runId, "queue", `Đã gửi vào hàng chờ backend: ${queued.endpoint}`, {
      provider: queuedJobProvider(queued.endpoint, queued.meta)
    });
  }
  void drainBackendRunQueue();
  send(res, 200, {
    accepted: accepted.length,
    existing: existing.length,
    acknowledged: accepted.length + existing.length,
    jobs: [...accepted, ...existing]
  });
}

async function handleRunQueueClear(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const runKind = String(body.runKind || "").trim();
  const runKindPrefix = String(body.runKindPrefix || "").trim();
  const cleared = await clearQueuedBackendRuns(
    runKindPrefix
      ? job => String(job.meta?.runKind || "").startsWith(runKindPrefix)
      : runKind
        ? job => String(job.meta?.runKind || "") === runKind
        : null
  );
  send(res, 200, { cleared });
}

function listActiveRuns(activeRuns, activeRhRuns, getRunLogSessions) {
  reconcileBackendRunLogState();
  const logByRunId = new Map(getRunLogSessions().map(session => [session.runId, session]));
  const runs = [];
  if (backendRunQueueCurrent && !activeRuns.has(backendRunQueueCurrent.runId) && !activeRhRuns.has(backendRunQueueCurrent.runId)) {
    runs.push({
      ...queuedRunSummary(backendRunQueueCurrent),
      status: "running",
      startedAt: logByRunId.get(backendRunQueueCurrent.runId)?.startedAt || backendRunQueueCurrent.queuedAt || ""
    });
  }
  for (const job of backendRunQueue) {
    const summary = queuedRunSummary(job);
    runs.push({
      ...summary,
      status: "queued",
      startedAt: logByRunId.get(summary.runId)?.startedAt || summary.startedAt
    });
  }
  for (const [runId, run] of activeRuns) {
    const session = logByRunId.get(runId);
    runs.push({
      runId,
      provider: "local",
      promptId: run.promptId || "",
      template: session?.template || "",
      templateId: session?.templateId || "",
      webappId: session?.webappId || "",
      canvasNodeId: session?.canvasNodeId || "",
      canvasProjectId: session?.canvasProjectId || "",
      runKind: session?.runKind || "",
      startedAt: session?.startedAt || ""
    });
  }
  for (const [runId, run] of activeRhRuns) {
    const session = logByRunId.get(runId);
    runs.push({
      runId,
      provider: "runninghub",
      taskId: run.taskId || session?.taskId || "",
      template: session?.template || "",
      templateId: session?.templateId || "",
      webappId: session?.webappId || "",
      canvasNodeId: session?.canvasNodeId || "",
      canvasProjectId: session?.canvasProjectId || "",
      runKind: session?.runKind || "",
      startedAt: session?.startedAt || ""
    });
  }
  return runs;
}

function handleActiveRuns(_req, res) {
  send(res, 200, { runs: listActiveRuns(activeRuns, activeRhRuns, getRunLogSessions) });
}

function handleRunState(_req, res) {
  reconcileBackendRunLogState();
  send(res, 200, {
    runs: listActiveRuns(activeRuns, activeRhRuns, getRunLogSessions),
    sessions: getRunLogSessions()
  });
}

function handleRunLogSessions(_req, res) {
  reconcileBackendRunLogState();
  send(res, 200, { sessions: getRunLogSessions() });
}

async function handleRunLogMutate(req, res, mutate) {
  const body = JSON.parse(await readBody(req) || "{}");
  const sessions = mutate(body);
  send(res, 200, { sessions });
}

const storage = createStorageService({
  resourceRoot,
  dataRoot,
  readBody,
  send,
  hasActiveRuns: () => activeRuns.size > 0 || activeRhRuns.size > 0
});

const runCoordinator = {
  activeRuns,
  activeRhRuns,
  pendingSseClients,
  broadcastRunEvent,
  drainBackendRunQueue,
  cancelQueuedBackendRun,
  getRunLogSessions,
  ensureRunLogSession
};

const comfy = createComfyService({ storage, runCoordinator, readBody, send });
const runningHub = createRunningHubService({ storage, runCoordinator, readBody, send, resourceRoot, dataRoot });
const shortcut = createShortcutService({ readBody, send, resourceRoot });

function templateScopeFromUrl(url) {
  return storage.getTemplates().normalizeScope(url.searchParams.get("scope"));
}

async function readTemplateWorkflow(config, template) {
  if (!template.workflowPath) return null;
  if (storage.getTemplates().usesSavedWorkflowJson(config, template) === false) return null;
  return JSON.parse(await readFile(template.workflowPath, "utf8"));
}

async function handleTemplateEditor(req, res, url) {
  const scope = templateScopeFromUrl(url);
  const { config, raw, template } = await storage.getTemplates().loadConfig(url.searchParams.get("template"), scope);
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
  const scope = storage.getTemplates().normalizeScope(body.scope || url?.searchParams?.get("scope"));
  const templateId = String(body.templateId || "").trim();
  if (!templateId) {
    send(res, 400, { error: "Missing template id" });
    return;
  }
  try {
    const registry = await storage.getTemplates().deleteTemplate(templateId, scope);
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
  const scope = storage.getTemplates().normalizeScope(body.scope || url?.searchParams?.get("scope"));
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
  const templateId = storage.slugifyTemplateId(body.templateId || config?.template?.id || config?.app?.name);
  const { targetRoot, savedAsCopy } = await storage.getTemplates().resolveSaveTargetRoot(templateId, scope);
  storage.assertWritableTemplatePath(storage.getPaths().configDir, targetRoot);

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

  const nextRegistry = await storage.getTemplates().loadTemplateRegistry(scope);
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

export async function cleanupUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  return storage.cleanupUploads(maxAgeMs);
}

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
  await storage.init();
  runningHub.syncPaths();
  const { personalDataDir } = storage.getPaths();
  backendRunQueueStore = createBackendRunQueueStore({
    filePath: path.join(personalDataDir, "backend-run-queue.json")
  });
  await restoreBackendRunQueueFromDisk();
}

export const routeContext = {
  TEMPLATE_SCOPES,
  appendRunLog,
  appendRunLogs,
  assertTemplateWorkflow: comfy.assertTemplateWorkflow,
  cancelQueueItems: comfy.cancelQueueItems,
  clearRunLogSessions,
  deleteRunLogSession,
  endRunLogSession,
  handleAppSettings: storage.handleAppSettings,
  handleCanvasProject: storage.handleCanvasProject,
  handleCanvasWorkflowLibrary: storage.handleCanvasWorkflowLibrary,
  handleCancel: comfy.handleCancel,
  handleComfyDiscovery: comfy.handleComfyDiscovery,
  handleComfyHealth: comfy.handleComfyHealth,
  handleComfyModels: comfy.handleComfyModels,
  handleComfyView: comfy.handleComfyView,
  handleDeleteInputImage: storage.handleDeleteInputImage,
  handleDeleteOutputHistory: storage.handleDeleteOutputHistory,
  handleInputFromUrl: storage.handleInputFromUrl,
  handleInputImage: storage.handleInputImage,
  handleInputScanFolder: storage.handleInputScanFolder,
  handleInputUpload: storage.handleInputUpload,
  handleOpenDirectory: storage.handleOpenDirectory,
  handleOutputImage: storage.handleOutputImage,
  handleReplaceOutputImage: storage.handleReplaceOutputImage,
  handleRhDefaultApps: runningHub.handleRhDefaultApps,
  handleRhDefaultAppsRefresh: runningHub.handleRhDefaultAppsRefresh,
  handleRun: comfy.handleRun,
  handleRunEvents,
  handleRunQueueClear,
  handleRunQueueSubmit,
  handleRunState,
  handleRunLogMutate,
  handleActiveRuns,
  handleRunLogSessions,
  handleRunningHubAccountStatus: runningHub.handleRunningHubAccountStatus,
  handleRunningHubCancel: runningHub.handleRunningHubCancel,
  handleRunningHubNodes: runningHub.handleRunningHubNodes,
  handleRunningHubRun: runningHub.handleRunningHubRun,
  handleRunningHubTaskCheck: runningHub.handleRunningHubTaskCheck,
  handleRunningHubShortcutExport: shortcut.handleRunningHubShortcutExport,
  handleRunningHubWfRun: runningHub.handleRunningHubWfRun,
  handleRunningHubWfWorkflowJson: runningHub.handleRunningHubWfWorkflowJson,
  handleSaveColorAdjust: storage.handleSaveColorAdjust,
  handleSaveEditedOutput: storage.handleSaveEditedOutput,
  handleStorageSettings: storage.handleStorageSettings,
  handleTemplateDelete,
  handleTemplateEditor,
  handleTemplateSave,
  listInputImages: storage.listInputImages,
  normalizeComfyTarget: comfy.normalizeComfyTarget,
  readBody,
  readCustomPresets: storage.readCustomPresets,
  readOutputHistory: storage.readOutputHistory,
  readRhSavedApps: runningHub.readRhSavedApps,
  readWorkflowPresets: storage.readWorkflowPresets,
  send,
  startRunLogSession,
  templateScopeFromUrl,
  templates: () => storage.getTemplates(),
  updateRunLogSession,
  writeCustomPresets: storage.writeCustomPresets,
  writeRhSavedApps: runningHub.writeRhSavedApps,
  writeWorkflowPresets: storage.writeWorkflowPresets
};
