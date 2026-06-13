import { inferDynamicTypeFromField } from "../../lib/dynamicTypes.js";

export function slugifyTemplateKey(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";
}

export function workflowNodes(workflow) {
  return Object.entries(workflow || {}).map(([id, node]) => ({
    id,
    title: node?._meta?.title || node?.class_type || id,
    classType: node?.class_type || "",
    fields: Object.keys(node?.inputs || {})
  }));
}

function workflowFieldExists(workflow, nodeId, field) {
  if (!nodeId || !field) return false;
  const inputs = workflow?.[nodeId]?.inputs;
  return inputs != null && Object.prototype.hasOwnProperty.call(inputs, field);
}

function pruneInputRow(row, workflow) {
  if (row.kind === "note") return row;
  if (row.kind === "menu-sub") {
    if (row.hasTargetId && row.nodeId && row.field && !workflowFieldExists(workflow, row.nodeId, row.field)) {
      return null;
    }
    const sub = {};
    for (const [choice, subRows] of Object.entries(row.sub || {})) {
      sub[choice] = (subRows || []).filter(subRow => (
        workflowFieldExists(workflow, subRow.nodeId, subRow.field)
      ));
    }
    return { ...row, sub };
  }
  return workflowFieldExists(workflow, row.nodeId, row.field) ? row : null;
}

export function pruneInputRows(rows, workflow) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => pruneInputRow(row, workflow))
    .filter(Boolean);
}

export function defaultValueForType(type, fieldValue) {
  if (type === "image") return "";
  if (type === "seed") return "random_seed";
  if (type === "checkbox" || type === "boolean") return Boolean(fieldValue);
  if (type === "int" || type === "float") {
    return Number.isFinite(Number(fieldValue)) ? Number(fieldValue) : 0;
  }
  if (type === "json") return "{}";
  return typeof fieldValue === "string" ? fieldValue : "";
}

export function defaultsForType(type, fieldValue) {
  return {
    type,
    display: "input",
    minimum: 0,
    maximum: type === "float" ? 1 : "",
    step: type === "float" ? 0.1 : 1,
    value: type === "menu" && Array.isArray(fieldValue)
      ? fieldValue[0] || ""
      : defaultValueForType(type, fieldValue),
    choicesText: type === "menu" && Array.isArray(fieldValue) ? fieldValue.join("\n") : "",
    menuLabelSyntax: false
  };
}

export function inferValueType(value) {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  return "string";
}

export function inferRowType({ field, nodeClass, value }, mode = "local") {
  if (mode === "runninghub-wf") {
    if (String(field || "").toLowerCase().includes("image")) return "image";
    if (Array.isArray(value)) return "menu";
    return inferValueType(value);
  }
  return inferDynamicTypeFromField(field, nodeClass)
    || (Array.isArray(value) ? "menu" : inferValueType(value));
}

export function moveRow(rows, rowId, direction) {
  const index = rows.findIndex(row => row.rowId === rowId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function reorderRows(rows, draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return rows;
  const draggedIndex = rows.findIndex(row => row.rowId === draggedId);
  const targetIndex = rows.findIndex(row => row.rowId === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return rows;
  const next = [...rows];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}
