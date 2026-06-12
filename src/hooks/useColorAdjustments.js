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

const CUSTOM_PRESETS_KEY = "image-editor-custom-presets";

export function useColorAdjustments({ source, onPreviewChange }) {
  const { t } = useI18n();
  const onPreviewChangeRef = useRef(onPreviewChange);
  const imageRef = useRef(null);
  const adjustmentsRef = useRef(cloneDefaultAdjustments());
  const previewCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const curvesCanvasRef = useRef(null);
  const histogramDragRef = useRef(null);
  const draggingCurvePointRef = useRef(null);
  const rafRef = useRef(null);

  const [adjustments, setAdjustments] = useState(() => cloneDefaultAdjustments());
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

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useEffect(() => {
    adjustmentsRef.current = adjustments;
  }, [adjustments]);

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

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setError("");
    setAdjustments(cloneDefaultAdjustments());
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
        setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(t("editor.loadError"));
      });

    return () => {
      cancelled = true;
    };
  }, [source, t]);

  const renderPreview = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;

    if (!previewCanvasRef.current) previewCanvasRef.current = document.createElement("canvas");
    const canvas = previewCanvasRef.current;
    const meta = applyImageAdjustments(image, adjustmentsRef.current, canvas);
    if (!meta) return;

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

    onPreviewChangeRef.current?.(
      isAdjustmentsDefault(adjustmentsRef.current) ? null : canvas.toDataURL("image/png")
    );
  }, [activeCurveChannel, selectedCurvePointIndex]);

  useEffect(() => {
    if (!isReady) return undefined;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isReady, adjustments, renderPreview]);

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
    setAdjustments(current => ({
      ...current,
      ...preset.adjustments,
      curves: preset.adjustments.curves || DEFAULT_CURVES
    }));
  }, []);

  const resetAdjustments = useCallback(() => {
    setAdjustments(cloneDefaultAdjustments());
    setActiveCurveChannel("rgb");
    setSelectedCurvePointIndex(null);
    setActiveColorTab("reds");
    setHoveredZone(null);
  }, []);

  const toggleSection = useCallback((id) => {
    setOpenSections(current => {
      const isOpen = !current[id];
      return { [id]: isOpen };
    });
  }, []);

  const commitCurrent = useCallback(() => {}, []);

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
    }
  }, []);

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
    }
  }, []);

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
    }
  }, [adjustments.curves, activeCurveChannel]);

  const renderFullResolutionDataUrl = useCallback(() => {
    const image = imageRef.current;
    if (!image) throw new Error(t("editor.renderError"));
    const canvas = document.createElement("canvas");
    const meta = applyImageAdjustments(image, adjustmentsRef.current, canvas, { fullResolution: true });
    if (!meta) throw new Error(t("editor.renderError"));
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
    renderFullResolutionDataUrl
  };
}
