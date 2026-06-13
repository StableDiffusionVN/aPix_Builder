export function createPresetsRoutes(context) {
  const {
    readBody,
    readCustomPresets,
    readWorkflowPresets,
    send,
    writeCustomPresets,
    writeWorkflowPresets
  } = context;

  return async function presetRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/presets") {
      send(res, 200, { presets: await readCustomPresets() });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/presets") {
      const body = JSON.parse(await readBody(req) || "{}");
      const presets = body.presets || [];
      await writeCustomPresets(presets);
      send(res, 200, { success: true, presets });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/workflow-presets") {
      send(res, 200, { presets: await readWorkflowPresets() });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/workflow-presets") {
      const body = JSON.parse(await readBody(req) || "{}");
      const presets = body.presets && typeof body.presets === "object" && !Array.isArray(body.presets)
        ? body.presets
        : {};
      await writeWorkflowPresets(presets);
      send(res, 200, { success: true, presets });
      return true;
    }
    return false;
  };
}
