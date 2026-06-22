import { describe, expect, it } from "vitest";
import {
  canvasViewportsEqual,
  normalizeCanvasViewport
} from "../src/features/canvas/canvasViewport.js";

describe("canvasViewport", () => {
  it("normalizes valid viewport values", () => {
    expect(normalizeCanvasViewport({ x: 120, y: -40, zoom: 1.25 })).toEqual({
      x: 120,
      y: -40,
      zoom: 1.25
    });
  });

  it("rejects invalid viewport values", () => {
    expect(normalizeCanvasViewport(null)).toBeNull();
    expect(normalizeCanvasViewport({ x: "bad", y: 0, zoom: 1 })).toBeNull();
    expect(normalizeCanvasViewport({ x: 0, y: 0, zoom: 0 })).toBeNull();
  });

  it("compares viewports with tolerance", () => {
    expect(canvasViewportsEqual(
      { x: 10, y: 20, zoom: 1 },
      { x: 10.2, y: 20.3, zoom: 1 }
    )).toBe(true);
    expect(canvasViewportsEqual(
      { x: 10, y: 20, zoom: 1 },
      { x: 40, y: 20, zoom: 1 }
    )).toBe(false);
  });
});
