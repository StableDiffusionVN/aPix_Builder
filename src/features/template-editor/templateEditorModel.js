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
    fields: Object.keys(node?.inputs || {}),
    linkFields: Object.keys(node?.inputs || {}).filter(field => isLinkValue(node.inputs[field]))
  }));
}

/** API-format wire: ["<source node>", <output index>]. Not a value a user should overwrite. */
export function isLinkValue(value) {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && Number.isInteger(value[1]);
}

/** First field a new row should point at: a real widget value, not a wire. */
export function defaultFieldForNode(node) {
  const fields = node?.fields || [];
  return fields.find(field => !node.linkFields?.includes(field)) || fields[0] || "";
}

/** "7-steps" / "7-inputs-steps" / "7-my-field" → { nodeId, field } (field names may contain "-"). */
export function parseFieldId(id) {
  const [nodeId, ...rest] = String(id || "").split("-");
  const parts = rest.length > 1 && rest[0] === "inputs" ? rest.slice(1) : rest;
  return { nodeId, field: parts.join("-") };
}

const MANAGED_UI = ["type", "label", "description", "inpaintCrop", "value", "menuLabelSyntax"];
const MANAGED_NUMERIC = ["minimum", "maximum", "step"];

/** ui keys the editor form has no control for: kept untouched so saving does not silently drop them. */
export function extraUiFrom(ui = {}, rowType = "") {
  const managed = new Set(MANAGED_UI);
  if (rowType === "menu") managed.add("choices");
  if (["int", "float", "seed"].includes(rowType)) MANAGED_NUMERIC.forEach(key => managed.add(key));
  if (["int", "float", "string", "text"].includes(rowType)) managed.add("display");
  return Object.fromEntries(Object.entries(ui).filter(([key]) => !managed.has(key)));
}

export function extraMenuSubUiFrom(ui = {}) {
  const managed = new Set(["type", "label", "description", "choices", "value", "sub", "workflows", "menuLabelSyntax"]);
  return Object.fromEntries(Object.entries(ui).filter(([key]) => !managed.has(key)));
}

/**
 * Per-choice data (sub-inputs, option JSON) after the choices text changed. Editing a name keeps its
 * data: same line count = rename by position. Entries of removed names stay as orphans (saving only
 * reads current choices), so clearing a line and retyping it does not lose anything.
 */
export function remapChoiceEntries(map = {}, prevChoices = [], nextChoices = []) {
  const next = { ...map };
  const nextValues = new Set(nextChoices.map(choice => choice.value));
  nextChoices.forEach((choice, index) => {
    if (next[choice.value] !== undefined) return;
    if (next[choice.raw] !== undefined) {
      next[choice.value] = next[choice.raw];
      return;
    }
    const previous = prevChoices.length === nextChoices.length ? prevChoices[index] : null;
    if (previous && !nextValues.has(previous.value) && next[previous.value] !== undefined) {
      next[choice.value] = next[previous.value];
      delete next[previous.value];
    }
  });
  return next;
}

/** The menu's "send value to node" target: never leaves a field the chosen node does not have. */
export function menuTargetDefaults(nodes) {
  const node = nodes.find(item => item.fields.length > 0);
  return { nodeId: node?.id || "", field: defaultFieldForNode(node) };
}

/** Menu-sub target: changing the node also moves the field to one that node really has. */
export function menuTargetPatch(nodes, patch) {
  if (!patch.nodeId) return patch;
  const node = nodes.find(item => item.id === patch.nodeId);
  return { ...patch, field: defaultFieldForNode(node) };
}

function workflowFieldExists(workflow, nodeId, field) {
  if (!nodeId || !field) return false;
  const inputs = workflow?.[nodeId]?.inputs;
  return inputs != null && Object.prototype.hasOwnProperty.call(inputs, field);
}

function pruneInputRow(row, workflow) {
  if (row.kind === "note") return row;
  if (row.kind === "menu-sub") {
    // New workflow lacks the target: drop only the target, never the menu and all its sub-inputs.
    const targetLost = row.hasTargetId && !workflowFieldExists(workflow, row.nodeId, row.field);
    const sub = {};
    for (const [choice, subRows] of Object.entries(row.sub || {})) {
      sub[choice] = (subRows || []).filter(subRow => (
        workflowFieldExists(row.workflows?.[choice]?.workflow || workflow, subRow.nodeId, subRow.field)
      ));
    }
    return { ...row, sub, ...(targetLost ? { hasTargetId: false, nodeId: "", field: "" } : {}) };
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
    if (Array.isArray(value) && !isLinkValue(value)) return "menu";
    return inferValueType(value);
  }
  // A wire ["9", 1] is not a list of choices.
  return inferDynamicTypeFromField(field, nodeClass)
    || (Array.isArray(value) && !isLinkValue(value) ? "menu" : inferValueType(value));
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
