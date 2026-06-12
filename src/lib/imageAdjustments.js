export const COLOR_CHANNELS = [
  { id: "reds", name: "Reds", center: 0, color: "#ef4444" },
  { id: "yellows", name: "Yellows", center: 60, color: "#f59e0b" },
  { id: "greens", name: "Greens", center: 120, color: "#22c55e" },
  { id: "aquas", name: "Aquas", center: 180, color: "#22d3ee" },
  { id: "blues", name: "Blues", center: 240, color: "#3b82f6" },
  { id: "magentas", name: "Magentas", center: 300, color: "#d946ef" }
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
  clarity: 0,
  dehaze: 0,
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

export const PRESETS = [
  {
    id: "original",
    name: "Original",
    adjustments: {
      luminance: 0, contrast: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0, hue: 0,
      highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 0, dehaze: 0, blur: 0, invert: false
    }
  },
  {
    id: "cinematic",
    name: "Cinematic",
    adjustments: {
      luminance: -5, contrast: 15, temperature: 10, tint: -5, vibrance: 15, saturation: -10, hue: 0,
      highlights: 5, shadows: 10, whites: -5, blacks: 5, clarity: 15, dehaze: 5, blur: 0, invert: false
    }
  },
  {
    id: "vintage",
    name: "Vintage",
    adjustments: {
      luminance: 5, contrast: -10, temperature: 15, tint: 10, vibrance: -10, saturation: -15, hue: 5,
      highlights: -5, shadows: 5, whites: -10, blacks: 10, clarity: -10, dehaze: -5, blur: 0, invert: false
    }
  },
  {
    id: "vibrant",
    name: "Vibrant",
    adjustments: {
      luminance: 0, contrast: 10, temperature: 0, tint: 0, vibrance: 30, saturation: 15, hue: 0,
      highlights: 10, shadows: 5, whites: 10, blacks: -5, clarity: 10, dehaze: 10, blur: 0, invert: false
    }
  },
  {
    id: "dramatic",
    name: "Dramatic",
    adjustments: {
      luminance: -10, contrast: 30, temperature: -5, tint: 5, vibrance: 10, saturation: -20, hue: 0,
      highlights: 15, shadows: -15, whites: 15, blacks: -20, clarity: 25, dehaze: 15, blur: 0, invert: false
    }
  },
  {
    id: "blackwhite",
    name: "B&W",
    adjustments: {
      luminance: 0, contrast: 20, temperature: 0, tint: 0, vibrance: -100, saturation: -100, hue: 0,
      highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 15, dehaze: 10, blur: 0, invert: false
    }
  }
];

export const PREVIEW_MAX_EDGE = 1024;

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

export function hueDistance(a, b) {
  const diff = Math.abs(((a - b + 180) % 360) - 180);
  return Math.abs(diff);
}

export function isCurveActive(points) {
  if (!points) return false;
  if (points.length !== 2) return true;
  return points[0].y !== 0 || points[1].y !== 255;
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

export function applyImageAdjustments(image, adjustments, targetCanvas, { fullResolution = false } = {}) {
  const geometry = getOutputGeometry(image, adjustments);
  if (!image || !targetCanvas || !geometry) return null;

  let scale = 1;
  if (!fullResolution) {
    const longest = Math.max(geometry.width, geometry.height);
    if (longest > PREVIEW_MAX_EDGE) {
      scale = PREVIEW_MAX_EDGE / longest;
    }
  }
  const width = Math.max(1, Math.round(geometry.width * scale));
  const height = Math.max(1, Math.round(geometry.height * scale));

  targetCanvas.width = width;
  targetCanvas.height = height;
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((adjustments.rotation * Math.PI) / 180);
  ctx.scale(adjustments.flipH ? -1 : 1, adjustments.flipV ? -1 : 1);

  const brightness = clamp(100 + adjustments.luminance + adjustments.dehaze * 0.15, 0, 220);
  const contrast = clamp(100 + adjustments.contrast + adjustments.clarity * 0.35 + adjustments.dehaze * 0.45, 0, 240);
  const saturation = clamp(100 + adjustments.saturation + adjustments.vibrance * 0.6, 0, 240);
  const filters = [`brightness(${brightness}%)`, `contrast(${contrast}%)`, `saturate(${saturation}%)`];
  if (adjustments.blur > 0) filters.push(`blur(${adjustments.blur * scale}px)`);
  if (adjustments.hue) filters.push(`hue-rotate(${adjustments.hue}deg)`);
  if (adjustments.invert) filters.push("invert(1)");
  ctx.filter = filters.join(" ");

  const dw = geometry.sw * scale;
  const dh = geometry.sh * scale;
  ctx.drawImage(image, geometry.sx, geometry.sy, geometry.sw, geometry.sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  ctx.filter = "none";

  const activeHslChannels = COLOR_CHANNELS.filter(channel => {
    const channelAdjust = adjustments.hsl[channel.id];
    return channelAdjust.h !== 0 || channelAdjust.s !== 0 || channelAdjust.l !== 0;
  });
  const hasCurves = adjustments.curves && (
    isCurveActive(adjustments.curves.rgb)
    || isCurveActive(adjustments.curves.red)
    || isCurveActive(adjustments.curves.green)
    || isCurveActive(adjustments.curves.blue)
  );
  const needsPixelPass = adjustments.temperature !== 0
    || adjustments.tint !== 0
    || adjustments.grain > 0
    || adjustments.clarity !== 0
    || adjustments.dehaze !== 0
    || adjustments.highlights !== 0
    || adjustments.shadows !== 0
    || adjustments.whites !== 0
    || adjustments.blacks !== 0
    || activeHslChannels.length > 0
    || hasCurves;

  if (needsPixelPass) {
    const needsHsl = activeHslChannels.length > 0;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const tempShift = adjustments.temperature * 0.42;
    const tintShift = adjustments.tint * 0.35;
    const grainStrength = adjustments.grain * 0.9;
    const dehazeBias = adjustments.dehaze * 0.18;
    const clarityBias = adjustments.clarity * 0.12;

    const rShift = tempShift + dehazeBias;
    const bShift = -(tempShift - dehazeBias);
    const cb = clarityBias / 64;

    const activeChannelAdjusts = needsHsl
      ? activeHslChannels.map(channel => ({
        center: channel.center,
        h: adjustments.hsl[channel.id].h,
        s: adjustments.hsl[channel.id].s,
        l: adjustments.hsl[channel.id].l
      }))
      : null;

    const highlightsVal = adjustments.highlights * 0.45;
    const shadowsVal = adjustments.shadows * 0.45;
    const whitesVal = adjustments.whites * 0.55;
    const blacksVal = adjustments.blacks * 0.55;
    const hasLightAdjustments = highlightsVal !== 0 || shadowsVal !== 0 || whitesVal !== 0 || blacksVal !== 0;

    let lutR;
    let lutG;
    let lutB;
    if (hasCurves) {
      const lutRGB = getSplineLut(adjustments.curves.rgb);
      const lutRedOnly = getSplineLut(adjustments.curves.red);
      const lutGreenOnly = getSplineLut(adjustments.curves.green);
      const lutBlueOnly = getSplineLut(adjustments.curves.blue);

      lutR = new Uint8Array(256);
      lutG = new Uint8Array(256);
      lutB = new Uint8Array(256);

      for (let i = 0; i < 256; i++) {
        lutR[i] = lutRGB[lutRedOnly[i]];
        lutG[i] = lutRGB[lutGreenOnly[i]];
        lutB[i] = lutRGB[lutBlueOnly[i]];
      }
    }

    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) continue;
      let r = data[index];
      let g = data[index + 1];
      let b = data[index + 2];

      r += rShift;
      b += bShift;
      g += tintShift;

      if (clarityBias) {
        r += cb * (r - 128);
        g += cb * (g - 128);
        b += cb * (b - 128);
      }

      if (hasLightAdjustments) {
        const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
        let shift = 0;
        if (highlightsVal !== 0 && y > 0.2) {
          shift += highlightsVal * Math.pow((y - 0.2) / 0.8, 1.5);
        }
        if (shadowsVal !== 0 && y < 0.8) {
          shift += shadowsVal * Math.pow((0.8 - y) / 0.8, 1.5);
        }
        if (whitesVal !== 0 && y > 0.5) {
          shift += whitesVal * Math.pow((y - 0.5) / 0.5, 2);
        }
        if (blacksVal !== 0 && y < 0.4) {
          shift += blacksVal * Math.pow((0.4 - y) / 0.4, 2);
        }
        r += shift;
        g += shift;
        b += shift;
      }

      if (needsHsl) {
        const hsl = rgbToHsl(r, g, b);
        for (let i = 0; i < activeChannelAdjusts.length; i++) {
          const channelAdjust = activeChannelAdjusts[i];
          const weight = Math.max(0, 1 - hueDistance(hsl.h, channelAdjust.center) / 42);
          if (weight > 0) {
            hsl.h += channelAdjust.h * weight;
            hsl.s += channelAdjust.s * weight;
            hsl.l += channelAdjust.l * weight;
          }
        }
        const shifted = hslToRgb(hsl.h, hsl.s, hsl.l);
        r = shifted.r;
        g = shifted.g;
        b = shifted.b;
      }

      if (hasCurves) {
        r = lutR[clamp(Math.round(r), 0, 255)];
        g = lutG[clamp(Math.round(g), 0, 255)];
        b = lutB[clamp(Math.round(b), 0, 255)];
      }

      if (grainStrength > 0) {
        const noise = (Math.random() - 0.5) * grainStrength;
        r += noise;
        g += noise;
        b += noise;
      }

      data[index] = clamp(Math.round(r), 0, 255);
      data[index + 1] = clamp(Math.round(g), 0, 255);
      data[index + 2] = clamp(Math.round(b), 0, 255);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return { width, height, scale };
}

export function cloneDefaultAdjustments() {
  return JSON.parse(JSON.stringify(DEFAULT_ADJUSTMENTS));
}

export function isAdjustmentsDefault(adjustments) {
  return JSON.stringify(adjustments) === JSON.stringify(DEFAULT_ADJUSTMENTS);
}
