import { useEffect, useState } from "react";
import {
  applyImageAdjustments,
  canvasToPreviewDataUrl,
  loadImage
} from "../lib/imageAdjustments.js";
import { applyHealingStrokes } from "../lib/healingBrush.js";
import { canvasToBlob, hasPendingColorAdjust, renderAdjustedCanvas } from "../lib/adjustedRender.js";
import { normalizePersistedColorState } from "../lib/colorAdjustPersistence.js";

// Recently rendered adjusted outputs (blob URLs), so switching back is instant.
const CACHE_LIMIT = 6;
const cache = new Map();

function remember(key, url) {
  cache.set(key, url);
  while (cache.size > CACHE_LIMIT) {
    const [oldKey, oldUrl] = cache.entries().next().value;
    cache.delete(oldKey);
    URL.revokeObjectURL(oldUrl);
  }
}

/**
 * The output with its saved colour adjustments applied, for display while the
 * colour panel is closed: a quick reduced preview first, then full resolution
 * (rendered off the main thread).
 */
export function useAdjustedOutputPreview(url, colorAdjust, enabled = true) {
  const [preview, setPreview] = useState(null);
  const pending = enabled && Boolean(url) && hasPendingColorAdjust(colorAdjust);
  const key = pending ? `${url}|${JSON.stringify(colorAdjust)}` : "";

  useEffect(() => {
    if (!key) {
      setPreview(null);
      return undefined;
    }
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      cache.set(key, cached);
      setPreview({ key, url: cached });
      return undefined;
    }
    let cancelled = false;
    const state = normalizePersistedColorState(colorAdjust);
    loadImage(url)
      .then(async image => {
        if (cancelled) return;
        const quick = document.createElement("canvas");
        const meta = applyImageAdjustments(image, state.adjustments, quick, {
          onAfterDraw: (ctx, scale) => applyHealingStrokes(ctx, state.healingStrokes, scale)
        });
        if (meta && !cancelled) setPreview({ key, url: canvasToPreviewDataUrl(quick) });
        if (meta?.scale >= 1) return;
        const full = await renderAdjustedCanvas(image, state);
        const blob = await canvasToBlob(full, "image/jpeg");
        const blobUrl = URL.createObjectURL(blob);
        remember(key, blobUrl);
        if (!cancelled) setPreview({ key, url: blobUrl });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // colorAdjust is captured through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url]);

  return preview?.key === key ? preview.url : null;
}
