import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

export function createBackendRunQueueStore({ filePath }) {
  let snapshot = normalizeBackendRunQueueSnapshot();
  let persistChain = Promise.resolve();

  async function load() {
    try {
      snapshot = normalizeBackendRunQueueSnapshot(JSON.parse(await readFile(filePath, "utf8")));
    } catch {
      snapshot = normalizeBackendRunQueueSnapshot();
    }
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
    persistChain = persistChain.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    }).catch(() => {});
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
