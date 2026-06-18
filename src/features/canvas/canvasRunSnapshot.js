import { buildRhRunAuth, hasRhApiKey } from "../../lib/rhTokenPool.js";
import { STEP_KINDS } from "./canvasModel.js";

/** Deep-copy canvas graph + RH settings at command send time. */
export function captureCanvasRunSnapshot({ nodes, edges, rhSettings }) {
  return {
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    rhSettings: structuredClone(rhSettings),
    rhAuth: buildRhRunAuth(rhSettings),
    capturedAt: new Date().toISOString()
  };
}

export function createCanvasRunJob({
  nodes,
  edges,
  rhSettings,
  type,
  nodeId,
  jobLabel,
  sequence
}) {
  return {
    type,
    nodeId,
    jobLabel,
    runId: `canvas-q-${Date.now()}-${sequence}`,
    queuedAt: new Date().toISOString(),
    snapshot: captureCanvasRunSnapshot({ nodes, edges, rhSettings })
  };
}

export function snapshotHasRhSteps(snapshot) {
  return snapshot.nodes.some(node => node.type === "step" && (
    node.data?.kind === STEP_KINDS.RH_APP || node.data?.kind === STEP_KINDS.RH_WF
  ));
}

export function snapshotRhApiKeyReady(snapshot) {
  return !snapshotHasRhSteps(snapshot) || hasRhApiKey(snapshot.rhSettings);
}
