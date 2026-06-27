import { afterEach, describe, expect, test, vi } from "vitest";
import {
  activeStepInputPorts,
  arePortsCompatible,
  beginNodeExecutionPatch,
  buildNodeRunCache,
  cloneImageValueForSource,
  deriveStepPorts,
  filenameFromImageUrl,
  finalizeCanvasImageValue,
  findLinkedImageSource,
  findNodeInputImageUrl,
  getNodeRunCache,
  isNodeRunCacheReady,
  linkedImageInputsMissingSource,
  nodeOutputUrl,
  nodeOutputValue,
  normalizeStepOutputs,
  nodeRunCachePatch,
  portTypeForUi,
  resolveEffectiveImageSource,
  resolveEffectiveNodeOutputUrl,
  serverImageFileExists,
  upstreamStepsNeedingRun
} from "../src/features/canvas/canvasModel.js";
import { resolveFieldValueForSource, resolveOutputValueForSource } from "../src/features/canvas/canvasMenuHelpers.js";
import {
  estimateOutputPreviewBlockHeight,
  estimateStepNodeMinHeight,
  growStepNodesToFit,
  isStepOutputDetached,
  normalizeOutputSplitNodes,
  OUTPUT_PREVIEW_STAGE_MIN_HEIGHT,
  reconcileOutputSplitOnEdgeRemove,
  restoreInputSourceOnRemove,
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

  test("keeps the previous output visible while a replacement run is pending", () => {
    expect(beginNodeExecutionPatch()).toEqual({ status: "running", error: "" });
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

describe("canvas multi-output mapping", () => {
  const nodeContext = {
    ports: {
      outputs: [
        { key: "image", label: "Image", type: "image" },
        { key: "mask", label: "Mask", type: "image" }
      ]
    },
    config: {
      output: {
        image: { id: "9" },
        mask: { id: "12" }
      }
    }
  };

  test("maps backend nodeId rows onto declared output port keys", () => {
    expect(normalizeStepOutputs([
      { nodeId: "9", url: "/api/output-image?name=image.png", filename: "image.png" },
      { nodeId: "12", url: "/api/output-image?name=mask.png", filename: "mask.png" }
    ], nodeContext)).toEqual([
      { nodeId: "9", key: "image", url: "/api/output-image?name=image.png", filename: "image.png" },
      { nodeId: "12", key: "mask", url: "/api/output-image?name=mask.png", filename: "mask.png" }
    ]);
  });

  test("stores keyed outputs in run cache and resolves each output handle", () => {
    const patch = nodeRunCachePatch([
      { nodeId: "9", url: "/api/output-image?name=image.png", filename: "image.png" },
      { nodeId: "12", url: "/api/output-image?name=mask.png", filename: "mask.png" }
    ], "run-1", {}, {
      type: "step",
      data: nodeContext
    });
    const node = { type: "step", data: { ...nodeContext, ...patch } };

    expect(nodeOutputUrl(node, "out:image")).toBe("/api/output-image?name=image.png");
    expect(nodeOutputUrl(node, "out:mask")).toBe("/api/output-image?name=mask.png");
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

  test("exposes menu-sub child ports only when their branch is active", () => {
    const { inputs } = deriveStepPorts({
      input: {
        source: {
          ui: {
            type: "menu-sub",
            label: "Source",
            choices: ["Upload", "Url"],
            value: "Upload",
            sub: {
              Upload: {
                image: { id: "1-image", ui: { type: "image", label: "Image" } }
              },
              Url: {
                url: { id: "1-url", ui: { type: "string", label: "Url" } }
              }
            }
          }
        }
      }
    });

    expect(inputs.map(port => [port.label, port.valueKey, port.menuSubRole, port.menuSubChoice])).toEqual([
      ["Source", "__menu__source", "parent", undefined],
      ["Image", "1-image", "child", "Upload"],
      ["Url", "1-url", "child", "Url"]
    ]);
    expect(activeStepInputPorts(inputs, { "__menu__source": "Upload" }).map(port => port.label))
      .toEqual(["Source", "Image"]);
    expect(activeStepInputPorts(inputs, { "__menu__source": "Url" }).map(port => port.label))
      .toEqual(["Source", "Url"]);
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
    // linked image row + textarea + chrome
    expect(height).toBeGreaterThanOrEqual(160);
    expect(height).toBeLessThan(190);
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
    // Restoring the preview clears the fixed height so the step auto-fits the
    // complete output image at its natural aspect ratio.
    expect(result.nodes[0].data.size).toEqual({ width: 236 });
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

  test("grows a fixed-height step node when an image input no longer fits", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        size: { width: 236, height: 120 },
        ports: {
          inputs: [{ key: "image", valueKey: "image", type: "image", uiType: "image" }],
          outputs: [{ key: "main", label: "Output", type: "image" }]
        },
        values: { image: "/api/input-image?name=test.png" }
      }
    };

    const minHeight = estimateStepNodeMinHeight(node, [], [node]);
    const { nodes, changed } = growStepNodesToFit([node], []);
    expect(changed).toBe(true);
    expect(nodes[0].data.size.height).toBe(minHeight);
    expect(nodes[0].data.size.width).toBe(236);
  });

  test("grows a fixed-height step node when an output preview appears", () => {
    const node = {
      id: "step-1",
      type: "step",
      data: {
        size: { width: 236, height: 130 },
        ports: {
          inputs: [{ key: "value", valueKey: "value", type: "text", uiType: "string" }],
          outputs: [{ key: "main", label: "Output", type: "image" }]
        },
        values: { value: "hi" },
        runCache: {
          outputs: [{ url: "/api/output-image?name=out.png", key: "main" }],
          primary: { url: "/api/output-image?name=out.png", key: "main" }
        }
      }
    };

    const minHeight = estimateStepNodeMinHeight(node, [], [node]);
    const { nodes, changed } = growStepNodesToFit([node], []);
    expect(changed).toBe(true);
    expect(nodes[0].data.size.height).toBe(minHeight);
  });

  test("never shrinks a step node taller than its content, leaves auto-fit nodes alone", () => {
    const tall = {
      id: "tall",
      type: "step",
      data: {
        size: { width: 236, height: 600 },
        ports: {
          inputs: [{ key: "value", valueKey: "value", type: "text", uiType: "string" }],
          outputs: [{ key: "main", label: "Output", type: "image" }]
        },
        values: { value: "hi" }
      }
    };
    const autoFit = {
      id: "auto",
      type: "step",
      data: {
        size: { width: 236 },
        ports: { inputs: [{ key: "value", valueKey: "value", type: "text", uiType: "string" }] },
        values: { value: "hi" }
      }
    };

    const result = growStepNodesToFit([tall, autoFit], []);
    expect(result.changed).toBe(false);
    expect(result.nodes[0]).toBe(tall);
    expect(result.nodes[1]).toBe(autoFit);
  });

  test("undoes output split when passthrough input edge is removed", () => {
    const nodes = [
      {
        id: "step-1",
        type: "step",
        data: {
          size: { width: 236 },
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
    const removedEdge = edges[0];
    const edgesAfter = edges.filter(edge => edge.id !== removedEdge.id);

    const result = reconcileOutputSplitOnEdgeRemove(nodes, edgesAfter, removedEdge);
    expect(result.nodes.map(node => node.id)).toEqual(["step-1", "step-2"]);
    expect(result.nodes[0].data.size).toEqual({ width: 236 });
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

describe("restoreInputSourceOnRemove", () => {
  const makeGraph = () => {
    const nodes = [
      {
        id: "step-1",
        type: "step",
        data: {
          size: { width: 236, height: 300 },
          ports: {
            inputs: [{ key: "image", valueKey: "image", type: "image", uiType: "image" }],
            outputs: [{ key: "main", label: "Output", type: "image" }]
          },
          values: { image: "" }
        }
      },
      {
        id: "src-1",
        type: "source",
        data: {
          sourceType: "image",
          name: "Input Image",
          values: { main: "/api/input-image?name=photo.png" },
          passthroughFromInput: true,
          passthroughTargetNodeId: "step-1",
          passthroughInputValueKey: "image"
        }
      }
    ];
    const edges = [
      { id: "e-src-step", source: "src-1", target: "step-1", sourceHandle: "out:main", targetHandle: "in:image" }
    ];
    return { nodes, edges };
  };

  test("restores input value to step and removes source node + edge", () => {
    const { nodes, edges } = makeGraph();
    const result = restoreInputSourceOnRemove(nodes, edges, "src-1");
    expect(result).not.toBeNull();
    expect(result.nodes.map(n => n.id)).toEqual(["step-1"]);
    expect(result.nodes[0].data.values.image).toBe("/api/input-image?name=photo.png");
    expect(result.edges).toHaveLength(0);
  });

  test("restores upstream link when deleting a piped input split node", () => {
    const nodes = [
      {
        id: "step-up",
        type: "step",
        data: {
          ports: { outputs: [{ key: "mask", type: "image" }] },
          runCache: { outputs: [{ key: "mask", url: "/api/output-image?name=mask.png" }] }
        }
      },
      {
        id: "step-down",
        type: "step",
        data: {
          ports: { inputs: [{ key: "mask", valueKey: "mask", type: "image" }] },
          values: { mask: "" }
        }
      },
      {
        id: "src-pipe",
        type: "source",
        data: {
          passthroughFromInput: true,
          passthroughTargetNodeId: "step-down",
          passthroughInputValueKey: "mask",
          values: { main: "" }
        }
      }
    ];
    const edges = [
      { id: "e-up-pipe", source: "step-up", target: "src-pipe", sourceHandle: "out:mask", targetHandle: "in:main" },
      { id: "e-pipe-down", source: "src-pipe", target: "step-down", sourceHandle: "out:main", targetHandle: "in:mask" }
    ];
    const result = restoreInputSourceOnRemove(nodes, edges, "src-pipe");
    expect(result?.edges).toEqual([{
      id: "e-step-up-step-down-restored",
      source: "step-up",
      target: "step-down",
      sourceHandle: "out:mask",
      targetHandle: "in:mask"
    }]);
    expect(result?.nodes.find(node => node.id === "step-down")?.data.values.mask).toBe("");
  });

  test("returns null for non-passthrough source nodes", () => {
    const { nodes, edges } = makeGraph();
    const plainSource = { id: "src-plain", type: "source", data: { values: { main: "/api/input-image?name=other.png" } } };
    const result = restoreInputSourceOnRemove([...nodes, plainSource], edges, "src-plain");
    expect(result).toBeNull();
  });

  test("returns null when source id is not found", () => {
    const { nodes, edges } = makeGraph();
    const result = restoreInputSourceOnRemove(nodes, edges, "nonexistent");
    expect(result).toBeNull();
  });

  test("normalizeOutputSplitNodes strips stale passthroughFromInput flag", () => {
    const { nodes } = makeGraph();
    // No edges → source is no longer connected → flag should be stripped
    const normalized = normalizeOutputSplitNodes(nodes, []);
    const src = normalized.find(n => n.id === "src-1");
    expect(src.data.passthroughFromInput).toBeUndefined();
    expect(src.data.passthroughTargetNodeId).toBeUndefined();
    expect(src.data.passthroughInputValueKey).toBeUndefined();
  });

  test("normalizeOutputSplitNodes keeps flag when edge is present", () => {
    const { nodes, edges } = makeGraph();
    const normalized = normalizeOutputSplitNodes(nodes, edges);
    const src = normalized.find(n => n.id === "src-1");
    expect(src.data.passthroughFromInput).toBe(true);
  });
});

describe("resolveEffectiveImageSource traverses passthrough output nodes", () => {
  const stepWithOutput = {
    id: "step-1",
    type: "step",
    data: {
      ports: { outputs: [{ key: "main", type: "image" }] },
      runCache: {
        outputs: [{ url: "/api/output-image?name=out.png", key: "main" }],
        primary: { url: "/api/output-image?name=out.png", key: "main" }
      }
    }
  };
  const passthrough = {
    id: "pt-1",
    type: "source",
    data: {
      passthroughFromOutput: true,
      passthroughSourceNodeId: "step-1",
      passthroughOutputKey: "main",
      values: { main: "" }
    }
  };
  const downstream = {
    id: "step-2",
    type: "step",
    data: {
      ports: { inputs: [{ key: "image", valueKey: "image", type: "image", uiType: "image" }] }
    }
  };
  const nodes = [stepWithOutput, passthrough, downstream];
  const edges = [
    { id: "e1", source: "step-1", target: "pt-1", sourceHandle: "out:main", targetHandle: "in:main" },
    { id: "e2", source: "pt-1", target: "step-2", sourceHandle: "out:main", targetHandle: "in:image" }
  ];

  test("resolveEffectiveImageSource resolves passthrough to upstream step", () => {
    const result = resolveEffectiveImageSource("pt-1", "out:main", nodes, edges);
    expect(result?.node.id).toBe("step-1");
    expect(result?.sourceHandle).toBe("out:main");
  });

  test("resolveEffectiveNodeOutputUrl returns step output URL via passthrough", () => {
    const url = resolveEffectiveNodeOutputUrl("pt-1", "out:main", nodes, edges);
    expect(url).toBe("/api/output-image?name=out.png");
  });

  test("upstreamStepsNeedingRun identifies upstream step when passthrough has no cache", () => {
    const noCache = { ...stepWithOutput, data: { ...stepWithOutput.data, runCache: null } };
    const nodesNoCache = [noCache, passthrough, downstream];
    const result = upstreamStepsNeedingRun("step-2", nodesNoCache, edges);
    expect(result).toContain("step-1");
  });

  test("upstreamStepsNeedingRun skips upstream step when passthrough has cache", () => {
    const result = upstreamStepsNeedingRun("step-2", nodes, edges);
    expect(result).not.toContain("step-1");
  });

  test("linkedImageInputsMissingSource marks canAutoRun true for passthrough pointing to step", () => {
    const noCache = { ...stepWithOutput, data: { ...stepWithOutput.data, runCache: null } };
    const nodesNoCache = [noCache, passthrough, downstream];
    const missing = linkedImageInputsMissingSource(downstream, nodesNoCache, edges);
    expect(missing).toHaveLength(1);
    expect(missing[0].source.id).toBe("step-1");
    expect(missing[0].canAutoRun).toBe(true);
  });
});

describe("canvas input pipe sources", () => {
  const upstream = {
    id: "step-up",
    type: "step",
    data: {
      ports: {
        outputs: [
          { key: "image", label: "Image", type: "image" },
          { key: "mask", label: "Mask", type: "image" }
        ]
      },
      runCache: {
        outputs: [
          { key: "image", url: "/api/output-image?name=image.png" },
          { key: "mask", url: "/api/output-image?name=mask.png" }
        ],
        primary: { key: "image", url: "/api/output-image?name=image.png" }
      }
    }
  };
  const pipe = {
    id: "src-pipe",
    type: "source",
    data: {
      sourceType: "image",
      passthroughFromInput: true,
      passthroughTargetNodeId: "step-down",
      passthroughInputValueKey: "mask",
      values: { main: "" }
    }
  };
  const downstream = {
    id: "step-down",
    type: "step",
    data: {
      ports: { inputs: [{ key: "mask", valueKey: "mask", type: "image" }] },
      values: { mask: "" }
    }
  };
  const edges = [
    { id: "e-up-pipe", source: "step-up", target: "src-pipe", sourceHandle: "out:mask", targetHandle: "in:main" },
    { id: "e-pipe-down", source: "src-pipe", target: "step-down", sourceHandle: "out:main", targetHandle: "in:mask" }
  ];
  const nodes = [upstream, pipe, downstream];

  test("forwards live mask output through a split input source node", () => {
    expect(nodeOutputValue(pipe, "out:main", nodes, edges)).toBe("/api/output-image?name=mask.png");
    expect(resolveEffectiveImageSource("src-pipe", "out:main", nodes, edges)?.node?.id).toBe("step-up");
  });

  test("filenameFromImageUrl reads api refs", () => {
    expect(filenameFromImageUrl("/api/input-image?name=photo.png")).toBe("photo.png");
    expect(filenameFromImageUrl("/api/output-image?name=mask.png")).toBe("mask.png");
    expect(filenameFromImageUrl("https://app.test/api/input-image?name=lib%20a.png")).toBe("lib a.png");
  });

  test("finalizeCanvasImageValue keeps mask overlays on embedded step inputs", () => {
    expect(finalizeCanvasImageValue({
      kind: "input-image",
      url: "/api/input-image?name=photo.png",
      maskDataUrl: "data:image/png;base64,abc"
    })).toEqual({
      kind: "input-image",
      url: "/api/input-image?name=photo.png",
      name: "photo.png",
      maskDataUrl: "data:image/png;base64,abc"
    });
    expect(finalizeCanvasImageValue("/api/input-image?name=photo.png")).toEqual({
      kind: "input-image",
      url: "/api/input-image?name=photo.png",
      name: "photo.png"
    });
    expect(finalizeCanvasImageValue("/api/output-image?name=mask.png")).toBe("/api/output-image?name=mask.png");
  });

  test("cloneImageValueForSource keeps mask overlays and filename", () => {
    expect(cloneImageValueForSource({
      kind: "input-image",
      name: "photo.png",
      url: "/api/input-image?name=photo.png",
      maskDataUrl: "data:image/png;base64,abc"
    })).toEqual({
      kind: "input-image",
      name: "photo.png",
      url: "/api/input-image?name=photo.png",
      maskDataUrl: "data:image/png;base64,abc"
    });
    expect(cloneImageValueForSource({
      kind: "input-image",
      url: "/api/input-image?name=photo.png",
      maskDataUrl: "data:image/png;base64,abc"
    })).toEqual({
      kind: "input-image",
      name: "photo.png",
      url: "/api/input-image?name=photo.png",
      maskDataUrl: "data:image/png;base64,abc"
    });
  });
});
