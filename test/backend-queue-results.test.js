import { describe, expect, test } from "vitest";
import {
  collectBackendFormRunIds,
  historyItemToResult,
  pickSettledRunIds
} from "../src/features/app/backendQueueResults.js";

describe("backend queue results", () => {
  const sessions = [
    { runId: "own", runKind: "form", status: "running" },
    { runId: "queue-1", runKind: "form", status: "queued" },
    { runId: "queue-2", runKind: "form", status: "running" },
    { runId: "canvas-1", runKind: "canvas-node", status: "queued" },
    { runId: "done", runKind: "form", status: "success" }
  ];

  test("chỉ theo dõi phiên form đang chạy/chờ không do client thực thi", () => {
    const runIds = collectBackendFormRunIds(sessions, runId => runId === "own");
    expect(runIds).toEqual(["queue-1", "queue-2"]);
  });

  test("theo dõi lệnh MCP đang chạy và lệnh MCP vừa xong sau khi client bắt đầu theo dõi", () => {
    const since = Date.parse("2026-11-04T10:00:00.000Z");
    const external = [
      { runId: "mcp-running", runKind: "mcp", status: "running" },
      { runId: "mcp-new", runKind: "mcp", status: "success", completedAt: "2026-11-04T10:00:05.000Z" },
      { runId: "mcp-old", runKind: "mcp", status: "success", completedAt: "2026-11-04T09:00:00.000Z" },
      { runId: "mcp-error", runKind: "mcp", status: "error", completedAt: "2026-11-04T10:00:05.000Z" }
    ];
    expect(collectBackendFormRunIds(external, null, { externalSince: since })).toEqual(["mcp-running", "mcp-new"]);
  });

  test("nhận runId đã kết thúc hoặc không còn trong run log", () => {
    const settled = pickSettledRunIds(["queue-1", "queue-2", "done", "gone"], sessions);
    expect(settled).toEqual(["done", "gone"]);
  });

  test("dựng result từ history item local", () => {
    const result = historyItemToResult({
      id: "run-1",
      promptId: "p1",
      templateId: "tpl",
      address: "127.0.0.1:8188",
      durationMs: 4200,
      completedAt: "2026-07-28T10:00:00.000Z",
      outputs: [{ url: "/outputs/a.png" }]
    });
    expect(result.runId).toBe("run-1");
    expect(result.outputs).toHaveLength(1);
    expect(result.durationMs).toBe(4200);
    expect(result.historyItem.id).toBe("run-1");
  });

  test("giữ provider và RHcoin của history item RunningHub", () => {
    const result = historyItemToResult({
      id: "run-2",
      provider: "runninghub",
      rhCoins: 12,
      durationMs: 9000,
      result: { runId: "run-2", taskId: "t1", outputs: [] },
      outputs: [{ url: "/outputs/b.png" }]
    });
    expect(result.provider).toBe("runninghub");
    expect(result.rhCoins).toBe(12);
    expect(result.taskId).toBe("t1");
    expect(result.outputs).toHaveLength(1);
  });
});
