import { afterEach, describe, expect, test } from "vitest";
import {
  getComfyHealth,
  getHistory,
  normalizeComfyTarget,
  queuePrompt,
  waitForPrompt
} from "../server/lib/comfyClient.js";
import { collectOutputs } from "../server/lib/workflowPatcher.js";
import { createMockComfyServer } from "./helpers/mockComfyServer.js";

describe("ComfyUI integration (mock server)", () => {
  let mock;

  afterEach(async () => {
    await mock?.close();
    mock = null;
  });

  test("completes queue → websocket → history flow", async () => {
    mock = await createMockComfyServer({ promptId: "flow-prompt-1" });
    const target = normalizeComfyTarget(mock.address);
    const workflow = { 1: { inputs: { text: "hello" } } };

    const queued = await queuePrompt(target, workflow, "client-1");
    expect(queued.prompt_id).toBe("flow-prompt-1");

    await waitForPrompt(target, queued.prompt_id, "client-1", {}, 5000);

    const historyRoot = await getHistory(target, queued.prompt_id);
    const history = historyRoot[queued.prompt_id];
    const outputs = collectOutputs({ output: { image: { id: "9" } } }, history, target);

    expect(outputs).toHaveLength(1);
    expect(outputs[0].filename).toBe("output.png");
    expect(outputs[0].url).toContain("comfy-view");
  });

  test("reports connection failure with a clear error", async () => {
    const target = normalizeComfyTarget("127.0.0.1:59999");
    await expect(queuePrompt(target, {}, "client-1")).rejects.toThrow(/ComfyUI \/prompt failed|fetch failed/i);
  });

  test("surfaces HTTP errors from /prompt", async () => {
    mock = await createMockComfyServer({ promptHttpStatus: 503 });
    const target = normalizeComfyTarget(mock.address);
    await expect(queuePrompt(target, {}, "client-1")).rejects.toThrow(/ComfyUI \/prompt failed: 503/);
  });

  test("surfaces ComfyUI validation node_errors", async () => {
    mock = await createMockComfyServer({ nodeErrors: { 1: "invalid input" } });
    const target = normalizeComfyTarget(mock.address);
    await expect(queuePrompt(target, {}, "client-1")).rejects.toThrow(/ComfyUI validation failed/);
  });

  test("surfaces execution_error events from websocket", async () => {
    mock = await createMockComfyServer({ wsMode: "execution_error" });
    const target = normalizeComfyTarget(mock.address);
    const queued = await queuePrompt(target, {}, "client-1");
    await expect(waitForPrompt(target, queued.prompt_id, "client-2", {}, 5000))
      .rejects.toThrow(/ComfyUI execution error at node 4/);
  });

  test("surfaces websocket disconnect before completion", async () => {
    mock = await createMockComfyServer({ wsMode: "close_early" });
    const target = normalizeComfyTarget(mock.address);
    const queued = await queuePrompt(target, {}, "client-1");
    await expect(waitForPrompt(target, queued.prompt_id, "client-2", {}, 5000))
      .rejects.toThrow(/websocket closed before prompt/i);
  });

  test("health check reports online against mock server", async () => {
    mock = await createMockComfyServer();
    const target = normalizeComfyTarget(mock.address);
    const health = await getComfyHealth(target);
    expect(health.online).toBe(true);
    expect(health.address).toContain(String(mock.port));
  });
});
