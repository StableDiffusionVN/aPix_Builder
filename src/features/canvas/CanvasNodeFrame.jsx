import { useRef } from "react";
import { useCanvasActions } from "./canvasContext.js";
import { CANVAS_NODE_DEFAULT_WIDTH, CanvasNodeResizeHandles } from "./CanvasNodeResizeHandles.jsx";

export function CanvasNodeFrame({ id, data, selected, className = "", bypassed = false, onContextMenu, children }) {
  const nodeRef = useRef(null);
  const { nodes } = useCanvasActions();
  const node = nodes?.find(item => item.id === id);
  const size = data?.size;
  const width = size?.width || CANVAS_NODE_DEFAULT_WIDTH;
  const hasCustomHeight = Number.isFinite(size?.height) && size.height > 0;

  return (
    <div
      ref={nodeRef}
      className={`canvasNode ${className}${selected ? " is-selected" : ""}${hasCustomHeight ? " hasCustomHeight" : ""}${bypassed ? " is-bypassed" : ""}`}
      style={{
        width,
        height: hasCustomHeight ? size.height : undefined
      }}
      onContextMenu={onContextMenu}
    >
      {children}
      <CanvasNodeResizeHandles
        nodeId={id}
        size={size}
        position={node?.position}
        nodeRef={nodeRef}
      />
    </div>
  );
}
