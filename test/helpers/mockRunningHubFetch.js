import { RUNNINGHUB_BASE } from "../../server/lib/runningHubClient.js";

function rhEnvelope(data, code = 0, msg = "ok") {
  return { code, msg, data };
}

export function rhFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body
  };
}

function readApiKey(url, init = {}) {
  if (init.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body);
      return String(parsed.apiKey || parsed.apikey || "").trim();
    } catch {
      // fall through
    }
  }
  try {
    const query = new URL(url).searchParams;
    return String(query.get("apiKey") || "").trim();
  } catch {
    return "";
  }
}

/**
 * Returns a fetch stub that answers RunningHub API routes for integration tests.
 * Non-RunningHub URLs are forwarded to `passthrough` when provided.
 */
export function createRunningHubFetchMock(handlers = {}, passthrough) {
  const {
    accountByKey = {},
    queueByKey = {},
    aiAppRunByKey = {},
    aiAppRunAttempts = {}
  } = handlers;

  const attemptCounts = new Map();

  return async function mockRunningHubFetch(input, init = {}) {
    const url = typeof input === "string" ? input : String(input.url || input);
    if (!url.startsWith(RUNNINGHUB_BASE)) {
      if (passthrough) return passthrough(input, init);
      throw new Error(`Unexpected fetch outside RunningHub mock: ${url}`);
    }

    const method = String(init.method || "GET").toUpperCase();
    const apiKey = readApiKey(url, init);

    if (method === "POST" && url.endsWith("/uc/openapi/accountStatus")) {
      const profile = accountByKey[apiKey] || { remainCoins: 100, currentTaskCounts: 0 };
      return rhFetchResponse(rhEnvelope(profile));
    }

    if (method === "GET" && url.endsWith("/openapi/v2/queue/status")) {
      const queue = queueByKey[apiKey] || { runningCount: 0, queuedCount: 0, totalCurrentTasks: 0 };
      return rhFetchResponse(rhEnvelope(queue));
    }

    if (method === "POST" && url.endsWith("/task/openapi/ai-app/run")) {
      const attempts = (attemptCounts.get(apiKey) || 0) + 1;
      attemptCounts.set(apiKey, attempts);

      const sequence = aiAppRunAttempts[apiKey];
      if (sequence?.length) {
        const entry = sequence[Math.min(attempts - 1, sequence.length - 1)];
        if (entry.code !== 0 && entry.code !== "0") {
          return rhFetchResponse(rhEnvelope(entry.data || null, entry.code, entry.msg || "error"));
        }
        return rhFetchResponse(rhEnvelope(entry.data || { taskId: "task-1" }));
      }

      const staticEntry = aiAppRunByKey[apiKey];
      if (staticEntry?.error) {
        return rhFetchResponse(rhEnvelope(null, staticEntry.error.code, staticEntry.error.msg));
      }
      return rhFetchResponse(rhEnvelope(staticEntry?.data || { taskId: "task-1" }));
    }

    return rhFetchResponse({ code: 404, msg: `Unhandled RunningHub mock route: ${method} ${url}` }, 404);
  };
}
