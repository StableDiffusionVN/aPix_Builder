import { useCallback, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useCanvasActions } from "./canvasContext.js";

export const CANVAS_NODE_DEFAULT_WIDTH = 248;
export const CANVAS_NODE_MIN_WIDTH = 180;
export const CANVAS_NODE_MIN_HEIGHT = 100;

export function CanvasNodeResizeHandles({ nodeId, size, position, nodeRef }) {
  const { updateNodeSize } = useCanvasActions();
  const { getZoom } = useReactFlow();
  const dragRef = useRef(null);

  const beginDrag = useCallback((event, corner) => {
    event.preventDefault();
    event.stopPropagation();

    const el = nodeRef?.current;
    const measuredHeight = el?.offsetHeight || CANVAS_NODE_MIN_HEIGHT;
    const start = {
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size?.width || CANVAS_NODE_DEFAULT_WIDTH,
      startHeight: size?.height || measuredHeight,
      startPosX: position?.x || 0,
      startPosY: position?.y || 0
    };

    function onMove(moveEvent) {
      const zoom = getZoom() || 1;
      const dx = (moveEvent.clientX - start.startX) / zoom;
      const dy = (moveEvent.clientY - start.startY) / zoom;

      let width = start.startWidth;
      let height = start.startHeight;
      let posX = start.startPosX;

      if (start.corner === "se") {
        width = Math.max(CANVAS_NODE_MIN_WIDTH, start.startWidth + dx);
        height = Math.max(CANVAS_NODE_MIN_HEIGHT, start.startHeight + dy);
      } else {
        width = Math.max(CANVAS_NODE_MIN_WIDTH, start.startWidth - dx);
        height = Math.max(CANVAS_NODE_MIN_HEIGHT, start.startHeight + dy);
        posX = start.startPosX + (start.startWidth - width);
      }

      updateNodeSize?.(nodeId, {
        width: Math.round(width),
        height: Math.round(height),
        position: { x: Math.round(posX), y: start.startPosY }
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dragRef.current = null;
    }

    dragRef.current = { onMove, onUp };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [getZoom, nodeId, nodeRef, position, size, updateNodeSize]);

  return (
    <>
      <span
        className="canvasNodeResize canvasNodeResize-sw nodrag"
        role="separator"
        aria-orientation="both"
        aria-label="Resize node"
        onPointerDown={event => beginDrag(event, "sw")}
      />
      <span
        className="canvasNodeResize canvasNodeResize-se nodrag"
        role="separator"
        aria-orientation="both"
        aria-label="Resize node"
        onPointerDown={event => beginDrag(event, "se")}
      />
    </>
  );
}
