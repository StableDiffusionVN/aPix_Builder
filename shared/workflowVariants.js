import { menuChoiceOptions, parseMenuChoices, resolveMenuStoredValue } from "./menuChoices.js";

export function workflowMenus(config) {
  return Object.entries(config?.input || {}).filter(([, item]) => item?.ui?.type === "menu-sub" && Object.keys(item.ui.workflows || {}).length);
}

export function workflowVariantEntries(config) {
  return workflowMenus(config).flatMap(([key, item]) => Object.entries(item.ui.workflows || {}).map(([choice, entry]) => ({ key, item, choice, entry })));
}

export function validateVariantFile(file) {
  if (typeof file !== "string" || !/^workflows\/[a-zA-Z0-9_-]+\.json$/.test(file)) {
    throw new Error(`Đường dẫn JSON option không hợp lệ: ${String(file)}`);
  }
  return file;
}

export function selectWorkflowVariant(config, values = {}) {
  const menus = workflowMenus(config);
  if (menus.length > 1) throw new Error("Chỉ một menu-sub trong template được chọn workflow JSON. Hãy gộp các lựa chọn workflow vào cùng menu.");
  if (!menus.length) return { config, file: null, choice: null };
  const [key, item] = menus[0];
  const ui = item.ui;
  const opts = menuChoiceOptions(ui);
  const selected = resolveMenuStoredValue(values[item.id || `__menu__${key}`] ?? ui.value, ui.choices, opts);
  const choice = parseMenuChoices(ui.choices, opts).find(option => option.value === selected);
  if (!choice) throw new Error(`Lựa chọn workflow không hợp lệ: ${String(selected)}`);
  const entry = ui.workflows?.[choice.value] || ui.workflows?.[choice.raw];
  const file = entry ? validateVariantFile(entry.file) : null;
  const sub = ui.sub?.[choice.value] || ui.sub?.[choice.raw] || {};
  const input = { ...config.input, [key]: { ...item, ui: { ...ui, sub: { [choice.value]: sub } } } };
  const output = entry?.outputNodeId ? {
    [Object.keys(config.output || {})[0] || "result"]: { id: String(entry.outputNodeId), ui: { type: "image", label: Object.values(config.output || {})[0]?.ui?.label || "Output image" } }
  } : config.output;
  return { config: { ...config, input, ...(output ? { output } : {}) }, file, choice: choice.value };
}

export function assertApiWorkflow(workflow, label = "Workflow") {
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow) || !Object.keys(workflow).length
    || Object.values(workflow).some(node => !node || typeof node !== "object" || typeof node.class_type !== "string" || !node.inputs || typeof node.inputs !== "object")) {
    throw new Error(`${label}: cần JSON định dạng API của ComfyUI (Save API Format).`);
  }
  return workflow;
}
