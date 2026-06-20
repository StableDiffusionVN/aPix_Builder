function cleanText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function validDate(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function boundaryDate(values, fallback, pick) {
  const times = values.map(validDate).filter(time => time !== null);
  return times.length ? new Date(pick(...times)).toISOString() : fallback;
}

export function canvasHistoryMetadata(source = {}) {
  const canvasRunGroupId = cleanText(source.canvasRunGroupId);
  if (!canvasRunGroupId) return {};
  const batchIndex = Number(source.canvasBatchIndex);
  const batchTotal = Number(source.canvasBatchTotal);
  return {
    canvasRunGroupId,
    canvasProjectId: cleanText(source.canvasProjectId),
    canvasNodeId: cleanText(source.canvasNodeId),
    canvasNodeName: cleanText(source.canvasNodeName),
    canvasGroupLabel: cleanText(source.canvasGroupLabel) || "Canvas run",
    ...(Number.isInteger(batchIndex) && batchIndex >= 0 ? { canvasBatchIndex: batchIndex } : {}),
    ...(Number.isInteger(batchTotal) && batchTotal > 0 ? { canvasBatchTotal: batchTotal } : {})
  };
}

export function decorateCanvasHistoryItem(item, source = {}) {
  const metadata = canvasHistoryMetadata(source);
  if (!metadata.canvasRunGroupId) return item;
  const outputs = (item.outputs || []).map(output => ({
    ...output,
    runId: item.id,
    canvasNodeId: metadata.canvasNodeId,
    canvasNodeName: metadata.canvasNodeName,
    ...(metadata.canvasBatchIndex !== undefined ? { canvasBatchIndex: metadata.canvasBatchIndex } : {})
  }));
  return {
    ...item,
    ...metadata,
    outputs,
    result: item.result ? { ...item.result, outputs } : item.result
  };
}

export function mergeCanvasHistoryItem(history = [], item) {
  const list = Array.isArray(history) ? history : [];
  const groupId = item?.canvasRunGroupId;
  if (!groupId) return [item, ...list];

  const existing = list.find(entry => entry?.isCanvasGroup && entry.id === groupId);
  const previousRuns = Array.isArray(existing?.runs) ? existing.runs : [];
  const existingRunIndex = previousRuns.findIndex(run => run.id === item.id);
  const runs = existingRunIndex >= 0
    ? previousRuns.map((run, index) => index === existingRunIndex ? item : run)
    : [...previousRuns, item];
  const outputs = runs.flatMap(run => run.outputs || []);
  const submittedAt = boundaryDate(
    runs.map(run => run.submittedAt || run.createdAt),
    item.submittedAt || item.createdAt,
    Math.min
  );
  const completedAt = boundaryDate(
    runs.map(run => run.completedAt || run.createdAt),
    item.completedAt || item.createdAt,
    Math.max
  );
  const startedMs = validDate(submittedAt);
  const completedMs = validDate(completedAt);
  const rhCoins = runs.reduce((sum, run) => sum + (Number(run.rhCoins) || 0), 0);
  const group = {
    ...(existing || {}),
    id: groupId,
    historyGroupId: groupId,
    canvasRunGroupId: groupId,
    isCanvasGroup: true,
    templateId: "canvas-group",
    templateName: item.canvasGroupLabel || existing?.templateName || "Canvas run",
    address: "Canvas",
    createdAt: existing?.createdAt || submittedAt,
    submittedAt,
    completedAt,
    durationMs: startedMs !== null && completedMs !== null ? Math.max(0, completedMs - startedMs) : null,
    rhCoins: rhCoins || null,
    outputs,
    runs,
    status: "success",
    provider: "canvas",
    canvasProjectId: item.canvasProjectId || existing?.canvasProjectId || "",
    result: {
      runId: groupId,
      provider: "canvas",
      submittedAt,
      completedAt,
      outputs
    }
  };

  return [group, ...list.filter(entry => !(entry?.isCanvasGroup && entry.id === groupId))];
}

export function normalizeCanvasHistory(history = []) {
  const list = Array.isArray(history) ? history : [];
  const legacyGroups = new Map();
  for (const item of list) {
    const match = String(item?.id || "").match(/^(canvas-q-\d+-\d+)-b(\d+)$/);
    if (!match || item.canvasRunGroupId) continue;
    const [, groupId, batchNumber] = match;
    if (!legacyGroups.has(groupId)) legacyGroups.set(groupId, []);
    legacyGroups.get(groupId).push({ item, batchIndex: Number(batchNumber) - 1 });
  }
  if (!legacyGroups.size) return list;

  const emitted = new Set();
  const normalized = [];
  for (const item of list) {
    const match = String(item?.id || "").match(/^(canvas-q-\d+-\d+)-b\d+$/);
    const groupId = match?.[1];
    if (!groupId || !legacyGroups.has(groupId)) {
      normalized.push(item);
      continue;
    }
    if (emitted.has(groupId)) continue;
    emitted.add(groupId);
    const entries = legacyGroups.get(groupId).sort((a, b) => a.batchIndex - b.batchIndex);
    let grouped = [];
    for (const entry of entries) {
      const run = decorateCanvasHistoryItem(entry.item, {
        canvasRunGroupId: groupId,
        canvasNodeName: entry.item.templateName || "Output",
        canvasGroupLabel: `Canvas · ${entry.item.templateName || "Batch"}`,
        canvasBatchIndex: entry.batchIndex,
        canvasBatchTotal: entries.length
      });
      grouped = mergeCanvasHistoryItem(grouped, run);
    }
    normalized.push(grouped[0]);
  }
  return normalized;
}
