import { describe, expect, test } from "vitest";
import { prepareCanvasNodeRunRequest } from "../src/features/canvas/canvasRunner.js";
import { STEP_KINDS } from "../src/features/canvas/canvasModel.js";

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
});
