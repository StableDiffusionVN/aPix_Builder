import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  ChevronDown,
  Crop,
  Download,
  Droplet,
  Eraser,
  FlipHorizontal,
  FlipVertical,
  GitCompare,
  Hand,
  Pipette,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";

const COLOR_CHANNELS = [
  { id: "reds", name: "Reds", center: 0, color: "#ef4444" },
  { id: "yellows", name: "Yellows", center: 60, color: "#f59e0b" },
  { id: "greens", name: "Greens", center: 120, color: "#22c55e" },
  { id: "aquas", name: "Aquas", center: 180, color: "#22d3ee" },
  { id: "blues", name: "Blues", center: 240, color: "#3b82f6" },
  { id: "magentas", name: "Magentas", center: 300, color: "#d946ef" }
];

const DEFAULT_HSL = Object.fromEntries(COLOR_CHANNELS.map(channel => [channel.id, { h: 0, s: 0, l: 0 }]));

const DEFAULT_ADJUSTMENTS = {
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
  hsl: DEFAULT_HSL
};

const DEFAULT_BRUSH = {
  size: 28,
  opacity: 70,
  color: "#ffffff",
  hardness: 100
};

const PRESETS = [
  {
    id: "original",
    name: "Original",
    adjustments: {
      luminance: 0, contrast: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0, hue: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 0, dehaze: 0, blur: 0, invert: false
    }
  },
  {
    id: "cinematic",
    name: "Cinematic",
    adjustments: {
      luminance: -5, contrast: 15, temperature: 10, tint: -5, vibrance: 15, saturation: -10, hue: 0, highlights: 5, shadows: 10, whites: -5, blacks: 5, clarity: 15, dehaze: 5, blur: 0, invert: false
    }
  },
  {
    id: "vintage",
    name: "Vintage",
    adjustments: {
      luminance: 5, contrast: -10, temperature: 15, tint: 10, vibrance: -10, saturation: -15, hue: 5, highlights: -5, shadows: 5, whites: -10, blacks: 10, clarity: -10, dehaze: -5, blur: 0, invert: false
    }
  },
  {
    id: "vibrant",
    name: "Vibrant",
    adjustments: {
      luminance: 0, contrast: 10, temperature: 0, tint: 0, vibrance: 30, saturation: 15, hue: 0, highlights: 10, shadows: 5, whites: 10, blacks: -5, clarity: 10, dehaze: 10, blur: 0, invert: false
    }
  },
  {
    id: "dramatic",
    name: "Dramatic",
    adjustments: {
      luminance: -10, contrast: 30, temperature: -5, tint: 5, vibrance: 10, saturation: -20, hue: 0, highlights: 15, shadows: -15, whites: 15, blacks: -20, clarity: 25, dehaze: 15, blur: 0, invert: false
    }
  },
  {
    id: "blackwhite",
    name: "B&W",
    adjustments: {
      luminance: 0, contrast: 20, temperature: 0, tint: 0, vibrance: -100, saturation: -100, hue: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 15, dehaze: 10, blur: 0, invert: false
    }
  }
];

// Preview is rendered at a capped resolution so the per-pixel pass and canvas
// reads stay cheap while dragging sliders. Full resolution is only used on save.
const PREVIEW_MAX_EDGE = 1024;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampCrop(value) {
  return clamp(Number(value) || 0, 0, 95);
}

const CROP_RATIOS = [
  { id: "free", label: "Tự do", value: null },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "3:4", label: "3:4", value: 3 / 4 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
  { id: "9:16", label: "9:16", value: 9 / 16 }
];

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map(char => `${char}${char}`).join("") : normalized;
  const number = parseInt(full, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255
  };
}

function componentToHex(value) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function rgbToHsl(r, g, b) {
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

function hslToRgb(h, s, l) {
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

function hueDistance(a, b) {
  const diff = Math.abs(((a - b + 180) % 360) - 180);
  return Math.abs(diff);
}

// Draws a single stroke onto a 2D context. Eraser strokes use destination-out
// so — when drawn on a dedicated transparent stroke layer — they only remove
// previously painted brush pixels, never the underlying image.
function drawStroke(ctx, stroke, width, height, scale) {
  if (!stroke || !stroke.points || !stroke.points.length) return;
  ctx.save();
  ctx.globalAlpha = stroke.opacity / 100;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  
  const size = Math.max(1, stroke.size * scale);
  const hardness = stroke.hardness ?? 100;
  
  if (hardness < 100) {
    const blur = size * (1 - hardness / 100);
    ctx.shadowBlur = blur;
    ctx.shadowColor = stroke.tool === "eraser" ? "black" : stroke.color;
    ctx.strokeStyle = stroke.tool === "eraser" ? "black" : stroke.color;
    ctx.lineWidth = Math.max(1, size * (hardness / 100));
  } else {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = size;
  }
  
  ctx.beginPath();
  const first = stroke.points[0];
  ctx.moveTo(first.x * width, first.y * height);
  stroke.points.slice(1).forEach(point => ctx.lineTo(point.x * width, point.y * height));
  if (stroke.points.length === 1) {
    ctx.lineTo(first.x * width + 0.01, first.y * height + 0.01);
  }
  ctx.stroke();
  ctx.restore();
}

function computeHistogram(canvas) {
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
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lHist[l]++;
  }
  
  return { rHist, gHist, bHist, lHist };
}

function drawHistogram(canvas, histData) {
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
    // Draw the fill
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
    
    // Draw the outline
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

function snapshot(adjustments, brush, strokes) {
  return {
    adjustments: JSON.parse(JSON.stringify(adjustments)),
    brush: { ...brush },
    strokes: JSON.parse(JSON.stringify(strokes))
  };
}

export function ImageEditorModal({ source, title = "Image Editor", onClose, onSave }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const adjustmentsRef = useRef(DEFAULT_ADJUSTMENTS);
  const brushRef = useRef(DEFAULT_BRUSH);
  const strokesRef = useRef([]);
  const panStartRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const rafRef = useRef(null);
  const baseCanvasRef = useRef(null);
  const strokeLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const previewMetaRef = useRef(null);
  const croppingRef = useRef(false);
  const altToolRef = useRef(null);

  const origCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);

  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [brush, setBrush] = useState(DEFAULT_BRUSH);
  const [strokes, setStrokes] = useState([]);
  const [hoveredZone, setHoveredZone] = useState(null);
  const histogramDragRef = useRef(null);
  const [activeTool, setActiveTool] = useState("hand");
  const [openSections, setOpenSections] = useState({ basic: true, presets: true });
  const [activeColorTab, setActiveColorTab] = useState("reds");
  const [cropRatio, setCropRatio] = useState("free");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [brushCursor, setBrushCursor] = useState(null);
  const canvasScaleRef = useRef(1);

  const [editorCompareMode, setEditorCompareMode] = useState(false);
  const [editorComparePosition, setEditorComparePosition] = useState(50);
  const [editorCompareDividerX, setEditorCompareDividerX] = useState(50);
  const [exportFormat, setExportFormat] = useState("image/png");
  const [exportQuality, setExportQuality] = useState(90);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;

  useEffect(() => {
    adjustmentsRef.current = adjustments;
  }, [adjustments]);

  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const commitHistory = useCallback((nextAdjustments, nextBrush, nextStrokes) => {
    const entry = snapshot(nextAdjustments, nextBrush, nextStrokes);
    setHistory(current => {
      const trimmed = current.slice(0, historyIndex + 1);
      trimmed.push(entry);
      return trimmed.slice(-80);
    });
    setHistoryIndex(index => Math.min(index + 1, 79));
  }, [historyIndex]);

  const restore = useCallback(entry => {
    setAdjustments(entry.adjustments);
    setBrush(entry.brush);
    setStrokes(entry.strokes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setError("");
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setBrush(DEFAULT_BRUSH);
    setStrokes([]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    loadImage(source)
      .then(image => {
        if (cancelled) return;
        imageRef.current = image;
        const initial = snapshot(DEFAULT_ADJUSTMENTS, DEFAULT_BRUSH, []);
        setHistory([initial]);
        setHistoryIndex(0);
        setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được ảnh vào editor");
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const getOutputGeometry = useCallback((image = imageRef.current, nextAdjustments = adjustments) => {
    if (!image) return null;
    const cropLeft = clampCrop(nextAdjustments.cropLeft) / 100;
    const cropRight = clampCrop(nextAdjustments.cropRight) / 100;
    const cropTop = clampCrop(nextAdjustments.cropTop) / 100;
    const cropBottom = clampCrop(nextAdjustments.cropBottom) / 100;
    const sx = Math.round(image.naturalWidth * cropLeft);
    const sy = Math.round(image.naturalHeight * cropTop);
    const sw = Math.max(1, Math.round(image.naturalWidth * (1 - cropLeft - cropRight)));
    const sh = Math.max(1, Math.round(image.naturalHeight * (1 - cropTop - cropBottom)));
    const rotated = Math.abs(nextAdjustments.rotation % 180) === 90;
    return {
      sx,
      sy,
      sw,
      sh,
      width: rotated ? sh : sw,
      height: rotated ? sw : sh
    };
  }, [adjustments]);

  // Applies all colour/geometry adjustments onto a target canvas. Cheap GPU
  // filters (brightness/contrast/saturate/blur/hue/invert) are handled by
  // ctx.filter; the costly per-pixel JS pass only runs when an adjustment that
  // truly needs it is active, and the HSL round-trip is gated even further.
  const applyAdjustments = useCallback((targetCanvas, { fullResolution = false, ignoreCrop = false } = {}) => {
    const image = imageRef.current;
    // While the crop tool is active the preview shows the full, un-rotated image
    // so the draggable crop box maps 1:1 to the source pixels.
    const geomAdj = ignoreCrop
      ? { ...adjustments, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0, rotation: 0, flipH: false, flipV: false }
      : adjustments;
    const geometry = getOutputGeometry(image, geomAdj);
    if (!image || !targetCanvas || !geometry) return null;

    let scale = 1;
    if (!fullResolution) {
      const longest = Math.max(geometry.width, geometry.height);
      if (longest > PREVIEW_MAX_EDGE) scale = PREVIEW_MAX_EDGE / longest;
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
    ctx.rotate((geomAdj.rotation * Math.PI) / 180);
    ctx.scale(geomAdj.flipH ? -1 : 1, geomAdj.flipV ? -1 : 1);

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
      const a = adjustments.hsl[channel.id];
      return a.h !== 0 || a.s !== 0 || a.l !== 0;
    });
    const needsPixelPass = adjustments.temperature !== 0
      || adjustments.tint !== 0
      || adjustments.grain > 0
      || adjustments.clarity !== 0
      || adjustments.dehaze !== 0
      || adjustments.highlights !== 0
      || adjustments.shadows !== 0
      || adjustments.whites !== 0
      || adjustments.blacks !== 0
      || activeHslChannels.length > 0;

    if (needsPixelPass) {
      const needsHsl = activeHslChannels.length > 0;
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const tempShift = adjustments.temperature * 0.42;
      const tintShift = adjustments.tint * 0.35;
      const grainStrength = adjustments.grain * 0.9;
      const dehazeBias = adjustments.dehaze * 0.18;
      const clarityBias = adjustments.clarity * 0.12;

      // Cache shifts and calculate cb ratio outside the loop
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
  }, [adjustments, getOutputGeometry]);

  // Rebuilds the dedicated (transparent) brush layer by replaying all committed
  // strokes. Kept separate from the image so the eraser only removes brush
  // pixels. Only called when the stroke set or canvas size changes — never on
  // every pointer move.
  const syncStrokeLayer = useCallback(() => {
    const meta = previewMetaRef.current;
    if (!meta) return;
    if (!strokeLayerRef.current) strokeLayerRef.current = document.createElement("canvas");
    const layer = strokeLayerRef.current;
    if (layer.width !== meta.width || layer.height !== meta.height) {
      layer.width = meta.width;
      layer.height = meta.height;
    }
    const ctx = layer.getContext("2d");
    ctx.clearRect(0, 0, layer.width, layer.height);
    strokesRef.current.forEach(stroke => drawStroke(ctx, stroke, layer.width, layer.height, meta.scale));
  }, []);

  // Composites image + cached brush layer (+ the live in-progress stroke) onto
  // the visible canvas. Cheap and constant-cost regardless of stroke count.
  const drawOriginalGeometry = useCallback((targetCanvas, meta) => {
    const image = imageRef.current;
    const geometry = getOutputGeometry(image, {
      ...adjustments,
      luminance: 0,
      contrast: 0,
      temperature: 0,
      tint: 0,
      vibrance: 0,
      saturation: 0,
      hue: 0,
      grain: 0,
      clarity: 0,
      dehaze: 0,
      blur: 0,
      invert: false
    });
    if (!image || !targetCanvas || !geometry) return;
    
    targetCanvas.width = meta.width;
    targetCanvas.height = meta.height;
    const ctx = targetCanvas.getContext("2d");
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.save();
    ctx.translate(meta.width / 2, meta.height / 2);
    ctx.rotate((adjustments.rotation * Math.PI) / 180);
    ctx.scale(adjustments.flipH ? -1 : 1, adjustments.flipV ? -1 : 1);
    
    const dw = geometry.sw * meta.scale;
    const dh = geometry.sh * meta.scale;
    ctx.drawImage(image, geometry.sx, geometry.sy, geometry.sw, geometry.sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }, [adjustments, getOutputGeometry]);

  // Composites image + cached brush layer (+ the live in-progress stroke) onto
  // the visible canvas. Cheap and constant-cost regardless of stroke count.
  const compositePreview = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseCanvasRef.current;
    const meta = previewMetaRef.current;
    if (!canvas || !base || !meta) return;
    if (canvas.width !== base.width || canvas.height !== base.height) {
      canvas.width = base.width;
      canvas.height = base.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Strokes are hidden while cropping (the preview is the full source image,
    // so their normalised coordinates wouldn't line up).
    if (croppingRef.current) {
      ctx.drawImage(base, 0, 0);
      return;
    }

    if (!overlayLayerRef.current) overlayLayerRef.current = document.createElement("canvas");
    const tmp = overlayLayerRef.current;
    if (tmp.width !== base.width || tmp.height !== base.height) {
      tmp.width = base.width;
      tmp.height = base.height;
    }
    const tctx = tmp.getContext("2d");
    tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(base, 0, 0);

    const active = activeStrokeRef.current;
    const layer = strokeLayerRef.current;
    if (active) {
      // Combine committed brush layer + the live stroke on a temp layer first,
      // so an eraser stroke removes only brush pixels (never the image).
      if (layer) tctx.drawImage(layer, 0, 0);
      drawStroke(tctx, active, tmp.width, tmp.height, meta.scale);
    } else if (layer) {
      tctx.drawImage(layer, 0, 0);
    }

    if (editorCompareMode) {
      if (!origCanvasRef.current) origCanvasRef.current = document.createElement("canvas");
      const origCanvas = origCanvasRef.current;
      drawOriginalGeometry(origCanvas, meta);

      const splitX = (editorComparePosition / 100) * canvas.width;
      // Match output compare: adjusted image on the left, original on the right.
      ctx.drawImage(tmp, 0, 0, splitX, canvas.height, 0, 0, splitX, canvas.height);
      ctx.drawImage(origCanvas, splitX, 0, canvas.width - splitX, canvas.height, splitX, 0, canvas.width - splitX, canvas.height);
    } else {
      ctx.drawImage(tmp, 0, 0);
    }
  }, [editorCompareMode, editorComparePosition, drawOriginalGeometry]);

  const renderPreview = useCallback(() => {
    if (!baseCanvasRef.current) baseCanvasRef.current = document.createElement("canvas");
    const meta = applyAdjustments(baseCanvasRef.current, { ignoreCrop: croppingRef.current });
    if (!meta) return;
    previewMetaRef.current = meta;
    syncStrokeLayer();
    compositePreview();

    // Draw live histogram
    if (histogramCanvasRef.current) {
      const histData = computeHistogram(baseCanvasRef.current);
      drawHistogram(histogramCanvasRef.current, histData);
    }
  }, [applyAdjustments, syncStrokeLayer, compositePreview]);

  // Heavy path: rebuild the adjusted base (throttled to one per animation frame)
  // whenever an adjustment changes.
  useEffect(() => {
    if (!isReady) return undefined;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isReady, renderPreview]);

  // When the committed stroke set changes (commit / undo / redo / reset), rebuild
  // the brush layer and recomposite. Not triggered during dragging.
  useEffect(() => {
    if (!isReady) return;
    syncStrokeLayer();
    compositePreview();
  }, [isReady, strokes, syncStrokeLayer, compositePreview]);

  // Entering/leaving the crop tool switches between the full-image crop preview
  // and the normal cropped preview.
  useEffect(() => {
    croppingRef.current = activeTool === "crop";
    if (isReady) renderPreview();
  }, [activeTool, isReady, renderPreview]);

  function updateAdjustment(key, value, shouldCommit = false) {
    setAdjustments(current => {
      const next = { ...current, [key]: value };
      if (shouldCommit) commitHistory(next, brush, strokes);
      return next;
    });
  }

  function applyPreset(preset) {
    setAdjustments(current => {
      const next = {
        ...current,
        ...preset.adjustments
      };
      commitHistory(next, brush, strokes);
      return next;
    });
  }

  function updateHsl(channel, key, value) {
    setAdjustments(current => {
      const next = {
        ...current,
        hsl: {
          ...current.hsl,
          [channel]: {
            ...current.hsl[channel],
            [key]: value
          }
        }
      };
      return next;
    });
  }

  function commitCurrent() {
    commitHistory(adjustments, brush, strokes);
  }

  function getHistogramZone(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    if (x < 0.2) return { zone: "blacks", x };
    if (x < 0.4) return { zone: "shadows", x };
    if (x < 0.6) return { zone: "luminance", x };
    if (x < 0.8) return { zone: "highlights", x };
    return { zone: "whites", x };
  }

  function handleHistogramPointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    
    const { zone } = getHistogramZone(event);
    const startValue = adjustmentsRef.current[zone] || 0;
    
    histogramDragRef.current = {
      zone,
      startX: event.clientX,
      startValue
    };
  }

  function handleHistogramPointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const { zone } = getHistogramZone(event);
    
    if (histogramDragRef.current) {
      const drag = 	histogramDragRef.current;
      const deltaX = event.clientX - drag.startX;
      const deltaValue = Math.round((deltaX / rect.width) * 150);
      const nextValue = clamp(drag.startValue + deltaValue, -100, 100);
      
      updateAdjustment(drag.zone, nextValue);
    } else {
      setHoveredZone(zone);
    }
  }

  function handleHistogramPointerUp(event) {
    if (histogramDragRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      histogramDragRef.current = null;
      commitCurrent();
    }
  }

  function handleHistogramPointerLeave(event) {
    if (!histogramDragRef.current) {
      setHoveredZone(null);
    }
  }

  function toggleSection(id) {
    setOpenSections(current => ({ ...current, [id]: !current[id] }));
  }

  function applyCropRatio(id) {
    setCropRatio(id);
    const option = CROP_RATIOS.find(item => item.id === id);
    if (!option || option.value == null) return; // "free" keeps the current box
    const aspect = (imageRef.current?.naturalWidth || 1) / (imageRef.current?.naturalHeight || 1);
    const arF = option.value / aspect;
    let w = 1;
    let h = w / arF;
    if (h > 1) { h = 1; w = h * arF; }
    const cx = (clampCrop(adjustments.cropLeft) / 100 + (1 - clampCrop(adjustments.cropRight) / 100)) / 2;
    const cy = (clampCrop(adjustments.cropTop) / 100 + (1 - clampCrop(adjustments.cropBottom) / 100)) / 2;
    const x0 = clamp(cx - w / 2, 0, 1 - w);
    const y0 = clamp(cy - h / 2, 0, 1 - h);
    setAdjustments(current => {
      const next = {
        ...current,
        cropLeft: Math.round(x0 * 100),
        cropTop: Math.round(y0 * 100),
        cropRight: Math.round((1 - (x0 + w)) * 100),
        cropBottom: Math.round((1 - (y0 + h)) * 100)
      };
      commitHistory(next, brush, strokes);
      return next;
    });
  }

  function resetCrop() {
    setCropRatio("free");
    setAdjustments(current => {
      const next = { ...current, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 };
      commitHistory(next, brush, strokes);
      return next;
    });
  }

  function openSection(id) {
    setOpenSections(current => ({ ...current, [id]: true }));
  }

  function handleUndo() {
    if (!canUndo) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    restore(history[nextIndex]);
  }

  function handleRedo() {
    if (!canRedo) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    restore(history[nextIndex]);
  }

  function updateZoom(delta) {
    setZoom(value => clamp(Number((value + delta).toFixed(2)), 0.2, 4));
  }

  function toggleEditorCompare() {
    setEditorCompareMode(current => {
      const next = !current;
      if (next) setActiveTool("hand");
      return next;
    });
  }

  useEffect(() => {
    const isEditableTarget = target => {
      if (!target) return false;
      const tagName = target.tagName?.toLowerCase();
      return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
    };

    const activateTool = tool => {
      setActiveTool(tool);
      if (tool === "crop") openSection("crop");
      if (tool === "brush" || tool === "eraser") openSection("brush");
    };

    const handleKeyDown = event => {
      const editable = isEditableTarget(event.target);
      const key = event.key.toLowerCase();
      const hasUndoModifier = event.metaKey || event.ctrlKey;

      if (event.key === "Alt" && !editable && !event.repeat) {
        altToolRef.current = activeTool;
        setActiveTool("colorpicker");
        event.preventDefault();
        return;
      }

      if (hasUndoModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (hasUndoModifier && !event.altKey && (event.key === "+" || event.key === "=" || event.code === "NumpadAdd")) {
        event.preventDefault();
        updateZoom(0.1);
        return;
      }

      if (hasUndoModifier && !event.altKey && (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract")) {
        event.preventDefault();
        updateZoom(-0.1);
        return;
      }

      if (editable || hasUndoModifier || event.altKey || event.shiftKey) return;

      if (event.key === "Enter" && activeTool === "crop") {
        event.preventDefault();
        commitCurrent();
        activateTool("hand");
      } else if (event.key === "[") {
        event.preventDefault();
        const step = event.repeat ? 4 : 1;
        setBrush(current => ({ ...current, size: clamp(current.size - step, 1, 180) }));
      } else if (event.key === "]") {
        event.preventDefault();
        const step = event.repeat ? 4 : 1;
        setBrush(current => ({ ...current, size: clamp(current.size + step, 1, 180) }));
      } else if (event.repeat) {
        return;
      } else if (key === "c") {
        event.preventDefault();
        activateTool("crop");
      } else if (key === "s") {
        event.preventDefault();
        toggleEditorCompare();
      } else if (key === "r") {
        event.preventDefault();
        updateAdjustment("rotation", (adjustmentsRef.current.rotation + 90) % 360, true);
      } else if (key === "h") {
        event.preventDefault();
        activateTool("hand");
      } else if (key === "b") {
        event.preventDefault();
        activateTool("brush");
      } else if (key === "e") {
        event.preventDefault();
        activateTool("eraser");
      } else if (key === "i") {
        event.preventDefault();
        activateTool("colorpicker");
      }
    };

    const handleKeyUp = event => {
      if (event.key !== "Alt" || altToolRef.current == null) return;
      setActiveTool(altToolRef.current);
      altToolRef.current = null;
      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeTool, canRedo, canUndo, history, historyIndex, restore]);

  function handleReset() {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setBrush(DEFAULT_BRUSH);
    setStrokes([]);
    const initial = snapshot(DEFAULT_ADJUSTMENTS, DEFAULT_BRUSH, []);
    setHistory([initial]);
    setHistoryIndex(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // Returns normalised [0..1] coordinates so strokes are independent of the
  // current canvas pixel resolution.
  function getCanvasPoint(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function updateEditorComparePosition(event) {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = canvas.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (!rect.width) return;
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    const clamped = clamp(Number(next.toFixed(2)), 0, 100);
    setEditorComparePosition(clamped);
    setEditorCompareDividerX(clamp(event.clientX - stageRect.left, rect.left - stageRect.left, rect.right - stageRect.left));
  }

  useEffect(() => {
    if (!editorCompareMode || !isReady) return undefined;
    const syncDivider = () => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return;
      const canvasRect = canvas.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      setEditorCompareDividerX(canvasRect.left - stageRect.left + canvasRect.width * (editorComparePosition / 100));
    };
    const frame = requestAnimationFrame(syncDivider);
    window.addEventListener("resize", syncDivider);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncDivider);
    };
  }, [editorCompareMode, editorComparePosition, isReady, pan, zoom]);

  function handlePointerDown(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    if (activeTool === "colorpicker") {
      const ctx = canvas.getContext("2d");
      const px = clamp(Math.round(point.x * canvas.width), 0, canvas.width - 1);
      const py = clamp(Math.round(point.y * canvas.height), 0, canvas.height - 1);
      const pixel = ctx.getImageData(px, py, 1, 1).data;
      setBrush(current => ({ ...current, color: rgbToHex(pixel[0], pixel[1], pixel[2]) }));
      setActiveTool("brush");
      return;
    }
    if (activeTool === "brush" || activeTool === "eraser") {
      event.currentTarget.setPointerCapture(event.pointerId);
      // The in-progress stroke lives outside React state and is drawn live, so
      // dragging never churns state (avoids re-render storms and array races).
      activeStrokeRef.current = {
        tool: activeTool,
        color: brush.color,
        size: brush.size,
        opacity: brush.opacity,
        points: [point]
      };
      compositePreview();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (editorCompareMode && activeTool === "hand") updateEditorComparePosition(event);
    panStartRef.current = { pointer: { x: event.clientX, y: event.clientY }, pan };
    setIsPanning(true);
  }

  function handlePointerMove(event) {
    if (editorCompareMode && activeTool === "hand") updateEditorComparePosition(event);
    if (activeTool === "brush" || activeTool === "eraser") {
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (stage && canvas) {
        const stageRect = stage.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        if (canvas.width > 0) canvasScaleRef.current = canvasRect.width / canvas.width;
        setBrushCursor({ x: event.clientX - stageRect.left, y: event.clientY - stageRect.top });
      }
    }
    if (activeStrokeRef.current && (activeTool === "brush" || activeTool === "eraser")) {
      const point = getCanvasPoint(event);
      if (!point) return;
      activeStrokeRef.current.points.push(point);
      compositePreview();
      return;
    }
    if (panStartRef.current) {
      setPan({
        x: panStartRef.current.pan.x + event.clientX - panStartRef.current.pointer.x,
        y: panStartRef.current.pan.y + event.clientY - panStartRef.current.pointer.y
      });
    }
  }

  function endPointerInteraction(event) {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    if (activeStrokeRef.current) {
      const finished = activeStrokeRef.current;
      activeStrokeRef.current = null;
      // Bake into the brush layer immediately so there is no one-frame flicker
      // before the strokes effect re-syncs.
      const layer = strokeLayerRef.current;
      const meta = previewMetaRef.current;
      if (layer && meta) drawStroke(layer.getContext("2d"), finished, layer.width, layer.height, meta.scale);
      const nextStrokes = strokesRef.current.concat(finished);
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      compositePreview();
      commitHistory(adjustmentsRef.current, brushRef.current, nextStrokes);
    }
    panStartRef.current = null;
    setIsPanning(false);
  }

  function renderEditedDataUrl() {
    const canvas = document.createElement("canvas");
    const meta = applyAdjustments(canvas, { fullResolution: true });
    if (!meta) throw new Error("Không render được ảnh");
    const ctx = canvas.getContext("2d");
    // Render strokes on their own layer so eraser strokes don't cut the image.
    if (strokesRef.current.length) {
      const strokeCanvas = document.createElement("canvas");
      strokeCanvas.width = meta.width;
      strokeCanvas.height = meta.height;
      const sctx = strokeCanvas.getContext("2d");
      strokesRef.current.forEach(stroke => drawStroke(sctx, stroke, meta.width, meta.height, meta.scale));
      ctx.drawImage(strokeCanvas, 0, 0);
    }
    const mimeType = exportFormat || "image/png";
    const quality = mimeType === "image/png" ? undefined : (exportQuality || 90) / 100;
    return {
      dataUrl: canvas.toDataURL(mimeType, quality),
      extension: mimeType.includes("jpeg") ? "jpg" : mimeType.split("/")[1] || "png"
    };
  }

  async function handleDownloadEdited() {
    setDownloading(true);
    setError("");
    try {
      const { dataUrl, extension } = renderEditedDataUrl();
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `image-editor-${Date.now()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(err.message || "Không tải được ảnh");
    } finally {
      setDownloading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const { dataUrl } = renderEditedDataUrl();
      await onSave(dataUrl);
      onClose();
    } catch (err) {
      setError(err.message || "Không lưu được ảnh");
    } finally {
      setSaving(false);
    }
  }

  const previewCursor = useMemo(() => {
    if (activeTool === "brush" || activeTool === "eraser") return "none";
    if (activeTool === "colorpicker") return "copy";
    return panStartRef.current ? "grabbing" : "grab";
  }, [activeTool]);

  const brushDiameter = brush.size * (previewMetaRef.current?.scale ?? 1) * canvasScaleRef.current;

  const hsl = adjustments.hsl[activeColorTab];
  const cropRatioValue = CROP_RATIOS.find(option => option.id === cropRatio)?.value ?? null;
  const imageAspect = (imageRef.current?.naturalWidth || 1) / (imageRef.current?.naturalHeight || 1);

  return (
    <div className="imageEditorBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="imageEditorModal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <nav className="imageEditorRail" aria-label="Image editor tools">
          <button type="button" className={activeTool === "crop" ? "active" : ""} onClick={() => { setActiveTool("crop"); openSection("crop"); }} title="Crop">
            <Crop size={15} />
          </button>
          <button type="button" onClick={() => updateAdjustment("rotation", (adjustments.rotation + 90) % 360, true)} title="Xoay 90 độ">
            <RotateCw size={15} />
          </button>
          <button type="button" className={adjustments.invert ? "active" : ""} onClick={() => updateAdjustment("invert", !adjustments.invert, true)} title="Đảo màu">
            <X size={15} />
          </button>
          <span className="imageEditorRailDivider" />
          <button type="button" className={activeTool === "hand" ? "active" : ""} onClick={() => setActiveTool("hand")} title="Di chuyển">
            <Hand size={15} />
          </button>
          <button type="button" className={adjustments.flipH ? "active" : ""} onClick={() => updateAdjustment("flipH", !adjustments.flipH, true)} title="Lật ngang">
            <FlipHorizontal size={15} />
          </button>
          <button type="button" className={adjustments.flipV ? "active" : ""} onClick={() => updateAdjustment("flipV", !adjustments.flipV, true)} title="Lật dọc">
            <FlipVertical size={15} />
          </button>
          <span className="imageEditorRailDivider" />
          <button type="button" className={activeTool === "brush" ? "active" : ""} onClick={() => { setActiveTool("brush"); openSection("brush"); }} title="Cọ vẽ">
            <Brush size={15} />
          </button>
          <button type="button" className={activeTool === "eraser" ? "active" : ""} onClick={() => { setActiveTool("eraser"); openSection("brush"); }} title="Tẩy">
            <Eraser size={15} />
          </button>
          <button type="button" className={activeTool === "colorpicker" ? "active" : ""} onClick={() => setActiveTool("colorpicker")} title="Chấm màu">
            <Pipette size={15} />
          </button>
          <label className="imageEditorColorSwatch" title="Màu cọ">
            <input type="color" value={brush.color} onChange={event => setBrush(current => ({ ...current, color: event.target.value }))} onBlur={commitCurrent} />
            <span style={{ backgroundColor: brush.color }} />
          </label>
        </nav>

        <main className="imageEditorStage">
          <div
            className="imageEditorPreview"
            ref={stageRef}
            onMouseLeave={() => setBrushCursor(null)}
          >
            {!isReady ? <span className="editorLoading">Đang tải ảnh...</span> : null}
            {brushCursor && (activeTool === "brush" || activeTool === "eraser") ? (
              <div
                className={`brushCursorCircle ${activeTool === "eraser" ? "eraserMode" : "brushMode"}`}
                style={{
                  left: brushCursor.x,
                  top: brushCursor.y,
                  width: Math.max(4, brushDiameter),
                  height: Math.max(4, brushDiameter),
                  borderColor: activeTool === "brush" ? brush.color : undefined
                }}
              />
            ) : null}
            <div
              className={`imageEditorCanvasWrap ${isPanning ? "isPanning" : ""}`}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <canvas
                ref={canvasRef}
                style={{ cursor: previewCursor }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endPointerInteraction}
                onPointerCancel={endPointerInteraction}
              />
              {activeTool === "crop" && isReady ? (
                <CropOverlay
                  crop={adjustments}
                  ratio={cropRatioValue}
                  aspect={imageAspect}
                  onChange={values => setAdjustments(current => ({ ...current, ...values }))}
                  onCommit={commitCurrent}
                />
              ) : null}
            </div>
            {editorCompareMode && isReady && !croppingRef.current ? (
              <div
                className="compareDivider imageEditorCompareDivider"
                style={{ left: `${editorCompareDividerX}px` }}
              />
            ) : null}
            <div className="imageEditorFloatingBar">
              <button type="button" onClick={handleUndo} disabled={!canUndo} title="Hoàn tác">
                <Undo2 size={13} />
              </button>
              <button type="button" onClick={handleRedo} disabled={!canRedo} title="Làm lại">
                <Redo2 size={13} />
              </button>
              <span className="floatingDivider" />
              <button
                type="button"
                className={editorCompareMode ? "active" : ""}
                onClick={toggleEditorCompare}
                title={editorCompareMode ? "Tắt so sánh Trước/Sau (S)" : "Bật so sánh Trước/Sau (S)"}
              >
                <GitCompare size={13} />
              </button>
              <span className="floatingDivider" />
              <button type="button" onClick={() => updateZoom(-0.1)} title="Thu nhỏ">
                <ZoomOut size={13} />
              </button>
              <button type="button" className="zoomReadout" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Về 100%">
                <span>{Math.round(zoom * 100)}%</span>
              </button>
              <button type="button" onClick={() => updateZoom(0.1)} title="Phóng to">
                <ZoomIn size={13} />
              </button>
              <span className="floatingDivider" />
              <button type="button" onClick={() => setActiveTool("hand")} title="Di chuyển">
                <Hand size={13} />
              </button>
            </div>
          </div>
        </main>

        <aside className="imageEditorControls">
          <div className="imageEditorPanelHeader">
            <h2>Image Editor</h2>
            <button type="button" onClick={handleReset}>Reset All</button>
          </div>

          <div
            className="editorHistogramWrap"
            onPointerDown={handleHistogramPointerDown}
            onPointerMove={handleHistogramPointerMove}
            onPointerUp={handleHistogramPointerUp}
            onPointerLeave={handleHistogramPointerLeave}
          >
            <canvas ref={histogramCanvasRef} width="240" height="60" className="editorHistogramCanvas" />
            <div className="histogramHoverOverlay">
              <div className={`zoneHover blacks ${hoveredZone === "blacks" ? "active" : ""}`} />
              <div className={`zoneHover shadows ${hoveredZone === "shadows" ? "active" : ""}`} />
              <div className={`zoneHover exposure ${hoveredZone === "luminance" ? "active" : ""}`} />
              <div className={`zoneHover highlights ${hoveredZone === "highlights" ? "active" : ""}`} />
              <div className={`zoneHover whites ${hoveredZone === "whites" ? "active" : ""}`} />
            </div>
            {hoveredZone && (
              <div className="histogramZoneIndicator">
                <span className="zoneName">
                  {hoveredZone === "blacks" && "Blacks"}
                  {hoveredZone === "shadows" && "Shadows"}
                  {hoveredZone === "luminance" && "Exposure"}
                  {hoveredZone === "highlights" && "Highlights"}
                  {hoveredZone === "whites" && "Whites"}
                </span>
                <span className="zoneValue">
                  {adjustments[hoveredZone] > 0 ? `+${adjustments[hoveredZone]}` : adjustments[hoveredZone]}
                </span>
              </div>
            )}
          </div>

          <div className="accordionListWithSlider">
            <div className="imageEditorAccordionList">
              <AccordionSection icon={Sparkles} title="Presets" open={!!openSections.presets} onToggle={() => toggleSection("presets")}>
                <div className="presetGrid">
                  {PRESETS.map(preset => (
                    <button
                      type="button"
                      key={preset.id}
                      className={`presetButton ${adjustments.luminance === preset.adjustments.luminance && adjustments.contrast === preset.adjustments.contrast && adjustments.temperature === preset.adjustments.temperature && adjustments.vibrance === preset.adjustments.vibrance ? "active" : ""}`}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </AccordionSection>

              {(activeTool === "brush" || activeTool === "eraser") ? (
                <AccordionSection icon={Brush} title="Brush / Eraser" open={!!openSections.brush} onToggle={() => toggleSection("brush")}>
                  <label className="editorColorRow">
                    <span>Color</span>
                    <input type="color" value={brush.color} onChange={event => setBrush(current => ({ ...current, color: event.target.value }))} onBlur={commitCurrent} />
                    <b>{brush.color}</b>
                  </label>
                  <EditorRange label="Size" value={brush.size} min={1} max={180} resetValue={DEFAULT_BRUSH.size} onChange={value => setBrush(current => ({ ...current, size: value }))} onCommit={commitCurrent} />
                  <EditorRange label="Opacity" value={brush.opacity} min={1} max={100} resetValue={DEFAULT_BRUSH.opacity} onChange={value => setBrush(current => ({ ...current, opacity: value }))} onCommit={commitCurrent} />
                  <EditorRange label="Hardness" value={brush.hardness ?? 100} min={10} max={100} resetValue={100} onChange={value => setBrush(current => ({ ...current, hardness: value }))} onCommit={commitCurrent} />
                </AccordionSection>
              ) : null}

              {activeTool === "crop" ? (
                <AccordionSection icon={Crop} title="Crop" open={!!openSections.crop} onToggle={() => toggleSection("crop")}>
                  <p className="cropHint">Kéo khung trên ảnh để cắt. Chọn tỉ lệ để khoá khung cắt.</p>
                  <div className="cropRatioGrid">
                    {CROP_RATIOS.map(option => (
                      <button
                        type="button"
                        key={option.id}
                        className={cropRatio === option.id ? "active" : ""}
                        onClick={() => applyCropRatio(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="cropResetButton" onClick={resetCrop}>
                    <RotateCcw size={13} /> Đặt lại khung cắt
                  </button>
                </AccordionSection>
              ) : null}

              <AccordionSection icon={SlidersHorizontal} title="Basic" open={!!openSections.basic} onToggle={() => toggleSection("basic")}>
                <EditorRange label="Temperature" value={adjustments.temperature} min={-100} max={100} onChange={value => updateAdjustment("temperature", value)} onCommit={commitCurrent} />
                <EditorRange label="Tint" value={adjustments.tint} min={-100} max={100} onChange={value => updateAdjustment("tint", value)} onCommit={commitCurrent} />
                <EditorRange label="Exposure" value={adjustments.luminance} min={-100} max={100} onChange={value => updateAdjustment("luminance", value)} onCommit={commitCurrent} />
                <EditorRange label="Contrast" value={adjustments.contrast} min={-100} max={100} onChange={value => updateAdjustment("contrast", value)} onCommit={commitCurrent} />
                <EditorRange label="Highlights" value={adjustments.highlights} min={-100} max={100} onChange={value => updateAdjustment("highlights", value)} onCommit={commitCurrent} />
                <EditorRange label="Shadows" value={adjustments.shadows} min={-100} max={100} onChange={value => updateAdjustment("shadows", value)} onCommit={commitCurrent} />
                <EditorRange label="Whites" value={adjustments.whites} min={-100} max={100} onChange={value => updateAdjustment("whites", value)} onCommit={commitCurrent} />
                <EditorRange label="Blacks" value={adjustments.blacks} min={-100} max={100} onChange={value => updateAdjustment("blacks", value)} onCommit={commitCurrent} />
                <EditorRange label="Vibrance" value={adjustments.vibrance} min={-100} max={100} onChange={value => updateAdjustment("vibrance", value)} onCommit={commitCurrent} />
                <EditorRange label="Saturation" value={adjustments.saturation} min={-100} max={100} onChange={value => updateAdjustment("saturation", value)} onCommit={commitCurrent} />
                <EditorRange label="Hue" value={adjustments.hue} min={-180} max={180} onChange={value => updateAdjustment("hue", value)} onCommit={commitCurrent} />
              </AccordionSection>

              <AccordionSection icon={Droplet} title="Color HSL" open={!!openSections.hsl} onToggle={() => toggleSection("hsl")}>
                <div className="hslSwatches">
                  {COLOR_CHANNELS.map(channel => (
                    <button
                      type="button"
                      key={channel.id}
                      className={activeColorTab === channel.id ? "active" : ""}
                      style={{ backgroundColor: channel.color }}
                      onClick={() => setActiveColorTab(channel.id)}
                      title={channel.name}
                    />
                  ))}
                </div>
                <EditorRange label="Hue" value={hsl.h} min={-180} max={180} onChange={value => updateHsl(activeColorTab, "h", value)} onCommit={commitCurrent} />
                <EditorRange label="Saturation" value={hsl.s} min={-100} max={100} onChange={value => updateHsl(activeColorTab, "s", value)} onCommit={commitCurrent} />
                <EditorRange label="Luminance" value={hsl.l} min={-100} max={100} onChange={value => updateHsl(activeColorTab, "l", value)} onCommit={commitCurrent} />
              </AccordionSection>

              <AccordionSection icon={Sparkles} title="Effects" open={!!openSections.effects} onToggle={() => toggleSection("effects")}>
                <EditorRange label="Grain" value={adjustments.grain} min={0} max={100} onChange={value => updateAdjustment("grain", value)} onCommit={commitCurrent} />
                <EditorRange label="Clarity" value={adjustments.clarity} min={-100} max={100} onChange={value => updateAdjustment("clarity", value)} onCommit={commitCurrent} />
                <EditorRange label="Dehaze" value={adjustments.dehaze} min={-100} max={100} onChange={value => updateAdjustment("dehaze", value)} onCommit={commitCurrent} />
                <EditorRange label="Blur" value={adjustments.blur} min={0} max={20} step={0.5} onChange={value => updateAdjustment("blur", value)} onCommit={commitCurrent} />
              </AccordionSection>

              <AccordionSection icon={Save} title="Export" open={!!openSections.export} onToggle={() => toggleSection("export")}>
                <label className="field">
                  <span>Format</span>
                  <select value={exportFormat} onChange={event => setExportFormat(event.target.value)}>
                    <option value="image/png">PNG (Lossless)</option>
                    <option value="image/jpeg">JPEG (Compressed)</option>
                    <option value="image/webp">WebP (Optimized)</option>
                  </select>
                </label>
                {exportFormat !== "image/png" && (
                  <EditorRange
                    label="Quality"
                    value={exportQuality}
                    min={10}
                    max={100}
                    step={5}
                    resetValue={90}
                    onChange={setExportQuality}
                    onCommit={commitCurrent}
                  />
                )}
              </AccordionSection>
            </div>
          </div>

          {error ? <div className="editorError">{error}</div> : null}
          <div className="imageEditorFooter">
            <button type="button" className="smallActionButton secondary" onClick={onClose}>
              <span>Cancel</span>
            </button>
            <button type="button" className="smallActionButton secondary" onClick={handleDownloadEdited} disabled={downloading || !isReady}>
              <Download size={14} />
              <span>{downloading ? "Downloading..." : "Download"}</span>
            </button>
            <button type="button" className="saveTemplateButton" onClick={handleSave} disabled={saving || !isReady}>
              <Save size={15} />
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
}

// Interactive crop box drawn over the full-image preview. Stores its geometry
// back as left/top/right/bottom insets (percent of the source image).
function CropOverlay({ crop, ratio, aspect, onChange, onCommit }) {
  const boxRef = useRef(null);
  const dragRef = useRef(null);
  const MIN = 0.06;

  const left = clampCrop(crop.cropLeft);
  const top = clampCrop(crop.cropTop);
  const right = clampCrop(crop.cropRight);
  const bottom = clampCrop(crop.cropBottom);

  function emit(x0, y0, x1, y1) {
    onChange({
      cropLeft: Math.round(x0 * 100),
      cropTop: Math.round(y0 * 100),
      cropRight: Math.round((1 - x1) * 100),
      cropBottom: Math.round((1 - y1) * 100)
    });
  }

  function onMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / drag.rect.width;
    const dy = (event.clientY - drag.startY) / drag.rect.height;
    let { x0, y0, x1, y1 } = drag;
    // width / height ratio expressed in normalised-fraction space
    const arF = ratio ? ratio / aspect : null;

    if (drag.handle === "move") {
      const w = x1 - x0;
      const h = y1 - y0;
      const nx0 = clamp(x0 + dx, 0, 1 - w);
      const ny0 = clamp(y0 + dy, 0, 1 - h);
      emit(nx0, ny0, nx0 + w, ny0 + h);
      return;
    }

    const east = drag.handle.includes("e");
    const west = drag.handle.includes("w");
    const south = drag.handle.includes("s");
    const north = drag.handle.includes("n");
    if (east) x1 = clamp(x1 + dx, x0 + MIN, 1);
    if (west) x0 = clamp(x0 + dx, 0, x1 - MIN);
    if (south) y1 = clamp(y1 + dy, y0 + MIN, 1);
    if (north) y0 = clamp(y0 + dy, 0, y1 - MIN);

    if (arF) {
      // Derive height from the (just-resized) width, anchored to the fixed edge.
      let w = x1 - x0;
      let h = w / arF;
      if (north) {
        y0 = clamp(y1 - h, 0, y1 - MIN);
      } else {
        y1 = clamp(y0 + h, y0 + MIN, 1);
      }
      h = y1 - y0;
      w = h * arF;
      if (west) {
        x0 = clamp(x1 - w, 0, x1 - MIN);
      } else if (east) {
        x1 = clamp(x0 + w, x0 + MIN, 1);
      } else {
        const cx = (x0 + x1) / 2;
        x0 = clamp(cx - w / 2, 0, 1);
        x1 = clamp(cx + w / 2, 0, 1);
      }
    }
    emit(x0, y0, x1, y1);
  }

  function endDrag() {
    dragRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    onCommit?.();
  }

  function startDrag(handle, event) {
    event.preventDefault();
    event.stopPropagation();
    const container = boxRef.current?.parentElement;
    if (!container) return;
    dragRef.current = {
      handle,
      rect: container.getBoundingClientRect(),
      startX: event.clientX,
      startY: event.clientY,
      x0: left / 100,
      y0: top / 100,
      x1: 1 - right / 100,
      y1: 1 - bottom / 100
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
  }

  const handles = ratio ? ["nw", "ne", "se", "sw"] : ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  return (
    <div className="cropOverlay">
      <div
        ref={boxRef}
        className="cropBox"
        style={{ left: `${left}%`, top: `${top}%`, right: `${right}%`, bottom: `${bottom}%` }}
        onPointerDown={event => startDrag("move", event)}
      >
        <span className="cropThird cropThirdV" style={{ left: "33.33%" }} />
        <span className="cropThird cropThirdV" style={{ left: "66.66%" }} />
        <span className="cropThird cropThirdH" style={{ top: "33.33%" }} />
        <span className="cropThird cropThirdH" style={{ top: "66.66%" }} />
        {handles.map(handle => (
          <span
            key={handle}
            className={`cropHandle cropHandle-${handle}`}
            onPointerDown={event => startDrag(handle, event)}
          />
        ))}
      </div>
    </div>
  );
}

function AccordionSection({ icon: Icon, title, open, onToggle, children }) {
  return (
    <div className={`imageEditorAccordion ${open ? "isOpen" : ""}`}>
      <button type="button" className="imageEditorAccordionHeader" onClick={onToggle} aria-expanded={open}>
        <span className="imageEditorAccordionTitle"><Icon size={14} /> {title}</span>
        <ChevronDown size={15} className="imageEditorAccordionChevron" />
      </button>
      {open ? <div className="imageEditorAccordionBody">{children}</div> : null}
    </div>
  );
}

function EditorRange({ label, value, min, max, step = 1, resetValue = 0, onChange, onCommit }) {
  const isDefault = Number(value) === Number(resetValue);
  return (
    <label className="editorRange">
      <span>{label}</span>
      <b>{value}</b>
      <button
        type="button"
        className="editorRangeReset"
        title="Đặt lại"
        disabled={isDefault}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          onChange(resetValue);
          onCommit?.();
        }}
      >
        <RotateCcw size={12} />
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        onBlur={onCommit}
      />
    </label>
  );
}
