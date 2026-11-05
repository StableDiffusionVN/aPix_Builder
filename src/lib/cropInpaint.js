import { inpaintAssetName } from "../../shared/inpaintAssets.js";
import { clampCropRect, cropInpaintSource, cropInpaintUrl } from "../../shared/cropInpaint.js";
import { uploadInputImageDataUrl } from "./inputImageActions.js";

export function loadCropImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không tải được ảnh / Could not load image"));
    image.src = source;
  });
}

function cropDataUrl(image, rect) {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.getContext("2d").drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas.toDataURL("image/png");
}

export async function saveCropInpaint(value, rect, blendPixels) {
  let original = cropInpaintSource(value);
  const image = await loadCropImage(cropInpaintUrl(value));
  const region = clampCropRect(rect, image.naturalWidth, image.naturalHeight);
  // Persist embedded/remote originals so archiving never depends on a remote URL.
  if (!inpaintAssetName(original)) {
    const saved = await uploadInputImageDataUrl(cropDataUrl(image, {
      x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight
    }), { filename: "inpaint_original.png", privateInpaint: true });
    if (!saved) throw new Error("Không lưu được ảnh gốc / Could not save original image");
    original = { ...saved, ...(original?.maskDataUrl ? { maskDataUrl: original.maskDataUrl } : {}) };
  }
  const cropped = await uploadInputImageDataUrl(cropDataUrl(image, region), {
    filename: "inpaint_crop.png", privateInpaint: true
  });
  if (!cropped) throw new Error("Không lưu được vùng crop / Could not save crop");
  if (original?.maskDataUrl) {
    const mask = await loadCropImage(original.maskDataUrl);
    if (mask.naturalWidth !== image.naturalWidth || mask.naturalHeight !== image.naturalHeight) {
      throw new Error("Mask và ảnh gốc khác kích thước / Mask size does not match original");
    }
    const savedMask = await uploadInputImageDataUrl(cropDataUrl(mask, region), { filename: "inpaint_mask.png", privateInpaint: true });
    if (!savedMask) throw new Error("Không lưu được mask crop / Could not save crop mask");
    cropped.maskDataUrl = savedMask.url;
    if (!inpaintAssetName(original.maskDataUrl)) {
      const savedOriginalMask = await uploadInputImageDataUrl(original.maskDataUrl, { filename: "inpaint_mask.png", privateInpaint: true });
      if (!savedOriginalMask) throw new Error("Không lưu được mask gốc / Could not save original mask");
      original = { ...original, maskDataUrl: savedOriginalMask.url };
    }
  }
  return {
    ...cropped,
    cropInpaint: {
      original, rect: region,
      originalWidth: image.naturalWidth, originalHeight: image.naturalHeight,
      blendPixels: Math.max(0, Math.min(256, Number(blendPixels) || 0))
    }
  };
}
