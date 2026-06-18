import { describe, expect, test } from "vitest";
import { downstreamStepIds, topoOrder } from "../src/features/canvas/canvasModel.js";

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
