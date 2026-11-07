// @ts-check
import { cropInpaintSource, imageValueForUi } from "../../shared/cropInpaint.js";
import { isDynamicFieldType } from "./dynamicTypes";
import { lookupMenuSubFields, menuChoiceOptions, resolveMenuStoredValue } from "../../shared/menuChoices.js";

/** ui.hidden: not shown anywhere in the UI; runs always use the template's default. */
export function isHiddenField(item) {
  return item?.ui?.hidden === true;
}

/** Option of a menu-sub: a hidden menu cannot be changed, so stale stored values must not win. */
export function activeMenuValue(item, values) {
  return isHiddenField(item) ? defaultValue(item) : values[menuSubValueKey(item)];
}

function hasValue(value) {
  return value !== "" && value !== null && value !== undefined;
}

export function isMenuSub(item) {
  return item?.ui?.type === "menu-sub";
}

export function menuSubSelectionStorageKey(yamlKey) {
  return `__menu__${yamlKey}`;
}

export function menuSubValueKey(item) {
  if (item?.id) return normalizeId(item.id);
  return menuSubSelectionStorageKey(item.key);
}

export function flattenSubInputs(sub = {}) {
  const items = [];
  for (const [choice, fields] of Object.entries(sub)) {
    for (const [childKey, child] of Object.entries(fields || {})) {
      items.push({ key: childKey, choice, ...child });
    }
  }
  return items;
}

export function getActiveSubInputs(item, menuValue) {
  const choices = item?.ui?.choices || [];
  const menuOpts = menuChoiceOptions(item?.ui);
  const selected = resolveMenuStoredValue(
    menuValue ?? item?.ui?.value,
    choices,
    menuOpts
  );
  const fields = lookupMenuSubFields(item?.ui?.sub || {}, selected, choices, menuOpts);
  return Object.entries(fields).map(([key, child]) => ({
    key: `${item.key}.${selected}.${key}`,
    parentKey: item.key,
    choice: selected,
    ...child
  }));
}

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
  if (ui.type === "menu-sub") return resolveMenuStoredValue(ui.value, ui.choices, menuChoiceOptions(ui));
  if (ui.type === "seed") return "random_seed";
  if (ui.type === "checkbox" || ui.type === "boolean") return Boolean(ui.value);
  if (ui.type === "number" || ui.type === "int" || ui.type === "float" || ui.type === "slider") return ui.value ?? ui.minimum ?? 0;
  if (ui.type === "dropdown" || ui.type === "menu" || ui.type === "radio") {
    return resolveMenuStoredValue(ui.value, ui.choices, menuChoiceOptions(ui));
  }
  if (isDynamicFieldType(type)) return ui.value ?? "";
  if (ui.type === "json") return "{}";
  return ui.value ?? "";
}

export function normalizeId(id) {
  return Array.isArray(id) ? id.join("|") : id;
}

/** Defaults of `choice`'s sub-inputs whose node field another option also uses — apply them when switching option. */
export function menuChoiceDefaults(item, choice) {
  const elsewhere = new Set();
  const selected = new Map();
  const active = getActiveSubInputs(item, choice);
  active.forEach(sub => sub.id && selected.set(normalizeId(sub.id), sub));
  for (const sub of flattenSubInputs(item?.ui?.sub)) {
    if (!sub.id || sub.choice === active[0]?.choice) continue;
    elsewhere.add(normalizeId(sub.id));
  }
  const values = {};
  for (const [key, sub] of selected) {
    if (elsewhere.has(key) && !isImageFieldType(sub.ui?.type)) values[key] = defaultValue(sub);
  }
  return values;
}

export function buildDefaults(items) {
  const values = {};
  for (const item of items) {
    if (isMenuSub(item)) {
      values[menuSubValueKey(item)] = defaultValue(item);
      for (const subItem of flattenSubInputs(item.ui?.sub)) {
        if (subItem.id) values[normalizeId(subItem.id)] = defaultValue(subItem);
      }
      // Options may map the same node field with different defaults (Base 20 steps, Turbo 8):
      // the option selected by default wins.
      Object.assign(values, menuChoiceDefaults(item, defaultValue(item)));
      continue;
    }
    if (!item.id) continue;
    values[normalizeId(item.id)] = defaultValue(item);
  }
  return values;
}

function assignHiddenDefault(payload, item) {
  const value = defaultValue(item);
  if (!hasValue(value)) return; // nothing configured: keep what the workflow JSON already has
  for (const id of Array.isArray(item.id) ? item.id : [item.id]) payload[id] = value;
}

export function requestPayload(items, values) {
  const payload = {};
  for (const item of items) {
    if (isMenuSub(item)) {
      const menuValue = activeMenuValue(item, values);
      if (item.id) payload[item.id] = menuValue;
      else payload[menuSubSelectionStorageKey(item.key)] = menuValue;
      for (const subItem of getActiveSubInputs(item, menuValue)) {
        if (!subItem.id) continue;
        if (isHiddenField(subItem)) {
          assignHiddenDefault(payload, subItem);
          continue;
        }
        const key = normalizeId(subItem.id);
        if (Array.isArray(subItem.id)) {
          subItem.id.forEach((id, index) => {
            payload[id] = imageValueForUi(Array.isArray(values[key]) ? values[key][index] : values[key], subItem.ui);
          });
        } else {
          payload[subItem.id] = imageValueForUi(values[key], subItem.ui);
        }
      }
      continue;
    }
    if (!item.id) continue;
    if (isHiddenField(item)) {
      assignHiddenDefault(payload, item);
      continue;
    }
    const key = normalizeId(item.id);
    const value = imageValueForUi(values[key], item.ui);
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

export function itemValueKey(item) {
  if (isMenuSub(item)) return menuSubValueKey(item);
  if (!item.id) return null;
  return normalizeId(item.id);
}

export function extractImageValueUrl(value) {
  value = cropInpaintSource(value);
  if (typeof value === "string" && value.startsWith("data:image")) return value;
  if (value?.kind === "input-image" && value.url) return value.url;
  if (value?.kind === "local-folder") return "";
  if (value?.kind === "local-file" && value.filePath) return value.filePath;
  return "";
}

function isImageFieldType(type) {
  const normalized = String(type || "").toLowerCase();
  return normalized === "image" || normalized === "image_mask" || normalized === "file";
}

function collectActiveImageValueKeys(items, values) {
  const keys = [];
  for (const item of items || []) {
    if (isMenuSub(item)) {
      keys.push(...collectActiveImageValueKeys(getActiveSubInputs(item, activeMenuValue(item, values)), values));
      continue;
    }
    if (isHiddenField(item) || !isImageFieldType(item?.ui?.type) || !item.id) continue;
    keys.push(normalizeId(item.id));
  }
  return keys;
}

function batchEntriesForKey(values, key) {
  const raw = values[key];
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (raw?.kind === "local-folder" || raw?.kind === "local-folder-picked") return [raw];
  return [];
}

export function expandImageBatchValues(items, values) {
  const imageKeys = collectActiveImageValueKeys(items, values);
  const batchKeys = imageKeys.filter(key => batchEntriesForKey(values, key).length > 0);
  const batchSize = Math.max(1, ...batchKeys.map(key => batchEntriesForKey(values, key).length));
  if (!batchKeys.length) return [values];

  return Array.from({ length: batchSize }, (_, index) => {
    const next = { ...values };
    for (const key of batchKeys) {
      const images = batchEntriesForKey(values, key);
      next[key] = images[Math.min(index, images.length - 1)];
    }
    return next;
  });
}

export function expandImageBatchByKeys(values, imageKeys) {
  const batchKeys = imageKeys.filter(key => batchEntriesForKey(values, key).length > 0);
  const batchSize = Math.max(1, ...batchKeys.map(key => batchEntriesForKey(values, key).length));
  if (!batchKeys.length) return [values];

  return Array.from({ length: batchSize }, (_, index) => {
    const next = { ...values };
    for (const key of batchKeys) {
      const images = batchEntriesForKey(values, key);
      next[key] = images[Math.min(index, images.length - 1)];
    }
    return next;
  });
}

export function findCompareInputImage(items, values) {
  for (const item of items || []) {
    const uiType = item?.ui?.type;
    if (uiType === "col") {
      for (const [childKey, child] of Object.entries(item.ui?.col || {})) {
        const found = findCompareInputImage([{ key: `${item.key}.${childKey}`, ...child }], values);
        if (found) return found;
      }
      continue;
    }
    if (isMenuSub(item)) {
      const found = findCompareInputImage(getActiveSubInputs(item, activeMenuValue(item, values)), values);
      if (found) return found;
      continue;
    }
    if (isHiddenField(item) || !isImageFieldType(uiType) || !item.id) continue;
    const storedValue = values[normalizeId(item.id)];
    const url = extractImageValueUrl(Array.isArray(storedValue) ? storedValue[0] : storedValue);
    if (url) return url;
  }
  return "";
}
