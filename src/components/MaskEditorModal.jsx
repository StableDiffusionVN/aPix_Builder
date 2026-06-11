import { useEffect, useRef, useState } from "react";
import { Brush, Contrast, Eraser, Hand, RotateCcw, X, Check, Loader2, ZoomIn, ZoomOut, Maximize, Undo2, Redo2, PenTool, PaintBucket } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 100;
const MIN_MASK_GROW = -100;
const MAX_MASK_GROW = 100;
const ZOOM_TRANSITION = "transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 255, g: 0, b: 0 };
}

function get2dContext(canvas) {
  return canvas.getContext("2d", { willReadFrequently: true });
}

function imageDataToBinary(imageData) {
  const total = imageData.width * imageData.height;
  const binary = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    binary[i] = imageData.data[i * 4 + 3] > 10 ? 1 : 0;
  }
  return binary;
}

function horizontalAny(binary, width, height, radius) {
  const out = new Uint8Array(binary.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= Math.min(width - 1, radius); x += 1) count += binary[row + x];
    for (let x = 0; x < width; x += 1) {
      out[row + x] = count > 0 ? 1 : 0;
      const remove = x - radius;
      const add = x + radius + 1;
      if (remove >= 0) count -= binary[row + remove];
      if (add < width) count += binary[row + add];
    }
  }
  return out;
}

function verticalAny(binary, width, height, radius) {
  const out = new Uint8Array(binary.length);
  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y <= Math.min(height - 1, radius); y += 1) count += binary[y * width + x];
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = count > 0 ? 1 : 0;
      const remove = y - radius;
      const add = y + radius + 1;
      if (remove >= 0) count -= binary[remove * width + x];
      if (add < height) count += binary[add * width + x];
    }
  }
  return out;
}

function horizontalAll(binary, width, height, radius) {
  const out = new Uint8Array(binary.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= Math.min(width - 1, radius); x += 1) count += binary[row + x];
    for (let x = 0; x < width; x += 1) {
      out[row + x] = x >= radius && x + radius < width && count === span ? 1 : 0;
      const remove = x - radius;
      const add = x + radius + 1;
      if (remove >= 0) count -= binary[row + remove];
      if (add < width) count += binary[row + add];
    }
  }
  return out;
}

function verticalAll(binary, width, height, radius) {
  const out = new Uint8Array(binary.length);
  const span = radius * 2 + 1;
  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y <= Math.min(height - 1, radius); y += 1) count += binary[y * width + x];
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = y >= radius && y + radius < height && count === span ? 1 : 0;
      const remove = y - radius;
      const add = y + radius + 1;
      if (remove >= 0) count -= binary[remove * width + x];
      if (add < height) count += binary[add * width + x];
    }
  }
  return out;
}

function applyBinaryToCanvas(canvas, binary, color) {
  const ctx = get2dContext(canvas);
  const out = ctx.createImageData(canvas.width, canvas.height);
  const rgb = hexToRgb(color);
  for (let i = 0; i < binary.length; i += 1) {
    const offset = i * 4;
    out.data[offset] = rgb.r;
    out.data[offset + 1] = rgb.g;
    out.data[offset + 2] = rgb.b;
    out.data[offset + 3] = binary[i] ? 255 : 0;
  }
  ctx.putImageData(out, 0, 0);
}

function applyMaskGrowSnapshot(canvas, snapshot, amount, color) {
  if (!canvas || !snapshot) return;
  const radius = Math.min(Math.abs(Math.round(amount)), Math.max(snapshot.width, snapshot.height));
  if (!radius) {
    restoreCanvasSnapshot(canvas, snapshot);
    return;
  }
  const binary = imageDataToBinary(snapshot);
  const next = amount > 0
    ? verticalAny(horizontalAny(binary, snapshot.width, snapshot.height, radius), snapshot.width, snapshot.height, radius)
    : verticalAll(horizontalAll(binary, snapshot.width, snapshot.height, radius), snapshot.width, snapshot.height, radius);
  applyBinaryToCanvas(canvas, next, color);
}

function restoreCanvasSnapshot(canvas, snapshot) {
  const ctx = get2dContext(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(snapshot, 0, 0);
}

// Mask painter: user paints the region to inpaint.
// On export, painted region → alpha 0, unpainted → alpha 255 (ComfyUI: mask = 1 - alpha).
export function MaskEditorModal({ source, initialMask, title = "Tô Mask", onClose, onSave }) {
  const { t } = useI18n();
  const displayTitle = title === "Tô Mask" ? t("mask.title") : title;
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const drawingRef = useRef(false);
  const panningRef = useRef(null);
  const spaceHeldRef = useRef(false);
  const lastPointRef = useRef(null);
  const historyRef = useRef([]);
  const penDragRef = useRef(null);
  const growBaseRef = useRef(null);
  const growAmountRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [maskGrowAmount, setMaskGrowAmount] = useState(0);
  const [tool, setTool] = useState("brush"); // brush | erase | pan | pen
  const [maskColor, setMaskColor] = useState("#ff0000");
  const [maskOpacity, setMaskOpacity] = useState(50);
  const [saving, setSaving] = useState(false);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [cursor, setCursor] = useState(null); // {x, y, size} in stage coords
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [penAnchors, setPenAnchors] = useState([]);
  const [penClosed, setPenClosed] = useState(false);
  const [selectedPenAnchor, setSelectedPenAnchor] = useState(-1);

  const erasing = tool === "erase";
  const panActive = tool === "pan" || spaceHeld;
  const penActive = tool === "pen";
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < historyRef.current.length - 1;
  const canFillPenPath = penClosed && penAnchors.length >= 3;

  // Load image then (optionally) initial mask onto the paint canvas.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    historyRef.current = [];
    setHistoryIndex(-1);
    setPenAnchors([]);
    setPenClosed(false);
    setSelectedPenAnchor(-1);
    growBaseRef.current = null;
    growAmountRef.current = 0;
    setMaskGrowAmount(0);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      const canvas = canvasRef.current;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      setDims({ width: img.naturalWidth, height: img.naturalHeight });
      const ctx = get2dContext(canvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (initialMask) {
        const maskImg = new Image();
        maskImg.crossOrigin = "anonymous";
        maskImg.onload = () => {
          if (cancelled) return;
          const tmp = document.createElement("canvas");
          tmp.width = canvas.width;
          tmp.height = canvas.height;
          const tctx = get2dContext(tmp);
          tctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
          const data = tctx.getImageData(0, 0, canvas.width, canvas.height);
          const out = ctx.createImageData(canvas.width, canvas.height);
          const rgb = hexToRgb(maskColor);
          for (let i = 0; i < data.data.length; i += 4) {
            if (data.data[i + 3] < 128) {
              out.data[i] = rgb.r; out.data[i + 1] = rgb.g; out.data[i + 2] = rgb.b; out.data[i + 3] = 255;
            }
          }
          ctx.putImageData(out, 0, 0);
          resetHistory(canvas);
          setReady(true);
        };
        maskImg.onerror = () => {
          resetHistory(canvas);
          setReady(true);
        };
        maskImg.src = initialMask;
      } else {
        resetHistory(canvas);
        setReady(true);
      }
    };
    img.onerror = () => setReady(true);
    img.src = source;
    return () => { cancelled = true; };
  }, [source, initialMask]);

  useEffect(() => {
    function claimShortcut(event) {
      event.preventDefault();
      event.stopPropagation();
    }
    function onKeyDown(event) {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
      const hasUndoModifier = event.metaKey || event.ctrlKey;
      if (hasUndoModifier && event.key.toLowerCase() === "z" && !isTextTarget(event.target)) {
        claimShortcut(event);
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (hasUndoModifier && event.key === "Enter" && !isTextTarget(event.target)) {
        claimShortcut(event);
        fillPenPath();
        return;
      }
      if (event.code === "Space" && !isTextTarget(event.target)) {
        claimShortcut(event);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (!spaceHeldRef.current) { spaceHeldRef.current = true; setSpaceHeld(true); }
        return;
      }
      if (event.key === "+" || event.key === "=") { claimShortcut(event); updateZoom(0.2); }
      else if (event.key === "-" || event.key === "_") { claimShortcut(event); updateZoom(-0.2); }
      else if (event.key === "0") { claimShortcut(event); resetView(); }
      else if (!hasUndoModifier && !event.altKey && !event.shiftKey && !isTextTarget(event.target)) {
        const key = event.key.toLowerCase();
        if (key === "b") {
          claimShortcut(event);
          setTool("brush");
        } else if (key === "e") {
          claimShortcut(event);
          setTool("erase");
        } else if (key === "h") {
          claimShortcut(event);
          setTool("pan");
        } else if (key === "p") {
          claimShortcut(event);
          setTool("pen");
        } else if (key === "i") {
          claimShortcut(event);
          handleInvert();
        } else if (event.key === "[") {
          claimShortcut(event);
          const step = event.repeat ? 8 : 1;
          setBrushSize(current => clamp(current - step, 5, 300));
        } else if (event.key === "]") {
          claimShortcut(event);
          const step = event.repeat ? 8 : 1;
          setBrushSize(current => clamp(current + step, 5, 300));
        }
      }
    }
    function onKeyUp(event) {
      if (event.code === "Space" && !isTextTarget(event.target)) {
        claimShortcut(event);
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [historyIndex, maskColor, onClose, penAnchors, penClosed]);

  function isTextTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
    if (target.tagName !== "INPUT") return false;
    const textInputTypes = new Set(["", "text", "search", "url", "tel", "email", "password", "number"]);
    return textInputTypes.has(target.getAttribute("type") || "");
  }

  function snapshotCanvas(canvas = canvasRef.current) {
    if (!canvas?.width || !canvas?.height) return null;
    return get2dContext(canvas).getImageData(0, 0, canvas.width, canvas.height);
  }

  function restoreSnapshot(snapshot) {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    restoreCanvasSnapshot(canvas, snapshot);
  }

  function resetHistory(canvas = canvasRef.current) {
    const snapshot = snapshotCanvas(canvas);
    historyRef.current = snapshot ? [snapshot] : [];
    setHistoryIndex(snapshot ? 0 : -1);
  }

  function commitHistory() {
    const snapshot = snapshotCanvas();
    if (!snapshot) return;
    historyRef.current = historyRef.current.slice(0, historyIndex + 1).concat(snapshot);
    setHistoryIndex(historyRef.current.length - 1);
  }

  function beginMaskGrow() {
    if (!ready || growBaseRef.current) return;
    growBaseRef.current = snapshotCanvas();
    growAmountRef.current = 0;
    setMaskGrowAmount(0);
  }

  function previewMaskGrow(value) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!growBaseRef.current) growBaseRef.current = snapshotCanvas();
    const amount = clamp(Number(value) || 0, MIN_MASK_GROW, MAX_MASK_GROW);
    growAmountRef.current = amount;
    setMaskGrowAmount(amount);
    applyMaskGrowSnapshot(canvas, growBaseRef.current, amount, maskColor);
  }

  function commitMaskGrow() {
    if (!growBaseRef.current) return;
    const amount = growAmountRef.current;
    growBaseRef.current = null;
    growAmountRef.current = 0;
    if (amount !== 0) commitHistory();
    setMaskGrowAmount(0);
  }

  function undo() {
    if (!canUndo) return;
    const nextIndex = historyIndex - 1;
    restoreSnapshot(historyRef.current[nextIndex]);
    setHistoryIndex(nextIndex);
  }

  function redo() {
    if (!canRedo) return;
    const nextIndex = historyIndex + 1;
    restoreSnapshot(historyRef.current[nextIndex]);
    setHistoryIndex(nextIndex);
  }

  // Zoom keeping the point under `rel` (relative to stage center) stationary.
  // Single pure updater on {zoom, pan} so React StrictMode double-invoke stays idempotent.
  function updateZoom(delta, rel) {
    setView(prev => {
      const next = clamp(Number((prev.zoom + delta * prev.zoom).toFixed(3)), MIN_ZOOM, MAX_ZOOM);
      if (next === prev.zoom) return prev;
      const ratio = next / prev.zoom;
      const p = rel || { x: 0, y: 0 };
      return {
        zoom: next,
        pan: {
          x: p.x * (1 - ratio) + prev.pan.x * ratio,
          y: p.y * (1 - ratio) + prev.pan.y * ratio
        }
      };
    });
  }

  function resetView() {
    setView({ zoom: 1, pan: { x: 0, y: 0 } });
  }

  function handleWheel(event) {
    event.preventDefault();
    const rect = stageRef.current.getBoundingClientRect();
    const rel = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2
    };
    updateZoom(event.deltaY > 0 ? -0.15 : 0.15, rel);
  }

  // Map a pointer event to natural-resolution canvas coordinates (transform-aware via rect).
  function toCanvasPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function getScreenPxPerCanvasPx() {
    const canvas = canvasRef.current;
    if (!canvas?.width) return 1;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function cloneAnchors(anchors = penAnchors) {
    return anchors.map(anchor => ({
      x: anchor.x,
      y: anchor.y,
      in: anchor.in ? { ...anchor.in } : null,
      out: anchor.out ? { ...anchor.out } : null
    }));
  }

  function mirrorPoint(anchor, point) {
    return { x: anchor.x * 2 - point.x, y: anchor.y * 2 - point.y };
  }

  function penHitRadius() {
    return 10 / getScreenPxPerCanvasPx();
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function hitPenControl(point) {
    const radius = penHitRadius();
    for (let i = penAnchors.length - 1; i >= 0; i -= 1) {
      const anchor = penAnchors[i];
      if (anchor.out && distance(point, anchor.out) <= radius) return { type: "out", index: i };
      if (anchor.in && distance(point, anchor.in) <= radius) return { type: "in", index: i };
    }
    for (let i = penAnchors.length - 1; i >= 0; i -= 1) {
      const anchor = penAnchors[i];
      if (distance(point, anchor) <= radius) return { type: "anchor", index: i };
    }
    return null;
  }

  function buildPenPath(anchors = penAnchors, closed = penClosed) {
    if (!anchors.length) return "";
    const command = [`M ${anchors[0].x} ${anchors[0].y}`];
    for (let i = 1; i < anchors.length; i += 1) {
      const prev = anchors[i - 1];
      const current = anchors[i];
      const c1 = prev.out || prev;
      const c2 = current.in || current;
      command.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${current.x} ${current.y}`);
    }
    if (closed && anchors.length > 2) {
      const last = anchors[anchors.length - 1];
      const first = anchors[0];
      const c1 = last.out || last;
      const c2 = first.in || first;
      command.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${first.x} ${first.y} Z`);
    }
    return command.join(" ");
  }

  function fillPenPath() {
    if (!canFillPenPath) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = get2dContext(canvas);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = maskColor;
    ctx.beginPath();
    ctx.moveTo(penAnchors[0].x, penAnchors[0].y);
    for (let i = 1; i < penAnchors.length; i += 1) {
      const prev = penAnchors[i - 1];
      const current = penAnchors[i];
      const c1 = prev.out || prev;
      const c2 = current.in || current;
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, current.x, current.y);
    }
    const last = penAnchors[penAnchors.length - 1];
    const first = penAnchors[0];
    const c1 = last.out || last;
    const c2 = first.in || first;
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, first.x, first.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    commitHistory();
  }

  function updatePenAnchor(index, updater) {
    setPenAnchors(current => {
      const next = cloneAnchors(current);
      next[index] = updater(next[index], next);
      return next;
    });
  }

  function handlePenPointerDown(event) {
    const point = toCanvasPoint(event);
    if (!penClosed && penAnchors.length >= 3 && distance(point, penAnchors[0]) <= penHitRadius()) {
      setPenClosed(true);
      setSelectedPenAnchor(0);
      return;
    }
    const hit = hitPenControl(point);
    if (hit) {
      setSelectedPenAnchor(hit.index);
      penDragRef.current = {
        pointerId: event.pointerId,
        type: hit.type,
        index: hit.index,
        startPoint: point,
        startAnchors: cloneAnchors()
      };
      return;
    }

    const anchor = { x: point.x, y: point.y, in: null, out: null };
    setPenAnchors(current => {
      const next = penClosed ? [anchor] : [...current, anchor];
      setSelectedPenAnchor(next.length - 1);
      return next;
    });
    if (penClosed) setPenClosed(false);
    penDragRef.current = {
      pointerId: event.pointerId,
      type: "new",
      index: penClosed ? 0 : penAnchors.length,
      startPoint: point,
      startAnchors: penClosed ? [anchor] : [...cloneAnchors(), anchor]
    };
  }

  function handlePenPointerMove(event) {
    const drag = penDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = toCanvasPoint(event);
    const dx = point.x - drag.startPoint.x;
    const dy = point.y - drag.startPoint.y;
    const next = cloneAnchors(drag.startAnchors);
    const anchor = next[drag.index];
    if (!anchor) return;

    if (drag.type === "anchor") {
      anchor.x += dx;
      anchor.y += dy;
      if (anchor.in) { anchor.in.x += dx; anchor.in.y += dy; }
      if (anchor.out) { anchor.out.x += dx; anchor.out.y += dy; }
    } else if (drag.type === "out") {
      anchor.out = point;
      if (!event.altKey) anchor.in = mirrorPoint(anchor, point);
    } else if (drag.type === "in") {
      anchor.in = point;
      if (!event.altKey) anchor.out = mirrorPoint(anchor, point);
    } else if (drag.type === "new") {
      anchor.out = point;
      anchor.in = event.altKey ? null : mirrorPoint(anchor, point);
    }
    setPenAnchors(next);
  }

  function updateCursorPreview(event) {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const stageRect = stage.getBoundingClientRect();
    setCursor({
      x: event.clientX - stageRect.left,
      y: event.clientY - stageRect.top,
      size: Math.max(4, brushSize)
    });
  }

  function getBrushRadiusInCanvasPx() {
    return (brushSize / getScreenPxPerCanvasPx()) / 2;
  }

  function strokeTo(point) {
    const ctx = get2dContext(canvasRef.current);
    const radius = getBrushRadiusInCanvasPx();
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.fillStyle = maskColor;
    const last = lastPointRef.current;
    if (last) {
      const dist = Math.hypot(point.x - last.x, point.y - last.y);
      const steps = Math.max(1, Math.floor(dist / (radius / 2)));
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        ctx.beginPath();
        ctx.arc(last.x + (point.x - last.x) * t, last.y + (point.y - last.y) * t, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPointRef.current = point;
  }

  function handlePointerDown(event) {
    if (!ready) return;
    event.preventDefault();
    stageRef.current.setPointerCapture(event.pointerId);
    // Pan when: hand tool, Space held, or middle mouse button.
    if (panActive || event.button === 1) {
      panningRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: view.pan.x,
        panY: view.pan.y
      };
      setIsPanning(true);
      return;
    }
    if (penActive) {
      handlePenPointerDown(event);
      return;
    }
    drawingRef.current = true;
    lastPointRef.current = null;
    strokeTo(toCanvasPoint(event));
  }

  function handlePointerMove(event) {
    updateCursorPreview(event);
    if (penActive && penDragRef.current?.pointerId === event.pointerId) {
      event.preventDefault();
      handlePenPointerMove(event);
      return;
    }
    const panState = panningRef.current;
    if (panState && panState.pointerId === event.pointerId) {
      const nextPan = {
        x: panState.panX + (event.clientX - panState.startX),
        y: panState.panY + (event.clientY - panState.startY)
      };
      setView(prev => ({ ...prev, pan: nextPan }));
      return;
    }
    if (!drawingRef.current) return;
    event.preventDefault();
    strokeTo(toCanvasPoint(event));
  }

  function handlePointerUp(event) {
    const wasDrawing = drawingRef.current;
    drawingRef.current = false;
    if (penDragRef.current?.pointerId === event.pointerId) {
      penDragRef.current = null;
    }
    if (panningRef.current) {
      panningRef.current = null;
      setIsPanning(false);
    }
    lastPointRef.current = null;
    if (stageRef.current?.hasPointerCapture(event.pointerId)) {
      stageRef.current.releasePointerCapture(event.pointerId);
    }
    if (wasDrawing) commitHistory();
  }

  // Re-tint already-painted pixels when the display color changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const ctx = get2dContext(canvas);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = hexToRgb(maskColor);
    let changed = false;
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i + 3] > 0) {
        data.data[i] = rgb.r; data.data[i + 1] = rgb.g; data.data[i + 2] = rgb.b;
        changed = true;
      }
    }
    if (changed) ctx.putImageData(data, 0, 0);
  }, [maskColor, ready]);

  function handleClear() {
    const canvas = canvasRef.current;
    get2dContext(canvas).clearRect(0, 0, canvas.width, canvas.height);
    commitHistory();
  }

  function handleInvert() {
    const canvas = canvasRef.current;
    if (!canvas?.width || !canvas?.height) return;
    const ctx = get2dContext(canvas);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = hexToRgb(maskColor);
    for (let i = 0; i < data.data.length; i += 4) {
      const wasPainted = data.data[i + 3] > 10;
      data.data[i] = rgb.r;
      data.data[i + 1] = rgb.g;
      data.data[i + 2] = rgb.b;
      data.data[i + 3] = wasPainted ? 0 : 255;
    }
    ctx.putImageData(data, 0, 0);
    commitHistory();
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const ctx = get2dContext(canvas);
      const painted = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const octx = get2dContext(out);
      const result = octx.createImageData(canvas.width, canvas.height);
      let hasMask = false;
      for (let i = 0; i < painted.data.length; i += 4) {
        const isPainted = painted.data[i + 3] > 10;
        if (isPainted) hasMask = true;
        result.data[i] = 0;
        result.data[i + 1] = 0;
        result.data[i + 2] = 0;
        result.data[i + 3] = isPainted ? 0 : 255;
      }
      octx.putImageData(result, 0, 0);
      const maskDataUrl = hasMask ? out.toDataURL("image/png") : "";
      await onSave(maskDataUrl);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const zoomPct = Math.round(view.zoom * 100);
  const showBrushCursor = cursor && ready && !panActive && !penActive;
  const stageCursor = panActive ? (isPanning ? "grabbing" : "grab") : (penActive ? "crosshair" : "none");
  const penPathD = buildPenPath();

  return (
    <div className="modalBackdrop maskEditorBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settingsModal maskEditorModal"
        role="dialog"
        aria-modal="true"
        aria-label={displayTitle}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modalHeader">
          <div>
            <h2>{displayTitle}</h2>
          </div>
          <div className="maskHeaderActions">
            <label className="maskBrushSize">
              <span>Brush Size</span>
              <input type="range" min="5" max="300" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} />
              <b>{brushSize}</b>
            </label>
            <label className="maskBrushSize maskGrowPick" title={t("mask.growHint")}>
              <span>Grow</span>
              <input
                type="range"
                min={MIN_MASK_GROW}
                max={MAX_MASK_GROW}
                step="1"
                value={maskGrowAmount}
                onPointerDown={beginMaskGrow}
                onPointerUp={commitMaskGrow}
                onPointerCancel={commitMaskGrow}
                onFocus={beginMaskGrow}
                onBlur={commitMaskGrow}
                onKeyUp={commitMaskGrow}
                onChange={event => previewMaskGrow(event.target.value)}
              />
              <b>{maskGrowAmount > 0 ? `+${maskGrowAmount}` : maskGrowAmount}</b>
            </label>
            <label className="maskColorPick" title={t("mask.color")} style={{ "--mask-color": maskColor }}>
              <input type="color" value={maskColor} onChange={event => setMaskColor(event.target.value)} />
              <span aria-hidden="true" />
            </label>
            <label className="maskBrushSize maskOpacityPick" title={t("mask.opacity")}>
              <span>Opacity</span>
              <input type="range" min="10" max="100" value={maskOpacity} onChange={event => setMaskOpacity(Number(event.target.value))} />
              <b>{maskOpacity}%</b>
            </label>
            <button type="button" className="maskTool maskToolIconOnly" onClick={handleClear} title={t("mask.clear")} aria-label={t("mask.clear")}>
              <RotateCcw size={15} />
            </button>
            <button type="button" className="maskTool maskToolIconOnly" onClick={handleInvert} title={`${t("mask.invert")} (I)`} aria-label={t("mask.invert")}>
              <Contrast size={15} />
            </button>
            <button className="modalClose" onClick={onClose} title={t("common.close")}><X size={18} /></button>
          </div>
        </div>

        <div
          className="maskStage"
          ref={stageRef}
          style={{ cursor: stageCursor }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => setCursor(null)}
        >
          <div
            className="maskViewport"
            style={{
              transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
              transition: isPanning ? "none" : ZOOM_TRANSITION
            }}
          >
            {source ? <img className="maskBaseImage" src={source} alt="" draggable="false" /> : null}
            <canvas ref={canvasRef} className="maskCanvas" style={{ opacity: maskOpacity / 100 }} />
            {penAnchors.length ? (() => {
              const sz = 1 / view.zoom;
              return (
                <svg className="maskPenOverlay" viewBox={`0 0 ${dims.width || 1} ${dims.height || 1}`} aria-hidden="true">
                  {penPathD ? <path className={`maskPenPath ${penClosed ? "closed" : ""}`} d={penPathD} style={{ strokeWidth: 2 * sz }} /> : null}
                  {penAnchors.map((anchor, index) => (
                    <g key={index}>
                      {anchor.in ? (
                        <>
                          <line className="maskPenHandleLine" x1={anchor.x} y1={anchor.y} x2={anchor.in.x} y2={anchor.in.y} style={{ strokeWidth: sz, strokeDasharray: `${4 * sz} ${4 * sz}` }} />
                          <circle className="maskPenHandle" cx={anchor.in.x} cy={anchor.in.y} r={4 * sz} style={{ strokeWidth: 2 * sz }} />
                        </>
                      ) : null}
                      {anchor.out ? (
                        <>
                          <line className="maskPenHandleLine" x1={anchor.x} y1={anchor.y} x2={anchor.out.x} y2={anchor.out.y} style={{ strokeWidth: sz, strokeDasharray: `${4 * sz} ${4 * sz}` }} />
                          <circle className="maskPenHandle" cx={anchor.out.x} cy={anchor.out.y} r={4 * sz} style={{ strokeWidth: 2 * sz }} />
                        </>
                      ) : null}
                      <circle className={`maskPenAnchor ${index === selectedPenAnchor ? "selected" : ""}`} cx={anchor.x} cy={anchor.y} r={5 * sz} style={{ strokeWidth: 2 * sz }} />
                    </g>
                  ))}
                </svg>
              );
            })() : null}
          </div>
          {showBrushCursor ? (
            <div
              className={`maskBrushCursor ${erasing ? "erase" : ""}`}
              style={{
                left: cursor.x,
                top: cursor.y,
                width: cursor.size,
                height: cursor.size,
                ...(erasing ? {} : { borderColor: maskColor, background: `${maskColor}2e` })
              }}
            />
          ) : null}
          {!ready ? <div className="maskLoading"><Loader2 size={28} className="spin" /></div> : null}
          <div className="imageEditorFloatingBar maskFloatingBar" onPointerDown={event => event.stopPropagation()}>
            <button type="button" onClick={undo} disabled={!canUndo} title={t("editor.undo")}>
              <Undo2 size={13} />
            </button>
            <button type="button" onClick={redo} disabled={!canRedo} title={t("editor.redo")}>
              <Redo2 size={13} />
            </button>
            <span className="floatingDivider" />
            <button type="button" onClick={() => updateZoom(-0.2)} title={`${t("editor.zoomOut")} (-)`}>
              <ZoomOut size={13} />
            </button>
            <button type="button" className="zoomReadout" onClick={resetView} title={t("editor.zoomReset")}>
              <span>{zoomPct}%</span>
            </button>
            <button type="button" onClick={() => updateZoom(0.2)} title={`${t("editor.zoomIn")} (+)`}>
              <ZoomIn size={13} />
            </button>
            <button type="button" onClick={resetView} title={`${t("mask.fit")} (0)`}>
              <Maximize size={13} />
            </button>
            <span className="floatingDivider" />
            <button type="button" className={tool === "brush" ? "active" : ""} onClick={() => setTool("brush")} title={t("mask.brush")}>
              <Brush size={13} />
            </button>
            <button type="button" className={tool === "erase" ? "active" : ""} onClick={() => setTool("erase")} title={t("mask.erase")}>
              <Eraser size={13} />
            </button>
            <button type="button" className={penActive ? "active" : ""} onClick={() => setTool("pen")} title="Pen Tool">
              <PenTool size={13} />
            </button>
            <button type="button" className={panActive ? "active" : ""} onClick={() => setTool("pan")} title={t("mask.pan")}>
              <Hand size={13} />
            </button>
            <button type="button" onClick={fillPenPath} disabled={!canFillPenPath} title="Fill path (Cmd/Ctrl + Enter)">
              <PaintBucket size={13} />
            </button>
          </div>
        </div>

        <div className="maskFooter">
          <button type="button" className="downloadButton maskCancel" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="maskSave" onClick={handleSave} disabled={saving || !ready}>
            {saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
            <span>{t("mask.save")}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
