import { describe, expect, test, vi } from "vitest";
import { createSerialProjectSaver } from "../src/features/canvas/canvasProjectPersistence.js";

const flushAsync = () => new Promise(resolve => setImmediate(resolve));

describe("canvas project persistence queue", () => {
  test("serializes saves and preserves project ids", async () => {
    const release = [];
    const calls = [];
    const saver = createSerialProjectSaver(payload => new Promise(resolve => {
      calls.push(payload);
      release.push(resolve);
    }));

    const first = saver.enqueue({ projectId: "p_1", nodes: [{ id: "old" }] });
    const second = saver.enqueue({ projectId: "p_2", nodes: [{ id: "new" }] });
    await flushAsync();
    expect(calls.map(call => call.projectId)).toEqual(["p_1"]);
    expect(saver.isLatest(first.sequence)).toBe(false);
    expect(saver.isLatest(second.sequence)).toBe(true);

    release.shift()({ ok: true });
    await first.promise;
    await flushAsync();
    expect(calls.map(call => call.projectId)).toEqual(["p_1", "p_2"]);
    release.shift()({ ok: true });
    await second.promise;
  });

  test("continues after a failed save", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce({ ok: true });
    const saver = createSerialProjectSaver(save);
    const failed = saver.enqueue({ projectId: "p_1" });
    const recovered = saver.enqueue({ projectId: "p_1" });

    await expect(failed.promise).rejects.toThrow("disk full");
    await expect(recovered.promise).resolves.toEqual({ ok: true });
    expect(save).toHaveBeenCalledTimes(2);
  });
});
