import { describe, expect, test } from "vitest";
import {
  outputEdgeClass,
  resolveConnectionOutputColorIndex,
  resolveEdgeOutputColorIndex
} from "../src/features/canvas/canvasOutputColors.js";

describe("canvas output edge colors", () => {
  const nodes = [
    {
      id: "step-1",
      type: "step",
      data: {
        ports: {
          outputs: [
            { key: "image", label: "Image" },
            { key: "mask", label: "Mask" }
          ]
        }
      }
    },
    {
      id: "split-mask",
      type: "source",
      data: {
        passthroughFromOutput: true,
        passthroughSourceNodeId: "step-1",
        passthroughOutputKey: "mask"
      }
    }
  ];

  test("maps step output handles to edge color classes", () => {
    const edge = {
      source: "step-1",
      sourceHandle: "out:mask"
    };
    expect(resolveEdgeOutputColorIndex(edge, nodes)).toBe(1);
    expect(outputEdgeClass(resolveEdgeOutputColorIndex(edge, nodes))).toBe("canvas-edge-out-1");
  });

  test("inherits passthrough source edge color from upstream output", () => {
    const edge = {
      source: "split-mask",
      sourceHandle: "out:main"
    };
    expect(resolveEdgeOutputColorIndex(edge, nodes)).toBe(1);
  });

  test("colors the drag preview line from the source output handle", () => {
    const step = nodes[0];
    expect(resolveConnectionOutputColorIndex(step, "out:image", nodes)).toBe(0);
    expect(resolveConnectionOutputColorIndex(step, "out:mask", nodes)).toBe(1);
  });
});
