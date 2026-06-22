import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDataUrl } from "./comfyClient.js";

export const RUNNINGHUB_HOST = "www.runninghub.ai";
export const RUNNINGHUB_BASE = `https://${RUNNINGHUB_HOST}`;
export const RUNNINGHUB_DEFAULT_FULL_WF_ID = "2064644362323189762";

const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const TOKEN_IDLE_POLL_MS = 5000;
const TOKEN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const TOKEN_SUBMIT_MAX_ATTEMPTS = 120;

export class RhApiError extends Error {
  constructor(code, msg, raw = null) {
    super(msg || `RunningHub error ${code}`);
    this.name = "RhApiError";
    this.code = code;
    this.msg = msg || "";
    this.raw = raw;
  }
}

function rhSleep(ms, signal) {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Đã hủy task RunningHub"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Đã hủy task RunningHub"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function rhHeaders(apiKey, extra = {}) {
  const headers = { Host: RUNNINGHUB_HOST, ...extra };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function parseWorkflowPrompt(prompt) {
  if (!prompt) throw new Error("RunningHub không trả về workflow prompt");
  if (typeof prompt === "object") return prompt;
  if (typeof prompt !== "string") throw new Error("Workflow JSON từ RunningHub không hợp lệ");

  try {
    return JSON.parse(prompt);
  } catch {
    try {
      return JSON.parse(JSON.parse(prompt));
    } catch {
      throw new Error("Workflow JSON từ RunningHub không hợp lệ");
    }
  }
}

async function readRunningHubEnvelope(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `RunningHub HTTP ${response.status}`);
  }
  const code = data.code;
  if (code !== 0 && code !== "0") {
    const message = data.msg || data.message || text || `RunningHub error ${code}`;
    throw new RhApiError(code, message, data);
  }
  return data;
}

export function normalizeRhErrorCode(code) {
  if (code === 0 || code === "0") return 0;
  const numeric = Number(code);
  return Number.isFinite(numeric) ? numeric : code;
}

export function isRhTokenBusyCode(code) {
  const normalized = normalizeRhErrorCode(code);
  return normalized === 804 || normalized === 421;
}

export function isRhRetryLaterCode(code) {
  const normalized = normalizeRhErrorCode(code);
  return normalized === 415
    || normalized === 1011
    || normalized === 1010
    || normalized === 1003
    || normalized === 1005;
}

const RH_RESOURCE_ACCESS_CODES = new Set([
  380,
  801,
  810,
  901,
  1014,
  436,
  811
]);

export function isRhResourceAccessError(error) {
  if (!error) return false;
  const code = normalizeRhErrorCode(error instanceof RhApiError ? error.code : error.code);
  if (RH_RESOURCE_ACCESS_CODES.has(code)) return true;
  const message = String(
    error instanceof RhApiError ? error.msg : error.message || error.msg || ""
  ).toLowerCase();
  return /workflow_not_exists|webapp_not_exists|workflow_not_saved|access denied|apikey_unsupported_free_user|corpapikey_invalid|task_user_exclapi_required|không.*quyền|không.*truy cập|没有权限|无权限|permission denied|no permission|not authorized.*workflow|not authorized.*webapp/.test(message);
}

export class RhResourceAccessExhaustedError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "RhResourceAccessExhaustedError";
    this.tokenCount = options.tokenCount ?? 0;
    this.resourceKind = options.resourceKind || "resource";
  }
}

function parseRhTaskCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

export async function fetchFullAccountStatus(apiKey, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/uc/openapi/accountStatus`, {
    method: "POST",
    signal,
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify({ apikey: apiKey })
  });
  const data = await readRunningHubEnvelope(response);
  return data.data || {};
}

export async function fetchRhQueueStatus(apiKey, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/openapi/v2/queue/status`, {
    method: "GET",
    signal,
    headers: rhHeaders(apiKey)
  });
  const data = await readRunningHubEnvelope(response);
  return data.data || {};
}

export async function getRhApiKeyActiveTaskCount(apiKey, signal) {
  let maxCount = 0;
  try {
    const queue = await fetchRhQueueStatus(apiKey, signal);
    const running = parseRhTaskCount(queue.runningCount);
    const queued = parseRhTaskCount(queue.queuedCount);
    const total = parseRhTaskCount(queue.totalCurrentTasks);
    maxCount = Math.max(maxCount, total, running + queued);
  } catch {}

  try {
    const account = await fetchFullAccountStatus(apiKey, signal);
    maxCount = Math.max(maxCount, parseRhTaskCount(account.currentTaskCounts));
  } catch {}

  return maxCount;
}

export async function waitForRhApiKeyIdle(apiKey, options = {}) {
  const {
    signal,
    onWait,
    pollMs = TOKEN_IDLE_POLL_MS,
    timeoutMs = TOKEN_IDLE_TIMEOUT_MS
  } = options;
  const started = Date.now();
  let lastLabel = "";

  while (true) {
    if (signal?.aborted) throw new Error("Đã hủy task RunningHub");
    const activeCount = await getRhApiKeyActiveTaskCount(apiKey, signal);
    if (activeCount <= 0) return;

    const label = activeCount === 1
      ? "API key đang xử lý 1 task khác, đang chờ hoàn tất..."
      : `API key đang xử lý ${activeCount} task khác, đang chờ slot trống...`;
    if (label !== lastLabel) {
      lastLabel = label;
      onWait?.({ type: "token_wait", status: "waiting", label });
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error("Timeout khi chờ API key RunningHub rảnh");
    }
    await rhSleep(pollMs, signal);
  }
}

export async function submitRhTaskWhenReady(apiKey, submitFn, options = {}) {
  const {
    signal,
    onWait,
    pollMs = TOKEN_IDLE_POLL_MS,
    maxAttempts = TOKEN_SUBMIT_MAX_ATTEMPTS
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) throw new Error("Đã hủy task RunningHub");
    await waitForRhApiKeyIdle(apiKey, { signal, onWait, pollMs, timeoutMs: 5 * 60 * 1000 });
    try {
      return await submitFn();
    } catch (error) {
      if (isRhResourceAccessError(error)) throw error;
      const code = error instanceof RhApiError ? error.code : null;
      if (!code || (!isRhTokenBusyCode(code) && !isRhRetryLaterCode(code))) throw error;
      onWait?.({
        type: "token_wait",
        status: "waiting",
        label: error.msg || "API key RunningHub đang bận, đang chờ thử lại..."
      });
      await rhSleep(pollMs, signal);
    }
  }
  throw new Error("Không gửi được task RunningHub sau khi chờ API key rảnh");
}

export async function getWorkflowJson(apiKey, workflowId, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/api/openapi/getJsonApiFormat`, {
    method: "POST",
    signal,
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify({ apiKey, workflowId })
  });
  const data = await readRunningHubEnvelope(response);
  return parseWorkflowPrompt(data.data?.prompt);
}

export function normalizeWebappCallDemo(payload = {}) {
  return {
    webappName: String(payload.webappName || "").trim(),
    accessEncrypted: Boolean(payload.accessEncrypted),
    statisticsInfo: payload.statisticsInfo && typeof payload.statisticsInfo === "object"
      ? payload.statisticsInfo
      : null,
    covers: Array.isArray(payload.covers) ? payload.covers : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    nodeInfoList: Array.isArray(payload.nodeInfoList) ? payload.nodeInfoList : []
  };
}

export async function getWebappCallDemo(apiKey, webappId, signal) {
  const query = new URLSearchParams({ apiKey, webappId });
  const response = await fetch(`${RUNNINGHUB_BASE}/api/webapp/apiCallDemo?${query}`, {
    signal,
    headers: rhHeaders(apiKey)
  });
  const data = await readRunningHubEnvelope(response);
  return normalizeWebappCallDemo(data.data);
}

export async function getWebappNodes(apiKey, webappId, signal) {
  const demo = await getWebappCallDemo(apiKey, webappId, signal);
  return demo.nodeInfoList;
}

export async function uploadToRunningHub(apiKey, buffer, filename, mimeType = "image/png", signal) {
  const formData = new FormData();
  formData.append("apiKey", apiKey);
  formData.append("fileType", "input");
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);
  const uploadSignal = (() => {
    const timeout = AbortSignal.timeout(120 * 1000);
    if (!signal) return timeout;
    if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);
    return signal;
  })();
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/upload`, {
    method: "POST",
    headers: rhHeaders(apiKey),
    body: formData,
    signal: uploadSignal
  });
  const data = await readRunningHubEnvelope(response);
  if (!data.data?.fileName) {
    throw new Error(data.msg || "Upload file lên RunningHub thất bại");
  }
  return data.data.fileName;
}

async function fetchRemoteImage(url, signal) {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    const mimeType = contentType.startsWith("image/") ? contentType : "image/png";
    const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.split("/")[1] || "png";
    let filename = `remote.${ext}`;
    try {
      const base = path.basename(new URL(url).pathname);
      if (base) filename = base;
    } catch {}
    if (!path.extname(filename)) filename = `${filename}.${ext}`;
    return { buffer, mimeType, filename };
  } catch {
    return null;
  }
}

function safeBasename(rawName = "") {
  return path.basename(String(rawName)).replace(/[^\w.-]+/g, "_");
}

function mimeFromFilename(filename = "") {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

/** Parse /api/output-image or /api/input-image refs (path or absolute URL). */
function parseLocalImageRef(value) {
  if (!value || typeof value !== "string") return null;
  let pathname = value;
  let search = "";
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      pathname = parsed.pathname;
      search = parsed.search;
    } catch {
      return null;
    }
  } else if (!value.startsWith("/")) {
    return null;
  }
  const refUrl = new URL(`${pathname}${search}`, "http://localhost");
  if (pathname.startsWith("/api/output-image")) {
    const name = safeBasename(refUrl.searchParams.get("name") || "");
    return name ? { kind: "output", name } : null;
  }
  if (pathname.startsWith("/api/input-image")) {
    const name = safeBasename(refUrl.searchParams.get("name") || "");
    return name ? { kind: "input", name } : null;
  }
  return null;
}

async function readLocalImageFromDir(dir, name) {
  const filePath = path.join(dir, name);
  const resolvedDir = path.resolve(dir);
  if (!path.resolve(filePath).startsWith(resolvedDir)) {
    throw new Error("Invalid local image path");
  }
  const buffer = await readFile(filePath);
  return { buffer, mimeType: mimeFromFilename(name), filename: name };
}

async function resolveImageFieldValue(apiKey, value, { inputDir, outputDir, signal, onProgress }) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    if (value?.kind === "input-image" && value.url) {
      return resolveImageFieldValue(apiKey, value.url, { inputDir, outputDir, signal, onProgress });
    }
    if (typeof value.url === "string" && value.url) {
      return resolveImageFieldValue(apiKey, value.url, { inputDir, outputDir, signal, onProgress });
    }
    return "";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    value = trimmed;
    if (value.startsWith("api/")) return value;
    const localRef = parseLocalImageRef(value);
    if (localRef) {
      const dir = localRef.kind === "output" ? outputDir : inputDir;
      if (!dir) throw new Error(`Missing ${localRef.kind} image directory`);
      let localImage;
      try {
        onProgress?.({ type: "upload", label: `Đọc ảnh ${localRef.kind}: ${localRef.name}...` });
        localImage = await readLocalImageFromDir(dir, localRef.name);
        if (!localImage.buffer?.length) {
          throw new Error(`File ảnh rỗng (${localRef.name})`);
        }
      } catch (err) {
        throw new Error(`Không đọc được ảnh local (${localRef.kind}/${localRef.name}): ${err.message}`);
      }
      const { buffer, mimeType, filename } = localImage;
      const sizeKb = Math.max(1, Math.round(buffer.length / 1024));
      onProgress?.({ type: "upload", label: `Upload ${sizeKb}KB lên RunningHub (${filename})...` });
      const uploadedName = await uploadToRunningHub(apiKey, buffer, filename, mimeType, signal);
      onProgress?.({ type: "upload", label: `Upload xong: ${filename}` });
      return uploadedName;
    }
    if (value.startsWith("data:")) {
      const parsed = parseDataUrl(value);
      if (!parsed) throw new Error("Ảnh upload không hợp lệ");
      const ext = parsed.mimeType.includes("jpeg") ? "jpg" : parsed.mimeType.split("/")[1] || "png";
      onProgress?.({ type: "upload", label: `Upload ảnh nhúng lên RunningHub (${Math.max(1, Math.round(parsed.buffer.length / 1024))}KB)...` });
      const uploadedName = await uploadToRunningHub(apiKey, parsed.buffer, `upload.${ext}`, parsed.mimeType, signal);
      onProgress?.({ type: "upload", label: "Upload xong ảnh nhúng" });
      return uploadedName;
    }
    if (/^https?:\/\//i.test(value)) {
      onProgress?.({ type: "upload", label: "Đang tải ảnh remote trước khi gửi RunningHub..." });
      const downloaded = await fetchRemoteImage(value, signal);
      if (!downloaded) return value;
      onProgress?.({ type: "upload", label: `Upload ảnh remote lên RunningHub (${downloaded.filename})...` });
      const uploadedName = await uploadToRunningHub(apiKey, downloaded.buffer, downloaded.filename, downloaded.mimeType, signal);
      onProgress?.({ type: "upload", label: `Upload xong ảnh remote: ${downloaded.filename}` });
      return uploadedName;
    }
  }
  if (value?.kind === "local-file" && value.filePath) {
    const buffer = await readFile(value.filePath);
    const ext = path.extname(value.filePath).slice(1) || "png";
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const filename = value.name || path.basename(value.filePath);
    onProgress?.({ type: "upload", label: `Upload file local lên RunningHub (${filename})...` });
    const uploadedName = await uploadToRunningHub(apiKey, buffer, filename, mimeType, signal);
    onProgress?.({ type: "upload", label: `Upload xong file local: ${filename}` });
    return uploadedName;
  }
  if (value?.kind === "input-image" && value.url) {
    return resolveImageFieldValue(apiKey, value.url, { inputDir, outputDir, signal, onProgress });
  }
  if (value?.kind === "upload" && value.buffer) {
    const ext = value.mimeType?.includes("jpeg") ? "jpg" : value.mimeType?.split("/")[1] || "png";
    onProgress?.({ type: "upload", label: "Upload ảnh buffer lên RunningHub..." });
    const uploadedName = await uploadToRunningHub(apiKey, value.buffer, `upload.${ext}`, value.mimeType || "image/png", signal);
    onProgress?.({ type: "upload", label: "Upload xong ảnh buffer" });
    return uploadedName;
  }
  return value;
}

export async function prepareNodeInfoList(apiKey, nodes, { inputDir, outputDir, signal, onProgress }) {
  const prepared = [];
  for (const node of nodes) {
    let fieldValue = node.fieldValue;
    const fieldType = String(node.fieldType || "").toUpperCase();
    if (fieldType === "IMAGE" || fieldType === "AUDIO" || fieldType === "VIDEO") {
      const isEmpty = fieldValue == null
        || fieldValue === ""
        || (typeof fieldValue === "string" && !fieldValue.trim());
      if (isEmpty) {
        prepared.push({
          nodeId: String(node.nodeId),
          fieldName: node.fieldName,
          fieldValue: ""
        });
        continue;
      }
      onProgress?.({ type: "upload", label: `Đang upload ${node.description || node.fieldName}...` });
      fieldValue = await resolveImageFieldValue(apiKey, fieldValue, {
        inputDir,
        outputDir,
        signal,
        onProgress
      });
    } else if (fieldValue === "random_seed") {
      fieldValue = String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    } else if (fieldValue != null && typeof fieldValue !== "string") {
      fieldValue = String(fieldValue);
    }
    prepared.push({
      nodeId: String(node.nodeId),
      fieldName: node.fieldName,
      fieldValue
    });
  }
  return prepared;
}

function applyWorkflowTaskOptions(body, options = {}) {
  const { addMetadata, accessPassword, usePersonalQueue } = options;
  if (addMetadata) body.addMetadata = true;
  if (accessPassword) body.accessPassword = accessPassword;
  if (usePersonalQueue) body.usePersonalQueue = true;
}

export async function submitWorkflowTask(apiKey, options, signal) {
  const { workflowId, nodeInfoList, workflow, addMetadata, accessPassword, usePersonalQueue } = options || {};
  const taskOptions = { addMetadata, accessPassword, usePersonalQueue };
  const body = { apiKey };

  if (workflow != null) {
    body.workflowId = String(workflowId || "").trim() || RUNNINGHUB_DEFAULT_FULL_WF_ID;
    body.workflow = typeof workflow === "string" ? workflow : JSON.stringify(workflow);
    applyWorkflowTaskOptions(body, taskOptions);
  } else {
    body.workflowId = workflowId;
    body.nodeInfoList = nodeInfoList || [];
    applyWorkflowTaskOptions(body, taskOptions);
  }

  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/create`, {
    method: "POST",
    signal,
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify(body)
  });
  const data = await readRunningHubEnvelope(response);
  return data.data || {};
}

export async function submitAiAppTask(apiKey, webappId, nodeInfoList, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/ai-app/run`, {
    method: "POST",
    signal,
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify({ apiKey, webappId, nodeInfoList })
  });
  const data = await readRunningHubEnvelope(response);
  return data.data || {};
}

export async function queryTaskOutputs(apiKey, taskId, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/outputs`, {
    method: "POST",
    signal,
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify({ apiKey, taskId })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `RunningHub HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(data.msg || data.message || text || `RunningHub HTTP ${response.status}`);
  }
  return data;
}

export function parsePromptTips(promptTips) {
  if (!promptTips) return null;
  try {
    return typeof promptTips === "string" ? JSON.parse(promptTips) : promptTips;
  } catch {
    return null;
  }
}

export function isRhTaskSuccessCode(code) {
  return code === 0 || code === "0";
}

export function parseRhCoinNumber(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = String(raw).trim();
  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRhOutputList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.outputs)) return data.outputs;
  if (data.fileUrl || data.url) return [data];
  return [];
}

export function extractRhConsumeCoins(outputs, envelope = null) {
  const sources = [...normalizeRhOutputList(outputs)];
  if (envelope && typeof envelope === "object") {
    if (!Array.isArray(envelope.data) && envelope.data && typeof envelope.data === "object") {
      sources.push(envelope.data);
    }
    sources.push(envelope);
  }

  let best = null;
  for (const item of sources) {
    if (!item || typeof item !== "object") continue;
    const raw = item.consumeCoins
      ?? item.consumeMoney
      ?? item.thirdPartyConsumeMoney
      ?? item.rhCoins
      ?? item.coins;
    const value = parseRhCoinNumber(raw);
    if (value == null) continue;
    if (best == null || value > best) best = value;
  }
  return best;
}

export async function fetchAccountRemainCoins(apiKey, signal) {
  try {
    const response = await fetch(`${RUNNINGHUB_BASE}/uc/openapi/accountStatus`, {
      method: "POST",
      signal,
      headers: rhHeaders(apiKey, { "content-type": "application/json" }),
      body: JSON.stringify({ apikey: apiKey })
    });
    const data = await readRunningHubEnvelope(response);
    return parseRhCoinNumber(data.data?.remainCoins);
  } catch {
    return null;
  }
}

export function interpretRhTaskResponse(result, taskId) {
  const code = result?.code;
  const data = result?.data;
  const outputs = normalizeRhOutputList(data);
  const hasFiles = outputs.some(item => item?.fileUrl || item?.url);

  let status = "unknown";
  let statusLabel = String(result?.msg || "UNKNOWN").toUpperCase();
  if (isRhTaskSuccessCode(code) && hasFiles) {
    status = "success";
    statusLabel = "SUCCESS";
  } else if (code === 805 || code === "805") {
    status = "failed";
    statusLabel = "FAILED";
  } else if (code === 804 || code === "804") {
    status = "running";
    statusLabel = "RUNNING";
  } else if (code === 813 || code === "813") {
    status = "queued";
    statusLabel = "QUEUED";
  } else if (!isRhTaskSuccessCode(code)) {
    status = "waiting";
  }

  const failedReason = (code === 805 || code === "805") && data?.failedReason
    ? data.failedReason
    : null;

  return {
    taskId: String(taskId),
    code,
    msg: result?.msg || "",
    status,
    statusLabel,
    rhCoins: extractRhConsumeCoins(outputs, result),
    outputs: outputs.map((item, index) => ({
      index,
      fileUrl: item.fileUrl || item.url || "",
      fileType: item.fileType || "",
      nodeId: item.nodeId || "",
      taskCostTime: item.taskCostTime ?? null,
      consumeCoins: parseRhCoinNumber(item.consumeCoins ?? item.consumeMoney ?? item.thirdPartyConsumeMoney)
    })),
    failedReason,
    netWssUrl: data?.netWssUrl || null,
    queriedAt: new Date().toISOString()
  };
}

export async function inspectRhTask(apiKey, taskId, signal) {
  const result = await queryTaskOutputs(apiKey, taskId, signal);
  return interpretRhTaskResponse(result, taskId);
}

export async function resolveRhTaskCoins(apiKey, { outputs, rhCoins, coinsBefore, signal } = {}) {
  if (rhCoins != null) return rhCoins;
  const fromOutputs = extractRhConsumeCoins(outputs);
  if (fromOutputs != null) return fromOutputs;
  if (coinsBefore == null) return null;
  const coinsAfter = await fetchAccountRemainCoins(apiKey, signal);
  if (coinsAfter == null || coinsBefore < coinsAfter) return null;
  const diff = coinsBefore - coinsAfter;
  return diff > 0 ? diff : null;
}

export async function waitForTaskOutputs(apiKey, taskId, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollMs = DEFAULT_POLL_MS,
    signal,
    onStatus
  } = options;
  const started = Date.now();

  while (true) {
    if (signal?.aborted) throw new Error("Đã hủy task RunningHub");
    const result = await queryTaskOutputs(apiKey, taskId, signal);
    const code = result.code;
    const data = result.data;

    if (isRhTaskSuccessCode(code) && data) {
      const outputs = normalizeRhOutputList(data);
      const hasFiles = outputs.some(item => item?.fileUrl || item?.url);
      if (hasFiles) {
        onStatus?.({ type: "success", label: "Đã nhận kết quả từ RunningHub" });
        return {
          outputs,
          rhCoins: extractRhConsumeCoins(outputs, result)
        };
      }
    }
    if (code === 805) {
      const reason = data?.failedReason;
      const message = reason?.exception_message || result.msg || "Task RunningHub thất bại";
      throw new Error(message);
    }
    if (code === 804) {
      onStatus?.({ type: "running", label: "RunningHub đang xử lý trên cloud..." });
    } else if (code === 813) {
      onStatus?.({ type: "queued", label: "Task đang chờ trong hàng đợi RunningHub..." });
    } else {
      onStatus?.({ type: "waiting", label: result.msg || "Đang chờ RunningHub..." });
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error("Timeout khi chờ kết quả từ RunningHub");
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}
