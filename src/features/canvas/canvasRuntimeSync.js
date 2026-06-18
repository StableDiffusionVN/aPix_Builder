import { STEP_KINDS, beginNodeExecutionPatch, nodeRunCachePatch } from "./canvasModel.js";

export const ACTIVE_RUN_LOG_STATUSES = new Set(["running", "queued"]);

export function findStaleRunLogSessions(sessions = [], skipRunIds = new Set()) {
  return sessions.filter(session => (
    session?.runId
    && ACTIVE_RUN_LOG_STATUSES.has(session.status)
    && !skipRunIds.has(session.runId)
  ));
}

/** @returns {Promise<{ runs: object[], ok: boolean }>} */
export async function fetchActiveRuns() {
  try {
    const response = await fetch("/api/active-runs");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { runs: [], ok: false };
    return {
      runs: Array.isArray(data.runs) ? data.runs : [],
      ok: true
    };
  } catch {
    return { runs: [], ok: false };
  }
}

export function sessionStartedPastGrace(session, graceMs = 15000) {
  const startedAt = session?.startedAt ? new Date(session.startedAt).getTime() : 0;
  if (!startedAt) return false;
  return Date.now() - startedAt > graceMs;
}

export function orphanGraceMsForSession(session) {
  if (session?.provider === "runninghub") return 60000;
  return 15000;
}

export async function fetchOutputHistoryByRunId() {
  try {
    const response = await fetch("/api/output-history");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return new Map();
    const history = Array.isArray(data.history) ? data.history : [];
    return new Map(history.filter(item => item?.id).map(item => [item.id, item]));
  } catch {
    return new Map();
  }
}

export async function cancelServerRun(session) {
  if (!session?.runId) return;
  const endpoint = session.provider === "local" ? "/api/cancel" : "/api/runninghub/cancel";
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: session.runId })
    });
  } catch {}
}

export function matchCanvasNodeForSession(nodes = [], session) {
  if (!session) return null;
  if (session.canvasNodeId) {
    const matched = nodes.find(node => node.id === session.canvasNodeId);
    if (matched?.type === "step") return matched.id;
  }
  for (const node of nodes) {
    if (node.type !== "step") continue;
    const kind = node.data?.kind;
    if (kind === STEP_KINDS.LOCAL && session.template && node.data.ref === session.template) return node.id;
    if (kind === STEP_KINDS.RH_WF && session.templateId && node.data.ref === session.templateId) return node.id;
    if (kind === STEP_KINDS.RH_APP && session.webappId && String(node.data.ref) === String(session.webappId)) {
      return node.id;
    }
  }
  return null;
}

export function historyItemToOutputs(historyItem) {
  return (historyItem?.outputs || [])
    .map(output => ({ url: output.url || output.src || "", filename: output.filename }))
    .filter(output => output.url);
}

export function buildNodeSuccessPatch(session, historyItem) {
  const outputs = historyItemToOutputs(historyItem);
  return nodeRunCachePatch(outputs, session.runId, {
    durationMs: historyItem?.durationMs ?? null,
    rhCoins: historyItem?.rhCoins ?? null,
    provider: session.provider || historyItem?.provider || "local"
  });
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

export function attachRunEventWatcher(runId, { onLog, onEnd, onDisconnect }) {
  if (!runId) return () => {};
  let eventSource = null;
  let ended = false;
  const finish = (message) => {
    if (ended) return;
    ended = true;
    onEnd?.(message);
  };
  try {
    eventSource = new EventSource(`/api/run-events?runId=${encodeURIComponent(runId)}`);
    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "run_end") {
          finish(message);
          return;
        }
        const text = formatRunEvent(message);
        if (!text) return;
        const level = message.type === "output_download_retry" || message.data?.status === "warning"
          ? "warn"
          : "info";
        onLog?.(level, text, message);
      } catch {}
    };
    eventSource.onerror = () => {
      onDisconnect?.();
    };
  } catch {}
  return () => {
    try {
      eventSource?.close();
    } catch {}
  };
}

export function sessionMatchesProject(session, projectId) {
  if (!session?.canvasProjectId) return true;
  return session.canvasProjectId === projectId;
}
