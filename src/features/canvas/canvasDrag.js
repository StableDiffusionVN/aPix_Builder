export const CANVAS_DRAG_MIME = "application/x-apix-canvas-node";
const PLAIN_PREFIX = "apix-canvas:";

/** @type {object | null} */
let activeDragPayload = null;

export function beginCanvasDrag(payload) {
  activeDragPayload = payload;
}

export function endCanvasDrag() {
  activeDragPayload = null;
}

export function getActiveCanvasDragPayload() {
  return activeDragPayload;
}

export function writeCanvasDragPayload(dataTransfer, payload) {
  if (!dataTransfer || !payload) return;
  const encoded = JSON.stringify(payload);
  dataTransfer.setData(CANVAS_DRAG_MIME, encoded);
  dataTransfer.setData("text/plain", `${PLAIN_PREFIX}${encoded}`);
  dataTransfer.effectAllowed = "copy";
  beginCanvasDrag(payload);
}

export function isCanvasDragEvent(event) {
  const dataTransfer = event?.dataTransfer;
  if (!dataTransfer) return false;
  if (activeDragPayload) return true;
  const types = Array.from(dataTransfer.types || []);
  return types.includes(CANVAS_DRAG_MIME)
    || types.includes("text/plain");
}

export function readCanvasDragPayload(dataTransfer) {
  if (dataTransfer) {
    const raw = dataTransfer.getData(CANVAS_DRAG_MIME);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        /* fall through */
      }
    }
    const plain = dataTransfer.getData("text/plain");
    if (plain.startsWith(PLAIN_PREFIX)) {
      try {
        return JSON.parse(plain.slice(PLAIN_PREFIX.length));
      } catch {
        /* fall through */
      }
    }
  }
  return activeDragPayload;
}

export function buildStepDragPayload(item) {
  return {
    type: "step",
    kind: item.kind,
    ref: item.ref,
    name: item.name || item.ref
  };
}

export function buildSourceDragPayload(sourceType) {
  return { type: "source", sourceType };
}

function isBlockedDropTarget(target) {
  return target instanceof Element && Boolean(target.closest(
    ".canvasFlyout, .canvasDock, .canvasFlowPanel, .canvasPaletteContent, .canvasContextMenu"
  ));
}

export function shouldAcceptCanvasDrop(event) {
  if (!isCanvasDragEvent(event)) return false;
  if (isBlockedDropTarget(event.target)) return false;
  return Boolean(event.target.closest(".canvasWorkspace"));
}
