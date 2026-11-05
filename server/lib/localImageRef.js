// @ts-check
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isLegacyInpaintAsset } from "../../shared/inpaintAssets.js";

export function safeBasename(rawName = "") {
  return path.basename(String(rawName)).replace(/[^\w.-]+/g, "_");
}

export function mimeFromFilename(filename = "") {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

/**
 * Parse ref ảnh local của app (`/api/output-image?name=` — ảnh kết quả node trước
 * trên canvas — hoặc `/api/input-image?name=`), dạng path hoặc URL tuyệt đối.
 * @returns {{kind: "output"|"input"|"inpaint", name: string}|null}
 */
export function parseLocalImageRef(value) {
  if (!value || typeof value !== "string") return null;
  let pathname = value;
  let search = "";
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      pathname = parsed.pathname;
      search = parsed.search;
    } catch {
      return null;
    }
  } else if (!value.startsWith("/")) {
    return null;
  }
  const refUrl = new URL(`${pathname}${search}`, "http://localhost");
  if (refUrl.pathname === "/api/inpaint-image") {
    const name = safeBasename(refUrl.searchParams.get("name") || "");
    return name ? { kind: "inpaint", name } : null;
  }
  if (pathname.startsWith("/api/output-image")) {
    const name = safeBasename(refUrl.searchParams.get("name") || "");
    return name ? { kind: "output", name } : null;
  }
  if (pathname.startsWith("/api/input-image")) {
    const name = safeBasename(refUrl.searchParams.get("name") || "");
    return name ? { kind: "input", name } : null;
  }
  return null;
}

export async function readLocalImageFromDir(dir, name) {
  const filePath = path.join(dir, name);
  const resolvedDir = path.resolve(dir);
  if (!path.resolve(filePath).startsWith(resolvedDir)) {
    throw new Error("Invalid local image path");
  }
  const buffer = await readFile(filePath);
  return { buffer, mimeType: mimeFromFilename(name), filename: name };
}

/** Ref local (`output`/`input`) → upload payload cho ComfyUI/RunningHub. */
export async function localImageRefToUpload(ref, { inputDir, outputDir }) {
  const privateAsset = ref.kind === "inpaint" || (ref.kind === "input" && isLegacyInpaintAsset(ref.name));
  const dir = privateAsset ? (inputDir ? path.join(inputDir, ".inpaint") : null) : ref.kind === "output" ? outputDir : inputDir;
  if (!dir) throw new Error(`Missing ${ref.kind} image directory`);
  let image;
  try {
    try { image = await readLocalImageFromDir(dir, ref.name); }
    catch (error) {
      if (ref.kind !== "input" || !privateAsset || error.code !== "ENOENT") throw error;
      image = await readLocalImageFromDir(inputDir, ref.name);
    }
  } catch (error) {
    throw new Error(`Không đọc được ảnh local (${ref.kind}/${ref.name}): ${error.message}`);
  }
  if (!image.buffer?.length) throw new Error(`File ảnh rỗng (${ref.name})`);
  return image;
}
