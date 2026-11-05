import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import {
  applyColorAdjustmentsToCanvas,
  applyImageAdjustments,
  canvasToPreviewDataUrl,
  clamp,
  cloneDefaultAdjustments,
  computeHistogram,
  adjustmentsMatchPreset,
  drawCurvesCanvas,
  drawHistogram,
  findActivePresetId,
  getAdjustmentGeometryKey,
  getCurveSampleFromPixel,
  getDominantHslChannelId,
  isAdjustmentsDefault,
  loadImage,
  mergePresetAdjustments,
  PRESETS,
  PREVIEW_INTERACTIVE_MAX_EDGE,
  PREVIEW_MAX_EDGE,
  sampleCanvasPixel,
  upsertCurvePoint
} from "../lib/imageAdjustments";
import {
  buildPersistedColorState,
  normalizePersistedColorState
} from "../lib/colorAdjustPersistence";
import {
  applyHealingStrokes,
  DEFAULT_HEALING_BRUSH_SIZE,
  snapshotColorAdjustState
} from "../lib/healingBrush";
import { useColorPresetLibrary } from "../features/color-adjust/useColorPresetLibrary.js";
import { useFilmPresets } from "../lib/filmPresetStore.js";
import { usePresetHoverPreview } from "../features/color-adjust/PresetPicker.jsx";
import { canvasToBlob, renderAdjustedCanvas } from "../lib/adjustedRender.js";

// Once adjustments rest this long (and the CPU is idle) the full-resolution
// result replaces the reduced preview.
const IDLE_FULL_RENDER_DELAY_MS = 600;
import { useColorExtras } from "../features/color-adjust/useColorExtras.js";

export function useColorAdjustments({
  source,
  onPreviewChange,
  persistKey = null,
  persistedState = null,
  onPersist = null
}) {
  const { t } = useI18n();
  const onPreviewChangeRef = useRef(onPreviewChange);
  const onPersistRef = useRef(onPersist);
  const persistedStateRef = useRef(persistedState);
  const persistTimerRef = useRef(null);
  const skipPersistRef = useRef(true);

  useEffect(() => {
    persistedStateRef.current = persistedState;
  }, [persistedState]);
  const imageRef = useRef(null);
  const adjustmentsRef = useRef(cloneDefaultAdjustments());
  const previewCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const curvesCanvasRef = useRef(null);
  const histogramDragRef = useRef(null);
  const draggingCurvePointRef = useRef(null);
  const rafRef = useRef(null);
  const healingStrokesRef = useRef([]);
  const activeHealingStrokeRef = useRef(null);
  // Alt+click source point (normalized), like Photoshop's healing brush.
  const healingSourceRef = useRef(null);
  const healingActiveRef = useRef(false);
  const healingBrushSizeRef = useRef(DEFAULT_HEALING_BRUSH_SIZE);
  const healingPointerIdRef = useRef(null);
  const previewMetaRef = useRef({ width: 0, height: 0, scale: 1 });
  const lastHoverImageRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const sourceCacheKeyRef = useRef("");
  const sourceMetaRef = useRef({ width: 0, height: 0, scale: 1 });
  const isSliderDraggingRef = useRef(false);
  const previewUrlFrameRef = useRef(0);

  const [adjustments, setAdjustmentsState] = useState(() => cloneDefaultAdjustments());
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [hoveredZone, setHoveredZone] = useState(null);
  const [openSections, setOpenSections] = useState({ basic: true, presets: false });
  const [activeColorTab, setActiveColorTab] = useState("reds");
  const [activeCurveChannel, setActiveCurveChannel] = useState("rgb");
  const [selectedCurvePointIndex, setSelectedCurvePointIndex] = useState(null);
  const [healingActive, setHealingActive] = useState(false);
  const [healingStrokes, setHealingStrokes] = useState([]);
  const [healingBrushSize, setHealingBrushSize] = useState(DEFAULT_HEALING_BRUSH_SIZE);
  const [healingCursor, setHealingCursor] = useState(null);
  const [healingBrushDiameter, setHealingBrushDiameter] = useState(DEFAULT_HEALING_BRUSH_SIZE);
  const [colorPickTarget, setColorPickTarget] = useState(null);
  const [colorPickCursor, setColorPickCursor] = useState(null);
  const [spaceToolSuspended, setSpaceToolSuspended] = useState(false);
  const colorPickTargetRef = useRef(null);
  const spaceToolSuspendedRef = useRef(false);
  const activeCurveChannelRef = useRef(activeCurveChannel);
  const presetLibrary = useColorPresetLibrary(adjustments);

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useEffect(() => {
    onPersistRef.current = onPersist;
  }, [onPersist]);

  useEffect(() => {
    healingActiveRef.current = healingActive;
  }, [healingActive]);

  useEffect(() => {
    healingStrokesRef.current = healingStrokes;
  }, [healingStrokes]);

  useEffect(() => {
    healingBrushSizeRef.current = healingBrushSize;
  }, [healingBrushSize]);

  useEffect(() => {
    colorPickTargetRef.current = colorPickTarget;
    if (!colorPickTarget) setColorPickCursor(null);
  }, [colorPickTarget]);

  useEffect(() => {
    if (!healingActive && !colorPickTarget) {
      spaceToolSuspendedRef.current = false;
      setSpaceToolSuspended(false);
    }
  }, [healingActive, colorPickTarget]);

  useEffect(() => {
    activeCurveChannelRef.current = activeCurveChannel;
  }, [activeCurveChannel]);

  useEffect(() => {
    if (!healingActive) {
      setHealingCursor(null);
    }
  }, [healingActive]);

  useEffect(() => {
    adjustmentsRef.current = adjustments;
  }, [adjustments]);

  // Preset hovered in the picker: rendered instead of the real adjustments, never saved.
  const hoverPreviewRef = useRef(null);

  // Full-resolution result of the current state, rendered in the background.
  const renderVersionRef = useRef(0);
  const fullRenderRef = useRef(null);
  const fullRenderJobRef = useRef(null);
  const idleRenderRef = useRef({ timer: null, idle: null });

  useEffect(() => {
    renderVersionRef.current += 1;
  }, [adjustments, healingStrokes, source]);

  const cancelIdleRender = useCallback(() => {
    const pending = idleRenderRef.current;
    clearTimeout(pending.timer);
    if (pending.idle !== null && typeof cancelIdleCallback === "function") cancelIdleCallback(pending.idle);
    idleRenderRef.current = { timer: null, idle: null };
  }, []);

  const dropFullRender = useCallback(() => {
    if (fullRenderRef.current?.url) URL.revokeObjectURL(fullRenderRef.current.url);
    fullRenderRef.current = null;
  }, []);

  // Full-resolution canvas of the current state (cached while the state is unchanged).
  const renderCurrentResult = useCallback(async () => {
    const image = imageRef.current;
    if (!image) throw new Error(t("editor.renderError"));
    const version = renderVersionRef.current;
    if (fullRenderRef.current?.version === version) return fullRenderRef.current.canvas;
    if (fullRenderJobRef.current?.version === version) return fullRenderJobRef.current.promise;
    const promise = (async () => {
      const canvas = await renderAdjustedCanvas(image, {
        adjustments: adjustmentsRef.current,
        healingStrokes: healingStrokesRef.current
      });
      if (renderVersionRef.current === version && imageRef.current === image) {
        const blob = await canvasToBlob(canvas, "image/jpeg");
        if (renderVersionRef.current === version && imageRef.current === image) {
          dropFullRender();
          fullRenderRef.current = { version, canvas, url: URL.createObjectURL(blob) };
        }
      }
      return canvas;
    })();
    fullRenderJobRef.current = { version, promise };
    try {
      return await promise;
    } finally {
      if (fullRenderJobRef.current?.promise === promise) fullRenderJobRef.current = null;
    }
  }, [dropFullRender, t]);

  const scheduleIdleRender = useCallback(() => {
    cancelIdleRender();
    const version = renderVersionRef.current;
    if (fullRenderRef.current?.version === version) return;
    const start = () => {
      idleRenderRef.current = { timer: null, idle: null };
      if (renderVersionRef.current !== version || hoverPreviewRef.current) return;
      renderCurrentResult()
        .then(() => {
          const full = fullRenderRef.current;
          if (full?.version === renderVersionRef.current && !hoverPreviewRef.current) {
            onPreviewChangeRef.current?.(full.url);
          }
        })
        .catch(() => {});
    };
    const timer = setTimeout(() => {
      const idle = typeof requestIdleCallback === "function"
        ? requestIdleCallback(start, { timeout: 2000 })
        : (setTimeout(start, 0), null);
      idleRenderRef.current = { timer: null, idle };
    }, IDLE_FULL_RENDER_DELAY_MS);
    idleRenderRef.current = { timer, idle: null };
  }, [cancelIdleRender, renderCurrentResult]);

  useEffect(() => () => {
    cancelIdleRender();
    dropFullRender();
  }, [cancelIdleRender, dropFullRender, source]);

  const setAdjustments = useCallback((updater) => {
    setAdjustmentsState(current => {
      const next = typeof updater === "function" ? updater(current) : updater;
      adjustmentsRef.current = next;
      return next;
    });
  }, []);

  const setHealingStrokesSync = useCallback((nextStrokes) => {
    healingStrokesRef.current = nextStrokes;
    setHealingStrokes(nextStrokes);
  }, []);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;

  const commitHistory = useCallback((nextAdjustments, nextHealingStrokes) => {
    const entry = snapshotColorAdjustState(nextAdjustments, nextHealingStrokes);
    setHistory(current => {
      const trimmed = current.slice(0, historyIndex + 1);
      trimmed.push(entry);
      return trimmed.slice(-80);
    });
    setHistoryIndex(index => Math.min(index + 1, 79));
  }, [historyIndex]);

  const restoreHistoryEntry = useCallback((entry) => {
    setAdjustments(entry.adjustments);
    setHealingStrokesSync(entry.healingStrokes);
    activeHealingStrokeRef.current = null;
    healingPointerIdRef.current = null;
    setSelectedCurvePointIndex(null);
    setHoveredZone(null);
  }, [setAdjustments, setHealingStrokesSync]);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    restoreHistoryEntry(history[nextIndex]);
  }, [canUndo, history, historyIndex, restoreHistoryEntry]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    restoreHistoryEntry(history[nextIndex]);
  }, [canRedo, history, historyIndex, restoreHistoryEntry]);

  const schedulePersist = useCallback(() => {
    if (!onPersistRef.current || !persistKey) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      onPersistRef.current?.(buildPersistedColorState(
        adjustmentsRef.current,
        healingStrokesRef.current,
        healingBrushSizeRef.current
      ));
    }, 450);
  }, [persistKey]);

  const flushPersist = useCallback(() => {
    if (!onPersistRef.current || !persistKey) return;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    onPersistRef.current(buildPersistedColorState(
      adjustmentsRef.current,
      healingStrokesRef.current,
      healingBrushSizeRef.current
    ));
  }, [persistKey]);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setError("");
    skipPersistRef.current = true;

    const loaded = normalizePersistedColorState(persistedStateRef.current);
    setAdjustments(loaded.adjustments);
    setHealingStrokesSync(loaded.healingStrokes);
    setHealingBrushSize(loaded.healingBrushSize);
    setHistory([]);
    setHistoryIndex(-1);
    setHealingActive(false);
    setHealingCursor(null);
    setHealingBrushDiameter(loaded.healingBrushSize);
    activeHealingStrokeRef.current = null;
    healingSourceRef.current = null;
    healingPointerIdRef.current = null;
    healingBrushSizeRef.current = loaded.healingBrushSize;
    previewMetaRef.current = { width: 0, height: 0, scale: 1 };
    imageRef.current = null;
    sourceCacheKeyRef.current = "";
    healedSourcesRef.current.clear();
    onPreviewChangeRef.current?.(null);

    if (!source) {
      return () => {
        cancelled = true;
      };
    }

    loadImage(source)
      .then(image => {
        if (cancelled) return;
        imageRef.current = image;
        const initial = snapshotColorAdjustState(loaded.adjustments, loaded.healingStrokes);
        setHistory([initial]);
        setHistoryIndex(0);
        setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(t("editor.loadError"));
      });

    return () => {
      cancelled = true;
      flushPersist();
    };
  }, [source, persistKey, flushPersist, setAdjustments, setHealingStrokesSync, t]);

  useEffect(() => {
    if (!isReady || !persistKey) return undefined;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return undefined;
    }
    schedulePersist();
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [adjustments, healingStrokes, healingBrushSize, isReady, persistKey, schedulePersist]);

  const ensureSourceCanvas = useCallback((image, interactive) => {
    const maxEdge = interactive ? PREVIEW_INTERACTIVE_MAX_EDGE : PREVIEW_MAX_EDGE;
    const cacheKey = getAdjustmentGeometryKey(adjustmentsRef.current, maxEdge);
    if (sourceCacheKeyRef.current === cacheKey && sourceCanvasRef.current) {
      return sourceMetaRef.current;
    }

    if (!sourceCanvasRef.current) sourceCanvasRef.current = document.createElement("canvas");
    const meta = applyImageAdjustments(image, adjustmentsRef.current, sourceCanvasRef.current, {
      maxEdge,
      skipColorPipeline: true,
      skipBlur: true
    });
    if (!meta) return null;
    sourceCacheKeyRef.current = cacheKey;
    sourceMetaRef.current = meta;
    return meta;
  }, []);

  // Healing works on the source pixels, under the colour adjustments. The healed
  // source is cached per preview size and extended stroke by stroke, so colour
  // changes never re-run healing and a new stroke only heals itself.
  const healedSourcesRef = useRef(new Map());
  const getHealedSource = useCallback((sourceMeta) => {
    const strokes = healingStrokesRef.current;
    if (!strokes.length) return sourceCanvasRef.current;
    const key = sourceCacheKeyRef.current;
    const cache = healedSourcesRef.current;
    let entry = cache.get(key);
    const extendsCached = entry
      && entry.source === sourceCanvasRef.current
      && entry.strokes.length <= strokes.length
      && entry.strokes.every((stroke, index) => stroke === strokes[index]);
    if (!extendsCached) {
      const canvas = entry?.canvas || document.createElement("canvas");
      canvas.width = sourceCanvasRef.current.width;
      canvas.height = sourceCanvasRef.current.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sourceCanvasRef.current, 0, 0);
      entry = { canvas, source: sourceCanvasRef.current, strokes: [] };
      cache.delete(key);
      cache.set(key, entry);
      while (cache.size > 2) cache.delete(cache.keys().next().value);
    }
    const added = strokes.slice(entry.strokes.length);
    if (added.length) {
      applyHealingStrokes(entry.canvas.getContext("2d", { willReadFrequently: true }), added, sourceMeta.scale);
      entry.strokes = strokes.slice();
    }
    return entry.canvas;
  }, []);

  // Live healing stroke drawn as an SVG over the preview (no re-render while painting).
  const healingOverlayElRef = useRef(null);
  const drawHealingStrokeOverlay = useCallback(() => {
    const el = healingOverlayElRef.current;
    if (!el) return;
    const stroke = activeHealingStrokeRef.current;
    const meta = previewMetaRef.current;
    const path = el.querySelector("path");
    if (!stroke?.points?.length || !meta?.width || !path) {
      el.style.display = "none";
      path?.setAttribute("d", "");
      return;
    }
    const fullWidth = meta.width / (meta.scale || 1);
    const fullHeight = meta.height / (meta.scale || 1);
    el.setAttribute("viewBox", `0 0 ${fullWidth} ${fullHeight}`);
    if (stroke?.points?.length) {
      const d = stroke.points
        .map((point, index) => `${index ? "L" : "M"}${(point.x * fullWidth).toFixed(1)} ${(point.y * fullHeight).toFixed(1)}`)
        .join(" ");
      path.setAttribute("d", stroke.points.length === 1 ? `${d} l0.01 0.01` : d);
      path.setAttribute("stroke-width", String(Math.max(2, stroke.size)));
    } else {
      path.setAttribute("d", "");
    }
    el.style.display = "";
  }, []);
  const setHealingOverlayElement = useCallback((el) => {
    healingOverlayElRef.current = el;
    if (el) drawHealingStrokeOverlay();
  }, [drawHealingStrokeOverlay]);

  const renderPreview = useCallback((options = {}) => {
    const image = imageRef.current;
    if (!image) return;

    const interactive = options.interactive ?? isSliderDraggingRef.current;
    const sourceMeta = ensureSourceCanvas(image, interactive);
    if (!sourceMeta || !sourceCanvasRef.current) return;
    const baseCanvas = getHealedSource(sourceMeta);

    if (!previewCanvasRef.current) previewCanvasRef.current = document.createElement("canvas");
    const canvas = previewCanvasRef.current;
    const shown = hoverPreviewRef.current || adjustmentsRef.current;
    const meta = applyColorAdjustmentsToCanvas(
      baseCanvas,
      canvas,
      shown,
      { scale: sourceMeta.scale, interactive, skipBlur: interactive }
    );
    if (!meta) return;
    previewMetaRef.current = meta;
    const outputCanvas = canvas;
    if (!activeHealingStrokeRef.current) drawHealingStrokeOverlay();

    if (!interactive) {
      const histData = computeHistogram(canvas);
      if (histogramCanvasRef.current && histData) {
        drawHistogram(histogramCanvasRef.current, histData);
      }
      if (curvesCanvasRef.current && histData && adjustmentsRef.current.curves) {
        drawCurvesCanvas(
          curvesCanvasRef.current,
          adjustmentsRef.current.curves[activeCurveChannel],
          activeCurveChannel,
          selectedCurvePointIndex,
          histData
        );
      }
    }

    const hasPreviewChanges = !isAdjustmentsDefault(shown)
      || healingStrokesRef.current.length > 0
      || Boolean(activeHealingStrokeRef.current);
    if (!hasPreviewChanges) {
      cancelIdleRender();
      onPreviewChangeRef.current?.(null);
      return;
    }

    const settled = !interactive && !hoverPreviewRef.current && !activeHealingStrokeRef.current;
    const full = fullRenderRef.current;
    if (settled && full?.version === renderVersionRef.current) {
      onPreviewChangeRef.current?.(full.url);
      return;
    }
    // The reduced preview is already full size for small images.
    if (settled && meta.scale < 1) scheduleIdleRender();
    else if (!settled) cancelIdleRender();

    previewUrlFrameRef.current += 1;
    if (!interactive || options.forceEmit || previewUrlFrameRef.current % 2 === 0) {
      onPreviewChangeRef.current?.(canvasToPreviewDataUrl(outputCanvas, { interactive }));
    }
  }, [activeCurveChannel, cancelIdleRender, drawHealingStrokeOverlay, ensureSourceCanvas, getHealedSource, scheduleIdleRender, selectedCurvePointIndex]);

  useEffect(() => {
    if (!isReady) return undefined;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isReady, adjustments, healingStrokes, healingActive, renderPreview]);

  useEffect(() => {
    if (!openSections.curves || !curvesCanvasRef.current || !previewCanvasRef.current) return;
    const histData = computeHistogram(previewCanvasRef.current);
    if (!histData || !adjustments.curves) return;
    drawCurvesCanvas(
      curvesCanvasRef.current,
      adjustments.curves[activeCurveChannel],
      activeCurveChannel,
      selectedCurvePointIndex,
      histData
    );
  }, [openSections.curves, adjustments.curves, activeCurveChannel, selectedCurvePointIndex]);

  useEffect(() => {
    if (selectedCurvePointIndex === null) return;
    const points = adjustments.curves?.[activeCurveChannel];
    if (!points || selectedCurvePointIndex < 0 || selectedCurvePointIndex >= points.length) {
      setSelectedCurvePointIndex(null);
    }
  }, [adjustments.curves, activeCurveChannel, selectedCurvePointIndex]);

  const updateAdjustment = useCallback((key, value) => {
    setAdjustments(current => ({ ...current, [key]: value }));
  }, [setAdjustments]);

  const updateHsl = useCallback((channel, key, value) => {
    setAdjustments(current => ({
      ...current,
      hsl: {
        ...current.hsl,
        [channel]: {
          ...current.hsl[channel],
          [key]: value
        }
      }
    }));
  }, [setAdjustments]);

  const filmPresets = useFilmPresets();
  const allPresets = useMemo(
    () => [...PRESETS, ...filmPresets.presets, ...presetLibrary.customPresets],
    [filmPresets.presets, presetLibrary.customPresets]
  );
  const commitAdjustments = useCallback((next) => {
    setAdjustments(next);
    commitHistory(next, healingStrokesRef.current);
  }, [commitHistory, setAdjustments]);
  const scheduleFinalRender = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => renderPreview({ interactive: false }));
  }, [renderPreview]);
  const colorExtras = useColorExtras({
    adjustments,
    setAdjustments,
    commitAdjustments,
    allPresets,
    onLutLoaded: scheduleFinalRender
  });
  const { trackPresetApplied } = colorExtras;

  const applyPreset = useCallback((preset) => {
    const next = mergePresetAdjustments(adjustmentsRef.current, preset.adjustments);
    setAdjustments(next);
    setSelectedCurvePointIndex(null);
    commitHistory(next, healingStrokesRef.current);
    trackPresetApplied(preset);
  }, [commitHistory, setAdjustments, trackPresetApplied]);

  const previewPreset = usePresetHoverPreview({
    buildPreview: useCallback(preset => mergePresetAdjustments(adjustmentsRef.current, preset.adjustments), []),
    setPreview: useCallback(next => {
      hoverPreviewRef.current = next;
    }, []),
    render: renderPreview
  });

  const resetAdjustments = useCallback(() => {
    const nextAdjustments = cloneDefaultAdjustments();
    setAdjustments(nextAdjustments);
    setHealingStrokesSync([]);
    activeHealingStrokeRef.current = null;
    healingPointerIdRef.current = null;
    setActiveCurveChannel("rgb");
    setSelectedCurvePointIndex(null);
    setActiveColorTab("reds");
    setColorPickTarget(null);
    setHealingActive(false);
    setHoveredZone(null);
    commitHistory(nextAdjustments, []);
    skipPersistRef.current = false;
    flushPersist();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
  }, [commitHistory, flushPersist, renderPreview, setAdjustments, setHealingStrokesSync]);

  const toggleHealingActive = useCallback(() => {
    setColorPickTarget(null);
    setHealingActive(current => !current);
  }, []);

  const toggleColorPickTarget = useCallback((target) => {
    setHealingActive(false);
    setColorPickTarget(current => (current === target ? null : target));
    setColorPickCursor(null);
  }, []);

  const updateColorPickCursor = useCallback((event, previewArea) => {
    if (spaceToolSuspendedRef.current || !colorPickTargetRef.current || !previewArea) return false;
    const areaRect = previewArea.getBoundingClientRect();
    setColorPickCursor({
      x: event.clientX - areaRect.left,
      y: event.clientY - areaRect.top
    });
    return true;
  }, []);

  const clearColorPickCursor = useCallback(() => {
    setColorPickCursor(null);
  }, []);

  const handleColorPickPointerMove = useCallback((event, _imageElement, previewArea) => {
    if (spaceToolSuspendedRef.current || !colorPickTargetRef.current) return false;
    return updateColorPickCursor(event, previewArea);
  }, [updateColorPickCursor]);

  const updateHealingBrushSize = useCallback((size) => {
    const next = clamp(Number(size), 1, 180);
    healingBrushSizeRef.current = next;
    setHealingBrushSize(next);
    if (lastHoverImageRef.current) {
      const rect = lastHoverImageRef.current.getBoundingClientRect();
      const meta = previewMetaRef.current;
      const canvasWidth = meta?.width || lastHoverImageRef.current.naturalWidth || rect.width || 1;
      const displayScale = rect.width / canvasWidth;
      setHealingBrushDiameter(next * (meta?.scale ?? 1) * displayScale);
    }
  }, []);

  const computeHealingBrushDiameter = useCallback((imageElement) => {
    if (!imageElement) return healingBrushSizeRef.current;
    const rect = imageElement.getBoundingClientRect();
    const meta = previewMetaRef.current;
    const canvasWidth = meta?.width || imageElement.naturalWidth || rect.width || 1;
    const displayScale = rect.width / canvasWidth;
    return healingBrushSizeRef.current * (meta?.scale ?? 1) * displayScale;
  }, []);

  const updateHealingCursor = useCallback((event, imageElement, previewArea) => {
    if (spaceToolSuspendedRef.current || !healingActiveRef.current || !previewArea) {
      setHealingCursor(null);
      return false;
    }
    const areaRect = previewArea.getBoundingClientRect();
    lastHoverImageRef.current = imageElement;
    const diameter = computeHealingBrushDiameter(imageElement);
    // Clone-source preview inside the brush (Photoshop): the area the next dab copies —
    // the Alt+clicked point, or brush position + offset while painting.
    let sample = null;
    const source = healingSourceRef.current;
    const stroke = activeHealingStrokeRef.current;
    const rect = imageElement?.getBoundingClientRect();
    if (source && rect?.width && !event.altKey) {
      const lastPoint = stroke?.points?.[stroke.points.length - 1];
      const center = stroke?.source && lastPoint ? { x: lastPoint.x + stroke.source.dx, y: lastPoint.y + stroke.source.dy } : source;
      sample = {
        url: imageElement.currentSrc || imageElement.src,
        width: rect.width,
        height: rect.height,
        x: diameter / 2 - center.x * rect.width,
        y: diameter / 2 - center.y * rect.height
      };
    }
    // Thin "+" where the brush samples while painting — screen-space, so its size
    // does not change with the preview zoom.
    const last = stroke?.points?.[stroke.points.length - 1];
    const samplePoint = stroke?.source && last && rect?.width
      ? {
        x: rect.left - areaRect.left + (last.x + stroke.source.dx) * rect.width,
        y: rect.top - areaRect.top + (last.y + stroke.source.dy) * rect.height
      }
      : null;
    setHealingCursor({
      x: event.clientX - areaRect.left,
      y: event.clientY - areaRect.top,
      alt: Boolean(event.altKey),
      sample,
      samplePoint
    });
    setHealingBrushDiameter(diameter);
    return true;
  }, [computeHealingBrushDiameter]);

  useEffect(() => {
    if (!healingActive) return undefined;
    const onKey = event => {
      if (event.key !== "Alt") return;
      const alt = event.type === "keydown";
      setHealingCursor(current => (current && current.alt !== alt ? { ...current, alt } : current));
      if (alt) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [healingActive]);

  const clearHealingCursor = useCallback(() => {
    lastHoverImageRef.current = null;
    setHealingCursor(null);
  }, []);

  const getHealingImagePoint = useCallback((event, imageElement) => {
    if (!imageElement) return null;
    const rect = imageElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }, []);

  const handleColorPickPointerDown = useCallback((event, imageElement) => {
    if (spaceToolSuspendedRef.current) return false;
    const target = colorPickTargetRef.current;
    if (!target || !isReady || event.button !== 0 || !imageElement) return false;

    const canvas = previewCanvasRef.current;
    const meta = previewMetaRef.current;
    if (!canvas || !meta?.width) return false;

    const rect = imageElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const px = clamp(Math.round(((event.clientX - rect.left) / rect.width) * meta.width), 0, meta.width - 1);
    const py = clamp(Math.round(((event.clientY - rect.top) / rect.height) * meta.height), 0, meta.height - 1);
    const pixel = sampleCanvasPixel(canvas, px, py);
    if (!pixel) return false;

    event.preventDefault();
    event.stopPropagation();

    if (target === "hsl") {
      setActiveColorTab(getDominantHslChannelId(pixel.r, pixel.g, pixel.b));
      setOpenSections(current => ({ ...current, hsl: true }));
      setColorPickTarget(null);
      setColorPickCursor(null);
      return true;
    }

    if (target === "curves") {
      const channel = activeCurveChannelRef.current;
      const sample = getCurveSampleFromPixel(pixel.r, pixel.g, pixel.b, channel);
      const points = adjustmentsRef.current.curves?.[channel];
      if (!points) return false;
      const { points: nextPoints, selectedIndex } = upsertCurvePoint(points, sample);
      setAdjustments(current => {
        const next = {
          ...current,
          curves: {
            ...current.curves,
            [channel]: nextPoints
          }
        };
        commitHistory(next, healingStrokesRef.current);
        return next;
      });
      setSelectedCurvePointIndex(selectedIndex);
      setOpenSections(current => ({ ...current, curves: true }));
      setColorPickTarget(null);
      setColorPickCursor(null);
      return true;
    }

    return false;
  }, [commitHistory, isReady, setAdjustments]);

  const handleHealingPointerDown = useCallback((event, imageElement) => {
    if (spaceToolSuspendedRef.current || !healingActiveRef.current || !isReady || event.button !== 0 || !imageElement) return false;
    const point = getHealingImagePoint(event, imageElement);
    if (!point) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.altKey) {
      // Alt+click: pick the area to copy from (next strokes sample relative to it).
      healingSourceRef.current = point;
      return true;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    healingPointerIdRef.current = event.pointerId;
    const source = healingSourceRef.current;
    activeHealingStrokeRef.current = {
      tool: "healing",
      size: healingBrushSizeRef.current,
      points: [point],
      ...(source ? { source: { dx: source.x - point.x, dy: source.y - point.y } } : {})
    };
    drawHealingStrokeOverlay();
    return true;
  }, [drawHealingStrokeOverlay, getHealingImagePoint, isReady]);

  const handleHealingPointerHover = useCallback((event, imageElement, previewArea) => {
    if (spaceToolSuspendedRef.current || !healingActiveRef.current || healingPointerIdRef.current) return false;
    return updateHealingCursor(event, imageElement, previewArea);
  }, [updateHealingCursor]);

  const handleHealingPointerMove = useCallback((event, imageElement, previewArea) => {
    if (spaceToolSuspendedRef.current || !healingActiveRef.current || !imageElement) return false;
    if (healingPointerIdRef.current === event.pointerId) {
      const point = getHealingImagePoint(event, imageElement);
      if (!point || !activeHealingStrokeRef.current) return false;
      event.preventDefault();
      activeHealingStrokeRef.current.points.push(point);
      if (previewArea) updateHealingCursor(event, imageElement, previewArea);
      drawHealingStrokeOverlay();
      return true;
    }
    if (!healingPointerIdRef.current && previewArea) {
      return updateHealingCursor(event, imageElement, previewArea);
    }
    return false;
  }, [drawHealingStrokeOverlay, getHealingImagePoint, updateHealingCursor]);

  const handleHealingPointerUp = useCallback((event) => {
    if (healingPointerIdRef.current !== event.pointerId) return false;
    const finished = activeHealingStrokeRef.current;
    activeHealingStrokeRef.current = null;
    healingPointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (finished?.points?.length) {
      const nextStrokes = healingStrokesRef.current.concat(finished);
      setHealingStrokesSync(nextStrokes);
      commitHistory(adjustmentsRef.current, nextStrokes);
    } else if (finished) {
      drawHealingStrokeOverlay();
    }
    return Boolean(finished);
  }, [commitHistory, drawHealingStrokeOverlay, setHealingStrokesSync]);

  const finishActiveHealingStroke = useCallback(() => {
    if (!healingPointerIdRef.current) return;
    const finished = activeHealingStrokeRef.current;
    activeHealingStrokeRef.current = null;
    healingPointerIdRef.current = null;
    if (finished?.points?.length) {
      const nextStrokes = healingStrokesRef.current.concat(finished);
      setHealingStrokesSync(nextStrokes);
      commitHistory(adjustmentsRef.current, nextStrokes);
    } else if (finished) {
      drawHealingStrokeOverlay();
    }
  }, [commitHistory, drawHealingStrokeOverlay, setHealingStrokesSync]);

  const suspendToolsForSpace = useCallback(() => {
    if (!healingActiveRef.current && !colorPickTargetRef.current) return false;
    spaceToolSuspendedRef.current = true;
    setSpaceToolSuspended(true);
    setHealingCursor(null);
    setColorPickCursor(null);
    finishActiveHealingStroke();
    return true;
  }, [finishActiveHealingStroke]);

  const resumeToolsAfterSpace = useCallback(() => {
    if (!spaceToolSuspendedRef.current) return;
    spaceToolSuspendedRef.current = false;
    setSpaceToolSuspended(false);
  }, []);

  const toggleSection = useCallback((id) => {
    setOpenSections(current => {
      const isOpen = !current[id];
      return { [id]: isOpen };
    });
  }, []);

  const beginSliderDrag = useCallback(() => {
    isSliderDraggingRef.current = true;
    previewUrlFrameRef.current = 0;
    sourceCacheKeyRef.current = "";
  }, []);

  const endSliderDrag = useCallback(() => {
    isSliderDraggingRef.current = false;
    sourceCacheKeyRef.current = "";
    previewUrlFrameRef.current = 0;
  }, []);

  const commitCurrent = useCallback(() => {
    endSliderDrag();
    commitHistory(adjustmentsRef.current, healingStrokesRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => renderPreview({ interactive: false }));
  }, [commitHistory, endSliderDrag, renderPreview]);

  const isPresetActive = useCallback((preset) => {
    if (!preset?.adjustments) return false;
    return adjustmentsMatchPreset(adjustments, preset.adjustments);
  }, [adjustments]);

  function getHistogramZone(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    if (x < 0.2) return { zone: "blacks", x };
    if (x < 0.4) return { zone: "shadows", x };
    if (x < 0.6) return { zone: "luminance", x };
    if (x < 0.8) return { zone: "highlights", x };
    return { zone: "whites", x };
  }

  const handleHistogramPointerDown = useCallback((event) => {
    event.preventDefault();
    beginSliderDrag();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { zone } = getHistogramZone(event);
    histogramDragRef.current = {
      zone,
      startX: event.clientX,
      startValue: adjustmentsRef.current[zone] || 0
    };
  }, [beginSliderDrag]);

  const handleHistogramPointerMove = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const { zone } = getHistogramZone(event);

    if (histogramDragRef.current) {
      const drag = histogramDragRef.current;
      const deltaX = event.clientX - drag.startX;
      const deltaValue = Math.round((deltaX / rect.width) * 150);
      const nextValue = clamp(drag.startValue + deltaValue, -100, 100);
      updateAdjustment(drag.zone, nextValue);
    } else {
      setHoveredZone(zone);
    }
  }, [updateAdjustment]);

  const handleHistogramPointerUp = useCallback((event) => {
    if (histogramDragRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      histogramDragRef.current = null;
      commitCurrent();
    }
  }, [commitCurrent]);

  const handleHistogramPointerLeave = useCallback(() => {
    if (!histogramDragRef.current) setHoveredZone(null);
  }, []);

  const handleCurvesPointerDown = useCallback((e) => {
    const canvas = curvesCanvasRef.current;
    if (!canvas || !adjustments.curves) return;
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

    if (closestIdx !== -1) {
      beginSliderDrag();
      setSelectedCurvePointIndex(closestIdx);
      draggingCurvePointRef.current = { index: closestIdx };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
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
        setAdjustments(current => ({
          ...current,
          curves: {
            ...current.curves,
            [activeCurveChannel]: nextPoints
          }
        }));
        setSelectedCurvePointIndex(insertIdx);
        beginSliderDrag();
        draggingCurvePointRef.current = { index: insertIdx };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    }
  }, [adjustments.curves, activeCurveChannel, beginSliderDrag, setAdjustments]);

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
      if (i !== idx) return pt;
      let newX = x;
      if (idx === 0) newX = clamp(x, 0, points[1].x - 2);
      else if (idx === points.length - 1) newX = clamp(x, points[points.length - 2].x + 2, 255);
      else newX = clamp(x, points[idx - 1].x + 2, points[idx + 1].x - 2);
      return { x: newX, y: clamp(y, 0, 255) };
    });

    setAdjustments(current => ({
      ...current,
      curves: {
        ...current.curves,
        [activeCurveChannel]: nextPoints
      }
    }));
  }, [adjustments.curves, activeCurveChannel, setAdjustments]);

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
  }, [activeCurveChannel, adjustments.curves, commitCurrent, setAdjustments]);

  const renderFullResolutionDataUrl = useCallback(() => {
    const image = imageRef.current;
    if (!image) throw new Error(t("editor.renderError"));
    const canvas = document.createElement("canvas");
    const meta = applyImageAdjustments(image, adjustmentsRef.current, canvas, {
      fullResolution: true,
      onAfterDraw: (ctx, scale) => applyHealingStrokes(ctx, healingStrokesRef.current, scale)
    });
    if (!meta) throw new Error(t("editor.renderError"));
    return canvas.toDataURL("image/png");
  }, [t]);

  const hsl = adjustments.hsl[activeColorTab];
  const activePresetId = useMemo(
    () => findActivePresetId(adjustments, allPresets) || colorExtras.amountPresetId,
    [adjustments, allPresets, colorExtras.amountPresetId]
  );

  return {
    adjustments,
    hsl,
    activePresetId,
    allPresets,
    filmPresets,
    previewPreset,
    isReady,
    error,
    hoveredZone,
    openSections,
    activeColorTab,
    activeCurveChannel,
    selectedCurvePointIndex,
    ...presetLibrary,
    colorExtras,
    histogramCanvasRef,
    curvesCanvasRef,
    updateAdjustment,
    updateHsl,
    applyPreset,
    resetAdjustments,
    toggleSection,
    beginSliderDrag,
    commitCurrent,
    isPresetActive,
    setActiveColorTab,
    setActiveCurveChannel,
    setSelectedCurvePointIndex,
    setAdjustments,
    handleHistogramPointerDown,
    handleHistogramPointerMove,
    handleHistogramPointerUp,
    handleHistogramPointerLeave,
    handleCurvesPointerDown,
    handleCurvesPointerMove,
    handleCurvesPointerUp,
    handleCurvesDoubleClick,
    renderFullResolutionDataUrl,
    renderCurrentResult,
    setHealingOverlayElement,
    colorPickTarget,
    colorPickCursor,
    spaceToolSuspended,
    suspendToolsForSpace,
    resumeToolsAfterSpace,
    toggleColorPickTarget,
    handleColorPickPointerDown,
    handleColorPickPointerMove,
    clearColorPickCursor,
    healingActive,
    healingBrushSize,
    healingCursor,
    healingBrushDiameter,
    toggleHealingActive,
    setHealingActive,
    updateHealingBrushSize,
    handleHealingPointerDown,
    handleHealingPointerHover,
    handleHealingPointerMove,
    handleHealingPointerUp,
    clearHealingCursor,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    getPersistedState: () => buildPersistedColorState(
      adjustmentsRef.current,
      healingStrokesRef.current,
      healingBrushSizeRef.current
    ),
    flushPersist
  };
}
