import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { parseCubeLut, sampleCubeLut, serializeCubeLut } from "../shared/cubeLut.js";
import {
  adjustmentsMatchPreset,
  applyColorPipeline,
  bakeAdjustmentsLut,
  cloneDefaultAdjustments,
  findActivePresetId,
  mergePresetAdjustments,
  PRESETS,
  scalePresetAdjustments
} from "../src/lib/imageAdjustments.js";
import { setLoadedLut } from "../src/lib/lutStore.js";
import { mergeColorAdjustGroups, normalizePersistedColorState } from "../src/lib/colorAdjustPersistence.js";
import { createLutRoutes } from "../server/routes/luts.js";

function solid(rgb, size = 8) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width: size, height: size };
}

function run(rgb, patch, options) {
  const image = solid(rgb);
  applyColorPipeline(image, { ...cloneDefaultAdjustments(), ...patch }, options);
  return [image.data[0], image.data[1], image.data[2]];
}

function identityCube(size) {
  const lines = [`LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) lines.push(`${r / (size - 1)} ${g / (size - 1)} ${b / (size - 1)}`);
    }
  }
  return lines.join("\n");
}

describe(".cube LUT", () => {
  test("parse + serialise round trip", () => {
    const lut = parseCubeLut(`TITLE "Test"\n# comment\n${identityCube(3)}`);
    expect(lut.title).toBe("Test");
    expect(lut.size).toBe(3);
    const again = parseCubeLut(serializeCubeLut(lut));
    expect(Array.from(again.data)).toEqual(Array.from(lut.data).map(v => Number(v.toFixed(6))));
  });

  test("rejects malformed files", () => {
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0")).toThrow(/thiếu dữ liệu/i);
    expect(() => parseCubeLut("LUT_1D_SIZE 16")).toThrow(/3D/);
    expect(() => parseCubeLut("0 0 0")).toThrow(/LUT_3D_SIZE/);
  });

  test("trilinear sampling of identity is exact", () => {
    const lut = parseCubeLut(identityCube(5));
    const out = [0, 0, 0];
    sampleCubeLut(lut, 0.13, 0.77, 0.5, out);
    out.forEach((v, i) => expect(v).toBeCloseTo([0.13, 0.77, 0.5][i], 6));
  });

  test("baking neutral adjustments yields an identity LUT", () => {
    const lut = bakeAdjustmentsLut(cloneDefaultAdjustments(), 9);
    const out = [0, 0, 0];
    sampleCubeLut(lut, 0.3, 0.6, 0.9, out);
    out.forEach((v, i) => expect(v).toBeCloseTo([0.3, 0.6, 0.9][i], 3));
  });

  test("baked LUT reproduces the per-pixel pipeline", () => {
    const adjustments = { ...cloneDefaultAdjustments(), saturation: -40, temperature: 20, contrast: 25 };
    const lut = bakeAdjustmentsLut(adjustments, 33);
    const direct = run([180, 90, 60], adjustments);
    const out = [0, 0, 0];
    sampleCubeLut(lut, 180 / 255, 90 / 255, 60 / 255, out);
    out.forEach((v, i) => expect(Math.abs(v * 255 - direct[i])).toBeLessThanOrEqual(2));
  });

  test("imported LUT is applied with its amount", () => {
    const invert = parseCubeLut(identityCube(2).replace(/^(?!LUT)(\S+) (\S+) (\S+)$/gm, (_, r, g, b) => `${1 - r} ${1 - g} ${1 - b}`));
    setLoadedLut("lut_test_invert", invert);
    expect(run([200, 100, 50], { lut: { id: "lut_test_invert", name: "inv", amount: 100 } })).toEqual([55, 155, 205]);
    const half = run([200, 100, 50], { lut: { id: "lut_test_invert", name: "inv", amount: 50 } });
    expect(Math.abs(half[0] - 128)).toBeLessThanOrEqual(1);
    // Unknown LUT id is ignored instead of breaking the render.
    expect(run([200, 100, 50], { lut: { id: "lut_missing", name: "x", amount: 100 } })).toEqual([200, 100, 50]);
  });

  test("large images use the baked colour stage with matching output", () => {
    const adjustments = { vibrance: 30, hue: 10, grading: { shadows: { h: 200, s: 30 }, midtones: { h: 0, s: 0 }, highlights: { h: 40, s: 20 }, balance: 0 } };
    const direct = run([120, 160, 90], adjustments, { bake: false });
    const baked = run([120, 160, 90], adjustments, { bake: true });
    baked.forEach((v, i) => expect(Math.abs(v - direct[i])).toBeLessThanOrEqual(1));
  });
});

describe("colour grading", () => {
  const grading = (zone, h, s) => ({
    shadows: { h: 0, s: 0 },
    midtones: { h: 0, s: 0 },
    highlights: { h: 0, s: 0 },
    balance: 0,
    [zone]: { h, s }
  });

  test("shadow tint colours shadows, leaves highlights nearly alone", () => {
    const [r, , b] = run([40, 40, 40], { grading: grading("shadows", 220, 80) });
    expect(b - r).toBeGreaterThan(8);
    const [hr, , hb] = run([235, 235, 235], { grading: grading("shadows", 220, 80) });
    expect(Math.abs(hb - hr)).toBeLessThanOrEqual(2);
  });

  test("highlight tint warms bright areas", () => {
    const [r, , b] = run([220, 220, 220], { grading: grading("highlights", 35, 80) });
    expect(r - b).toBeGreaterThan(8);
  });

  test("grading tones a B&W image (applied after desaturation)", () => {
    const [r, , b] = run([200, 60, 40], { saturation: -100, grading: grading("midtones", 35, 60) });
    expect(r).toBeGreaterThan(b);
  });
});

describe("preset amount", () => {
  const cinematic = PRESETS.find(item => item.id === "cinematic");

  test("100% is the preset itself, 0% is neutral", () => {
    expect(scalePresetAdjustments(cinematic.adjustments, 100)).toBe(cinematic.adjustments);
    const neutral = mergePresetAdjustments(cloneDefaultAdjustments(), scalePresetAdjustments(cinematic.adjustments, 0));
    expect(findActivePresetId(neutral)).toBe("original");
  });

  test("scaling halves sliders, grading saturation and curve offsets", () => {
    const half = scalePresetAdjustments(cinematic.adjustments, 50);
    expect(half.contrast).toBe(7);
    expect(half.grading.shadows).toEqual({ h: 195, s: 18 });
    expect(half.curves.rgb[0]).toEqual({ x: 0, y: 4 });
  });

  test("scaled preset is recognised for that amount only", () => {
    const applied = mergePresetAdjustments(cloneDefaultAdjustments(), scalePresetAdjustments(cinematic.adjustments, 60));
    expect(adjustmentsMatchPreset(applied, scalePresetAdjustments(cinematic.adjustments, 60))).toBe(true);
    expect(adjustmentsMatchPreset(applied, cinematic.adjustments)).toBe(false);
  });

  test("every built-in preset matches itself after merging", () => {
    for (const item of PRESETS) {
      const applied = mergePresetAdjustments(cloneDefaultAdjustments(), item.adjustments);
      expect(findActivePresetId(applied)).toBe(item.id);
    }
  });
});

describe("persistence", () => {
  test("old saved states gain neutral grading and no LUT", () => {
    const state = normalizePersistedColorState({ adjustments: { contrast: 10 } });
    expect(state.adjustments.grading.shadows).toEqual({ h: 0, s: 0 });
    expect(state.adjustments.lut).toBeNull();
  });

  test("HSL sync group carries grading and LUT", () => {
    const source = { adjustments: { grading: { shadows: { h: 200, s: 30 } }, lut: { id: "lut_a", name: "A", amount: 70 } } };
    const merged = mergeColorAdjustGroups({ adjustments: {} }, source, ["hsl"]);
    expect(merged.adjustments.grading.shadows).toEqual({ h: 200, s: 30 });
    expect(merged.adjustments.lut).toEqual({ id: "lut_a", name: "A", amount: 70 });
  });
});

describe("LUT library route", () => {
  let dir;
  afterAll(() => dir && rm(dir, { recursive: true, force: true }));

  test("import, list, fetch, delete", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "apix-luts-"));
    let pendingBody = "";
    let sendImpl = null;
    const routes = createLutRoutes({
      getStoragePaths: () => ({ personalDataDir: dir }),
      readBody: async () => pendingBody,
      send: (res, status, payload) => sendImpl(status, payload)
    });
    const request = (method, pathname, body = "") => new Promise((resolve, reject) => {
      pendingBody = body;
      sendImpl = (status, json) => resolve({ status, json });
      const res = {
        writeHead(status) { this.status = status; },
        end(text) { resolve({ status: this.status, text }); }
      };
      routes({ method }, res, new URL(`http://x${pathname}`)).catch(reject);
    });

    const bad = await request("POST", "/api/luts", JSON.stringify({ name: "bad", text: "nope" }));
    expect(bad.status).toBe(400);

    const created = await request("POST", "/api/luts", JSON.stringify({ name: "Ident", text: identityCube(2) }));
    expect(created.status).toBe(200);
    const { id } = created.json.lut;
    expect(created.json.lut).toMatchObject({ name: "Ident", size: 2 });

    const list = await request("GET", "/api/luts");
    expect(list.json.luts.map(item => item.id)).toEqual([id]);

    const file = await request("GET", `/api/luts/${id}`);
    expect(parseCubeLut(file.text).size).toBe(2);

    expect((await request("GET", "/api/luts/..%2Fetc")).status).toBe(404);

    await request("DELETE", `/api/luts/${id}`);
    expect((await request("GET", "/api/luts")).json.luts).toEqual([]);
  });

});
