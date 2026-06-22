import { describe, expect, test } from "vitest";
import { calculateSmartGuides } from "../src/features/canvas/canvasSmartGuides.js";

const nodes = [
  { id: "dragged", position: { x: 0, y: 0 }, data: { size: { width: 100, height: 80 } } },
  { id: "target", position: { x: 200, y: 150 }, data: { size: { width: 100, height: 80 } } }
];

describe("canvas smart guides", () => {
  test("snaps on both axes and keeps one guide for each axis", () => {
    const result = calculateSmartGuides(nodes, "dragged", { x: 202, y: 148 });

    expect(result.position).toEqual({ x: 200, y: 150 });
    expect(result.guides.map(guide => guide.type)).toEqual(["v", "h"]);
  });

  test("does not snap outside the threshold", () => {
    expect(calculateSmartGuides(nodes, "dragged", { x: 120, y: 40 })).toEqual({
      position: { x: 120, y: 40 },
      guides: []
    });
  });

  test("ignores other selected nodes", () => {
    const selectedTarget = nodes.map(node => node.id === "target" ? { ...node, selected: true } : node);
    expect(calculateSmartGuides(selectedTarget, "dragged", { x: 202, y: 148 }).guides).toEqual([]);
  });
});
