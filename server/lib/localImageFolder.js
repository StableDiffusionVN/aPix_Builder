import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isLocalFolderPath,
  normalizeLocalPathInput
} from "../../shared/localImagePath.js";

export { isLocalFolderPath, normalizeLocalPathInput };

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|tiff?)$/i;

export function resolveLocalFolderPath(raw = "") {
  let value = normalizeLocalPathInput(raw);
  if (!value) throw new Error("Thiếu đường dẫn thư mục");
  if (value.startsWith("~")) {
    value = path.join(os.homedir(), value.slice(1).replace(/^[/\\]+/, ""));
  }
  return path.resolve(value);
}

function folderAccessErrorMessage(folderPath, error) {
  const code = error?.code || "";
  const lowerPath = String(folderPath || "").toLowerCase();
  const protectedFolder = /\/downloads(\/|$)/.test(lowerPath)
    || /\/desktop(\/|$)/.test(lowerPath)
    || /\/documents(\/|$)/.test(lowerPath)
    || /\/pictures(\/|$)/.test(lowerPath);

  if (code === "EPERM" || code === "EACCES") {
    if (protectedFolder) {
      return "macOS chặn quyền đọc thư mục hệ thống (Downloads/Desktop/Documents...). Hãy dùng nút \"Chọn folder\" bên cạnh, hoặc di chuyển ảnh sang thư mục khác (ví dụ ~/Documents), hoặc cấp quyền Full Disk Access cho app chạy server.";
    }
    return "Không có quyền đọc thư mục này. Hãy dùng nút \"Chọn folder\" hoặc kiểm tra lại quyền truy cập.";
  }
  return "Không tìm thấy thư mục";
}

async function walkFiles(rootDir) {
  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await walkFiles(entryPath));
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
    return files;
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") {
      throw new Error(folderAccessErrorMessage(rootDir, error));
    }
    throw error;
  }
}

export async function scanLocalImageFolder(folderPath, { includeFiles = true } = {}) {
  const resolved = resolveLocalFolderPath(folderPath);
  let folderStat;
  try {
    folderStat = await stat(resolved);
  } catch (error) {
    throw new Error(folderAccessErrorMessage(resolved, error));
  }
  if (!folderStat.isDirectory()) {
    throw new Error("Đường dẫn không phải thư mục");
  }

  const files = (await walkFiles(resolved))
    .filter(filePath => IMAGE_EXT.test(filePath))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const result = {
    folderPath: resolved,
    imageCount: files.length
  };

  if (includeFiles) {
    result.images = files.map(filePath => ({
      filePath,
      name: path.basename(filePath),
      relativePath: path.relative(resolved, filePath)
    }));
  }

  return result;
}

export function mimeTypeForLocalFile(filePath = "") {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".avif") return "image/avif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/png";
}

export async function localFileToUpload(value) {
  const filePath = path.resolve(String(value?.filePath || ""));
  if (!filePath) throw new Error("Thiếu đường dẫn file ảnh");
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    throw new Error("Không tìm thấy file ảnh");
  }
  if (!fileStat.isFile()) throw new Error("Đường dẫn không phải file ảnh");
  return {
    kind: "upload",
    index: Date.now(),
    mimeType: mimeTypeForLocalFile(filePath),
    buffer: await readFile(filePath)
  };
}
