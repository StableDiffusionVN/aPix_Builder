import { parseLocalImageRef, localImageRefToUpload } from "./localImageRef.js";
import { findCropInpaint, clampCropRect } from "../../shared/cropInpaint.js";

async function readSource(source, paths) {
  const url = typeof source === "string" ? source : source?.url;
  const ref = parseLocalImageRef(url);
  if (ref) return (await localImageRefToUpload(ref, paths)).buffer;
  const data = /^data:image\/[\w.+-]+;base64,(.+)$/.exec(url || "");
  if (data) return Buffer.from(data[1], "base64");
  // Crop originals are persisted locally by the picker. Never fetch an arbitrary
  // remote URL when archiving a completed run.
  throw new Error("Không tìm thấy ảnh gốc Crop Inpaint. Hãy chọn lại vùng crop.");
}

/** Snapshot the original before submission; stitch each output independently. */
export async function prepareCropInpaint(values, paths) {
  const value = findCropInpaint(values);
  if (!value) return null;
  const { Jimp, ResizeStrategy } = await import("jimp");
  const info = value.cropInpaint;
  const original = await Jimp.read(await readSource(info.original, paths));
  const { width, height } = original.bitmap;
  if (info.originalWidth !== width || info.originalHeight !== height) {
    throw new Error("Ảnh gốc Crop Inpaint đã đổi kích thước. Hãy chọn lại vùng crop.");
  }
  const rect = clampCropRect(info.rect, width, height);
  if (!info.rect || ["x", "y", "width", "height"].some(key => rect[key] !== info.rect[key])) {
    throw new Error("Vùng Crop Inpaint không hợp lệ. Hãy chọn lại vùng crop.");
  }
  const feather = Math.min(Math.max(0, Number(info.blendPixels) || 0), 256, rect.width / 2, rect.height / 2);
  let mask = null;
  if (value.maskDataUrl) {
    mask = await Jimp.read(await readSource(value.maskDataUrl, paths));
    mask.resize({ w: rect.width, h: rect.height, mode: ResizeStrategy.BILINEAR });
  }

  return async function stitch(outputBuffer) {
    try {
      const patch = await Jimp.read(outputBuffer);
      patch.resize({ w: rect.width, h: rect.height, mode: ResizeStrategy.BICUBIC });
      const result = original.clone();
      const dst = result.bitmap.data;
      const src = patch.bitmap.data;
      for (let y = 0; y < rect.height; y += 1) {
        for (let x = 0; x < rect.width; x += 1) {
          const i = (y * rect.width + x) * 4;
          const j = ((rect.y + y) * width + rect.x + x) * 4;
          const edge = Math.min(x + .5, y + .5, rect.width - x - .5, rect.height - y - .5);
          // The mask editor exports ComfyUI masks: painted pixels have alpha 0.
          const maskAlpha = mask ? 1 - mask.bitmap.data[i + 3] / 255 : 1;
          const alpha = src[i + 3] / 255 * maskAlpha * (feather ? Math.min(1, edge / feather) : 1);
          if (alpha === 0) continue;
          const backgroundAlpha = dst[j + 3] / 255;
          const outAlpha = alpha + backgroundAlpha * (1 - alpha);
          for (let c = 0; c < 3; c += 1) {
            dst[j + c] = Math.round((src[i + c] * alpha + dst[j + c] * backgroundAlpha * (1 - alpha)) / outAlpha);
          }
          dst[j + 3] = Math.round(outAlpha * 255);
        }
      }
      return await result.getBuffer("image/png");
    } catch (error) {
      throw new Error(`Không ghép được kết quả Crop Inpaint: ${error.message}`, { cause: error });
    }
  };
}
