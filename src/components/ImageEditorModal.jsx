import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  ChevronDown,
  Circle,
  Crop,
  Download,
  Droplet,
  Eraser,
  FlipHorizontal,
  FlipVertical,
  GitCompare,
  Hand,
  PenTool,
  Pipette,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Square,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { isTextEntryTarget, preventToolbarFocus } from "../lib/keyboard";
import {
  adjustmentsMatchPreset,
  applyImageAdjustments,
  clamp,
  clampCrop,
  COLOR_CHANNELS,
  computeHistogram,
  DEFAULT_CURVES,
  DEFAULT_HSL,
  drawCurvesCanvas,
  drawHistogram,
  getCurvePoint,
  getOutputGeometry,
  getCurveSampleFromPixel,
  getDominantHslChannelId,
  mergePresetAdjustments,
  findActivePresetId,
  PRESET_GROUPS,
  PRESETS,
  PREVIEW_MAX_EDGE,
  PREVIEW_INTERACTIVE_MAX_EDGE,
  sampleCanvasPixel,
  upsertCurvePoint
} from "../lib/imageAdjustments";
import { ColorPickButton, ColorPickCursorOverlay } from "./colorPickUi";

const CurveIcon = ({ size = 14, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M3 21h18" />
    <path d="M3 21c4-4 8-16 18-16" />
    <circle cx="3" cy="21" r="1.5" fill="currentColor" />
    <circle cx="21" cy="5" r="1.5" fill="currentColor" />
  </svg>
);

const HealingIcon = ({ size = 14, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect
      x="7"
      y="2"
      width="10"
      height="20"
      rx="5"
      transform="rotate(-45 12 12)"
    />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
  </svg>
);

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

const DEFAULT_BRUSH = {
  size: 28,
  opacity: 70,
  color: "#ffffff",
  hardness: 100
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
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

function drawStroke(ctx, stroke, width, height, scale) {
  // Handle fill-type strokes from pen/selection tools
  if (stroke.tool === "penFill" || stroke.tool === "rectSelectFill" || stroke.tool === "ellipseSelectFill") {
    const fillCanvas = document.createElement("canvas");
    fillCanvas.width = width;
    fillCanvas.height = height;
    const fctx = fillCanvas.getContext("2d");
    fctx.fillStyle = stroke.color;
    fctx.beginPath();
    if (stroke.tool === "penFill") {
      const anchors = stroke.anchors;
      if (!anchors || anchors.length < 3) return;
      fctx.moveTo(anchors[0].x * width, anchors[0].y * height);
      for (let i = 1; i < anchors.length; i++) {
        const prev = anchors[i - 1];
        const curr = anchors[i];
        const c1 = prev.out || prev;
        const c2 = curr.in || curr;
        fctx.bezierCurveTo(c1.x * width, c1.y * height, c2.x * width, c2.y * height, curr.x * width, curr.y * height);
      }
      const last = anchors[anchors.length - 1];
      const first = anchors[0];
      const lc1 = last.out || last;
      const lc2 = first.in || first;
      fctx.bezierCurveTo(lc1.x * width, lc1.y * height, lc2.x * width, lc2.y * height, first.x * width, first.y * height);
      fctx.closePath();
    } else if (stroke.tool === "rectSelectFill") {
      const { x, y, w: sw, h: sh } = stroke.selection;
      fctx.rect(x * width, y * height, sw * width, sh * height);
    } else if (stroke.tool === "ellipseSelectFill") {
      const { x, y, w: sw, h: sh } = stroke.selection;
      const cx = (x + sw / 2) * width;
      const cy = (y + sh / 2) * height;
      const rx = (sw / 2) * width;
      const ry = (sh / 2) * height;
      fctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    }
    fctx.fill();
    let sourceCanvas = fillCanvas;
    const feather = stroke.feather || 0;
    if (feather > 0) {
      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = width;
      blurCanvas.height = height;
      const bctx = blurCanvas.getContext("2d");
      bctx.filter = `blur(${feather}px)`;
      bctx.drawImage(fillCanvas, 0, 0);
      sourceCanvas = blurCanvas;
    }
    ctx.save();
    ctx.globalAlpha = (stroke.opacity ?? 100) / 100;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
    return;
  }

  const points = stroke.points;
  if (!points || !points.length) return;

  const size = Math.max(1, stroke.size * scale);
  const radius = size / 2;
  const hardness = clamp(stroke.hardness ?? 100, 0, 100);
  const isEraser = stroke.tool === "eraser";

  // Isolate the stroke on a temp canvas so globalAlpha is applied once at the end,
  // preventing per-stamp alpha accumulation from bleeding into the base image.
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tctx = tempCanvas.getContext("2d");
  if (!tctx) return;

  if (hardness >= 100) {
    // Solid hard brush
    tctx.lineCap = "round";
    tctx.lineJoin = "round";
    tctx.strokeStyle = isEraser ? "black" : stroke.color;
    tctx.lineWidth = size;
    tctx.beginPath();
    const first = points[0];
    tctx.moveTo(first.x * width, first.y * height);
    points.slice(1).forEach(p => tctx.lineTo(p.x * width, p.y * height));
    if (points.length === 1) tctx.lineTo(first.x * width + 0.01, first.y * height + 0.01);
    tctx.stroke();
  } else {
    // Soft brush: radial-gradient stamps along the path.
    // The softness (1 - hardness) both shrinks the solid core AND extends the
    // feathered falloff *beyond* the nominal brush radius, so low hardness bleeds
    // softly outside the brush-size circle. A multi-stop gaussian-like curve makes
    // the transition smoother than a plain linear ramp.
    const rgb = isEraser ? { r: 0, g: 0, b: 0 } : hexToRgb(stroke.color);
    const softness = 1 - hardness / 100;
    // Solid core: full at hardness 100, shrinks toward centre as hardness drops.
    const innerRadius = radius * (hardness / 100) * 0.85;
    // Outer falloff grows past `radius` (up to ~1.6x) the softer the brush is.
    const outerRadius = radius * (1 + softness * 0.6);
    const spacing = Math.max(0.5, outerRadius * 0.1);
    // Smooth (ease-out / gaussian-ish) alpha falloff between core and edge.
    const falloffStops = [
      [0.0, 1],
      [0.25, 0.88],
      [0.5, 0.6],
      [0.7, 0.32],
      [0.85, 0.13],
      [1.0, 0]
    ];

    // Interpolate evenly-spaced stamp positions along the polyline
    const stampPoints = [];
    if (points.length === 1) {
      stampPoints.push({ x: points[0].x * width, y: points[0].y * height });
    } else {
      let accumulated = 0;
      let nextStamp = 0;
      for (let i = 1; i < points.length; i++) {
        const x0 = points[i - 1].x * width;
        const y0 = points[i - 1].y * height;
        const x1 = points[i].x * width;
        const y1 = points[i].y * height;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (segLen === 0) continue;
        if (i === 1) stampPoints.push({ x: x0, y: y0 });
        while (nextStamp <= accumulated + segLen) {
          const t = (nextStamp - accumulated) / segLen;
          stampPoints.push({ x: x0 + dx * t, y: y0 + dy * t });
          nextStamp += spacing;
        }
        accumulated += segLen;
      }
      const last = points[points.length - 1];
      stampPoints.push({ x: last.x * width, y: last.y * height });
    }

    const coreFrac = outerRadius > 0 ? innerRadius / outerRadius : 0;
    stampPoints.forEach(pt => {
      const grad = tctx.createRadialGradient(pt.x, pt.y, innerRadius, pt.x, pt.y, outerRadius);
      falloffStops.forEach(([offset, alpha]) => {
        // Map the falloff curve onto the [core .. edge] span of the gradient.
        const pos = coreFrac + offset * (1 - coreFrac);
        grad.addColorStop(clamp(pos, 0, 1), `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`);
      });
      tctx.fillStyle = grad;
      tctx.beginPath();
      tctx.arc(pt.x, pt.y, outerRadius, 0, Math.PI * 2);
      tctx.fill();
    });
  }

  ctx.save();
  ctx.globalAlpha = stroke.opacity / 100;
  ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();
}

function applyHealingStroke(ctx, stroke, scale) {
  if (!stroke.points || !stroke.points.length) return;
  
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const strokeSize = Math.max(2, stroke.size * scale);
  
  // Calculate bounding box of the stroke in canvas pixels
  let minX = width, maxX = 0, minY = height, maxY = 0;
  stroke.points.forEach(p => {
    const x = p.x * width;
    const y = p.y * height;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  
  // Expand bounding box by the stroke size to capture surroundings
  const pad = Math.ceil(strokeSize * 1.5);
  minX = Math.max(0, Math.floor(minX - pad));
  maxX = Math.min(width - 1, Math.ceil(maxX + pad));
  minY = Math.max(0, Math.floor(minY - pad));
  maxY = Math.min(height - 1, Math.ceil(maxY + pad));
  
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  if (boxW <= 0 || boxH <= 0) return;
  
  // Create offscreen canvas for the mask
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = boxW;
  maskCanvas.height = boxH;
  const mctx = maskCanvas.getContext("2d");
  mctx.fillStyle = "black";
  mctx.fillRect(0, 0, boxW, boxH);
  
  mctx.strokeStyle = "white";
  mctx.lineWidth = strokeSize;
  mctx.lineCap = "round";
  mctx.lineJoin = "round";
  
  mctx.beginPath();
  const first = stroke.points[0];
  mctx.moveTo(first.x * width - minX, first.y * height - minY);
  stroke.points.slice(1).forEach(p => {
    mctx.lineTo(p.x * width - minX, p.y * height - minY);
  });
  if (stroke.points.length === 1) {
    mctx.lineTo(first.x * width - minX + 0.01, first.y * height - minY + 0.01);
  }
  mctx.stroke();
  
  let imgData;
  try {
    imgData = ctx.getImageData(minX, minY, boxW, boxH);
  } catch (e) {
    return;
  }
  const maskData = mctx.getImageData(0, 0, boxW, boxH);
  
  const pixels = imgData.data;
  const maskPixels = maskData.data;
  
  const sourcePixels = new Uint8ClampedArray(pixels);
  const maxSearch = Math.max(30, Math.round(strokeSize * 2));
  
  const dirs = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1]
  ];
  
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const idx = (y * boxW + x) * 4;
      if (maskPixels[idx] > 128) {
        let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
        for (let d = 0; d < 8; d++) {
          const dx = dirs[d][0];
          const dy = dirs[d][1];
          let step = 1;
          while (step <= maxSearch) {
            const sx = x + dx * step;
            const sy = y + dy * step;
            if (sx < 0 || sx >= boxW || sy < 0 || sy >= boxH) break;
            const sIdx = (sy * boxW + sx) * 4;
            if (maskPixels[sIdx] <= 128) {
              const dist = step;
              const weight = 1 / (dist * dist);
              rSum += sourcePixels[sIdx] * weight;
              gSum += sourcePixels[sIdx + 1] * weight;
              bSum += sourcePixels[sIdx + 2] * weight;
              wSum += weight;
              break;
            }
            step++;
          }
        }
        if (wSum > 0) {
          pixels[idx] = rSum / wSum;
          pixels[idx + 1] = gSum / wSum;
          pixels[idx + 2] = bSum / wSum;
          pixels[idx + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(imgData, minX, minY);
}

function drawHealingOverlay(ctx, stroke, width, height, scale) {
  if (!stroke || !stroke.points || !stroke.points.length) return;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(239, 68, 68, 0.75)";
  ctx.lineWidth = Math.max(2, stroke.size * scale);
  
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

function snapshot(adjustments, brush, strokes, extra = {}) {
  return {
    adjustments: JSON.parse(JSON.stringify(adjustments)),
    brush: { ...brush },
    strokes: JSON.parse(JSON.stringify(strokes)),
    penAnchors: JSON.parse(JSON.stringify(extra.penAnchors || [])),
    penClosed: extra.penClosed || false,
    activeSelection: extra.activeSelection ? { ...extra.activeSelection } : null
  };
}

export function ImageEditorModal({ source, title = "Image Editor", onClose, onSave }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const adjustmentsRef = useRef(DEFAULT_ADJUSTMENTS);
  const brushRef = useRef(DEFAULT_BRUSH);
  const strokesRef = useRef([]);
  const panStartRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const zoomStartRef = useRef(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const isSliderDraggingRef = useRef(false);
  const baseCanvasRef = useRef(null);
  const strokeLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const previewMetaRef = useRef(null);
  const croppingRef = useRef(false);
  const altToolRef = useRef(null);
  const spaceToolRef = useRef(null);
  const prevHealingCountRef = useRef(0);

  const origCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const curvesCanvasRef = useRef(null);
  const draggingCurvePointRef = useRef(null);
  const [activeCurveChannel, setActiveCurveChannel] = useState("rgb");
  const [selectedCurvePointIndex, setSelectedCurvePointIndex] = useState(null);
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [brush, setBrush] = useState(DEFAULT_BRUSH);
  const [strokes, setStrokes] = useState([]);
  const [hoveredZone, setHoveredZone] = useState(null);
  const histogramDragRef = useRef(null);
  const [activeTool, setActiveTool] = useState("hand");
  const [openSections, setOpenSections] = useState({ basic: true, presets: false });
  const [activeColorTab, setActiveColorTab] = useState("reds");
  const [colorPickTarget, setColorPickTarget] = useState(null);
  const [colorPickCursor, setColorPickCursor] = useState(null);
  const [cropRatio, setCropRatio] = useState("free");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
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

  const [customPresets, setCustomPresets] = useState([]);
  const [showNewPresetForm, setShowNewPresetForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  // Pen tool state + mirror refs (for synchronous reads in pointer-up handlers)
  const penDragRef = useRef(null);
  const penAnchorsRef = useRef([]);
  const penClosedRef = useRef(false);
  const [penAnchors, setPenAnchors] = useState([]);
  const [penClosed, setPenClosed] = useState(false);
  const [selectedPenAnchor, setSelectedPenAnchor] = useState(-1);
  // Selection tool state + mirror ref
  const selectionDragRef = useRef(null);
  const activeSelectionRef = useRef(null);
  const [activeSelection, setActiveSelection] = useState(null);
  // Shared options for pen/selection
  const [toolFeather, setToolFeather] = useState(0);
  const [toolOpacity, setToolOpacity] = useState(50);
  const [selectionHoverInside, setSelectionHoverInside] = useState(false);

  // Helpers that update both state and ref atomically
  function setPenAnchorsSync(anchors) {
    penAnchorsRef.current = anchors;
    setPenAnchors(anchors);
  }
  function setPenClosedSync(closed) {
    penClosedRef.current = closed;
    setPenClosed(closed);
  }
  function setActiveSelectionSync(sel) {
    activeSelectionRef.current = sel;
    setActiveSelection(sel);
  }

  useEffect(() => {
    fetch("/api/presets")
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.presets)) {
          setCustomPresets(data.presets);
          try {
            localStorage.setItem("image-editor-custom-presets", JSON.stringify(data.presets));
          } catch (e) {
            console.error("Failed to write presets to localStorage", e);
          }
        }
      })
      .catch(e => {
        console.error("Failed to load presets from server, falling back to localStorage", e);
        try {
          const saved = localStorage.getItem("image-editor-custom-presets");
          if (saved) {
            setCustomPresets(JSON.parse(saved));
          }
        } catch (localError) {
          console.error("Failed to load presets from localStorage", localError);
        }
      });
  }, []);

  const savePresets = useCallback((updated) => {
    setCustomPresets(updated);
    try {
      localStorage.setItem("image-editor-custom-presets", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to write presets to localStorage", e);
    }
    fetch("/api/presets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ presets: updated })
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(data => {
        if (data.success && Array.isArray(data.presets)) {
          setCustomPresets(data.presets);
          try {
            localStorage.setItem("image-editor-custom-presets", JSON.stringify(data.presets));
          } catch (e) {
            console.error("Failed to write updated presets to localStorage", e);
          }
        }
      })
      .catch(e => {
        console.error("Failed to sync presets with server", e);
      });
  }, []);

  const handleCreatePreset = useCallback(() => {
    if (!newPresetName.trim()) return;
    const newPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      adjustments: JSON.parse(JSON.stringify(adjustments))
    };
    const updated = [...customPresets, newPreset];
    savePresets(updated);
    setShowNewPresetForm(false);
    setNewPresetName("");
  }, [newPresetName, adjustments, customPresets, savePresets]);

  const handleDeletePreset = useCallback((id) => {
    const updated = customPresets.filter(item => item.id !== id);
    savePresets(updated);
  }, [customPresets, savePresets]);

  const handleUpdatePresetSettings = useCallback((id) => {
    const updated = customPresets.map(item => {
      if (item.id === id) {
        return {
          ...item,
          adjustments: JSON.parse(JSON.stringify(adjustments))
        };
      }
      return item;
    });
    savePresets(updated);
  }, [adjustments, customPresets, savePresets]);

  const handleSaveRename = useCallback((id) => {
    if (!renameValue.trim()) return;
    const updated = customPresets.map(item => {
      if (item.id === id) {
        return {
          ...item,
          name: renameValue.trim()
        };
      }
      return item;
    });
    savePresets(updated);
    setEditingPresetId(null);
  }, [renameValue, customPresets, savePresets]);

  const isPresetActive = useCallback((preset) => {
    if (!preset?.adjustments) return false;
    return adjustmentsMatchPreset(adjustments, preset.adjustments);
  }, [adjustments]);

  const activePresetId = useMemo(
    () => findActivePresetId(adjustments, [...PRESETS, ...customPresets]),
    [adjustments, customPresets]
  );

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
    const entry = snapshot(nextAdjustments, nextBrush, nextStrokes, {
      penAnchors: penAnchorsRef.current,
      penClosed: penClosedRef.current,
      activeSelection: activeSelectionRef.current
    });
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
    // Restore pen state
    const restoredAnchors = entry.penAnchors || [];
    penAnchorsRef.current = restoredAnchors;
    setPenAnchors(restoredAnchors);
    const restoredClosed = entry.penClosed || false;
    penClosedRef.current = restoredClosed;
    setPenClosed(restoredClosed);
    setSelectedPenAnchor(-1);
    // Restore selection state
    const restoredSel = entry.activeSelection || null;
    activeSelectionRef.current = restoredSel;
    setActiveSelection(restoredSel);
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
    penAnchorsRef.current = [];
    penClosedRef.current = false;
    activeSelectionRef.current = null;
    setPenAnchors([]);
    setPenClosed(false);
    setSelectedPenAnchor(-1);
    setActiveSelection(null);
    loadImage(source)
      .then(image => {
        if (cancelled) return;
        imageRef.current = image;
        const initial = snapshot(DEFAULT_ADJUSTMENTS, DEFAULT_BRUSH, [], { penAnchors: [], penClosed: false, activeSelection: null });
        setHistory([initial]);
        setHistoryIndex(0);
        setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(t("editor.loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Applies all colour/geometry adjustments via the shared Lightroom-style pipeline.
  const applyAdjustments = useCallback((targetCanvas, { fullResolution = false, ignoreCrop = false, interactive = false } = {}) => {
    const image = imageRef.current;
    if (!image) return null;
    const maxEdge = interactive ? PREVIEW_INTERACTIVE_MAX_EDGE : PREVIEW_MAX_EDGE;
    return applyImageAdjustments(image, adjustments, targetCanvas, {
      fullResolution,
      maxEdge: fullResolution ? Infinity : maxEdge,
      interactive,
      skipBlur: interactive,
      ignoreCrop,
      onAfterDraw: (ctx, scale) => {
        (strokesRef.current || [])
          .filter(stroke => stroke.tool === "healing")
          .forEach(stroke => applyHealingStroke(ctx, stroke, scale));
      },
      seed: 8421
    });
  }, [adjustments]);

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
    strokesRef.current.forEach(stroke => {
      if (stroke.tool !== "healing") {
        drawStroke(ctx, stroke, layer.width, layer.height, meta.scale);
      }
    });
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
      grainSize: 50,
      grainRoughness: 50,
      clarity: 0,
      dehaze: 0,
      texture: 0,
      vignette: 0,
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
  }, [adjustments]);

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
      if (active.tool === "healing") {
        drawHealingOverlay(tctx, active, tmp.width, tmp.height, meta.scale);
      } else {
        drawStroke(tctx, active, tmp.width, tmp.height, meta.scale);
      }
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

  const renderPreview = useCallback((options = {}) => {
    const interactive = options.interactive ?? isSliderDraggingRef.current;
    if (!baseCanvasRef.current) baseCanvasRef.current = document.createElement("canvas");
    const meta = applyAdjustments(baseCanvasRef.current, { ignoreCrop: croppingRef.current, interactive });
    if (!meta) return;
    previewMetaRef.current = meta;
    syncStrokeLayer();
    compositePreview();

    if (!interactive) {
      const histData = baseCanvasRef.current ? computeHistogram(baseCanvasRef.current) : null;
      if (histogramCanvasRef.current && histData) {
        drawHistogram(histogramCanvasRef.current, histData);
      }

      if (curvesCanvasRef.current && histData && adjustments.curves) {
        drawCurvesCanvas(
          curvesCanvasRef.current,
          adjustments.curves[activeCurveChannel],
          activeCurveChannel,
          selectedCurvePointIndex,
          histData
        );
      }
    }
  }, [applyAdjustments, syncStrokeLayer, compositePreview, activeCurveChannel, selectedCurvePointIndex, adjustments.curves]);

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

  useEffect(() => {
    if (openSections.curves && curvesCanvasRef.current && adjustments.curves && baseCanvasRef.current) {
      const histData = computeHistogram(baseCanvasRef.current);
      drawCurvesCanvas(
        curvesCanvasRef.current,
        adjustments.curves[activeCurveChannel],
        activeCurveChannel,
        selectedCurvePointIndex,
        histData
      );
    }
  }, [openSections.curves, adjustments.curves, activeCurveChannel, selectedCurvePointIndex]);

  useEffect(() => {
    if (selectedCurvePointIndex === null) return;
    const points = adjustments.curves?.[activeCurveChannel];
    if (!points || selectedCurvePointIndex < 0 || selectedCurvePointIndex >= points.length) {
      setSelectedCurvePointIndex(null);
    }
  }, [adjustments.curves, activeCurveChannel, selectedCurvePointIndex]);

  // When the committed stroke set changes (commit / undo / redo / reset), rebuild
  // the brush layer and recomposite. Not triggered during dragging.
  useEffect(() => {
    if (!isReady) return;

    const healingCount = (strokes || []).filter(s => s.tool === "healing").length;
    const prevCount = prevHealingCountRef.current;
    prevHealingCountRef.current = healingCount;

    if (healingCount > 0 || prevCount > 0) {
      renderPreview();
    } else {
      syncStrokeLayer();
      compositePreview();
    }
  }, [isReady, strokes, syncStrokeLayer, compositePreview, renderPreview]);

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
    setSelectedCurvePointIndex(null);
    setAdjustments(current => {
      const next = mergePresetAdjustments(current, preset.adjustments);
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

  function beginSliderDrag() {
    isSliderDraggingRef.current = true;
  }

  function commitCurrent() {
    isSliderDraggingRef.current = false;
    commitHistory(adjustments, brush, strokes);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => renderPreview({ interactive: false }));
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
    beginSliderDrag();
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
    setOpenSections(current => {
      const isOpen = !current[id];
      return { [id]: isOpen };
    });
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

  const handleCurvesPointerDown = useCallback((e) => {
    const canvas = curvesCanvasRef.current;
    if (!canvas || !adjustments.curves) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(Math.round(((e.clientX - rect.left) / rect.width) * 255), 0, 255);
    const y = clamp(Math.round((1 - (e.clientY - rect.top) / rect.height) * 255), 0, 255);

    const points = adjustments.curves[activeCurveChannel];
    let closestIdx = -1;
    let minDist = 12; // Detection radius in curves space [0..255]

    points.forEach((pt, idx) => {
      const dx = pt.x - x;
      const dy = pt.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    if (closestIdx !== -1) {
      setSelectedCurvePointIndex(closestIdx);
      draggingCurvePointRef.current = { index: closestIdx };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      // Find insert position
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
          const newPt = { x, y };
          const nextPoints = [...points];
          nextPoints.splice(insertIdx, 0, newPt);
          
          setAdjustments(current => ({
            ...current,
            curves: {
              ...current.curves,
              [activeCurveChannel]: nextPoints
            }
          }));
          
          setSelectedCurvePointIndex(insertIdx);
          draggingCurvePointRef.current = { index: insertIdx };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }
    }
  }, [adjustments.curves, activeCurveChannel]);

  const handleCurvesPointerMove = useCallback((e) => {
    if (!draggingCurvePointRef.current || !adjustments.curves) return;
    const canvas = curvesCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(Math.round(((e.clientX - rect.left) / rect.width) * 255), 0, 255);
    const y = clamp(Math.round((1 - (e.clientY - rect.top) / rect.height) * 255), 0, 255);

    const points = adjustments.curves[activeCurveChannel];
    const idx = draggingCurvePointRef.current.index;

    const nextPoints = points.map((pt, i) => {
      if (i === idx) {
        let newX = x;
        if (idx === 0) {
          newX = clamp(x, 0, points[1].x - 2);
        } else if (idx === points.length - 1) {
          newX = clamp(x, points[points.length - 2].x + 2, 255);
        } else {
          newX = clamp(x, points[idx - 1].x + 2, points[idx + 1].x - 2);
        }
        return {
          x: newX,
          y: clamp(y, 0, 255)
        };
      }
      return pt;
    });

    setAdjustments(current => ({
      ...current,
      curves: {
        ...current.curves,
        [activeCurveChannel]: nextPoints
      }
    }));
  }, [adjustments.curves, activeCurveChannel]);

  const handleCurvesPointerUp = useCallback((e) => {
    if (draggingCurvePointRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      draggingCurvePointRef.current = null;
      commitCurrent();
    }
  }, [commitCurrent]);

  const handleCurvesDoubleClick = useCallback((e) => {
    if (!adjustments.curves) return;
    const canvas = curvesCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(Math.round(((e.clientX - rect.left) / rect.width) * 255), 0, 255);
    const y = clamp(Math.round((1 - (e.clientY - rect.top) / rect.height) * 255), 0, 255);

    const points = adjustments.curves[activeCurveChannel];
    let closestIdx = -1;
    let minDist = 12;

    points.forEach((pt, idx) => {
      const dx = pt.x - x;
      const dy = pt.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    // Delete if it is a middle point
    if (closestIdx > 0 && closestIdx < points.length - 1) {
      const nextPoints = points.filter((_, i) => i !== closestIdx);
      setAdjustments(current => ({
        ...current,
        curves: {
          ...current.curves,
          [activeCurveChannel]: nextPoints
        }
      }));
      setSelectedCurvePointIndex(null);
      commitCurrent();
    }
  }, [adjustments.curves, activeCurveChannel, commitCurrent]);

  function openSection(id) {
    setOpenSections({ [id]: true });
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

  // Keep refs in sync so wheel handler always reads current values
  useEffect(() => { zoomRef.current = zoom; panRef.current = pan; });

  function updateZoom(delta) {
    setZoom(value => clamp(Number((value + delta).toFixed(2)), 0.2, 100));
  }

  function zoomToPoint(factor, mouseX, mouseY) {
    const prevZoom = zoomRef.current;
    const prevPan = panRef.current;
    const newZoom = clamp(Number((prevZoom * factor).toFixed(3)), 0.2, 100);
    if (newZoom === prevZoom) return;
    const ratio = newZoom / prevZoom;
    const newPan = {
      x: mouseX + (prevPan.x - mouseX) * ratio,
      y: mouseY + (prevPan.y - mouseY) * ratio
    };
    zoomRef.current = newZoom;
    panRef.current = newPan;
    setZoom(newZoom);
    setPan(newPan);
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(event) {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - rect.width / 2;
      const mouseY = event.clientY - rect.top - rect.height / 2;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomToPoint(factor, mouseX, mouseY);
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  function toggleEditorCompare() {
    setEditorCompareMode(current => {
      const next = !current;
      if (next) setActiveTool("hand");
      return next;
    });
  }

  useEffect(() => {
    const activateTool = tool => {
      setActiveTool(tool);
      if (tool === "crop") openSection("crop");
      if (tool === "brush" || tool === "eraser" || tool === "healing") openSection("brush");
      if (tool === "pen" || tool === "rectSelect" || tool === "ellipseSelect") openSection("toolOptions");
      spaceToolRef.current = null;
      altToolRef.current = null;
    };

    const handleKeyDown = event => {
      if (event.key === "Shift") {
        setIsShiftPressed(true);
      }
      const editable = isTextEntryTarget(event.target);
      const key = event.key.toLowerCase();
      const hasUndoModifier = event.metaKey || event.ctrlKey;

      if ((event.code === "Space" || event.key === " ") && !editable && !event.repeat && spaceToolRef.current === null) {
        spaceToolRef.current = activeTool;
        setActiveTool("hand");
        event.preventDefault();
        return;
      }

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

      if (hasUndoModifier && !editable && event.key === "Enter") {
        if (
          (activeTool === "pen" && penClosedRef.current && penAnchorsRef.current.length >= 3) ||
          ((activeTool === "rectSelect" || activeTool === "ellipseSelect") && activeSelectionRef.current?.w > 0.001 && activeSelectionRef.current?.h > 0.001)
        ) {
          event.preventDefault();
          fillCurrentTool();
        }
        return;
      }

      // Shift+M → ellipse select (must be handled before the shiftKey guard)
      if (event.shiftKey && !editable && !hasUndoModifier && !event.altKey && key === "m") {
        event.preventDefault();
        activateTool("ellipseSelect");
        return;
      }

      if (editable || hasUndoModifier || event.altKey || event.shiftKey) return;

      if (event.key === "1") {
        event.preventDefault();
        toggleSection("basic");
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        toggleSection("curves");
        return;
      }
      if (event.key === "3") {
        event.preventDefault();
        toggleSection("hsl");
        return;
      }
      if (event.key === "4") {
        event.preventDefault();
        toggleSection("effects");
        return;
      }
      if (event.key === "5") {
        event.preventDefault();
        toggleSection("export");
        return;
      }

      if (event.key === "Enter" && activeTool === "pen") {
        if (!penClosedRef.current && penAnchorsRef.current.length >= 3) {
          event.preventDefault();
          setPenClosedSync(true);
          setSelectedPenAnchor(0);
          commitHistory(adjustmentsRef.current, brushRef.current, strokesRef.current);
        }
      } else if (event.key === "Enter" && activeTool === "crop") {
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
      } else if (key === "z") {
        event.preventDefault();
        activateTool("zoom");
      } else if (key === "j") {
        event.preventDefault();
        activateTool("healing");
      } else if (key === "p") {
        event.preventDefault();
        activateTool("pen");
      } else if (key === "m") {
        event.preventDefault();
        activateTool("rectSelect");
      }
    };

    const handleKeyUp = event => {
      if (event.key === "Shift") {
        setIsShiftPressed(false);
      }
      if ((event.code === "Space" || event.key === " ") && spaceToolRef.current != null) {
        setActiveTool(spaceToolRef.current);
        spaceToolRef.current = null;
        event.preventDefault();
        return;
      }
      if (event.key !== "Alt" || altToolRef.current == null) return;
      setActiveTool(altToolRef.current);
      altToolRef.current = null;
      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [activeTool, canRedo, canUndo, history, historyIndex, restore]);

  // ── Pen tool helpers (normalized [0,1] coordinates) ──────────────────────

  function clonePenAnchors(anchors) {
    return anchors.map(a => ({ x: a.x, y: a.y, in: a.in ? { ...a.in } : null, out: a.out ? { ...a.out } : null }));
  }

  function mirrorPenPoint(anchor, pt) {
    return { x: anchor.x * 2 - pt.x, y: anchor.y * 2 - pt.y };
  }

  function buildImagePenPath(anchors, closed) {
    if (!anchors.length) return "";
    const cmds = [`M ${anchors[0].x} ${anchors[0].y}`];
    for (let i = 1; i < anchors.length; i++) {
      const prev = anchors[i - 1];
      const curr = anchors[i];
      const c1 = prev.out || prev;
      const c2 = curr.in || curr;
      cmds.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${curr.x} ${curr.y}`);
    }
    if (closed && anchors.length > 2) {
      const last = anchors[anchors.length - 1];
      const first = anchors[0];
      const c1 = last.out || last;
      const c2 = first.in || first;
      cmds.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${first.x} ${first.y} Z`);
    }
    return cmds.join(" ");
  }

  function penHitRadiusNorm() {
    const canvas = canvasRef.current;
    if (!canvas) return 0.02;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 ? 10 / rect.width : 10 / (canvas.width || 512);
  }

  function distNorm(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function hitPenControlNorm(pt, anchors) {
    const radius = penHitRadiusNorm();
    for (let i = anchors.length - 1; i >= 0; i--) {
      const a = anchors[i];
      if (a.out && distNorm(pt, a.out) <= radius) return { type: "out", index: i };
      if (a.in && distNorm(pt, a.in) <= radius) return { type: "in", index: i };
    }
    for (let i = anchors.length - 1; i >= 0; i--) {
      if (distNorm(pt, anchors[i]) <= radius) return { type: "anchor", index: i };
    }
    return null;
  }

  function handlePenPointerDown(event) {
    const pt = getCanvasPoint(event);
    if (!pt) return;
    // Click on first anchor → close path (no drag needed, commit on up)
    if (!penClosed && penAnchors.length >= 3 && distNorm(pt, penAnchors[0]) <= penHitRadiusNorm()) {
      setPenClosedSync(true);
      setSelectedPenAnchor(0);
      // Commit immediately (no drag will follow for this action)
      commitHistory(adjustmentsRef.current, brushRef.current, strokesRef.current);
      return;
    }
    const hit = hitPenControlNorm(pt, penAnchors);
    if (hit) {
      setSelectedPenAnchor(hit.index);
      penDragRef.current = { pointerId: event.pointerId, type: hit.type, index: hit.index, startPoint: pt, startAnchors: clonePenAnchors(penAnchors) };
      return;
    }
    const anchor = { x: pt.x, y: pt.y, in: null, out: null };
    const newAnchors = penClosed ? [anchor] : [...penAnchors, anchor];
    setPenAnchorsSync(newAnchors);
    setSelectedPenAnchor(newAnchors.length - 1);
    if (penClosed) setPenClosedSync(false);
    penDragRef.current = {
      pointerId: event.pointerId,
      type: "new",
      index: penClosed ? 0 : penAnchors.length,
      startPoint: pt,
      startAnchors: penClosed ? [anchor] : [...clonePenAnchors(penAnchors), anchor]
    };
  }

  function handlePenPointerMove(event) {
    const drag = penDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pt = getCanvasPoint(event);
    if (!pt) return;
    const dx = pt.x - drag.startPoint.x;
    const dy = pt.y - drag.startPoint.y;
    const next = clonePenAnchors(drag.startAnchors);
    const anchor = next[drag.index];
    if (!anchor) return;
    if (drag.type === "anchor") {
      anchor.x += dx; anchor.y += dy;
      if (anchor.in) { anchor.in.x += dx; anchor.in.y += dy; }
      if (anchor.out) { anchor.out.x += dx; anchor.out.y += dy; }
    } else if (drag.type === "out") {
      anchor.out = { x: pt.x, y: pt.y };
      if (!event.altKey) anchor.in = mirrorPenPoint(anchor, pt);
    } else if (drag.type === "in") {
      anchor.in = { x: pt.x, y: pt.y };
      if (!event.altKey) anchor.out = mirrorPenPoint(anchor, pt);
    } else if (drag.type === "new") {
      anchor.out = { x: pt.x, y: pt.y };
      anchor.in = event.altKey ? null : mirrorPenPoint(anchor, pt);
    }
    // Sync ref so endPointerInteraction can commit immediately
    penAnchorsRef.current = next;
    setPenAnchors(next);
  }

  // ── Selection tool helpers ────────────────────────────────────────────────

  function isInsideRect(pt, sel) {
    if (!sel || sel.w < 0.001 || sel.h < 0.001) return false;
    return pt.x >= sel.x && pt.x <= sel.x + sel.w && pt.y >= sel.y && pt.y <= sel.y + sel.h;
  }

  function isInsideEllipse(pt, sel) {
    if (!sel || sel.w < 0.001 || sel.h < 0.001) return false;
    const dx = (pt.x - (sel.x + sel.w / 2)) / (sel.w / 2);
    const dy = (pt.y - (sel.y + sel.h / 2)) / (sel.h / 2);
    return dx * dx + dy * dy <= 1;
  }

  function isInsideSelection(pt, sel) {
    return activeTool === "ellipseSelect" ? isInsideEllipse(pt, sel) : isInsideRect(pt, sel);
  }

  function handleSelectionPointerDown(event) {
    const pt = getCanvasPoint(event);
    if (!pt) return;
    const sel = activeSelectionRef.current;
    if (sel && isInsideSelection(pt, sel)) {
      // Move existing selection
      selectionDragRef.current = {
        pointerId: event.pointerId,
        mode: "move",
        startX: pt.x,
        startY: pt.y,
        origSel: { ...sel }
      };
    } else {
      // Draw new selection
      selectionDragRef.current = {
        pointerId: event.pointerId,
        mode: "draw",
        startX: pt.x,
        startY: pt.y
      };
      setActiveSelectionSync({ x: pt.x, y: pt.y, w: 0, h: 0 });
    }
  }

  function handleSelectionPointerMove(event) {
    const drag = selectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pt = getCanvasPoint(event);
    if (!pt) return;

    if (drag.mode === "move") {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const orig = drag.origSel;
      const newX = clamp(orig.x + dx, 0, 1 - orig.w);
      const newY = clamp(orig.y + dy, 0, 1 - orig.h);
      const moved = { ...orig, x: newX, y: newY };
      activeSelectionRef.current = moved;
      setActiveSelection(moved);
      return;
    }

    // Draw mode
    let x = Math.min(drag.startX, pt.x);
    let y = Math.min(drag.startY, pt.y);
    let w = Math.abs(pt.x - drag.startX);
    let h = Math.abs(pt.y - drag.startY);
    if (event.shiftKey) {
      // Convert to canvas pixels so constrained shape is visually square/circle
      const cw = canvasRef.current?.width || 1;
      const ch = canvasRef.current?.height || 1;
      const minPx = Math.min(w * cw, h * ch);
      w = minPx / cw;
      h = minPx / ch;
      x = drag.startX < pt.x ? drag.startX : drag.startX - w;
      y = drag.startY < pt.y ? drag.startY : drag.startY - h;
    }
    activeSelectionRef.current = { x, y, w, h };
    setActiveSelection({ x, y, w, h });
  }

  // ── Fill current tool selection/path ─────────────────────────────────────

  function fillCurrentTool() {
    if (activeTool === "pen" && penClosed && penAnchors.length >= 3) {
      const newStroke = { tool: "penFill", color: brush.color, opacity: toolOpacity, feather: toolFeather, anchors: clonePenAnchors(penAnchors) };
      const nextStrokes = [...strokesRef.current, newStroke];
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      // Clear pen state in refs before committing so undo restores to clean state
      penAnchorsRef.current = [];
      penClosedRef.current = false;
      setPenAnchors([]);
      setPenClosed(false);
      setSelectedPenAnchor(-1);
      commitHistory(adjustmentsRef.current, brushRef.current, nextStrokes);
    } else if ((activeTool === "rectSelect" || activeTool === "ellipseSelect") && activeSelection && activeSelection.w > 0.001 && activeSelection.h > 0.001) {
      const newStroke = {
        tool: activeTool === "rectSelect" ? "rectSelectFill" : "ellipseSelectFill",
        color: brush.color,
        opacity: toolOpacity,
        feather: toolFeather,
        selection: { ...activeSelection }
      };
      const nextStrokes = [...strokesRef.current, newStroke];
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      // Clear selection in ref before committing
      activeSelectionRef.current = null;
      setActiveSelection(null);
      commitHistory(adjustmentsRef.current, brushRef.current, nextStrokes);
    }
  }

  function handleReset() {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setBrush(DEFAULT_BRUSH);
    setStrokes([]);
    penAnchorsRef.current = [];
    penClosedRef.current = false;
    activeSelectionRef.current = null;
    setPenAnchors([]);
    setPenClosed(false);
    setSelectedPenAnchor(-1);
    setActiveSelection(null);
    const initial = snapshot(DEFAULT_ADJUSTMENTS, DEFAULT_BRUSH, [], { penAnchors: [], penClosed: false, activeSelection: null });
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

  function toggleColorPickTarget(target) {
    setColorPickTarget(current => (current === target ? null : target));
    setColorPickCursor(null);
  }

  function applyColorPickFromCanvas(point) {
    const base = baseCanvasRef.current;
    if (!base || !colorPickTarget) return false;

    const px = clamp(Math.round(point.x * base.width), 0, base.width - 1);
    const py = clamp(Math.round(point.y * base.height), 0, base.height - 1);
    const pixel = sampleCanvasPixel(base, px, py);
    if (!pixel) return false;

    if (colorPickTarget === "hsl") {
      setActiveColorTab(getDominantHslChannelId(pixel.r, pixel.g, pixel.b));
      openSection("hsl");
      setColorPickTarget(null);
      setColorPickCursor(null);
      return true;
    }

    if (colorPickTarget === "curves") {
      const sample = getCurveSampleFromPixel(pixel.r, pixel.g, pixel.b, activeCurveChannel);
      const points = adjustments.curves?.[activeCurveChannel];
      if (!points) return false;
      const { points: nextPoints, selectedIndex } = upsertCurvePoint(points, sample);
      setAdjustments(current => ({
        ...current,
        curves: {
          ...current.curves,
          [activeCurveChannel]: nextPoints
        }
      }));
      setSelectedCurvePointIndex(selectedIndex);
      openSection("curves");
      commitCurrent();
      setColorPickTarget(null);
      setColorPickCursor(null);
      return true;
    }

    return false;
  }

  function handlePointerDown(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    if (colorPickTarget) {
      if (applyColorPickFromCanvas(point)) return;
    }
    if (activeTool === "pen") {
      event.currentTarget.setPointerCapture(event.pointerId);
      handlePenPointerDown(event);
      return;
    }
    if (activeTool === "rectSelect" || activeTool === "ellipseSelect") {
      event.currentTarget.setPointerCapture(event.pointerId);
      handleSelectionPointerDown(event);
      return;
    }
    if (activeTool === "colorpicker") {
      const ctx = canvas.getContext("2d");
      const px = clamp(Math.round(point.x * canvas.width), 0, canvas.width - 1);
      const py = clamp(Math.round(point.y * canvas.height), 0, canvas.height - 1);
      const pixel = ctx.getImageData(px, py, 1, 1).data;
      setBrush(current => ({ ...current, color: rgbToHex(pixel[0], pixel[1], pixel[2]) }));
      setActiveTool("brush");
      return;
    }
    if (activeTool === "brush" || activeTool === "eraser" || activeTool === "healing") {
      event.currentTarget.setPointerCapture(event.pointerId);
      // The in-progress stroke lives outside React state and is drawn live, so
      // dragging never churns state (avoids re-render storms and array races).
      activeStrokeRef.current = {
        tool: activeTool,
        color: brush.color,
        size: brush.size,
        opacity: brush.opacity,
        hardness: brush.hardness ?? 100,
        points: [point]
      };
      compositePreview();
      return;
    }
    if (activeTool === "zoom") {
      event.currentTarget.setPointerCapture(event.pointerId);
      zoomStartRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startZoom: zoom,
        dragged: false,
        hasShift: event.shiftKey
      };
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (editorCompareMode && activeTool === "hand") updateEditorComparePosition(event);
    panStartRef.current = { pointer: { x: event.clientX, y: event.clientY }, pan };
    setIsPanning(true);
  }

  function handlePointerMove(event) {
    if (colorPickTarget && stageRef.current) {
      const stageRect = stageRef.current.getBoundingClientRect();
      setColorPickCursor({
        x: event.clientX - stageRect.left,
        y: event.clientY - stageRect.top
      });
      return;
    }
    if (activeTool === "pen") {
      if (penDragRef.current) handlePenPointerMove(event);
      return;
    }
    if (activeTool === "rectSelect" || activeTool === "ellipseSelect") {
      if (selectionDragRef.current) {
        handleSelectionPointerMove(event);
      } else {
        // Update hover cursor when not dragging
        const pt = getCanvasPoint(event);
        setSelectionHoverInside(pt ? isInsideSelection(pt, activeSelectionRef.current) : false);
      }
      return;
    }
    if (editorCompareMode && activeTool === "hand") updateEditorComparePosition(event);
    if (activeTool === "brush" || activeTool === "eraser" || activeTool === "healing") {
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (stage && canvas) {
        const stageRect = stage.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        if (canvas.width > 0) canvasScaleRef.current = canvasRect.width / canvas.width;
        setBrushCursor({ x: event.clientX - stageRect.left, y: event.clientY - stageRect.top });
      }
    }
    if (activeStrokeRef.current && (activeTool === "brush" || activeTool === "eraser" || activeTool === "healing")) {
      const point = getCanvasPoint(event);
      if (!point) return;
      activeStrokeRef.current.points.push(point);
      compositePreview();
      return;
    }
    if (zoomStartRef.current && activeTool === "zoom") {
      const drag = zoomStartRef.current;
      const deltaX = event.clientX - drag.startX;
      if (Math.abs(deltaX) > 5) {
        drag.dragged = true;
      }
      if (drag.dragged) {
        // Exponential zoom for smooth scaling between 20% and 10000%
        const newZoom = clamp(Number((drag.startZoom * Math.exp(deltaX * 0.006)).toFixed(2)), 0.2, 100);
        setZoom(newZoom);
      }
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
    if (activeTool === "pen") {
      const wasDragging = !!penDragRef.current;
      penDragRef.current = null;
      // Commit history after placing/moving an anchor
      if (wasDragging) {
        commitHistory(adjustmentsRef.current, brushRef.current, strokesRef.current);
      }
      return;
    }
    if (activeTool === "rectSelect" || activeTool === "ellipseSelect") {
      const wasDragging = !!selectionDragRef.current;
      selectionDragRef.current = null;
      // Commit history after drawing a selection
      if (wasDragging && activeSelectionRef.current && activeSelectionRef.current.w > 0.001) {
        commitHistory(adjustmentsRef.current, brushRef.current, strokesRef.current);
      }
      return;
    }
    if (activeStrokeRef.current) {
      const finished = activeStrokeRef.current;
      activeStrokeRef.current = null;
      // Bake into the brush layer immediately so there is no one-frame flicker
      // before the strokes effect re-syncs.
      if (finished.tool !== "healing") {
        const layer = strokeLayerRef.current;
        const meta = previewMetaRef.current;
        if (layer && meta) drawStroke(layer.getContext("2d"), finished, layer.width, layer.height, meta.scale);
      }
      const nextStrokes = strokesRef.current.concat(finished);
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      compositePreview();
      commitHistory(adjustmentsRef.current, brushRef.current, nextStrokes);
    }
    if (zoomStartRef.current && activeTool === "zoom") {
      const drag = zoomStartRef.current;
      if (!drag.dragged) {
        if (drag.hasShift || event.shiftKey) {
          updateZoom(-0.2);
        } else {
          updateZoom(0.2);
        }
      }
      zoomStartRef.current = null;
      return;
    }
    panStartRef.current = null;
    setIsPanning(false);
  }

  function renderEditedDataUrl() {
    const canvas = document.createElement("canvas");
    const meta = applyAdjustments(canvas, { fullResolution: true });
    if (!meta) throw new Error(t("editor.renderError"));
    const ctx = canvas.getContext("2d");
    // Render strokes on their own layer so eraser strokes don't cut the image.
    if (strokesRef.current.length) {
      const strokeCanvas = document.createElement("canvas");
      strokeCanvas.width = meta.width;
      strokeCanvas.height = meta.height;
      const sctx = strokeCanvas.getContext("2d");
      strokesRef.current.forEach(stroke => {
        if (stroke.tool !== "healing") {
          drawStroke(sctx, stroke, meta.width, meta.height, meta.scale);
        }
      });
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
      setError(err.message || t("editor.downloadError"));
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
      setError(err.message || t("editor.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const previewCursor = useMemo(() => {
    if (colorPickTarget) return undefined;
    if (activeTool === "brush" || activeTool === "eraser" || activeTool === "healing") return "none";
    if (activeTool === "colorpicker") return "copy";
    if (activeTool === "zoom") return isShiftPressed ? "zoom-out" : "zoom-in";
    if (activeTool === "pen") return "crosshair";
    if (activeTool === "rectSelect" || activeTool === "ellipseSelect") {
      return selectionHoverInside ? "move" : "crosshair";
    }
    return panStartRef.current ? "grabbing" : "grab";
  }, [activeTool, colorPickTarget, isShiftPressed, selectionHoverInside]);

  const brushDiameter = brush.size * (previewMetaRef.current?.scale ?? 1) * canvasScaleRef.current;

  const hsl = adjustments.hsl[activeColorTab];
  const selectedCurvePoint = getCurvePoint(adjustments.curves, activeCurveChannel, selectedCurvePointIndex);
  const cropRatioValue = CROP_RATIOS.find(option => option.id === cropRatio)?.value ?? null;
  const imageAspect = (imageRef.current?.naturalWidth || 1) / (imageRef.current?.naturalHeight || 1);

  return (
    <div className="imageEditorBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="imageEditorModal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <nav
          className="imageEditorRail"
          aria-label="Image editor tools"
          onMouseDown={event => {
            if (event.target.closest("button")) preventToolbarFocus(event);
          }}
        >
          <button type="button" className={activeTool === "crop" ? "active" : ""} onClick={() => { setActiveTool("crop"); openSection("crop"); }} title="Crop">
            <Crop size={15} />
          </button>
          <button type="button" onClick={() => updateAdjustment("rotation", (adjustments.rotation + 90) % 360, true)} title={t("editor.rotate")}>
            <RotateCw size={15} />
          </button>
          <button type="button" className={adjustments.invert ? "active" : ""} onClick={() => updateAdjustment("invert", !adjustments.invert, true)} title={t("editor.invert")}>
            <X size={15} />
          </button>
          <span className="imageEditorRailDivider" />
          <button type="button" className={activeTool === "hand" ? "active" : ""} onClick={() => setActiveTool("hand")} title={t("editor.move")}>
            <Hand size={15} />
          </button>
          <button type="button" className={activeTool === "zoom" ? "active" : ""} onClick={() => setActiveTool("zoom")} title={`${t("editor.zoom")} (Z)`}>
            <ZoomIn size={15} />
          </button>
          <button type="button" className={adjustments.flipH ? "active" : ""} onClick={() => updateAdjustment("flipH", !adjustments.flipH, true)} title={t("editor.flipHorizontal")}>
            <FlipHorizontal size={15} />
          </button>
          <button type="button" className={adjustments.flipV ? "active" : ""} onClick={() => updateAdjustment("flipV", !adjustments.flipV, true)} title={t("editor.flipVertical")}>
            <FlipVertical size={15} />
          </button>
          <span className="imageEditorRailDivider" />
          <button type="button" className={activeTool === "brush" ? "active" : ""} onClick={() => { setActiveTool("brush"); openSection("brush"); }} title={t("editor.brush")}>
            <Brush size={15} />
          </button>
          <button type="button" className={activeTool === "eraser" ? "active" : ""} onClick={() => { setActiveTool("eraser"); openSection("brush"); }} title={t("editor.eraser")}>
            <Eraser size={15} />
          </button>
          <button type="button" className={activeTool === "healing" ? "active" : ""} onClick={() => { setActiveTool("healing"); openSection("brush"); }} title={`${t("editor.healing")} (J)`}>
            <HealingIcon size={15} />
          </button>
          <button type="button" className={activeTool === "colorpicker" ? "active" : ""} onClick={() => setActiveTool("colorpicker")} title={t("editor.colorPicker")}>
            <Pipette size={15} />
          </button>
          <span className="imageEditorRailDivider" />
          <button type="button" className={activeTool === "pen" ? "active" : ""} onClick={() => { setActiveTool("pen"); openSection("toolOptions"); }} title="Pen Tool (P)">
            <PenTool size={15} />
          </button>
          <button type="button" className={activeTool === "rectSelect" ? "active" : ""} onClick={() => { setActiveTool("rectSelect"); openSection("toolOptions"); }} title={`${t("editor.rectangleSelect")} (M)`}>
            <Square size={15} />
          </button>
          <button type="button" className={activeTool === "ellipseSelect" ? "active" : ""} onClick={() => { setActiveTool("ellipseSelect"); openSection("toolOptions"); }} title={`${t("editor.ellipseSelect")} (Shift+M)`}>
            <Circle size={15} />
          </button>
          <label className="imageEditorColorSwatch" title={t("editor.brushColor")}>
            <input type="color" value={brush.color} onChange={event => setBrush(current => ({ ...current, color: event.target.value }))} onBlur={commitCurrent} />
            <span style={{ backgroundColor: brush.color }} />
          </label>
        </nav>

        <main className="imageEditorStage">
          <div
            className={`imageEditorPreview${colorPickTarget ? " isColorPickTool" : ""}`}
            ref={stageRef}
            onMouseLeave={() => {
              setBrushCursor(null);
              setSelectionHoverInside(false);
              setColorPickCursor(null);
            }}
          >
            {!isReady ? <span className="editorLoading">{t("editor.loading")}</span> : null}
            {colorPickTarget && colorPickCursor ? (
              <ColorPickCursorOverlay x={colorPickCursor.x} y={colorPickCursor.y} />
            ) : null}
            {brushCursor && (activeTool === "brush" || activeTool === "eraser" || activeTool === "healing") ? (
              <div
                className={`brushCursorCircle ${activeTool === "eraser" ? "eraserMode" : activeTool === "healing" ? "healingMode" : "brushMode"}`}
                style={{
                  left: brushCursor.x,
                  top: brushCursor.y,
                  width: Math.max(4, brushDiameter),
                  height: Math.max(4, brushDiameter),
                  borderColor: activeTool === "brush" ? brush.color : activeTool === "healing" ? "rgba(239, 68, 68, 0.8)" : undefined
                }}
              >
                {activeTool !== "healing" && brush.hardness < 100 && (
                  <div
                    style={{
                      width: `${brush.hardness}%`,
                      height: `${brush.hardness}%`,
                      border: "1.2px dashed rgba(255, 255, 255, 0.62)",
                      borderRadius: "50%",
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      boxSizing: "border-box",
                      boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.42)"
                    }}
                  />
                )}
              </div>
            ) : null}
            <div
              className={`imageEditorCanvasWrap ${isPanning ? "isPanning" : ""}`}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <canvas
                ref={canvasRef}
                style={colorPickTarget ? { cursor: "none" } : { cursor: previewCursor }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endPointerInteraction}
                onPointerCancel={endPointerInteraction}
              />
              {activeTool === "pen" && penAnchors.length > 0 ? (() => {
                const iz = 1 / zoom;
                const pathD = buildImagePenPath(penAnchors, penClosed);
                return (
                  <>
                    {/* SVG: path + handle lines only (no circles — avoids aspect-ratio distortion) */}
                    <svg className="imageEditorPenOverlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                      {pathD ? (
                        <path className={`imageEditorPenPath${penClosed ? " closed" : ""}`} d={pathD} style={{ strokeWidth: 1.5 * iz }} />
                      ) : null}
                      {penAnchors.map((anchor, idx) => (
                        <g key={idx}>
                          {anchor.in ? <line className="imageEditorPenHandleLine" x1={anchor.x} y1={anchor.y} x2={anchor.in.x} y2={anchor.in.y} style={{ strokeWidth: iz, strokeDasharray: `${3 * iz} ${3 * iz}` }} /> : null}
                          {anchor.out ? <line className="imageEditorPenHandleLine" x1={anchor.x} y1={anchor.y} x2={anchor.out.x} y2={anchor.out.y} style={{ strokeWidth: iz, strokeDasharray: `${3 * iz} ${3 * iz}` }} /> : null}
                        </g>
                      ))}
                    </svg>
                    {/* Anchor + handle dots as divs so they stay circular on any aspect ratio */}
                    {penAnchors.map((anchor, idx) => (
                      <span key={idx}>
                        {anchor.in ? <span className="imageEditorPenHandleDot" style={{ left: `${anchor.in.x * 100}%`, top: `${anchor.in.y * 100}%`, width: `${7 * iz}px`, height: `${7 * iz}px`, borderWidth: `${1.5 * iz}px` }} /> : null}
                        {anchor.out ? <span className="imageEditorPenHandleDot" style={{ left: `${anchor.out.x * 100}%`, top: `${anchor.out.y * 100}%`, width: `${7 * iz}px`, height: `${7 * iz}px`, borderWidth: `${1.5 * iz}px` }} /> : null}
                        <span className={`imageEditorPenAnchorDot${idx === selectedPenAnchor ? " selected" : ""}`} style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%`, width: `${10 * iz}px`, height: `${10 * iz}px`, borderWidth: `${2 * iz}px` }} />
                      </span>
                    ))}
                  </>
                );
              })() : null}
              {(activeTool === "rectSelect" || activeTool === "ellipseSelect") && activeSelection && activeSelection.w > 0 && activeSelection.h > 0 ? (
                <div
                  className={`imageEditorSelection${activeTool === "ellipseSelect" ? " ellipse" : ""}`}
                  style={{
                    left: `${activeSelection.x * 100}%`,
                    top: `${activeSelection.y * 100}%`,
                    width: `${activeSelection.w * 100}%`,
                    height: `${activeSelection.h * 100}%`
                  }}
                />
              ) : null}
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
              <button type="button" onClick={handleUndo} disabled={!canUndo} title={t("editor.undo")}>
                <Undo2 size={13} />
              </button>
              <button type="button" onClick={handleRedo} disabled={!canRedo} title={t("editor.redo")}>
                <Redo2 size={13} />
              </button>
              <span className="floatingDivider" />
              <button
                type="button"
                className={editorCompareMode ? "active" : ""}
                onClick={toggleEditorCompare}
                title={`${editorCompareMode ? t("editor.compareOff") : t("editor.compareOn")} (S)`}
              >
                <GitCompare size={13} />
              </button>
              <span className="floatingDivider" />
              <button type="button" onClick={() => updateZoom(-0.1)} title={t("editor.zoomOut")}>
                <ZoomOut size={13} />
              </button>
              <button type="button" className="zoomReadout" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title={t("editor.zoomReset")}>
                <span>{Math.round(zoom * 100)}%</span>
              </button>
              <button type="button" onClick={() => updateZoom(0.1)} title={t("editor.zoomIn")}>
                <ZoomIn size={13} />
              </button>
              <span className="floatingDivider" />
              <button type="button" onClick={() => setActiveTool("hand")} title={t("editor.move")}>
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
            {colorPickTarget ? (
              <p className="colorPickHint">{t("editor.pickOnImage")}</p>
            ) : null}
            <div className="imageEditorAccordionList">
              <AccordionSection icon={Sparkles} title="Presets" open={!!openSections.presets} onToggle={() => toggleSection("presets")}>
                <div className="presetAccordionContent">
                  <label className="field compact presetSelectField">
                    <span>{t("editor.selectPreset")}</span>
                    <select
                      value={activePresetId}
                      onChange={event => {
                        const preset = [...PRESETS, ...customPresets].find(item => item.id === event.target.value);
                        if (preset) applyPreset(preset);
                      }}
                    >
                      <option value="">{t("editor.selectPresetPlaceholder")}</option>
                      {PRESET_GROUPS.map(group => {
                        const groupPresets = PRESETS.filter(preset => preset.group === group.id);
                        if (!groupPresets.length) return null;
                        return (
                          <optgroup key={group.id} label={group.label}>
                            {groupPresets.map(preset => (
                              <option key={preset.id} value={preset.id}>{preset.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                      {customPresets.length > 0 ? (
                        <optgroup label={t("editor.custom")}>
                          {customPresets.map(preset => (
                            <option key={preset.id} value={preset.id}>{preset.name}</option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>

                  <div className="presetGroupTitle custom">{t("editor.custom")}</div>
                  {customPresets.length === 0 ? (
                    <p className="noCustomPresets">{t("editor.noCustomPresets")}</p>
                  ) : (
                    <div className="customPresetList">
                      {customPresets.map(preset => (
                        <div key={preset.id} className={`customPresetItem ${isPresetActive(preset) ? "active" : ""}`}>
                          {editingPresetId === preset.id ? (
                            <div className="presetRenameWrap">
                              <input
                                type="text"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") handleSaveRename(preset.id);
                                  if (e.key === "Escape") setEditingPresetId(null);
                                }}
                                autoFocus
                                className="presetRenameInput"
                              />
                              <div className="presetRenameActions">
                                <button type="button" className="presetRenameBtn confirm" onClick={() => handleSaveRename(preset.id)}>{t("common.save")}</button>
                                <button type="button" className="presetRenameBtn cancel" onClick={() => setEditingPresetId(null)}>{t("common.cancel")}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="customPresetSelectBtn"
                                onClick={() => applyPreset(preset)}
                              >
                                <span>{preset.name}</span>
                              </button>
                              <div className="customPresetActions">
                                <button
                                  type="button"
                                  title={t("editor.overwritePreset")}
                                  onClick={() => handleUpdatePresetSettings(preset.id)}
                                >
                                  <RotateCcw size={11} style={{ transform: "rotate(180deg)" }} />
                                </button>
                                <button
                                  type="button"
                                  title={t("editor.renamePreset")}
                                  onClick={() => {
                                    setEditingPresetId(preset.id);
                                    setRenameValue(preset.name);
                                  }}
                                >
                                  <SlidersHorizontal size={11} />
                                </button>
                                <button
                                  type="button"
                                  className="delete"
                                  title={t("editor.deletePreset")}
                                  onClick={() => handleDeletePreset(preset.id)}
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {showNewPresetForm ? (
                    <div className="newPresetForm">
                      <input
                        type="text"
                        placeholder={t("editor.newPresetName")}
                        value={newPresetName}
                        onChange={e => setNewPresetName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleCreatePreset();
                          if (e.key === "Escape") setShowNewPresetForm(false);
                        }}
                        autoFocus
                        className="newPresetInput"
                      />
                      <div className="newPresetFormBtns">
                        <button type="button" className="newPresetBtn cancel" onClick={() => setShowNewPresetForm(false)}>{t("common.cancel")}</button>
                        <button type="button" className="newPresetBtn save" onClick={handleCreatePreset}>{t("editor.savePreset")}</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="saveNewPresetBtn" onClick={() => { setShowNewPresetForm(true); setNewPresetName(""); }}>
                      {t("editor.saveNewPreset")}
                    </button>
                  )}
                </div>
              </AccordionSection>

              {(activeTool === "pen" || activeTool === "rectSelect" || activeTool === "ellipseSelect") ? (
                <AccordionSection
                  icon={activeTool === "pen" ? PenTool : activeTool === "rectSelect" ? Square : Circle}
                  title={activeTool === "pen" ? "Pen Tool" : activeTool === "rectSelect" ? "Rectangle Select" : "Ellipse Select"}
                  open={!!openSections.toolOptions}
                  onToggle={() => toggleSection("toolOptions")}
                >
                  <EditorRange label="Opacity" value={toolOpacity} min={1} max={100} resetValue={50} onChange={setToolOpacity} />
                  <EditorRange label="Feather" value={toolFeather} min={0} max={50} resetValue={0} onChange={setToolFeather} />
                  <div className="penFillRow">
                    <button
                      type="button"
                      className="penFillBtn penClearBtn"
                      disabled={
                        activeTool === "pen"
                          ? !penClosed || penAnchors.length < 3
                          : !activeSelection || activeSelection.w < 0.001 || activeSelection.h < 0.001
                      }
                      onClick={fillCurrentTool}
                    >
                      Fill
                    </button>
                  </div>
                  {activeTool === "pen" && penAnchors.length > 0 ? (
                    <div className="penFillRow">
                      <button
                        type="button"
                        className="penFillBtn penClearBtn"
                        onClick={() => {
                          setPenAnchorsSync([]);
                          setPenClosedSync(false);
                          setSelectedPenAnchor(-1);
                          commitHistory(adjustmentsRef.current, brushRef.current, strokesRef.current);
                        }}
                      >
                        Clear Path
                      </button>
                    </div>
                  ) : null}
                  {(activeTool === "rectSelect" || activeTool === "ellipseSelect") && activeSelection ? (
                    <div className="penFillRow">
                      <button
                        type="button"
                        className="penFillBtn penClearBtn"
                        onClick={() => {
                          setActiveSelectionSync(null);
                          commitHistory(adjustmentsRef.current, brushRef.current, strokesRef.current);
                        }}
                      >
                        Clear Selection
                      </button>
                    </div>
                  ) : null}
                </AccordionSection>
              ) : null}

              {(activeTool === "brush" || activeTool === "eraser" || activeTool === "healing") ? (
                <AccordionSection icon={activeTool === "healing" ? HealingIcon : Brush} title={activeTool === "healing" ? "Healing Brush" : "Brush / Eraser"} open={!!openSections.brush} onToggle={() => toggleSection("brush")}>
                  {activeTool !== "healing" && (
                    <label className="editorColorRow">
                      <span>Color</span>
                      <input type="color" value={brush.color} onChange={event => setBrush(current => ({ ...current, color: event.target.value }))} onBlur={commitCurrent} />
                      <b>{brush.color}</b>
                    </label>
                  )}
                  <EditorRange label="Size" value={brush.size} min={1} max={180} resetValue={DEFAULT_BRUSH.size} onChange={value => setBrush(current => ({ ...current, size: value }))} onCommit={commitCurrent} />
                  {activeTool !== "healing" && (
                    <>
                      <EditorRange label="Opacity" value={brush.opacity} min={1} max={100} resetValue={DEFAULT_BRUSH.opacity} onChange={value => setBrush(current => ({ ...current, opacity: value }))} onCommit={commitCurrent} />
                      <EditorRange label="Hardness" value={brush.hardness ?? 100} min={10} max={100} resetValue={100} onChange={value => setBrush(current => ({ ...current, hardness: value }))} onCommit={commitCurrent} />
                    </>
                  )}
                </AccordionSection>
              ) : null}

              {activeTool === "crop" ? (
                <AccordionSection icon={Crop} title="Crop" open={!!openSections.crop} onToggle={() => toggleSection("crop")}>
                  <p className="cropHint">{t("editor.cropHint")}</p>
                  <div className="cropRatioGrid">
                    {CROP_RATIOS.map(option => (
                      <button
                        type="button"
                        key={option.id}
                        className={cropRatio === option.id ? "active" : ""}
                        onClick={() => applyCropRatio(option.id)}
                      >
                        {option.id === "free" ? t("editor.free") : option.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="cropResetButton" onClick={resetCrop}>
                    <RotateCcw size={13} /> {t("editor.cropReset")}
                  </button>
                </AccordionSection>
              ) : null}

              <AccordionSection icon={SlidersHorizontal} title="Basic" open={!!openSections.basic} onToggle={() => toggleSection("basic")}>
                <EditorRange label="Temperature" value={adjustments.temperature} min={-100} max={100} onChange={value => updateAdjustment("temperature", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Tint" value={adjustments.tint} min={-100} max={100} onChange={value => updateAdjustment("tint", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Exposure" value={adjustments.luminance} min={-100} max={100} onChange={value => updateAdjustment("luminance", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Contrast" value={adjustments.contrast} min={-100} max={100} onChange={value => updateAdjustment("contrast", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Highlights" value={adjustments.highlights} min={-100} max={100} onChange={value => updateAdjustment("highlights", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Shadows" value={adjustments.shadows} min={-100} max={100} onChange={value => updateAdjustment("shadows", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Whites" value={adjustments.whites} min={-100} max={100} onChange={value => updateAdjustment("whites", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Blacks" value={adjustments.blacks} min={-100} max={100} onChange={value => updateAdjustment("blacks", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Vibrance" value={adjustments.vibrance} min={-100} max={100} onChange={value => updateAdjustment("vibrance", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Saturation" value={adjustments.saturation} min={-100} max={100} onChange={value => updateAdjustment("saturation", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Hue" value={adjustments.hue} min={-180} max={180} onChange={value => updateAdjustment("hue", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
              </AccordionSection>
 
              <AccordionSection icon={CurveIcon} title="Curves" open={!!openSections.curves} onToggle={() => toggleSection("curves")}>
                <div className="curvesTabContainer">
                  <div className="curvesHeaderRow">
                    <div className="curvesTabs">
                      <button
                        type="button"
                        className={`curvesTabButton rgb ${activeCurveChannel === "rgb" ? "active" : ""}`}
                        onClick={() => { setActiveCurveChannel("rgb"); setSelectedCurvePointIndex(null); }}
                      >
                        RGB
                      </button>
                      <button
                        type="button"
                        className={`curvesTabButton red ${activeCurveChannel === "red" ? "active" : ""}`}
                        onClick={() => { setActiveCurveChannel("red"); setSelectedCurvePointIndex(null); }}
                      >
                        Red
                      </button>
                      <button
                        type="button"
                        className={`curvesTabButton green ${activeCurveChannel === "green" ? "active" : ""}`}
                        onClick={() => { setActiveCurveChannel("green"); setSelectedCurvePointIndex(null); }}
                      >
                        Green
                      </button>
                      <button
                        type="button"
                        className={`curvesTabButton blue ${activeCurveChannel === "blue" ? "active" : ""}`}
                        onClick={() => { setActiveCurveChannel("blue"); setSelectedCurvePointIndex(null); }}
                      >
                        Blue
                      </button>
                    </div>
                    <ColorPickButton
                      active={colorPickTarget === "curves"}
                      title={t("editor.pickCurveColor")}
                      onClick={() => toggleColorPickTarget("curves")}
                    />
                  </div>
                </div>

                <div className="curvesCanvasWrapper">
                  <canvas
                    ref={curvesCanvasRef}
                    width={256}
                    height={256}
                    className="curvesCanvas"
                    onPointerDown={handleCurvesPointerDown}
                    onPointerMove={handleCurvesPointerMove}
                    onPointerUp={handleCurvesPointerUp}
                    onPointerCancel={handleCurvesPointerUp}
                    onDoubleClick={handleCurvesDoubleClick}
                  />
                </div>

                {adjustments.curves && (
                  <div className="curvesControlsRow">
                    <div className="curvesPointInfo">
                      {selectedCurvePoint ? (
                        <span>
                          {t("editor.point")}: {selectedCurvePoint.x}, {selectedCurvePoint.y}
                        </span>
                      ) : (
                        <span className="curvesHelpText">{t("editor.addCurvePoint")}</span>
                      )}
                    </div>
                    <div className="curvesActions">
                      <button
                        type="button"
                        className="curvesActionBtn delete"
                        title={t("editor.deletePoint")}
                        disabled={!selectedCurvePoint || selectedCurvePointIndex === 0 || selectedCurvePointIndex === adjustments.curves[activeCurveChannel].length - 1}
                        onClick={() => {
                          const points = adjustments.curves[activeCurveChannel];
                          if (selectedCurvePointIndex > 0 && selectedCurvePointIndex < points.length - 1) {
                            const nextPoints = points.filter((_, i) => i !== selectedCurvePointIndex);
                            setAdjustments(current => ({
                              ...current,
                              curves: {
                                ...current.curves,
                                [activeCurveChannel]: nextPoints
                              }
                            }));
                            setSelectedCurvePointIndex(null);
                            commitCurrent();
                          }
                        }}
                      >
                        {t("editor.deletePoint")}
                      </button>
                      <button
                        type="button"
                        className="curvesActionBtn reset"
                        title={t("editor.resetCurve")}
                        onClick={() => {
                          setAdjustments(current => ({
                            ...current,
                            curves: {
                              ...current.curves,
                              [activeCurveChannel]: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
                            }
                          }));
                          setSelectedCurvePointIndex(null);
                          commitCurrent();
                        }}
                      >
                        {t("editor.reset")}
                      </button>
                    </div>
                  </div>
                )}
              </AccordionSection>

              <AccordionSection icon={Droplet} title="Color HSL" open={!!openSections.hsl} onToggle={() => toggleSection("hsl")}>
                <div className="hslHeaderRow">
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
                  <ColorPickButton
                    active={colorPickTarget === "hsl"}
                    title={t("editor.pickHslColor")}
                    onClick={() => toggleColorPickTarget("hsl")}
                  />
                </div>
                <EditorRange label="Hue" value={hsl.h} min={-180} max={180} onChange={value => updateHsl(activeColorTab, "h", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Saturation" value={hsl.s} min={-100} max={100} onChange={value => updateHsl(activeColorTab, "s", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Luminance" value={hsl.l} min={-100} max={100} onChange={value => updateHsl(activeColorTab, "l", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
              </AccordionSection>

              <AccordionSection icon={Sparkles} title="Effects" open={!!openSections.effects} onToggle={() => toggleSection("effects")}>
                <EditorRange label="Clarity" value={adjustments.clarity} min={-100} max={100} onChange={value => updateAdjustment("clarity", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Texture" value={adjustments.texture ?? 0} min={-100} max={100} onChange={value => updateAdjustment("texture", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Dehaze" value={adjustments.dehaze} min={-100} max={100} onChange={value => updateAdjustment("dehaze", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Grain" value={adjustments.grain} min={0} max={100} onChange={value => updateAdjustment("grain", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Grain Size" value={adjustments.grainSize ?? 50} min={0} max={100} onChange={value => updateAdjustment("grainSize", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Grain Roughness" value={adjustments.grainRoughness ?? 50} min={0} max={100} onChange={value => updateAdjustment("grainRoughness", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Vignette" value={adjustments.vignette ?? 0} min={-100} max={100} onChange={value => updateAdjustment("vignette", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
                <EditorRange label="Blur" value={adjustments.blur} min={0} max={20} step={0.5} onChange={value => updateAdjustment("blur", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
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
              <span>{t("common.cancel")}</span>
            </button>
            <button type="button" className="smallActionButton secondary" onClick={handleDownloadEdited} disabled={downloading || !isReady}>
              <Download size={14} />
              <span>{downloading ? t("editor.downloading") : t("preview.download")}</span>
            </button>
            <button type="button" className="smallActionButton secondary" onClick={handleSave} disabled={saving || !isReady}>
              <Save size={15} />
              <span>{saving ? t("editor.saving") : t("common.save")}</span>
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
      <button
        type="button"
        className="imageEditorAccordionHeader"
        onMouseDown={preventToolbarFocus}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="imageEditorAccordionTitle"><Icon size={14} /> {title}</span>
        <ChevronDown size={15} className="imageEditorAccordionChevron" />
      </button>
      {open ? <div className="imageEditorAccordionBody">{children}</div> : null}
    </div>
  );
}

function EditorRange({ label, value, min, max, step = 1, resetValue = 0, onChange, onCommit, onDragStart }) {
  const { t } = useI18n();
  const isDefault = Number(value) === Number(resetValue);
  return (
    <label className="editorRange">
      <span>{label}</span>
      <b>{value}</b>
      <button
        type="button"
        className="editorRangeReset"
        title={t("editor.reset")}
        disabled={isDefault}
        onMouseDown={preventToolbarFocus}
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
        onPointerDown={() => onDragStart?.()}
        onChange={event => onChange(Number(event.target.value))}
        onMouseUp={event => {
          onCommit?.();
          event.currentTarget.blur();
        }}
        onTouchEnd={event => {
          onCommit?.();
          event.currentTarget.blur();
        }}
        onBlur={onCommit}
      />
    </label>
  );
}
