// @ts-check
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { selectWorkflowVariant, workflowVariantEntries, validateVariantFile } from "../../shared/workflowVariants.js";
import { unusedVariantFiles } from "./workflowVariants.js";
import { isKnownVipTemplate, vipTemplatesDir } from "./vipTemplates.js";

export const TEMPLATE_SCOPES = {
  local: "local",
  runninghubWf: "runninghub-wf"
};

export const LOCAL_DEFAULT_TEMPLATE_ID = "klein-edit-image";
export const RH_WF_DEFAULT_TEMPLATE_ID = "klein-edit-image-lora";
// Bundled templates that were removed: a canvas node keeping one must report it,
// not silently run the default workflow instead.
const REMOVED_TEMPLATE_IDS = new Set(["sdvn-klein-upscale-ultimate"]);

export function validateTemplateConfig(config, template, scope = TEMPLATE_SCOPES.local) {
  const errors = [];
  const isRhWf = scope === TEMPLATE_SCOPES.runninghubWf;
  if (!config || typeof config !== "object") {
    errors.push("YAML must parse to an object");
  }
  if (!config?.app || typeof config.app !== "object") {
    errors.push("YAML is missing required object: app");
  }
  if (!config?.input || typeof config.input !== "object") {
    errors.push("YAML is missing required object: input");
  }
  if (!isRhWf && (!config?.output || typeof config.output !== "object")) {
    errors.push("YAML is missing required object: output");
  }
  if (isRhWf && !String(config?.runninghub?.workflowId || "").trim()) {
    errors.push("YAML is missing required runninghub.workflowId");
  }
  if (isRhWf && config?.runninghub?.saveWorkflowJson === false && workflowVariantEntries(config).length) {
    errors.push("Bật lưu JSON workflow để sử dụng JSON riêng cho option menu-sub");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid template "${template.id}": ${errors.join("; ")}`);
  }
}

// Dò TỪNG FIELD checkpoints/loras mà node loader trong workflow có class_type chứa "SDVN".
// Client bơm danh sách model SDVN CHỈ cho các field này (per-field — đồng bộ iOS/Android):
// model SDVN do node SDVN tự tải theo tên, node loader thường chọn sẽ fail khi chạy.
// Trả về { [normalizeId(item.id)]: "checkpoints" | "loras" }.
export function sdvnModelFieldsFromWorkflow(config, workflow, workflowFiles = {}) {
  const fields = {};
  // Top-level + field con của menu-sub (mọi lựa chọn). Field con của lựa chọn có JSON riêng
  // được dò trong JSON đó. (iOS/Android hiện vẫn chỉ dò top-level.)
  const entries = [];
  for (const item of Object.values(config?.input || {})) {
    if (String(item?.ui?.type || "").toLowerCase() !== "menu-sub") {
      entries.push([item, workflow]);
      continue;
    }
    for (const [choice, children] of Object.entries(item.ui.sub || {})) {
      const choiceWorkflow = workflowFiles[item.ui.workflows?.[choice]?.file] || workflow;
      for (const child of Object.values(children || {})) entries.push([child, choiceWorkflow]);
    }
  }
  for (const [item, itemWorkflow] of entries) {
    const uiType = String(item?.ui?.type || "").toLowerCase();
    const idKey = Array.isArray(item?.id) ? item.id.join("|") : String(item?.id || "");
    let kind = null;
    // CHỈ theo ui.type khai báo trong YAML — KHÔNG suy từ tên widget (lora_name/ckpt_name),
    // để field type menu/menu-sub trỏ node SDVN không bị thêm danh sách model.
    if (["checkpoints", "checkpoint", "ckpt"].includes(uiType)) kind = "checkpoints";
    else if (["loras", "lora"].includes(uiType)) kind = "loras";
    if (!kind || !idKey) continue;
    const nodeId = idKey.split("-")[0];
    const classType = nodeId ? itemWorkflow?.[nodeId]?.class_type : null;
    if (typeof classType === "string" && /sdvn/i.test(classType)) fields[idKey] = kind;
  }
  return fields;
}

export function createTemplateService({
  configDir,
  defaultDir,
  templatesDir,
  defaultRhDir,
  templatesRhDir
}) {
  const rhDefaultDir = defaultRhDir || path.join(configDir, "default-rh");
  const rhTemplatesDir = templatesRhDir || path.join(configDir, "templates-rh");
  const vipDir = vipTemplatesDir(configDir);
  const scopeRoots = {
    [TEMPLATE_SCOPES.local]: [
      { dir: defaultDir || path.join(configDir, "default"), isDefault: true },
      // Downloaded while the aPix key is valid (vipTemplates.js); read-only like defaults.
      { dir: vipDir, isDefault: true, vip: true },
      { dir: templatesDir || path.join(configDir, "templates"), isDefault: false }
    ],
    [TEMPLATE_SCOPES.runninghubWf]: [
      { dir: rhDefaultDir, isDefault: true },
      { dir: rhTemplatesDir, isDefault: false }
    ]
  };

  function normalizeScope(scope) {
    return scope === TEMPLATE_SCOPES.runninghubWf ? TEMPLATE_SCOPES.runninghubWf : TEMPLATE_SCOPES.local;
  }

  async function findTemplateConfigs(rootDir) {
    try {
      const entries = await readdir(rootDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(rootDir, entry.name, "app_build.yaml"));
    } catch {
      return [];
    }
  }

  function assertInside(baseDir, resolved, label, sourcePath) {
    const relative = path.relative(baseDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Template ${label} path is outside template directory: ${sourcePath}`);
    }
  }

  function resolveTemplatePath(template, relativePath, label) {
    if (!relativePath) {
      throw new Error(`Template is missing ${label} path`);
    }
    const resolved = path.resolve(template.baseDir, relativePath);
    assertInside(template.baseDir, resolved, label, relativePath);
    return resolved;
  }

  async function loadTemplateDefinition(yamlPath, isDefault, scope) {
    const baseDir = path.dirname(yamlPath);
    const raw = await readFile(yamlPath, "utf8");
    const config = YAML.parse(raw);
    const app = config?.app || {};
    const templateConfig = config?.template || {};
    const id = templateConfig.id || app.id || path.basename(baseDir);
    const template = {
      id,
      name: templateConfig.name || app.name || id,
      yaml: "app_build.yaml",
      workflow: templateConfig.workflow || app.workflow || config.workflow || "api.json",
      baseDir,
      isDefault,
      scope
    };
    let workflowPath = null;
    try {
      const resolved = resolveTemplatePath(template, template.workflow, "workflow");
      await stat(resolved);
      workflowPath = resolved;
    } catch {
      workflowPath = null;
    }
    return {
      ...template,
      yamlPath,
      workflowPath
    };
  }

  function usesSavedWorkflowJson(config, template) {
    if (config?.runninghub?.saveWorkflowJson === false) return false;
    if (config?.runninghub?.saveWorkflowJson === true) return true;
    return Boolean(template?.workflowPath);
  }

  function runningHubTaskOptions(config = {}) {
    const rh = config.runninghub || {};
    return {
      addMetadata: Boolean(rh.addMetadata),
      accessPassword: String(rh.accessPassword || "").trim() || undefined,
      usePersonalQueue: Boolean(rh.usePersonalQueue)
    };
  }

  async function discoverTemplates(scope = TEMPLATE_SCOPES.local) {
    const normalizedScope = normalizeScope(scope);
    const discovered = [];
    for (const root of scopeRoots[normalizedScope] || []) {
      const yamlPaths = await findTemplateConfigs(root.dir);
      for (const yamlPath of yamlPaths) {
        try {
          discovered.push({ ...(await loadTemplateDefinition(yamlPath, root.isDefault, normalizedScope)), ...(root.vip ? { vip: true } : {}) });
        } catch (error) {
          console.warn(`Skipping invalid template config ${yamlPath}: ${error.message}`);
        }
      }
    }
    const byId = new Map();
    for (const template of discovered) {
      const prev = byId.get(template.id);
      if (!prev || (prev.isDefault && !template.isDefault)) {
        byId.set(template.id, template);
      }
    }
    // VIP workflows first (sort is stable: the rest keep their order).
    return Array.from(byId.values()).sort((a, b) => Number(Boolean(b.vip)) - Number(Boolean(a.vip)));
  }

  async function loadTemplateRegistry(scope = TEMPLATE_SCOPES.local) {
    const normalizedScope = normalizeScope(scope);
    const templates = await discoverTemplates(normalizedScope);
    if (templates.length === 0 && normalizedScope === TEMPLATE_SCOPES.local) {
      throw new Error("No templates configured. Check the bundled defaults or add app_build.yaml and api.json inside the user templates folder.");
    }
    const preferredDefaultId = normalizedScope === TEMPLATE_SCOPES.runninghubWf
      ? RH_WF_DEFAULT_TEMPLATE_ID
      : LOCAL_DEFAULT_TEMPLATE_ID;
    const defaultTemplate = templates.find(template => template.id === preferredDefaultId)
      || templates.find(template => template.isDefault)
      || templates[0]
      || null;
    return {
      scope: normalizedScope,
      default: defaultTemplate?.id || "",
      templates: templates.map(template => {
        const publicTemplate = { ...template };
        delete publicTemplate.yamlPath;
        delete publicTemplate.workflowPath;
        delete publicTemplate.baseDir;
        delete publicTemplate.scope;
        return publicTemplate;
      })
    };
  }

  async function resolveTemplate(templateId, scope = TEMPLATE_SCOPES.local) {
    const registry = await loadTemplateRegistry(scope);
    const id = templateId || registry.default;
    const allTemplates = await discoverTemplates(scope);
    const found = allTemplates.find(item => item.id === id);
    // Never run another workflow in place of a VIP one (canvas nodes keep the id).
    if (!found && templateId && await isKnownVipTemplate(configDir, templateId)) {
      throw new Error("Workflow VIP này cần mã aPix hợp lệ (Settings → Mã aPix).");
    }
    if (!found && REMOVED_TEMPLATE_IDS.has(templateId)) {
      throw new Error(`Workflow "${templateId}" đã bị gỡ khỏi aPix — hãy chọn workflow khác.`);
    }
    const template = found
      || allTemplates.find(item => item.id === registry.default)
      || allTemplates[0];
    if (!template) {
      throw new Error(normalizeScope(scope) === TEMPLATE_SCOPES.runninghubWf
        ? "Chưa có template RunningHub Workflow nào"
        : "No templates configured");
    }
    return {
      ...template,
      registry
    };
  }

  function validateConfig(config, template, scope = TEMPLATE_SCOPES.local) {
    validateTemplateConfig(config, template, normalizeScope(scope));
  }

  function extractRunningHubWorkflowId(raw, config) {
    const match = String(raw || "").match(/workflowId:\s*["']?(\d+)["']?/);
    if (match?.[1]) return match[1];
    const value = config?.runninghub?.workflowId;
    if (value == null || value === "") return "";
    return String(value).trim();
  }

  async function computeSdvnModelFields(config, template) {
    if (!template.workflowPath) return {};
    try {
      const workflowFiles = await readWorkflowFiles(config, template).catch(() => ({}));
      return sdvnModelFieldsFromWorkflow(config, JSON.parse(await readFile(template.workflowPath, "utf8")), workflowFiles);
    } catch {
      return {};
    }
  }

  async function readWorkflowFiles(config, template) {
    const files = {};
    for (const { entry } of workflowVariantEntries(config)) {
      const file = validateVariantFile(entry?.file);
      files[file] = JSON.parse(await readFile(resolveTemplatePath(template, file, "option workflow"), "utf8"));
    }
    return files;
  }

  async function resolveWorkflow(config, template, values = {}) {
    const selected = selectWorkflowVariant(config, values);
    const workflowPath = selected.file ? resolveTemplatePath(template, selected.file, "option workflow") : template.workflowPath;
    const resolvedConfig = selected.config;
    return { config: resolvedConfig, template: { ...template, workflowPath }, choice: selected.choice };
  }

  async function loadConfig(templateId, scope = TEMPLATE_SCOPES.local) {
    const template = await resolveTemplate(templateId, scope);
    const raw = await readFile(template.yamlPath, "utf8");
    const config = YAML.parse(raw);
    if (normalizeScope(scope) === TEMPLATE_SCOPES.runninghubWf && config?.runninghub) {
      config.runninghub.workflowId = extractRunningHubWorkflowId(raw, config);
    }
    validateConfig(config, template, scope);
    config.sdvnModelFields = await computeSdvnModelFields(config, template);
    // Giữ sdvnModelTypes (derive từ map) cho canvas project cũ đã lưu config — fallback per-type.
    config.sdvnModelTypes = [...new Set(Object.values(config.sdvnModelFields))];
    return {
      raw,
      config,
      server: config.server || config.sever || {},
      template,
      scope: normalizeScope(scope)
    };
  }

  function assertDeletableTemplateDir(targetDir) {
    const resolved = path.resolve(targetDir);
    const allowedRoots = [
      path.resolve(templatesDir || path.join(configDir, "templates")),
      path.resolve(rhTemplatesDir)
    ];
    const allowed = allowedRoots.some(root => {
      const relative = path.relative(root, resolved);
      return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
    });
    if (!allowed) {
      throw new Error("Không thể xóa template mặc định hoặc template ngoài thư mục người dùng");
    }
  }

  async function deleteTemplate(templateId, scope = TEMPLATE_SCOPES.local) {
    const normalizedScope = normalizeScope(scope);
    const id = String(templateId || "").trim();
    if (!id) throw new Error("Missing template id");
    const allTemplates = await discoverTemplates(normalizedScope);
    const template = allTemplates.find(item => item.id === id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }
    if (template.isDefault) {
      throw new Error("Không thể xóa template mặc định");
    }
    assertDeletableTemplateDir(template.baseDir);
    await rm(template.baseDir, { recursive: true, force: true });
    return loadTemplateRegistry(normalizedScope);
  }

  function getScopeRoot(scope = TEMPLATE_SCOPES.local) {
    const normalizedScope = normalizeScope(scope);
    if (normalizedScope === TEMPLATE_SCOPES.runninghubWf) {
      return rhTemplatesDir;
    }
    return templatesDir || path.join(configDir, "templates");
  }

  async function resolveSaveTargetRoot(templateId, scope = TEMPLATE_SCOPES.local) {
    const id = String(templateId || "").trim();
    if (!id) throw new Error("Missing template id");
    const allTemplates = await discoverTemplates(scope);
    const existing = allTemplates.find(item => item.id === id);
    if (existing?.vip) throw new Error("Không sửa được workflow VIP — hãy lưu với Template ID khác.");
    if (existing?.isDefault) {
      return { targetRoot: path.join(getScopeRoot(scope), id), savedAsCopy: true };
    }
    if (existing) {
      return { targetRoot: existing.baseDir, savedAsCopy: false };
    }
    return { targetRoot: path.join(getScopeRoot(scope), id), savedAsCopy: false };
  }

  function assertExportableTemplateDir(baseDir, scope = TEMPLATE_SCOPES.local) {
    const resolved = path.resolve(baseDir);
    const normalizedScope = normalizeScope(scope);
    const roots = (scopeRoots[normalizedScope] || []).map(root => path.resolve(root.dir));
    const allowed = roots.some(root => {
      const relative = path.relative(root, resolved);
      return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    });
    if (!allowed) {
      throw new Error("Invalid template export path");
    }
  }

  async function getTemplateExportSource(templateId, scope = TEMPLATE_SCOPES.local) {
    const template = await resolveTemplate(templateId, scope);
    if (template.vip) throw new Error("Không xuất được workflow VIP.");
    assertExportableTemplateDir(template.baseDir, scope);
    // Option JSONs left behind by older saves are not part of the template.
    let excludeFiles = [];
    try {
      excludeFiles = await unusedVariantFiles(template.baseDir, YAML.parse(await readFile(template.yamlPath, "utf8")));
    } catch {
      excludeFiles = [];
    }
    return {
      id: template.id,
      name: template.name,
      baseDir: template.baseDir,
      folderName: path.basename(template.baseDir),
      excludeFiles
    };
  }

  return {
    readWorkflowFiles,
    resolveWorkflow,
    loadTemplateRegistry,
    loadConfig,
    discoverTemplates,
    deleteTemplate,
    getScopeRoot,
    resolveSaveTargetRoot,
    getTemplateExportSource,
    normalizeScope,
    usesSavedWorkflowJson,
    runningHubTaskOptions
  };
}
