// @ts-check
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export const TEMPLATE_SCOPES = {
  local: "local",
  runninghubWf: "runninghub-wf"
};

export const LOCAL_DEFAULT_TEMPLATE_ID = "sdvn-klein-upscale-ultimate";
export const RH_WF_DEFAULT_TEMPLATE_ID = "sdvn-klein-upscale-ultimate";

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
  if (errors.length > 0) {
    throw new Error(`Invalid template "${template.id}": ${errors.join("; ")}`);
  }
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
  const scopeRoots = {
    [TEMPLATE_SCOPES.local]: [
      { dir: defaultDir || path.join(configDir, "default"), isDefault: true },
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
          discovered.push(await loadTemplateDefinition(yamlPath, root.isDefault, normalizedScope));
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
    return Array.from(byId.values());
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
    const template = allTemplates.find(item => item.id === id)
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

  async function loadConfig(templateId, scope = TEMPLATE_SCOPES.local) {
    const template = await resolveTemplate(templateId, scope);
    const raw = await readFile(template.yamlPath, "utf8");
    const config = YAML.parse(raw);
    if (normalizeScope(scope) === TEMPLATE_SCOPES.runninghubWf && config?.runninghub) {
      config.runninghub.workflowId = extractRunningHubWorkflowId(raw, config);
    }
    validateConfig(config, template, scope);
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
    assertExportableTemplateDir(template.baseDir, scope);
    return {
      id: template.id,
      name: template.name,
      baseDir: template.baseDir,
      folderName: path.basename(template.baseDir)
    };
  }

  return {
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
