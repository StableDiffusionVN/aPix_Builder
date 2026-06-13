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
  curves: DEFAULT_CURVES
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

export const PRESETS = [
  preset("original", "Original", "neutral", {}),

  preset("portrait", "Portrait", "portrait", {
    luminance: 3,
    contrast: -5,
    temperature: 4,
    tint: 1,
    vibrance: 5,
    saturation: -5,
    highlights: -8,
    shadows: 10,
    whites: -5,
    blacks: 5,
    clarity: -8,
    texture: -10
  }),
  preset("portrait-soft", "Soft Portrait", "portrait", {
    luminance: 5,
    contrast: -10,
    temperature: 2,
    tint: 2,
    vibrance: 3,
    saturation: -8,
    highlights: -12,
    shadows: 12,
    whites: -8,
    blacks: 8,
    clarity: -12,
    texture: -14
  }),
  preset("golden-skin", "Golden Skin", "portrait", {
    luminance: 2,
    contrast: -2,
    temperature: 6,
    tint: 2,
    vibrance: 4,
    saturation: -2,
    highlights: -5,
    shadows: 6,
    clarity: -6,
    hsl: {
      oranges: { h: 0, s: -2, l: 4 }
    }
  }),

  preset("landscape", "Landscape", "landscape", {
    luminance: 2,
    contrast: 8,
    vibrance: 14,
    saturation: 5,
    highlights: -12,
    shadows: 10,
    whites: 3,
    blacks: -4,
    clarity: 12,
    dehaze: 10,
    hsl: {
      greens: { h: 0, s: 6, l: 2 },
      blues: { h: 0, s: 7, l: -2 },
      aquas: { h: 0, s: 4, l: 0 }
    }
  }),
  preset("landscape-autumn", "Autumn", "landscape", {
    luminance: 1,
    contrast: 5,
    temperature: 12,
    tint: 2,
    vibrance: 12,
    saturation: 3,
    highlights: -8,
    shadows: 6,
    clarity: 6,
    hsl: {
      oranges: { h: -3, s: 8, l: 2 },
      yellows: { h: -4, s: 6, l: 1 },
      reds: { h: 0, s: 5, l: 0 }
    }
  }),
  preset("landscape-tropical", "Tropical", "landscape", {
    luminance: 3,
    contrast: 4,
    temperature: 2,
    tint: -2,
    vibrance: 16,
    saturation: 6,
    highlights: -5,
    clarity: 8,
    dehaze: 6,
    hsl: {
      aquas: { h: 0, s: 8, l: 3 },
      greens: { h: 2, s: 5, l: 0 },
      blues: { h: 0, s: 6, l: -1 }
    }
  }),

  preset("cinematic", "Cinematic", "creative", {
    luminance: -5,
    contrast: 12,
    temperature: 6,
    tint: -5,
    vibrance: 6,
    saturation: -6,
    highlights: 4,
    shadows: 10,
    whites: -4,
    blacks: 5,
    clarity: 8,
    dehaze: 4,
    vignette: -10,
    hsl: {
      blues: { h: 4, s: 4, l: -3 },
      oranges: { h: 0, s: 6, l: 2 }
    }
  }),
  preset("moody", "Moody", "creative", {
    luminance: -8,
    contrast: 14,
    temperature: -4,
    tint: 2,
    vibrance: 3,
    saturation: -8,
    highlights: -14,
    shadows: 7,
    whites: -6,
    blacks: -9,
    clarity: 8,
    vignette: -14
  }),
  preset("vintage", "Vintage", "creative", {
    luminance: 4,
    contrast: -7,
    temperature: 10,
    tint: 5,
    vibrance: -4,
    saturation: -10,
    highlights: -10,
    shadows: 8,
    whites: -7,
    blacks: 12,
    clarity: -8,
    grain: 14,
    grainSize: 58,
    grainRoughness: 48,
    vignette: -12
  }),
  preset("fade", "Matte Fade", "creative", {
    luminance: 3,
    contrast: -10,
    temperature: 4,
    saturation: -7,
    highlights: -9,
    shadows: 10,
    blacks: 14,
    clarity: -8,
    grain: 8,
    vignette: -6
  }),
  preset("cross-process", "Cross Process", "creative", {
    luminance: 2,
    contrast: 8,
    temperature: -5,
    tint: 6,
    vibrance: 8,
    saturation: 3,
    highlights: -4,
    clarity: 5,
    hsl: {
      greens: { h: 4, s: 4, l: 0 }
    }
  }),

  preset("bright-airy", "Bright & Airy", "modern", {
    luminance: 10,
    contrast: -9,
    temperature: 2,
    tint: 1,
    vibrance: 5,
    saturation: -4,
    highlights: -16,
    shadows: 16,
    whites: -8,
    blacks: 6,
    clarity: -10,
    texture: -6
  }),
  preset("deep-rich", "Deep & Rich", "modern", {
    luminance: -3,
    contrast: 12,
    vibrance: 5,
    saturation: 5,
    highlights: -6,
    shadows: 5,
    blacks: -8,
    clarity: 10,
    dehaze: 3
  }),
  preset("punchy", "Punchy", "modern", {
    luminance: 1,
    contrast: 10,
    vibrance: 12,
    saturation: 6,
    highlights: -4,
    shadows: 4,
    whites: 4,
    blacks: -5,
    clarity: 10,
    texture: 6
  }),
  preset("vibrant", "Vibrant", "modern", {
    luminance: 1,
    contrast: 5,
    vibrance: 12,
    saturation: 4,
    highlights: 2,
    shadows: 3,
    whites: 3,
    blacks: -3,
    clarity: 5,
    dehaze: 4
  }),

  preset("blackwhite", "B&W", "bw", {
    vibrance: -100,
    saturation: -100,
    contrast: 12,
    clarity: 8,
    blacks: -4
  }),
  preset("bw-contrast", "B&W Contrast", "bw", {
    vibrance: -100,
    saturation: -100,
    contrast: 18,
    clarity: 10,
    blacks: -9,
    whites: 4
  }),
  preset("bw-matte", "B&W Matte", "bw", {
    vibrance: -100,
    saturation: -100,
    contrast: -4,
    blacks: 14,
    shadows: 6,
    clarity: -3,
    grain: 10,
    grainSize: 52
  }),
  preset("bw-silver", "Silver Gelatin", "bw", {
    vibrance: -100,
    saturation: -100,
    contrast: 14,
    clarity: 12,
    texture: 5,
    blacks: -6,
    grain: 12,
    grainRoughness: 36
  }),

  preset("golden-hour", "Golden Hour", "specialty", {
    luminance: 2,
    contrast: 4,
    temperature: 10,
    tint: 3,
    vibrance: 6,
    saturation: 0,
    highlights: -6,
    shadows: 5,
    clarity: 2,
    vignette: -5,
    hsl: {
      oranges: { h: 0, s: 2, l: 2 },
      yellows: { h: -2, s: 2, l: 1 }
    }
  }),
  preset("cool-nordic", "Cool Nordic", "specialty", {
    luminance: 2,
    contrast: 6,
    temperature: -12,
    tint: -3,
    vibrance: 4,
    saturation: -4,
    highlights: -5,
    clarity: 6,
    dehaze: 7,
    hsl: {
      blues: { h: 0, s: 5, l: -2 },
      aquas: { h: 0, s: 4, l: 0 }
    }
  }),
  preset("street", "Street", "specialty", {
    luminance: -2,
    contrast: 10,
    vibrance: 7,
    saturation: 2,
    highlights: -3,
    shadows: 5,
    blacks: -6,
    clarity: 14,
    texture: 8,
    dehaze: 3
  }),
  preset("food", "Food", "specialty", {
    luminance: 3,
    contrast: 3,
    temperature: 4,
    vibrance: 10,
    saturation: 3,
    highlights: -5,
    clarity: 6,
    texture: 4,
    hsl: {
      oranges: { h: 0, s: 3, l: 2 },
      yellows: { h: 0, s: 2, l: 2 }
    }
  }),
  preset("night", "Night", "specialty", {
    luminance: 6,
    contrast: 8,
    temperature: -7,
    tint: -2,
    vibrance: 5,
    saturation: -2,
    shadows: 14,
    blacks: -4,
    clarity: 4,
    dehaze: -4,
    vignette: -10
  }),
  preset("editorial", "Editorial", "specialty", {
    luminance: -4,
    contrast: 12,
    saturation: -5,
    highlights: -10,
    shadows: 4,
    whites: -3,
    blacks: -7,
    clarity: 10,
    texture: 4,
    vignette: -8
  }),
  preset("dramatic", "Dramatic", "specialty", {
    luminance: -6,
    contrast: 16,
    temperature: -3,
    tint: 2,
    vibrance: 4,
    saturation: -8,
    highlights: 6,
    shadows: -5,
    whites: 7,
    blacks: -11,
    clarity: 14,
    dehaze: 8,
    vignette: -10
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

  let outR = 0;
  let outG = 0;
  let outB = 0;

  for (let i = 0; i < channelAdjusts.length; i++) {
    const weight = weights[i] / weightSum;
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
  const lut = new Uint8Array(256);
  const n = points.length;

  if (n === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const dx = p1.x - p0.x || 1;
    for (let i = 0; i < 256; i++) {
      if (i < p0.x) {
        lut[i] = p0.y;
      } else if (i > p1.x) {
        lut[i] = p1.y;
      } else {
        const t = (i - p0.x) / dx;
        lut[i] = clamp(Math.round(p0.y + t * (p1.y - p0.y)), 0, 255);
      }
    }
    return lut;
  }

  const h = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = points[i + 1].x - points[i].x || 1;
  }

  const a = new Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = points[i].y;
  }

  const alpha = new Array(n - 1);
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (a[i + 1] - a[i]) - (3 / h[i - 1]) * (a[i] - a[i - 1]);
  }

  const l = new Array(n);
  const mu = new Array(n);
  const z = new Array(n);

  l[0] = 1;
  mu[0] = 0;
  z[0] = 0;

  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (points[i + 1].x - points[i - 1].x) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  l[n - 1] = 1;
  z[n - 1] = 0;

  const b = new Array(n);
  const c = new Array(n);
  const d = new Array(n);

  c[n - 1] = 0;

  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (a[j + 1] - a[j]) / h[j] - (h[j] * (c[j + 1] + 2 * c[j])) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  let j = 0;
  for (let i = 0; i < 256; i++) {
    if (i < points[0].x) {
      lut[i] = points[0].y;
    } else if (i > points[n - 1].x) {
      lut[i] = points[n - 1].y;
    } else {
      while (j < n - 1 && i > points[j + 1].x) {
        j++;
      }
      const dx = i - points[j].x;
      const val = a[j] + b[j] * dx + c[j] * dx * dx + d[j] * dx * dx * dx;
      lut[i] = clamp(Math.round(val), 0, 255);
    }
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

const SRGB_TO_LINEAR = new Float32Array(256);
const LINEAR_TO_SRGB = new Uint8Array(4096);

for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

for (let i = 0; i < 4096; i++) {
  const linear = i / 4095;
  const srgb = linear <= 0.0031308
    ? linear * 12.92
    : 1.055 * (linear ** (1 / 2.4)) - 0.055;
  LINEAR_TO_SRGB[i] = clamp(Math.round(srgb * 255), 0, 255);
}

function srgbByteToLinear(value) {
  return SRGB_TO_LINEAR[clamp(Math.round(value), 0, 255)];
}

function linearToSrgbByte(value) {
  const normalized = clamp(value, 0, 1);
  return LINEAR_TO_SRGB[clamp(Math.round(normalized * 4095), 0, 4095)];
}

function pipelineSmoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applyWhiteBalanceLinear(r, g, b, temperature, tint) {
  const temp = temperature / 100;
  const tintNorm = tint / 100;
  return {
    r: r * (1 + temp * 0.18),
    g: g * (1 + tintNorm * 0.1 - temp * 0.025),
    b: b * (1 - temp * 0.18)
  };
}

function applyExposureLinear(r, g, b, luminance) {
  if (luminance === 0) return { r, g, b };
  // Slider -100..+100 maps to 0..220% brightness (legacy CSS filter scale).
  // EV-style 2^(L/20) blew highlights ~4× faster at small values (+10 → +41% vs +10%).
  const gain = clamp(1 + luminance / 100, 0, 2.2);
  return { r: r * gain, g: g * gain, b: b * gain };
}

function applyContrastLinear(r, g, b, contrast) {
  if (contrast === 0) return { r, g, b };
  // Soft contrast around mid-gray; +100 ≈ 140% (legacy CSS hit 200% in display filter space).
  const factor = 1 + (contrast / 100) * 0.4;
  const pivot = 0.5;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const newLuma = pivot + (luma - pivot) * factor;
  if (luma <= 1e-6) return { r: newLuma, g: newLuma, b: newLuma };
  const scale = newLuma / luma;
  return { r: r * scale, g: g * scale, b: b * scale };
}

function perceptualLumaFromLinear(r, g, b) {
  const rs = linearToSrgbByte(r) / 255;
  const gs = linearToSrgbByte(g) / 255;
  const bs = linearToSrgbByte(b) / 255;
  return clamp(0.299 * rs + 0.587 * gs + 0.114 * bs, 0, 1);
}

function applyToneRangesLinear(r, g, b, highlights, shadows, whites, blacks) {
  const luma = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1);
  const y = perceptualLumaFromLinear(r, g, b);

  // Legacy additive tone shifts (~45/255 max) with soft power-curve masks.
  const highlightsVal = highlights * 0.0016;
  const shadowsVal = shadows * 0.0016;
  const whitesVal = whites * 0.0019;
  const blacksVal = blacks * 0.0019;

  let delta = 0;
  if (highlights !== 0 && y > 0.2) {
    delta += highlightsVal * ((y - 0.2) / 0.8) ** 1.5;
  }
  if (shadows !== 0 && y < 0.8) {
    delta += shadowsVal * ((0.8 - y) / 0.8) ** 1.5;
  }
  if (whites !== 0 && y > 0.5) {
    delta += whitesVal * ((y - 0.5) / 0.5) ** 2;
  }
  if (blacks !== 0 && y < 0.4) {
    delta += blacksVal * ((0.4 - y) / 0.4) ** 2;
  }

  if (Math.abs(delta) < 1e-8) return { r, g, b };
  const newLuma = clamp(luma + delta, 0, 1);
  if (luma <= 1e-6) return { r: newLuma, g: newLuma, b: newLuma };
  const scale = newLuma / luma;
  return { r: r * scale, g: g * scale, b: b * scale };
}

function applySaturationAndVibranceLinear(r, g, b, saturation, vibrance) {
  if (saturation === 0 && vibrance === 0) return { r, g, b };
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // -100 → 0 (full B&W), 0 → 1 (unchanged). Positive boost stays softer than desat.
  const desatFloor = saturation <= 0 ? Math.max(0, 1 + saturation / 100) : 0;
  let satFactor = saturation < 0
    ? 1 + saturation / 100
    : 1 + saturation / 120;

  if (vibrance !== 0) {
    const hsl = rgbToHsl(r * 255, g * 255, b * 255);
    const satNorm = hsl.s / 100;
    const skinProtect = 1 - pipelineSmoothstep(
      0,
      24,
      hueDistance(hsl.h, 28)
    ) * 0.65;
    const vibranceDivisor = vibrance < 0 ? 100 : 120;
    const vibranceExtra = (vibrance / vibranceDivisor) * (1 - satNorm) ** 2 * skinProtect;
    satFactor += vibranceExtra;
  }

  satFactor = clamp(satFactor, desatFloor, 2.2);
  if (satFactor <= 1e-6) return { r: luma, g: luma, b: luma };

  return {
    r: luma + (r - luma) * satFactor,
    g: luma + (g - luma) * satFactor,
    b: luma + (b - luma) * satFactor
  };
}

function applyGlobalHueLinear(r, g, b, hue) {
  if (hue === 0) return { r, g, b };
  const hsl = rgbToHsl(r * 255, g * 255, b * 255);
  const rgb = hslToRgb(hsl.h + hue, hsl.s, hsl.l);
  return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
}

function applyDehazeLinear(r, g, b, dehaze) {
  if (dehaze === 0) return { r, g, b };
  const amount = dehaze / 100;
  const dark = Math.min(r, g, b);
  const hazeWeight = pipelineSmoothstep(0.35, 0.92, dark);
  const contrast = 1 + amount * 0.55 * hazeWeight;
  const blackShift = -amount * 0.025;
  const sat = 1 + amount * 0.22 * hazeWeight;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let nr = luma + (r - luma) * sat;
  let ng = luma + (g - luma) * sat;
  let nb = luma + (b - luma) * sat;
  nr = ((nr - 0.5) * contrast + 0.5) + blackShift;
  ng = ((ng - 0.5) * contrast + 0.5) + blackShift;
  nb = ((nb - 0.5) * contrast + 0.5) + blackShift;
  return { r: nr, g: ng, b: nb };
}

function buildCurveLuts(curves) {
  const lutRGB = getSplineLut(curves.rgb);
  const lutRedOnly = getSplineLut(curves.red);
  const lutGreenOnly = getSplineLut(curves.green);
  const lutBlueOnly = getSplineLut(curves.blue);
  const lutR = new Uint8Array(256);
  const lutG = new Uint8Array(256);
  const lutB = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lutR[i] = lutRGB[lutRedOnly[i]];
    lutG[i] = lutRGB[lutGreenOnly[i]];
    lutB[i] = lutRGB[lutBlueOnly[i]];
  }
  return { lutR, lutG, lutB };
}

function applyCurveLinear(r, g, b, lutR, lutG, lutB) {
  return {
    r: srgbByteToLinear(lutR[linearToSrgbByte(r)]),
    g: srgbByteToLinear(lutG[linearToSrgbByte(g)]),
    b: srgbByteToLinear(lutB[linearToSrgbByte(b)])
  };
}

function boxBlurRgb(source, target, width, height, radius) {
  const temp = new Float32Array(width * height * 3);
  const window = radius * 2 + 1;
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          sum += source[(y * width + clamp(x + k, 0, width - 1)) * 4 + c];
        }
        temp[(y * width + x) * 3 + c] = sum / window;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          sum += temp[(clamp(y + k, 0, height - 1) * width + x) * 3 + c];
        }
        target[(y * width + x) * 4 + c] = sum / window;
      }
    }
  }
}

function applyClarityPass(data, width, height, clarity, scale) {
  if (clarity === 0) return;
  const radius = Math.max(1, Math.round((Math.abs(clarity) / 100) * 10 * Math.max(scale, 0.35)));
  const strength = clarity / 100 * 0.75;
  const original = new Uint8ClampedArray(data);
  const blurred = new Float32Array(data.length);
  boxBlurRgb(original, blurred, width, height, radius);
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.2126 * original[i] + 0.7152 * original[i + 1] + 0.0722 * original[i + 2]) / 255;
    const midWeight = 4 * luma * (1 - luma);
    data[i] = clamp(original[i] + strength * midWeight * (original[i] - blurred[i]), 0, 255);
    data[i + 1] = clamp(original[i + 1] + strength * midWeight * (original[i + 1] - blurred[i + 1]), 0, 255);
    data[i + 2] = clamp(original[i + 2] + strength * midWeight * (original[i + 2] - blurred[i + 2]), 0, 255);
  }
}

function applyTexturePass(data, width, height, texture, scale) {
  if (texture === 0) return;
  const radius = Math.max(1, Math.round(2 * Math.max(scale, 0.35)));
  const amount = texture / 100 * 0.45;
  const original = new Uint8ClampedArray(data);
  const blurred = new Float32Array(data.length);
  boxBlurRgb(original, blurred, width, height, radius);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(original[i] + amount * (original[i] - blurred[i]), 0, 255);
    data[i + 1] = clamp(original[i + 1] + amount * (original[i + 1] - blurred[i + 1]), 0, 255);
    data[i + 2] = clamp(original[i + 2] + amount * (original[i + 2] - blurred[i + 2]), 0, 255);
  }
}

function applyVignettePass(data, width, height, vignette) {
  if (vignette === 0) return;
  const amount = vignette / 100;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
      const shade = 1 - amount * 0.65 * pipelineSmoothstep(0.35, 1, dist);
      data[idx] = clamp(data[idx] * shade, 0, 255);
      data[idx + 1] = clamp(data[idx + 1] * shade, 0, 255);
      data[idx + 2] = clamp(data[idx + 2] * shade, 0, 255);
    }
  }
}

function applyGrainPass(data, width, height, grain, grainSize, grainRoughness, seed) {
  if (grain === 0) return;
  const rand = mulberry32(seed);
  const sizeScale = 0.5 + (grainSize / 100) * 1.5;
  const roughness = grainRoughness / 100;
  const strength = grain * 0.75;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const cellX = Math.floor(x / sizeScale);
      const cellY = Math.floor(y / sizeScale);
      const coarse = (mulberry32((cellX + 1) * 374761 + (cellY + 1) * 668265 + seed)() - 0.5) * 2;
      const fine = (rand() - 0.5) * 2;
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

export function needsColorPipeline(adjustments) {
  if (!adjustments) return false;
  if (adjustments.invert) return true;
  if (adjustments.luminance !== 0 || adjustments.contrast !== 0) return true;
  if (adjustments.temperature !== 0 || adjustments.tint !== 0) return true;
  if (adjustments.vibrance !== 0 || adjustments.saturation !== 0 || adjustments.hue !== 0) return true;
  if (adjustments.highlights !== 0 || adjustments.shadows !== 0 || adjustments.whites !== 0 || adjustments.blacks !== 0) return true;
  if (adjustments.grain !== 0 || adjustments.clarity !== 0 || adjustments.dehaze !== 0) return true;
  if (adjustments.texture !== 0 || adjustments.vignette !== 0) return true;
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

export function applyColorPipeline(imageData, adjustments, { scale = 1, seed = 1, interactive = false } = {}) {
  const { data, width, height } = imageData;
  const activeHslChannels = COLOR_CHANNELS.filter(channel => {
    const entry = adjustments.hsl?.[channel.id];
    return entry && (entry.h !== 0 || entry.s !== 0 || entry.l !== 0);
  });
  const activeChannelAdjusts = activeHslChannels.length
    ? activeHslChannels.map(channel => ({
      center: channel.center,
      radius: channel.radius ?? HSL_CHANNEL_RADIUS,
      h: adjustments.hsl[channel.id].h,
      s: adjustments.hsl[channel.id].s,
      l: adjustments.hsl[channel.id].l
    }))
    : null;
  const hasCurves = adjustments.curves && (
    isCurveActive(adjustments.curves.rgb)
    || isCurveActive(adjustments.curves.red)
    || isCurveActive(adjustments.curves.green)
    || isCurveActive(adjustments.curves.blue)
  );
  const curveLuts = hasCurves ? buildCurveLuts(adjustments.curves) : null;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    let r = srgbByteToLinear(data[index]);
    let g = srgbByteToLinear(data[index + 1]);
    let b = srgbByteToLinear(data[index + 2]);

    ({ r, g, b } = applyWhiteBalanceLinear(r, g, b, adjustments.temperature, adjustments.tint));
    ({ r, g, b } = applyExposureLinear(r, g, b, adjustments.luminance));
    ({ r, g, b } = applyContrastLinear(r, g, b, adjustments.contrast));
    if (curveLuts) ({ r, g, b } = applyCurveLinear(r, g, b, curveLuts.lutR, curveLuts.lutG, curveLuts.lutB));
    ({ r, g, b } = applyToneRangesLinear(
      r, g, b,
      adjustments.highlights,
      adjustments.shadows,
      adjustments.whites,
      adjustments.blacks
    ));
    ({ r, g, b } = applySaturationAndVibranceLinear(r, g, b, adjustments.saturation, adjustments.vibrance));
    ({ r, g, b } = applyGlobalHueLinear(r, g, b, adjustments.hue));
    if (activeChannelAdjusts) {
      const rgb = applyHslChannelMixRgb(r * 255, g * 255, b * 255, activeChannelAdjusts);
      r = rgb.r / 255;
      g = rgb.g / 255;
      b = rgb.b / 255;
    }
    ({ r, g, b } = applyDehazeLinear(r, g, b, adjustments.dehaze));
    if (adjustments.invert) {
      r = 1 - r;
      g = 1 - g;
      b = 1 - b;
    }
    data[index] = linearToSrgbByte(r);
    data[index + 1] = linearToSrgbByte(g);
    data[index + 2] = linearToSrgbByte(b);
  }

  if (!interactive) {
    applyClarityPass(data, width, height, adjustments.clarity, scale);
    applyTexturePass(data, width, height, adjustments.texture, scale);
    applyVignettePass(data, width, height, adjustments.vignette);
    applyGrainPass(
      data,
      width,
      height,
      adjustments.grain,
      adjustments.grainSize ?? 50,
      adjustments.grainRoughness ?? 50,
      seed
    );
  }
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

  if (needsColorPipeline(adjustments)) {
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

  if (!skipColorPipeline && needsColorPipeline(adjustments)) {
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
      : defaults.curves
  };
}

export function adjustmentsMatchPreset(currentAdjustments, presetAdjustments = {}) {
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
  return true;
}

export function findActivePresetId(adjustments, presets = PRESETS) {
  const match = presets.find(item => adjustmentsMatchPreset(adjustments, item.adjustments));
  return match?.id || "";
}

export function isAdjustmentsDefault(adjustments) {
  return JSON.stringify(adjustments) === JSON.stringify(DEFAULT_ADJUSTMENTS);
}
