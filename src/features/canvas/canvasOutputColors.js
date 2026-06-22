import { sourceIncomingEdge } from "./canvasModel.js";

export const OUTPUT_HANDLE_GAP = 14;

export const OUTPUT_COLOR_COUNT = 6;

/** Shared with StepNode handle classes (`output-color-N`) and edge classes (`canvas-edge-out-N`). */
export function outputColorClass(index) {
  const slot = ((index % OUTPUT_COLOR_COUNT) + OUTPUT_COLOR_COUNT) % OUTPUT_COLOR_COUNT;
  return `output-color-${slot}`;
}

export function outputEdgeClass(index) {
  if (!Number.isInteger(index) || index < 0) return "";
  const slot = index % OUTPUT_COLOR_COUNT;
  return `canvas-edge-out-${slot}`;
}

export function connectionLineClass(index) {
  if (!Number.isInteger(index) || index < 0) return "";
  const slot = index % OUTPUT_COLOR_COUNT;
  return `canvas-connection-out-${slot}`;
}

export function outputIndexForKey(outputs = [], outputKey = "") {
  if (!outputKey) return -1;
  return outputs.findIndex(port => port.key === outputKey);
}

export function outputIndexForHandle(outputs = [], sourceHandle = "") {
  if (!sourceHandle?.startsWith("out:")) return -1;
  return outputIndexForKey(outputs, sourceHandle.slice(4));
}

export function resolveEdgeOutputColorIndex(edge, nodes = [], edges = []) {
  if (!edge?.sourceHandle?.startsWith("out:")) return -1;
  const source = nodes.find(node => node.id === edge.source);
  if (!source) return -1;

  if (source.type === "step") {
    const outputs = source.data?.ports?.outputs || [];
    const index = outputIndexForHandle(outputs, edge.sourceHandle);
    return index >= 0 ? index : (outputs.length ? 0 : -1);
  }

  if (source.type === "source" && source.data?.passthroughFromOutput) {
    const upstream = nodes.find(node => node.id === source.data.passthroughSourceNodeId);
    if (upstream?.type === "step") {
      const outputKey = source.data.passthroughOutputKey || "main";
      const outputs = upstream.data?.ports?.outputs || [];
      const index = outputIndexForKey(outputs, outputKey);
      return index >= 0 ? index : (outputs.length ? 0 : -1);
    }
  }

  if (source.type === "source" && source.data?.passthroughFromInput) {
    const incoming = sourceIncomingEdge(source.id, edges);
    if (incoming) {
      return resolveEdgeOutputColorIndex({
        source: incoming.source,
        sourceHandle: incoming.sourceHandle
      }, nodes, edges);
    }
  }

  return -1;
}

export function resolveConnectionOutputColorIndex(node, handleId = "", nodes = [], edges = []) {
  if (!node || !handleId?.startsWith("out:")) return -1;

  if (node.type === "step") {
    const outputs = node.data?.ports?.outputs || [];
    const index = outputIndexForHandle(outputs, handleId);
    return index >= 0 ? index : (outputs.length ? 0 : -1);
  }

  if (node.type === "source" && node.data?.passthroughFromOutput) {
    const upstream = nodes.find(item => item.id === node.data.passthroughSourceNodeId);
    if (upstream?.type === "step") {
      const outputKey = node.data.passthroughOutputKey || "main";
      const outputs = upstream.data?.ports?.outputs || [];
      const index = outputIndexForKey(outputs, outputKey);
      return index >= 0 ? index : (outputs.length ? 0 : -1);
    }
  }

  if (node.type === "source" && node.data?.passthroughFromInput) {
    const incoming = sourceIncomingEdge(node.id, edges);
    if (incoming) {
      return resolveEdgeOutputColorIndex({
        source: incoming.source,
        sourceHandle: incoming.sourceHandle
      }, nodes, edges);
    }
  }

  return -1;
}
