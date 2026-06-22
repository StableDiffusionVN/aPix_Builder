import { afterEach, describe, expect, test, vi } from "vitest";
import {
  RhApiError,
  RhResourceAccessExhaustedError,
  submitAiAppTask,
  submitRhTaskWhenReady
} from "../server/lib/runningHubClient.js";
import { withRhTokenFailover } from "../server/lib/rhTokenFailover.js";
import { createRunningHubFetchMock } from "./helpers/mockRunningHubFetch.js";

describe("RunningHub integration (mock fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("submitAiAppTask returns taskId from mock envelope", async () => {
    vi.stubGlobal("fetch", createRunningHubFetchMock({
      aiAppRunByKey: {
        "key-ok": { data: { taskId: "rh-task-42" } }
      }
    }));

    const result = await submitAiAppTask("key-ok", "app-1", [], AbortSignal.timeout(5000));
    expect(result.taskId).toBe("rh-task-42");
  });

  test("submitAiAppTask throws RhApiError on non-zero code", async () => {
    vi.stubGlobal("fetch", createRunningHubFetchMock({
      aiAppRunByKey: {
        "key-bad": { error: { code: 500, msg: "internal mock failure" } }
      }
    }));

    await expect(submitAiAppTask("key-bad", "app-1", [], AbortSignal.timeout(5000)))
      .rejects.toBeInstanceOf(RhApiError);
    await expect(submitAiAppTask("key-bad", "app-1", [], AbortSignal.timeout(5000)))
      .rejects.toThrow(/internal mock failure/);
  });

  test("withRhTokenFailover switches from depleted token to healthy token", async () => {
    const switches = [];
    vi.stubGlobal("fetch", createRunningHubFetchMock({
      accountByKey: {
        "token-a": { remainCoins: 0, currentTaskCounts: 0 },
        "token-b": { remainCoins: 50, currentTaskCounts: 0 }
      },
      queueByKey: {
        "token-a": { runningCount: 0, queuedCount: 0, totalCurrentTasks: 0 },
        "token-b": { runningCount: 0, queuedCount: 0, totalCurrentTasks: 0 }
      }
    }));

    const usedKeys = [];
    const result = await withRhTokenFailover({
      apiKeys: ["token-a", "token-b"],
      resourceKind: "app",
      onSwitch: event => switches.push(event)
    }, async (apiKey) => {
      usedKeys.push(apiKey);
      return { taskId: "ok" };
    });

    expect(result).toEqual({ taskId: "ok" });
    expect(usedKeys).toEqual(["token-b"]);
    expect(switches.some(event => event.reason === "depleted")).toBe(true);
  });

  test("withRhTokenFailover throws resource access exhausted when no key has permission", async () => {
    vi.stubGlobal("fetch", createRunningHubFetchMock({
      accountByKey: {
        "token-a": { remainCoins: 100, currentTaskCounts: 0 },
        "token-b": { remainCoins: 100, currentTaskCounts: 0 }
      },
      aiAppRunByKey: {
        "token-a": { error: { code: 380, msg: "workflow_not_exists" } },
        "token-b": { error: { code: 380, msg: "workflow_not_exists" } }
      }
    }));

    await expect(withRhTokenFailover({
      apiKeys: ["token-a", "token-b"],
      resourceKind: "app",
      onExhausted: () => {}
    }, async (apiKey) => submitAiAppTask(apiKey, "app-1", [], AbortSignal.timeout(5000))))
      .rejects.toBeInstanceOf(RhResourceAccessExhaustedError);
  });

  test("submitRhTaskWhenReady retries after token-busy response", async () => {
    vi.stubGlobal("fetch", createRunningHubFetchMock({
      accountByKey: {
        "key-retry": { remainCoins: 100, currentTaskCounts: 0 }
      },
      queueByKey: {
        "key-retry": { runningCount: 0, queuedCount: 0, totalCurrentTasks: 0 }
      },
      aiAppRunAttempts: {
        "key-retry": [
          { code: 804, msg: "API key busy" },
          { code: 0, data: { taskId: "task-after-retry" } }
        ]
      }
    }));

    const waits = [];
    const result = await submitRhTaskWhenReady(
      "key-retry",
      () => submitAiAppTask("key-retry", "app-1", [], AbortSignal.timeout(5000)),
      {
        signal: AbortSignal.timeout(15000),
        pollMs: 20,
        onWait: event => waits.push(event)
      }
    );

    expect(result.taskId).toBe("task-after-retry");
    expect(waits.some(event => event.type === "token_wait")).toBe(true);
  });
});
