import { useCallback, useEffect, useMemo, useState } from "react";

const LEGACY_STORAGE_KEY = "comfyui-build:run-log-sessions:v1";

async function fetchRunLogSessions() {
  const response = await fetch("/api/run-log/sessions");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không tải được run log");
  return Array.isArray(data.sessions) ? data.sessions : [];
}

async function postRunLog(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Run log request failed");
  return Array.isArray(data.sessions) ? data.sessions : [];
}

export function useRunLogHistory() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await fetchRunLogSessions());
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {}
    refreshSessions();
  }, [refreshSessions]);

  const applyServerSessions = useCallback((nextSessions, onEmptySelected) => {
    setSessions(nextSessions);
    if (onEmptySelected) {
      setSelectedSessionId(current => (
        nextSessions.some(session => session.id === current) ? current : null
      ));
    }
  }, []);

  const syncMutation = useCallback(async (path, body, { clearSelected = false } = {}) => {
    try {
      const nextSessions = await postRunLog(path, body);
      applyServerSessions(nextSessions, clearSelected);
      return true;
    } catch {
      await refreshSessions();
      return false;
    }
  }, [applyServerSessions, refreshSessions]);

  const startSession = useCallback((job, meta = {}) => {
    if (!job?.runId) return;
    setSelectedSessionId(null);
    void syncMutation("/api/run-log/session/start", { job, meta });
  }, [syncMutation]);

  const updateSession = useCallback((runId, patch = {}) => {
    if (!runId) return;
    void syncMutation("/api/run-log/session/update", { runId, patch });
  }, [syncMutation]);

  const appendLog = useCallback((runId, level, message, meta = {}) => {
    if (!runId) return;
    void syncMutation("/api/run-log/append", { runId, level, message, meta });
  }, [syncMutation]);

  const endSession = useCallback((runId, status, meta = {}) => {
    if (!runId) return;
    void syncMutation("/api/run-log/session/end", { runId, status, meta });
  }, [syncMutation]);

  const deleteSession = useCallback((sessionId) => {
    if (!sessionId) return;
    void syncMutation("/api/run-log/session/delete", { sessionId }, { clearSelected: true });
  }, [syncMutation]);

  const clearHistory = useCallback(() => {
    setSelectedSessionId(null);
    void syncMutation("/api/run-log/clear", {});
  }, [syncMutation]);

  const selectSession = useCallback((sessionId) => {
    setSelectedSessionId(sessionId || null);
  }, []);

  const getDisplayLogs = useCallback((activeRunId = "") => {
    if (selectedSessionId) {
      return sessions.find(session => session.id === selectedSessionId)?.logs || [];
    }
    if (activeRunId) {
      return sessions.find(session => session.runId === activeRunId)?.logs || [];
    }
    return sessions[0]?.logs || [];
  }, [selectedSessionId, sessions]);

  const selectedSession = useMemo(
    () => sessions.find(session => session.id === selectedSessionId) || null,
    [selectedSessionId, sessions]
  );

  return {
    sessions,
    selectedSessionId,
    selectedSession,
    selectSession,
    startSession,
    updateSession,
    appendLog,
    endSession,
    deleteSession,
    clearHistory,
    refreshSessions,
    getDisplayLogs
  };
}
