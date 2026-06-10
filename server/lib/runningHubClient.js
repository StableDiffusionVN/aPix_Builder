import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDataUrl } from "./comfyClient.js";

export const RUNNINGHUB_HOST = "www.runninghub.ai";
export const RUNNINGHUB_BASE = `https://${RUNNINGHUB_HOST}`;

const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function rhHeaders(extra = {}) {
  return { Host: RUNNINGHUB_HOST, ...extra };
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

export async function getWebappNodes(apiKey, webappId, signal) {
  const query = new URLSearchParams({ apiKey, webappId });
  const response = await fetch(`${RUNNINGHUB_BASE}/api/webapp/apiCallDemo?${query}`, {
    signal,
    headers: rhHeaders()
  });
  const data = await readJsonResponse(response);
  if (data.code !== 0) {
    throw new Error(data.msg || "Không lấy được nodeInfoList từ RunningHub");
  }
  return data.data?.nodeInfoList || [];
}

export async function uploadToRunningHub(apiKey, buffer, filename, mimeType = "image/png", signal) {
  const formData = new FormData();
  formData.append("apiKey", apiKey);
  formData.append("fileType", "input");
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/upload`, {
    method: "POST",
    headers: rhHeaders(),
    body: formData,
    signal
  });
  const data = await readJsonResponse(response);
  if (data.code !== 0 || !data.data?.fileName) {
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

export async function submitAiAppTask(apiKey, webappId, nodeInfoList, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/ai-app/run`, {
    method: "POST",
    signal,
    headers: rhHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ apiKey, webappId, nodeInfoList })
  });
  const data = await readJsonResponse(response);
  if (data.code !== 0) {
    throw new Error(data.msg || "Gửi task RunningHub thất bại");
  }
  return data.data || {};
}

export async function queryTaskOutputs(apiKey, taskId, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}/task/openapi/outputs`, {
    method: "POST",
    signal,
    headers: rhHeaders({ "content-type": "application/json" }),
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

    if (code === 0 && data) {
      onStatus?.({ type: "success", label: "Đã nhận kết quả từ RunningHub" });
      return Array.isArray(data) ? data : [data];
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
