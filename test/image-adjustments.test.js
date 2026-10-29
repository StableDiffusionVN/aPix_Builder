import { describe, expect, test } from "vitest";
import {
  applyColorPipeline,
  applyHslChannelMixRgb,
  buildMonotoneCurve,
  cloneDefaultAdjustments,
  getSplineLut,
  rgbToHsl
} from "../src/lib/imageAdjustments.js";

function makeImage(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function solid(rgb, size = 8) {
  return makeImage(size, size, () => rgb);
}

function run(image, patch) {
  const adjustments = { ...cloneDefaultAdjustments(), ...patch };
  applyColorPipeline(image, adjustments);
  return image;
}

function pixel(image, x = 0, y = 0) {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

describe("tone ranges", () => {
  test("Shadows keeps pure black black, still lifts dark tones", () => {
    expect(pixel(run(solid([0, 0, 0]), { shadows: 100 }))).toEqual([0, 0, 0]);
    const lifted = pixel(run(solid([50, 50, 50]), { shadows: 60 }))[0];
    expect(lifted).toBeGreaterThan(60);
  });

  test("Highlights keeps pure white, pulls bright tones down", () => {
    expect(pixel(run(solid([255, 255, 255]), { highlights: -100 }))).toEqual([255, 255, 255]);
    expect(pixel(run(solid([200, 200, 200]), { highlights: -100 }))[0]).toBeLessThan(190);
  });

  test("Blacks + gives only a slight matte lift", () => {
    const [r] = pixel(run(solid([0, 0, 0]), { blacks: 14 }));
    expect(r).toBeLessThanOrEqual(3);
  });

  test("local tone mapping preserves edge detail when compressing highlights", () => {
    const image = makeImage(64, 64, x => (x < 32 ? [215, 215, 215] : [235, 235, 235]));
    run(image, { highlights: -100 });
    const left = pixel(image, 10, 32)[0];
    const right = pixel(image, 54, 32)[0];
    expect(right - left).toBeGreaterThanOrEqual(15);
  });
});

describe("contrast and exposure", () => {
  test("contrast pivots around 18% grey", () => {
    const mid = pixel(run(solid([118, 118, 118]), { contrast: 100 }))[0];
    expect(Math.abs(mid - 118)).toBeLessThanOrEqual(2);
    expect(pixel(run(solid([200, 200, 200]), { contrast: 100 }))[0]).toBeGreaterThan(205);
    expect(pixel(run(solid([60, 60, 60]), { contrast: 100 }))[0]).toBeLessThan(55);
  });

  test("exposure rolls highlights off instead of clipping them together", () => {
    const a = pixel(run(solid([200, 200, 200]), { luminance: 60 }))[0];
    const b = pixel(run(solid([240, 240, 240]), { luminance: 60 }))[0];
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(255);
  });

  test("temperature shifts colour without changing grey luminance much", () => {
    const [r, g, b] = pixel(run(solid([128, 128, 128]), { temperature: 50 }));
    expect(r).toBeGreaterThan(b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(Math.abs(luma - 128)).toBeLessThan(6);
  });
});

describe("colour", () => {
  test("saturation -100 gives neutral grey", () => {
    const [r, g, b] = pixel(run(solid([200, 60, 40]), { saturation: -100 }));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1);
  });

  test("HSL band fades out smoothly at its edge (no hard step)", () => {
    // Two oranges just inside the band edge must stay close after a strong shift.
    const edgeA = rgbToHsl(255, 199, 128).h;
    expect(edgeA).toBeGreaterThan(30);
    const adjust = [{ center: 28, radius: 22, h: 0, s: -100, l: 0 }];
    const nearEdge = applyHslChannelMixRgb(255, 207, 128, adjust); // hue ≈ 37°
    const original = { r: 255, g: 207, b: 128 };
    expect(Math.abs(nearEdge.b - original.b)).toBeLessThan(40);
  });

  test("HSL band in the pipeline uses sRGB hue (matches the colour picker)", () => {
    const hsl = { oranges: { h: 0, s: -100, l: 0 } };
    // Saturated orange (hue ≈ 28° in sRGB) must be desaturated.
    const [r, g, b] = pixel(run(solid([230, 120, 30]), { hsl: { ...cloneDefaultAdjustments().hsl, ...hsl } }));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(30);
    // Pure blue must be untouched.
    expect(pixel(run(solid([30, 60, 220]), { hsl: { ...cloneDefaultAdjustments().hsl, ...hsl } }))).toEqual([30, 60, 220]);
  });
});

describe("effects", () => {
  test("negative vignette darkens corners, positive lightens", () => {
    const dark = run(solid([128, 128, 128], 32), { vignette: -60 });
    expect(pixel(dark, 0, 0)[0]).toBeLessThan(110);
    expect(pixel(dark, 16, 16)[0]).toBe(128);
    const light = run(solid([128, 128, 128], 32), { vignette: 60 });
    expect(pixel(light, 0, 0)[0]).toBeGreaterThan(140);
  });

  test("grain size follows source pixels (preview scale)", () => {
    const measure = scale => {
      const image = solid([128, 128, 128], 64);
      applyColorPipeline(image, { ...cloneDefaultAdjustments(), grain: 60, grainSize: 100, grainRoughness: 100 }, { scale });
      let diff = 0;
      for (let x = 1; x < 64; x++) diff += Math.abs(pixel(image, x, 10)[0] - pixel(image, x - 1, 10)[0]);
      return diff;
    };
    // Downscaled preview packs more grain cells per pixel → busier neighbourhood.
    expect(measure(0.25)).toBeGreaterThan(measure(1));
  });

  test("identity adjustments leave the image unchanged", () => {
    const image = makeImage(16, 16, (x, y) => [x * 16, y * 16, 128]);
    const before = Array.from(image.data);
    run(image, {});
    expect(Array.from(image.data)).toEqual(before);
  });
});

describe("curves", () => {
  test("monotone spline never overshoots between points", () => {
    const curve = buildMonotoneCurve([
      { x: 0, y: 0 },
      { x: 0.3, y: 0.6 },
      { x: 0.35, y: 0.62 },
      { x: 1, y: 1 }
    ]);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] - 1e-6);
    expect(Math.max(...curve)).toBeLessThanOrEqual(1);
  });

  test("getSplineLut keeps identity for default points", () => {
    const lut = getSplineLut([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    for (let i = 0; i < 256; i++) expect(lut[i]).toBe(i);
  });
});
