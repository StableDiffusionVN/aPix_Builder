export const EXECUTION_MODE_KEY = "apix-builder:execution-mode:v1";
export const RUNNINGHUB_SETTINGS_KEY = "apix-builder:runninghub:v1";
export const DEFAULT_RH_WEBAPP_ID = "2039924771751731201";
export const DEFAULT_RH_WF_ID = "2064644362323189762";
export const RUNNINGHUB_BASE = "https://www.runninghub.ai";
export const RUNNINGHUB_APP_OPTIONS = [
  { id: DEFAULT_RH_WEBAPP_ID, name: "SDVN Upscale" }
];

const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function loadExecutionMode() {
  const stored = localStorage.getItem(EXECUTION_MODE_KEY);
  if (stored === "runninghub") return "runninghub-app";
  if (stored === "runninghub-app" || stored === "runninghub-wf") return stored;
  return "local";
}

export function isRunningHubMode(mode) {
  return mode === "runninghub-app" || mode === "runninghub-wf";
}

export function loadRunningHubSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUNNINGHUB_SETTINGS_KEY) || "{}");
    return {
      apiKey: parsed.apiKey || "",
      webappId: parsed.webappId || DEFAULT_RH_WEBAPP_ID,
      workflowId: parsed.workflowId || ""
    };
  } catch {
    return { apiKey: "", webappId: DEFAULT_RH_WEBAPP_ID, workflowId: "" };
  }
}

export function saveExecutionMode(mode) {
  const normalized = mode === "runninghub" ? "runninghub-app" : mode;
  if (normalized === "runninghub-app" || normalized === "runninghub-wf") {
    localStorage.setItem(EXECUTION_MODE_KEY, normalized);
  } else {
    localStorage.setItem(EXECUTION_MODE_KEY, "local");
  }
}

export function saveRunningHubSettings(settings) {
  localStorage.setItem(RUNNINGHUB_SETTINGS_KEY, JSON.stringify({
    apiKey: settings.apiKey || "",
    webappId: settings.webappId || DEFAULT_RH_WEBAPP_ID,
    workflowId: settings.workflowId || ""
  }));
}

export function isRunningHubWfTemplate(config) {
  return Boolean(String(config?.runninghub?.workflowId || "").trim());
}

export function usesSavedWorkflowJson(config, hasWorkflowFile = false) {
  if (config?.runninghub?.saveWorkflowJson === false) return false;
  if (config?.runninghub?.saveWorkflowJson === true) return true;
  return hasWorkflowFile;
}

export function runningHubTaskOptions(config = {}) {
  const rh = config.runninghub || {};
  return {
    addMetadata: Boolean(rh.addMetadata),
    accessPassword: String(rh.accessPassword || "").trim() || undefined,
    usePersonalQueue: Boolean(rh.usePersonalQueue)
  };
}

export function extractRunningHubWorkflowId(raw, config) {
  const match = String(raw || "").match(/workflowId:\s*["']?(\d+)["']?/);
  if (match?.[1]) return match[1];
  const value = config?.runninghub?.workflowId;
  if (value == null || value === "") return "";
  return String(value).trim();
}

export function nodeFieldKey(node) {
  return `${node.nodeId}|${node.fieldName}`;
}

export function buildRunningHubDefaults(nodes = []) {
  const values = {};
  for (const node of nodes) {
    values[nodeFieldKey(node)] = node.fieldValue ?? "";
  }
  return values;
}

export function nodesWithValues(nodes = [], values = {}) {
  return nodes.map(node => ({
    ...node,
    fieldValue: values[nodeFieldKey(node)] ?? node.fieldValue ?? ""
  }));
}

export function parseWorkflowFieldId(id) {
  const parts = String(id || "").split("-");
  if (parts.length >= 3 && parts[1] === "inputs") {
    return { nodeId: parts[0], fieldName: parts.slice(2).join("-") };
  }
  return { nodeId: parts[0] || "", fieldName: parts.slice(1).join("-") };
}

export function inferRunningHubFieldType(fieldName, value) {
  const lower = String(fieldName || "").toLowerCase();
  if (lower.includes("image")) return "IMAGE";
  if (lower.includes("audio")) return "AUDIO";
  if (lower.includes("video")) return "VIDEO";
  if (typeof value === "number") return Number.isInteger(value) ? "INT" : "FLOAT";
  if (value && typeof value === "object") {
    if (value.kind === "upload" || value.kind === "input-image" || value.url) return "IMAGE";
    return "STRING";
  }
  return "STRING";
}

export function payloadToRunningHubNodes(payload = {}) {
  return Object.entries(payload).map(([id, fieldValue]) => {
    const { nodeId, fieldName } = parseWorkflowFieldId(id);
    return {
      nodeId,
      fieldName,
      fieldType: inferRunningHubFieldType(fieldName, fieldValue),
      fieldValue
    };
  });
}

function normalizeChoice(choice) {
  if (choice == null) return "";
  if (typeof choice === "object") return String(choice.value ?? choice.label ?? choice.name ?? "");
  return String(choice);
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return {
    mimeType,
    base64: match[2],
    blob: new Blob([bytes], { type: mimeType })
  };
}

export function listNodeChoices(node) {
  const data = node.fieldData;
  if (Array.isArray(data)) return data.map(normalizeChoice).filter(Boolean);
  if (Array.isArray(data?.options)) return data.options.map(normalizeChoice).filter(Boolean);
  if (Array.isArray(data?.values)) return data.values.map(normalizeChoice).filter(Boolean);
  if (Array.isArray(data?.choices)) return data.choices.map(normalizeChoice).filter(Boolean);
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.map(normalizeChoice).filter(Boolean);
    } catch {}
  }
  return node.fieldValue ? [String(node.fieldValue)] : [];
}

function rhHeaders(apiKey, extra = {}) {
  const headers = { ...extra };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function readJsonResponse(response) {
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

async function readRunningHubEnvelope(response) {
  const data = await readJsonResponse(response);
  const code = data.code;
  if (code !== 0 && code !== "0") {
    throw new Error(data.msg || data.message || `RunningHub error ${code}`);
  }
  return data;
}

function withSignal(options = {}, signal) {
  return signal ? { ...options, signal } : options;
}

function parseWorkflowPrompt(prompt) {
  if (!prompt) throw new Error("RunningHub did not return workflow prompt");
  if (typeof prompt === "object") return prompt;
  if (typeof prompt !== "string") throw new Error("Invalid workflow JSON from RunningHub");
  try {
    return JSON.parse(prompt);
  } catch {
    try {
      return JSON.parse(JSON.parse(prompt));
    } catch {
      throw new Error("Invalid workflow JSON from RunningHub");
    }
  }
}

export async function getWorkflowJson(apiKey, workflowId, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/api/openapi/getJsonApiFormat`, {
    ...withSignal({}, signal),
    method: "POST",
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify({ apiKey, workflowId })
  });
  const data = await readRunningHubEnvelope(response);
  return parseWorkflowPrompt(data.data?.prompt);
}

export async function getWebappNodes(apiKey, webappId, signal) {
  const query = new URLSearchParams({ apiKey, webappId });
  const response = await fetch(
    `${RUNNINGHUB_BASE}/api/webapp/apiCallDemo?${query}`,
    withSignal({ headers: rhHeaders(apiKey) }, signal)
  );
  const data = await readRunningHubEnvelope(response);
  return data.data?.nodeInfoList || [];
}

export async function uploadBlobToRunningHub(apiKey, blob, filename, mimeType = "image/png", signal) {
  const formData = new FormData();
  formData.append("apiKey", apiKey);
  formData.append("fileType", "input");
  formData.append("file", blob, filename);
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/upload`, {
    ...withSignal({ headers: rhHeaders(apiKey) }, signal),
    method: "POST",
    body: formData
  });
  const data = await readRunningHubEnvelope(response);
  if (!data.data?.fileName) {
    throw new Error(data.msg || "Upload to RunningHub failed");
  }
  return data.data.fileName;
}

export async function uploadToRunningHub(apiKey, upload, signal) {
  const extension = upload.mimeType.includes("jpeg") ? "jpg" : upload.mimeType.split("/")[1] || "png";
  const filename = `apix_ps_${Date.now()}_${upload.index || 0}.${extension}`;
  return uploadBlobToRunningHub(apiKey, upload.blob, filename, upload.mimeType, signal);
}

async function prepareFieldValue(apiKey, node, rawValue, index, signal, onStatus) {
  const fieldType = String(node.fieldType || "").toUpperCase();
  let value = rawValue;
  const isMedia = fieldType === "IMAGE" || fieldType === "AUDIO" || fieldType === "VIDEO";
  if (isMedia) {
    if (value?.kind === "upload" && value.blob) {
      onStatus?.(`Uploading ${node.description || node.fieldName}...`);
      const ext = value.mimeType?.includes("jpeg") ? "jpg" : value.mimeType?.split("/")[1] || "png";
      value = await uploadBlobToRunningHub(
        apiKey,
        value.blob,
        `apix_ps_${Date.now()}_${index}.${ext}`,
        value.mimeType || "image/png",
        signal
      );
    } else if (typeof value === "string" && value.startsWith("data:")) {
      const upload = parseDataUrl(value);
      if (!upload) throw new Error(`Invalid upload for ${node.description || node.fieldName}`);
      onStatus?.(`Uploading ${node.description || node.fieldName}...`);
      value = await uploadToRunningHub(apiKey, { ...upload, index }, signal);
    } else if (typeof value === "string" && value.startsWith("api/")) {
      // already on RunningHub
    } else if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      // remote URL pass-through
    }
  } else if (value === "random_seed") {
    value = String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  } else if (value != null && typeof value !== "string") {
    value = String(value);
  }
  return value ?? "";
}

export async function prepareNodeInfoList(apiKey, nodes, signal, onStatus) {
  const prepared = [];
  let uploadIndex = 0;
  for (const node of nodes) {
    const fieldValue = await prepareFieldValue(
      apiKey,
      node,
      node.fieldValue,
      uploadIndex,
      signal,
      onStatus
    );
    if (node.fieldValue?.kind === "upload" || (typeof node.fieldValue === "string" && node.fieldValue.startsWith("data:"))) {
      uploadIndex += 1;
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
  const {
    workflowId,
    nodeInfoList,
    workflow,
    addMetadata,
    accessPassword,
    usePersonalQueue
  } = options || {};
  const taskOptions = { addMetadata, accessPassword, usePersonalQueue };
  const body = { apiKey };

  if (workflow != null) {
    body.workflowId = String(workflowId || "").trim() || DEFAULT_RH_WF_ID;
    body.workflow = typeof workflow === "string" ? workflow : JSON.stringify(workflow);
    applyWorkflowTaskOptions(body, taskOptions);
  } else {
    body.workflowId = workflowId;
    body.nodeInfoList = nodeInfoList || [];
    applyWorkflowTaskOptions(body, taskOptions);
  }

  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/create`, {
    ...withSignal({}, signal),
    method: "POST",
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify(body)
  });
  const data = await readRunningHubEnvelope(response);
  return data.data || {};
}

export async function submitAiAppTask(apiKey, webappId, nodeInfoList, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/ai-app/run`, {
    ...withSignal({}, signal),
    method: "POST",
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify({ apiKey, webappId, nodeInfoList })
  });
  const data = await readRunningHubEnvelope(response);
  return data.data || {};
}

export async function queryTaskOutputs(apiKey, taskId, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/outputs`, {
    ...withSignal({}, signal),
    method: "POST",
    headers: rhHeaders(apiKey, { "content-type": "application/json" }),
    body: JSON.stringify({ apiKey, taskId })
  });
  return readJsonResponse(response);
}

export function parsePromptTips(promptTips) {
  if (!promptTips) return null;
  try {
    return typeof promptTips === "string" ? JSON.parse(promptTips) : promptTips;
  } catch {
    return null;
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Request cancelled"));
    }, { once: true });
  });
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
    if (signal?.aborted) throw new Error("RunningHub task cancelled");
    const result = await queryTaskOutputs(apiKey, taskId, signal);
    const code = result.code;
    const data = result.data;
    if (code === 0 && data) {
      onStatus?.("Received RunningHub outputs");
      return Array.isArray(data) ? data : [data];
    }
    if (code === 805) {
      const reason = data?.failedReason;
      throw new Error(reason?.exception_message || result.msg || "RunningHub task failed");
    }
    if (code === 804) onStatus?.("RunningHub is processing...");
    else if (code === 813) onStatus?.("RunningHub task is queued...");
    else onStatus?.(result.msg || "Waiting for RunningHub...");
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timeout waiting for RunningHub outputs");
    }
    await delay(pollMs, signal);
  }
}

function coerceWorkflowValue(original, nextValue) {
  if (typeof original === "number") {
    const parsed = Number(nextValue);
    return Number.isFinite(parsed) ? parsed : nextValue;
  }
  if (typeof original === "boolean") {
    return nextValue === true || nextValue === "true";
  }
  return nextValue;
}

export async function buildRunningHubNodeInfoList(request, apiKey, options = {}) {
  const nodes = payloadToRunningHubNodes(request);
  if (!nodes.length) return [];
  return prepareNodeInfoList(apiKey, nodes, options.signal, options.onStatus);
}

export async function buildPatchedRunningHubWorkflow(workflow, request, apiKey, options = {}) {
  const { resolveWorkflowInput } = await import("./comfy.js");
  const patched = typeof structuredClone === "function"
    ? structuredClone(workflow)
    : JSON.parse(JSON.stringify(workflow));
  const nodes = payloadToRunningHubNodes(request);
  if (!nodes.length) return patched;

  const prepared = await prepareNodeInfoList(apiKey, nodes, options.signal, options.onStatus);
  for (const item of prepared) {
    const wfKey = `${item.nodeId}-${item.fieldName}`;
    const { nodeInputs, field } = resolveWorkflowInput(patched, wfKey);
    const original = workflow?.[item.nodeId]?.inputs?.[field];
    nodeInputs[field] = coerceWorkflowValue(original, item.fieldValue);
  }
  return patched;
}

export function outputUrl(output) {
  return output.fileUrl || output.url || output.remoteUrl || "";
}

export function outputFilename(output, index = 0) {
  const url = outputUrl(output);
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").filter(Boolean).pop();
    if (name) return name;
  } catch {}
  const ext = String(output.fileType || "png").replace(/^\./, "") || "png";
  return `runninghub_${Date.now()}_${index}.${ext}`;
}

export async function fetchRunningHubOutputBytes(output, signal) {
  const url = outputUrl(output);
  if (!url) throw new Error("RunningHub output missing fileUrl");
  const response = await fetch(url, withSignal({}, signal));
  if (!response.ok) throw new Error(`RunningHub output fetch failed: ${response.status} ${await response.text()}`);
  return {
    buffer: await response.arrayBuffer(),
    mimeType: response.headers.get("content-type") || "image/png"
  };
}
