let logCounter = 0;

export function createLogEntry(level, message, meta = {}) {
  return {
    id: `${Date.now()}-${++logCounter}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
}

export function describeJob(job) {
  if (!job) return "—";
  if (job.templateId) return job.templateId;
  if (job.webappId) return `RunningHub App ${job.webappId}`;
  if (job.template) return job.template;
  return job.runId?.slice(0, 8) || "Request";
}

export function formatLogTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function formatTechTimestamp(value, { withMs = true } = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const base = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (!withMs) return base;
  return `${base}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatTechDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatTechTimestamp(value)}`;
}

export function formatLevelCode(level) {
  const map = {
    info: "INF",
    success: " OK",
    error: "ERR",
    warn: "WRN",
    queue: "QUE"
  };
  return map[level] || String(level || "INF").slice(0, 3).toUpperCase().padEnd(3, " ");
}

export function formatStatusCode(status) {
  const map = {
    queued: "QUE",
    running: "RUN",
    success: " OK",
    error: "ERR",
    cancelled: "CNL"
  };
  return map[status] || String(status || "—").slice(0, 3).toUpperCase();
}

export function formatDurationMs(ms) {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
}

export function formatRunId(value, short = true) {
  if (!value) return "—";
  return short ? value.slice(0, 8) : value;
}

export function formatProviderCode(provider) {
  if (provider === "runninghub") return "RH";
  return "CU";
}

const RH_TASK_STATUS_LABELS = {
  submit: "Đang gửi task",
  submitted: "Đã tạo task",
  upload: "Đang upload",
  queued: "Đang chờ hàng đợi",
  running: "Đang xử lý trên cloud",
  waiting: "Đang chờ",
  token_wait: "Đang chờ API key rảnh",
  success: "Hoàn tất"
};

export function formatRhTaskStatus(status) {
  if (!status) return "—";
  return RH_TASK_STATUS_LABELS[status] || status;
}

export function formatRunLogDuration(ms) {
  if (!Number.isFinite(ms)) return "—";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function formatSessionDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

const RUN_STATUS_LABELS = {
  queued: "Chờ",
  running: "Đang chạy",
  success: "Hoàn tất",
  error: "Lỗi",
  cancelled: "Đã hủy"
};

export function formatRunSessionStatus(status) {
  if (!status) return "—";
  return RUN_STATUS_LABELS[status] || status;
}

export function formatDurationShort(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function formatOutputTimingLabel({ durationMs, provider, rhCoins } = {}) {
  const time = formatDurationShort(durationMs);
  const coinPart = provider === "runninghub" && rhCoins != null && Number.isFinite(Number(rhCoins))
    ? `${Number(rhCoins)} RHcoin`
    : "";
  if (time && coinPart) return `${time} - ${coinPart}`;
  if (time) return time;
  if (coinPart) return coinPart;
  return "";
}

export function formatRhCoins(value) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : "—";
}

export function sumRhCoins(sessions = []) {
  return sessions.reduce((total, session) => {
    if (session.provider !== "runninghub") return total;
    const coins = Number(session.rhCoins);
    return total + (Number.isFinite(coins) ? coins : 0);
  }, 0);
}

export function filterRunLogSessions(sessions = [], { query = "", status = "all", provider = "all" } = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  return sessions.filter(session => {
    if (status !== "all" && session.status !== status) return false;
    if (provider !== "all" && session.provider !== provider) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      session.runId,
      session.taskId,
      session.jobLabel,
      session.template,
      session.templateId,
      session.webappId,
      session.error,
      session.status,
      session.provider,
      ...(session.logs || []).map(entry => entry.message)
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function formatLogEntryLine(entry) {
  const parts = [
    formatTechTimestamp(entry.timestamp),
    formatLevelCode(entry.level),
    entry.runId ? `run=${formatRunId(entry.runId)}` : "",
    entry.taskId ? `task=${entry.taskId}` : "",
    entry.rhCoins != null ? `coin=${formatRhCoins(entry.rhCoins)}` : "",
    entry.message
  ].filter(Boolean);
  return parts.join(" ");
}

export function exportSessionAsText(session) {
  if (!session) return "";
  const header = [
    `# session=${session.id}`,
    `run_id=${session.runId || "—"}`,
    `status=${session.status || "—"}`,
    `provider=${session.provider || "local"}`,
    `started=${formatTechDateTime(session.startedAt)}`,
    session.completedAt ? `completed=${formatTechDateTime(session.completedAt)}` : "",
    session.durationMs != null ? `duration_ms=${session.durationMs}` : "",
    session.taskId ? `task_id=${session.taskId}` : "",
    session.rhCoins != null ? `rh_coins=${session.rhCoins}` : "",
    session.error ? `error=${session.error}` : ""
  ].filter(Boolean).join("\n");
  const lines = (session.logs || []).map(formatLogEntryLine);
  return `${header}\n${lines.join("\n")}`.trim();
}

export function exportSessionsAsText(sessions = []) {
  return sessions.map(exportSessionAsText).filter(Boolean).join("\n\n");
}

export function exportSessionsAsJson(sessions = []) {
  return JSON.stringify(sessions, null, 2);
}

export function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }
}
