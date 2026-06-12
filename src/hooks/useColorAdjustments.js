import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import {
  applyImageAdjustments,
  clamp,
  cloneDefaultAdjustments,
  computeHistogram,
  DEFAULT_CURVES,
  drawCurvesCanvas,
  drawHistogram,
  isAdjustmentsDefault,
  loadImage
} from "../lib/imageAdjustments";
import {
  buildPersistedColorState,
  normalizePersistedColorState
} from "../lib/colorAdjustPersistence";
import {
  applyHealingStrokes,
  DEFAULT_HEALING_BRUSH_SIZE,
  drawHealingOverlay,
  snapshotColorAdjustState
} from "../lib/healingBrush";

const CUSTOM_PRESETS_KEY = "image-editor-custom-presets";

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
  const healingOverlayCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const curvesCanvasRef = useRef(null);
  const histogramDragRef = useRef(null);
  const draggingCurvePointRef = useRef(null);
  const rafRef = useRef(null);
  const healingStrokesRef = useRef([]);
  const activeHealingStrokeRef = useRef(null);
  const healingActiveRef = useRef(false);
  const healingBrushSizeRef = useRef(DEFAULT_HEALING_BRUSH_SIZE);
  const healingPointerIdRef = useRef(null);
  const previewMetaRef = useRef({ width: 0, height: 0, scale: 1 });
  const lastHoverImageRef = useRef(null);

  const [adjustments, setAdjustmentsState] = useState(() => cloneDefaultAdjustments());
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [hoveredZone, setHoveredZone] = useState(null);
  const [openSections, setOpenSections] = useState({ basic: true, presets: true });
  const [activeColorTab, setActiveColorTab] = useState("reds");
  const [activeCurveChannel, setActiveCurveChannel] = useState("rgb");
  const [selectedCurvePointIndex, setSelectedCurvePointIndex] = useState(null);
  const [customPresets, setCustomPresets] = useState([]);
  const [showNewPresetForm, setShowNewPresetForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [healingActive, setHealingActive] = useState(false);
  const [healingStrokes, setHealingStrokes] = useState([]);
  const [healingBrushSize, setHealingBrushSize] = useState(DEFAULT_HEALING_BRUSH_SIZE);
  const [healingCursor, setHealingCursor] = useState(null);
  const [healingBrushDiameter, setHealingBrushDiameter] = useState(DEFAULT_HEALING_BRUSH_SIZE);

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
    if (!healingActive) {
      setHealingCursor(null);
    }
  }, [healingActive]);

  useEffect(() => {
    adjustmentsRef.current = adjustments;
  }, [adjustments]);

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

  const savePresets = useCallback((updated) => {
    setCustomPresets(updated);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to write presets to localStorage", e);
    }
    fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
            localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(data.presets));
          } catch (e) {
            console.error("Failed to write updated presets to localStorage", e);
          }
        }
      })
      .catch(e => {
        console.error("Failed to sync presets with server", e);
      });
  }, []);

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
            localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(data.presets));
          } catch (e) {
            console.error("Failed to write presets to localStorage", e);
          }
        }
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem(CUSTOM_PRESETS_KEY);
          if (saved) setCustomPresets(JSON.parse(saved));
        } catch (localError) {
          console.error("Failed to load presets from localStorage", localError);
        }
      });
  }, []);

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
    healingPointerIdRef.current = null;
    healingBrushSizeRef.current = loaded.healingBrushSize;
    previewMetaRef.current = { width: 0, height: 0, scale: 1 };
    imageRef.current = null;
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

  const renderPreview = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;

    if (!previewCanvasRef.current) previewCanvasRef.current = document.createElement("canvas");
    const canvas = previewCanvasRef.current;
    const meta = applyImageAdjustments(image, adjustmentsRef.current, canvas);
    if (!meta) return;
    previewMetaRef.current = meta;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      applyHealingStrokes(ctx, healingStrokesRef.current, meta.scale);
    }

    let outputCanvas = canvas;
    const activeStroke = activeHealingStrokeRef.current;
    if (activeStroke && ctx) {
      if (!healingOverlayCanvasRef.current) {
        healingOverlayCanvasRef.current = document.createElement("canvas");
      }
      const overlayCanvas = healingOverlayCanvasRef.current;
      overlayCanvas.width = canvas.width;
      overlayCanvas.height = canvas.height;
      const overlayCtx = overlayCanvas.getContext("2d");
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      overlayCtx.drawImage(canvas, 0, 0);
      drawHealingOverlay(overlayCtx, activeStroke, canvas.width, canvas.height, meta.scale);
      outputCanvas = overlayCanvas;
    }

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

    const hasPreviewChanges = !isAdjustmentsDefault(adjustmentsRef.current)
      || healingStrokesRef.current.length > 0
      || Boolean(activeHealingStrokeRef.current);
    onPreviewChangeRef.current?.(
      hasPreviewChanges ? outputCanvas.toDataURL("image/png") : null
    );
  }, [activeCurveChannel, selectedCurvePointIndex]);

  useEffect(() => {
    if (!isReady) return undefined;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isReady, adjustments, healingStrokes, renderPreview]);

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

  const updateAdjustment = useCallback((key, value) => {
    setAdjustments(current => ({ ...current, [key]: value }));
  }, []);

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
  }, []);

  const applyPreset = useCallback((preset) => {
    const next = {
      ...adjustmentsRef.current,
      ...preset.adjustments,
      curves: preset.adjustments.curves || DEFAULT_CURVES
    };
    setAdjustments(next);
    commitHistory(next, healingStrokesRef.current);
  }, [commitHistory, setAdjustments]);

  const resetAdjustments = useCallback(() => {
    const nextAdjustments = cloneDefaultAdjustments();
    setAdjustments(nextAdjustments);
    setHealingStrokesSync([]);
    activeHealingStrokeRef.current = null;
    setActiveCurveChannel("rgb");
    setSelectedCurvePointIndex(null);
    setActiveColorTab("reds");
    setHoveredZone(null);
    const initial = snapshotColorAdjustState(nextAdjustments, []);
    setHistory([initial]);
    setHistoryIndex(0);
    skipPersistRef.current = false;
    flushPersist();
  }, [flushPersist, setAdjustments, setHealingStrokesSync]);

  const toggleHealingActive = useCallback(() => {
    setHealingActive(current => !current);
  }, []);

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
    if (!healingActiveRef.current || !previewArea) {
      setHealingCursor(null);
      return false;
    }
    const areaRect = previewArea.getBoundingClientRect();
    lastHoverImageRef.current = imageElement;
    setHealingCursor({
      x: event.clientX - areaRect.left,
      y: event.clientY - areaRect.top
    });
    setHealingBrushDiameter(computeHealingBrushDiameter(imageElement));
    return true;
  }, [computeHealingBrushDiameter]);

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

  const handleHealingPointerDown = useCallback((event, imageElement) => {
    if (!healingActiveRef.current || !isReady || event.button !== 0 || !imageElement) return false;
    const point = getHealingImagePoint(event, imageElement);
    if (!point) return false;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    healingPointerIdRef.current = event.pointerId;
    activeHealingStrokeRef.current = {
      tool: "healing",
      size: healingBrushSizeRef.current,
      points: [point]
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
    return true;
  }, [getHealingImagePoint, isReady, renderPreview]);

  const handleHealingPointerHover = useCallback((event, imageElement, previewArea) => {
    if (!healingActiveRef.current || healingPointerIdRef.current) return false;
    return updateHealingCursor(event, imageElement, previewArea);
  }, [updateHealingCursor]);

  const handleHealingPointerMove = useCallback((event, imageElement, previewArea) => {
    if (!healingActiveRef.current || !imageElement) return false;
    if (healingPointerIdRef.current === event.pointerId) {
      const point = getHealingImagePoint(event, imageElement);
      if (!point || !activeHealingStrokeRef.current) return false;
      event.preventDefault();
      activeHealingStrokeRef.current.points.push(point);
      if (previewArea) updateHealingCursor(event, imageElement, previewArea);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(renderPreview);
      return true;
    }
    if (!healingPointerIdRef.current && previewArea) {
      return updateHealingCursor(event, imageElement, previewArea);
    }
    return false;
  }, [getHealingImagePoint, renderPreview, updateHealingCursor]);

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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(renderPreview);
    }
    return Boolean(finished);
  }, [commitHistory, renderPreview, setHealingStrokesSync]);

  const toggleSection = useCallback((id) => {
    setOpenSections(current => {
      const isOpen = !current[id];
      return { [id]: isOpen };
    });
  }, []);

  const commitCurrent = useCallback(() => {
    commitHistory(adjustmentsRef.current, healingStrokesRef.current);
  }, [commitHistory]);

  const isPresetActive = useCallback((preset) => {
    if (!preset?.adjustments) return false;
    const adj = adjustments;
    const padj = preset.adjustments;
    return Math.abs(adj.luminance - padj.luminance) < 1
      && Math.abs(adj.contrast - padj.contrast) < 1
      && Math.abs(adj.temperature - padj.temperature) < 1
      && Math.abs(adj.vibrance - padj.vibrance) < 1
      && Math.abs(adj.saturation - padj.saturation) < 1
      && adj.invert === padj.invert;
  }, [adjustments]);

  const handleCreatePreset = useCallback(() => {
    if (!newPresetName.trim()) return;
    const newPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      adjustments: JSON.parse(JSON.stringify(adjustments))
    };
    savePresets([...customPresets, newPreset]);
    setShowNewPresetForm(false);
    setNewPresetName("");
  }, [newPresetName, adjustments, customPresets, savePresets]);

  const handleDeletePreset = useCallback((id) => {
    savePresets(customPresets.filter(item => item.id !== id));
  }, [customPresets, savePresets]);

  const handleUpdatePresetSettings = useCallback((id) => {
    savePresets(customPresets.map(item => (
      item.id === id
        ? { ...item, adjustments: JSON.parse(JSON.stringify(adjustments)) }
        : item
    )));
  }, [adjustments, customPresets, savePresets]);

  const handleSaveRename = useCallback((id) => {
    if (!renameValue.trim()) return;
    savePresets(customPresets.map(item => (
      item.id === id ? { ...item, name: renameValue.trim() } : item
    )));
    setEditingPresetId(null);
  }, [renameValue, customPresets, savePresets]);

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
    event.currentTarget.setPointerCapture(event.pointerId);
    const { zone } = getHistogramZone(event);
    histogramDragRef.current = {
      zone,
      startX: event.clientX,
      startValue: adjustmentsRef.current[zone] || 0
    };
  }, []);

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
        draggingCurvePointRef.current = { index: insertIdx };
        e.currentTarget.setPointerCapture(e.pointerId);
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
    const meta = applyImageAdjustments(image, adjustmentsRef.current, canvas, { fullResolution: true });
    if (!meta) throw new Error(t("editor.renderError"));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      applyHealingStrokes(ctx, healingStrokesRef.current, meta.scale);
    }
    return canvas.toDataURL("image/png");
  }, [t]);

  const hsl = adjustments.hsl[activeColorTab];

  return {
    adjustments,
    hsl,
    isReady,
    error,
    hoveredZone,
    openSections,
    activeColorTab,
    activeCurveChannel,
    selectedCurvePointIndex,
    customPresets,
    showNewPresetForm,
    newPresetName,
    editingPresetId,
    renameValue,
    histogramCanvasRef,
    curvesCanvasRef,
    updateAdjustment,
    updateHsl,
    applyPreset,
    resetAdjustments,
    toggleSection,
    commitCurrent,
    isPresetActive,
    handleCreatePreset,
    handleDeletePreset,
    handleUpdatePresetSettings,
    handleSaveRename,
    setShowNewPresetForm,
    setNewPresetName,
    setEditingPresetId,
    setRenameValue,
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
