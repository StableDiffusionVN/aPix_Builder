import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export function createTemplateService({ configDir, configPath, workflowPath, templatesPath }) {
  function defaultRegistry() {
    return {
      default: "default",
      templates: [{
        id: "default",
        name: "Default",
        yaml: path.relative(configDir, configPath),
        workflow: path.relative(configDir, workflowPath)
      }]
    };
  }

  async function loadTemplateRegistry() {
    try {
      const registry = JSON.parse(await readFile(templatesPath, "utf8"));
      const templates = Array.isArray(registry.templates) ? registry.templates : [];
      return {
        default: registry.default || templates[0]?.id,
        templates
      };
    } catch {
      return defaultRegistry();
    }
  }

  function resolveTemplatePath(relativePath, label) {
    if (!relativePath) {
      throw new Error(`Template is missing ${label} path`);
    }
    const resolved = path.resolve(configDir, relativePath);
    if (!resolved.startsWith(configDir)) {
      throw new Error(`Template ${label} path is outside config directory: ${relativePath}`);
    }
    return resolved;
  }

  async function resolveTemplate(templateId) {
    const registry = await loadTemplateRegistry();
    const id = templateId || registry.default;
    const template = registry.templates.find(item => item.id === id) || registry.templates[0];
    if (!template) throw new Error("No templates configured");
    return {
      ...template,
      yamlPath: resolveTemplatePath(template.yaml, "yaml"),
      workflowPath: resolveTemplatePath(template.workflow, "workflow"),
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
