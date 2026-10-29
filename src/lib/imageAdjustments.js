import { sampleCubeLut } from "../../shared/cubeLut.js";
import { getLoadedLut } from "./lutStore.js";
import { applyColorPipelineGpuToCanvas } from "./gpuPipeline.js";

export const HSL_CHANNEL_RADIUS = 32;

// Lightroom-style hue bands: orange covers skin (~12–48°), yellow starts ~40°.
export const COLOR_CHANNELS = [
  { id: "reds", name: "Red", center: 0, color: "#ef4444", radius: 14 },
  { id: "oranges", name: "Orange", center: 28, color: "#f97316", radius: 22 },
  { id: "yellows", name: "Yellow", center: 58, color: "#eab308", radius: 20 },
  { id: "greens", name: "Green", center: 125, color: "#22c55e", radius: 38 },
  { id: "aquas", name: "Aqua", center: 175, color: "#06b6d4", radius: 22 },
  { id: "blues", name: "Blue", center: 220, color: "#3b82f6", radius: 32 },
  { id: "purples", name: "Purple", center: 275, color: "#a855f7", radius: 22 },
  { id: "magentas", name: "Magenta", center: 315, color: "#ec4899", radius: 22 }
];

export const DEFAULT_HSL = Object.fromEntries(
  COLOR_CHANNELS.map(channel => [channel.id, { h: 0, s: 0, l: 0 }])
);

export const DEFAULT_CURVES = {
  rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
};

export const GRADING_ZONES = ["shadows", "midtones", "highlights"];

export const DEFAULT_GRADING = {
  shadows: { h: 0, s: 0 },
  midtones: { h: 0, s: 0 },
  highlights: { h: 0, s: 0 },
  balance: 0
};

export function normalizeGrading(grading) {
  const normalized = { balance: Number(grading?.balance) || 0 };
  for (const zone of GRADING_ZONES) {
    normalized[zone] = {
      h: Number(grading?.[zone]?.h) || 0,
      s: Number(grading?.[zone]?.s) || 0
    };
  }
  return normalized;
}

// Lightroom/Camera Raw "Calibration": hue/saturation of the RGB primaries + shadow tint.
export const CALIBRATION_KEYS = ["redHue", "redSaturation", "greenHue", "greenSaturation", "blueHue", "blueSaturation", "shadowTint"];

export const DEFAULT_CALIBRATION = Object.fromEntries(CALIBRATION_KEYS.map(key => [key, 0]));

export function normalizeCalibration(calibration) {
  return Object.fromEntries(CALIBRATION_KEYS.map(key => [key, clamp(Number(calibration?.[key]) || 0, -100, 100)]));
}

export function isCalibrationActive(calibration) {
  return Boolean(calibration) && CALIBRATION_KEYS.some(key => Number(calibration[key]) !== 0);
}

export function normalizeLutRef(lut) {
  if (!lut?.id) return null;
  return {
    id: String(lut.id),
    name: String(lut.name || lut.id),
    amount: Number.isFinite(Number(lut.amount)) ? Number(lut.amount) : 100
  };
}

export const DEFAULT_ADJUSTMENTS = {
  luminance: 0,
  contrast: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  hue: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  grain: 0,
  grainSize: 50,
  grainRoughness: 50,
  clarity: 0,
  dehaze: 0,
  texture: 0,
  vignette: 0,
  blur: 0,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  invert: false,
  hsl: DEFAULT_HSL,
  curves: DEFAULT_CURVES,
  grading: DEFAULT_GRADING,
  calibration: DEFAULT_CALIBRATION,
  lut: null
};

export const PRESET_GROUPS = [
  { id: "neutral", label: "Neutral" },
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
  { id: "creative", label: "Creative" },
  { id: "modern", label: "Modern" },
  { id: "bw", label: "B&W" },
  { id: "specialty", label: "Specialty" }
];

function preset(id, name, group, adjustments) {
  return { id, name, group, adjustments };
}

// Matte look: lift the black point / soften white with the RGB curve
// (Blacks no longer greys out pure black).
function matteCurves(black, white = 255, channels = {}) {
  return {
    ...DEFAULT_CURVES,
    rgb: [{ x: 0, y: black }, { x: 64, y: Math.round(black + (64 - black) * 0.82) }, { x: 255, y: white }],
    ...channels
  };
}

function grade(shadows, highlights, { midtones = [0, 0], balance = 0 } = {}) {
  return {
    shadows: { h: shadows[0], s: shadows[1] },
    midtones: { h: midtones[0], s: midtones[1] },
    highlights: { h: highlights[0], s: highlights[1] },
    balance
  };
}

export const PRESETS = [
  preset("original", "Original", "neutral", {}),

  preset("portrait", "Portrait", "portrait", {
    luminance: 3,
    contrast: -4,
    temperature: 4,
    vibrance: 8,
    saturation: -4,
    highlights: -15,
    shadows: 12,
    clarity: -10,
    texture: -12,
    hsl: { oranges: { h: -2, s: -6, l: 6 }, reds: { h: 0, s: -4, l: 0 } },
    grading: grade([0, 0], [40, 8])
  }),
  preset("portrait-soft", "Soft Portrait", "portrait", {
    luminance: 6,
    contrast: -12,
    vibrance: 4,
    saturation: -8,
    highlights: -20,
    shadows: 18,
    whites: -6,
    blacks: 4,
    clarity: -18,
    texture: -20,
    curves: matteCurves(10, 250),
    grading: grade([220, 6], [30, 10])
  }),
  preset("golden-skin", "Golden Skin", "portrait", {
    temperature: 8,
    tint: 3,
    vibrance: 6,
    highlights: -10,
    shadows: 8,
    clarity: -6,
    hsl: { oranges: { h: -3, s: 4, l: 8 }, yellows: { h: -6, s: -8, l: 0 } },
    grading: grade([0, 0], [38, 18], { midtones: [30, 8] })
  }),

  preset("landscape", "Landscape", "landscape", {
    contrast: 12,
    vibrance: 22,
    saturation: 4,
    highlights: -35,
    shadows: 25,
    whites: 8,
    blacks: -8,
    clarity: 18,
    dehaze: 12,
    hsl: {
      greens: { h: -8, s: 10, l: -4 },
      blues: { h: 0, s: 12, l: -10 },
      aquas: { h: 0, s: 8, l: 0 }
    }
  }),
  preset("landscape-autumn", "Autumn", "landscape", {
    contrast: 10,
    temperature: 14,
    vibrance: 15,
    highlights: -20,
    shadows: 15,
    clarity: 10,
    hsl: {
      reds: { h: 0, s: 8, l: 0 },
      oranges: { h: -4, s: 15, l: 4 },
      yellows: { h: -12, s: 12, l: 0 },
      greens: { h: -25, s: -15, l: -6 }
    },
    grading: grade([15, 8], [35, 15])
  }),
  preset("landscape-tropical", "Tropical", "landscape", {
    luminance: 3,
    contrast: 8,
    temperature: 3,
    tint: -3,
    vibrance: 25,
    saturation: 6,
    highlights: -18,
    shadows: 12,
    clarity: 10,
    dehaze: 8,
    hsl: {
      aquas: { h: -6, s: 18, l: 6 },
      greens: { h: 6, s: 10, l: 0 },
      blues: { h: -6, s: 12, l: -6 }
    }
  }),

  preset("cinematic", "Cinematic Teal & Orange", "creative", {
    luminance: -3,
    contrast: 14,
    vibrance: 10,
    saturation: -8,
    highlights: -18,
    shadows: 8,
    blacks: -6,
    clarity: 6,
    vignette: -14,
    curves: matteCurves(8, 248),
    hsl: {
      oranges: { h: 0, s: 8, l: 4 },
      blues: { h: -10, s: 10, l: -8 },
      aquas: { h: -10, s: 6, l: 0 }
    },
    grading: grade([195, 35], [32, 28], { balance: -10 })
  }),
  preset("moody", "Moody", "creative", {
    luminance: -8,
    contrast: 18,
    temperature: -6,
    vibrance: 4,
    saturation: -18,
    highlights: -30,
    shadows: 4,
    whites: -10,
    blacks: -14,
    clarity: 12,
    vignette: -22,
    hsl: {
      greens: { h: -15, s: -30, l: -10 },
      blues: { h: 0, s: -10, l: -10 }
    },
    grading: grade([215, 22], [40, 8], { midtones: [200, 6] })
  }),
  preset("warm-film", "Warm Film", "creative", {
    contrast: 6,
    temperature: 8,
    saturation: -6,
    highlights: -15,
    shadows: 10,
    grain: 12,
    grainSize: 55,
    curves: matteCurves(14, 246),
    grading: grade([180, 10], [40, 18])
  }),
  preset("vintage", "Vintage", "creative", {
    contrast: -8,
    temperature: 12,
    tint: 6,
    saturation: -15,
    highlights: -15,
    shadows: 10,
    clarity: -8,
    grain: 20,
    grainSize: 58,
    grainRoughness: 48,
    vignette: -18,
    curves: matteCurves(22, 240, { blue: [{ x: 0, y: 26 }, { x: 255, y: 232 }] }),
    grading: grade([160, 12], [45, 20])
  }),
  preset("fade", "Matte Fade", "creative", {
    contrast: -10,
    saturation: -12,
    highlights: -10,
    shadows: 10,
    clarity: -6,
    grain: 8,
    vignette: -8,
    curves: matteCurves(30, 245),
    grading: grade([210, 8], [0, 0])
  }),
  preset("cross-process", "Cross Process", "creative", {
    contrast: 15,
    vibrance: 10,
    highlights: -10,
    curves: {
      ...DEFAULT_CURVES,
      red: [{ x: 0, y: 0 }, { x: 64, y: 50 }, { x: 192, y: 210 }, { x: 255, y: 255 }],
      green: [{ x: 0, y: 0 }, { x: 64, y: 70 }, { x: 192, y: 200 }, { x: 255, y: 245 }],
      blue: [{ x: 0, y: 40 }, { x: 128, y: 128 }, { x: 255, y: 210 }]
    },
    grading: grade([170, 15], [55, 15])
  }),

  preset("bright-airy", "Bright & Airy", "modern", {
    luminance: 14,
    contrast: -12,
    temperature: 2,
    vibrance: 8,
    saturation: -6,
    highlights: -25,
    shadows: 25,
    whites: 10,
    blacks: 6,
    clarity: -12,
    texture: -6,
    curves: matteCurves(10, 255),
    hsl: {
      blues: { h: 0, s: -10, l: 8 },
      greens: { h: 0, s: -10, l: 6 }
    }
  }),
  preset("pastel", "Pastel", "modern", {
    luminance: 8,
    contrast: -16,
    vibrance: 10,
    saturation: -20,
    highlights: -20,
    shadows: 20,
    curves: matteCurves(18, 250),
    grading: grade([200, 10], [330, 10])
  }),
  preset("deep-rich", "Deep & Rich", "modern", {
    luminance: -4,
    contrast: 16,
    vibrance: 12,
    saturation: 4,
    highlights: -18,
    shadows: 6,
    blacks: -14,
    clarity: 12,
    dehaze: 6,
    hsl: {
      reds: { h: 0, s: 6, l: -6 },
      blues: { h: 0, s: 6, l: -8 }
    },
    grading: grade([230, 10], [0, 0])
  }),
  preset("punchy", "Punchy", "modern", {
    contrast: 18,
    vibrance: 22,
    saturation: 6,
    highlights: -10,
    shadows: 8,
    whites: 8,
    blacks: -10,
    clarity: 14,
    texture: 10
  }),
  preset("vibrant", "Vibrant", "modern", {
    contrast: 8,
    vibrance: 30,
    saturation: 8,
    highlights: -8,
    shadows: 6,
    clarity: 6,
    dehaze: 6
  }),

  preset("blackwhite", "B&W", "bw", {
    saturation: -100,
    contrast: 14,
    highlights: -10,
    shadows: 10,
    blacks: -6,
    clarity: 10
  }),
  preset("bw-contrast", "B&W Contrast", "bw", {
    saturation: -100,
    contrast: 30,
    highlights: -18,
    shadows: 4,
    whites: 14,
    blacks: -20,
    clarity: 18
  }),
  preset("bw-noir", "Noir", "bw", {
    luminance: -6,
    saturation: -100,
    contrast: 35,
    highlights: -10,
    whites: 10,
    blacks: -30,
    clarity: 15,
    vignette: -30,
    grain: 10
  }),
  preset("bw-matte", "B&W Matte", "bw", {
    saturation: -100,
    contrast: -6,
    shadows: 12,
    clarity: -4,
    grain: 12,
    grainSize: 52,
    curves: matteCurves(24, 250)
  }),
  preset("bw-silver", "Silver Gelatin", "bw", {
    saturation: -100,
    contrast: 18,
    blacks: -8,
    clarity: 16,
    texture: 10,
    grain: 14,
    grainRoughness: 36,
    grading: grade([220, 5], [40, 6])
  }),

  preset("golden-hour", "Golden Hour", "specialty", {
    contrast: 6,
    temperature: 15,
    tint: 4,
    vibrance: 10,
    highlights: -15,
    shadows: 10,
    vignette: -10,
    hsl: {
      oranges: { h: 0, s: 6, l: 4 },
      yellows: { h: -6, s: 6, l: 0 }
    },
    grading: grade([270, 6], [38, 25], { midtones: [30, 8] })
  }),
  preset("cool-nordic", "Cool Nordic", "specialty", {
    contrast: 8,
    temperature: -14,
    tint: -3,
    vibrance: 6,
    saturation: -12,
    highlights: -15,
    shadows: 10,
    clarity: 8,
    dehaze: 8,
    hsl: {
      blues: { h: 0, s: 8, l: -6 },
      greens: { h: 10, s: -25, l: 0 }
    },
    grading: grade([210, 15], [190, 6])
  }),
  preset("street", "Street", "specialty", {
    contrast: 16,
    vibrance: 6,
    saturation: -15,
    highlights: -15,
    shadows: 10,
    blacks: -12,
    clarity: 20,
    texture: 10,
    dehaze: 4,
    vignette: -12,
    grading: grade([200, 10], [0, 0])
  }),
  preset("food", "Food", "specialty", {
    luminance: 4,
    contrast: 8,
    temperature: 6,
    vibrance: 15,
    saturation: 4,
    highlights: -12,
    shadows: 8,
    clarity: 8,
    texture: 8,
    hsl: {
      reds: { h: 0, s: 6, l: 0 },
      oranges: { h: 0, s: 8, l: 4 },
      yellows: { h: 0, s: 6, l: 4 },
      greens: { h: 0, s: 8, l: 0 }
    }
  }),
  preset("night", "Night", "specialty", {
    luminance: 8,
    contrast: 10,
    temperature: -10,
    tint: -2,
    vibrance: 10,
    saturation: -4,
    highlights: -20,
    shadows: 20,
    blacks: -6,
    clarity: 6,
    dehaze: 6,
    vignette: -12,
    grading: grade([225, 18], [35, 8])
  }),
  preset("editorial", "Editorial", "specialty", {
    luminance: -2,
    contrast: 16,
    saturation: -14,
    highlights: -20,
    shadows: 6,
    whites: 6,
    blacks: -10,
    clarity: 12,
    texture: 6,
    vignette: -10,
    grading: grade([200, 8], [40, 6])
  }),
  preset("dramatic", "Dramatic", "specialty", {
    luminance: -6,
    contrast: 24,
    vibrance: 6,
    saturation: -14,
    highlights: -30,
    shadows: -6,
    whites: 12,
    blacks: -18,
    clarity: 24,
    dehaze: 12,
    vignette: -18,
    grading: grade([215, 12], [0, 0])
  })
];

export const PREVIEW_MAX_EDGE = 1024;
export const PREVIEW_INTERACTIVE_MAX_EDGE = 640;

export function getAdjustmentGeometryKey(adjustments, maxEdge = PREVIEW_MAX_EDGE) {
  if (!adjustments) return "";
  return [
    adjustments.cropTop,
    adjustments.cropRight,
    adjustments.cropBottom,
    adjustments.cropLeft,
    adjustments.rotation,
    adjustments.flipH,
    adjustments.flipV,
    maxEdge
  ].join("|");
}

export function canvasToPreviewDataUrl(canvas, { interactive = false } = {}) {
  return interactive
    ? canvas.toDataURL("image/jpeg", 0.86)
    : canvas.toDataURL("image/png");
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function clampCrop(value) {
  return clamp(Number(value) || 0, 0, 95);
}

export function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    if (max === gn) h = (bn - rn) / d + 2;
    if (max === bn) h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb(h, s, l) {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  if (sn === 0) {
    const grey = ln * 255;
    return { r: grey, g: grey, b: grey };
  }
  const hue2rgb = (p, q, t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return {
    r: hue2rgb(p, q, hn + 1 / 3) * 255,
    g: hue2rgb(p, q, hn) * 255,
    b: hue2rgb(p, q, hn - 1 / 3) * 255
  };
}

export function normalizeHslAdjustments(hsl) {
  const normalized = {};
  for (const channel of COLOR_CHANNELS) {
    const entry = hsl?.[channel.id];
    normalized[channel.id] = {
      h: Number(entry?.h) || 0,
      s: Number(entry?.s) || 0,
      l: Number(entry?.l) || 0
    };
  }
  return normalized;
}

export function hueDistance(a, b) {
  const diff = Math.abs(((a - b + 180) % 360) - 180);
  return Math.abs(diff);
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function getHslChannelWeight(hue, center, radius = HSL_CHANNEL_RADIUS) {
  const dist = hueDistance(hue, center);
  if (dist >= radius) return 0;
  return smoothstep(1 - dist / radius);
}

export function sampleCanvasPixel(canvas, x, y) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx || !canvas?.width || !canvas?.height) return null;
  const px = clamp(Math.round(x), 0, canvas.width - 1);
  const py = clamp(Math.round(y), 0, canvas.height - 1);
  const data = ctx.getImageData(px, py, 1, 1).data;
  if (data[3] === 0) return null;
  return { r: data[0], g: data[1], b: data[2] };
}

export function getDominantHslChannelId(r, g, b) {
  const hsl = rgbToHsl(r, g, b);
  let bestId = COLOR_CHANNELS[0].id;
  let bestWeight = 0;
  for (const channel of COLOR_CHANNELS) {
    const radius = channel.radius ?? HSL_CHANNEL_RADIUS;
    const weight = getHslChannelWeight(hsl.h, channel.center, radius) * Math.max(hsl.s, 8) / 100;
    if (weight > bestWeight) {
      bestWeight = weight;
      bestId = channel.id;
    }
  }
  return bestId;
}

export function getCurveSampleFromPixel(r, g, b, channel = "rgb") {
  if (channel === "red") return { x: r, y: r };
  if (channel === "green") return { x: g, y: g };
  if (channel === "blue") return { x: b, y: b };
  const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return { x: luma, y: luma };
}

export function upsertCurvePoint(points, sample) {
  const x = clamp(Math.round(sample.x), 0, 255);
  const y = clamp(Math.round(sample.y), 0, 255);

  let closestIdx = -1;
  let minDist = 10;
  points.forEach((pt, idx) => {
    const dist = Math.abs(pt.x - x);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = idx;
    }
  });
  if (closestIdx !== -1) {
    return { points, selectedIndex: closestIdx };
  }

  let insertIdx = -1;
  for (let i = 0; i < points.length; i++) {
    if (x < points[i].x) {
      insertIdx = i;
      break;
    }
  }

  if (insertIdx > 0) {
    const prev = points[insertIdx - 1];
    const next = points[insertIdx];
    if (x > prev.x + 2 && x < next.x - 2) {
      const nextPoints = [...points];
      nextPoints.splice(insertIdx, 0, { x, y });
      return { points: nextPoints, selectedIndex: insertIdx };
    }
    return { points, selectedIndex: x - prev.x < next.x - x ? insertIdx - 1 : insertIdx };
  }

  return { points, selectedIndex: closestIdx !== -1 ? closestIdx : 0 };
}

function hslChromaGate(saturation) {
  return smoothstep(Math.min(1, Math.max(0, saturation) / 18));
}

function hslLuminanceGate(saturation, lightness) {
  const satFactor = smoothstep(Math.min(1, Math.max(0, saturation) / 24));
  const lumFactor = 0.35 + 0.65 * smoothstep(Math.min(1, Math.max(0, lightness) / 100));
  return Math.max(satFactor, 0.2 * lumFactor);
}

function applyLuminanceShiftRgb(r, g, b, lumDelta) {
  const amount = lumDelta * 0.55;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const targetLuma = clamp(luma + amount, 0, 255);
  if (luma <= 0.001) {
    return { r: targetLuma, g: targetLuma, b: targetLuma };
  }
  const scale = targetLuma / luma;
  return {
    r: clamp(r * scale, 0, 255),
    g: clamp(g * scale, 0, 255),
    b: clamp(b * scale, 0, 255)
  };
}

function applySingleChannelHslToRgb(hsl, { h, s, l }) {
  const hueGate = hslChromaGate(hsl.s);
  const satGate = hslChromaGate(hsl.s);
  const lumGate = hslLuminanceGate(hsl.s, hsl.l);

  let nextH = hsl.h;
  let nextS = hsl.s;

  if (h !== 0) {
    nextH = hsl.h + h * hueGate;
  }

  if (s !== 0) {
    if (s < 0) {
      nextS = clamp(hsl.s * Math.max(0, 1 + s / 100), 0, 100);
    } else {
      const satScale = satGate * (0.35 + 0.65 * (hsl.s / 100));
      nextS = clamp(hsl.s + s * satScale, 0, 100);
    }
  }

  let rgb = hslToRgb(nextH, nextS, hsl.l);

  if (l !== 0) {
    rgb = applyLuminanceShiftRgb(rgb.r, rgb.g, rgb.b, l * lumGate);
  }

  return rgb;
}

export function applyHslChannelMixRgb(r, g, b, channelAdjusts) {
  if (!channelAdjusts?.length) return { r, g, b };

  const hsl = rgbToHsl(r, g, b);
  let weightSum = 0;
  const weights = channelAdjusts.map(channel => {
    const weight = getHslChannelWeight(hsl.h, channel.center, channel.radius ?? HSL_CHANNEL_RADIUS);
    weightSum += weight;
    return weight;
  });
  if (weightSum <= 0) return { r, g, b };

  // Only normalise when bands overlap (sum > 1); otherwise the remainder keeps
  // the original colour so a lone band fades out smoothly at its edge.
  const norm = weightSum > 1 ? 1 / weightSum : 1;
  const keep = Math.max(0, 1 - weightSum * norm);
  let outR = r * keep;
  let outG = g * keep;
  let outB = b * keep;

  for (let i = 0; i < channelAdjusts.length; i++) {
    const weight = weights[i] * norm;
    if (weight <= 0) continue;
    const adjust = channelAdjusts[i];
    if (adjust.h === 0 && adjust.s === 0 && adjust.l === 0) {
      outR += r * weight;
      outG += g * weight;
      outB += b * weight;
      continue;
    }
    const shifted = applySingleChannelHslToRgb(hsl, adjust);
    outR += shifted.r * weight;
    outG += shifted.g * weight;
    outB += shifted.b * weight;
  }

  return { r: outR, g: outG, b: outB };
}

/** @deprecated Use applyHslChannelMixRgb for Lightroom-style weighted RGB blending. */
export function applyHslChannelMix(hsl, channelAdjusts) {
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  const mixed = applyHslChannelMixRgb(rgb.r, rgb.g, rgb.b, channelAdjusts);
  return rgbToHsl(mixed.r, mixed.g, mixed.b);
}

export function isCurveActive(points) {
  if (!points) return false;
  if (points.length !== 2) return true;
  return points[0].y !== 0 || points[1].y !== 255;
}

export function getCurvePoint(curves, channel, index) {
  if (index == null || !curves?.[channel]) return null;
  const point = curves[channel][index];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

function getPipelineContext(canvas) {
  return canvas.getContext("2d", { willReadFrequently: true });
}

export function getSplineLut(points) {
  const curve = buildMonotoneCurve(
    (points || []).map(pt => ({ x: pt.x / 255, y: pt.y / 255 })),
    255
  );
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = clamp(Math.round(curve[i] * 255), 0, 255);
  }
  return lut;
}

export function drawCurvesCanvas(canvas, points, activeChannel, selectedPointIndex, histData) {
  if (!canvas || !points) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  let grad = null;
  if (activeChannel === "red") {
    grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "rgba(239, 68, 68, 0.22)");
    grad.addColorStop(1, "rgba(6, 182, 212, 0.22)");
  } else if (activeChannel === "green") {
    grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "rgba(34, 197, 94, 0.22)");
    grad.addColorStop(1, "rgba(217, 70, 239, 0.22)");
  } else if (activeChannel === "blue") {
    grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "rgba(59, 130, 246, 0.22)");
    grad.addColorStop(1, "rgba(234, 179, 8, 0.22)");
  } else if (activeChannel === "rgb") {
    grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.05)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  }

  if (grad) {
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const pos = Math.round((i / 4) * width);
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, height);
    ctx.moveTo(0, pos);
    ctx.lineTo(width, pos);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  if (histData) {
    let hist = null;
    if (activeChannel === "rgb") hist = histData.lHist;
    else if (activeChannel === "red") hist = histData.rHist;
    else if (activeChannel === "green") hist = histData.gHist;
    else if (activeChannel === "blue") hist = histData.bHist;

    if (hist) {
      let maxVal = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > maxVal) maxVal = hist[i];
      }
      if (maxVal > 0) {
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * width;
          const y = height - (hist[i] / maxVal) * height * 0.8;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = "rgba(10, 15, 22, 0.58)";
        ctx.fill();
      }
    }
  }

  const lut = getSplineLut(points);
  ctx.beginPath();
  ctx.moveTo(0, height - (lut[0] / 255) * height);
  for (let i = 1; i < 256; i++) {
    const cx = (i / 255) * width;
    const cy = height - (lut[i] / 255) * height;
    ctx.lineTo(cx, cy);
  }
  ctx.strokeStyle = activeChannel === "rgb" ? "#cbd5e1"
    : activeChannel === "red" ? "#ef4444"
      : activeChannel === "green" ? "#22c55e" : "#3b82f6";
  ctx.lineWidth = 2;
  ctx.stroke();

  points.forEach((pt, idx) => {
    const cx = (pt.x / 255) * width;
    const cy = height - (pt.y / 255) * height;

    if (idx === selectedPointIndex) {
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
      ctx.fillStyle = activeChannel === "rgb" ? "rgba(255, 255, 255, 0.25)"
        : activeChannel === "red" ? "rgba(239, 68, 68, 0.25)"
          : activeChannel === "green" ? "rgba(34, 197, 94, 0.25)" : "rgba(59, 130, 246, 0.25)";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fillStyle = activeChannel === "rgb" ? "#ffffff"
      : activeChannel === "red" ? "#ef4444"
        : activeChannel === "green" ? "#22c55e" : "#3b82f6";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
  });
}

export function computeHistogram(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const rHist = new Uint32Array(256);
  const gHist = new Uint32Array(256);
  const bHist = new Uint32Array(256);
  const lHist = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue;

    rHist[r]++;
    gHist[g]++;
    bHist[b]++;
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lHist[lum]++;
  }

  return { rHist, gHist, bHist, lHist };
}

export function drawHistogram(canvas, histData) {
  if (!canvas || !histData) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  const { rHist, gHist, bHist, lHist } = histData;
  let maxVal = 0;
  for (let i = 0; i < 256; i++) {
    if (rHist[i] > maxVal) maxVal = rHist[i];
    if (gHist[i] > maxVal) maxVal = gHist[i];
    if (bHist[i] > maxVal) maxVal = bHist[i];
    if (lHist[i] > maxVal) maxVal = lHist[i];
  }

  if (maxVal === 0) return;

  const drawPath = (hist, fillColor, strokeColor) => {
    context.beginPath();
    context.moveTo(0, height);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * width;
      const y = height - (hist[i] / maxVal) * height * 0.92;
      context.lineTo(x, y);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = fillColor;
    context.fill();

    context.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * width;
      const y = height - (hist[i] / maxVal) * height * 0.92;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.lineWidth = 1.2;
    context.strokeStyle = strokeColor;
    context.stroke();
  };

  context.globalCompositeOperation = "screen";
  drawPath(rHist, "rgba(239, 68, 68, 0.22)", "rgba(239, 68, 68, 0.8)");
  drawPath(gHist, "rgba(34, 197, 94, 0.22)", "rgba(34, 197, 94, 0.8)");
  drawPath(bHist, "rgba(59, 130, 246, 0.22)", "rgba(59, 130, 246, 0.8)");
  drawPath(lHist, "rgba(255, 255, 255, 0.08)", "rgba(255, 255, 255, 0.6)");
  context.globalCompositeOperation = "source-over";
}

// ---------------------------------------------------------------------------
// Color pipeline. Values stay float end-to-end (no 8-bit round trips):
//   linear-light sRGB  → white balance, exposure, mixing, dehaze, vignette
//   sRGB-encoded       → contrast, tone ranges, curves (perceptual spacing)
//   OKLab / OKLCh      → saturation, vibrance, hue (lightness-preserving)
// ---------------------------------------------------------------------------

const TABLE_SIZE = 4096;
const SRGB_TO_LINEAR = new Float32Array(256);
const ENCODE_TABLE = new Float32Array(TABLE_SIZE + 1);
const DECODE_TABLE = new Float32Array(TABLE_SIZE + 1);

function srgbEncodeExact(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
}

function srgbDecodeExact(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

for (let i = 0; i < 256; i++) {
  SRGB_TO_LINEAR[i] = srgbDecodeExact(i / 255);
}

for (let i = 0; i <= TABLE_SIZE; i++) {
  ENCODE_TABLE[i] = srgbEncodeExact(i / TABLE_SIZE);
  DECODE_TABLE[i] = srgbDecodeExact(i / TABLE_SIZE);
}

// Linear interpolation into a [0,1] → value table; clamps the input (NaN → 0).
function sampleTable(table, value) {
  if (!(value > 0)) return table[0];
  if (value >= 1) return table[TABLE_SIZE];
  const pos = value * TABLE_SIZE;
  const i = pos | 0;
  return table[i] + (table[i + 1] - table[i]) * (pos - i);
}

export function encodeSrgb(linear) {
  return sampleTable(ENCODE_TABLE, linear);
}

export function decodeSrgb(encoded) {
  return sampleTable(DECODE_TABLE, encoded);
}

function linearToSrgbByte(value) {
  return Math.round(encodeSrgb(value) * 255);
}

function pipelineSmoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function luminanceOf(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Monotone cubic Hermite (Fritsch–Carlson) through `points` ({x,y} in 0..1).
 * Unlike a natural spline it never overshoots between points, so curves cannot
 * ring, invert or clip on their own. Returns TABLE_SIZE+1 samples over x ∈ [0,1].
 */
export function buildMonotoneCurve(points, size = TABLE_SIZE) {
  const sorted = (points || [])
    .filter(pt => Number.isFinite(pt?.x) && Number.isFinite(pt?.y))
    .map(pt => ({ x: pt.x, y: pt.y }))
    .sort((a, b) => a.x - b.x);
  const pts = [];
  for (const pt of sorted) {
    if (pts.length && Math.abs(pts[pts.length - 1].x - pt.x) < 1e-6) pts[pts.length - 1] = pt;
    else pts.push(pt);
  }
  const out = new Float32Array(size + 1);
  const n = pts.length;
  if (n === 0) {
    for (let i = 0; i <= size; i++) out[i] = i / size;
    return out;
  }
  if (n === 1) {
    out.fill(pts[0].y);
    return out;
  }

  const dx = new Float64Array(n - 1);
  const slope = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const m = new Float64Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  let j = 0;
  for (let k = 0; k <= size; k++) {
    const x = k / size;
    if (x <= pts[0].x) {
      out[k] = pts[0].y;
      continue;
    }
    if (x >= pts[n - 1].x) {
      out[k] = pts[n - 1].y;
      continue;
    }
    while (j < n - 2 && x > pts[j + 1].x) j++;
    const h = dx[j];
    const t = (x - pts[j].x) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    out[k] = (2 * t3 - 3 * t2 + 1) * pts[j].y
      + (t3 - 2 * t2 + t) * h * m[j]
      + (-2 * t3 + 3 * t2) * pts[j + 1].y
      + (t3 - t2) * h * m[j + 1];
  }
  return out;
}

const MID_GREY = srgbEncodeExact(0.18);

// Per-channel S-curve in encoded space pivoting on 18% grey (like LR/ACR):
// mid-tones keep their brightness, contrast also lifts saturation a little.
function buildContrastTable(contrast) {
  if (!contrast) return null;
  const c = (contrast / 100) * 0.12;
  const p = MID_GREY;
  return buildMonotoneCurve([
    { x: 0, y: 0 },
    { x: p * 0.5, y: p * 0.5 - c },
    { x: p, y: p },
    { x: (1 + p) * 0.5, y: (1 + p) * 0.5 + c },
    { x: 1, y: 1 }
  ]);
}

// Highlights/Shadows/Whites/Blacks as one monotone tone curve. Pure black and
// white only move through Blacks/Whites, so Shadows never greys out the blacks.
function buildToneTable({ highlights = 0, shadows = 0, whites = 0, blacks = 0 }) {
  if (!highlights && !shadows && !whites && !blacks) return null;
  const hi = highlights / 100;
  const sh = shadows / 100;
  const wh = whites / 100;
  const bl = blacks / 100;
  const xs = [0, 0.12, 0.3, 0.5, 0.7, 0.88, 1];
  const ys = [
    Math.max(0, bl * 0.05),
    0.12 + bl * 0.07 + sh * 0.05,
    0.3 + sh * 0.13 + bl * 0.02,
    0.5 + (sh + hi) * 0.03,
    0.7 + hi * 0.13 + wh * 0.02,
    0.88 + wh * 0.07 + hi * 0.05,
    Math.min(1, 1 + wh * 0.05)
  ];
  for (let i = 0; i < ys.length; i++) {
    ys[i] = clamp(ys[i], i ? ys[i - 1] : 0, 1);
  }
  return buildMonotoneCurve(xs.map((x, i) => ({ x, y: ys[i] })));
}

function buildCurveTables(curves) {
  const toUnit = points => (points || DEFAULT_CURVES.rgb).map(pt => ({ x: pt.x / 255, y: pt.y / 255 }));
  const master = buildMonotoneCurve(toUnit(curves.rgb));
  const compose = points => {
    const channel = buildMonotoneCurve(toUnit(points));
    const out = new Float32Array(TABLE_SIZE + 1);
    for (let i = 0; i <= TABLE_SIZE; i++) out[i] = sampleTable(master, channel[i]);
    return out;
  };
  return { r: compose(curves.red), g: compose(curves.green), b: compose(curves.blue) };
}

// Box mean with exact edge normalisation (prefix sums, O(n) for any radius).
function boxMean(src, width, height, radius) {
  const out = new Float32Array(width * height);
  if (radius < 1) {
    out.set(src);
    return out;
  }
  const tmp = new Float32Array(width * height);
  const rowSum = new Float64Array(width + 1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) rowSum[x + 1] = rowSum[x] + src[row + x];
    for (let x = 0; x < width; x++) {
      const lo = Math.max(0, x - radius);
      const hi = Math.min(width, x + radius + 1);
      tmp[row + x] = (rowSum[hi] - rowSum[lo]) / (hi - lo);
    }
  }
  const colSum = new Float64Array(height + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) colSum[y + 1] = colSum[y] + tmp[y * width + x];
    for (let y = 0; y < height; y++) {
      const lo = Math.max(0, y - radius);
      const hi = Math.min(height, y + radius + 1);
      out[y * width + x] = (colSum[hi] - colSum[lo]) / (hi - lo);
    }
  }
  return out;
}

function downsamplePlane(src, width, height, factor) {
  const w = Math.max(1, Math.ceil(width / factor));
  const h = Math.max(1, Math.ceil(height / factor));
  const out = new Float32Array(w * h);
  const count = new Float32Array(w * h);
  for (let y = 0; y < height; y++) {
    const ly = Math.min(h - 1, (y / factor) | 0);
    for (let x = 0; x < width; x++) {
      const li = ly * w + Math.min(w - 1, (x / factor) | 0);
      out[li] += src[y * width + x];
      count[li]++;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= count[i] || 1;
  return { data: out, width: w, height: h };
}

function upsampleBilinear(src, sw, sh, width, height, factor) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = clamp((y + 0.5) / factor - 0.5, 0, sh - 1);
    const y0 = fy | 0;
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = clamp((x + 0.5) / factor - 0.5, 0, sw - 1);
      const x0 = fx | 0;
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const top = src[y0 * sw + x0] + (src[y0 * sw + x1] - src[y0 * sw + x0]) * tx;
      const bottom = src[y1 * sw + x0] + (src[y1 * sw + x1] - src[y1 * sw + x0]) * tx;
      out[y * width + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/**
 * Self-guided edge-preserving smoothing (He et al., fast guided filter): the
 * a/b coefficients are solved on a downsampled plane and upsampled, so cost and
 * memory stay bounded and preview/export see the same base layer.
 */
function guidedFilterSelf(plane, width, height, radius, eps, workEdge) {
  const factor = Math.max(1, Math.ceil(Math.max(width, height) / workEdge));
  const low = factor > 1 ? downsamplePlane(plane, width, height, factor) : { data: plane, width, height };
  const r = Math.max(1, Math.round(radius / factor));
  const n = low.width * low.height;
  const meanI = boxMean(low.data, low.width, low.height, r);
  const squares = new Float32Array(n);
  for (let i = 0; i < n; i++) squares[i] = low.data[i] * low.data[i];
  const meanII = boxMean(squares, low.width, low.height, r);
  const a = squares;
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const variance = Math.max(0, meanII[i] - meanI[i] * meanI[i]);
    a[i] = variance / (variance + eps);
    b[i] = meanI[i] - a[i] * meanI[i];
  }
  let meanA = boxMean(a, low.width, low.height, r);
  let meanB = boxMean(b, low.width, low.height, r);
  if (factor > 1) {
    meanA = upsampleBilinear(meanA, low.width, low.height, width, height, factor);
    meanB = upsampleBilinear(meanB, low.width, low.height, width, height, factor);
  }
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = meanA[i] * plane[i] + meanB[i];
  return out;
}

// Pull out-of-range colours back toward their own luminance (keeps hue + Y)
// instead of clipping each channel, which shifts hue in bright saturated areas.
function fitGamut(px) {
  const y = luminanceOf(px[0], px[1], px[2]);
  if (y >= 1) {
    px[0] = 1; px[1] = 1; px[2] = 1;
    return;
  }
  if (y <= 0) {
    px[0] = 0; px[1] = 0; px[2] = 0;
    return;
  }
  let t = 1;
  for (let c = 0; c < 3; c++) {
    const v = px[c];
    if (v > 1) t = Math.min(t, (1 - y) / (v - y));
    else if (v < 0) t = Math.min(t, y / (y - v));
  }
  if (t < 1) {
    for (let c = 0; c < 3; c++) px[c] = y + (px[c] - y) * t;
  }
}

function linearToOklab(r, g, b, out) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

function oklabToLinear(L, a, b, out) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
}

function buildBaseStage(adjustments) {
  const temp = (adjustments.temperature || 0) / 100;
  const tint = (adjustments.tint || 0) / 100;
  let wbR = 1 + temp * 0.18;
  let wbG = 1 + tint * 0.1 - temp * 0.025;
  let wbB = 1 - temp * 0.18;
  // Normalise so white balance shifts colour without changing brightness.
  const wbY = luminanceOf(wbR, wbG, wbB) || 1;
  wbR /= wbY;
  wbG /= wbY;
  wbB /= wbY;
  // Slider -100..+100 maps to 0..220% gain (legacy scale); above 100% a
  // C1 shoulder rolls highlights off instead of clipping them hard.
  const gain = clamp(1 + (adjustments.luminance || 0) / 100, 0, 2.2);
  const calibration = isCalibrationActive(adjustments.calibration) ? normalizeCalibration(adjustments.calibration) : null;
  return {
    wbR,
    wbG,
    wbB,
    gain,
    calibrationMatrix: calibration ? buildCalibrationMatrix(calibration) : null,
    shadowTint: calibration ? calibration.shadowTint / 100 : 0,
    knee: gain > 1 ? Math.max(0, 2 - gain) : 1,
    contrastTable: buildContrastTable(adjustments.contrast || 0)
  };
}

// Rotate a primary about the neutral axis (positive = towards the next hue:
// red→yellow, green→cyan, blue→magenta).
function rotateAboutGrey(v, degrees) {
  const angle = degrees * DEG;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const k = 1 / Math.sqrt(3);
  const dot = (v[0] + v[1] + v[2]) * k;
  const cross = [k * (v[2] - v[1]), k * (v[0] - v[2]), k * (v[1] - v[0])];
  return v.map((value, i) => value * cos + cross[i] * sin + k * dot * (1 - cos));
}

// Calibration as a 3×3 matrix in linear RGB (columns = moved primaries),
// rows normalised so neutral greys stay neutral.
export function buildCalibrationMatrix(calibration) {
  const columns = ["red", "green", "blue"].map((name, index) => {
    const primary = [0, 0, 0];
    primary[index] = 1;
    const rotated = rotateAboutGrey(primary, (calibration[`${name}Hue`] || 0) * 0.3);
    const mean = (rotated[0] + rotated[1] + rotated[2]) / 3;
    const factor = 1 + (calibration[`${name}Saturation`] || 0) / 200;
    return rotated.map(value => mean + (value - mean) * factor);
  });
  const matrix = [0, 1, 2].map(row => columns.map(column => column[row]));
  return matrix.map(row => {
    const sum = row[0] + row[1] + row[2] || 1;
    return row.map(value => value / sum);
  });
}

function shoulder(v, gain, knee) {
  if (v <= knee) return v;
  const t = Math.min(1, (v - knee) / (gain - knee));
  return knee + (1 - knee) * (1 - (1 - t) * (1 - t));
}

function applyBaseStage(px, stage) {
  let r = px[0] * stage.wbR * stage.gain;
  let g = px[1] * stage.wbG * stage.gain;
  let b = px[2] * stage.wbB * stage.gain;
  if (stage.gain > 1) {
    r = shoulder(r, stage.gain, stage.knee);
    g = shoulder(g, stage.gain, stage.knee);
    b = shoulder(b, stage.gain, stage.knee);
  }
  const m = stage.calibrationMatrix;
  if (m) {
    const cr = m[0][0] * r + m[0][1] * g + m[0][2] * b;
    const cg = m[1][0] * r + m[1][1] * g + m[1][2] * b;
    const cb = m[2][0] * r + m[2][1] * g + m[2][2] * b;
    r = cr;
    g = cg;
    b = cb;
  }
  if (stage.shadowTint !== 0) {
    // Negative = green, positive = magenta; fades out by the midtones.
    const shade = 1 - Math.min(1, encodeSrgb(Math.max(0, luminanceOf(r, g, b))) * 1.6);
    const k = stage.shadowTint * 0.12 * shade * shade;
    r *= 1 + k * 0.5;
    g *= 1 - k;
    b *= 1 + k * 0.5;
  }
  px[0] = r;
  px[1] = g;
  px[2] = b;
  fitGamut(px);
  const table = stage.contrastTable;
  if (table) {
    px[0] = decodeSrgb(sampleTable(table, encodeSrgb(px[0])));
    px[1] = decodeSrgb(sampleTable(table, encodeSrgb(px[1])));
    px[2] = decodeSrgb(sampleTable(table, encodeSrgb(px[2])));
  }
}

function applyDehazeLinear(r, g, b, dehaze) {
  if (dehaze === 0) return { r, g, b };
  const amount = dehaze / 100;
  const dark = Math.min(r, g, b);
  const hazeWeight = pipelineSmoothstep(0.35, 0.92, dark);
  const contrast = 1 + amount * 0.55 * hazeWeight;
  const blackShift = -amount * 0.025;
  const sat = 1 + amount * 0.22 * hazeWeight;
  const luma = luminanceOf(r, g, b);
  let nr = luma + (r - luma) * sat;
  let ng = luma + (g - luma) * sat;
  let nb = luma + (b - luma) * sat;
  nr = ((nr - 0.5) * contrast + 0.5) + blackShift;
  ng = ((ng - 0.5) * contrast + 0.5) + blackShift;
  nb = ((nb - 0.5) * contrast + 0.5) + blackShift;
  return { r: nr, g: ng, b: nb };
}

// Integer hash → [-1, 1); stable per (x, y, seed), no per-pixel PRNG allocation.
function hashNoise(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

function applyGrainPass(data, width, height, grain, grainSize, grainRoughness, seed, scale) {
  if (grain === 0) return;
  // Grain size is defined in source pixels, so the preview (scale < 1) shows the
  // same grain the full-resolution export will have.
  const cell = Math.max(0.05, (0.5 + (grainSize / 100) * 1.5) * scale);
  const roughness = grainRoughness / 100;
  const strength = grain * 0.75;
  for (let y = 0; y < height; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const ty = gy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] === 0) continue;
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const tx = gx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const n00 = hashNoise(x0, y0, seed);
      const n10 = hashNoise(x0 + 1, y0, seed);
      const n01 = hashNoise(x0, y0 + 1, seed);
      const n11 = hashNoise(x0 + 1, y0 + 1, seed);
      const coarse = (n00 + (n10 - n00) * sx) + ((n01 + (n11 - n01) * sx) - (n00 + (n10 - n00) * sx)) * sy;
      const fine = hashNoise(x, y, seed ^ 0x5bd1e995);
      const noise = coarse * roughness + fine * (1 - roughness * 0.5);
      const luma = (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255;
      const lumaWeight = 0.35 + 0.65 * (4 * luma * (1 - luma));
      const delta = noise * strength * 0.35 * lumaWeight;
      data[idx] = clamp(data[idx] + delta, 0, 255);
      data[idx + 1] = clamp(data[idx + 1] + delta * 0.92, 0, 255);
      data[idx + 2] = clamp(data[idx + 2] + delta * 0.88, 0, 255);
    }
  }
}

export function isGradingActive(grading) {
  return GRADING_ZONES.some(zone => (Number(grading?.[zone]?.s) || 0) !== 0);
}

export function isLutActive(lut) {
  return Boolean(lut?.id) && (Number(lut.amount ?? 100) || 0) > 0;
}

export function needsColorPipeline(adjustments) {
  if (!adjustments) return false;
  if (adjustments.invert) return true;
  if (adjustments.luminance !== 0 || adjustments.contrast !== 0) return true;
  if (adjustments.temperature !== 0 || adjustments.tint !== 0) return true;
  if (adjustments.vibrance !== 0 || adjustments.saturation !== 0 || adjustments.hue !== 0) return true;
  if (adjustments.highlights !== 0 || adjustments.shadows !== 0 || adjustments.whites !== 0 || adjustments.blacks !== 0) return true;
  if (adjustments.grain !== 0 || adjustments.clarity !== 0 || adjustments.dehaze !== 0) return true;
  if (adjustments.texture !== 0 || adjustments.vignette !== 0) return true;
  if (isGradingActive(adjustments.grading)) return true;
  if (isCalibrationActive(adjustments.calibration)) return true;
  if (isLutActive(adjustments.lut) && getLoadedLut(adjustments.lut.id)) return true;
  if (adjustments.curves && (
    isCurveActive(adjustments.curves.rgb)
    || isCurveActive(adjustments.curves.red)
    || isCurveActive(adjustments.curves.green)
    || isCurveActive(adjustments.curves.blue)
  )) return true;
  return COLOR_CHANNELS.some(channel => {
    const entry = adjustments.hsl?.[channel.id];
    return entry && (entry.h !== 0 || entry.s !== 0 || entry.l !== 0);
  });
}

const DEG = Math.PI / 180;
const SKIN_OKLCH_HUE = 60;
const GRADING_STRENGTH = 0.08;
// Per-pixel colour work is baked into a 49³ lattice once the image is large
// enough that evaluating it per pixel costs more than the bake (~118k samples).
const BAKE_SIZE = 49;
const BAKE_MIN_PIXELS = 250000;

// Direction in OKLab of a grading hue picked on the familiar HSL wheel.
function gradingTint(zone) {
  const s = clamp(Number(zone?.s) || 0, 0, 100);
  if (s === 0) return null;
  const rgb = hslToRgb(Number(zone?.h) || 0, 100, 50);
  const lab = new Float64Array(3);
  linearToOklab(SRGB_TO_LINEAR[Math.round(rgb.r)], SRGB_TO_LINEAR[Math.round(rgb.g)], SRGB_TO_LINEAR[Math.round(rgb.b)], lab);
  const length = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]) || 1;
  const strength = (s / 100) * GRADING_STRENGTH;
  return { a: (lab[1] / length) * strength, b: (lab[2] / length) * strength };
}

function createPipelineContext(adjustments) {
  const num = key => Number(adjustments[key]) || 0;
  const activeChannelAdjusts = COLOR_CHANNELS
    .filter(channel => {
      const entry = adjustments.hsl?.[channel.id];
      return entry && (entry.h !== 0 || entry.s !== 0 || entry.l !== 0);
    })
    .map(channel => ({
      center: channel.center,
      radius: channel.radius ?? HSL_CHANNEL_RADIUS,
      h: Number(adjustments.hsl[channel.id].h) || 0,
      s: Number(adjustments.hsl[channel.id].s) || 0,
      l: Number(adjustments.hsl[channel.id].l) || 0
    }));
  const hasCurves = adjustments.curves && (
    isCurveActive(adjustments.curves.rgb)
    || isCurveActive(adjustments.curves.red)
    || isCurveActive(adjustments.curves.green)
    || isCurveActive(adjustments.curves.blue)
  );
  const grading = normalizeGrading(adjustments.grading);
  const gradingTints = isGradingActive(grading)
    ? {
      shadows: gradingTint(grading.shadows),
      midtones: gradingTint(grading.midtones),
      highlights: gradingTint(grading.highlights),
      balance: clamp(grading.balance, -100, 100) / 100
    }
    : null;
  const lut = isLutActive(adjustments.lut) ? getLoadedLut(adjustments.lut.id) : null;
  const saturation = num("saturation");
  const vibrance = num("vibrance") / 100;
  const hueShift = num("hue");
  const needsLab = saturation !== 0 || vibrance !== 0 || hueShift !== 0
    || activeChannelAdjusts.length > 0 || Boolean(gradingTints);
  const curveTables = hasCurves ? buildCurveTables(adjustments.curves) : null;
  const dehaze = num("dehaze");

  return {
    stage: buildBaseStage(adjustments),
    toneTable: buildToneTable(adjustments),
    curveTables,
    activeChannelAdjusts,
    saturation,
    vibrance,
    hueShift,
    chromaBase: saturation < 0 ? 1 + saturation / 100 : 1 + (saturation / 100) * 0.9,
    gradingTints,
    needsLab,
    dehaze,
    lut,
    lutAmount: lut ? clamp(Number(adjustments.lut.amount ?? 100), 0, 100) / 100 : 0,
    clarityAmount: (num("clarity") / 100) * 0.7,
    textureAmount: (num("texture") / 100) * 0.6,
    vignette: num("vignette") / 100,
    invert: Boolean(adjustments.invert),
    hasColorStage: Boolean(curveTables) || needsLab || dehaze !== 0 || Boolean(lut)
  };
}

// Tone mapping on perceptual lightness. `baseValue` is the edge-aware base
// layer (local) or the pixel's own lightness (global, e.g. LUT export).
function applyToneStage(px, ctx, light, baseValue, textureValue) {
  let target = light;
  if (baseValue !== null) {
    const detail = light - baseValue;
    if (ctx.toneTable) target = sampleTable(ctx.toneTable, baseValue) + detail;
    if (ctx.clarityAmount !== 0) target += ctx.clarityAmount * 4 * light * (1 - light) * detail;
  }
  if (textureValue !== null) {
    target += ctx.textureAmount * (0.4 + 2.4 * light * (1 - light)) * (light - textureValue);
  }
  if (target === light) return;
  const y = luminanceOf(px[0], px[1], px[2]);
  const nextY = decodeSrgb(target);
  if (y > 1e-6) {
    const ratio = nextY / y;
    px[0] *= ratio;
    px[1] *= ratio;
    px[2] *= ratio;
  } else {
    px[0] = nextY;
    px[1] = nextY;
    px[2] = nextY;
  }
  fitGamut(px);
}

// Everything that depends only on the pixel's own colour (bakeable).
function applyColorStage(px, ctx, lab, tmp) {
  if (ctx.curveTables) {
    px[0] = decodeSrgb(sampleTable(ctx.curveTables.r, encodeSrgb(px[0])));
    px[1] = decodeSrgb(sampleTable(ctx.curveTables.g, encodeSrgb(px[1])));
    px[2] = decodeSrgb(sampleTable(ctx.curveTables.b, encodeSrgb(px[2])));
  }

  if (ctx.needsLab) {
    // HSL bands are selected on sRGB-encoded hue so they match the swatches
    // and the colour picker; the edit itself happens in OKLCh.
    let bandH = 0;
    let bandS = 0;
    let bandL = 0;
    let hsl = null;
    if (ctx.activeChannelAdjusts.length) {
      hsl = rgbToHsl(encodeSrgb(px[0]) * 255, encodeSrgb(px[1]) * 255, encodeSrgb(px[2]) * 255);
      let weightSum = 0;
      for (const channel of ctx.activeChannelAdjusts) {
        const weight = getHslChannelWeight(hsl.h, channel.center, channel.radius);
        weightSum += weight;
        bandH += weight * channel.h;
        bandS += weight * channel.s;
        bandL += weight * channel.l;
      }
      // Overlapping bands share the pixel; a lone band fades out at its edge.
      const norm = weightSum > 1 ? 1 / weightSum : 1;
      bandH *= norm;
      bandS *= norm;
      bandL *= norm;
    }

    linearToOklab(px[0], px[1], px[2], lab);
    let L = lab[0];
    let a = lab[1];
    let b = lab[2];

    let chromaScale = ctx.chromaBase;
    if (ctx.vibrance !== 0) {
      const satNorm = Math.min(1, Math.sqrt(a * a + b * b) / 0.25);
      const skinProtect = ctx.vibrance > 0
        ? 1 - 0.6 * (1 - pipelineSmoothstep(0, 35, hueDistance(Math.atan2(b, a) / DEG, SKIN_OKLCH_HUE)))
        : 1;
      chromaScale += ctx.vibrance * (1 - satNorm) ** 2 * skinProtect;
    }
    let rotation = ctx.hueShift;

    if (hsl && (bandH !== 0 || bandS !== 0 || bandL !== 0)) {
      const chromaGate = hslChromaGate(hsl.s);
      rotation += bandH * chromaGate;
      if (bandS < 0) chromaScale *= Math.max(0, 1 + bandS / 100);
      else if (bandS > 0) chromaScale *= 1 + (bandS / 100) * chromaGate * (0.35 + 0.65 * (hsl.s / 100));
      if (bandL !== 0) L = clamp(L + (bandL / 100) * 0.16 * hslLuminanceGate(hsl.s, hsl.l), 0, 1);
    }

    chromaScale = clamp(chromaScale, 0, 2.5);
    a *= chromaScale;
    b *= chromaScale;
    if (rotation !== 0) {
      const cos = Math.cos(rotation * DEG);
      const sin = Math.sin(rotation * DEG);
      const ra = a * cos - b * sin;
      b = a * sin + b * cos;
      a = ra;
    }

    const tints = ctx.gradingTints;
    if (tints) {
      // Split-tone weights over lightness; Balance shifts the shadow/highlight split.
      const t = clamp(L + tints.balance * 0.25, 0, 1);
      const weights = [(1 - t) * (1 - t), 2 * t * (1 - t), t * t];
      const zones = [tints.shadows, tints.midtones, tints.highlights];
      for (let z = 0; z < 3; z++) {
        if (!zones[z]) continue;
        a += zones[z].a * weights[z];
        b += zones[z].b * weights[z];
      }
    }
    oklabToLinear(L, a, b, px);
  }

  if (ctx.dehaze !== 0) {
    const hazed = applyDehazeLinear(px[0], px[1], px[2], ctx.dehaze);
    px[0] = hazed.r;
    px[1] = hazed.g;
    px[2] = hazed.b;
  }

  if (ctx.lut) {
    const er = encodeSrgb(px[0]);
    const eg = encodeSrgb(px[1]);
    const eb = encodeSrgb(px[2]);
    sampleCubeLut(ctx.lut, er, eg, eb, tmp);
    const k = ctx.lutAmount;
    px[0] = decodeSrgb(er + (tmp[0] - er) * k);
    px[1] = decodeSrgb(eg + (tmp[1] - eg) * k);
    px[2] = decodeSrgb(eb + (tmp[2] - eb) * k);
  }
}

const UNIT_DOMAIN = [0, 0, 0];
const UNIT_DOMAIN_MAX = [1, 1, 1];

function forEachLatticePoint(size, callback) {
  const max = size - 1;
  let offset = 0;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        callback(ri / max, gi / max, bi / max, offset);
        offset += 3;
      }
    }
  }
}

// Bake the colour stage over encoded RGB; values stay linear so the later
// gamut fit still sees out-of-range colours.
function bakeColorStage(ctx, size = BAKE_SIZE) {
  const data = new Float32Array(size * size * size * 3);
  const px = new Float64Array(3);
  const lab = new Float64Array(3);
  const tmp = new Float64Array(3);
  forEachLatticePoint(size, (er, eg, eb, offset) => {
    px[0] = decodeSrgb(er);
    px[1] = decodeSrgb(eg);
    px[2] = decodeSrgb(eb);
    applyColorStage(px, ctx, lab, tmp);
    data[offset] = px[0];
    data[offset + 1] = px[1];
    data[offset + 2] = px[2];
  });
  return { size, data, domainMin: UNIT_DOMAIN, domainMax: UNIT_DOMAIN_MAX };
}

// Base stage (white balance, exposure, calibration, contrast) over encoded sRGB → linear.
function bakeBaseStage(stage, size) {
  const data = new Float32Array(size * size * size * 3);
  const px = new Float64Array(3);
  forEachLatticePoint(size, (er, eg, eb, offset) => {
    px[0] = decodeSrgb(er);
    px[1] = decodeSrgb(eg);
    px[2] = decodeSrgb(eb);
    applyBaseStage(px, stage);
    data[offset] = px[0];
    data[offset + 1] = px[1];
    data[offset + 2] = px[2];
  });
  return { size, data };
}

const GPU_BASE_KEYS = ["temperature", "tint", "luminance", "contrast", "calibration"];
const GPU_COLOR_KEYS = ["curves", "hsl", "saturation", "vibrance", "hue", "grading", "dehaze", "lut"];
const gpuBakeCache = { base: { key: "", value: null }, color: { key: "", value: null } };

function isIdentityBaseStage(stage) {
  return stage.gain === 1 && !stage.calibrationMatrix && !stage.shadowTint && !stage.contrastTable
    && Math.abs(stage.wbR - 1) < 1e-9 && Math.abs(stage.wbG - 1) < 1e-9 && Math.abs(stage.wbB - 1) < 1e-9;
}

/**
 * Everything the WebGL renderer needs: the two per-pixel stages baked into 3D
 * LUTs (cached per group of settings, so dragging Exposure does not re-bake the
 * colour stage) plus the parameters of the spatial passes.
 */
export function prepareGpuPipeline(adjustments, { interactive = false } = {}) {
  const ctx = createPipelineContext(adjustments);
  const pick = keys => JSON.stringify(keys.map(key => adjustments[key] ?? null));

  const baseKey = `${pick(GPU_BASE_KEYS)}|${interactive ? 33 : 49}`;
  if (gpuBakeCache.base.key !== baseKey) {
    gpuBakeCache.base = {
      key: baseKey,
      value: isIdentityBaseStage(ctx.stage) ? null : bakeBaseStage(ctx.stage, interactive ? 33 : 49)
    };
  }
  // A LUT that is still loading changes the result once it arrives.
  const lutReady = ctx.lut ? "1" : "0";
  const colorKey = `${pick(GPU_COLOR_KEYS)}|${lutReady}|${interactive ? 33 : 49}`;
  if (gpuBakeCache.color.key !== colorKey) {
    gpuBakeCache.color = {
      key: colorKey,
      value: ctx.hasColorStage ? bakeColorStage(ctx, interactive ? 33 : BAKE_SIZE) : null
    };
  }

  return {
    baseLut: gpuBakeCache.base.value,
    colorLut: gpuBakeCache.color.value,
    toneTable: ctx.toneTable,
    clarityAmount: ctx.clarityAmount,
    textureAmount: ctx.textureAmount,
    vignette: ctx.vignette,
    invert: ctx.invert,
    grain: {
      amount: Number(adjustments.grain) || 0,
      size: adjustments.grainSize ?? 50,
      roughness: adjustments.grainRoughness ?? 50
    },
    workEdge: interactive ? 384 : 768
  };
}

/**
 * Bake every per-pixel adjustment into a .cube-style 3D LUT (encoded sRGB in/out).
 * Spatial effects (clarity, texture, vignette, grain, blur) cannot live in a LUT;
 * tone ranges are applied globally.
 */
export function bakeAdjustmentsLut(adjustments, size = 33) {
  const ctx = createPipelineContext(adjustments);
  const data = new Float32Array(size * size * size * 3);
  const px = new Float64Array(3);
  const lab = new Float64Array(3);
  const tmp = new Float64Array(3);
  forEachLatticePoint(size, (er, eg, eb, offset) => {
    px[0] = decodeSrgb(er);
    px[1] = decodeSrgb(eg);
    px[2] = decodeSrgb(eb);
    applyBaseStage(px, ctx.stage);
    if (ctx.toneTable) {
      const light = encodeSrgb(luminanceOf(px[0], px[1], px[2]));
      applyToneStage(px, ctx, light, light, null);
    }
    if (ctx.hasColorStage) applyColorStage(px, ctx, lab, tmp);
    fitGamut(px);
    if (ctx.invert) {
      px[0] = 1 - px[0];
      px[1] = 1 - px[1];
      px[2] = 1 - px[2];
    }
    data[offset] = encodeSrgb(px[0]);
    data[offset + 1] = encodeSrgb(px[1]);
    data[offset + 2] = encodeSrgb(px[2]);
  });
  return { size, data, domainMin: UNIT_DOMAIN, domainMax: UNIT_DOMAIN_MAX };
}

export function applyColorPipeline(imageData, adjustments, { scale = 1, seed = 1, interactive = false, bake } = {}) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const ctx = createPipelineContext(adjustments);
  const needsLocal = Boolean(ctx.toneTable) || ctx.clarityAmount !== 0 || ctx.textureAmount !== 0;

  const px = new Float64Array(3);
  const lab = new Float64Array(3);
  const tmp = new Float64Array(3);

  // Pass 1: perceptual lightness after the base stage, used to build the
  // edge-aware base layer for local tone mapping / clarity, and a fine base for texture.
  let lightness = null;
  let base = null;
  let textureBase = null;
  if (needsLocal) {
    lightness = new Float32Array(pixelCount);
    for (let p = 0, index = 0; p < pixelCount; p++, index += 4) {
      px[0] = SRGB_TO_LINEAR[data[index]];
      px[1] = SRGB_TO_LINEAR[data[index + 1]];
      px[2] = SRGB_TO_LINEAR[data[index + 2]];
      applyBaseStage(px, ctx.stage);
      lightness[p] = encodeSrgb(luminanceOf(px[0], px[1], px[2]));
    }
    const longEdge = Math.max(width, height);
    if (ctx.toneTable || ctx.clarityAmount !== 0) {
      base = guidedFilterSelf(
        lightness,
        width,
        height,
        Math.max(2, Math.round(longEdge * 0.02)),
        0.012,
        interactive ? 384 : 768
      );
    }
    if (ctx.textureAmount !== 0) {
      textureBase = boxMean(lightness, width, height, Math.max(1, Math.round(longEdge * 0.002)));
    }
  }

  const shouldBake = bake ?? pixelCount >= BAKE_MIN_PIXELS;
  const baked = ctx.hasColorStage && shouldBake ? bakeColorStage(ctx) : null;
  const cx = width / 2;
  const cy = height / 2;

  // Pass 2: full per-pixel pipeline.
  for (let p = 0, index = 0; p < pixelCount; p++, index += 4) {
    if (data[index + 3] === 0) continue;
    px[0] = SRGB_TO_LINEAR[data[index]];
    px[1] = SRGB_TO_LINEAR[data[index + 1]];
    px[2] = SRGB_TO_LINEAR[data[index + 2]];
    applyBaseStage(px, ctx.stage);

    if (needsLocal) {
      applyToneStage(px, ctx, lightness[p], base ? base[p] : null, textureBase ? textureBase[p] : null);
    }

    if (baked) {
      sampleCubeLut(baked, encodeSrgb(px[0]), encodeSrgb(px[1]), encodeSrgb(px[2]), px);
    } else if (ctx.hasColorStage) {
      applyColorStage(px, ctx, lab, tmp);
    }

    if (ctx.vignette !== 0) {
      // Lightroom convention: negative darkens the corners, positive lightens.
      const dx = (p % width + 0.5 - cx) / cx;
      const dy = (((p / width) | 0) + 0.5 - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      const shade = 1 + ctx.vignette * 0.7 * pipelineSmoothstep(0.35, 1, dist);
      px[0] *= shade;
      px[1] *= shade;
      px[2] *= shade;
    }

    fitGamut(px);
    if (ctx.invert) {
      px[0] = 1 - px[0];
      px[1] = 1 - px[1];
      px[2] = 1 - px[2];
    }
    data[index] = linearToSrgbByte(px[0]);
    data[index + 1] = linearToSrgbByte(px[1]);
    data[index + 2] = linearToSrgbByte(px[2]);
  }

  applyGrainPass(
    data,
    width,
    height,
    Number(adjustments.grain) || 0,
    adjustments.grainSize ?? 50,
    adjustments.grainRoughness ?? 50,
    seed,
    scale
  );
}

export function applyColorAdjustmentsToCanvas(sourceCanvas, targetCanvas, adjustments, {
  scale = 1,
  seed = 1,
  interactive = false,
  skipBlur = false
} = {}) {
  if (!sourceCanvas || !targetCanvas) return null;
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (!width || !height) return null;

  if (targetCanvas.width !== width || targetCanvas.height !== height) {
    targetCanvas.width = width;
    targetCanvas.height = height;
  }

  const ctx = getPipelineContext(targetCanvas);
  if (!ctx) return null;
  ctx.drawImage(sourceCanvas, 0, 0);

  if (needsColorPipeline(adjustments)
    && !applyColorPipelineGpuToCanvas(targetCanvas, adjustments, { scale, seed, interactive })) {
    const imageData = ctx.getImageData(0, 0, width, height);
    applyColorPipeline(imageData, adjustments, { scale, seed, interactive });
    ctx.putImageData(imageData, 0, 0);
  }

  if (!skipBlur && !interactive && adjustments.blur > 0) {
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = width;
    blurCanvas.height = height;
    const blurCtx = blurCanvas.getContext("2d");
    if (blurCtx) {
      blurCtx.filter = `blur(${adjustments.blur * scale}px)`;
      blurCtx.drawImage(targetCanvas, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(blurCanvas, 0, 0);
    }
  }

  return { width, height, scale };
}

export function getOutputGeometry(image, adjustments) {
  if (!image) return null;
  const cropLeft = clampCrop(adjustments.cropLeft) / 100;
  const cropRight = clampCrop(adjustments.cropRight) / 100;
  const cropTop = clampCrop(adjustments.cropTop) / 100;
  const cropBottom = clampCrop(adjustments.cropBottom) / 100;
  const sx = Math.round(image.naturalWidth * cropLeft);
  const sy = Math.round(image.naturalHeight * cropTop);
  const sw = Math.max(1, Math.round(image.naturalWidth * (1 - cropLeft - cropRight)));
  const sh = Math.max(1, Math.round(image.naturalHeight * (1 - cropTop - cropBottom)));
  const rotated = Math.abs(adjustments.rotation % 180) === 90;
  return {
    sx,
    sy,
    sw,
    sh,
    width: rotated ? sh : sw,
    height: rotated ? sw : sh
  };
}

export function applyImageAdjustments(image, adjustments, targetCanvas, {
  fullResolution = false,
  maxEdge = fullResolution ? Infinity : PREVIEW_MAX_EDGE,
  interactive = false,
  skipColorPipeline = false,
  skipBlur = false,
  ignoreCrop = false,
  onAfterDraw = null,
  seed = 1
} = {}) {
  const geomAdj = ignoreCrop
    ? {
      ...adjustments,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
      cropLeft: 0,
      rotation: 0,
      flipH: false,
      flipV: false
    }
    : adjustments;
  const geometry = getOutputGeometry(image, geomAdj);
  if (!image || !targetCanvas || !geometry) return null;

  let scale = 1;
  if (!fullResolution && Number.isFinite(maxEdge)) {
    const longest = Math.max(geometry.width, geometry.height);
    if (longest > maxEdge) {
      scale = maxEdge / longest;
    }
  }
  const width = Math.max(1, Math.round(geometry.width * scale));
  const height = Math.max(1, Math.round(geometry.height * scale));

  if (targetCanvas.width !== width || targetCanvas.height !== height) {
    targetCanvas.width = width;
    targetCanvas.height = height;
  }
  const ctx = getPipelineContext(targetCanvas);
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((geomAdj.rotation * Math.PI) / 180);
  ctx.scale(geomAdj.flipH ? -1 : 1, geomAdj.flipV ? -1 : 1);

  const dw = geometry.sw * scale;
  const dh = geometry.sh * scale;
  ctx.drawImage(image, geometry.sx, geometry.sy, geometry.sw, geometry.sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  if (onAfterDraw) {
    onAfterDraw(ctx, scale);
  }

  if (!skipColorPipeline && needsColorPipeline(adjustments)
    && !applyColorPipelineGpuToCanvas(targetCanvas, adjustments, { scale, seed, interactive })) {
    const imageData = ctx.getImageData(0, 0, width, height);
    applyColorPipeline(imageData, adjustments, { scale, seed, interactive });
    ctx.putImageData(imageData, 0, 0);
  }

  if (!skipBlur && !interactive && adjustments.blur > 0) {
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = width;
    blurCanvas.height = height;
    const blurCtx = blurCanvas.getContext("2d");
    if (blurCtx) {
      blurCtx.filter = `blur(${adjustments.blur * scale}px)`;
      blurCtx.drawImage(targetCanvas, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(blurCanvas, 0, 0);
    }
  }

  return { width, height, scale };
}

export function cloneDefaultAdjustments() {
  return JSON.parse(JSON.stringify(DEFAULT_ADJUSTMENTS));
}

const PRESET_COMPARE_KEYS = [
  "luminance", "contrast", "temperature", "tint", "vibrance", "saturation", "hue",
  "highlights", "shadows", "whites", "blacks",
  "grain", "grainSize", "grainRoughness", "clarity", "dehaze", "texture", "vignette", "blur", "invert"
];

export function mergePresetAdjustments(currentAdjustments, presetAdjustments = {}) {
  const defaults = cloneDefaultAdjustments();
  const geometry = {
    cropTop: currentAdjustments?.cropTop ?? defaults.cropTop,
    cropRight: currentAdjustments?.cropRight ?? defaults.cropRight,
    cropBottom: currentAdjustments?.cropBottom ?? defaults.cropBottom,
    cropLeft: currentAdjustments?.cropLeft ?? defaults.cropLeft,
    rotation: currentAdjustments?.rotation ?? defaults.rotation,
    flipH: currentAdjustments?.flipH ?? defaults.flipH,
    flipV: currentAdjustments?.flipV ?? defaults.flipV
  };
  return {
    ...defaults,
    ...presetAdjustments,
    ...geometry,
    hsl: normalizeHslAdjustments({
      ...defaults.hsl,
      ...(presetAdjustments.hsl || {})
    }),
    curves: presetAdjustments.curves
      ? JSON.parse(JSON.stringify(presetAdjustments.curves))
      : defaults.curves,
    grading: normalizeGrading(presetAdjustments.grading),
    calibration: normalizeCalibration(presetAdjustments.calibration),
    lut: normalizeLutRef(presetAdjustments.lut)
  };
}

export function adjustmentsMatchPreset(currentAdjustments, presetAdjustments = {}) {
  // Cheap scalar reject first: the active-preset lookup runs over hundreds of
  // presets on every slider change.
  for (const key of PRESET_COMPARE_KEYS) {
    const target = presetAdjustments[key] ?? DEFAULT_ADJUSTMENTS[key];
    if (typeof target === "boolean") continue;
    if (Math.abs((Number(currentAdjustments?.[key]) || 0) - (Number(target) || 0)) > 0.5) return false;
  }
  const expected = mergePresetAdjustments(currentAdjustments, presetAdjustments);
  for (const key of PRESET_COMPARE_KEYS) {
    const current = currentAdjustments?.[key];
    const target = expected[key];
    if (typeof target === "boolean") {
      if (Boolean(current) !== target) return false;
      continue;
    }
    if (Math.abs(Number(current) - Number(target)) > 0.5) return false;
  }
  if (JSON.stringify(currentAdjustments?.hsl) !== JSON.stringify(expected.hsl)) return false;
  if (JSON.stringify(currentAdjustments?.curves) !== JSON.stringify(expected.curves)) return false;
  if (JSON.stringify(normalizeGrading(currentAdjustments?.grading)) !== JSON.stringify(expected.grading)) return false;
  if (JSON.stringify(normalizeCalibration(currentAdjustments?.calibration)) !== JSON.stringify(expected.calibration)) return false;
  const currentLut = normalizeLutRef(currentAdjustments?.lut);
  if (currentLut?.id !== expected.lut?.id) return false;
  if (currentLut && Math.abs(currentLut.amount - expected.lut.amount) > 0.5) return false;
  return true;
}

// Slider ranges used when scaling a preset by its Amount (0–150%).
const PRESET_SCALE_RANGES = {
  luminance: [-100, 100],
  contrast: [-100, 100],
  temperature: [-100, 100],
  tint: [-100, 100],
  vibrance: [-100, 100],
  saturation: [-100, 100],
  hue: [-180, 180],
  highlights: [-100, 100],
  shadows: [-100, 100],
  whites: [-100, 100],
  blacks: [-100, 100],
  grain: [0, 100],
  clarity: [-100, 100],
  dehaze: [-100, 100],
  texture: [-100, 100],
  vignette: [-100, 100],
  blur: [0, 20]
};

export const PRESET_AMOUNT_MAX = 150;

/**
 * Scale a preset's deviation from neutral by `amount` percent. Shape settings
 * (grain size/roughness, grading hues) keep their value; curves blend toward identity.
 */
export function scalePresetAdjustments(presetAdjustments = {}, amount = 100) {
  const k = clamp(Number(amount), 0, PRESET_AMOUNT_MAX) / 100;
  if (k === 1) return presetAdjustments;
  const out = { ...presetAdjustments };
  for (const [key, [min, max]] of Object.entries(PRESET_SCALE_RANGES)) {
    if (typeof out[key] !== "number") continue;
    const scaled = out[key] * k;
    out[key] = clamp(key === "blur" ? Math.round(scaled * 2) / 2 : Math.round(scaled), min, max);
  }
  if (out.hsl) {
    out.hsl = Object.fromEntries(Object.entries(out.hsl).map(([id, entry]) => [id, {
      h: clamp(Math.round((Number(entry?.h) || 0) * k), -180, 180),
      s: clamp(Math.round((Number(entry?.s) || 0) * k), -100, 100),
      l: clamp(Math.round((Number(entry?.l) || 0) * k), -100, 100)
    }]));
  }
  if (out.curves) {
    out.curves = Object.fromEntries(Object.entries(out.curves).map(([channel, points]) => {
      const scaled = (points || []).map(pt => ({ x: pt.x, y: clamp(Math.round(pt.x + (pt.y - pt.x) * k), 0, 255) }));
      // A curve scaled flat collapses back to the default two-point identity.
      const identity = scaled.every(pt => pt.y === pt.x);
      return [channel, identity ? DEFAULT_CURVES.rgb.map(pt => ({ ...pt })) : scaled];
    }));
  }
  if (out.grading) {
    const grading = normalizeGrading(out.grading);
    for (const zone of GRADING_ZONES) {
      grading[zone].s = clamp(Math.round(grading[zone].s * k), 0, 100);
      if (grading[zone].s === 0) grading[zone].h = 0;
    }
    grading.balance = clamp(Math.round(grading.balance * k), -100, 100);
    out.grading = grading;
  }
  if (out.calibration) {
    const calibration = normalizeCalibration(out.calibration);
    out.calibration = Object.fromEntries(Object.entries(calibration).map(([key, value]) => [key, clamp(Math.round(value * k), -100, 100)]));
  }
  if (out.lut) {
    const lut = normalizeLutRef(out.lut);
    out.lut = lut ? { ...lut, amount: clamp(Math.round(lut.amount * k), 0, 100) } : null;
  }
  if (out.invert && k === 0) out.invert = false;
  return out;
}

export function findActivePresetId(adjustments, presets = PRESETS) {
  const match = presets.find(item => adjustmentsMatchPreset(adjustments, item.adjustments));
  return match?.id || "";
}

export function isAdjustmentsDefault(adjustments) {
  return JSON.stringify(adjustments) === JSON.stringify(DEFAULT_ADJUSTMENTS);
}
