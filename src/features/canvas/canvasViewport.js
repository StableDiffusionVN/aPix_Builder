export function normalizeCanvasViewport(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const zoom = Number(value.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null;
  if (zoom <= 0) return null;
  return { x, y, zoom };
}

export function canvasViewportsEqual(a, b) {
  const left = normalizeCanvasViewport(a);
  const right = normalizeCanvasViewport(b);
  if (!left && !right) return true;
  if (!left || !right) return false;
  return Math.abs(left.x - right.x) < 0.5
    && Math.abs(left.y - right.y) < 0.5
    && Math.abs(left.zoom - right.zoom) < 0.0001;
}
