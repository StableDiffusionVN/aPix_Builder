import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDataUrl } from "./comfyClient.js";

export const RUNNINGHUB_HOST = "www.runninghub.ai";
export const RUNNINGHUB_BASE = `https://${RUNNINGHUB_HOST}`;
export const RUNNINGHUB_DEFAULT_FULL_WF_ID = "2064644362323189762";

const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

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
    throw new Error(data.msg || data.message || text || `RunningHub error ${code}`);
  }
  return data;
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

export async function getWebappNodes(apiKey, webappId, signal) {
  const query = new URLSearchParams({ apiKey, webappId });
  const response = await fetch(`${RUNNINGHUB_BASE}/api/webapp/apiCallDemo?${query}`, {
    signal,
    headers: rhHeaders(apiKey)
  });
  const data = await readRunningHubEnvelope(response);
  return data.data?.nodeInfoList || [];
}

export async function uploadToRunningHub(apiKey, buffer, filename, mimeType = "image/png", signal) {
  const formData = new FormData();
  formData.append("apiKey", apiKey);
  formData.append("fileType", "input");
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/upload`, {
    method: "POST",
    headers: rhHeaders(apiKey),
    body: formData,
    signal
  });
  const data = await readRunningHubEnvelope(response);
  if (!data.data?.fileName) {
    throw new Error(data.msg || "Upload file lên RunningHub thất bại");
  }
  return data.data.fileName;
}

async function resolveImageFieldValue(apiKey, value, { inputDir, signal }) {
  if (!value) return value;
  if (typeof value === "string") {
    if (value.startsWith("api/")) return value;
    if (value.startsWith("data:")) {
      const parsed = parseDataUrl(value);
      if (!parsed) throw new Error("Ảnh upload không hợp lệ");
      const ext = parsed.mimeType.includes("jpeg") ? "jpg" : parsed.mimeType.split("/")[1] || "png";
      return uploadToRunningHub(apiKey, parsed.buffer, `upload.${ext}`, parsed.mimeType, signal);
    }
    if (value.startsWith("/api/input-image")) {
      const url = new URL(value, "http://localhost");
      const name = path.basename(url.searchParams.get("name") || "");
      if (!name) throw new Error("Thiếu tên file input image");
      const filePath = path.join(inputDir, name);
      const buffer = await readFile(filePath);
      const ext = path.extname(name).slice(1) || "png";
      const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      return uploadToRunningHub(apiKey, buffer, name, mimeType, signal);
    }
    if (/^https?:\/\//i.test(value)) return value;
  }
  if (value?.kind === "input-image" && value.url) {
    return resolveImageFieldValue(apiKey, value.url, { inputDir, signal });
  }
  if (value?.kind === "upload" && value.buffer) {
    const ext = value.mimeType?.includes("jpeg") ? "jpg" : value.mimeType?.split("/")[1] || "png";
    return uploadToRunningHub(apiKey, value.buffer, `upload.${ext}`, value.mimeType || "image/png", signal);
  }
  return value;
}

export async function prepareNodeInfoList(apiKey, nodes, { inputDir, signal, onProgress }) {
  const prepared = [];
  for (const node of nodes) {
    let fieldValue = node.fieldValue;
    const fieldType = String(node.fieldType || "").toUpperCase();
    if (fieldType === "IMAGE" || fieldType === "AUDIO" || fieldType === "VIDEO") {
      onProgress?.({ type: "upload", label: `Đang upload ${node.description || node.fieldName}...` });
      fieldValue = await resolveImageFieldValue(apiKey, fieldValue, { inputDir, signal });
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
