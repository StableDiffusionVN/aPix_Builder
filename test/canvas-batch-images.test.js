import { describe, expect, test } from "vitest";
import {
  canvasNodeImageValueKeys,
  expandCanvasRunJobImageBatches,
  expandCanvasRunSnapshotImageBatches
} from "../src/features/canvas/canvasBatchImages.js";

describe("canvas image batch expansion", () => {
  test("detects image value keys on source and step nodes", () => {
    expect(canvasNodeImageValueKeys({
      type: "source",
      data: {
        sourceType: "image",
        values: { main: [{ kind: "input-image", url: "/api/input-image?name=a.png" }] }
      }
    })).toEqual(["main"]);

    expect(canvasNodeImageValueKeys({
      type: "step",
      data: {
        ports: { inputs: [{ type: "image", valueKey: "image" }] },
        values: { image: [{ kind: "input-image", url: "/api/input-image?name=a.png" }] }
      }
    })).toEqual(["image"]);
  });

  test("expands multi-image values into one snapshot per image", async () => {
    const snapshot = {
      nodes: [
        {
          id: "s1",
          type: "source",
          data: {
            sourceType: "image",
            values: {
              main: [
                { kind: "input-image", name: "a.png", url: "/api/input-image?name=a.png" },
                { kind: "input-image", name: "b.png", url: "/api/input-image?name=b.png" }
              ]
            }
          }
        },
        {
          id: "n1",
          type: "step",
          data: {
            ports: { inputs: [{ type: "image", valueKey: "image" }] },
            values: {
              image: [
                { kind: "input-image", name: "c.png", url: "/api/input-image?name=c.png" },
                { kind: "input-image", name: "d.png", url: "/api/input-image?name=d.png" }
              ],
              prompt: "portrait"
            }
          }
        }
      ],
      edges: [],
      rhSettings: {}
    };

    const expanded = await expandCanvasRunSnapshotImageBatches(snapshot);

    expect(expanded).toHaveLength(2);
    expect(expanded[0].batch).toEqual({ index: 0, total: 2 });
    expect(expanded[1].batch).toEqual({ index: 1, total: 2 });
    expect(expanded[0].nodes[0].data.values.main.name).toBe("a.png");
    expect(expanded[1].nodes[0].data.values.main.name).toBe("b.png");
    expect(expanded[0].nodes[1].data.values.image.name).toBe("c.png");
    expect(expanded[1].nodes[1].data.values.image.name).toBe("d.png");
    expect(snapshot.nodes[0].data.values.main).toHaveLength(2);
  });

  test("limits node-run batch expansion to the target and upstream nodes", async () => {
    const snapshot = {
      nodes: [
        {
          id: "target",
          type: "step",
          data: {
            ports: { inputs: [{ type: "image", valueKey: "image" }] },
            values: {
              image: [{ kind: "input-image", name: "only.png", url: "/api/input-image?name=only.png" }]
            }
          }
        },
        {
          id: "other",
          type: "step",
          data: {
            ports: { inputs: [{ type: "image", valueKey: "image" }] },
            values: {
              image: [
                { kind: "input-image", name: "a.png", url: "/api/input-image?name=a.png" },
                { kind: "input-image", name: "b.png", url: "/api/input-image?name=b.png" }
              ]
            }
          }
        }
      ],
      edges: []
    };

    const expanded = await expandCanvasRunSnapshotImageBatches(snapshot, { rootNodeId: "target" });

    expect(expanded).toHaveLength(1);
    expect(expanded[0].nodes[1].data.values.image).toHaveLength(2);
  });

  test("expands one queued run job into multiple queued run jobs", async () => {
    const job = {
      type: "node",
      nodeId: "target",
      runId: "canvas-q-1",
      jobLabel: "Upscale",
      snapshot: {
        nodes: [
          {
            id: "target",
            type: "step",
            data: {
              ports: { inputs: [{ type: "image", valueKey: "image" }] },
              values: {
                image: [
                  { kind: "input-image", name: "a.png", url: "/api/input-image?name=a.png" },
                  { kind: "input-image", name: "b.png", url: "/api/input-image?name=b.png" }
                ]
              }
            }
          }
        ],
        edges: []
      }
    };

    const jobs = await expandCanvasRunJobImageBatches(job, { rootNodeId: "target" });

    expect(jobs).toHaveLength(2);
    expect(jobs.map(item => item.runId)).toEqual(["canvas-q-1-b1", "canvas-q-1-b2"]);
    expect(jobs.map(item => item.jobLabel)).toEqual(["Upscale (1/2)", "Upscale (2/2)"]);
    expect(jobs[0].snapshot.nodes[0].data.values.image.name).toBe("a.png");
    expect(jobs[1].snapshot.nodes[0].data.values.image.name).toBe("b.png");
  });
});
