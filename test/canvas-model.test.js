import { afterEach, describe, expect, test, vi } from "vitest";
import {
  arePortsCompatible,
  buildNodeRunCache,
  deriveStepPorts,
  getNodeRunCache,
  isNodeRunCacheReady,
  nodeOutputValue,
  portTypeForUi,
  serverImageFileExists
} from "../src/features/canvas/canvasModel.js";
import { resolveFieldValueForSource } from "../src/features/canvas/canvasMenuHelpers.js";

describe("canvas image cache validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("falls back to GET when an older server rejects HEAD", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(serverImageFileExists("/api/output-image?name=result.png")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/output-image?name=result.png",
      { method: "GET", headers: { Range: "bytes=0-0" } }
    );
  });

  test("reports a missing file only after GET also returns 404", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 }));

    await expect(serverImageFileExists("/api/output-image?name=missing.png")).resolves.toBe(false);
  });

  test("persists run timing and RunningHub coin metadata", () => {
    const runCache = buildNodeRunCache(
      [{ url: "/api/output-image?name=result.png" }],
      "run-123",
      { durationMs: 12340, rhCoins: 3, provider: "runninghub" }
    );

    expect(getNodeRunCache({ data: { runCache } })).toMatchObject({
      runId: "run-123",
      durationMs: 12340,
      rhCoins: 3,
      provider: "runninghub"
    });
  });

  test("treats existing local cached outputs as reusable when the file is present", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const node = {
      type: "step",
      data: {
        status: "done",
        runCache: buildNodeRunCache([{ url: "/api/output-image?name=result.png" }])
      }
    };

    await expect(isNodeRunCacheReady(node)).resolves.toBe(true);
  });

  test("does not reuse a cached output when its local file is gone", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 }));
    const node = {
      type: "step",
      data: {
        status: "done",
        runCache: buildNodeRunCache([{ url: "/api/output-image?name=missing.png" }])
      }
    };

    await expect(isNodeRunCacheReady(node)).resolves.toBe(false);
  });
});

describe("canvas typed source ports", () => {
  test("exposes every editable field as a connectable typed port", () => {
    const { inputs } = deriveStepPorts({
      input: {
        count: { id: "1-count", ui: { type: "int", label: "Count", value: 2 } },
        strength: { id: "1-strength", ui: { type: "float", step: 0.1, value: 0.5 } },
        model: {
          id: "1-model",
          ui: {
            type: "menu",
            choices: ["Default:model-a.safetensors", "Product:model-b.safetensors"],
            menuLabelSyntax: true,
            value: "model-a.safetensors"
          }
        },
        checkpoint: { id: "1-ckpt", ui: { type: "checkpoints", value: "model.safetensors" } },
        enabled: { id: "1-enabled", ui: { type: "boolean", value: false } }
      }
    });

    expect(inputs.map(port => [port.type, port.connectable])).toEqual([
      ["number", true],
      ["number", true],
      ["choice", true],
      ["choice", true],
      ["boolean", true]
    ]);
    expect(inputs[1].step).toBe(0.1);
    expect(inputs[2].choices).toEqual([
      "Default:model-a.safetensors",
      "Product:model-b.safetensors"
    ]);
    expect(inputs[2].menuLabelSyntax).toBe(true);
  });

  test("preserves the original field descriptor when converting to a source", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        values: { model: "B" },
        ports: {
          inputs: [{
            key: "model",
            valueKey: "model",
            label: "Model",
            type: "choice",
            uiType: "menu",
            choices: ["Default:A", "Product:B"],
            menuLabelSyntax: true
          }]
        }
      }
    };

    expect(resolveFieldValueForSource(node, "model", [node], [])).toMatchObject({
      sourceType: "choice",
      value: "B",
      label: "Model",
      port: {
        type: "choice",
        uiType: "menu",
        choices: ["Default:A", "Product:B"],
        menuLabelSyntax: true
      }
    });
  });

  test("source outputs preserve zero and false values", () => {
    expect(nodeOutputValue({
      type: "source",
      data: { values: { main: 0 } }
    }, "out:main")).toBe(0);
    expect(nodeOutputValue({
      type: "source",
      data: { values: { main: false } }
    }, "out:main")).toBe(false);
  });

  test("keeps choice ports separate from image ports", () => {
    expect(portTypeForUi("lora")).toBe("choice");
    expect(arePortsCompatible("choice", "choice")).toBe(true);
    expect(arePortsCompatible("choice", "image")).toBe(false);
  });
});
