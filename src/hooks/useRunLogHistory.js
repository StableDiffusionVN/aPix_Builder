import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const APPEND_FLUSH_MS = 1000;
const REFRESH_POLL_MS = 8000;

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

function createLocalLogEntry(runId, level, message, meta = {}) {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    runId,
    ...meta
  };
}

export function useRunLogHistory() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const pendingAppendsRef = useRef([]);
  const flushTimerRef = useRef(null);
  const flushingRef = useRef(false);
  const recentLogKeysRef = useRef(new Map());

  const shouldSkipDuplicate = useCallback((runId, level, message) => {
    const key = `${runId}|${level}|${message}`;
    const now = Date.now();
    const lastAt = recentLogKeysRef.current.get(key);
    if (lastAt && now - lastAt < 2500) return true;
    recentLogKeysRef.current.set(key, now);
    if (recentLogKeysRef.current.size > 200) {
      for (const [entryKey, at] of recentLogKeysRef.current) {
        if (now - at > 10000) recentLogKeysRef.current.delete(entryKey);
      }
    }
    return false;
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await fetchRunLogSessions());
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
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

  const flushPendingAppends = useCallback(async () => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (flushingRef.current) return;
    const batch = pendingAppendsRef.current.splice(0);
    if (!batch.length) return;
    flushingRef.current = true;
    try {
      const nextSessions = await postRunLog("/api/run-log/append-batch", { entries: batch });
      applyServerSessions(nextSessions);
    } catch {
      pendingAppendsRef.current.unshift(...batch);
      await refreshSessions();
    } finally {
      flushingRef.current = false;
      if (pendingAppendsRef.current.length) {
        flushTimerRef.current = window.setTimeout(() => {
          void flushPendingAppends();
        }, APPEND_FLUSH_MS);
      }
    }
  }, [applyServerSessions, refreshSessions]);

  const scheduleAppendFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flushPendingAppends();
    }, APPEND_FLUSH_MS);
  }, [flushPendingAppends]);

  const syncMutation = useCallback(async (path, body, { clearSelected = false } = {}) => {
    await flushPendingAppends();
    try {
      const nextSessions = await postRunLog(path, body);
      applyServerSessions(nextSessions, clearSelected);
      return true;
    } catch {
      await refreshSessions();
      return false;
    }
  }, [applyServerSessions, flushPendingAppends, refreshSessions]);

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
    if (shouldSkipDuplicate(runId, level, message)) return;
    const entry = createLocalLogEntry(runId, level, message, meta);
    setSessions(prev => prev.map(session => {
      if (session.runId !== runId) return session;
      return {
        ...session,
        logs: [...session.logs, entry]
      };
    }));
    pendingAppendsRef.current.push({ runId, level, message, meta });
    scheduleAppendFlush();
  }, [scheduleAppendFlush, shouldSkipDuplicate]);

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
    pendingAppendsRef.current = [];
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
    getDisplayLogs,
    REFRESH_POLL_MS
  };
}
