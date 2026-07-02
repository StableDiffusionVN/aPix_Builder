import { expandFolderImageValues, readLocalFolderValue } from "../../lib/localImageFolder.js";
import { activeStepInputPorts, imageDisplayUrl, portTypeForUi } from "./canvasModel.js";

function batchEntriesForValue(value) {
  if (Array.isArray(value) && value.length > 0) return value;
  if (readLocalFolderValue(value)) return [readLocalFolderValue(value)];
  return [];
}

function valueLooksLikeImageBatch(value) {
  const entries = batchEntriesForValue(value);
  return entries.some(entry => readLocalFolderValue(entry) || imageDisplayUrl(entry));
}

export function canvasNodeImageValueKeys(node) {
  const values = node?.data?.values || {};
  const keys = new Set();
  if (node?.type === "source") {
    const type = node.data?.port?.type || portTypeForUi(node.data?.port?.uiType) || node.data?.sourceType;
    if (type === "image") keys.add("main");
  }
  const inputPorts = node?.type === "step"
    ? activeStepInputPorts(node?.data?.ports?.inputs || [], values)
    : node?.data?.ports?.inputs || [];
  const activeImageKeys = new Set();
  for (const port of inputPorts) {
    const type = port.type || portTypeForUi(port.uiType);
    if (type === "image" && port.valueKey) {
      keys.add(port.valueKey);
      activeImageKeys.add(port.valueKey);
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (node?.type === "step" && inputPorts.length && !activeImageKeys.has(key)) continue;
    if (valueLooksLikeImageBatch(value)) keys.add(key);
  }
  return [...keys].filter(key => key in values);
}

function collectRelevantNodeIds(rootNodeId, edges = []) {
  if (!rootNodeId) return null;
  const relevant = new Set([rootNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (!relevant.has(edge.target) || relevant.has(edge.source)) continue;
      relevant.add(edge.source);
      changed = true;
    }
  }
  return relevant;
}

async function prepareBatchNode(node, relevantNodeIds) {
  if (relevantNodeIds && !relevantNodeIds.has(node.id)) return node;
  const keys = canvasNodeImageValueKeys(node);
  if (!keys.length) return node;
  const values = await expandFolderImageValues(node.data?.values || {}, keys);
  return {
    ...node,
    data: {
      ...node.data,
      values
    }
  };
}

function readBatchSize(nodes, relevantNodeIds) {
  let size = 1;
  for (const node of nodes) {
    if (relevantNodeIds && !relevantNodeIds.has(node.id)) continue;
    const values = node.data?.values || {};
    for (const key of canvasNodeImageValueKeys(node)) {
      const entries = batchEntriesForValue(values[key]);
      if (entries.length > size) size = entries.length;
    }
  }
  return size;
}

function nodeForBatchIndex(node, index, relevantNodeIds) {
  if (relevantNodeIds && !relevantNodeIds.has(node.id)) return node;
  const keys = canvasNodeImageValueKeys(node);
  if (!keys.length) return node;
  const values = { ...(node.data?.values || {}) };
  for (const key of keys) {
    const entries = batchEntriesForValue(values[key]);
    if (!entries.length) continue;
    values[key] = entries[Math.min(index, entries.length - 1)];
  }
  return {
    ...node,
    data: {
      ...node.data,
      values
    }
  };
}

export async function expandCanvasRunSnapshotImageBatches(snapshot, { rootNodeId = "" } = {}) {
  const relevantNodeIds = collectRelevantNodeIds(rootNodeId, snapshot.edges || []);
  const preparedNodes = await Promise.all(
    (snapshot.nodes || []).map(node => prepareBatchNode(node, relevantNodeIds))
  );
  const batchSize = readBatchSize(preparedNodes, relevantNodeIds);
  if (batchSize <= 1) {
    return [{ ...snapshot, nodes: preparedNodes }];
  }
  return Array.from({ length: batchSize }, (_, index) => ({
    ...snapshot,
    nodes: preparedNodes.map(node => nodeForBatchIndex(node, index, relevantNodeIds)),
    batch: {
      index,
      total: batchSize
    }
  }));
}

export async function expandCanvasRunJobImageBatches(job, options = {}) {
  const snapshots = await expandCanvasRunSnapshotImageBatches(job.snapshot, options);
  if (snapshots.length <= 1) {
    return [{ ...job, snapshot: snapshots[0] || job.snapshot }];
  }
  return snapshots.map((snapshot, index) => ({
    ...job,
    runId: `${job.runId}-b${index + 1}`,
    jobLabel: `${job.jobLabel || "Canvas run"} (${index + 1}/${snapshots.length})`,
    snapshot
  }));
}
