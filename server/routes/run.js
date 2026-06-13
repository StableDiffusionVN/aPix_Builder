export function createRunRoutes(context) {
  const {
    cancelQueueItems,
    handleCancel,
    handleComfyDiscovery,
    handleComfyHealth,
    handleComfyModels,
    handleComfyView,
    handleRun,
    handleRunEvents,
    normalizeComfyTarget,
    readBody,
    send
  } = context;

  return async function runRoutes(req, res, url) {
    if (req.method === "POST" && url.pathname === "/api/run") {
      await handleRun(req, res);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/cancel") {
      await handleCancel(req, res);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/run-events") {
      await handleRunEvents(req, res, url);
      return true;
    }
    const comfyGetRoutes = {
      "/api/comfy-view": handleComfyView,
      "/api/comfy-models": handleComfyModels,
      "/api/comfy-discovery": handleComfyDiscovery,
      "/api/comfy-health": handleComfyHealth
    };
    if (req.method === "GET" && comfyGetRoutes[url.pathname]) {
      await comfyGetRoutes[url.pathname](req, res, url);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/comfy-queue-cancel") {
      const body = JSON.parse(await readBody(req) || "{}");
      const target = normalizeComfyTarget(body.address);
      await cancelQueueItems(target, {
        clear: Boolean(body.clear),
        promptIds: body.promptIds || []
      });
      send(res, 200, { ok: true });
      return true;
    }
    return false;
  };
}
