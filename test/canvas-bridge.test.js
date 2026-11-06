import { describe, expect, it } from "vitest";
import { createCanvasBridge, holdCanvasRunForColab } from "../server/lib/canvasBridge.js";
import { canvasRunState, summarizeCanvas, validateNodeValues } from "../src/features/canvas/canvasBridge.js";

function fakeClient() {
  const handlers = {};
  return {
    chunks: [],
    write(chunk) { this.chunks.push(chunk); },
    on(event, fn) { handlers[event] = fn; },
    close() { handlers.close?.(); },
    command() {
      const chunk = this.chunks.find(item => item.startsWith("event: command"));
      return chunk ? JSON.parse(chunk.split("data: ")[1]) : null;
    }
  };
}

const step = {
  id: "s1",
  type: "step",
  data: {
    name: "Swap",
    kind: "local",
    ref: "swap",
    status: "idle",
    values: { seed: 5, face: "" },
    ports: { inputs: [{ key: "seed", valueKey: "seed", type: "number", label: "Seed" }, { key: "face", valueKey: "face", type: "image", label: "Face" }] },
    runCache: { outputs: [{ url: "/api/output-image?name=a.png", key: "main", filename: "a.png" }], runAt: 1000, runId: "r1" }
  }
};
const source = { id: "n1", type: "source", data: { name: "Ảnh", sourceType: "image", values: { main: "" } } };
const edges = [{ source: "n1", sourceHandle: "out:main", target: "s1", targetHandle: "in:face" }];

describe("canvas bridge (server)", () => {
  it("pushes a command to the window and returns its answer", async () => {
    const bridge = createCanvasBridge();
    const client = fakeClient();
    bridge.attachClient(client);
    const answer = bridge.command("get", { a: 1 });
    const sent = client.command();
    expect(sent).toMatchObject({ action: "get", args: { a: 1 } });
    bridge.settle({ id: sent.id, ok: true, data: { nodes: [] } });
    await expect(answer).resolves.toEqual({ nodes: [] });
  });

  it("explains when no window is open, reports window errors and timeouts", async () => {
    const bridge = createCanvasBridge({ timeoutMs: 20 });
    await expect(bridge.command("get")).rejects.toThrow(/mở app aPix/);
    const client = fakeClient();
    bridge.attachClient(client);
    const failing = bridge.command("run");
    bridge.settle({ id: client.command().id, ok: false, error: "Không có node" });
    await expect(failing).rejects.toThrow("Không có node");
    await expect(bridge.command("get")).rejects.toThrow(/không phản hồi/);
    client.close();
    expect(bridge.hasClient()).toBe(false);
  });

  it("holds a run until Colab is ready, and reports a failed start", async () => {
    let phase = "off";
    const session = { start() { phase = "starting"; }, getState: () => ({ phase, message: "boom" }) };
    const calls = [];
    const bridge = { command: async (action, args) => calls.push([action, args]) };
    const held = holdCanvasRunForColab({ bridge, session, args: { nodeId: "s1" }, pollMs: 5, settleMs: 1 });
    expect(held.state).toBe("waiting-colab");
    phase = "ready";
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(held.state).toBe("released");
    expect(calls).toEqual([["run", { nodeId: "s1" }]]);

    phase = "off";
    const failed = holdCanvasRunForColab({ bridge, session, args: {}, pollMs: 5, settleMs: 1 });
    phase = "error";
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(failed.state).toBe("error");
    expect(failed.error).toContain("boom");
  });
});

describe("canvas bridge (view)", () => {
  it("summarizes inputs, connections and per-node outputs", () => {
    const { nodes, edges: lines } = summarizeCanvas([source, step], edges);
    const swap = nodes.find(node => node.id === "s1");
    expect(swap.inputs.find(port => port.key === "seed").value).toBe(5);
    expect(swap.inputs.find(port => port.key === "face").connectedFrom).toBe("n1");
    expect(swap.outputs[0].filename).toBe("a.png");
    expect(swap.runId).toBe("r1");
    expect(nodes[0].inputs[0].key).toBe("main");
    expect(lines[0]).toEqual({ from: "n1", fromPort: "main", to: "s1", toPort: "face" });
  });

  it("rejects unknown nodes, unknown inputs and connected inputs", () => {
    expect(() => validateNodeValues(null, {}, edges)).toThrow(/Không có node/);
    expect(() => validateNodeValues(step, { nope: 1 }, edges)).toThrow(/không có input/);
    expect(() => validateNodeValues(step, { face: "x" }, edges)).toThrow(/n1/);
    expect(() => validateNodeValues(step, { seed: 7 }, edges)).not.toThrow();
    expect(() => validateNodeValues(source, { main: "x" }, edges)).not.toThrow();
  });

  it("derives the run state", () => {
    const done = { ...step, data: { ...step.data, runCache: { ...step.data.runCache, runAt: 2000 } } };
    const failed = { ...step, data: { ...step.data, status: "error" } };
    expect(canvasRunState(null, [step], false)).toBe("idle");
    expect(canvasRunState({ startedAt: 1500 }, [done], true, 1600)).toBe("running");
    expect(canvasRunState({ startedAt: 1500 }, [done], false, 1600)).toBe("done");
    expect(canvasRunState({ startedAt: 1500 }, [failed], false, 1600)).toBe("error");
    expect(canvasRunState({ startedAt: 1500 }, [step], false, 1600)).toBe("running"); // just submitted
    expect(canvasRunState({ startedAt: 1500 }, [step], false, 99999)).toBe("stopped");
    expect(canvasRunState({ startedAt: 1500, nodeId: "other" }, [failed, { ...done, id: "other" }], false, 1600)).toBe("done");
  });
});
