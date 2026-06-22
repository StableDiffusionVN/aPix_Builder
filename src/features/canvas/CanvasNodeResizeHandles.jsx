import { useCallback, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useCanvasActions, useCanvasGraph } from "./canvasContext.js";
import { estimateCanvasNodeMinHeight } from "./canvasNodeLayout.js";
import { useI18n } from "../../i18n/I18nContext.jsx";

export const CANVAS_NODE_DEFAULT_WIDTH = 348;
export const CANVAS_NODE_MIN_WIDTH = 180;
export const CANVAS_NODE_MIN_HEIGHT = 100;

export function CanvasNodeResizeHandles({ nodeId, size, position, nodeRef }) {
  const { t } = useI18n();
  const { updateNodeSize, commitNodeResize } = useCanvasActions();
  const { nodes, edges } = useCanvasGraph();
  const { getZoom } = useReactFlow();
  const dragRef = useRef(null);

  const beginDrag = useCallback((event, corner) => {
    event.preventDefault();
    event.stopPropagation();

    const el = nodeRef?.current;
    const node = nodes?.find(item => item.id === nodeId);
    const minHeight = estimateCanvasNodeMinHeight(node, edges || [], nodes || []);
    const measuredHeight = el?.offsetHeight || minHeight;
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
        height = Math.max(minHeight, start.startHeight + dy);
      } else {
        width = Math.max(CANVAS_NODE_MIN_WIDTH, start.startWidth - dx);
        height = Math.max(minHeight, start.startHeight + dy);
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
      commitNodeResize?.();
    }

    dragRef.current = { onMove, onUp };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [commitNodeResize, edges, getZoom, nodeId, nodeRef, nodes, position, size, updateNodeSize]);

  return (
    <>
      <span
        className="canvasNodeResize canvasNodeResize-sw nodrag"
        role="separator"
        aria-orientation="both"
        aria-label={t("canvas.node.resize")}
        onPointerDown={event => beginDrag(event, "sw")}
      />
      <span
        className="canvasNodeResize canvasNodeResize-se nodrag"
        role="separator"
        aria-orientation="both"
        aria-label={t("canvas.node.resize")}
        onPointerDown={event => beginDrag(event, "se")}
      />
    </>
  );
}
