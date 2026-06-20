import { useCallback, useEffect, useRef } from "react";
import {
  attachRunEventWatcher,
  buildNodeSuccessPatch,
  cancelServerRun,
  fetchActiveRuns,
  fetchOutputHistoryByRunId,
  findStaleRunLogSessions,
  matchCanvasNodeForSession,
  orphanGraceMsForSession,
  sessionMatchesProject,
  sessionStartedPastGrace
} from "./canvasRuntimeSync.js";
import { beginNodeExecutionPatch, STEP_KINDS } from "./canvasModel.js";

const SYNC_POLL_MS = 6000;
const SYNC_POLL_IDLE_MS = 15000;
const SYNC_MIN_GAP_MS = 4000;
const HISTORY_LOOKUP_RETRIES = 32;
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
  isLocalRun,
  isQueuedLocally
}) {
  const syncRunWatchersRef = useRef(new Map());
  const completingRunIdsRef = useRef(new Set());
  const syncingRef = useRef(false);
  const lastSyncAtRef = useRef(0);
  const syncTimerRef = useRef(null);
  const observedActiveRunIdsRef = useRef(new Set());
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

  const applyRunningState = useCallback((session) => {
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
      observedActiveRunIdsRef.current.delete(session.runId);
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
      const { runs: activeRuns, ok: activeRunsOk } = await fetchActiveRuns();
      const activeRunById = new Map(activeRuns.map(run => [run.runId, run]));
      const activeRunIds = new Set(activeRuns.map(run => run.runId));

      const trackedSessions = findStaleRunLogSessions(runLogSessionsRef.current)
        .filter(session => sessionMatchesProject(session, projectId));

      if (activeRunsOk) {
        for (const session of trackedSessions) {
          if (session.status !== "queued") continue;
          if (activeRunIds.has(session.runId)) continue;
          if (isQueuedLocally?.(session.runId)) continue;
          runLogEndSession?.(session.runId, "cancelled", { error: "missing_from_backend_queue" });
          observedActiveRunIdsRef.current.delete(session.runId);
        }
      }

      const runningSessions = trackedSessions.filter(session => {
        const activeRun = activeRunById.get(session.runId);
        if (activeRun?.status === "queued") return false;
        if (activeRun) observedActiveRunIdsRef.current.add(session.runId);
        if (session.status === "queued" && !activeRun && !observedActiveRunIdsRef.current.has(session.runId)) {
          return false;
        }
        return true;
      });

      const needsHistory = runningSessions.some(session => !activeRunIds.has(session.runId));
      const historyByRunId = needsHistory ? await fetchOutputHistoryByRunId() : new Map();

      const activeNodeIds = new Set();

      for (const session of runningSessions) {
        if (historyByRunId.has(session.runId)) {
          await completeFromHistory(session, historyByRunId.get(session.runId));
          continue;
        }

        if (activeRunIds.has(session.runId)) {
          applyRunningState(session);
          attachWatcher(session);
          const nodeId = matchCanvasNodeForSession(nodesRef.current, session);
          if (nodeId) activeNodeIds.add(nodeId);
          continue;
        }

        // Client still owns this run (in-flight POST) — never orphan/cancel from sync.
        if (isLocalRun?.(session.runId)) {
          const nodeId = matchCanvasNodeForSession(nodesRef.current, session);
          if (nodeId) activeNodeIds.add(nodeId);
          continue;
        }

        if (await tryCompleteSession(session, historyByRunId)) {
          continue;
        }

        if (!activeRunsOk) continue;

        if (reconciledStaleRunIdsRef.current.has(session.runId)) continue;
        if (!sessionStartedPastGrace(session, orphanGraceMsForSession(session))) continue;
        reconciledStaleRunIdsRef.current.add(session.runId);
        await cancelServerRun(session);
        runLogAppendLog?.(
          session.runId,
          "warn",
          "Phiên không còn trên server — đánh dấu đã hủy",
          { provider: session.provider }
        );
        runLogEndSession?.(session.runId, "cancelled", { error: "orphaned_session" });
        observedActiveRunIdsRef.current.delete(session.runId);
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
    isLocalRun,
    isQueuedLocally,
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
        .some(session => (
          sessionMatchesProject(session, activeIdRef.current)
          && (session.status === "running" || observedActiveRunIdsRef.current.has(session.runId))
        ));
      timer = window.setTimeout(async () => {
        await syncWithBackend();
        schedule();
      }, hasRunning ? SYNC_POLL_MS : SYNC_POLL_IDLE_MS);
    };
    schedule();
    const watchers = syncRunWatchersRef.current;
    return () => {
      window.clearTimeout(timer);
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      for (const cleanup of watchers.values()) cleanup();
      watchers.clear();
    };
  }, [syncWithBackend, activeId]);

  return { syncWithBackend };
}
