import { describe, expect, test } from "vitest";
import { parseCameraRawXmp } from "../shared/cameraRawXmp.js";
import {
  adjustmentsToCameraRaw,
  cameraRawToAdjustments,
  exportCameraRawPreset,
  importCameraRawPreset
} from "../src/lib/cameraRawPresets.js";
import {
  applyColorPipeline,
  buildCalibrationMatrix,
  cloneDefaultAdjustments,
  findActivePresetId,
  mergePresetAdjustments,
  PRESETS
} from "../src/lib/imageAdjustments.js";
import film from "../src/lib/presets/filmPresets.data.js";

const SAMPLE = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:Version="7.0"
   crs:ProcessVersion="6.7"
   crs:Exposure2012="+1.00"
   crs:Saturation="+8"
   crs:IncrementalTint="+10"
   crs:RedHue="+5"
   crs:ShadowTint="-2"
   crs:HueAdjustmentRed="+10"
   crs:SaturationAdjustmentGreen="-30"
   crs:LuminanceAdjustmentAqua="+20"
   crs:SplitToningShadowHue="210"
   crs:SplitToningShadowSaturation="20"
   crs:SplitToningBalance="+30"
   crs:GrainAmount="25"
   crs:GrainSize="30"
   crs:Highlights2012="-10"
   crs:Blacks2012="+25"
   crs:PostCropVignetteAmount="-15"
   crs:CameraProfile="Kodak Portra 400 2C"
   crs:Sharpness="25"
   crs:HasSettings="True">
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">Portra &amp; Co</rdf:li></rdf:Alt></crs:Name>
   <crs:Group><rdf:Alt><rdf:li xml:lang="x-default">Film</rdf:li></rdf:Alt></crs:Group>
   <crs:ToneCurvePV2012>
    <rdf:Seq>
     <rdf:li>0, 5</rdf:li>
     <rdf:li>255, 251</rdf:li>
    </rdf:Seq>
   </crs:ToneCurvePV2012>
   <crs:ToneCurvePV2012Red>
    <rdf:Seq>
     <rdf:li>0, 0</rdf:li>
     <rdf:li>116, 132</rdf:li>
     <rdf:li>255, 255</rdf:li>
    </rdf:Seq>
   </crs:ToneCurvePV2012Red>
   <crs:Look>
    <rdf:Description crs:Name="Adobe Color" crs:Amount="1"/>
   </crs:Look>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;

function pixel(rgb, adjustments) {
  const data = new Uint8ClampedArray([...rgb, 255]);
  const image = { data, width: 1, height: 1 };
  applyColorPipeline(image, mergePresetAdjustments(cloneDefaultAdjustments(), adjustments));
  return [data[0], data[1], data[2]];
}

describe("Camera Raw .xmp", () => {
  test("parses attributes, alt names, sequences; Look block is not read as settings", () => {
    const parsed = parseCameraRawXmp(SAMPLE);
    expect(parsed.name).toBe("Portra & Co");
    expect(parsed.group).toBe("Film");
    expect(parsed.settings.CameraProfile).toBe("Kodak Portra 400 2C");
    expect(parsed.settings.Name).toBeUndefined();
    expect(parsed.sequences.ToneCurvePV2012).toEqual(["0, 5", "255, 251"]);
    expect(parsed.blocks).toHaveLength(1);
  });

  test("maps to aPix adjustments", () => {
    const adj = cameraRawToAdjustments(parseCameraRawXmp(SAMPLE));
    expect(adj.luminance).toBe(100);
    expect(adj.saturation).toBe(8);
    expect(adj.tint).toBe(-10);
    expect(adj.hsl.reds.h).toBe(3);
    expect(adj.hsl.greens.s).toBe(-30);
    expect(adj.hsl.aquas.l).toBe(20);
    expect(adj.grading.shadows).toEqual({ h: 210, s: 20 });
    expect(adj.grading.balance).toBe(30);
    expect(adj.calibration.redHue).toBe(5);
    expect(adj.calibration.shadowTint).toBe(-2);
    expect(adj.curves.rgb).toEqual([{ x: 0, y: 5 }, { x: 255, y: 251 }]);
    expect(adj.curves.green).toEqual([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    expect(adj.vignette).toBe(-15);
    expect(adj.grain).toBe(25);
  });

  test("rejects non Camera Raw files", () => {
    expect(() => parseCameraRawXmp("<x:xmpmeta/>")).toThrow(/crs/);
  });

  test("export → import round trip keeps the look and unmapped settings", () => {
    const preset = importCameraRawPreset(SAMPLE, "x.xmp");
    const { text } = exportCameraRawPreset(preset);
    expect(text).toContain("crs:PresetType=\"Normal\"");
    expect(text).toContain("crs:CameraProfile=\"Kodak Portra 400 2C\"");
    expect(text).toContain("<rdf:li xml:lang=\"x-default\">Portra &amp; Co</rdf:li>");
    expect(text).toContain("crs:Look");
    const back = importCameraRawPreset(text, "x.xmp");
    expect(back.adjustments).toEqual(preset.adjustments);
    expect(back.name).toBe("Portra & Co");
  });

  test("aPix-only settings are reported on export", () => {
    const { unsupported, settings } = adjustmentsToCameraRaw({ ...cloneDefaultAdjustments(), hue: 20, blur: 2, saturation: -100 });
    expect(unsupported).toEqual(["Hue", "Blur"]);
    expect(settings.ConvertToGrayscale).toBe("True");
  });

  test("grayscale preset maps the B&W mixer to band luminance", () => {
    const xmp = SAMPLE.replace("crs:HasSettings", "crs:ConvertToGrayscale=\"True\" crs:GrayMixerRed=\"+40\" crs:HasSettings");
    const adj = cameraRawToAdjustments(parseCameraRawXmp(xmp));
    expect(adj.saturation).toBe(-100);
    expect(adj.hsl.reds).toEqual({ h: 0, s: 0, l: 40 });
  });

  test("parametric curve is folded into the master curve", () => {
    const xmp = SAMPLE.replace("crs:HasSettings", "crs:ParametricShadows=\"+60\" crs:HasSettings");
    const adj = cameraRawToAdjustments(parseCameraRawXmp(xmp));
    const quarter = adj.curves.rgb.find(pt => pt.x === 32);
    expect(quarter.y).toBeGreaterThan(36);
  });
});

describe("calibration", () => {
  test("zero calibration is the identity; greys stay neutral", () => {
    const identity = buildCalibrationMatrix({ redHue: 0, redSaturation: 0, greenHue: 0, greenSaturation: 0, blueHue: 0, blueSaturation: 0 });
    identity.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(i === j ? 1 : 0, 9)));
    const [r, g, b] = pixel([128, 128, 128], { calibration: { redHue: 60, greenSaturation: 80, blueHue: -40 } });
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1);
  });

  test("red primary hue + pushes reds towards yellow", () => {
    const base = pixel([200, 40, 40], {});
    const moved = pixel([200, 40, 40], { calibration: { redHue: 80 } });
    expect(moved[1] - base[1]).toBeGreaterThan(10);
  });
});

describe("bundled film presets", () => {
  test("ids are unique and each preset is recognised as itself", () => {
    const ids = new Set(film.presets.map(item => item.id));
    expect(ids.size).toBe(film.presets.length);
    expect(film.presets.length).toBeGreaterThan(200);
    const all = [...PRESETS, ...film.presets];
    for (const item of film.presets) {
      expect(film.groups.some(group => group.id === item.group)).toBe(true);
      const applied = mergePresetAdjustments(cloneDefaultAdjustments(), item.adjustments);
      expect(findActivePresetId(applied, all)).toBe(item.id);
    }
  });
});
