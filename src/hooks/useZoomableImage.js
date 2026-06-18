import { useEffect, useRef, useState } from "react";

export const DEFAULT_LIGHTBOX_MIN_SCALE = 1;
export const DEFAULT_LIGHTBOX_MAX_SCALE = 8;

export function clampZoomScale(value, minScale = DEFAULT_LIGHTBOX_MIN_SCALE, maxScale = DEFAULT_LIGHTBOX_MAX_SCALE) {
  return Math.min(maxScale, Math.max(minScale, Number(value.toFixed(4))));
}

export function zoomPanAroundPoint({ point, pan, previousScale, nextScale }) {
  const ratio = nextScale / previousScale;
  return {
    x: point.x + (pan.x - point.x) * ratio,
    y: point.y + (pan.y - point.y) * ratio
  };
}

export function useZoomableImage({
  enabled = true,
  imageKey = "",
  open = true,
  minScale = DEFAULT_LIGHTBOX_MIN_SCALE,
  maxScale = DEFAULT_LIGHTBOX_MAX_SCALE
} = {}) {
  const [scale, setScale] = useState(minScale);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef(null);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);

  useEffect(() => {
    scaleRef.current = scale;
    panRef.current = pan;
  }, [pan, scale]);

  useEffect(() => {
    dragRef.current = null;
    scaleRef.current = minScale;
    panRef.current = { x: 0, y: 0 };
    setScale(minScale);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
  }, [imageKey, minScale, open]);

  function handleWheel(event) {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2
    };
    const previousScale = scaleRef.current;
    const factor = event.deltaY > 0 ? 1 / 1.15 : 1.15;
    const nextScale = clampZoomScale(previousScale * factor, minScale, maxScale);
    if (nextScale === previousScale) return;
    const nextPan = nextScale === minScale
      ? { x: 0, y: 0 }
      : zoomPanAroundPoint({
        point,
        pan: panRef.current,
        previousScale,
        nextScale
      });
    scaleRef.current = nextScale;
    panRef.current = nextPan;
    setScale(nextScale);
    setPan(nextPan);
  }

  function handlePointerDown(event) {
    if (!enabled || event.button !== 0 || scaleRef.current <= minScale) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y
    };
    setIsPanning(true);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!enabled || !drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextPan = {
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY
    };
    panRef.current = nextPan;
    setPan(nextPan);
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return {
    scale,
    pan,
    isPanning,
    stageProps: enabled ? {
      onWheel: handleWheel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp
    } : {},
    stageStyle: {
      "--lightbox-scale": scale,
      "--lightbox-pan-x": `${pan.x}px`,
      "--lightbox-pan-y": `${pan.y}px`
    }
  };
}
