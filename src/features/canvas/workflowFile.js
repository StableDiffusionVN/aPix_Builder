export const APIX_WORKFLOW_FORMAT = "apix-builder-workflow";
export const APIX_WORKFLOW_VERSION = 1;

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

export function parseWorkflowFile(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Không thể đọc tệp JSON workflow.");
    }
  }

  const workflow = workflowPayload(parsed);
  if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
    throw new Error("Workflow phải chứa đầy đủ danh sách nodes và edges.");
  }

  return {
    name: String(workflow.name || "Workflow nhập").trim() || "Workflow nhập",
    nodes: workflow.nodes,
    edges: workflow.edges,
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
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safeName || "workflow"}.apix-workflow.json`;
}

export const WORKFLOW_FILE_BASENAME = "workflow.apix-workflow.json";
