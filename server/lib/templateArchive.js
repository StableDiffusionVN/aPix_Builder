import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

const ASAR_SEGMENT = `${path.sep}app.asar${path.sep}`;

export function isInsideAsar(filePath) {
  const normalized = path.normalize(String(filePath || ""));
  return normalized.includes(ASAR_SEGMENT) || normalized.endsWith(`${path.sep}app.asar`);
}

async function collectFiles(dir, into, prefix) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectFiles(full, into, rel);
    } else {
      into[rel] = new Uint8Array(await readFile(full));
    }
  }
}

/** Đóng gói thư mục template thành ZIP (cross-platform, không phụ thuộc CLI).
 *  ZIP chứa thư mục gốc <archiveName>/ ôm app_build.yaml + api.json + tài nguyên. */
export async function archiveTemplateDirectory(baseDir, folderName = path.basename(baseDir)) {
  const archiveName = String(folderName || path.basename(baseDir)).trim() || "template";
  const files = {};
  await collectFiles(baseDir, files, archiveName);
  return Buffer.from(zipSync(files, { level: 6 }));
}
