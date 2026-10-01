import { afterEach, describe, expect, test, vi } from "vitest";
import {
  isNetworkFetchError,
  runStillActiveOnServer,
  shouldKeepRunAfterFetchError
} from "../src/lib/runConnection.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("mất kết nối UI ↔ server app", () => {
  test("nhận diện lỗi mạng của trình duyệt", () => {
    expect(isNetworkFetchError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFetchError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkFetchError(new Error("Network request failed"))).toBe(true);
    expect(isNetworkFetchError(Object.assign(new Error("huỷ"), { name: "AbortError" }))).toBe(false);
    expect(isNetworkFetchError(new Error("RunningHub node 9 lỗi"))).toBe(false);
  });

  test("run còn chạy trên server → giữ phiên, không báo lỗi", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ runs: [{ runId: "run-1" }] })
    }));
    await expect(shouldKeepRunAfterFetchError(new TypeError("Failed to fetch"), "run-1")).resolves.toBe(true);
  });

  test("run đã biến mất khỏi server → vẫn báo lỗi như cũ", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ runs: [] }) }));
    await expect(shouldKeepRunAfterFetchError(new TypeError("Failed to fetch"), "run-1")).resolves.toBe(false);
  });

  test("lỗi nghiệp vụ không bao giờ được giữ phiên", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ runs: [{ runId: "run-1" }] }) }));
    await expect(shouldKeepRunAfterFetchError(new Error("Missing RunningHub API key"), "run-1")).resolves.toBe(false);
  });

  test("không hỏi được server thì coi như run đã dừng", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(runStillActiveOnServer("run-1")).resolves.toBe(false);
  });
});
