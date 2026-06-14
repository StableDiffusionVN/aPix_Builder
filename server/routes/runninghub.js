export function createRunningHubRoutes(context) {
  const {
    handleRhDefaultApps,
    handleRhDefaultAppsRefresh,
    handleRunningHubAccountStatus,
    handleRunningHubCancel,
    handleRunningHubNodes,
    handleRunningHubRun,
    handleRunningHubShortcutExport,
    handleRunningHubTaskCheck,
    handleRunningHubWfRun,
    handleRunningHubWfWorkflowJson,
    readBody,
    readRhSavedApps,
    send,
    writeRhSavedApps
  } = context;

  return async function runningHubRoutes(req, res, url) {
    if (req.method === "POST" && url.pathname === "/api/runninghub-wf/workflow-json") {
      await handleRunningHubWfWorkflowJson(req, res);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/runninghub/default-apps") {
      await handleRhDefaultApps(req, res);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/runninghub/default-apps/refresh") {
      await handleRhDefaultAppsRefresh(req, res);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/runninghub/saved-apps") {
      send(res, 200, { apps: await readRhSavedApps() });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/runninghub/saved-apps") {
      const body = JSON.parse(await readBody(req) || "{}");
      const apps = await writeRhSavedApps(body.apps || []);
      send(res, 200, { success: true, apps });
      return true;
    }
    const postRoutes = {
      "/api/runninghub/nodes": handleRunningHubNodes,
      "/api/runninghub/account-status": handleRunningHubAccountStatus,
      "/api/runninghub/export-shortcut": handleRunningHubShortcutExport,
      "/api/runninghub/run": handleRunningHubRun,
      "/api/runninghub-wf/run": handleRunningHubWfRun,
      "/api/runninghub/cancel": handleRunningHubCancel,
      "/api/runninghub/task-check": handleRunningHubTaskCheck
    };
    if (req.method === "POST" && postRoutes[url.pathname]) {
      await postRoutes[url.pathname](req, res);
      return true;
    }
    return false;
  };
}
