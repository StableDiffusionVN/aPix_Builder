import { useRef } from "react";
import { buildSourceDragPayload, buildStepDragPayload, endCanvasDrag, writeCanvasDragPayload } from "./canvasDrag.js";

export function usePaletteDragHandlers() {
  const draggedRef = useRef(false);

  function markDragStart(event, payload) {
    draggedRef.current = true;
    writeCanvasDragPayload(event.dataTransfer, payload);
    const target = event.currentTarget;
    if (target instanceof Element) target.classList.add("isPaletteDragging");
  }

  function markDragEnd(event) {
    const target = event.currentTarget;
    if (target instanceof Element) target.classList.remove("isPaletteDragging");
    endCanvasDrag();
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  }

  function shouldSkipClick() {
    return draggedRef.current;
  }

  function bindStepItem(item) {
    return {
      onDragStart: event => markDragStart(event, buildStepDragPayload(item)),
      onDragEnd: markDragEnd
    };
  }

  function bindSource(sourceType) {
    return {
      draggable: true,
      onDragStart: event => markDragStart(event, buildSourceDragPayload(sourceType)),
      onDragEnd: markDragEnd
    };
  }

  return { bindStepItem, bindSource, shouldSkipClick };
}
