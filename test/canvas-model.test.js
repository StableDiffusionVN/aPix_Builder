import { afterEach, describe, expect, test, vi } from "vitest";
import {
  arePortsCompatible,
  buildNodeRunCache,
  deriveStepPorts,
  findLinkedImageSource,
  findNodeInputImageUrl,
  getNodeRunCache,
  isNodeRunCacheReady,
  nodeOutputUrl,
  nodeOutputValue,
  portTypeForUi,
  resolveEffectiveNodeOutputUrl,
  serverImageFileExists
} from "../src/features/canvas/canvasModel.js";
import { resolveFieldValueForSource, resolveOutputValueForSource } from "../src/features/canvas/canvasMenuHelpers.js";
import {
  estimateOutputPreviewBlockHeight,
  estimateStepNodeMinHeight,
  isStepOutputDetached,
  normalizeOutputSplitNodes,
  OUTPUT_PREVIEW_STAGE_MIN_HEIGHT,
  restoreOutputPassthroughOnRemove,
  stepOutputPreviewIsVisible
} from "../src/features/canvas/canvasNodeLayout.js";

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

  test("reads step output from run cache for source split", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        runCache: {
          outputs: [{ url: "/api/output-image?name=out.png", key: "main" }],
          primary: { url: "/api/output-image?name=out.png", key: "main" }
        },
        ports: {
          outputs: [{ key: "main", label: "Output", type: "image" }]
        }
      }
    };

    expect(resolveOutputValueForSource(node, "main")).toMatchObject({
      sourceType: "image",
      value: "/api/output-image?name=out.png",
      imageUrl: "/api/output-image?name=out.png",
      label: "Output"
    });
  });

  test("returns empty output when step has no run cache", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        ports: { outputs: [{ key: "main", label: "Output", type: "image" }] }
      }
    };

    expect(resolveOutputValueForSource(node, "main")).toMatchObject({
      sourceType: "image",
      value: "",
      imageUrl: ""
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

  test("passthrough output source forwards upstream step output", () => {
    const nodes = [
      {
        id: "step-1",
        type: "step",
        data: {
          runCache: {
            outputs: [{ url: "/api/output-image?name=out.png", key: "main" }],
            primary: { url: "/api/output-image?name=out.png", key: "main" }
          }
        }
      },
      {
        id: "split-1",
        type: "source",
        data: {
          passthroughFromOutput: true,
          passthroughSourceNodeId: "step-1",
          passthroughOutputKey: "main",
          values: { main: "" }
        }
      }
    ];

    expect(nodeOutputUrl(nodes[1], "out:main", nodes)).toBe("/api/output-image?name=out.png");
    expect(nodeOutputValue(nodes[1], "out:main", nodes)).toBe("/api/output-image?name=out.png");
  });

  test("keeps choice ports separate from image ports", () => {
    expect(portTypeForUi("lora")).toBe("choice");
    expect(arePortsCompatible("choice", "choice")).toBe(true);
    expect(arePortsCompatible("choice", "image")).toBe(false);
  });
});

describe("canvas step node layout", () => {
  test("estimates compact height from linked and text inputs without preview", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        size: { width: 236, height: 520 },
        ports: {
          inputs: [
            { key: "image", valueKey: "image", type: "image", uiType: "image" },
            { key: "value", valueKey: "value", type: "text", uiType: "string" }
          ],
          outputs: [{ key: "main", label: "Output", type: "image" }]
        },
        values: { value: "hello" }
      }
    };
    const edges = [
      { id: "e1", source: "src", target: "step-1", sourceHandle: "out:main", targetHandle: "in:image" }
    ];

    const height = estimateStepNodeMinHeight(node, edges);
    // header + output + body(linked image + textarea) — much smaller than 520
    expect(height).toBeLessThan(300);
    expect(height).toBeGreaterThanOrEqual(100);
  });

  test("reserves enough height for trailing textarea after linked image input", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        size: { width: 236 },
        ports: {
          inputs: [
            { key: "image", valueKey: "image", type: "image", uiType: "image" },
            { key: "value", valueKey: "value", type: "text", uiType: "string" }
          ],
          outputs: [{ key: "main", label: "Output", type: "image" }]
        },
        values: { value: "prompt text" }
      }
    };
    const edges = [
      { id: "e1", source: "src", target: "step-1", sourceHandle: "out:main", targetHandle: "in:image" }
    ];

    const height = estimateStepNodeMinHeight(node, edges, [node]);
    // linked image row + 2-row textarea + chrome
    expect(height).toBeGreaterThanOrEqual(170);
    expect(height).toBeLessThan(210);
  });

  test("estimates taller height for local image input preview", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        size: { width: 236 },
        ports: {
          inputs: [{ key: "image", valueKey: "image", type: "image", uiType: "image" }],
          outputs: [{ key: "main", label: "Output", type: "image" }]
        },
        values: { image: "/api/input-image?name=test.png" }
      }
    };

    const height = estimateStepNodeMinHeight(node, []);
    // square thumb at 220px inner width + url row
    expect(height).toBeGreaterThan(300);
  });

  test("includes output preview frame minimum when step has cached output", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        size: { width: 236 },
        ports: {
          inputs: [{ key: "value", valueKey: "value", type: "text", uiType: "string" }],
          outputs: [{ key: "main", label: "Output", type: "image" }]
        },
        values: { value: "hello" },
        runCache: {
          outputs: [{ url: "/api/output-image?name=out.png", key: "main" }],
          primary: { url: "/api/output-image?name=out.png", key: "main" }
        }
      }
    };

    expect(stepOutputPreviewIsVisible(node, [], [])).toBe(true);
    expect(estimateOutputPreviewBlockHeight(node, 236, [], [])).toBeGreaterThanOrEqual(
      OUTPUT_PREVIEW_STAGE_MIN_HEIGHT + 16
    );

    const splitNodes = [
      node,
      {
        id: "split-1",
        type: "source",
        data: {
          passthroughFromOutput: true,
          passthroughSourceNodeId: "step-1",
          passthroughOutputKey: "main"
        }
      }
    ];
    const splitEdges = [
      { id: "e-split", source: "step-1", target: "split-1", sourceHandle: "out:main", targetHandle: "in:main" }
    ];
    expect(isStepOutputDetached("step-1", "main", splitNodes, splitEdges)).toBe(true);
    expect(stepOutputPreviewIsVisible(node, splitNodes, splitEdges)).toBe(false);

    const withoutOutput = estimateStepNodeMinHeight(node, splitEdges, splitNodes);
    const withOutput = estimateStepNodeMinHeight(node, [], []);
    expect(withOutput).toBeGreaterThan(withoutOutput);
  });

  test("clears stale detachedOutputs flags on project load", () => {
    const nodes = [{
      id: "step-1",
      type: "step",
      data: {
        detachedOutputs: { main: "missing-split" },
        ports: { outputs: [{ key: "main", type: "image" }] },
        runCache: {
          outputs: [{ url: "/api/output-image?name=out.png", key: "main" }],
          primary: { url: "/api/output-image?name=out.png", key: "main" }
        }
      }
    }];
    const normalized = normalizeOutputSplitNodes(nodes, []);
    expect(normalized[0].data.detachedOutputs).toBeUndefined();
    expect(isStepOutputDetached("step-1", "main", normalized, [])).toBe(false);
    expect(stepOutputPreviewIsVisible(normalized[0], normalized, [])).toBe(true);
  });

  test("restores step output when passthrough output node is removed", () => {
    const nodes = [
      {
        id: "step-1",
        type: "step",
        data: {
          size: { width: 236, height: 200 },
          ports: {
            inputs: [{ key: "value", valueKey: "value", type: "text", uiType: "string" }],
            outputs: [{ key: "main", label: "Output", type: "image" }]
          },
          runCache: {
            outputs: [{ url: "/api/output-image?name=out.png", key: "main" }],
            primary: { url: "/api/output-image?name=out.png", key: "main" }
          }
        }
      },
      {
        id: "split-1",
        type: "source",
        data: {
          passthroughFromOutput: true,
          passthroughSourceNodeId: "step-1",
          passthroughOutputKey: "main"
        }
      },
      { id: "step-2", type: "step", data: {} }
    ];
    const edges = [
      { id: "e-in", source: "step-1", target: "split-1", sourceHandle: "out:main", targetHandle: "in:main" },
      { id: "e-out", source: "split-1", target: "step-2", sourceHandle: "out:main", targetHandle: "in:image" }
    ];

    const result = restoreOutputPassthroughOnRemove(nodes, edges, "split-1");
    expect(result.nodes.map(node => node.id)).toEqual(["step-1", "step-2"]);
    expect(result.nodes[0].data.detachedOutputs).toBeUndefined();
    expect(result.nodes[0].data.size).toEqual({ width: 236 });
    expect(result.nodes[0].data.size?.height).toBeUndefined();
    expect(result.edges).toEqual([
      {
        id: "e-step-1-step-2-0",
        source: "step-1",
        target: "step-2",
        sourceHandle: "out:main",
        targetHandle: "in:image",
        type: "default",
        animated: false
      }
    ]);
  });
});

describe("canvas bypass pass-through", () => {
  test("skips bypassed node and reads upstream image output", () => {
    const nodes = [
      {
        id: "a",
        type: "step",
        data: {
          name: "Upstream",
          runCache: {
            outputs: [{ url: "/api/output-image?name=upstream.png", key: "main" }],
            primary: { url: "/api/output-image?name=upstream.png", key: "main" }
          }
        }
      },
      {
        id: "b",
        type: "step",
        data: {
          bypassed: true,
          runCache: {
            outputs: [{ url: "/api/output-image?name=stale.png", key: "main" }],
            primary: { url: "/api/output-image?name=stale.png", key: "main" }
          },
          ports: { inputs: [{ valueKey: "image", type: "image", uiType: "image" }] }
        }
      },
      {
        id: "c",
        type: "step",
        data: {
          ports: { inputs: [{ valueKey: "image", type: "image", uiType: "image" }] }
        }
      }
    ];
    const edges = [
      { id: "e1", source: "a", target: "b", sourceHandle: "out:main", targetHandle: "in:image" },
      { id: "e2", source: "b", target: "c", sourceHandle: "out:main", targetHandle: "in:image" }
    ];

    expect(resolveEffectiveNodeOutputUrl("b", "out:main", nodes, edges))
      .toBe("/api/output-image?name=upstream.png");
    expect(findNodeInputImageUrl(nodes[2], nodes, edges))
      .toBe("/api/output-image?name=upstream.png");
    expect(findLinkedImageSource(nodes[2], nodes, edges)?.id).toBe("a");
  });
});
