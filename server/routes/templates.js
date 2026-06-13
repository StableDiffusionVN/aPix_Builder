export function createTemplateRoutes(context) {
  const {
    TEMPLATE_SCOPES,
    assertTemplateWorkflow,
    handleTemplateDelete,
    handleTemplateEditor,
    handleTemplateSave,
    send,
    templateScopeFromUrl,
    templates
  } = context;

  return async function templateRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/templates") {
      const registry = await templates().loadTemplateRegistry(templateScopeFromUrl(url));
      send(res, 200, registry);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      const scope = templateScopeFromUrl(url);
      const service = templates();
      const result = await service.loadConfig(url.searchParams.get("template"), scope);
      if (scope !== TEMPLATE_SCOPES.runninghubWf || service.usesSavedWorkflowJson(result.config, result.template)) {
        await assertTemplateWorkflow(result.config, result.template, {
          requireOutput: scope !== TEMPLATE_SCOPES.runninghubWf
        });
      }
      send(res, 200, {
        config: result.config,
        raw: result.raw,
        server: result.server,
        scope,
        template: {
          id: result.template.id,
          name: result.template.name,
          yaml: result.template.yaml,
          workflow: result.template.workflow,
          scope
        }
      });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/template-editor") {
      await handleTemplateEditor(req, res, url);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/templates/save") {
      await handleTemplateSave(req, res, url);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/templates/delete") {
      await handleTemplateDelete(req, res, url);
      return true;
    }
    return false;
  };
}
