import { flattenInputs, requestPayload } from "../../lib/template.js";
import { buildRunningHubJob, buildRunningHubWfJob } from "../../hooks/useRunningHubExecution.js";
import { incomingEdgesByInput, resolveEffectiveNodeOutputValue, resolveEffectiveImageSource, coerceImageRef, STEP_KINDS, portTypeForUi, toServerImagePath, serverImageFileExists } from "./canvasModel.js";
import { nodeFieldKey } from "../../hooks/useRunningHub.js";

function previewValue(value) {
  if (!value) return "(trống)";
  if (typeof value === "object" && value?.kind === "input-image") {
    return `input-image: ${value.name || value.url || "?"}`;
  }
  if (typeof value !== "string") return String(value);
  if (value.startsWith("data:")) {
    const sizeKb = Math.round(value.length * 0.75 / 1024);
    return `data URL (~${sizeKb} KB)`;
  }
  if (value.length > 120) return `${value.slice(0, 117)}…`;
  return value;
}

function formatRunEvent(message) {
  const data = message?.data || {};
  switch (message?.type) {
    case "rh_task_submitted":
      return `Task RH: ${data.taskId || "?"}`;
    case "rh_task_status":
      return data.label || data.status || "Đang chờ RunningHub…";
    case "output_download_retry":
      return data.label || `Tải lại output (lần ${data.attempt || "?"})`;
    case "run_end":
      return null;
    default:
      return data.label || message?.type || null;
  }
}

function attachRunEvents(runId, onLog) {
  if (!runId || !onLog) return () => {};
  let eventSource = null;
  try {
    eventSource = new EventSource(`/api/run-events?runId=${encodeURIComponent(runId)}`);
    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const text = formatRunEvent(message);
        if (!text) return;
        const level = message.type === "output_download_retry" || message.data?.status === "warning"
          ? "warn"
          : "info";
        onLog(level, text);
      } catch {}
    };
  } catch {}
  return () => {
    try {
      eventSource?.close();
    } catch {}
  };
}

/**
 * Resolve an upstream output URL into a value the server can consume.
 * Server-local paths (/api/output-image, /api/input-image) are passed through
 * so the backend reads from disk instead of receiving multi-MB data URLs.
 */
function normalizeServerImageRef(url) {
  return toServerImagePath(url);
}

async function resolveUpstreamValue(value, onLog) {
  const url = coerceImageRef(value);
  if (!url) return "";
  if (url.startsWith("data:")) return url;

  const serverRef = normalizeServerImageRef(url);
  if (serverRef) {
    onLog?.("info", `Truyền ref server-local: ${previewValue(serverRef)}`);
    return serverRef;
  }

  if (url.startsWith("/")) {
    onLog?.("info", `Truyền path local: ${previewValue(url)}`);
    return url;
  }

  if (/^https?:\/\//i.test(url)) {
    onLog?.("info", `Ảnh remote (server sẽ tải): ${previewValue(url)}`);
    return url;
  }

  return url;
}

/** Merge a node's own values with typed upstream outputs resolved from edges. */
async function resolveInputValues(node, nodes, edges, onLog) {
  const values = { ...(node.data.values || {}) };
  const incoming = incomingEdgesByInput(node.id, edges);
  for (const [valueKey, edge] of Object.entries(incoming)) {
    const source = nodes.find(item => item.id === edge.source);
    if (!source) {
      onLog?.("warn", `Input "${valueKey}": không tìm thấy node nguồn ${edge.source}`);
      continue;
    }
    const port = (node.data?.ports?.inputs || []).find(item => item.valueKey === valueKey);
    const type = port?.type || portTypeForUi(port?.uiType);
    const upstreamValue = resolveEffectiveNodeOutputValue(port, edge, nodes, edges);
    const valueMissing = upstreamValue === undefined || upstreamValue === null || upstreamValue === "";
    if (valueMissing) {
      const effective = resolveEffectiveImageSource(edge.source, edge.sourceHandle, nodes, edges);
      const labelSource = effective?.node || source;
      const sourceName = labelSource.data?.name || labelSource.id;
      if (type === "image") {
        const hint = labelSource.type === "step"
          ? ` — chạy node "${sourceName}" trước hoặc chạy pipeline`
          : ` — node nguồn "${sourceName}" chưa có ảnh`;
        throw new Error(`Input ảnh "${port?.label || valueKey}" thiếu ảnh từ "${sourceName}"${hint}`);
      }
      onLog?.("warn", `Input "${valueKey}": node "${sourceName}" chưa có output`);
      continue;
    }
    const effective = resolveEffectiveImageSource(edge.source, edge.sourceHandle, nodes, edges);
    const labelSource = effective?.node || source;
    onLog?.("info", `Input "${valueKey}" ← "${labelSource.data?.name || labelSource.id}": ${previewValue(upstreamValue)}`);
    if (type !== "image") {
      values[valueKey] = upstreamValue;
      continue;
    }
    try {
      values[valueKey] = await resolveUpstreamValue(upstreamValue, onLog);
    } catch (err) {
      onLog?.("warn", `Input "${valueKey}": lỗi resolve — ${err.message}`);
      values[valueKey] = upstreamValue;
    }
  }
  return values;
}

function buildCanvasRunningHubJob({ runId, rhAuth, webappId, nodes, values }) {
  const job = buildRunningHubJob({
    runId,
    ...rhAuth,
    webappId,
    nodes,
    values
  });
  return {
    ...job,
    nodes: (nodes || []).map(tpl => {
      const key = nodeFieldKey(tpl);
      const isImage = String(tpl.fieldType || "").toLowerCase() === "image";
      const raw = values?.[key];
      return {
        nodeId: tpl.nodeId,
        fieldName: tpl.fieldName,
        fieldType: tpl.fieldType,
        fieldValue: isImage ? coerceImageRef(raw) : (raw ?? tpl.fieldValue ?? "")
      };
    })
  };
}

function validateResolvedLinkedImages(node, values, edges, onLog) {
  const incoming = incomingEdgesByInput(node.id, edges);
  for (const port of node.data?.ports?.inputs || []) {
    const type = port.type || portTypeForUi(port.uiType);
    if (type !== "image") continue;
    if (!incoming[port.valueKey]) continue;
    const resolved = coerceImageRef(values[port.valueKey]);
    if (!resolved) {
      throw new Error(`Input ảnh "${port.label}" trống — node upstream chưa tạo output hợp lệ`);
    }
    values[port.valueKey] = resolved;
    onLog?.("info", `Input "${port.valueKey}" resolved → ${previewValue(resolved)}`);
  }
}

async function validateResolvedLinkedImagesAsync(node, values, edges, onLog) {
  validateResolvedLinkedImages(node, values, edges, onLog);
  const incoming = incomingEdgesByInput(node.id, edges);
  for (const port of node.data?.ports?.inputs || []) {
    const type = port.type || portTypeForUi(port.uiType);
    if (type !== "image") continue;
    if (!incoming[port.valueKey]) continue;
    const resolved = values[port.valueKey];
    const serverRef = normalizeServerImageRef(resolved);
    if (!serverRef) continue;
    const exists = await serverImageFileExists(serverRef);
    if (exists === true) {
      onLog?.("info", `Input "${port.valueKey}": xác nhận file tồn tại trên server`);
      continue;
    }
    if (exists === false) {
      throw new Error(
        `Input ảnh "${port.label}": file không tồn tại trên server (404) — chạy lại node upstream`
      );
    }
    onLog?.("warn", `Input "${port.valueKey}": không kiểm tra được file — tiếp tục với cache URL`);
  }
}

function parseOutputs(data) {
  const fromHistory = data?.historyItem?.outputs;
  const fromResult = data?.outputs || data?.result?.outputs;
  const outputs = Array.isArray(fromHistory) ? fromHistory : Array.isArray(fromResult) ? fromResult : [];
  return outputs
    .map(output => ({ url: output.url || output.src || "", filename: output.filename }))
    .filter(output => output.url);
}

async function postJsonWithEvents(endpoint, body, onLog, signal) {
  const runId = body.runId;
  const detach = attachRunEvents(runId, onLog);
  onLog?.("info", `POST ${endpoint} (runId: ${runId.slice(0, 8)}…)`);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.msg || `HTTP ${response.status}`);
    }
    if (data.taskId) onLog?.("success", `Task hoàn tất: ${data.taskId}`);
    else onLog?.("success", `Phản hồi OK từ ${endpoint}`);
    return data;
  } finally {
    detach();
  }
}

function summarizeRhAppJob(job) {
  const filled = (job.nodes || [])
    .filter(node => node.fieldValue !== "" && node.fieldValue != null)
    .map(node => `${node.fieldName}=${previewValue(node.fieldValue)}`);
  return `webappId=${job.webappId}, fields=[${filled.join(", ") || "—"}]`;
}

function summarizeRhWfJob(job, values) {
  const filled = Object.entries(values || {})
    .filter(([, value]) => value !== "" && value != null)
    .map(([key, value]) => `${key}=${previewValue(value)}`);
  return `templateId=${job.templateId}, fields=[${filled.join(", ") || "—"}]`;
}

/** Pass-through outputs when a step node is bypassed. */
export async function bypassCanvasNode({ node, nodes, edges, onLog }) {
  const values = await resolveInputValues(node, nodes, edges, onLog);
  const inputs = node.data?.ports?.inputs || [];
  let url = "";
  for (const port of inputs) {
    const type = port.type || "image";
    if (type !== "image") continue;
    const raw = values[port.valueKey];
    if (!raw) continue;
    url = typeof raw === "string" ? raw : (raw?.url || "");
    if (url) break;
  }
  onLog?.("info", `Bypass: ${node.data?.name || node.id}${url ? "" : " (không có ảnh input)"}`);
  const outputs = url ? [{ url, key: "main", filename: "bypass" }] : [];
  return { outputs, raw: {}, runId: crypto.randomUUID() };
}

/**
 * Execute a single canvas node, injecting upstream outputs into image inputs.
 * @returns {Promise<{outputs: Array<{url:string, filename?:string}>, raw:object}>}
 */
export async function runCanvasNode({ node, nodes, edges, rhAuth, onLog, runId: runIdInput, signal }) {
  const log = (level, message) => onLog?.(level, message);
  const kind = node.data.kind;
  const name = node.data.name || node.id;

  log("info", `── Bắt đầu: ${name} (${kind}) ──`);
  const values = await resolveInputValues(node, nodes, edges, log);
  await validateResolvedLinkedImagesAsync(node, values, edges, log);
  const runId = runIdInput || crypto.randomUUID();

  if (kind === STEP_KINDS.LOCAL) {
    const items = flattenInputs(node.data.config?.input || {});
    const payload = {
      runId,
      template: node.data.ref,
      address: node.data.serverAddress || values.__address || undefined,
      values: requestPayload(items, values),
      queuedAt: new Date().toISOString()
    };
    log("info", `ComfyUI template=${payload.template}`);
    const data = await postJsonWithEvents("/api/run", payload, log, signal);
    const outputs = parseOutputs(data);
    log("success", `Xong ${name}: ${outputs.length} output`);
    return { outputs, raw: data, runId };
  }

  if (kind === STEP_KINDS.RH_WF) {
    if (!rhAuth?.apiKey) {
      log("error", "Thiếu RunningHub API key — vào Settings để nhập lại");
      throw new Error("RunningHub API key required");
    }
    const job = buildRunningHubWfJob({ runId, ...rhAuth, templateId: node.data.ref, values });
    log("info", summarizeRhWfJob(job, values));
    const data = await postJsonWithEvents("/api/runninghub-wf/run", job, log, signal);
    const outputs = parseOutputs(data);
    log("success", `Xong ${name}: ${outputs.length} output`);
    return { outputs, raw: data, runId };
  }

  if (kind === STEP_KINDS.RH_APP) {
    if (!rhAuth?.apiKey) {
      log("error", "Thiếu RunningHub API key — vào Settings để nhập lại");
      throw new Error("RunningHub API key required");
    }
    const job = buildCanvasRunningHubJob({
      runId,
      rhAuth,
      webappId: String(node.data.ref).trim(),
      nodes: node.data.nodes || [],
      values
    });
    log("info", summarizeRhAppJob(job));
    const data = await postJsonWithEvents("/api/runninghub/run", job, log, signal);
    const outputs = parseOutputs(data);
    log("success", `Xong ${name}: ${outputs.length} output`);
    return { outputs, raw: data, runId };
  }

  throw new Error(`Unknown step kind: ${kind}`);
}
