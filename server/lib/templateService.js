import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export function createTemplateService({ configDir, defaultDir, templatesDir }) {
  const roots = [
    { dir: defaultDir || path.join(configDir, "default"), isDefault: true },
    { dir: templatesDir || path.join(configDir, "templates"), isDefault: false }
  ];

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

  async function loadTemplateDefinition(yamlPath, isDefault) {
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
      isDefault
    };
    return {
      ...template,
      yamlPath,
      workflowPath: resolveTemplatePath(template, template.workflow, "workflow")
    };
  }

  async function discoverTemplates() {
    const discovered = [];
    for (const root of roots) {
      const yamlPaths = await findTemplateConfigs(root.dir);
      for (const yamlPath of yamlPaths) {
        try {
          discovered.push(await loadTemplateDefinition(yamlPath, root.isDefault));
        } catch (error) {
          console.warn(`Skipping invalid template config ${yamlPath}: ${error.message}`);
        }
      }
    }
    const seen = new Set();
    return discovered.filter(template => {
      if (seen.has(template.id)) return false;
      seen.add(template.id);
      return true;
    });
  }

  async function loadTemplateRegistry() {
    const templates = await discoverTemplates();
    if (templates.length === 0) {
      throw new Error("No templates configured. Add app_build.yaml and api.json inside config/default/<id> or config/templates/<id>.");
    }
    const defaultTemplate = templates.find(template => template.isDefault) || templates[0];
    return {
      default: defaultTemplate.id,
      templates: templates.map(({ yamlPath, workflowPath, baseDir, isDefault, ...template }) => template)
    };
  }

  async function resolveTemplate(templateId) {
    const registry = await loadTemplateRegistry();
    const id = templateId || registry.default;
    const allTemplates = await discoverTemplates();
    const template = allTemplates.find(item => item.id === id) || allTemplates.find(item => item.id === registry.default) || allTemplates[0];
    if (!template) throw new Error("No templates configured");
    return {
      ...template,
      registry
    };
  }

  function validateConfig(config, template) {
    const errors = [];
    if (!config || typeof config !== "object") {
      errors.push("YAML must parse to an object");
    }
    if (!config?.app || typeof config.app !== "object") {
      errors.push("YAML is missing required object: app");
    }
    if (!config?.input || typeof config.input !== "object") {
      errors.push("YAML is missing required object: input");
    }
    if (!config?.output || typeof config.output !== "object") {
      errors.push("YAML is missing required object: output");
    }
    if (errors.length > 0) {
      throw new Error(`Invalid template "${template.id}": ${errors.join("; ")}`);
    }
  }

  async function loadConfig(templateId) {
    const template = await resolveTemplate(templateId);
    const raw = await readFile(template.yamlPath, "utf8");
    const config = YAML.parse(raw);
    validateConfig(config, template);
    return {
      raw,
      config,
      server: config.server || config.sever || {},
      template
    };
  }

  return {
    loadTemplateRegistry,
    loadConfig
  };
}
