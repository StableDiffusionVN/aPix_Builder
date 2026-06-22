import { describe, expect, test } from "vitest";
import { downstreamStepIds, topoOrder } from "../src/features/canvas/canvasModel.js";
import {
  canvasSnapshotsEqual,
  snapshotCanvasState
} from "../src/features/canvas/useCanvasProject.js";

function linearGraph(size) {
  const nodes = Array.from({ length: size }, (_, index) => ({
    id: `node-${index}`,
    type: "step",
    data: {}
  }));
  const edges = Array.from({ length: size - 1 }, (_, index) => ({
    id: `edge-${index}`,
    source: `node-${index}`,
    target: `node-${index + 1}`
  }));
  return { nodes, edges };
}

describe("canvas graph scalability", () => {
  test("uses structural sharing for undo snapshots", () => {
    const { nodes, edges } = linearGraph(5_000);
    const first = snapshotCanvasState(nodes, edges);
    const second = snapshotCanvasState(nodes, edges);

    expect(first.nodes).not.toBe(nodes);
    expect(first.edges).not.toBe(edges);
    expect(first.nodes[0]).toBe(nodes[0]);
    expect(first.edges[0]).toBe(edges[0]);
    expect(canvasSnapshotsEqual(first, second)).toBe(true);

    const movedNodes = nodes.map((node, index) => (
      index === 0 ? { ...node, position: { x: 1, y: 1 } } : node
    ));
    expect(canvasSnapshotsEqual(first, snapshotCanvasState(movedNodes, edges))).toBe(false);
  });

  test("keeps graph traversal linear for large workflows", () => {
    const { nodes, edges } = linearGraph(5_000);
    const startedAt = performance.now();
    const ordered = topoOrder(nodes, edges);
    const downstream = downstreamStepIds(nodes[0].id, edges, nodes);
    const durationMs = performance.now() - startedAt;

    expect(ordered).toHaveLength(nodes.length);
    expect(downstream).toHaveLength(nodes.length - 1);
    expect(durationMs).toBeLessThan(250);
  });
});
