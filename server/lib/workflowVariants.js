import { workflowMenus, workflowVariantEntries, selectWorkflowVariant, assertApiWorkflow, validateVariantFile } from "../../shared/workflowVariants.js";
import { menuChoiceOptions, parseMenuChoices } from "../../shared/menuChoices.js";
import { validateWorkflowMappings } from "./workflowPatcher.js";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

/** workflows/*.json files the template's menu options still point at. */
export function usedVariantFiles(config) {
  const used = new Set();
  for (const { entry } of workflowVariantEntries(config)) {
    try {
      used.add(validateVariantFile(entry?.file));
    } catch {
      // Invalid paths are rejected by validation elsewhere.
    }
  }
  return used;
}

/** Option workflow JSONs in <templateDir>/workflows that no option uses any more. */
export async function unusedVariantFiles(templateDir, config) {
  const used = usedVariantFiles(config);
  const names = await readdir(path.join(templateDir, "workflows")).catch(() => []);
  return names.filter(name => name.toLowerCase().endsWith(".json")).map(name => `workflows/${name}`).filter(file => !used.has(file));
}

/** Delete replaced / detached option workflows (and the folder when it ends up empty). */
export async function pruneUnusedVariantFiles(templateDir, config) {
  const unused = await unusedVariantFiles(templateDir, config);
  for (const file of unused) await rm(path.join(templateDir, file), { force: true });
  const left = await readdir(path.join(templateDir, "workflows")).catch(() => null);
  if (left && !left.length) await rm(path.join(templateDir, "workflows"), { recursive: true, force: true });
  return unused;
}

export function validateWorkflowVariants(config, workflow, workflowFiles = {}, options = {}) {
  const menus = workflowMenus(config);
  if (!menus.length) {
    validateWorkflowMappings(config, workflow, options);
    return;
  }
  if (menus.length > 1) throw new Error("Chỉ một menu-sub trong template được chọn workflow JSON.");
  for (const { item, choice, entry } of workflowVariantEntries(config)) {
    const choices = parseMenuChoices(item.ui.choices, menuChoiceOptions(item.ui));
    if (!choices.some(option => option.value === choice || option.raw === choice)) throw new Error(`JSON gắn với option không tồn tại: ${choice}`);
    const file = validateVariantFile(entry?.file);
    assertApiWorkflow(workflowFiles[file], file);
  }
  const [key, item] = menus[0];
  for (const choice of parseMenuChoices(item.ui.choices, menuChoiceOptions(item.ui))) {
    const selected = selectWorkflowVariant(config, { [item.id || `__menu__${key}`]: choice.value });
    const json = selected.file ? workflowFiles[selected.file] : workflow;
    try {
      validateWorkflowMappings(selected.config, json, options);
    } catch (error) {
      throw new Error(`Option "${choice.label}": ${error.message}`, { cause: error });
    }
  }
}
