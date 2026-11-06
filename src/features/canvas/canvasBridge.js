// Canvas side of the MCP bridge: what a chatbot sees and can do (pure helpers + handler slot).
import { getNodeRunCache, incomingEdgesByInput } from "./canvasModel.js";

let handler = null;
// Last run started through the bridge — module level, so switching Form ⇄ Canvas
// (which remounts the Canvas) does not lose track of it.
let lastRun = null;
export const getCanvasBridgeRun = () => lastRun;
export function setCanvasBridgeRun(run) {
  lastRun = run;
}

/** InfiniteCanvas registers itself while mounted. */
export function registerCanvasBridgeHandler(next) {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export const getCanvasBridgeHandler = () => handler;

function summarizeOutputs(node) {
  const cache = getNodeRunCache(node);
  if (!cache?.outputs?.length) return { outputs: [], runId: "" };
  return {
    runId: cache.runId || "",
    outputs: cache.outputs.map(output => ({ key: output.key || "main", url: output.url, filename: output.filename || "" }))
  };
}

/** Compact, chatbot-readable view of the graph. Values keep their stored form. */
export function summarizeCanvas(nodes = [], edges = []) {
  const items = nodes.map(node => {
    const base = { id: node.id, type: node.type, name: node.data?.name || "" };
    if (node.type === "source") {
      return {
        ...base,
        sourceType: node.data?.port?.type || node.data?.sourceType || "image",
        inputs: [{ key: "main", type: node.data?.port?.type || node.data?.sourceType || "image", value: node.data?.values?.main ?? "" }]
      };
    }
    if (node.type !== "step") return base;
    const incoming = incomingEdgesByInput(node.id, edges);
    return {
      ...base,
      kind: node.data?.kind,
      template: node.data?.ref,
      bypassed: Boolean(node.data?.bypassed),
      status: node.data?.status || "idle",
      error: node.data?.error || "",
      inputs: (node.data?.ports?.inputs || []).map(port => ({
        key: port.valueKey || port.key,
        label: port.label,
        type: port.type,
        uiType: port.uiType,
        ...(port.choices?.length ? { choices: port.choices } : {}),
        value: node.data?.values?.[port.valueKey || port.key] ?? null,
        ...(incoming[port.valueKey || port.key] ? { connectedFrom: incoming[port.valueKey || port.key].source } : {})
      })),
      ...summarizeOutputs(node)
    };
  });
  return {
    nodes: items,
    edges: edges.map(edge => ({ from: edge.source, fromPort: String(edge.sourceHandle || "").replace(/^out:/, ""), to: edge.target, toPort: String(edge.targetHandle || "").replace(/^in:/, "") }))
  };
}

/** Rejects unknown nodes / inputs and inputs fed by a connection (the value would be ignored). */
export function validateNodeValues(node, values, edges) {
  if (!node) throw new Error("Không có node này trong workflow đang mở.");
  if (node.type !== "step" && node.type !== "source") throw new Error("Node này không có giá trị để sửa.");
  const keys = node.type === "source" ? ["main"] : (node.data?.ports?.inputs || []).map(port => port.valueKey || port.key);
  const incoming = node.type === "step" ? incomingEdgesByInput(node.id, edges) : {};
  for (const key of Object.keys(values || {})) {
    if (!keys.includes(key)) throw new Error(`Node "${node.data?.name || node.id}" không có input "${key}". Có: ${keys.join(", ")}`);
    if (incoming[key]) throw new Error(`Input "${key}" đang nhận dữ liệu từ node ${incoming[key].source} — sửa ở node đó.`);
  }
}

/** State of the last run started through the bridge. */
export function canvasRunState(run, nodes, busy, now = Date.now(), graceMs = 15000) {
  // Busy first: a run may have been started from the app, or the Canvas remounted.
  if (busy) return "running";
  if (!run) return "idle";
  const targets = nodes.filter(node => node.type === "step" && !node.data?.bypassed && (!run.nodeId || node.id === run.nodeId));
  if (targets.some(node => node.data?.status === "error")) return "error";
  if (targets.length && targets.every(node => (getNodeRunCache(node)?.runAt || 0) >= run.startedAt)) return "done";
  return now - run.startedAt < graceMs ? "running" : "stopped";
}
