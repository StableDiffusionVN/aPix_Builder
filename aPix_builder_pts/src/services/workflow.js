import { normalizeId } from "../state.js";
import { canonicalDynamicType, parseDataUrl, resolveWorkflowInput } from "./comfy.js";

export function flattenInputs(input = {}) {
  const items = [];
  for (const [key, item] of Object.entries(input)) {
    if (item?.ui?.type === "col") {
      for (const [childKey, child] of Object.entries(item.ui.col || {})) {
        items.push({ key: `${key}.${childKey}`, ...child });
      }
    } else {
      items.push({ key, ...item });
    }
  }
  return items;
}

export function isMenuSub(item) {
  return String(item?.ui?.type || "").trim().toLowerCase() === "menu-sub";
}

export function menuSubSelectionStorageKey(yamlKey) {
  return `__menu__${yamlKey}`;
}

export function menuSubValueKey(item) {
  if (item?.id) return normalizeId(item.id);
  return menuSubSelectionStorageKey(item.key);
}

export function getMenuSubOptions(item) {
  const choices = item?.ui?.choices;
  const sub = item?.ui?.sub;
  if (Array.isArray(choices)) {
    return choices.map(choice => {
      if (choice && typeof choice === "object") {
        const value = choice.value ?? choice.id ?? choice.label ?? "";
        return {
          value: String(value),
          label: String(choice.label ?? value)
        };
      }
      return { value: String(choice), label: String(choice) };
    });
  }
  const source = choices && typeof choices === "object" ? choices
    : sub && typeof sub === "object" ? sub
      : {};
  return Object.keys(source).map(value => ({ value, label: value }));
}

function menuSubFields(item, selected) {
  const ui = item?.ui || {};
  if (ui.sub && typeof ui.sub === "object") return ui.sub[selected] || {};
  if (ui.choices && !Array.isArray(ui.choices) && typeof ui.choices === "object") {
    const choice = ui.choices[selected];
    return choice?.sub || choice?.inputs || choice?.fields || choice || {};
  }
  if (Array.isArray(ui.choices)) {
    const choice = ui.choices.find(entry =>
      entry && typeof entry === "object"
      && String(entry.value ?? entry.id ?? entry.label ?? "") === selected);
    return choice?.sub || choice?.inputs || choice?.fields || {};
  }
  return {};
}

function flattenInputEntries(input = {}, prefix = "") {
  const items = [];
  for (const [key, item] of Object.entries(input || {})) {
    const itemKey = prefix ? `${prefix}.${key}` : key;
    if (String(item?.ui?.type || "").toLowerCase() === "col") {
      items.push(...flattenInputEntries(item.ui.col || {}, itemKey));
    } else {
      items.push({ key: itemKey, ...item });
    }
  }
  return items;
}

export function flattenSubInputs(sub = {}) {
  const items = [];
  for (const [choice, fields] of Object.entries(sub || {})) {
    for (const child of flattenInputEntries(fields, choice)) {
      items.push({ ...child, choice });
    }
  }
  return items;
}

export function getActiveSubInputs(item, menuValue) {
  const options = getMenuSubOptions(item);
  const selected = String(menuValue ?? item?.ui?.value ?? options[0]?.value ?? "");
  return flattenInputEntries(menuSubFields(item, selected), `${item.key}.${selected}`).map(child => ({
    ...child,
    parentKey: item.key,
    choice: selected
  }));
}

export function getActiveInputItems(items, values = {}) {
  const activeItems = [];
  for (const item of items || []) {
    if (!isMenuSub(item)) {
      activeItems.push(item);
      continue;
    }
    activeItems.push(item);
    const menuValue = values[menuSubValueKey(item)];
    activeItems.push(...getActiveInputItems(getActiveSubInputs(item, menuValue), values));
  }
  return activeItems;
}

export function defaultValue(item) {
  const ui = item.ui || {};
  const type = String(ui.type || "").toLowerCase();
  if (type === "menu-sub") return String(ui.value ?? getMenuSubOptions(item)[0]?.value ?? "");
  if (type === "seed") return "random_seed";
  if (type === "checkbox") return Boolean(ui.value);
  if (type === "boolean") return ui.value === true || ui.value === "true";
  if (type === "number" || type === "int" || type === "float" || type === "slider") return ui.value ?? ui.minimum ?? 0;
  if (type === "dropdown" || type === "menu" || type === "radio") return ui.value ?? ui.choices?.[0] ?? "";
  if (type === "colorpicker") return ui.value || "#10b981";
  if (type === "date") return ui.value || "";
  if (type === "json") return ui.value || "{}";
  if (canonicalDynamicType(type)) return ui.value ?? "";
  return ui.value ?? "";
}

export function buildDefaults(items) {
  const values = {};
  for (const item of items) {
    if (isMenuSub(item)) {
      values[menuSubValueKey(item)] = defaultValue(item);
      for (const option of getMenuSubOptions(item)) {
        for (const subItem of getActiveSubInputs(item, option.value)) {
          if (subItem.id) values[normalizeId(subItem.id)] = defaultValue(subItem);
        }
      }
      continue;
    }
    if (!item.id) continue;
    values[normalizeId(item.id)] = defaultValue(item);
  }
  return values;
}

export function requestPayload(items, values) {
  const payload = {};
  for (const item of items) {
    if (isMenuSub(item)) {
      const menuKey = menuSubValueKey(item);
      const menuValue = values[menuKey];
      if (item.id) payload[item.id] = menuValue;
      for (const subItem of getActiveSubInputs(item, menuValue)) {
        if (!subItem.id) continue;
        const key = normalizeId(subItem.id);
        const value = values[key];
        if (Array.isArray(subItem.id)) {
          subItem.id.forEach((id, index) => {
            payload[id] = Array.isArray(value) ? value[index] : value;
          });
        } else {
          payload[subItem.id] = value;
        }
      }
      continue;
    }
    if (!item.id) continue;
    const key = normalizeId(item.id);
    const value = values[key];
    if (Array.isArray(item.id)) {
      item.id.forEach((id, index) => {
        payload[id] = Array.isArray(value) ? value[index] : value;
      });
    } else {
      payload[item.id] = value;
    }
  }
  return payload;
}

export function validateWorkflowMappings(config, workflow, options = {}) {
  const requireOutput = options.requireOutput !== false;
  for (const item of flattenInputs(config.input || {})) {
    if (isMenuSub(item)) {
      if (item.id) {
        const ids = Array.isArray(item.id) ? item.id : [item.id];
        ids.forEach(id => resolveWorkflowInput(workflow, id));
      }
      for (const option of getMenuSubOptions(item)) {
        for (const subItem of getActiveSubInputs(item, option.value)) {
          if (!subItem.id) continue;
          const ids = Array.isArray(subItem.id) ? subItem.id : [subItem.id];
          ids.forEach(id => resolveWorkflowInput(workflow, id));
        }
      }
      continue;
    }
    if (!item.id) continue;
    const ids = Array.isArray(item.id) ? item.id : [item.id];
    ids.forEach(id => resolveWorkflowInput(workflow, id));
  }
  if (!requireOutput) return;
  for (const item of Object.values(config.output || {})) {
    const nodeId = String(item.id || "");
    if (!nodeId || !workflow[nodeId]) throw new Error(`Workflow output node not found: ${nodeId}`);
  }
}

export async function normalizeValues(values) {
  const normalized = {};
  let fileIndex = 0;
  for (const [key, value] of Object.entries(values || {})) {
    if (value === "random_seed") {
      normalized[key] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    } else if (typeof value === "string" && value.startsWith("data:")) {
      normalized[key] = { kind: "upload", index: fileIndex++, ...parseDataUrl(value) };
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function isImageInputItem(item) {
  const type = String(item?.ui?.type || "").toLowerCase();
  return type === "image" || type === "image_mask" || type === "file";
}
