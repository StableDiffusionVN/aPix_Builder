// Pixel coordinates always refer to the full, original image.
export function clampCropRect(rect, width, height) {
  const x = Math.max(0, Math.min(width - 1, Math.round(Number(rect?.x) || 0)));
  const y = Math.max(0, Math.min(height - 1, Math.round(Number(rect?.y) || 0)));
  const requestedWidth = Number(rect?.width);
  const requestedHeight = Number(rect?.height);
  return {
    x, y,
    width: Math.max(1, Math.min(width - x, Math.round(Number.isFinite(requestedWidth) ? requestedWidth : width))),
    height: Math.max(1, Math.min(height - y, Math.round(Number.isFinite(requestedHeight) ? requestedHeight : height)))
  };
}

export function cropInpaintSource(value) {
  return value?.cropInpaint?.original || value;
}

export function isInpaintCropEnabled(ui) {
  return ["image", "image_mask", "file"].includes(String(ui?.type || "").toLowerCase())
    && ui?.inpaintCrop === true;
}

// Disabling the template option also disables a crop restored from saved values.
export function imageValueForUi(value, ui) {
  if (isInpaintCropEnabled(ui)) return value;
  if (Array.isArray(value)) return value.map(cropInpaintSource);
  return cropInpaintSource(value);
}

export function cropInpaintUrl(value) {
  const source = cropInpaintSource(value);
  return typeof source === "string" ? source : source?.url || "";
}

// A workflow can have several reference images, but only one replacement region.
// Repeated mappings of the same cropped image are allowed.
export function findCropInpaint(values) {
  const found = [];
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value?.cropInpaint) found.push(value);
  }
  Object.values(values || {}).forEach(visit);
  const unique = [...new Map(found.map(value => [JSON.stringify(value.cropInpaint), value])).values()];
  if (unique.length > 1) throw new Error("Mỗi lượt chạy chỉ hỗ trợ một vùng Crop Inpaint. Hãy tắt Crop Inpaint ở các ảnh tham chiếu khác.");
  return unique[0] || null;
}
