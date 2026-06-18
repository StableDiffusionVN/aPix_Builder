import { describe, expect, test } from "vitest";
import { clampZoomScale, zoomPanAroundPoint } from "../src/hooks/useZoomableImage.js";

describe("zoomable image helpers", () => {
  test("clamps zoom scale to configured bounds", () => {
    expect(clampZoomScale(0.5, 1, 6)).toBe(1);
    expect(clampZoomScale(8, 1, 6)).toBe(6);
    expect(clampZoomScale(1.23456, 1, 6)).toBe(1.2346);
  });

  test("keeps the cursor point anchored while zooming", () => {
    expect(zoomPanAroundPoint({
      point: { x: 100, y: 50 },
      pan: { x: 0, y: 0 },
      previousScale: 1,
      nextScale: 2
    })).toEqual({ x: -100, y: -50 });
  });
});
