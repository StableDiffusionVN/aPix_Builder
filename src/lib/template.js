import { isDynamicFieldType } from "./dynamicTypes";

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

export function defaultValue(item) {
  const ui = item.ui || {};
  const type = String(ui.type || "").toLowerCase();
  if (ui.type === "seed") return "random_seed";
  if (ui.type === "checkbox" || ui.type === "boolean") return Boolean(ui.value);
  if (ui.type === "number" || ui.type === "int" || ui.type === "float" || ui.type === "slider") return ui.value ?? ui.minimum ?? 0;
  if (ui.type === "dropdown" || ui.type === "menu" || ui.type === "radio") return ui.value ?? ui.choices?.[0] ?? "";
  if (isDynamicFieldType(type)) return ui.value ?? "";
  if (ui.type === "json") return "{}";
  return ui.value ?? "";
}

export function normalizeId(id) {
  return Array.isArray(id) ? id.join("|") : id;
}

export function buildDefaults(items) {
  const values = {};
  for (const item of items) {
    if (!item.id) continue;
    values[normalizeId(item.id)] = defaultValue(item);
  }
  return values;
}

export function requestPayload(items, values) {
  const payload = {};
  for (const item of items) {
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
