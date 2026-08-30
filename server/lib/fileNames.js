import path from "node:path";

/** Chuẩn hóa tên tệp ảnh input/output: chỉ giữ basename, thay ký tự lạ bằng "_".
 * Trước đây nhân 3 bản giống hệt trong comfyService + storageService. */
export function safeFileName(rawName = "") {
  return path.basename(String(rawName)).replace(/[^\w.-]+/g, "_");
}
