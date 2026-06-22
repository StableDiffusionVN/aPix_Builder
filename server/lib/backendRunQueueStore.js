import { atomicWriteFile, readJsonFileWithBackup } from "./atomicFile.js";

const STORE_VERSION = 1;

function normalizeJob(job) {
  if (!job || typeof job !== "object") return null;
  const runId = String(job.runId || job.id || job.body?.runId || "").trim();
  if (!runId) return null;
  return {
    id: String(job.id || runId),
    runId,
    endpoint: String(job.endpoint || ""),
    body: job.body && typeof job.body === "object" ? { ...job.body, runId } : { runId },
    meta: job.meta && typeof job.meta === "object" ? job.meta : {},
    queuedAt: job.queuedAt || new Date().toISOString()
  };
}

export function normalizeBackendRunQueueSnapshot(raw = {}) {
  const pending = Array.isArray(raw.pending)
    ? raw.pending.map(normalizeJob).filter(Boolean)
    : [];
  const current = normalizeJob(raw.current);
  return {
    version: STORE_VERSION,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    pending,
    current
  };
}

export function backendQueueHasRunId(runId, {
  pending = [],
  current = null,
  activeRunIds = [],
  sessions = []
} = {}) {
  const id = String(runId || "").trim();
  if (!id) return false;
  return pending.some(job => String(job?.body?.runId || job?.runId || "") === id)
    || String(current?.body?.runId || current?.runId || "") === id
    || activeRunIds.some(activeId => String(activeId) === id)
    || sessions.some(session => String(session?.runId || "") === id);
}

export function createBackendRunQueueStore({ filePath }) {
  let snapshot = normalizeBackendRunQueueSnapshot();
  let persistChain = Promise.resolve();

  async function load() {
    const loaded = await readJsonFileWithBackup(filePath);
    snapshot = normalizeBackendRunQueueSnapshot(loaded.value || {});
    return snapshot;
  }

  function getSnapshot() {
    return snapshot;
  }

  function setSnapshot(next = {}) {
    snapshot = normalizeBackendRunQueueSnapshot({
      ...next,
      updatedAt: new Date().toISOString()
    });
    return snapshot;
  }

  function persist() {
    const payload = snapshot;
    persistChain = persistChain.catch(() => {}).then(async () => {
      await atomicWriteFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
    });
    return persistChain;
  }

  return {
    filePath,
    load,
    getSnapshot,
    setSnapshot,
    persist
  };
}
