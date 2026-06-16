const MAX_SESSIONS = 150;
const MAX_LOGS_PER_SESSION = 500;
let logCounter = 0;

/** In-memory run log — cleared when the server process restarts. */
let sessions = [];
let initialized = false;

function trimSessionLogs(logs = []) {
  if (logs.length <= MAX_LOGS_PER_SESSION) return logs;
  return logs.slice(logs.length - MAX_LOGS_PER_SESSION);
}

function normalizeSessions(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(item => item && item.id && item.runId)
    .slice(0, MAX_SESSIONS)
    .map(session => ({
      ...session,
      logs: trimSessionLogs(Array.isArray(session.logs) ? session.logs : [])
    }));
}

function commit(nextSessions) {
  sessions = normalizeSessions(nextSessions);
  return snapshot();
}

function createLogEntry(level, message, meta = {}) {
  return {
    id: `${Date.now()}-${++logCounter}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
}

function describeJob(job) {
  if (!job) return "—";
  if (job.templateId) return job.templateId;
  if (job.webappId) return `RunningHub App ${job.webappId}`;
  if (job.template) return job.template;
  return job.runId?.slice(0, 8) || "Request";
}

function snapshot() {
  return sessions;
}

export async function initRunLogStore() {
  if (initialized) return snapshot();
  sessions = [];
  initialized = true;
  return snapshot();
}

export function getRunLogSessions() {
  return snapshot();
}

export function startRunLogSession(job, meta = {}) {
  if (!job?.runId) return snapshot();
  const session = {
    id: job.runId,
    runId: job.runId,
    jobLabel: describeJob(job),
    provider: meta.provider || "local",
    status: meta.status || "running",
    startedAt: meta.startedAt || job.queuedAt || new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    rhCoins: null,
    taskId: meta.taskId || "",
    template: job.template || "",
    templateId: job.templateId || "",
    webappId: job.webappId || "",
    canvasNodeId: meta.canvasNodeId || "",
    canvasProjectId: meta.canvasProjectId || "",
    runKind: meta.runKind || "",
    error: "",
    logs: []
  };
  return commit([session, ...sessions.filter(item => item.runId !== job.runId)]);
}

export function updateRunLogSession(runId, patch = {}) {
  if (!runId) return snapshot();
  return commit(sessions.map(session => (
    session.runId === runId ? { ...session, ...patch } : session
  )));
}

export function appendRunLog(runId, level, message, meta = {}) {
  if (!runId) return snapshot();
  const existing = sessions.find(session => session.runId === runId);
  const last = existing?.logs?.[existing.logs.length - 1];
  if (last && last.message === message && last.level === level) {
    const lastAt = new Date(last.timestamp).getTime();
    if (Date.now() - lastAt < 2500) return snapshot();
  }
  const entry = createLogEntry(level, message, { runId, ...meta });
  const exists = sessions.some(session => session.runId === runId);
  if (exists) {
    return commit(sessions.map(session => {
      if (session.runId !== runId) return session;
      return {
        ...session,
        taskId: meta.taskId || session.taskId,
        rhCoins: meta.rhCoins ?? session.rhCoins,
        logs: trimSessionLogs([...session.logs, entry])
      };
    }));
  }
  return commit([{
    id: runId,
    runId,
    jobLabel: meta.jobLabel || runId.slice(0, 8),
    provider: meta.provider || "local",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    rhCoins: null,
    taskId: meta.taskId || "",
    template: "",
    templateId: "",
    webappId: "",
    canvasNodeId: "",
    canvasProjectId: "",
    runKind: "",
    error: "",
    logs: [entry]
  }, ...sessions]);
}

export function appendRunLogs(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return snapshot();
  let next = snapshot();
  for (const entry of entries) {
    if (!entry?.runId) continue;
    next = appendRunLog(entry.runId, entry.level, entry.message, entry.meta || {});
  }
  return next;
}

export function endRunLogSession(runId, status, meta = {}) {
  if (!runId) return snapshot();
  const completedAt = new Date().toISOString();
  return commit(sessions.map(session => {
    if (session.runId !== runId) return session;
    return {
      ...session,
      status,
      completedAt,
      durationMs: meta.durationMs ?? session.durationMs,
      taskId: meta.taskId || session.taskId,
      rhCoins: meta.rhCoins ?? session.rhCoins,
      error: meta.error || session.error || ""
    };
  }));
}

export function endRunLogSessions(runIds = [], status = "cancelled", meta = {}) {
  const idSet = new Set(runIds.filter(Boolean));
  if (!idSet.size) return snapshot();
  const completedAt = new Date().toISOString();
  return commit(sessions.map(session => {
    if (!idSet.has(session.runId)) return session;
    return {
      ...session,
      status,
      completedAt,
      durationMs: meta.durationMs ?? session.durationMs,
      taskId: meta.taskId || session.taskId,
      rhCoins: meta.rhCoins ?? session.rhCoins,
      error: meta.error || session.error || ""
    };
  }));
}

export function deleteRunLogSession(sessionId) {
  if (!sessionId) return snapshot();
  return commit(sessions.filter(session => session.id !== sessionId));
}

export function clearRunLogSessions() {
  return commit([]);
}
