import { afterEach, describe, expect, test, vi } from "vitest";
import { isTransientRhNetworkError, waitForTaskOutputs } from "../server/lib/runningHubClient.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body)
  };
}

const SUCCESS_BODY = {
  code: 0,
  msg: "success",
  data: [{ fileUrl: "https://rh/out.png", fileType: "png", nodeId: "9", taskCostTime: 31 }]
};

describe("RunningHub poll chịu lỗi mạng tạm thời", () => {
  test("fetch failed giữa chừng không giết run — vẫn lấy được kết quả", async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async () => {
      calls.push(Date.now());
      if (calls.length === 1) return jsonResponse({ code: 804, msg: "running" });
      if (calls.length === 2) throw new TypeError("fetch failed");
      return jsonResponse(SUCCESS_BODY);
    });
    const labels = [];
    const result = await waitForTaskOutputs("key", "task-1", {
      pollMs: 1,
      onStatus: ({ label }) => labels.push(label)
    });
    expect(calls).toHaveLength(3);
    expect(result.outputs[0].fileUrl).toBe("https://rh/out.png");
    expect(labels.some(label => label.includes("Lỗi mạng tạm thời"))).toBe(true);
  });

  test("lỗi mạng kéo dài quá cửa sổ thì mới báo mất kết nối", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const nowSpy = vi.spyOn(Date, "now");
    let clock = 0;
    nowSpy.mockImplementation(() => { clock += 60 * 1000; return clock; });
    await expect(waitForTaskOutputs("key", "task-2", { pollMs: 1 }))
      .rejects.toThrow(/Mất kết nối RunningHub quá lâu/);
    nowSpy.mockRestore();
  });

  test("lỗi nghiệp vụ (không phải mạng) vẫn ném ngay", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ code: 400, msg: "APIKEY_INVALID_NODE_INFO" })
    }));
    await expect(waitForTaskOutputs("key", "task-3", { pollMs: 1 }))
      .rejects.toThrow(/APIKEY_INVALID_NODE_INFO/);
  });

  test("phân loại lỗi tạm thời", () => {
    expect(isTransientRhNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransientRhNetworkError(Object.assign(new Error("Bad gateway"), { status: 502 }))).toBe(true);
    expect(isTransientRhNetworkError(Object.assign(new Error("rate"), { status: 429 }))).toBe(true);
    expect(isTransientRhNetworkError(Object.assign(new Error("sai node"), { status: 400 }))).toBe(false);
  });
});
