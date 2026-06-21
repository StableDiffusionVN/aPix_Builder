import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  createBackendRunQueueStore,
  normalizeBackendRunQueueSnapshot
} from "../server/lib/backendRunQueueStore.js";

describe("backendRunQueueStore", () => {
  /** @type {string[]} */
  const tempDirs = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  });

  async function createTempStore() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "apix-queue-"));
    tempDirs.push(dir);
    return createBackendRunQueueStore({
      filePath: path.join(dir, "backend-run-queue.json")
    });
  }

  test("normalizes pending and current jobs", () => {
    const snapshot = normalizeBackendRunQueueSnapshot({
      pending: [{ runId: "a", endpoint: "/api/run", body: { template: "demo" } }],
      current: { id: "b", runId: "b", endpoint: "/api/runninghub/run" }
    });
    expect(snapshot.pending).toHaveLength(1);
    expect(snapshot.pending[0].body.runId).toBe("a");
    expect(snapshot.current?.runId).toBe("b");
  });

  test("persists and reloads queue state", async () => {
    const store = await createTempStore();
    store.setSnapshot({
      pending: [{
        runId: "queued-1",
        endpoint: "/api/run",
        body: { runId: "queued-1", template: "demo" },
        meta: { runKind: "form" },
        queuedAt: "2026-06-21T00:00:00.000Z"
      }],
      current: null
    });
    await store.persist();
    const loaded = await store.load();
    expect(loaded.pending).toHaveLength(1);
    expect(loaded.pending[0].meta.runKind).toBe("form");

    const raw = JSON.parse(await readFile(store.filePath, "utf8"));
    expect(raw.version).toBe(1);
    expect(raw.pending[0].runId).toBe("queued-1");
  });
});
