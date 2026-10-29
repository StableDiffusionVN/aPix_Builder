import {
  applyColorPipeline,
  applyImageAdjustments,
  isLutActive,
  loadImage,
  needsColorPipeline
} from "./imageAdjustments.js";
import { applyHealingStrokes } from "./healingBrush.js";
import { applyColorPipelineGpuToCanvas } from "./gpuPipeline.js";
import { ensureLut, getLoadedLut } from "./lutStore.js";
import { normalizePersistedColorState } from "./colorAdjustPersistence.js";

// Full-resolution "adjusted output" renders: geometry/blur/healing on a canvas,
// the heavy per-pixel colour pipeline in a Web Worker so the UI stays responsive.

let worker = null;
let workerBroken = false;
let nextJobId = 1;
const jobs = new Map();

function failAllJobs() {
  workerBroken = true;
  worker?.terminate();
  worker = null;
  for (const job of jobs.values()) job.fallback();
  jobs.clear();
}

function getWorker() {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./colorPipeline.worker.js", import.meta.url), { type: "module" });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id);
    if (!job) return;
    jobs.delete(data.id);
    if (data.error) job.reject(new Error(data.error));
    else job.resolve(data.pixels);
  };
  // A worker that cannot load (e.g. file:// without module-worker support)
  // falls back to the main thread for this and every later job.
  worker.onerror = event => {
    event.preventDefault?.();
    failAllJobs();
  };
  return worker;
}

function runPipelineOnMainThread(imageData, adjustments, options) {
  applyColorPipeline(imageData, adjustments, options);
  return imageData;
}

export function runColorPipelineOffThread(imageData, adjustments, { scale = 1, seed = 1 } = {}) {
  const target = getWorker();
  if (!target) return Promise.resolve(runPipelineOnMainThread(imageData, adjustments, { scale, seed }));
  const lut = isLutActive(adjustments.lut) ? getLoadedLut(adjustments.lut.id) : null;
  const id = nextJobId++;
  return new Promise((resolve, reject) => {
    jobs.set(id, {
      resolve: pixels => {
        imageData.data.set(pixels);
        resolve(imageData);
      },
      reject,
      fallback: () => resolve(runPipelineOnMainThread(imageData, adjustments, { scale, seed }))
    });
    // Pixels are copied (not transferred) so a failed worker can still fall back.
    target.postMessage({
      id,
      width: imageData.width,
      height: imageData.height,
      pixels: imageData.data,
      adjustments,
      scale,
      seed,
      lut: lut ? { id: adjustments.lut.id, value: lut } : null
    });
  });
}

/** Render `image` with a colour state at full resolution (same result as "Update"). */
export async function renderAdjustedCanvas(image, { adjustments, healingStrokes = [] }) {
  if (isLutActive(adjustments.lut)) await ensureLut(adjustments.lut.id).catch(() => null);
  const canvas = document.createElement("canvas");
  // Healing works on the source pixels, under the colour adjustments.
  const meta = applyImageAdjustments(image, adjustments, canvas, {
    fullResolution: true,
    skipColorPipeline: true,
    skipBlur: true,
    onAfterDraw: (drawCtx, scale) => {
      if (healingStrokes.length) applyHealingStrokes(drawCtx, healingStrokes, scale);
    }
  });
  if (!meta) throw new Error("Render failed");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (needsColorPipeline(adjustments)
    && !applyColorPipelineGpuToCanvas(canvas, adjustments, { scale: meta.scale, seed: 1 })) {
    const imageData = ctx.getImageData(0, 0, meta.width, meta.height);
    const result = await runColorPipelineOffThread(imageData, adjustments, { scale: meta.scale, seed: 1 });
    ctx.putImageData(result, 0, 0);
  }
  if (adjustments.blur > 0) {
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = meta.width;
    blurCanvas.height = meta.height;
    const blurCtx = blurCanvas.getContext("2d");
    blurCtx.filter = `blur(${adjustments.blur * meta.scale}px)`;
    blurCtx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, meta.width, meta.height);
    ctx.drawImage(blurCanvas, 0, 0);
  }
  return canvas;
}

export function mimeTypeForFilename(filename = "") {
  if (/\.jpe?g$/i.test(filename)) return "image/jpeg";
  if (/\.webp$/i.test(filename)) return "image/webp";
  return "image/png";
}

export function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("Encode failed"))), type, type === "image/png" ? undefined : 0.95);
  });
}

/** True when a saved colour state still changes the image (not yet baked by "Update"). */
export function hasPendingColorAdjust(colorAdjust) {
  if (!colorAdjust) return false;
  const state = normalizePersistedColorState(colorAdjust);
  // Compare normalised forms (normalising reorders keys, e.g. grading).
  const neutral = normalizePersistedColorState({ adjustments: {} });
  return state.healingStrokes.length > 0
    || JSON.stringify(state.adjustments) !== JSON.stringify(neutral.adjustments);
}

/** Download-ready Blob of an output with its saved colour adjustments applied. */
export async function renderAdjustedOutputBlob(url, colorAdjust, filename) {
  const state = normalizePersistedColorState(colorAdjust);
  const image = await loadImage(url);
  const canvas = await renderAdjustedCanvas(image, state);
  return canvasToBlob(canvas, mimeTypeForFilename(filename));
}
