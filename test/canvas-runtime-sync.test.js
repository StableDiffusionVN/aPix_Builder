import { describe, expect, test } from "vitest";
import { STEP_KINDS } from "../src/features/canvas/canvasModel.js";
import {
  findStaleRunLogSessions,
  historyItemToOutputs,
  matchCanvasNodeForSession,
  orphanGraceMsForSession,
  sessionMatchesProject,
  sessionStartedPastGrace
} from "../src/features/canvas/canvasRuntimeSync.js";

describe("canvas runtime sync", () => {
  test("finds running and queued sessions not in skip set", () => {
    const sessions = [
      { runId: "a", status: "running", provider: "local" },
      { runId: "b", status: "queued", provider: "runninghub" },
      { runId: "c", status: "success", provider: "local" },
      { runId: "d", status: "running", provider: "local" }
    ];
    expect(findStaleRunLogSessions(sessions)).toEqual([
      sessions[0],
      sessions[1],
      sessions[3]
    ]);
    expect(findStaleRunLogSessions(sessions, new Set(["a"]))).toEqual([
      sessions[1],
      sessions[3]
    ]);
  });

  test("matches canvas node by stored id or job ref", () => {
    const nodes = [
      { id: "n1", type: "step", data: { kind: STEP_KINDS.LOCAL, ref: "flux" } },
      { id: "n2", type: "step", data: { kind: STEP_KINDS.RH_APP, ref: "123" } }
    ];
    expect(matchCanvasNodeForSession(nodes, { canvasNodeId: "n1" })).toBe("n1");
    expect(matchCanvasNodeForSession(nodes, { template: "flux" })).toBe("n1");
    expect(matchCanvasNodeForSession(nodes, { webappId: "123" })).toBe("n2");
  });

  test("filters sessions by canvas project when present", () => {
    expect(sessionMatchesProject({ canvasProjectId: "p1" }, "p1")).toBe(true);
    expect(sessionMatchesProject({ canvasProjectId: "p1" }, "p2")).toBe(false);
    expect(sessionMatchesProject({ canvasProjectId: "" }, "p2")).toBe(true);
  });

  test("maps output history items to node outputs", () => {
    expect(historyItemToOutputs({
      outputs: [{ url: "/api/output-image?name=a.png", filename: "a.png" }]
    })).toEqual([{ url: "/api/output-image?name=a.png", filename: "a.png" }]);
  });

  test("sessionStartedPastGrace requires startedAt and grace window", () => {
    const recent = { startedAt: new Date().toISOString() };
    expect(sessionStartedPastGrace(recent, 15000)).toBe(false);
    expect(sessionStartedPastGrace({ startedAt: "" }, 15000)).toBe(false);
    const old = { startedAt: new Date(Date.now() - 20000).toISOString() };
    expect(sessionStartedPastGrace(old, 15000)).toBe(true);
  });

  test("orphanGraceMsForSession uses longer grace for RunningHub", () => {
    expect(orphanGraceMsForSession({ provider: "runninghub" })).toBe(60000);
    expect(orphanGraceMsForSession({ provider: "local" })).toBe(15000);
  });
});
