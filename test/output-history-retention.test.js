import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStorageService } from "../server/services/storageService.js";

test("saving and deleting history keep records older than the former 500-item limit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "apix-history-retention-"));
  let response;
  const storage = createStorageService({
    resourceRoot: root, dataRoot: root,
    readBody: async req => JSON.stringify(req.body),
    send: (_res, status, body) => { response = { status, body }; },
    hasActiveRuns: () => false
  });
  try {
    await storage.init();
    const items = Array.from({ length: 1205 }, (_, index) => ({
      id: `run-${index}`, createdAt: new Date(2026, 0, 1, 0, 0, -index).toISOString(),
      templateId: "test", values: { prompt: `prompt-${index}` }, outputs: []
    }));
    await storage.writeOutputHistory(items);
    const saved = JSON.parse(await readFile(storage.getPaths().outputHistoryPath, "utf8"));
    expect(saved).toHaveLength(1205);
    expect((await storage.readOutputHistory()).at(-1).values.prompt).toBe("prompt-1204");
    const current = await storage.readOutputHistory();
    await storage.writeOutputHistory([{ id: "new-run", outputs: [] }, ...current]);
    expect(await storage.readOutputHistory()).toHaveLength(1206);
    await storage.handleDeleteOutputHistory({ body: { id: "run-600" } }, {});
    expect(response.status).toBe(200);
    expect(response.body.history).toHaveLength(1205);
    expect(response.body.history.some(item => item.id === "run-600")).toBe(false);
    expect(response.body.history.at(-1).id).toBe("run-1204");
    expect(await storage.readOutputHistory()).toHaveLength(1205);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
