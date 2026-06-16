import {
  coerceImageRef,
  getNodeRunCache,
  imageDisplayUrl,
  incomingEdgesByInput,
  portTypeForUi
} from "./canvasModel.js";
import { CANVAS_NODE_DEFAULT_WIDTH, CANVAS_NODE_MIN_HEIGHT } from "./CanvasNodeResizeHandles.jsx";

/** Layout constants aligned with canvas.css node chrome (border-box sizing). */
const HEADER_HEIGHT = 38;
const BODY_PADDING_Y = 16;
const BODY_ROW_GAP = 8;
const FIELD_LABEL_HEIGHT = 14;
const FIELD_INNER_GAP = 3;
const LINKED_ROW_HEIGHT = 28;
const UPLOAD_BTN_HEIGHT = 30;
const URL_FORM_HEIGHT = 28;
const IMAGE_FIELD_GAP = 6;
const TEXTAREA_HEIGHT = 48;
const INPUT_CONTROL_HEIGHT = 26;
const EMPTY_BODY_HEIGHT = 24;
const ERROR_ROW_HEIGHT = 27;
const LAYOUT_ROUNDING = 4;

/** Vertical padding on `.canvasNodePreview` (8px top + bottom). */
export const OUTPUT_PREVIEW_PADDING_Y = 16;

/** Minimum preview stage height (matches `.canvasNodePreviewStage { min-height: 72px }`). */
export const OUTPUT_PREVIEW_STAGE_MIN_HEIGHT = 72;

/** Passthrough output node linked from a step's output handle. */
export function findOutputPassthroughNode(stepId, outputKey, nodes, edges) {
  const sourceHandle = `out:${outputKey}`;
  const outEdge = edges.find(edge => (
    edge.source === stepId && edge.sourceHandle === sourceHandle
  ));
  if (!outEdge || outEdge.targetHandle !== "in:main") return null;

  const target = nodes.find(node => node.id === outEdge.target);
  if (!target?.data?.passthroughFromOutput) return null;
  if (target.data.passthroughSourceNodeId !== stepId) return null;
  if ((target.data.passthroughOutputKey || "main") !== outputKey) return null;
  return target;
}

export function isStepOutputDetached(stepId, outputKey, nodes, edges) {
  return Boolean(findOutputPassthroughNode(stepId, outputKey, nodes, edges));
}

function estimateInputFieldHeight(port, value, linked, nodeWidth) {
  const type = port.type || portTypeForUi(port.uiType);
  const labelBlock = FIELD_LABEL_HEIGHT + FIELD_INNER_GAP;

  if (linked) {
    return labelBlock + LINKED_ROW_HEIGHT;
  }

  if (type === "image") {
    const innerWidth = Math.max(nodeWidth - 16, 100);
    if (imageDisplayUrl(value)) {
      return labelBlock + innerWidth + IMAGE_FIELD_GAP + URL_FORM_HEIGHT;
    }
    return labelBlock + UPLOAD_BTN_HEIGHT + IMAGE_FIELD_GAP + URL_FORM_HEIGHT;
  }

  if (type === "text") {
    return labelBlock + TEXTAREA_HEIGHT;
  }

  if (type === "boolean") {
    return Math.max(INPUT_CONTROL_HEIGHT, labelBlock + INPUT_CONTROL_HEIGHT);
  }

  return labelBlock + INPUT_CONTROL_HEIGHT;
}

export function stepOutputPreviewIsVisible(node, nodes = [], edges = []) {
  if (!node || node.type !== "step") return false;
  const outputs = node.data?.ports?.outputs || [];
  if (!outputs.length) return false;

  if (outputs.every(port => isStepOutputDetached(node.id, port.key, nodes, edges))) {
    return false;
  }

  const cache = getNodeRunCache(node);
  return Boolean(
    coerceImageRef(cache?.primary?.url)
    || cache?.outputs?.some(output => coerceImageRef(output?.url))
  );
}

/** Estimate output compare-preview block height when output is shown on the step node. */
export function estimateOutputPreviewBlockHeight(node, nodeWidth = CANVAS_NODE_DEFAULT_WIDTH, nodes = [], edges = []) {
  if (!stepOutputPreviewIsVisible(node, nodes, edges)) return 0;

  const innerWidth = Math.max(nodeWidth - 16, 100);
  const stageHeight = Math.max(OUTPUT_PREVIEW_STAGE_MIN_HEIGHT, innerWidth);
  return OUTPUT_PREVIEW_PADDING_Y + stageHeight;
}

/**
 * Estimate minimum step node height for header, inputs, optional output preview, and error row.
 */
export function estimateStepNodeMinHeight(node, edges = [], nodes = []) {
  if (!node || node.type !== "step") return CANVAS_NODE_MIN_HEIGHT;

  const width = node.data?.size?.width || CANVAS_NODE_DEFAULT_WIDTH;
  const values = node.data?.values || {};
  const inputs = node.data?.ports?.inputs || [];
  const incoming = incomingEdgesByInput(node.id, edges);

  let height = HEADER_HEIGHT;

  let bodyHeight = BODY_PADDING_Y;
  if (!inputs.length) {
    bodyHeight += EMPTY_BODY_HEIGHT;
  } else {
    inputs.forEach((port, index) => {
      if (index > 0) bodyHeight += BODY_ROW_GAP;
      const linked = Boolean(incoming[port.valueKey]);
      bodyHeight += estimateInputFieldHeight(
        port,
        values[port.valueKey],
        linked,
        width
      );
    });
  }
  height += bodyHeight;

  height += estimateOutputPreviewBlockHeight(node, width, nodes, edges);

  if (node.data?.error) {
    height += ERROR_ROW_HEIGHT;
  }

  height += LAYOUT_ROUNDING;

  return Math.max(CANVAS_NODE_MIN_HEIGHT, Math.ceil(height));
}

/** Drop fixed height so the node auto-fits content; keep custom width if set. */
export function compactStepNodeSize(width = CANVAS_NODE_DEFAULT_WIDTH) {
  return { width };
}

/** Minimum height clamp for canvas node resize handles. */
export function estimateCanvasNodeMinHeight(node, edges = [], nodes = []) {
  if (node?.type === "step") return estimateStepNodeMinHeight(node, edges, nodes);
  return CANVAS_NODE_MIN_HEIGHT;
}

/** Strip legacy detachedOutputs flags; output split state is derived from graph edges. */
export function normalizeOutputSplitNodes(nodes, edges) {
  const list = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];
  return list.map(node => {
    let next = node;
    if (node.type === "step" && node.data?.detachedOutputs) {
      const { detachedOutputs: _omit, ...rest } = node.data;
      next = { ...node, data: rest };
    }
    if (node.type === "source" && node.data?.passthroughFromOutput) {
      const stepId = node.data.passthroughSourceNodeId;
      const outputKey = node.data.passthroughOutputKey || "main";
      const linked = stepId && isStepOutputDetached(stepId, outputKey, list, edgeList);
      if (!linked || findOutputPassthroughNode(stepId, outputKey, list, edgeList)?.id !== node.id) {
        const { passthroughFromOutput: _p, passthroughSourceNodeId: _s, passthroughOutputKey: _k, ...rest } = node.data;
        next = { ...node, data: rest };
      }
    }
    return next;
  });
}

/** Undo output split when a passthrough source node is deleted. */
export function restoreOutputPassthroughOnRemove(nodes, edges, passthroughId) {
  const passthrough = nodes.find(node => node.id === passthroughId);
  if (!passthrough?.data?.passthroughFromOutput) return null;

  const stepId = passthrough.data.passthroughSourceNodeId;
  const outputKey = passthrough.data.passthroughOutputKey || "main";
  const sourceHandle = `out:${outputKey}`;
  const outgoing = edges.filter(edge => edge.source === passthroughId);

  const nextEdges = [
    ...edges.filter(edge => edge.source !== passthroughId && edge.target !== passthroughId),
    ...outgoing.map((edge, index) => ({
      id: `e-${stepId}-${edge.target}-${index}`,
      source: stepId,
      target: edge.target,
      sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type || "default",
      animated: edge.animated ?? false
    }))
  ];

  const filteredNodes = nodes.filter(node => node.id !== passthroughId);
  const withoutPassthrough = filteredNodes.map(node => {
    if (node.id !== stepId) return node;
    const nextData = { ...node.data };
    delete nextData.detachedOutputs;
    return { ...node, data: nextData };
  });
  const nextNodes = withoutPassthrough.map(node => {
    if (node.id !== stepId) return node;
    const width = node.data?.size?.width || CANVAS_NODE_DEFAULT_WIDTH;
    return {
      ...node,
      data: {
        ...node.data,
        size: compactStepNodeSize(width)
      }
    };
  });

  return { nodes: nextNodes, edges: nextEdges };
}
