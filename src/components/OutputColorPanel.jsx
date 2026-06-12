import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useColorAdjustments } from "../hooks/useColorAdjustments";
import { ImageAdjustmentControls } from "./ImageAdjustmentControls";

const PANEL_WIDTH_KEY = "comfyui-build:output-color-panel-width";
export const DEFAULT_COLOR_PANEL_WIDTH = 320;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 420;

function loadPanelWidth() {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (Number.isFinite(stored) && stored >= MIN_PANEL_WIDTH && stored <= MAX_PANEL_WIDTH) {
      return stored;
    }
  } catch {}
  return DEFAULT_COLOR_PANEL_WIDTH;
}

export function OutputColorPanel({
  open,
  source,
  persistKey = null,
  persistedState = null,
  onPersist,
  onUpdate,
  onPreviewChange,
  onWidthChange,
  onHealingBridgeChange,
  onSyncClick,
  syncDisabled = true,
  syncing = false,
  updating = false,
  disabled = false,
  align = "right"
}) {
  const { t } = useI18n();
  const isLeft = align === "left";
  const resizeRef = useRef({ dragging: false, startX: 0, startWidth: DEFAULT_COLOR_PANEL_WIDTH });
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth);
  const [previewError, setPreviewError] = useState("");

  const handlePreviewChange = useCallback((dataUrl) => {
    setPreviewError("");
    onPreviewChange?.(dataUrl);
  }, [onPreviewChange]);

  const engine = useColorAdjustments({
    source: open ? source : null,
    onPreviewChange: open ? handlePreviewChange : null,
    persistKey: open ? persistKey : null,
    persistedState: open ? persistedState : null,
    onPersist: open ? onPersist : null
  });

  useEffect(() => {
    if (!open) {
      onPreviewChange?.(null);
    }
  }, [open, onPreviewChange]);

  useEffect(() => {
    onWidthChange?.(open ? panelWidth : 0);
  }, [open, panelWidth, onWidthChange]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    } catch {}
  }, [panelWidth]);

  async function handleUpdate() {
    if (disabled || updating || !engine.isReady) return;
    setPreviewError("");
    try {
      const dataUrl = engine.renderFullResolutionDataUrl();
      await onUpdate(dataUrl);
    } catch (err) {
      setPreviewError(err.message || t("editor.saveError"));
    }
  }

  function handleResizePointerDown(event) {
    resizeRef.current = {
      dragging: true,
      startX: event.clientX,
      startWidth: panelWidth
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("color-panel-resizing");
  }

  function handleResizePointerMove(event) {
    if (!resizeRef.current.dragging) return;
    const delta = isLeft
      ? event.clientX - resizeRef.current.startX
      : resizeRef.current.startX - event.clientX;
    setPanelWidth(Math.min(
      MAX_PANEL_WIDTH,
      Math.max(MIN_PANEL_WIDTH, resizeRef.current.startWidth + delta)
    ));
  }

  function handleResizePointerUp(event) {
    resizeRef.current.dragging = false;
    document.body.classList.remove("color-panel-resizing");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const displayError = previewError || engine.error;

  useEffect(() => {
    if (!open || disabled) {
      onHealingBridgeChange?.(null);
      return undefined;
    }
    onHealingBridgeChange?.({
      active: engine.healingActive,
      cursor: engine.healingCursor,
      brushDiameter: engine.healingBrushDiameter,
      handlePointerDown: engine.handleHealingPointerDown,
      handlePointerMove: engine.handleHealingPointerMove,
      handlePointerUp: engine.handleHealingPointerUp,
      handlePointerHover: engine.handleHealingPointerHover,
      clearHealingCursor: engine.clearHealingCursor
    });
    return () => onHealingBridgeChange?.(null);
  }, [
    open,
    disabled,
    onHealingBridgeChange,
    engine.healingActive,
    engine.healingCursor,
    engine.healingBrushDiameter,
    engine.handleHealingPointerDown,
    engine.handleHealingPointerMove,
    engine.handleHealingPointerUp,
    engine.handleHealingPointerHover,
    engine.clearHealingCursor
  ]);

  if (!open) return null;

  return (
    <section className={`colorAdjustPanel${isLeft ? " is-left" : " is-right"}`} aria-label={t("colorPanel.title")}>
      <div
        className="colorAdjustPanelResizeHandle"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("colorPanel.resize")}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
      />

      <ImageAdjustmentControls
        engine={engine}
        title={t("colorPanel.title")}
        resetLabel={t("colorPanel.reset")}
        onReset={engine.resetAdjustments}
        primaryLabel={t("colorPanel.update")}
        primaryUpdateText={t("colorPanel.updating")}
        onPrimaryAction={handleUpdate}
        primaryDisabled={disabled || !engine.isReady}
        primaryLoading={updating}
        showHealingTool={!disabled && engine.isReady}
        onSyncClick={() => onSyncClick?.(engine.getPersistedState())}
        syncDisabled={syncDisabled || syncing || disabled || !engine.isReady}
        syncLoading={syncing}
      />

      {displayError ? <div className="editorError colorAdjustPanelError">{displayError}</div> : null}
    </section>
  );
}
