// Runs the per-pixel colour pipeline off the main thread (full-resolution renders).
import { applyColorPipeline } from "./imageAdjustments.js";
import { setLoadedLut } from "./lutStore.js";

self.onmessage = ({ data }) => {
  const { id, width, height, pixels, adjustments, scale, seed, lut } = data;
  try {
    if (lut) setLoadedLut(lut.id, lut.value);
    const imageData = { data: pixels, width, height };
    applyColorPipeline(imageData, adjustments, { scale, seed });
    self.postMessage({ id, pixels }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
