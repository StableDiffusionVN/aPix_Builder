export const APIX_WORKFLOW_FORMAT = "apix-builder-workflow";
export const APIX_WORKFLOW_VERSION = 1;
export const APIX_WORKFLOW_MAX_BYTES = 20 * 1024 * 1024;
export const APIX_WORKFLOW_MAX_NODES = 10_000;
export const APIX_WORKFLOW_MAX_EDGES = 50_000;

function normalizedViewport(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const zoom = Number(value.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) {
    return null;
  }
  return { x, y, zoom };
}

function workflowPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tệp không chứa dữ liệu workflow hợp lệ.");
  }

  if (value.format && value.format !== APIX_WORKFLOW_FORMAT) {
    throw new Error("Định dạng tệp không phải workflow của aPix Builder.");
  }

  if (value.version && Number(value.version) > APIX_WORKFLOW_VERSION) {
    throw new Error("Phiên bản workflow mới hơn phiên bản aPix Builder hiện tại.");
  }

  return value.workflow && typeof value.workflow === "object"
    ? value.workflow
    : value;
}

function validatedGraph(workflow) {
  if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
    throw new Error("Workflow phải chứa đầy đủ danh sách nodes và edges.");
  }
  if (workflow.nodes.length > APIX_WORKFLOW_MAX_NODES || workflow.edges.length > APIX_WORKFLOW_MAX_EDGES) {
    throw new Error("Workflow vượt quá giới hạn số lượng nodes hoặc edges.");
  }

  const nodeIds = new Set();
  for (const node of workflow.nodes) {
    const id = String(node?.id || "").trim();
    if (!node || typeof node !== "object" || Array.isArray(node) || !id || nodeIds.has(id)) {
      throw new Error("Workflow chứa node không hợp lệ hoặc trùng ID.");
    }
    nodeIds.add(id);
  }
  const edgeIds = new Set();
  for (const edge of workflow.edges) {
    const id = String(edge?.id || "").trim();
    const source = String(edge?.source || "").trim();
    const target = String(edge?.target || "").trim();
    if (
      !edge || typeof edge !== "object" || Array.isArray(edge)
      || !id || edgeIds.has(id)
      || !nodeIds.has(source) || !nodeIds.has(target)
    ) {
      throw new Error("Workflow chứa edge không hợp lệ hoặc tham chiếu node không tồn tại.");
    }
    edgeIds.add(id);
  }
  return { nodes: workflow.nodes, edges: workflow.edges };
}

export function parseWorkflowFile(value, { defaultName = "Workflow nhập" } = {}) {
  let parsed = value;
  if (typeof value === "string") {
    if (new Blob([value]).size > APIX_WORKFLOW_MAX_BYTES) {
      throw new Error("Tệp workflow vượt quá giới hạn dung lượng.");
    }
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Không thể đọc tệp JSON workflow.");
    }
  }

  const workflow = workflowPayload(parsed);
  const graph = validatedGraph(workflow);

  return {
    name: String(workflow.name || defaultName).trim() || defaultName,
    nodes: graph.nodes,
    edges: graph.edges,
    viewport: normalizedViewport(workflow.viewport)
  };
}

export function createWorkflowFile({
  id = "",
  name = "Workflow",
  createdAt = null,
  updatedAt = null,
  nodes = [],
  edges = [],
  viewport = null,
  exportedAt = new Date().toISOString()
} = {}) {
  return {
    format: APIX_WORKFLOW_FORMAT,
    version: APIX_WORKFLOW_VERSION,
    app: "aPix Builder",
    exportedAt,
    workflow: {
      id,
      name: String(name || "Workflow"),
      createdAt,
      updatedAt,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes,
      edges,
      viewport: normalizedViewport(viewport)
    }
  };
}

export function workflowFileName(name = "Workflow") {
  const safeName = String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${safeName || "workflow"}.apix-workflow.json`;
}

export function downloadWorkflowFile(payload, name = "Workflow") {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = workflowFileName(name);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
