import { describe, expect, test } from "vitest";
import { prepareCanvasNodeRunRequest } from "../src/features/canvas/canvasRunner.js";
import { deriveStepPorts, STEP_KINDS } from "../src/features/canvas/canvasModel.js";

describe("canvas runner history metadata", () => {
  test("forwards the command group and node identity to the backend", async () => {
    const node = {
      id: "node-1",
      type: "step",
      data: {
        kind: STEP_KINDS.LOCAL,
        ref: "demo",
        name: "Node One",
        config: { input: {} },
        ports: { inputs: [] },
        values: {}
      }
    };
    const request = await prepareCanvasNodeRunRequest({
      node,
      nodes: [node],
      edges: [],
      rhAuth: {},
      runId: "run-1",
      historyContext: {
        canvasRunGroupId: "group-1",
        canvasProjectId: "project-1",
        canvasNodeId: "node-1",
        canvasNodeName: "Node One",
        canvasGroupLabel: "Canvas · Project 1",
        canvasBatchIndex: 0,
        canvasBatchTotal: 2
      }
    });

    expect(request.body).toMatchObject({
      runId: "run-1",
      canvasRunGroupId: "group-1",
      canvasProjectId: "project-1",
      canvasNodeId: "node-1",
      canvasNodeName: "Node One",
      canvasGroupLabel: "Canvas · Project 1",
      canvasBatchIndex: 0,
      canvasBatchTotal: 2
    });
  });

  test("uses the workspace ComfyUI address when the node has no server override", async () => {
    const node = {
      id: "node-2",
      type: "step",
      data: {
        kind: STEP_KINDS.LOCAL,
        ref: "demo",
        name: "Node Two",
        config: { input: {} },
        ports: { inputs: [] },
        values: {},
        serverAddress: ""
      }
    };
    const request = await prepareCanvasNodeRunRequest({
      node,
      nodes: [node],
      edges: [],
      rhAuth: {},
      comfyAddress: "http://192.168.1.50:8188"
    });

    expect(request.body.address).toBe("http://192.168.1.50:8188");
  });

  test("linked input-image values keep filename for backend upload", async () => {
    const upstream = {
      id: "src-1",
      type: "source",
      data: {
        values: {
          main: {
            kind: "input-image",
            url: "/api/input-image?name=photo.png",
            maskDataUrl: "data:image/png;base64,abc"
          }
        }
      }
    };
    const node = {
      id: "step-1",
      type: "step",
      data: {
        kind: STEP_KINDS.LOCAL,
        ref: "tester",
        name: "Tester",
        config: {
          input: {
            image: { id: "1-image", ui: { type: "image" } }
          }
        },
        ports: {
          inputs: [{ valueKey: "1-image", label: "Image", type: "image", uiType: "image" }]
        },
        values: {}
      }
    };
    const edges = [{
      id: "e-1",
      source: "src-1",
      target: "step-1",
      sourceHandle: "out:main",
      targetHandle: "in:1-image"
    }];
    const request = await prepareCanvasNodeRunRequest({
      node,
      nodes: [upstream, node],
      edges,
      rhAuth: {},
      comfyAddress: "http://127.0.0.1:8188"
    });
    expect(request.body.values["1-image"]).toEqual({
      kind: "input-image",
      url: "/api/input-image?name=photo.png",
      name: "photo.png",
      maskDataUrl: "data:image/png;base64,abc"
    });
  });

  test("embedded image inputs with mask are finalized before run", async () => {
    const node = {
      id: "step-2",
      type: "step",
      data: {
        kind: STEP_KINDS.LOCAL,
        ref: "tester",
        name: "Tester",
        config: {
          input: {
            image: { id: "1-image", ui: { type: "image" } }
          }
        },
        ports: {
          inputs: [{ valueKey: "1-image", label: "Image", type: "image", uiType: "image" }]
        },
        values: {
          "1-image": {
            kind: "input-image",
            url: "/api/input-image?name=photo.png",
            maskDataUrl: "data:image/png;base64,abc"
          }
        }
      }
    };
    const request = await prepareCanvasNodeRunRequest({
      node,
      nodes: [node],
      edges: [],
      rhAuth: {},
      comfyAddress: "http://127.0.0.1:8188"
    });
    expect(request.body.values["1-image"]).toEqual({
      kind: "input-image",
      url: "/api/input-image?name=photo.png",
      name: "photo.png",
      maskDataUrl: "data:image/png;base64,abc"
    });
  });

  test("ignores linked inputs from inactive menu-sub canvas branches", async () => {
    const config = {
      input: {
        input_source: {
          ui: {
            type: "menu-sub",
            label: "Input source",
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
    };
    const inactiveSource = {
      id: "src-empty",
      type: "source",
      data: {
        name: "Empty image source",
        values: { main: "" }
      }
    };
    const node = {
      id: "step-menu",
      type: "step",
      data: {
        kind: STEP_KINDS.LOCAL,
        ref: "menu-template",
        name: "Menu Template",
        config,
        ports: deriveStepPorts(config),
        values: {
          "__menu__input_source": "Url",
          "1-url": "https://example.com/image.png"
        }
      }
    };
    const edges = [{
      id: "e-inactive",
      source: "src-empty",
      target: "step-menu",
      sourceHandle: "out:main",
      targetHandle: "in:1-image"
    }];

    const request = await prepareCanvasNodeRunRequest({
      node,
      nodes: [inactiveSource, node],
      edges,
      rhAuth: {},
      comfyAddress: "http://127.0.0.1:8188"
    });

    expect(request.body.values).toEqual({
      "__menu__input_source": "Url",
      "1-url": "https://example.com/image.png"
    });
  });
});
