import { describe, expect, test } from "vitest";
import { hasPendingColorAdjust, mimeTypeForFilename, runColorPipelineOffThread } from "../src/lib/adjustedRender.js";
import { applyColorPipeline, cloneDefaultAdjustments } from "../src/lib/imageAdjustments.js";

describe("adjusted output render", () => {
  test("detects colour states that still change the image", () => {
    expect(hasPendingColorAdjust(null)).toBe(false);
    expect(hasPendingColorAdjust({ adjustments: cloneDefaultAdjustments() })).toBe(false);
    expect(hasPendingColorAdjust({ adjustments: { ...cloneDefaultAdjustments(), contrast: 10 } })).toBe(true);
    expect(hasPendingColorAdjust({ adjustments: cloneDefaultAdjustments(), healingStrokes: [{ points: [] }] })).toBe(true);
  });

  test("off-thread pipeline falls back to the same result without workers", async () => {
    const adjustments = { ...cloneDefaultAdjustments(), saturation: -30, contrast: 20 };
    const make = () => ({ data: new Uint8ClampedArray([200, 120, 40, 255, 10, 90, 220, 255]), width: 2, height: 1 });
    const expected = make();
    applyColorPipeline(expected, adjustments, { scale: 1, seed: 1 });
    const result = await runColorPipelineOffThread(make(), adjustments, { scale: 1, seed: 1 });
    expect(Array.from(result.data)).toEqual(Array.from(expected.data));
  });

  test("keeps the output file type", () => {
    expect(mimeTypeForFilename("a.JPG")).toBe("image/jpeg");
    expect(mimeTypeForFilename("a.webp")).toBe("image/webp");
    expect(mimeTypeForFilename("a.png")).toBe("image/png");
  });
});
