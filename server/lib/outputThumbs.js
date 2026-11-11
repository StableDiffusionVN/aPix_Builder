// Cached small thumbnails for output history. The history list used to load every
// full-size output (often 4K PNG, several MB) just to draw a 52px tile — decoding
// dozens of them made scrolling/opening history stutter.
import { Worker } from "node:worker_threads";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export const THUMB_DIR_NAME = ".thumbs";
export const THUMB_SIZE = 192; // shorter side, px — covers 52–56px tiles at 3x DPR
const MIN_BYTES = 256 * 1024; // smaller files are cheap enough to serve as-is
const SUPPORTED = /\.(png|jpe?g|bmp|tiff?|gif)$/i;

let worker = null;
let nextId = 0;
const waiting = new Map(); // job id → { resolve }
const inFlight = new Map(); // dest path → Promise<boolean>

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./thumbWorker.js", import.meta.url));
  worker.unref();
  worker.on("message", ({ id, ok }) => {
    waiting.get(id)?.resolve(ok);
    waiting.delete(id);
  });
  const fail = () => {
    for (const { resolve } of waiting.values()) resolve(false);
    waiting.clear();
    worker = null;
  };
  worker.on("error", fail);
  worker.on("exit", fail);
  return worker;
}

function runJob(src, dest) {
  return new Promise(resolve => {
    const id = ++nextId;
    waiting.set(id, { resolve });
    getWorker().postMessage({ id, src, dest, size: THUMB_SIZE });
  });
}

function thumbPrefix(filename) {
  return `${filename}-`;
}

/**
 * Path of a cached JPEG thumbnail for an output file, creating it when missing.
 * Returns null when the original should be served instead (small, unsupported, or failed).
 */
export async function getOutputThumb(outputDir, filename, fileStat) {
  if (!SUPPORTED.test(filename) || fileStat.size < MIN_BYTES) return null;
  const dir = path.join(outputDir, THUMB_DIR_NAME);
  // mtime in the name: replacing/editing an output invalidates its thumbnail automatically.
  const dest = path.join(dir, `${thumbPrefix(filename)}${Math.round(fileStat.mtimeMs)}-${THUMB_SIZE}.jpg`);
  try {
    await stat(dest);
    return dest;
  } catch { /* not cached yet */ }
  if (!inFlight.has(dest)) {
    const job = (async () => {
      await mkdir(dir, { recursive: true });
      await removeOutputThumbs(outputDir, filename); // drop stale versions
      return runJob(path.join(outputDir, filename), dest);
    })().catch(() => false).finally(() => inFlight.delete(dest));
    inFlight.set(dest, job);
  }
  return (await inFlight.get(dest)) ? dest : null;
}

export async function removeOutputThumbs(outputDir, filename) {
  const dir = path.join(outputDir, THUMB_DIR_NAME);
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const prefix = thumbPrefix(filename);
  await Promise.all(names
    .filter(name => name.startsWith(prefix) && /^\d+-\d+\.jpg$/.test(name.slice(prefix.length)))
    .map(name => rm(path.join(dir, name), { force: true })));
}
