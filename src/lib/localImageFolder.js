import { pickedFolderFilesToValues } from "./folderFileCache.js";
import {
  isHttpImageUrl,
  isLocalFolderPath as isSharedLocalFolderPath,
  normalizeLocalPathInput as normalizeSharedLocalPathInput
} from "../../shared/localImagePath.js";

export { isHttpImageUrl };

export function normalizeLocalPathInput(raw = "") {
  return normalizeSharedLocalPathInput(raw, { windowsFileUrl: true });
}

export function isLocalFolderPath(raw = "") {
  return isSharedLocalFolderPath(raw, { windowsFileUrl: true });
}

export function isLocalFolderImageValue(value) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.kind === "local-folder" || item?.kind === "local-folder-picked";
}

export function readLocalFolderValue(value) {
  const item = Array.isArray(value) ? value[0] : value;
  if (item?.kind === "local-folder" || item?.kind === "local-folder-picked") return item;
  return null;
}

export async function expandFolderImageValues(values, imageKeys = null) {
  const next = { ...values };
  const keys = imageKeys?.length
    ? imageKeys
    : Object.keys(values || {});

  await Promise.all(keys.map(async key => {
    const raw = values[key];
    const folderValue = readLocalFolderValue(raw);
    if (!folderValue) return;

    if (folderValue.kind === "local-folder-picked" && folderValue.sessionId) {
      const dataUrls = await pickedFolderFilesToValues(folderValue.sessionId);
      if (!dataUrls.length) {
        throw new Error("Folder đã chọn không còn ảnh trong phiên làm việc. Hãy chọn lại folder.");
      }
      next[key] = dataUrls;
      return;
    }

    if (!folderValue.folderPath) return;

    const response = await fetch("/api/input-images/scan-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderPath: folderValue.folderPath, includeFiles: true })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Không quét được thư mục ảnh");
    }
    if (!Array.isArray(data.images) || !data.images.length) {
      throw new Error("Thư mục không có ảnh để chạy batch");
    }
    next[key] = data.images.map(image => ({
      kind: "local-file",
      filePath: image.filePath,
      name: image.name
    }));
  }));

  return next;
}
