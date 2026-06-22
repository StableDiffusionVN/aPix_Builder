import { getSetting, setSetting } from "./appSettings.js";
import { getInputImageUrl } from "./inputImageUtils.js";

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function makeInputImageValue(image, extra = {}) {
  if (!image) return null;
  return {
    kind: "input-image",
    ...image,
    url: getInputImageUrl(image),
    ...extra
  };
}

export async function uploadInputImageFile(file, { updateInputImages, fallbackToDataUrl = true } = {}) {
  const dataUrl = await fileToDataUrl(file);
  try {
    const response = await fetch("/api/input-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, dataUrl })
    });
    if (response.ok) {
      const data = await response.json();
      updateInputImages?.(data.images || []);
      if (data.image) return makeInputImageValue(data.image);
    }
  } catch {
    // The raw data URL fallback keeps local form uploads usable when the library is unavailable.
  }
  return fallbackToDataUrl ? dataUrl : null;
}

export async function uploadInputImageDataUrl(dataUrl, { filename = "image.png", updateInputImages } = {}) {
  const response = await fetch("/api/input-images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, dataUrl })
  });
  if (!response.ok) return null;
  const data = await response.json();
  updateInputImages?.(data.images || []);
  return data.image ? makeInputImageValue(data.image) : null;
}

export async function loadInputImageFromUrl(sourceUrl, { updateInputImages, errorMessage = "Không tải được URL" } = {}) {
  const response = await fetch("/api/input-images/from-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: sourceUrl })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || errorMessage);
  updateInputImages?.(data.images || []);
  if (data.image) return makeInputImageValue(data.image);
  throw new Error(errorMessage);
}

export async function saveEditedInputImage(dataUrl, { selectedName = "", updateInputImages } = {}) {
  const filename = selectedName
    ? selectedName.replace(/(\.[^.]+)?$/, "_edited.png")
    : "edited.png";
  return uploadInputImageDataUrl(dataUrl, { filename, updateInputImages });
}

export async function deleteInputImage(image, { updateInputImages } = {}) {
  if (!image?.name) return null;
  const response = await fetch("/api/input-images/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: image.name })
  });
  if (!response.ok) return null;
  const data = await response.json();
  updateInputImages?.(data.images || []);
  return data.images || [];
}

export function getFavoriteInputImages() {
  return new Set(getSetting("favorites.inputImages", []));
}

export function toggleInputImageFavorite(name, setFavoriteInputImages) {
  if (!name) return;
  setFavoriteInputImages(current => {
    const next = new Set(current);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSetting("favorites.inputImages", [...next]);
    return next;
  });
}
