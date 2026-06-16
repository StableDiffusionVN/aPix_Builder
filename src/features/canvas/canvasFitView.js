export const CANVAS_FIT_VIEW_DURATION = 220;
export const CANVAS_FIT_EDGE_PADDING = 6;

function px(value) {
  return `${Math.max(0, Math.round(value))}px`;
}

function resolveCanvasRoots(container) {
  if (!(container instanceof Element)) return { workspace: null, viewport: null };

  const workspace = container.classList.contains("canvasWorkspace")
    ? container
    : container.closest(".canvasWorkspace")
      || container.querySelector(".canvasWorkspace");

  const viewport = workspace?.querySelector(".react-flow")
    || (container.classList.contains("react-flow") ? container : container.querySelector(".react-flow"));

  return { workspace, viewport };
}

/**
 * Fit padding excludes only:
 * - left: library dock width (`.canvasDock`)
 * - bottom: toolbar height (`.canvasZoomBar`)
 * Minimap and toolbar width are ignored; top/right use minimal edge padding.
 */
export function measureCanvasFitPadding(container) {
  const edge = CANVAS_FIT_EDGE_PADDING;
  const padding = {
    top: px(edge),
    right: px(edge),
    bottom: px(edge),
    left: px(edge)
  };

  const { workspace, viewport } = resolveCanvasRoots(container);
  if (!viewport) return padding;

  const viewportRect = viewport.getBoundingClientRect();

  const dock = workspace?.querySelector(".canvasDock");
  if (dock) {
    const dockRect = dock.getBoundingClientRect();
    padding.left = px(Math.max(edge, dockRect.right - viewportRect.left + edge));
  }

  const zoomBar = viewport.querySelector(".canvasZoomBar");
  if (zoomBar) {
    const barRect = zoomBar.getBoundingClientRect();
    padding.bottom = px(Math.max(edge, viewportRect.bottom - barRect.top + edge));
  }

  return padding;
}

export function buildCanvasFitViewOptions(container, { duration = CANVAS_FIT_VIEW_DURATION } = {}) {
  return {
    padding: measureCanvasFitPadding(container),
    duration
  };
}

export function fitCanvasWorkflowView(fitView, container) {
  return fitView(buildCanvasFitViewOptions(container));
}
