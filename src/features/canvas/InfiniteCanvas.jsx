import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RunControls } from "../../components/RunControls.jsx";
import { StepNode } from "./nodes/StepNode.jsx";
import { SourceNode } from "./nodes/SourceNode.jsx";
import { StepPalette } from "./StepPalette.jsx";
import { CanvasActionsContext } from "./canvasContext.js";
import { useCanvasProject } from "./useCanvasProject.js";
import { loadStepDefinition, useStepLibrary } from "./useStepLibrary.js";
import { runCanvasNode, bypassCanvasNode } from "./canvasRunner.js";
import { buildCanvasNodeDefaults, arePortsCompatible, STEP_KINDS, topoOrder, upstreamStepsNeedingRunAsync, upstreamStepsWithStaleFilesAsync, linkedImageInputsMissingSource, beginNodeExecutionPatch, nodeRunCachePatch, clearNodeRunCachePatch, isNodeRunCacheReady } from "./canvasModel.js";
import { buildDefaults, flattenInputs } from "../../lib/template.js";
import { buildRhRunAuth, getPrimaryRhApiKey, hasRhApiKey } from "../../lib/rhTokenPool.js";
import { getSetting, setSetting } from "../../lib/appSettings.js";
import { isTypingTarget } from "../../lib/keyboard.js";
import { RunLogPanel } from "../../components/lazyModals.js";
import { CanvasDock, CanvasFlyoutPanel, CANVAS_PANELS } from "./CanvasDock.jsx";
import { CanvasProjectPanel } from "./CanvasProjectPanel.jsx";
import { CanvasNodesPanel } from "./CanvasNodesPanel.jsx";
import { CanvasHistoryPanel } from "./CanvasHistoryPanel.jsx";
import { CanvasFlowPanel } from "./CanvasFlowPanel.jsx";
import { CanvasContextMenu } from "./CanvasContextMenu.jsx";
import {
  buildEdgeContextMenuItems,
  buildFieldContextMenuItems,
  buildNodeContextMenuItems,
  buildPreviewContextMenuItems
} from "./canvasMenuHelpers.js";

const nodeTypes = { step: StepNode, source: SourceNode };

function portTypeFromHandle(node, handle, direction) {
  if (!node || !handle) return null;
  if (node.type === "source") {
    return node.data?.sourceType || node.data?.port?.type || "any";
  }
  if (direction === "out") {
    const key = handle.startsWith("out:") ? handle.slice(4) : handle;
    return (node.data?.ports?.outputs || []).find(port => port.key === key)?.type || "image";
  }
  const key = handle.startsWith("in:") ? handle.slice(3) : handle;
  return (node.data?.ports?.inputs || []).find(port => port.valueKey === key)?.type || null;
}

function buildCanvasRunJob(node, runId) {
  if (node.data.kind === STEP_KINDS.RH_APP) {
    return { runId, webappId: String(node.data.ref).trim() };
  }
  if (node.data.kind === STEP_KINDS.RH_WF) {
    return { runId, templateId: node.data.ref };
  }
  return { runId, template: node.data.ref };
}

function runLogProvider(kind) {
  return kind === STEP_KINDS.LOCAL ? "local" : "runninghub";
}

function InfiniteCanvasInner({
  rhSettings,
  inputImages,
  refreshInputImages,
  updateInputImages,
  outputHistory,
  refreshOutputHistory,
  runLogSessions,
  refreshRunLogSessions,
  runLogStartSession,
  runLogAppendLog,
  runLogEndSession,
  runLogClearHistory,
  runLogOpen,
  setRunLogOpen,
  deleteRunLogSession,
  updateRunLogSession,
  restoreHistory,
  logRhApiKey
}) {
  const { library, loading, error, reload } = useStepLibrary();
  const {
    nodes, edges,
    projects, activeId, activeName,
    onNodesChange, onEdgesChange, onConnect, setEdges,
    addNode, updateNodeData, updateNodeSize, removeNode, removeEdge,
    disconnectTargetPort, toggleNodeBypass, convertInputToSource, clearProject,
    switchProject, createProject, renameProject, deleteProject
  } = useCanvasProject();

  const [activePanel, setActivePanel] = useState(null);
  const [addingRef, setAddingRef] = useState("");
  const [graphRunning, setGraphRunning] = useState(false);
  const [nodeRunning, setNodeRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [runQueue, setRunQueue] = useState([]);
  const [minimapOpen, setMinimapOpen] = useState(() => getSetting("canvas.minimapOpen", true));
  const [canvasTool, setCanvasTool] = useState(() => getSetting("canvas.tool", "select") === "hand" ? "hand" : "select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const runLockRef = useRef(false);
  const activeRunIdRef = useRef("");
  const activeRunKindRef = useRef(null);
  const abortControllerRef = useRef(null);
  const pipelineCancelledRef = useRef(false);
  const runQueueRef = useRef([]);
  const queueSequenceRef = useRef(0);
  const drainRunQueueRef = useRef(() => {});
  const executeNodeRunRef = useRef(null);
  const executeGraphRunRef = useRef(null);
  const canvasRunning = graphRunning || nodeRunning;
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const syncLiveToRefs = useCallback((live) => {
    nodesRef.current = live.map(item => ({
      ...item,
      data: { ...item.data }
    }));
  }, []);

  useEffect(() => {
    setSetting("canvas.minimapOpen", minimapOpen);
  }, [minimapOpen]);

  useEffect(() => {
    setSetting("canvas.tool", canvasTool);
  }, [canvasTool]);

  useEffect(() => {
    let shortcutActive = false;

    function handleKeyDown(event) {
      if (event.code !== "Space" || event.repeat || isTypingTarget(event.target)) return;
      shortcutActive = true;
      event.preventDefault();
      setSpaceHeld(true);
    }

    function releaseShortcut(event) {
      if (event?.code && event.code !== "Space") return;
      if (!shortcutActive) return;
      shortcutActive = false;
      setSpaceHeld(false);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", releaseShortcut, true);
    window.addEventListener("blur", releaseShortcut);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", releaseShortcut, true);
      window.removeEventListener("blur", releaseShortcut);
    };
  }, []);

  const activeCanvasTool = spaceHeld
    ? (canvasTool === "select" ? "hand" : "select")
    : canvasTool;

  const toggleMinimap = useCallback(() => {
    setMinimapOpen(current => {
      const next = !current;
      if (next) setRunLogOpen?.(false);
      return next;
    });
  }, [setRunLogOpen]);

  const toggleLog = useCallback(() => {
    setRunLogOpen?.(current => {
      const next = !current;
      if (next) setMinimapOpen(false);
      return next;
    });
  }, [setRunLogOpen]);

  useEffect(() => {
    if (runLogOpen) setMinimapOpen(false);
  }, [runLogOpen]);

  const logHasActivity = canvasRunning || (runLogSessions?.length ?? 0) > 0;
  const logBadgeCount = canvasRunning ? 1 : 0;

  useEffect(() => {
    refreshRunLogSessions?.();
  }, [refreshRunLogSessions]);

  useEffect(() => {
    if (!runLogOpen) return;
    refreshRunLogSessions?.();
  }, [runLogOpen, refreshRunLogSessions]);

  useEffect(() => {
    if (!runLogOpen || !canvasRunning) return undefined;
    const timer = window.setInterval(() => {
      refreshRunLogSessions?.();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [runLogOpen, canvasRunning, refreshRunLogSessions]);

  const rhAuth = useMemo(() => buildRhRunAuth(rhSettings), [rhSettings]);
  const rhApiKey = useMemo(() => getPrimaryRhApiKey(rhSettings), [rhSettings]);

  const makeRunLogger = useCallback((runId, provider) => (level, message) => {
    runLogAppendLog?.(runId, level, message, { provider });
  }, [runLogAppendLog]);

  const nextPosition = useCallback(() => {
    const count = nodesRef.current.length;
    return { x: 120 + (count % 4) * 60, y: 80 + count * 40 };
  }, []);

  const handleAddStep = useCallback(async (item) => {
    setAddingRef(item.ref);
    try {
      const def = await loadStepDefinition({ kind: item.kind, ref: item.ref, apiKey: rhApiKey });
      const values = def.kind === STEP_KINDS.RH_APP
        ? buildCanvasNodeDefaults(def.nodes || [])
        : buildDefaults(flattenInputs(def.config?.input || {}));
      addNode({
        id: `n_${crypto.randomUUID().slice(0, 8)}`,
        type: "step",
        position: nextPosition(),
        data: {
          kind: def.kind,
          ref: def.ref,
          name: def.name,
          ports: def.ports,
          config: def.config || null,
          nodes: def.nodes || null,
          serverAddress: def.serverAddress || "",
          values,
          status: "idle"
        }
      });
    } catch (err) {
      console.error("Could not add canvas step:", err);
    } finally {
      setAddingRef("");
    }
  }, [addNode, nextPosition, rhApiKey]);

  const handleAddSource = useCallback((sourceType) => {
    const definitions = {
      image: {
        name: "Image input",
        sourceType: "image",
        port: { type: "image", uiType: "image" },
        value: ""
      },
      text: {
        name: "Text input",
        sourceType: "text",
        port: { type: "text", uiType: "string" },
        value: ""
      },
      int: {
        name: "Integer input",
        sourceType: "number",
        port: { type: "number", uiType: "int", step: 1 },
        value: 0
      },
      float: {
        name: "Float input",
        sourceType: "number",
        port: { type: "number", uiType: "float", step: "any" },
        value: 0
      },
      boolean: {
        name: "Boolean input",
        sourceType: "boolean",
        port: { type: "boolean", uiType: "boolean" },
        value: false
      },
      menu: {
        name: "Menu input",
        sourceType: "choice",
        port: { type: "choice", uiType: "menu", choices: ["Option 1", "Option 2"] },
        value: "Option 1"
      },
      checkpoint: {
        name: "Checkpoint input",
        sourceType: "choice",
        port: { type: "choice", uiType: "checkpoints" },
        value: ""
      },
      lora: {
        name: "Lora input",
        sourceType: "choice",
        port: { type: "choice", uiType: "loras" },
        value: ""
      }
    };
    const definition = definitions[sourceType] || definitions.text;
    addNode({
      id: `s_${crypto.randomUUID().slice(0, 8)}`,
      type: "source",
      position: nextPosition(),
      data: {
        sourceType: definition.sourceType,
        name: definition.name,
        port: definition.port,
        values: { main: definition.value },
        status: "idle"
      }
    });
  }, [addNode, nextPosition]);

  const openContextMenu = useCallback((event, items) => {
    event.preventDefault();
    event.stopPropagation();
    if (!items?.length) return;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const updateNodeValues = useCallback((id, patch) => {
    updateNodeData(id, prev => ({ values: { ...(prev.values || {}), ...patch } }));
  }, [updateNodeData]);

  const resetRunningNodes = useCallback(() => {
    for (const node of nodesRef.current) {
      if (node.type === "step" && node.data?.status === "running") {
        updateNodeData(node.id, { status: "idle", error: "" });
      }
    }
  }, [updateNodeData]);

  const executeNode = useCallback(async (node, contextNodes, { pipelineIntro = "" } = {}) => {
    const runId = crypto.randomUUID();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    activeRunIdRef.current = runId;
    activeRunKindRef.current = node.data.kind;
    const provider = runLogProvider(node.data.kind);
    const job = buildCanvasRunJob(node, runId);
    setActiveRunId(runId);
    runLogStartSession?.(job, { provider, status: "running" });
    const log = makeRunLogger(runId, provider);
    if (pipelineIntro) log("info", pipelineIntro);
    try {
      const runner = node.data?.bypassed ? bypassCanvasNode : runCanvasNode;
      const { outputs, raw } = await runner({
        node,
        nodes: contextNodes,
        edges: edgesRef.current,
        rhAuth,
        runId,
        signal: abortController.signal,
        onLog: log
      });
      if (pipelineCancelledRef.current) {
        throw new DOMException("Cancelled", "AbortError");
      }
      runLogEndSession?.(runId, "success", {
        taskId: raw?.taskId,
        durationMs: raw?.durationMs ?? raw?.historyItem?.durationMs,
        rhCoins: raw?.rhCoins ?? raw?.historyItem?.rhCoins
      });
      return {
        outputs,
        runId,
        metadata: {
          durationMs: raw?.durationMs ?? raw?.historyItem?.durationMs ?? null,
          rhCoins: raw?.rhCoins ?? raw?.historyItem?.rhCoins ?? null,
          provider
        }
      };
    } catch (err) {
      if (err.name === "AbortError" || pipelineCancelledRef.current) {
        log("warn", "Đã hủy");
        runLogEndSession?.(runId, "cancelled");
        throw err;
      }
      log("error", err.message);
      runLogEndSession?.(runId, "error", { error: err.message });
      throw err;
    } finally {
      if (activeRunIdRef.current === runId) {
        activeRunIdRef.current = "";
        activeRunKindRef.current = null;
        setActiveRunId("");
      }
      abortControllerRef.current = null;
      refreshRunLogSessions?.();
    }
  }, [rhAuth, makeRunLogger, runLogStartSession, runLogEndSession, refreshRunLogSessions]);

  const cancelCanvasRun = useCallback(async () => {
    runQueueRef.current = [];
    setRunQueue([]);
    if (!activeRunIdRef.current && !runLockRef.current) return;
    pipelineCancelledRef.current = true;
    abortControllerRef.current?.abort();
    const runId = activeRunIdRef.current;
    const kind = activeRunKindRef.current;
    if (runId) {
      const endpoint = kind === STEP_KINDS.LOCAL ? "/api/cancel" : "/api/runninghub/cancel";
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId })
        });
      } catch {}
    }
    setGraphRunning(false);
    setNodeRunning(false);
    resetRunningNodes();
    refreshRunLogSessions?.();
  }, [resetRunningNodes, refreshRunLogSessions]);

  const applyStepSuccess = useCallback((live, stepId, outputs, runId = "", metadata = {}) => {
    const index = live.findIndex(item => item.id === stepId);
    if (index < 0) return;
    const patch = nodeRunCachePatch(outputs, runId, metadata);
    live[index] = { ...live[index], data: { ...live[index].data, ...patch } };
    updateNodeData(stepId, patch);
    syncLiveToRefs(live);
  }, [updateNodeData, syncLiveToRefs]);

  const runStepInLive = useCallback(async (live, stepId, pipelineIntro = "") => {
    const index = live.findIndex(item => item.id === stepId);
    if (index < 0) throw new Error("Node not found");
    const startPatch = beginNodeExecutionPatch();
    live[index] = { ...live[index], data: { ...live[index].data, ...startPatch } };
    updateNodeData(stepId, startPatch);
    syncLiveToRefs(live);
    const { outputs, runId, metadata } = await executeNode(live[index], live, { pipelineIntro });
    return { outputs, runId, metadata };
  }, [executeNode, updateNodeData, syncLiveToRefs]);

  const executeNodeRun = useCallback(async (id) => {
    if (runLockRef.current) return false;
    const node = nodesRef.current.find(item => item.id === id);
    if (!node || node.type !== "step") return false;

    runLockRef.current = true;
    setNodeRunning(true);
    pipelineCancelledRef.current = false;
    const live = nodesRef.current.map(item => ({ ...item, data: { ...item.data } }));

    try {
      const missingSources = linkedImageInputsMissingSource(node, live, edgesRef.current);
      const blocked = missingSources.find(item => !item.canAutoRun);
      if (blocked) {
        const sourceName = blocked.source.data?.name || blocked.source.id;
        updateNodeData(id, {
          status: "error",
          error: `Input ảnh "${blocked.port.label}" thiếu ảnh từ "${sourceName}" — thêm ảnh vào node nguồn trước`
        });
        return true;
      }

      const upstreamIds = await upstreamStepsNeedingRunAsync(id, live, edgesRef.current);
      const stepsToRun = [...upstreamIds, id];
      const needsRhAny = stepsToRun.some(stepId => {
        const step = live.find(item => item.id === stepId);
        return step && !step.data.bypassed && (
          step.data.kind === STEP_KINDS.RH_APP || step.data.kind === STEP_KINDS.RH_WF
        );
      });
      if (needsRhAny && !hasRhApiKey(rhSettings)) {
        updateNodeData(id, { status: "error", error: "Thiếu RunningHub API key" });
        return true;
      }

      for (const upstreamId of upstreamIds) {
        if (pipelineCancelledRef.current) break;
        const upstream = live.find(item => item.id === upstreamId);
        const intro = upstream
          ? `Tự chạy node upstream (chưa có cache output): ${upstream.data?.name || upstreamId}`
          : "";
        try {
          const { outputs, runId, metadata } = await runStepInLive(live, upstreamId, intro);
          applyStepSuccess(live, upstreamId, outputs, runId, metadata);
        } catch (err) {
          if (err.name === "AbortError" || pipelineCancelledRef.current) {
            updateNodeData(upstreamId, { status: "idle", error: "" });
            updateNodeData(id, { status: "idle", error: "" });
            return;
          }
          updateNodeData(upstreamId, {
            status: "error",
            error: err.message,
            ...clearNodeRunCachePatch()
          });
          updateNodeData(id, { status: "idle", error: "" });
          return;
        }
      }

      if (pipelineCancelledRef.current) {
        updateNodeData(id, { status: "idle", error: "" });
        return;
      }

      const stillMissing = linkedImageInputsMissingSource(
        live.find(item => item.id === id),
        live,
        edgesRef.current
      );
      if (stillMissing.length) {
        const item = stillMissing[0];
        const sourceName = item.source.data?.name || item.source.id;
        updateNodeData(id, {
          status: "error",
          error: `Input ảnh "${item.port.label}" vẫn thiếu từ "${sourceName}" sau khi chạy upstream`
        });
        return;
      }

      const runTarget = async () => {
        const { outputs, runId, metadata } = await runStepInLive(live, id);
        applyStepSuccess(live, id, outputs, runId, metadata);
      };

      try {
        await runTarget();
      } catch (err) {
        if (!err.message?.includes("file không tồn tại")) throw err;
        const staleIds = await upstreamStepsWithStaleFilesAsync(id, live, edgesRef.current);
        if (!staleIds.length) throw err;
        for (const upstreamId of staleIds) {
          if (pipelineCancelledRef.current) break;
          const upstream = live.find(item => item.id === upstreamId);
          const intro = upstream
            ? `Tự chạy lại node upstream (file output đã mất): ${upstream.data?.name || upstreamId}`
            : "";
          const { outputs, runId, metadata } = await runStepInLive(live, upstreamId, intro);
          applyStepSuccess(live, upstreamId, outputs, runId, metadata);
        }
        if (pipelineCancelledRef.current) {
          updateNodeData(id, { status: "idle", error: "" });
          return;
        }
        await runTarget();
      }
      refreshOutputHistory?.();
    } catch (err) {
      if (err.name === "AbortError" || pipelineCancelledRef.current) {
        updateNodeData(id, { status: "idle", error: "" });
        return;
      }
      updateNodeData(id, {
        status: "error",
        error: err.message,
        ...clearNodeRunCachePatch()
      });
    } finally {
      setNodeRunning(false);
      runLockRef.current = false;
      queueMicrotask(() => drainRunQueueRef.current());
    }
    return true;
  }, [
    rhSettings,
    updateNodeData,
    runStepInLive,
    applyStepSuccess,
    refreshOutputHistory
  ]);

  const executeGraphRun = useCallback(async () => {
    if (runLockRef.current) return false;
    const live = nodesRef.current.map(node => ({ ...node, data: { ...node.data } }));
    const order = topoOrder(live, edgesRef.current);
    const hasRhSteps = live.some(node => node.type === "step" && (
      node.data.kind === STEP_KINDS.RH_APP || node.data.kind === STEP_KINDS.RH_WF
    ));
    if (hasRhSteps && !hasRhApiKey(rhSettings)) return false;
    pipelineCancelledRef.current = false;
    runLockRef.current = true;
    setGraphRunning(true);

    let pipelineIntroLogged = false;
    let pipelineSkipLogged = false;
    try {
      for (const id of order) {
        if (pipelineCancelledRef.current) break;
        const index = live.findIndex(node => node.id === id);
        if (index < 0 || live[index].type !== "step") continue;
        try {
          if (await isNodeRunCacheReady(live[index])) {
            if (!pipelineSkipLogged) {
              const runId = crypto.randomUUID();
              const provider = runLogProvider(live[index].data.kind);
              const job = buildCanvasRunJob(live[index], runId);
              const stepCount = order.filter(stepId => live.find(item => item.id === stepId)?.type === "step").length;
              runLogStartSession?.(job, { provider, status: "success" });
              runLogAppendLog?.(
                runId,
                "info",
                `Pipeline: ${stepCount} node theo thứ tự topo; bỏ qua node đã có cache output`,
                { provider }
              );
              runLogEndSession?.(runId, "success");
              pipelineSkipLogged = true;
              pipelineIntroLogged = true;
            }
            updateNodeData(id, { status: "done", error: "" });
            continue;
          }
          const pipelineIntro = !pipelineIntroLogged
            ? `Pipeline: ${order.filter(stepId => live.find(item => item.id === stepId)?.type === "step").length} node theo thứ tự topo`
            : "";
          pipelineIntroLogged = true;
          const { outputs, runId, metadata } = await runStepInLive(live, id, pipelineIntro);
          if (pipelineCancelledRef.current) break;
          applyStepSuccess(live, id, outputs, runId, metadata);
        } catch (err) {
          if (err.name === "AbortError" || pipelineCancelledRef.current) break;
          updateNodeData(id, {
            status: "error",
            error: err.message,
            ...clearNodeRunCachePatch()
          });
          syncLiveToRefs(live);
          refreshOutputHistory?.();
          return;
        }
      }
      if (!pipelineCancelledRef.current) {
        refreshOutputHistory?.();
      }
    } finally {
      setGraphRunning(false);
      runLockRef.current = false;
      if (pipelineCancelledRef.current) {
        resetRunningNodes();
      }
      queueMicrotask(() => drainRunQueueRef.current());
    }
    return true;
  }, [
    rhSettings,
    runStepInLive,
    applyStepSuccess,
    updateNodeData,
    runLogStartSession,
    runLogAppendLog,
    runLogEndSession,
    refreshOutputHistory,
    syncLiveToRefs,
    resetRunningNodes
  ]);

  executeNodeRunRef.current = executeNodeRun;
  executeGraphRunRef.current = executeGraphRun;

  const enqueueRun = useCallback((job) => {
    queueSequenceRef.current += 1;
    const queued = {
      ...job,
      runId: `canvas-q-${Date.now()}-${queueSequenceRef.current}`,
      queuedAt: new Date().toISOString()
    };
    const next = [...runQueueRef.current, queued];
    runQueueRef.current = next;
    setRunQueue(next);
  }, []);

  const drainRunQueue = useCallback(() => {
    if (runLockRef.current) return;
    const [job, ...remaining] = runQueueRef.current;
    if (!job) return;
    runQueueRef.current = remaining;
    setRunQueue(remaining);

    const execution = job.type === "node"
      ? executeNodeRunRef.current?.(job.nodeId)
      : executeGraphRunRef.current?.();
    Promise.resolve(execution).then(started => {
      if (started === false) queueMicrotask(() => drainRunQueueRef.current());
    });
  }, []);
  drainRunQueueRef.current = drainRunQueue;

  const runNode = useCallback((id) => {
    const node = nodesRef.current.find(item => item.id === id);
    if (!node || node.type !== "step") return;
    if (runLockRef.current) {
      enqueueRun({
        type: "node",
        nodeId: id,
        jobLabel: node.data?.name || id
      });
      return;
    }
    void executeNodeRunRef.current?.(id);
  }, [enqueueRun]);

  const runGraph = useCallback(() => {
    if (!nodesRef.current.some(node => node.type === "step")) return;
    if (runLockRef.current) {
      enqueueRun({ type: "graph", jobLabel: "Canvas pipeline" });
      return;
    }
    void executeGraphRunRef.current?.();
  }, [enqueueRun]);

  const queuedNodeCounts = useMemo(() => {
    const counts = {};
    for (const job of runQueue) {
      if (job.type !== "node" || !job.nodeId) continue;
      counts[job.nodeId] = (counts[job.nodeId] || 0) + 1;
    }
    return counts;
  }, [runQueue]);

  const outputMetadataByRunId = useMemo(() => Object.fromEntries(
    (outputHistory || [])
      .filter(item => item?.id)
      .map(item => [item.id, {
        durationMs: item.durationMs ?? item.result?.durationMs ?? null,
        rhCoins: item.rhCoins ?? item.result?.rhCoins ?? null,
        provider: item.provider || item.result?.provider || ""
      }])
  ), [outputHistory]);

  const connectedInputs = useCallback((id) => {
    const map = {};
    for (const edge of edgesRef.current) {
      if (edge.target !== id) continue;
      const handle = edge.targetHandle || "";
      const key = handle.startsWith("in:") ? handle.slice(3) : handle;
      if (key) map[key] = true;
    }
    return map;
  }, []);

  const isValidConnection = useCallback((connection) => {
    if (connection.source === connection.target) return false;
    const source = nodesRef.current.find(node => node.id === connection.source);
    const target = nodesRef.current.find(node => node.id === connection.target);
    const outType = portTypeFromHandle(source, connection.sourceHandle, "out");
    const inType = portTypeFromHandle(target, connection.targetHandle, "in");
    return arePortsCompatible(outType, inType);
  }, []);

  const actions = useMemo(() => ({
    updateNodeValues,
    updateNodeSize,
    runNode,
    removeNode,
    removeEdge,
    disconnectTargetPort,
    toggleNodeBypass,
    convertInputToSource,
    openContextMenu,
    closeContextMenu,
    connectedInputs,
    graphRunning: canvasRunning,
    queuedNodeCounts,
    outputMetadataByRunId,
    nodes,
    edges,
    inputImages: inputImages || [],
    refreshInputImages: refreshInputImages || (async () => {}),
    updateInputImages: updateInputImages || (() => {})
  }), [
    updateNodeValues, updateNodeSize, runNode, removeNode, removeEdge,
    disconnectTargetPort, toggleNodeBypass, convertInputToSource,
    openContextMenu, closeContextMenu, connectedInputs, canvasRunning, queuedNodeCounts,
    outputMetadataByRunId, nodes, edges,
    inputImages, refreshInputImages, updateInputImages
  ]);

  const flyoutTitle = activePanel ? CANVAS_PANELS[activePanel]?.label : "";

  return (
    <div className="canvasView">
      <div className="canvasStage">
        <div className="canvasWorkspace">
          <div className="canvasToolbar">
            <RunControls
              running={canvasRunning}
              canRun={nodes.some(node => node.type === "step")}
              canCancel={Boolean(canvasRunning || runQueue.length)}
              queueCount={runQueue.length}
              onRun={runGraph}
              onCancel={cancelCanvasRun}
              runLabel="Run"
              compact
            />
          </div>

          <CanvasDock
            activePanel={activePanel}
            onSelect={setActivePanel}
            nodeCount={nodes.length}
          />

          {activePanel ? (
            <CanvasFlyoutPanel title={flyoutTitle} onClose={() => setActivePanel(null)}>
              {activePanel === "projects" ? (
                <CanvasProjectPanel
                  projects={projects}
                  activeId={activeId}
                  activeName={activeName}
                  onSwitch={switchProject}
                  onCreate={createProject}
                  onRename={renameProject}
                  onDelete={deleteProject}
                />
              ) : null}
              {activePanel === "library" ? (
                <StepPalette
                  library={library}
                  loading={loading}
                  error={error}
                  onReload={reload}
                  onAddStep={handleAddStep}
                  onAddSource={handleAddSource}
                  addingRef={addingRef}
                />
              ) : null}
              {activePanel === "nodes" ? (
                <CanvasNodesPanel
                  nodes={nodes}
                  onRunNode={runNode}
                  onRemoveNode={removeNode}
                />
              ) : null}
              {activePanel === "history" ? (
                <CanvasHistoryPanel
                  outputHistory={outputHistory || []}
                  onRefreshOutputHistory={refreshOutputHistory}
                  runLogSessions={runLogSessions || []}
                  onRefreshRunLogs={refreshRunLogSessions}
                  onOpenRunLog={() => {
                    setMinimapOpen(false);
                    setRunLogOpen?.(true);
                  }}
                />
              ) : null}
            </CanvasFlyoutPanel>
          ) : null}

          <CanvasActionsContext.Provider value={actions}>
            <ReactFlow
              className={`canvasTool-${activeCanvasTool}`}
              nodes={nodes}
              edges={edges.map(edge => ({ ...edge, type: "default", animated: false }))}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={(oldEdge, newConnection) => {
                setEdges(current => reconnectEdge(oldEdge, newConnection, current));
              }}
              onEdgeContextMenu={(event, edge) => {
                openContextMenu(event, buildEdgeContextMenuItems({ edge, removeEdge }));
              }}
              onEdgeDoubleClick={(event, edge) => {
                event.preventDefault();
                event.stopPropagation();
                removeEdge(edge.id);
              }}
              onPaneClick={closeContextMenu}
              isValidConnection={isValidConnection}
              fitView
              minZoom={0.1}
              maxZoom={10}
              connectionRadius={24}
              panOnDrag
              selectionOnDrag={false}
              selectionKeyCode={activeCanvasTool === "select" ? "Shift" : null}
              nodesDraggable={activeCanvasTool === "select"}
              nodesConnectable={activeCanvasTool === "select"}
              elementsSelectable={activeCanvasTool === "select"}
              edgesReconnectable
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{
                type: "default",
                animated: false,
                deletable: true,
                selectable: true,
                focusable: true,
                reconnectable: true,
                style: { strokeWidth: 1.5 }
              }}
              connectionLineStyle={{ strokeWidth: 1.5 }}
              noDragClassName="nodrag"
              noWheelClassName="nowheel"
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background gap={18} size={1} />
              <CanvasFlowPanel
                minimapOpen={minimapOpen}
                onToggleMinimap={toggleMinimap}
                logOpen={runLogOpen}
                onToggleLog={toggleLog}
                logHasActivity={logHasActivity}
                logBadgeCount={logBadgeCount}
                minZoom={0.1}
                maxZoom={10}
                selectedTool={canvasTool}
                activeTool={activeCanvasTool}
                onToolChange={setCanvasTool}
                spaceHeld={spaceHeld}
              />
            </ReactFlow>
          </CanvasActionsContext.Provider>
        </div>

        <Suspense fallback={null}>
          <RunLogPanel
            open={runLogOpen}
            onToggle={toggleLog}
            hideToggleButton
            sessions={runLogSessions || []}
            outputHistory={outputHistory || []}
            onDeleteSession={deleteRunLogSession}
            onClearHistory={runLogClearHistory}
            onRestoreOutput={restoreHistory}
            rhApiKey={logRhApiKey || rhApiKey || ""}
            onRhTaskInspected={(session, detail) => {
              if (!session?.runId || !detail) return;
              updateRunLogSession?.(session.runId, {
                taskId: detail.taskId || session.taskId,
                rhCoins: detail.rhCoins ?? session.rhCoins
              });
            }}
            runQueue={runQueue}
            activeRunId={activeRunId}
            status=""
            running={canvasRunning}
          />
        </Suspense>
        <CanvasContextMenu menu={contextMenu} onClose={closeContextMenu} />
      </div>
    </div>
  );
}

export function InfiniteCanvas(props) {
  return (
    <ReactFlowProvider>
      <InfiniteCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
