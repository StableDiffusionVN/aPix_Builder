import { describe, expect, test } from "vitest";
import {
  decorateCanvasHistoryItem,
  mergeCanvasHistoryItem,
  normalizeCanvasHistory
} from "../server/lib/canvasHistory.js";

function run(id, output, completedAt, nodeId) {
  return decorateCanvasHistoryItem({
    id,
    submittedAt: "2026-06-19T00:00:00.000Z",
    completedAt,
    durationMs: 1000,
    outputs: [{ url: `/api/output-image?name=${output}`, filename: output }],
    result: { runId: id, outputs: [] }
  }, {
    canvasRunGroupId: "canvas-group-1",
    canvasProjectId: "project-1",
    canvasNodeId: nodeId,
    canvasNodeName: `Node ${nodeId}`,
    canvasGroupLabel: "Canvas · Project 1"
  });
}

describe("canvas history groups", () => {
  test("merges node runs into one result with ordered outputs", () => {
    const first = run("run-1", "one.png", "2026-06-19T00:00:01.000Z", "n1");
    const second = run("run-2", "two.png", "2026-06-19T00:00:03.000Z", "n2");
    const afterFirst = mergeCanvasHistoryItem([], first);
    const history = mergeCanvasHistoryItem(afterFirst, second);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: "canvas-group-1",
      isCanvasGroup: true,
      templateName: "Canvas · Project 1",
      canvasProjectId: "project-1",
      durationMs: 3000
    });
    expect(history[0].runs.map(item => item.id)).toEqual(["run-1", "run-2"]);
    expect(history[0].outputs.map(output => output.filename)).toEqual(["one.png", "two.png"]);
    expect(history[0].outputs.map(output => output.canvasNodeId)).toEqual(["n1", "n2"]);
  });

  test("replaces a repeated run instead of duplicating its images", () => {
    const first = run("run-1", "one.png", "2026-06-19T00:00:01.000Z", "n1");
    const replacement = run("run-1", "new.png", "2026-06-19T00:00:02.000Z", "n1");
    const history = mergeCanvasHistoryItem(mergeCanvasHistoryItem([], first), replacement);

    expect(history[0].runs).toHaveLength(1);
    expect(history[0].outputs.map(output => output.filename)).toEqual(["new.png"]);
  });

  test("groups legacy canvas image batches in batch order", () => {
    const legacy = [
      { id: "canvas-q-100-1-b2", templateName: "Faceswap", outputs: [{ url: "/two.png" }] },
      { id: "other", outputs: [{ url: "/other.png" }] },
      { id: "canvas-q-100-1-b1", templateName: "Faceswap", outputs: [{ url: "/one.png" }] }
    ];
    const normalized = normalizeCanvasHistory(legacy);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      id: "canvas-q-100-1",
      isCanvasGroup: true,
      templateName: "Canvas · Faceswap"
    });
    expect(normalized[0].runs.map(item => item.id)).toEqual([
      "canvas-q-100-1-b1",
      "canvas-q-100-1-b2"
    ]);
    expect(normalized[0].outputs.map(output => output.url)).toEqual(["/one.png", "/two.png"]);
  });
});
