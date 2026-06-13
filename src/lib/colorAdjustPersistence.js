import {
  cloneDefaultAdjustments,
  DEFAULT_CURVES,
  normalizeHslAdjustments
} from "./imageAdjustments";
import { DEFAULT_HEALING_BRUSH_SIZE } from "./healingBrush";

export const COLOR_SYNC_GROUP_IDS = ["basic", "curves", "hsl", "effects", "healing"];

const BASIC_KEYS = [
  "luminance", "contrast", "temperature", "tint", "vibrance", "saturation", "hue",
  "highlights", "shadows", "whites", "blacks", "invert"
];

export function makeColorAdjustKey(historyId, outputIndex, filename) {
  if (historyId && filename) return `${historyId}:${outputIndex}:${filename}`;
  if (filename) return `file:${filename}`;
  return null;
}

export function normalizePersistedColorState(state) {
  const adjustments = cloneDefaultAdjustments();
  const source = state?.adjustments;
  if (source && typeof source === "object") {
    Object.assign(adjustments, JSON.parse(JSON.stringify(source)));
    adjustments.hsl = normalizeHslAdjustments(source.hsl || adjustments.hsl);
    adjustments.curves = source.curves
      ? JSON.parse(JSON.stringify(source.curves))
      : DEFAULT_CURVES;
  }

  return {
    adjustments,
    healingStrokes: Array.isArray(state?.healingStrokes)
      ? JSON.parse(JSON.stringify(state.healingStrokes))
      : [],
    healingBrushSize: Number.isFinite(state?.healingBrushSize)
      ? state.healingBrushSize
      : DEFAULT_HEALING_BRUSH_SIZE,
    updatedAt: state?.updatedAt || null
  };
}

export function buildPersistedColorState(adjustments, healingStrokes, healingBrushSize) {
  return normalizePersistedColorState({
    adjustments,
    healingStrokes,
    healingBrushSize,
    updatedAt: new Date().toISOString()
  });
}

export function getOutputColorAdjust(output) {
  if (!output?.colorAdjust) return null;
  return normalizePersistedColorState(output.colorAdjust);
}

export function mergeColorAdjustGroups(targetState, sourceState, groups = COLOR_SYNC_GROUP_IDS) {
  const target = normalizePersistedColorState(targetState);
  const source = normalizePersistedColorState(sourceState);
  const next = normalizePersistedColorState(target);

  if (groups.includes("basic")) {
    for (const key of BASIC_KEYS) {
      next.adjustments[key] = source.adjustments[key];
    }
  }
  if (groups.includes("curves")) {
    next.adjustments.curves = JSON.parse(JSON.stringify(source.adjustments.curves || DEFAULT_CURVES));
  }
  if (groups.includes("hsl")) {
    next.adjustments.hsl = normalizeHslAdjustments(source.adjustments.hsl);
  }
  if (groups.includes("effects")) {
    next.adjustments.grain = source.adjustments.grain;
    next.adjustments.grainSize = source.adjustments.grainSize ?? 50;
    next.adjustments.grainRoughness = source.adjustments.grainRoughness ?? 50;
    next.adjustments.clarity = source.adjustments.clarity;
    next.adjustments.dehaze = source.adjustments.dehaze;
    next.adjustments.texture = source.adjustments.texture ?? 0;
    next.adjustments.vignette = source.adjustments.vignette ?? 0;
    next.adjustments.blur = source.adjustments.blur;
  }
  if (groups.includes("healing")) {
    next.healingStrokes = JSON.parse(JSON.stringify(source.healingStrokes || []));
    next.healingBrushSize = source.healingBrushSize;
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

export function patchHistoryItemOutput(history, historyId, outputIndex, colorAdjust) {
  return history.map(item => {
    if (item.id !== historyId) return item;
    const outputs = [...(item.outputs || item.result?.outputs || [])];
    if (!outputs[outputIndex]) return item;
    outputs[outputIndex] = {
      ...outputs[outputIndex],
      colorAdjust
    };
    const nextItem = {
      ...item,
      outputs
    };
    if (item.result) {
      nextItem.result = {
        ...item.result,
        outputs
      };
    }
    return nextItem;
  });
}
