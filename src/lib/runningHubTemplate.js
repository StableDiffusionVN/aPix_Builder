export function parseWorkflowFieldId(id) {
  const parts = String(id || "").split("-");
  if (parts.length >= 3 && parts[1] === "inputs") {
    return { nodeId: parts[0], fieldName: parts.slice(2).join("-") };
  }
  return { nodeId: parts[0] || "", fieldName: parts.slice(1).join("-") };
}

export function inferRunningHubFieldType(fieldName, value) {
  const lower = String(fieldName || "").toLowerCase();
  if (lower.includes("image")) return "IMAGE";
  if (lower.includes("audio")) return "AUDIO";
  if (lower.includes("video")) return "VIDEO";
  if (typeof value === "number") return Number.isInteger(value) ? "INT" : "FLOAT";
  if (value && typeof value === "object") {
    if (value.kind === "input-image" || value.kind === "local-file" || value.kind === "local-folder" || value.url) {
      return "IMAGE";
    }
    return "STRING";
  }
  return "STRING";
}

export function runningHubNodesFromPayload(payload = {}) {
  return Object.entries(payload).map(([id, fieldValue]) => {
    const { nodeId, fieldName } = parseWorkflowFieldId(id);
    return {
      nodeId,
      fieldName,
      fieldType: inferRunningHubFieldType(fieldName, fieldValue),
      fieldValue
    };
  });
}

export function rhWfWorkspaceKey(templateId) {
  return `rh-wf:${templateId}`;
}
