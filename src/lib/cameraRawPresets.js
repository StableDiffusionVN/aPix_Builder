import { parseCameraRawXmp, parseCurveSequence, serializeCameraRawXmp } from "../../shared/cameraRawXmp.js";
import {
  buildMonotoneCurve,
  CALIBRATION_KEYS,
  clamp,
  cloneDefaultAdjustments,
  COLOR_CHANNELS,
  DEFAULT_CURVES,
  isCurveActive,
  mergePresetAdjustments,
  normalizeCalibration,
  normalizeGrading
} from "./imageAdjustments.js";

// Camera Raw band names ↔ aPix HSL channel ids (same 8 bands, same order).
const BANDS = ["Red", "Orange", "Yellow", "Green", "Aqua", "Blue", "Purple", "Magenta"];
const BAND_IDS = COLOR_CHANNELS.map(channel => channel.id);
// Camera Raw HSL hue ±100 moves a band roughly ±30°.
const HUE_SCALE = 0.3;

const DIRECT_KEYS = {
  Contrast2012: "contrast",
  Highlights2012: "highlights",
  Shadows2012: "shadows",
  Whites2012: "whites",
  Blacks2012: "blacks",
  Clarity2012: "clarity",
  Texture: "texture",
  Dehaze: "dehaze",
  Vibrance: "vibrance",
  Saturation: "saturation",
  IncrementalTemperature: "temperature",
  GrainAmount: "grain",
  GrainSize: "grainSize",
  GrainFrequency: "grainRoughness"
};

const CALIBRATION_XMP = {
  redHue: "RedHue",
  redSaturation: "RedSaturation",
  greenHue: "GreenHue",
  greenSaturation: "GreenSaturation",
  blueHue: "BlueHue",
  blueSaturation: "BlueSaturation",
  shadowTint: "ShadowTint"
};

const CURVE_SEQUENCES = {
  rgb: "ToneCurvePV2012",
  red: "ToneCurvePV2012Red",
  green: "ToneCurvePV2012Green",
  blue: "ToneCurvePV2012Blue"
};

const PARAMETRIC_KEYS = ["ParametricShadows", "ParametricDarks", "ParametricLights", "ParametricHighlights"];

// Everything aPix regenerates on export; all other settings pass through untouched.
const MAPPED_SETTINGS = new Set([
  ...Object.keys(DIRECT_KEYS),
  ...Object.values(CALIBRATION_XMP),
  ...PARAMETRIC_KEYS,
  ...BANDS.flatMap(band => [`HueAdjustment${band}`, `SaturationAdjustment${band}`, `LuminanceAdjustment${band}`, `GrayMixer${band}`]),
  "Exposure2012", "IncrementalTint", "ConvertToGrayscale",
  "SplitToningShadowHue", "SplitToningShadowSaturation", "SplitToningHighlightHue", "SplitToningHighlightSaturation", "SplitToningBalance",
  "ColorGradeShadowHue", "ColorGradeShadowSat", "ColorGradeHighlightHue", "ColorGradeHighlightSat",
  "ColorGradeMidtoneHue", "ColorGradeMidtoneSat", "ColorGradeBlending",
  "PostCropVignetteAmount", "VignetteAmount", "ToneCurveName2012", "ToneCurveName"
]);
const MAPPED_SEQUENCES = new Set([...Object.values(CURVE_SEQUENCES), "ToneCurve"]);

const toNumber = value => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(String(value).replace(/^\+/, ""));
  return Number.isFinite(number) ? number : null;
};

const signed = value => (value > 0 ? `+${value}` : String(value));

// Camera Raw parametric curve (applied before the point curve): each slider
// lifts/lowers a smooth bump over its tonal region.
function parametricCurve(settings) {
  const amounts = PARAMETRIC_KEYS.map(key => (toNumber(settings[key]) || 0) / 100);
  if (amounts.every(value => value === 0)) return null;
  const s1 = clamp((toNumber(settings.ParametricShadowSplit) ?? 25) / 100, 0.05, 0.9);
  const s2 = clamp((toNumber(settings.ParametricMidtoneSplit) ?? 50) / 100, s1 + 0.02, 0.95);
  const s3 = clamp((toNumber(settings.ParametricHighlightSplit) ?? 75) / 100, s2 + 0.02, 0.98);
  const ranges = [[0, s1], [s1, s2], [s2, s3], [s3, 1]];
  return x => {
    let y = x;
    ranges.forEach(([a, b], i) => {
      if (!amounts[i]) return;
      const center = (a + b) / 2;
      const half = Math.max(0.08, (b - a));
      const t = Math.max(0, 1 - Math.abs(x - center) / half);
      y += amounts[i] * 0.2 * t * t * (3 - 2 * t) * Math.min(1, x * 8) * Math.min(1, (1 - x) * 8);
    });
    return clamp(y, 0, 1);
  };
}

function composeMasterCurve(points, parametric) {
  if (!parametric) return points;
  const table = buildMonotoneCurve(points.map(pt => ({ x: pt.x / 255, y: pt.y / 255 })), 255);
  const out = [];
  for (let i = 0; i <= 16; i++) {
    const x = i / 16;
    const y = table[Math.round(parametric(x) * 255)];
    out.push({ x: Math.round(x * 255), y: clamp(Math.round(y * 255), 0, 255) });
  }
  return out;
}

/** Camera Raw preset (parsed) → aPix adjustments (+ the settings aPix cannot render). */
export function cameraRawToAdjustments(parsed) {
  const { settings = {}, sequences = {} } = parsed;
  const adjustments = cloneDefaultAdjustments();
  const read = key => toNumber(settings[key]);

  const exposure = read("Exposure2012");
  if (exposure !== null) adjustments.luminance = clamp(Math.round((2 ** exposure - 1) * 100), -100, 100);
  for (const [xmpKey, key] of Object.entries(DIRECT_KEYS)) {
    const value = read(xmpKey);
    if (value !== null) adjustments[key] = value;
  }
  // Camera Raw tint +: magenta; aPix tint +: green.
  if (read("IncrementalTint") !== null) adjustments.tint = -read("IncrementalTint");
  adjustments.vignette = read("PostCropVignetteAmount") ?? read("VignetteAmount") ?? 0;

  const grayscale = /^true$/i.test(settings.ConvertToGrayscale || "");
  BAND_IDS.forEach((id, index) => {
    const band = BANDS[index];
    adjustments.hsl[id] = grayscale
      ? { h: 0, s: 0, l: clamp(read(`GrayMixer${band}`) || 0, -100, 100) }
      : {
        h: clamp(Math.round((read(`HueAdjustment${band}`) || 0) * HUE_SCALE * 10) / 10, -180, 180),
        s: clamp(read(`SaturationAdjustment${band}`) || 0, -100, 100),
        l: clamp(read(`LuminanceAdjustment${band}`) || 0, -100, 100)
      };
  });
  if (grayscale) {
    adjustments.saturation = -100;
    adjustments.vibrance = 0;
  }

  const hasColorGrade = ["ColorGradeShadowSat", "ColorGradeMidtoneSat", "ColorGradeHighlightSat"].some(key => settings[key] !== undefined);
  const zone = (hueKey, satKey) => {
    const s = clamp(read(satKey) || 0, 0, 100);
    return { h: s ? clamp(read(hueKey) || 0, 0, 360) : 0, s };
  };
  adjustments.grading = normalizeGrading({
    shadows: hasColorGrade ? zone("ColorGradeShadowHue", "ColorGradeShadowSat") : zone("SplitToningShadowHue", "SplitToningShadowSaturation"),
    midtones: hasColorGrade ? zone("ColorGradeMidtoneHue", "ColorGradeMidtoneSat") : { h: 0, s: 0 },
    highlights: hasColorGrade ? zone("ColorGradeHighlightHue", "ColorGradeHighlightSat") : zone("SplitToningHighlightHue", "SplitToningHighlightSaturation"),
    balance: clamp(read("SplitToningBalance") || 0, -100, 100)
  });

  adjustments.calibration = normalizeCalibration(Object.fromEntries(
    CALIBRATION_KEYS.map(key => [key, read(CALIBRATION_XMP[key]) || 0])
  ));

  const master = parseCurveSequence(sequences.ToneCurvePV2012) || parseCurveSequence(sequences.ToneCurve) || DEFAULT_CURVES.rgb;
  adjustments.curves = {
    rgb: composeMasterCurve(master, parametricCurve(settings)),
    red: parseCurveSequence(sequences.ToneCurvePV2012Red) || DEFAULT_CURVES.red,
    green: parseCurveSequence(sequences.ToneCurvePV2012Green) || DEFAULT_CURVES.green,
    blue: parseCurveSequence(sequences.ToneCurvePV2012Blue) || DEFAULT_CURVES.blue
  };
  for (const [channel, points] of Object.entries(adjustments.curves)) {
    if (!isCurveActive(points)) adjustments.curves[channel] = DEFAULT_CURVES[channel].map(pt => ({ ...pt }));
  }

  for (const key of ["contrast", "highlights", "shadows", "whites", "blacks", "clarity", "texture", "dehaze", "vibrance", "saturation", "temperature", "tint", "vignette"]) {
    adjustments[key] = clamp(Math.round(adjustments[key]), -100, 100);
  }
  for (const key of ["grain", "grainSize", "grainRoughness"]) adjustments[key] = clamp(Math.round(adjustments[key]), 0, 100);
  return adjustments;
}

/** Settings aPix does not render (profile, sharpening, lens, masks…) — kept for export. */
export function cameraRawPassthrough(parsed) {
  return {
    settings: Object.fromEntries(Object.entries(parsed.settings || {}).filter(([key]) => !MAPPED_SETTINGS.has(key))),
    sequences: Object.fromEntries(Object.entries(parsed.sequences || {}).filter(([key]) => !MAPPED_SEQUENCES.has(key))),
    blocks: parsed.blocks || []
  };
}

/** Sparse diff against defaults — keeps bundled/stored presets small. */
export function compactAdjustments(adjustments) {
  const defaults = cloneDefaultAdjustments();
  const out = {};
  for (const [key, value] of Object.entries(adjustments)) {
    if (JSON.stringify(value) !== JSON.stringify(defaults[key])) out[key] = value;
  }
  return out;
}

/** Read an .xmp file into an aPix custom preset (with Camera Raw passthrough). */
export function importCameraRawPreset(text, fileName = "") {
  const parsed = parseCameraRawXmp(text);
  const name = parsed.name || String(fileName).replace(/\.xmp$/i, "") || "Camera Raw preset";
  return {
    name,
    adjustments: compactAdjustments(cameraRawToAdjustments(parsed)),
    cameraRaw: { group: parsed.group, uuid: parsed.uuid, ...cameraRawPassthrough(parsed) }
  };
}

function curveItems(points) {
  return (points || DEFAULT_CURVES.rgb).map(pt => `${Math.round(pt.x)}, ${Math.round(pt.y)}`);
}

/** aPix adjustments → Camera Raw settings (process 2012+ names). */
export function adjustmentsToCameraRaw(rawAdjustments) {
  const adjustments = mergePresetAdjustments(rawAdjustments, rawAdjustments);
  const settings = {};
  const gain = 1 + (Number(adjustments.luminance) || 0) / 100;
  settings.Exposure2012 = gain > 0 ? signed(Number(Math.log2(gain).toFixed(2))) : "-5.00";
  for (const [xmpKey, key] of Object.entries(DIRECT_KEYS)) {
    settings[xmpKey] = signed(Math.round(Number(adjustments[key]) || 0));
  }
  settings.IncrementalTint = signed(-Math.round(Number(adjustments.tint) || 0));

  const grayscale = Number(adjustments.saturation) <= -100;
  settings.ConvertToGrayscale = grayscale ? "True" : "False";
  if (grayscale) {
    settings.Saturation = "0";
    settings.Vibrance = "0";
  }
  BAND_IDS.forEach((id, index) => {
    const band = BANDS[index];
    const entry = adjustments.hsl[id];
    settings[`HueAdjustment${band}`] = signed(clamp(Math.round(entry.h / HUE_SCALE), -100, 100));
    settings[`SaturationAdjustment${band}`] = signed(Math.round(entry.s));
    settings[`LuminanceAdjustment${band}`] = signed(Math.round(entry.l));
    settings[`GrayMixer${band}`] = signed(Math.round(entry.l));
  });

  const { shadows, midtones, highlights, balance } = adjustments.grading;
  Object.assign(settings, {
    SplitToningShadowHue: String(Math.round(shadows.h)),
    SplitToningShadowSaturation: String(Math.round(shadows.s)),
    SplitToningHighlightHue: String(Math.round(highlights.h)),
    SplitToningHighlightSaturation: String(Math.round(highlights.s)),
    SplitToningBalance: signed(Math.round(balance)),
    ColorGradeShadowHue: String(Math.round(shadows.h)),
    ColorGradeShadowSat: String(Math.round(shadows.s)),
    ColorGradeMidtoneHue: String(Math.round(midtones.h)),
    ColorGradeMidtoneSat: String(Math.round(midtones.s)),
    ColorGradeHighlightHue: String(Math.round(highlights.h)),
    ColorGradeHighlightSat: String(Math.round(highlights.s)),
    ColorGradeBlending: "50"
  });

  for (const key of CALIBRATION_KEYS) settings[CALIBRATION_XMP[key]] = signed(Math.round(adjustments.calibration[key]));
  settings.PostCropVignetteAmount = signed(Math.round(Number(adjustments.vignette) || 0));
  for (const key of PARAMETRIC_KEYS) settings[key] = "0";

  const sequences = {};
  for (const [channel, key] of Object.entries(CURVE_SEQUENCES)) sequences[key] = curveItems(adjustments.curves[channel]);
  const curved = Object.keys(CURVE_SEQUENCES).some(channel => isCurveActive(adjustments.curves[channel]));
  settings.ToneCurveName2012 = curved ? "Custom" : "Linear";

  const unsupported = [];
  if (Number(adjustments.hue)) unsupported.push("Hue");
  if (Number(adjustments.blur)) unsupported.push("Blur");
  if (adjustments.invert) unsupported.push("Invert");
  if (adjustments.lut) unsupported.push("LUT");
  return { settings, sequences, unsupported };
}

/** Build a Lightroom-compatible .xmp for an aPix preset (keeps original passthrough). */
export function exportCameraRawPreset({ name, adjustments, cameraRaw }) {
  const mapped = adjustmentsToCameraRaw(adjustments || {});
  const passthrough = cameraRaw || {};
  const text = serializeCameraRawXmp({
    name,
    group: passthrough.group || "aPix",
    uuid: passthrough.uuid,
    settings: { ...(passthrough.settings || {}), ...mapped.settings },
    sequences: { ...(passthrough.sequences || {}), ...mapped.sequences },
    blocks: passthrough.blocks || []
  });
  return { text, unsupported: mapped.unsupported };
}
