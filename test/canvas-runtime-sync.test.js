import { describe, expect, test } from "vitest";
import { STEP_KINDS } from "../src/features/canvas/canvasModel.js";
import {
  countCanvasQueuedJobs,
  countCanvasRunActivity,
  findCanvasQueuedSessions,
  findStaleRunLogSessions,
  historyItemToOutputs,
  matchCanvasNodeForSession,
  orphanGraceMsForSession,
  outputHistoryByCanvasNodeId,
  outputHistoryByRunId,
  sessionMatchesProject,
  sessionStartedPastGrace
} from "../src/features/canvas/canvasRuntimeSync.js";

describe("canvas runtime sync", () => {
  test("counts mirrored frontend and backend queue jobs only once", () => {
    expect(countCanvasRunActivity({
      canvasRunning: true,
      activeRunId: "run-active",
      queuedJobs: [{ runId: "run-queued" }],
      sessions: [
        { runId: "run-active", status: "running" },
        { runId: "run-queued", status: "queued" }
      ]
    })).toBe(2);
  });

  test("includes backend-only queued jobs in the activity count", () => {
    expect(countCanvasRunActivity({
      queuedJobs: [{ runId: "run-local-queue" }],
      sessions: [
        { runId: "run-local-queue", status: "queued" },
        { runId: "run-backend-queue", status: "queued" },
        { runId: "run-finished", status: "success" }
      ]
    })).toBe(2);
  });

  test("scopes canvas activity count to the active project and canvas run kinds", () => {
    expect(countCanvasRunActivity({
      queuedJobs: [{ runId: "run-local-queue" }],
      sessions: [
        { runId: "run-local-queue", status: "queued", runKind: "canvas-node", canvasProjectId: "p1" },
        { runId: "run-other-project", status: "queued", runKind: "canvas-node", canvasProjectId: "p2" },
        { runId: "run-form", status: "queued", runKind: "form" }
      ],
      projectId: "p1"
    })).toBe(1);
  });

  test("counts mirrored canvas queue jobs once", () => {
    expect(countCanvasQueuedJobs({
      queuedJobs: [{ runId: "run-a" }],
      sessions: [
        { runId: "run-a", status: "queued", runKind: "canvas-node", canvasProjectId: "p1" },
        { runId: "run-b", status: "queued", runKind: "canvas-graph", canvasProjectId: "p1" }
      ],
      projectId: "p1"
    })).toBe(2);
  });

  test("finds queued canvas sessions for a project", () => {
    const sessions = [
      { runId: "a", status: "queued", runKind: "canvas-node", canvasProjectId: "p1" },
      { runId: "b", status: "queued", runKind: "canvas-graph", canvasProjectId: "p1" },
      { runId: "c", status: "queued", runKind: "form" }
    ];
    expect(findCanvasQueuedSessions(sessions, { projectId: "p1" }).map(session => session.runId)).toEqual(["a", "b"]);
  });

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

  test("indexes individual runs nested in a grouped canvas history item", () => {
    const first = { id: "run-1", outputs: [{ url: "/one.png" }] };
    const second = { id: "run-2", outputs: [{ url: "/two.png" }] };
    const byRunId = outputHistoryByRunId([{ id: "group-1", runs: [first, second] }]);

    expect(byRunId.get("run-1")).toBe(first);
    expect(byRunId.get("run-2")).toBe(second);
    expect(byRunId.has("group-1")).toBe(false);
  });

  test("indexes the latest completed output for each canvas node", () => {
    const oldRun = {
      id: "run-old",
      canvasNodeId: "node-1",
      canvasProjectId: "project-1",
      completedAt: "2026-06-19T00:01:00.000Z",
      outputs: [{ url: "/old.png" }]
    };
    const latestRun = {
      id: "run-new",
      canvasNodeId: "node-1",
      canvasProjectId: "project-1",
      completedAt: "2026-06-19T00:02:00.000Z",
      outputs: [{ url: "/new.png" }]
    };
    const otherProject = {
      id: "run-other",
      canvasNodeId: "node-2",
      canvasProjectId: "project-2",
      completedAt: "2026-06-19T00:03:00.000Z",
      outputs: [{ url: "/other.png" }]
    };

    const byNodeId = outputHistoryByCanvasNodeId([
      { id: "group-new", runs: [latestRun, otherProject] },
      { id: "group-old", runs: [oldRun] }
    ], "project-1");

    expect(byNodeId.get("node-1")).toBe(latestRun);
    expect(byNodeId.has("node-2")).toBe(false);
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
