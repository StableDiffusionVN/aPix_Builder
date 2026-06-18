import { describe, expect, test } from "vitest";
import { STEP_KINDS } from "../src/features/canvas/canvasModel.js";
import {
  captureCanvasRunSnapshot,
  createCanvasRunJob,
  snapshotHasRhSteps,
  snapshotRhApiKeyReady
} from "../src/features/canvas/canvasRunSnapshot.js";

const baseNodes = [
  {
    id: "s1",
    type: "source",
    position: { x: 0, y: 0 },
    data: { name: "Image", value: "/api/input-image?name=a.png" }
  },
  {
    id: "n1",
    type: "step",
    position: { x: 200, y: 0 },
    data: {
      kind: STEP_KINDS.LOCAL,
      ref: "flux",
      name: "Flux",
      values: { prompt: "sunset" },
      status: "idle"
    }
  }
];

const baseEdges = [
  { id: "e1", source: "s1", target: "n1", targetHandle: "in:image" }
];

const rhSettings = {
  tokens: [{ id: "t1", label: "Primary", apiKey: "key-abc", enabled: true }],
  tokenPolicy: "priority",
  rotateIndex: 0
};

describe("canvas run snapshot", () => {
  test("captureCanvasRunSnapshot deep-copies graph and settings", () => {
    const snapshot = captureCanvasRunSnapshot({
      nodes: baseNodes,
      edges: baseEdges,
      rhSettings
    });

    snapshot.nodes[1].data.values.prompt = "changed";
    snapshot.edges.push({ id: "e2", source: "n1", target: "n1" });
    snapshot.rhSettings.tokens[0].apiKey = "other";

    expect(baseNodes[1].data.values.prompt).toBe("sunset");
    expect(baseEdges).toHaveLength(1);
    expect(rhSettings.tokens[0].apiKey).toBe("key-abc");
    expect(snapshot.rhAuth?.apiKey).toBe("key-abc");
    expect(snapshot.capturedAt).toBeTruthy();
  });

  test("createCanvasRunJob embeds snapshot at send time", () => {
    const job = createCanvasRunJob({
      nodes: baseNodes,
      edges: baseEdges,
      rhSettings,
      type: "node",
      nodeId: "n1",
      jobLabel: "Flux",
      sequence: 1
    });

    expect(job.type).toBe("node");
    expect(job.nodeId).toBe("n1");
    expect(job.snapshot.nodes).toHaveLength(2);
    expect(job.snapshot.edges).toHaveLength(1);
    expect(job.runId).toMatch(/^canvas-q-/);
  });

  test("snapshotRhApiKeyReady uses snapshotted RH settings", () => {
    const rhNodes = [
      ...baseNodes,
      {
        id: "n2",
        type: "step",
        data: { kind: STEP_KINDS.RH_APP, ref: "99", name: "RH App" }
      }
    ];
    const withKey = captureCanvasRunSnapshot({ nodes: rhNodes, edges: [], rhSettings });
    const withoutKey = captureCanvasRunSnapshot({
      nodes: rhNodes,
      edges: [],
      rhSettings: { tokens: [{ id: "t1", label: "Primary", apiKey: "", enabled: true }] }
    });

    expect(snapshotHasRhSteps(withKey)).toBe(true);
    expect(snapshotRhApiKeyReady(withKey)).toBe(true);
    expect(snapshotRhApiKeyReady(withoutKey)).toBe(false);
    expect(snapshotRhApiKeyReady(captureCanvasRunSnapshot({
      nodes: baseNodes,
      edges: [],
      rhSettings: { tokens: [] }
    }))).toBe(true);
  });
});
