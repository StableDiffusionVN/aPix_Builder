import { useCallback, useEffect, useRef } from "react";
import {
  attachRunEventWatcher,
  buildNodeSuccessPatch,
  cancelServerRun,
  fetchActiveRuns,
  fetchOutputHistoryByRunId,
  findStaleRunLogSessions,
  matchCanvasNodeForSession,
  sessionMatchesProject
} from "./canvasRuntimeSync.js";
import { beginNodeExecutionPatch, STEP_KINDS } from "./canvasModel.js";

const SYNC_POLL_MS = 6000;
const SYNC_POLL_IDLE_MS = 15000;
const SYNC_MIN_GAP_MS = 4000;
const ORPHAN_SESSION_GRACE_MS = 15000;
const HISTORY_LOOKUP_RETRIES = 24;
const HISTORY_LOOKUP_DELAY_MS = 750;

async function waitForHistoryItem(runId) {
  for (let attempt = 0; attempt < HISTORY_LOOKUP_RETRIES; attempt += 1) {
    const historyByRunId = await fetchOutputHistoryByRunId();
    const historyItem = historyByRunId.get(runId);
    if (historyItem) return historyItem;
    if (attempt < HISTORY_LOOKUP_RETRIES - 1) {
      await new Promise(resolve => window.setTimeout(resolve, HISTORY_LOOKUP_DELAY_MS));
    }
  }
  return null;
}

function sessionStartedLongAgo(session) {
  const startedAt = session?.startedAt ? new Date(session.startedAt).getTime() : 0;
  if (!startedAt) return true;
  return Date.now() - startedAt > ORPHAN_SESSION_GRACE_MS;
}

export function useCanvasRunSync({
  activeId,
  runLogSessions,
  nodesRef,
  updateNodeData,
  refreshOutputHistory,
  runLogAppendLog,
  runLogEndSession,
  setGraphRunning,
  setNodeRunning,
  setActiveRunId,
  activeRunIdRef,
  activeRunKindRef,
  reconciledStaleRunIdsRef,
  isLocalRun
}) {
  const syncRunWatchersRef = useRef(new Map());
  const completingRunIdsRef = useRef(new Set());
  const syncingRef = useRef(false);
  const lastSyncAtRef = useRef(0);
  const syncTimerRef = useRef(null);
  const runLogSessionsRef = useRef(runLogSessions);
  const activeIdRef = useRef(activeId);
  const syncWithBackendRef = useRef(async () => {});

  useEffect(() => { runLogSessionsRef.current = runLogSessions || []; }, [runLogSessions]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const cleanupWatcher = useCallback((runId) => {
    const cleanup = syncRunWatchersRef.current.get(runId);
    if (cleanup) cleanup();
    syncRunWatchersRef.current.delete(runId);
  }, []);

  const applyRunningState = useCallback((session, activeRun) => {
    const nodeId = matchCanvasNodeForSession(nodesRef.current, session);
    if (nodeId && nodesRef.current.find(node => node.id === nodeId)?.data?.status !== "running") {
      updateNodeData(nodeId, beginNodeExecutionPatch());
    }
    activeRunIdRef.current = session.runId;
    activeRunKindRef.current = session.provider === "local" ? STEP_KINDS.LOCAL : STEP_KINDS.RH_APP;
    setActiveRunId(session.runId);
    if (session.runKind === "canvas-graph") {
      setGraphRunning(true);
      setNodeRunning(false);
    } else {
      setNodeRunning(true);
      setGraphRunning(false);
    }
  }, [
    activeRunIdRef,
    activeRunKindRef,
    nodesRef,
    setActiveRunId,
    setGraphRunning,
    setNodeRunning,
    updateNodeData
  ]);

  const completeFromHistory = useCallback(async (session, historyItem) => {
    if (completingRunIdsRef.current.has(session.runId)) return;
    completingRunIdsRef.current.add(session.runId);
    try {
      cleanupWatcher(session.runId);
      const nodeId = matchCanvasNodeForSession(nodesRef.current, session);
      if (nodeId) {
        updateNodeData(nodeId, buildNodeSuccessPatch(session, historyItem));
      }
      runLogEndSession?.(session.runId, "success", {
        taskId: historyItem?.promptId || session.taskId || "",
        durationMs: historyItem?.durationMs ?? null,
        rhCoins: historyItem?.rhCoins ?? null
      });
      if (activeRunIdRef.current === session.runId) {
        activeRunIdRef.current = "";
        activeRunKindRef.current = null;
        setActiveRunId("");
        setGraphRunning(false);
        setNodeRunning(false);
      }
      refreshOutputHistory?.();
    } finally {
      completingRunIdsRef.current.delete(session.runId);
    }
  }, [
    activeRunIdRef,
    activeRunKindRef,
    cleanupWatcher,
    nodesRef,
    refreshOutputHistory,
    runLogEndSession,
    setActiveRunId,
    setGraphRunning,
    setNodeRunning,
    updateNodeData
  ]);

  const tryCompleteSession = useCallback(async (session, historyByRunId) => {
    const cached = historyByRunId.get(session.runId);
    if (cached) {
      await completeFromHistory(session, cached);
      return true;
    }
    const historyItem = await waitForHistoryItem(session.runId);
    if (historyItem) {
      await completeFromHistory(session, historyItem);
      return true;
    }
    return false;
  }, [completeFromHistory]);

  const scheduleSync = useCallback((force = false) => {
    if (syncTimerRef.current) {
      if (!force) return;
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void syncWithBackendRef.current({ force });
    }, force ? 400 : 800);
  }, []);

  const attachWatcher = useCallback((session) => {
    if (syncRunWatchersRef.current.has(session.runId)) return;
    if (isLocalRun?.(session.runId)) return;

    const cleanup = attachRunEventWatcher(session.runId, {
      onEnd: () => {
        void tryCompleteSession(session, new Map());
      },
      onDisconnect: () => {
        scheduleSync(true);
      }
    });
    syncRunWatchersRef.current.set(session.runId, cleanup);
  }, [isLocalRun, scheduleSync, tryCompleteSession]);

  const syncWithBackend = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastSyncAtRef.current < SYNC_MIN_GAP_MS) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    lastSyncAtRef.current = now;
    try {
      const projectId = activeIdRef.current;
      const activeRuns = await fetchActiveRuns();
      const activeRunById = new Map(activeRuns.map(run => [run.runId, run]));
      const activeRunIds = new Set(activeRuns.map(run => run.runId));

      const runningSessions = findStaleRunLogSessions(runLogSessionsRef.current)
        .filter(session => sessionMatchesProject(session, projectId));

      const needsHistory = runningSessions.some(session => !activeRunIds.has(session.runId));
      const historyByRunId = needsHistory ? await fetchOutputHistoryByRunId() : new Map();

      const activeNodeIds = new Set();

      for (const session of runningSessions) {
        if (historyByRunId.has(session.runId)) {
          await completeFromHistory(session, historyByRunId.get(session.runId));
          continue;
        }

        if (activeRunIds.has(session.runId)) {
          applyRunningState(session, activeRunById.get(session.runId));
          attachWatcher(session);
          const nodeId = matchCanvasNodeForSession(nodesRef.current, session);
          if (nodeId) activeNodeIds.add(nodeId);
          continue;
        }

        if (await tryCompleteSession(session, historyByRunId)) {
          continue;
        }

        if (reconciledStaleRunIdsRef.current.has(session.runId)) continue;
        if (!sessionStartedLongAgo(session)) continue;
        reconciledStaleRunIdsRef.current.add(session.runId);
        await cancelServerRun(session);
        runLogAppendLog?.(
          session.runId,
          "warn",
          "Phiên không còn trên server — đánh dấu đã hủy",
          { provider: session.provider }
        );
        runLogEndSession?.(session.runId, "cancelled", { error: "orphaned_session" });
        cleanupWatcher(session.runId);
        if (activeRunIdRef.current === session.runId) {
          activeRunIdRef.current = "";
          activeRunKindRef.current = null;
          setActiveRunId("");
          setGraphRunning(false);
          setNodeRunning(false);
        }
      }

      for (const node of nodesRef.current) {
        if (node.type === "step" && node.data?.status === "running" && !activeNodeIds.has(node.id)) {
          const stillTracked = runningSessions.some(session => {
            if (!activeRunIds.has(session.runId)) return false;
            return matchCanvasNodeForSession(nodesRef.current, session) === node.id;
          });
          if (!stillTracked) {
            updateNodeData(node.id, { status: "idle", error: "" });
          }
        }
      }

      if (!runningSessions.length && !activeRunIdRef.current) {
        setGraphRunning(false);
        setNodeRunning(false);
      }
    } finally {
      syncingRef.current = false;
    }
  }, [
    activeRunIdRef,
    activeRunKindRef,
    applyRunningState,
    attachWatcher,
    cleanupWatcher,
    completeFromHistory,
    nodesRef,
    reconciledStaleRunIdsRef,
    runLogAppendLog,
    runLogEndSession,
    setActiveRunId,
    setGraphRunning,
    setNodeRunning,
    tryCompleteSession,
    updateNodeData
  ]);

  syncWithBackendRef.current = (options) => syncWithBackend(options);

  useEffect(() => {
    void syncWithBackend({ force: true });
    let timer = null;
    const schedule = () => {
      window.clearTimeout(timer);
      const hasRunning = findStaleRunLogSessions(runLogSessionsRef.current)
        .some(session => sessionMatchesProject(session, activeIdRef.current));
      timer = window.setTimeout(async () => {
        await syncWithBackend();
        schedule();
      }, hasRunning ? SYNC_POLL_MS : SYNC_POLL_IDLE_MS);
    };
    schedule();
    return () => {
      window.clearTimeout(timer);
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      for (const cleanup of syncRunWatchersRef.current.values()) cleanup();
      syncRunWatchersRef.current.clear();
    };
  }, [syncWithBackend, activeId]);

  return { syncWithBackend };
}
