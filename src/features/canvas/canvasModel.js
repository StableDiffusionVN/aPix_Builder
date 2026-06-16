// @ts-check
import { flattenInputs, itemValueKey, normalizeId } from "../../lib/template.js";
import { nodeFieldKey } from "../../hooks/useRunningHub.js";

/** Execution mode → human label + scope used to load YAML config. */
export const STEP_KINDS = {
  LOCAL: "local",
  RH_WF: "runninghub-wf",
  RH_APP: "runninghub-app"
};

/** Map a YAML ui.type to a canonical port data type. */
export function portTypeForUi(uiType) {
  const type = String(uiType || "").toLowerCase();
  if (type === "image" || type === "image_mask" || type === "file") return "image";
  if (type === "text" || type === "string") return "text";
  if (type === "int" || type === "float" || type === "number" || type === "slider" || type === "seed") return "number";
  if (type === "checkbox" || type === "boolean") return "boolean";
  if (
    type === "dropdown"
    || type === "menu"
    || type === "menu-sub"
    || type === "radio"
    || type === "list"
    || type === "checkpoints"
    || type === "checkpoint"
    || type === "loras"
    || type === "lora"
  ) return "choice";
  return "any";
}

export function isImagePortType(type) {
  return type === "image";
}

/** Normalize a YAML ui.choices value (array or delimited string) to an array. */
export function parseChoiceList(choices) {
  if (Array.isArray(choices)) return choices.map(String);
  if (typeof choices === "string") {
    return choices.split(/[\n,]/).map(part => part.trim()).filter(Boolean);
  }
  return null;
}

/** Input port types that can be fed by an upstream node / source node. */
export function isConnectablePortType(type) {
  return Boolean(type);
}

/** Whether an upstream output port can feed a downstream input port. */
export function arePortsCompatible(outputType, inputType) {
  if (!outputType || !inputType) return false;
  if (outputType === inputType) return true;
  // Outputs are images; allow connecting into "any" sinks too.
  return inputType === "any" || outputType === "any";
}

/**
 * Build input/output port descriptors from a loaded template YAML config.
 * Every editable input is exposed as a connectable port.
 */
export function deriveStepPorts(config) {
  const inputs = flattenInputs(config?.input || {})
    .filter(item => item.ui && item.ui.type !== "note" && item.ui.type !== "markdown")
    .map(item => {
      const type = portTypeForUi(item.ui?.type);
      return {
        key: item.key,
        valueKey: itemValueKey(item) || normalizeId(item.id),
        label: item.ui?.label || item.key,
        uiType: item.ui?.type,
        type,
        choices: parseChoiceList(item.ui?.choices),
        menuLabelSyntax: item.ui?.menuLabelSyntax === true,
        minimum: item.ui?.minimum,
        maximum: item.ui?.maximum,
        step: item.ui?.step,
        connectable: isConnectablePortType(type)
      };
    });

  const outputEntries = Object.entries(config?.output || {});
  const outputs = outputEntries.length
    ? outputEntries.map(([key, item]) => ({
        key,
        label: item?.ui?.label || key,
        type: "image"
      }))
    : [{ key: "main", label: "Output", type: "image" }];

  return { inputs, outputs };
}

/** Ports for a RunningHub App node, derived from its nodeInfoList. */
export function deriveRhAppPorts(nodes = []) {
  const inputs = nodes.map(node => {
    const fieldType = String(node.fieldType || "").toLowerCase();
    const type = fieldType === "image" ? "image" : portTypeForUi(fieldType);
    const key = `${node.nodeId}|${node.fieldName}`;
    return {
      key,
      valueKey: key,
      label: node.fieldName || key,
      uiType: node.fieldType,
      type,
      choices: parseChoiceList(node.choices),
      connectable: isConnectablePortType(type)
    };
  });
  return { inputs, outputs: [{ key: "main", label: "Output", type: "image" }] };
}

/** Defaults for RH App nodes on canvas — image fields start empty (RH fieldValue is often a broken placeholder). */
export function buildCanvasNodeDefaults(nodes = []) {
  const values = {};
  for (const node of nodes) {
    const key = nodeFieldKey(node);
    const isImage = String(node.fieldType || "").toLowerCase() === "image";
    values[key] = isImage ? "" : (node.fieldValue ?? "");
  }
  return values;
}

/** Remove untouched RH placeholder image values when loading a saved project. */
export function stripRhDefaultImages(node) {
  if (node.type !== "step" || node.data?.kind !== STEP_KINDS.RH_APP) return node;
  const templateNodes = node.data.nodes || [];
  const values = { ...(node.data.values || {}) };
  let changed = false;
  for (const tpl of templateNodes) {
    if (String(tpl.fieldType || "").toLowerCase() !== "image") continue;
    const key = nodeFieldKey(tpl);
    if (values[key] && values[key] === tpl.fieldValue) {
      values[key] = "";
      changed = true;
    }
  }
  return changed ? { ...node, data: { ...node.data, values } } : node;
}

/** Topological order of node ids; falls back to insertion order on cycles. */
export function topoOrder(nodes, edges) {
  const ids = nodes.map(node => node.id);
  const indegree = new Map(ids.map(id => [id, 0]));
  const adjacency = new Map(ids.map(id => [id, []]));
  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    adjacency.get(edge.source).push(edge.target);
  }
  const queue = ids.filter(id => (indegree.get(id) || 0) === 0);
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    for (const next of adjacency.get(id) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  // Append any nodes left out due to cycles, preserving order.
  for (const id of ids) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

/** Edges that feed a given node's input ports → { [valueKey]: edge }. */
export function incomingEdgesByInput(nodeId, edges) {
  const map = {};
  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const handle = edge.targetHandle || "";
    const key = handle.startsWith("in:") ? handle.slice(3) : handle;
    if (key) map[key] = edge;
  }
  return map;
}

function isBypassedStep(node) {
  return node?.type === "step" && Boolean(node.data?.bypassed);
}

/**
 * Walk through bypassed step nodes to the real image source for a linked input.
 */
export function resolveEffectiveImageSource(nodeId, sourceHandle, nodes, edges, visited = new Set()) {
  if (!nodeId || visited.has(nodeId)) return null;
  visited.add(nodeId);
  const node = nodes.find(item => item.id === nodeId);
  if (!node) return null;

  if (isBypassedStep(node)) {
    const incoming = incomingEdgesByInput(nodeId, edges);
    for (const port of node.data?.ports?.inputs || []) {
      const type = port.type || portTypeForUi(port.uiType);
      if (type !== "image") continue;
      const edge = incoming[port.valueKey];
      if (!edge) continue;
      return resolveEffectiveImageSource(edge.source, edge.sourceHandle, nodes, edges, visited);
    }
    return null;
  }

  return { node, sourceHandle };
}

/** Resolve upstream output, skipping bypassed step nodes (pass-through). */
export function resolveEffectiveNodeOutputValue(targetPort, edge, nodes, edges, visited = new Set()) {
  if (!edge) return undefined;
  const sourceId = edge.source;
  if (visited.has(sourceId)) return undefined;
  visited.add(sourceId);
  const source = nodes.find(item => item.id === sourceId);
  if (!source) return undefined;

  if (isBypassedStep(source)) {
    const incoming = incomingEdgesByInput(sourceId, edges);
    const targetType = targetPort?.type || portTypeForUi(targetPort?.uiType);
    for (const port of source.data?.ports?.inputs || []) {
      const type = port.type || portTypeForUi(port.uiType);
      if (targetType && type !== targetType) continue;
      const upEdge = incoming[port.valueKey];
      if (!upEdge) continue;
      return resolveEffectiveNodeOutputValue(port, upEdge, nodes, edges, visited);
    }
    if (targetType === "image") {
      for (const port of source.data?.ports?.inputs || []) {
        if ((port.type || portTypeForUi(port.uiType)) !== "image") continue;
        const upEdge = incoming[port.valueKey];
        if (!upEdge) continue;
        return resolveEffectiveNodeOutputValue(port, upEdge, nodes, edges, visited);
      }
    }
    return undefined;
  }

  return nodeOutputValue(source, edge.sourceHandle, nodes);
}

export function resolveEffectiveNodeOutputUrl(nodeId, sourceHandle, nodes, edges, visited = new Set()) {
  const resolved = resolveEffectiveImageSource(nodeId, sourceHandle, nodes, edges, visited);
  if (!resolved) return "";
  return nodeOutputUrl(resolved.node, resolved.sourceHandle, nodes);
}

export function effectiveHasNodeImageOutput(nodeId, sourceHandle, nodes, edges, visited = new Set()) {
  return Boolean(resolveEffectiveNodeOutputUrl(nodeId, sourceHandle, nodes, edges, visited));
}

/** Resolve a displayable image URL from a node field value. */
export function imageDisplayUrl(value) {
  if (!value) return "";
  if (typeof value === "string") {
    if (value.startsWith("data:")) return value;
    if (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")) return value;
    return "";
  }
  if (value?.kind === "input-image" && value.url) return value.url;
  return "";
}

/** Normalize any canvas image field / upstream output to a URL string. */
export function coerceImageRef(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if (typeof value.url === "string") return value.url.trim();
    if (value.kind === "input-image" && typeof value.url === "string") return value.url.trim();
  }
  return "";
}

/** Read persisted run output cache for a step node (survives until re-run / delete / switch project). */
export function getNodeRunCache(node) {
  const cache = node?.data?.runCache;
  if (cache?.outputs?.length) {
    return {
      outputs: cache.outputs,
      primary: cache.primary || cache.outputs[0] || null,
      runAt: cache.runAt || 0,
      runId: cache.runId || "",
      durationMs: Number.isFinite(cache.durationMs) ? cache.durationMs : null,
      rhCoins: cache.rhCoins ?? null,
      provider: cache.provider || ""
    };
  }
  const legacyOutputs = node?.data?.outputs || [];
  const legacyOutput = node?.data?.output;
  if (legacyOutput?.url || legacyOutputs.some(item => item?.url)) {
    const outputs = legacyOutputs.length
      ? legacyOutputs
      : legacyOutput
        ? [legacyOutput]
        : [];
    return {
      outputs,
      primary: legacyOutput || outputs[0] || null,
      runAt: node?.data?.lastRunAt || 0,
      runId: "",
      durationMs: null,
      rhCoins: null,
      provider: ""
    };
  }
  return null;
}

export function buildNodeRunCache(outputs, runId = "", metadata = {}) {
  const list = (outputs || [])
    .filter(item => item?.url)
    .map(item => ({
      url: item.url,
      key: item.key || "main",
      filename: item.filename || ""
    }));
  return {
    outputs: list,
    primary: list[0] || null,
    runAt: Date.now(),
    runId: runId || "",
    durationMs: Number.isFinite(metadata.durationMs) ? metadata.durationMs : null,
    rhCoins: metadata.rhCoins ?? null,
    provider: metadata.provider || ""
  };
}

/** Patch node.data after a successful run — writes runCache + mirrored output fields. */
export function nodeRunCachePatch(outputs, runId = "", metadata = {}) {
  const runCache = buildNodeRunCache(outputs, runId, metadata);
  return {
    runCache,
    output: runCache.primary,
    outputs: runCache.outputs,
    lastRunAt: runCache.runAt,
    status: "done",
    error: ""
  };
}

/** Clear run cache when a node is explicitly re-run. */
export function clearNodeRunCachePatch() {
  return {
    runCache: null,
    output: null,
    outputs: [],
    lastRunAt: null
  };
}

export const NODE_EXEC_START = { status: "running", error: "" };

export function beginNodeExecutionPatch() {
  return { ...clearNodeRunCachePatch(), ...NODE_EXEC_START };
}

/** Read an upstream node's cached output URL from a source handle id. */
export function nodeOutputUrl(node, sourceHandle, nodes) {
  if (!node) return "";
  if (node.type === "source") {
    if (node.data?.passthroughFromOutput && node.data?.passthroughSourceNodeId && nodes) {
      const upstream = nodes.find(item => item.id === node.data.passthroughSourceNodeId);
      if (upstream) {
        const key = node.data.passthroughOutputKey || "main";
        return nodeOutputUrl(upstream, `out:${key}`, nodes);
      }
    }
    return coerceImageRef(node.data?.values?.main);
  }
  const cache = getNodeRunCache(node);
  if (!cache) return "";
  const outputs = cache.outputs;
  if (sourceHandle?.startsWith("out:")) {
    const key = sourceHandle.slice(4);
    const match = outputs.find(output => output.key === key);
    if (match?.url) return coerceImageRef(match.url);
  }
  return coerceImageRef(cache.primary?.url || outputs[0]?.url);
}

/** Read a typed output value. Step outputs remain image URLs; source outputs preserve their raw value. */
export function nodeOutputValue(node, sourceHandle, nodes) {
  if (!node) return undefined;
  if (node.type === "source") {
    if (node.data?.passthroughFromOutput && node.data?.passthroughSourceNodeId && nodes) {
      const upstream = nodes.find(item => item.id === node.data.passthroughSourceNodeId);
      if (upstream) {
        const key = node.data.passthroughOutputKey || "main";
        return nodeOutputValue(upstream, `out:${key}`, nodes);
      }
    }
    return node.data?.values?.main;
  }
  return nodeOutputUrl(node, sourceHandle, nodes) || undefined;
}

export function hasNodeImageOutput(node, sourceHandle) {
  return Boolean(nodeOutputUrl(node, sourceHandle));
}

/** Local server path for output/input image refs (strips preview cache-bust ?v=). */
export function toServerImagePath(url) {
  if (!url) return "";
  let parsed;
  try {
    parsed = url.startsWith("/")
      ? new URL(url, "http://localhost")
      : new URL(url, window.location.href);
  } catch {
    return "";
  }
  if (parsed.pathname !== "/api/output-image" && parsed.pathname !== "/api/input-image") {
    return "";
  }
  parsed.searchParams.delete("v");
  const qs = parsed.searchParams.toString();
  return `${parsed.pathname}${qs ? `?${qs}` : ""}`;
}

/** Check local server image file exists (HEAD with GET fallback). */
export async function serverImageFileExists(serverPath) {
  if (!serverPath) return true;
  try {
    const headResponse = await fetch(serverPath, { method: "HEAD" });
    if (headResponse.ok) return true;

    // Older backend processes only route GET for image endpoints, so HEAD may
    // return a false 404 even while the file is available.
    const response = await fetch(serverPath, {
      method: "GET",
      headers: { Range: "bytes=0-0" }
    });
    if (response.ok) return true;
    if (response.status === 404) return false;
    return response.status === 206 ? true : null;
  } catch {
    return null;
  }
}

/** True when cache has a URL and the backing server file exists (if local). */
export async function isNodeCacheReady(node, sourceHandle) {
  const url = nodeOutputUrl(node, sourceHandle);
  if (!url) return false;
  const serverPath = toServerImagePath(url);
  if (!serverPath) return true;
  const exists = await serverImageFileExists(serverPath);
  if (exists === true) return true;
  if (exists === false) return false;
  // Network/unknown — trust completed node cache (preview already shows output).
  return node?.data?.status === "done" && Boolean(getNodeRunCache(node)?.outputs?.length);
}

/** True when every cached output URL for a step node is still usable. */
export async function isNodeRunCacheReady(node) {
  const cache = getNodeRunCache(node);
  if (!cache?.outputs?.length) return false;
  for (const output of cache.outputs) {
    const url = coerceImageRef(output?.url);
    if (!url) return false;
    const serverPath = toServerImagePath(url);
    if (!serverPath) continue;
    const exists = await serverImageFileExists(serverPath);
    if (exists === false) return false;
  }
  return true;
}

/** @deprecated Use clearNodeRunCachePatch + NODE_EXEC_START for execution lifecycle. */
export const NODE_RUN_RESET = {
  status: "idle",
  error: "",
  ...clearNodeRunCachePatch()
};

/** Append cache-bust query param so compare previews refresh after re-runs. */
export function withImageCacheBust(url, version) {
  if (!url || !version) return url || "";
  const token = String(version);
  try {
    const parsed = new URL(url, "http://localhost");
    parsed.searchParams.set("v", token);
    if (url.startsWith("/")) return `${parsed.pathname}${parsed.search}`;
    return parsed.toString();
  } catch {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}v=${encodeURIComponent(token)}`;
  }
}

/** Upstream node feeding the first linked image input, if any. */
export function findLinkedImageSource(node, nodes, edges) {
  if (!node) return null;
  const incoming = incomingEdgesByInput(node.id, edges);
  for (const port of node.data?.ports?.inputs || []) {
    const type = port.type || portTypeForUi(port.uiType);
    if (type !== "image") continue;
    const edge = incoming[port.valueKey];
    if (!edge) continue;
    const resolved = resolveEffectiveImageSource(edge.source, edge.sourceHandle, nodes, edges);
    return resolved?.node || null;
  }
  return null;
}

/** First image input URL for a node — linked upstream output or local field value. */
export function findNodeInputImageUrl(node, nodes, edges) {
  if (!node) return "";
  const inputs = node.data?.ports?.inputs || [];
  const incoming = incomingEdgesByInput(node.id, edges);
  const imagePorts = inputs.filter(port => (port.type || portTypeForUi(port.uiType)) === "image");

  // Prefer linked upstream outputs so stale local uploads on other ports are ignored.
  for (const port of imagePorts) {
    const edge = incoming[port.valueKey];
    if (!edge) continue;
    const url = resolveEffectiveNodeOutputUrl(edge.source, edge.sourceHandle, nodes, edges);
    if (url) return url;
  }

  for (const port of imagePorts) {
    if (incoming[port.valueKey]) continue;
    const url = imageDisplayUrl(node.data?.values?.[port.valueKey]);
    if (url) return url;
  }
  return "";
}

/** All step node ids downstream of a source (BFS). */
export function downstreamStepIds(sourceId, edges, nodes) {
  const stepIds = new Set(nodes.filter(node => node.type === "step").map(node => node.id));
  const visited = new Set();
  const queue = [sourceId];
  const result = [];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of edges) {
      if (edge.source !== id || !stepIds.has(edge.target) || visited.has(edge.target)) continue;
      result.push(edge.target);
      queue.push(edge.target);
    }
  }
  return result;
}

/**
 * Step nodes upstream that must run first — linked input has no cache URL.
 * Returns ids in run order (deepest upstream first).
 */
export async function upstreamStepsNeedingRunAsync(targetId, nodes, edges, visited = new Set()) {
  return upstreamStepsNeedingRun(targetId, nodes, edges, visited);
}

/**
 * Step nodes upstream whose cache URL exists but the server file is missing.
 * Used only when file validation fails — not for initial planning.
 */
export async function upstreamStepsWithStaleFilesAsync(targetId, nodes, edges, visited = new Set()) {
  const ordered = [];
  const node = nodes.find(item => item.id === targetId);
  if (!node) return ordered;

  const incoming = incomingEdgesByInput(targetId, edges);
  for (const port of node.data?.ports?.inputs || []) {
    const type = port.type || portTypeForUi(port.uiType);
    if (type !== "image") continue;
    const edge = incoming[port.valueKey];
    if (!edge) continue;
    const resolved = resolveEffectiveImageSource(edge.source, edge.sourceHandle, nodes, edges);
    if (!resolved || resolved.node.type !== "step") continue;
    const source = resolved.node;
    if (!hasNodeImageOutput(source, resolved.sourceHandle)) continue;
    if (await isNodeCacheReady(source, resolved.sourceHandle)) continue;
    if (visited.has(source.id)) continue;
    visited.add(source.id);
    ordered.push(...await upstreamStepsWithStaleFilesAsync(source.id, nodes, edges, visited));
    ordered.push(source.id);
  }
  return ordered;
}

/** Sync variant — cache URL only, no file check (used where async is unavailable). */
export function upstreamStepsNeedingRun(targetId, nodes, edges, visited = new Set()) {
  const ordered = [];
  const node = nodes.find(item => item.id === targetId);
  if (!node) return ordered;

  const incoming = incomingEdgesByInput(targetId, edges);
  for (const port of node.data?.ports?.inputs || []) {
    const type = port.type || portTypeForUi(port.uiType);
    if (type !== "image") continue;
    const edge = incoming[port.valueKey];
    if (!edge) continue;
    const resolved = resolveEffectiveImageSource(edge.source, edge.sourceHandle, nodes, edges);
    if (!resolved || resolved.node.type !== "step") continue;
    const source = resolved.node;
    if (hasNodeImageOutput(source, resolved.sourceHandle)) continue;
    if (visited.has(source.id)) continue;
    visited.add(source.id);
    ordered.push(...upstreamStepsNeedingRun(source.id, nodes, edges, visited));
    ordered.push(source.id);
  }
  return ordered;
}

/** Linked image inputs with no usable cache on the source node. */
export async function linkedImageInputsMissingSourceAsync(node, nodes, edges) {
  return linkedImageInputsMissingSource(node, nodes, edges);
}

/** Linked image inputs whose source node has no cached image yet (URL check only). */
export function linkedImageInputsMissingSource(node, nodes, edges) {
  const missing = [];
  if (!node) return missing;
  const incoming = incomingEdgesByInput(node.id, edges);
  for (const port of node.data?.ports?.inputs || []) {
    const type = port.type || portTypeForUi(port.uiType);
    if (type !== "image") continue;
    const edge = incoming[port.valueKey];
    if (!edge) continue;
    const resolved = resolveEffectiveImageSource(edge.source, edge.sourceHandle, nodes, edges);
    const source = resolved?.node || nodes.find(item => item.id === edge.source);
    if (!source) continue;
    const sourceHandle = resolved?.sourceHandle || edge.sourceHandle;
    if (hasNodeImageOutput(source, sourceHandle)) continue;
    missing.push({
      port,
      source,
      canAutoRun: source.type === "step"
    });
  }
  return missing;
}
