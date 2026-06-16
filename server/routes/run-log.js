export function createRunLogRoutes(context) {
  const {
    appendRunLog,
    appendRunLogs,
    clearRunLogSessions,
    deleteRunLogSession,
    endRunLogSession,
    handleRunLogMutate,
    handleRunLogSessions,
    startRunLogSession,
    updateRunLogSession
  } = context;

  return async function runLogRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/run-log/sessions") {
      handleRunLogSessions(req, res);
      return true;
    }
    const mutations = {
      "/api/run-log/session/start": body => startRunLogSession(body.job, body.meta || {}),
      "/api/run-log/session/update": body => updateRunLogSession(body.runId, body.patch || {}),
      "/api/run-log/append": body => appendRunLog(body.runId, body.level, body.message, body.meta || {}),
      "/api/run-log/append-batch": body => appendRunLogs(body.entries || []),
      "/api/run-log/session/end": body => endRunLogSession(body.runId, body.status, body.meta || {}),
      "/api/run-log/session/delete": body => deleteRunLogSession(body.sessionId),
      "/api/run-log/clear": () => clearRunLogSessions()
    };
    if (req.method === "POST" && mutations[url.pathname]) {
      await handleRunLogMutate(req, res, mutations[url.pathname]);
      return true;
    }
    return false;
  };
}
