import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./canvas.css";
import { StepNode } from "./nodes/StepNode.jsx";
import { SourceNode } from "./nodes/SourceNode.jsx";
import { StepPalette } from "./StepPalette.jsx";
import { CanvasActionsContext, CanvasGraphContext } from "./canvasContext.js";
import { useCanvasProject } from "./useCanvasProject.js";
import { loadStepDefinition, useStepLibrary } from "./useStepLibrary.js";
import { runCanvasNode, bypassCanvasNode, prepareCanvasNodeRunRequest } from "./canvasRunner.js";
import { buildCanvasNodeDefaults, arePortsCompatible, STEP_KINDS, topoOrder, upstreamStepsNeedingRunAsync, upstreamStepsWithStaleFilesAsync, linkedImageInputsMissingSource, beginNodeExecutionPatch, getNodeRunCache, nodeRunCachePatch } from "./canvasModel.js";
import { buildDefaults, flattenInputs } from "../../lib/template.js";
import { getPrimaryRhApiKey, hasRhApiKey } from "../../lib/rhTokenPool.js";
import { normalizeCanvasViewport } from "./canvasViewport.js";
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
  buildEdgeContextMenuItems
} from "./canvasMenuHelpers.js";
import { readCanvasDragPayload, shouldAcceptCanvasDrop, isCanvasDragEvent } from "./canvasDrag.js";
import {
  ACTIVE_RUN_LOG_STATUSES,
  countCanvasQueuedJobs,
  countCanvasRunActivity,
  findCanvasQueuedSessions,
  findStaleRunLogSessions,
  cancelServerRun,
  historyItemToOutputs,
  outputHistoryByCanvasNodeId,
  outputHistoryByRunId
} from "./canvasRuntimeSync.js";
import { useCanvasRunSync } from "./useCanvasRunSync.js";
import {
  createCanvasRunJob,
  snapshotRhApiKeyReady
} from "./canvasRunSnapshot.js";
import { expandCanvasRunJobImageBatches } from "./canvasBatchImages.js";

const nodeTypes = { step: StepNode, source: SourceNode };
const EMPTY_INPUT_IMAGES = [];
const NOOP = () => {};
const NOOP_ASYNC = async () => {};

function portTypeFromHandle(node, handle, direction) {
  if (!node || !handle) return null;
  if (node.type === "source") {
    if (direction === "in") {
      if (handle === "in:main" && node.data?.passthroughFromOutput) {
        return node.data?.sourceType || node.data?.port?.type || "image";
      }
      return null;
    }
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

function runLogProviderForSnapshot(snapshot) {
  const step = (snapshot?.nodes || []).find(node => node.type === "step" && !node.data?.bypassed);
  return runLogProvider(step?.data?.kind);
}

function canvasHistoryContextForJob(job, node) {
  return {
    canvasRunGroupId: job.groupId || job.runId,
    canvasProjectId: job.canvasProjectId || "",
    canvasNodeId: node?.id || "",
    canvasNodeName: node?.data?.name || node?.id || "",
    canvasGroupLabel: job.canvasGroupLabel || "Canvas run",
    canvasBatchIndex: job.snapshot?.batch?.index,
    canvasBatchTotal: job.snapshot?.batch?.total
  };
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
  logRhApiKey,
  onRuntimeStateChange
}) {
  const { library, loading, error, reload } = useStepLibrary();
  const {
    nodes, edges,
    projects, activeId, activeName, viewport,
    canUndo, canRedo,
    onNodesChange, onEdgesChange, onConnect, setEdges,
    addNode, updateNodeData, updateNodeSize, commitNodeResize, removeNode, removeEdge,
    disconnectTargetPort, toggleNodeBypass, convertInputToSource, convertOutputToSource,
    switchProject, createProject, renameProject, deleteProject,
    undoCanvas, redoCanvas, reportViewport
  } = useCanvasProject();

  const [activePanel, setActivePanel] = useState(null);
  const [addingRef, setAddingRef] = useState("");
  const [graphRunning, setGraphRunning] = useState(false);
  const [nodeRunning, setNodeRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [runQueue, setRunQueue] = useState([]);
  const [minimapOpen, setMinimapOpen] = useState(() => getSetting("canvas.minimapOpen", false));
  const [canvasTool, setCanvasTool] = useState(() => getSetting("canvas.tool", "select") === "hand" ? "hand" : "select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [paletteDropActive, setPaletteDropActive] = useState(false);
  const [canvasInteracting, setCanvasInteracting] = useState(false);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const reactFlowRef = useRef(null);
  const canvasWorkspaceRef = useRef(null);
  const suppressViewportReportRef = useRef(false);
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
  const reconciledStaleRunIdsRef = useRef(new Set());
  const runLogSessionsRef = useRef(runLogSessions);
  const canvasRunning = graphRunning || nodeRunning;
  const logHasActivity = canvasRunning
    || runQueue.length > 0
    || (runLogSessions?.some(session => ACTIVE_RUN_LOG_STATUSES.has(session.status)) ?? false);
  const hasStaleRunningSessions = useMemo(
    () => findStaleRunLogSessions(runLogSessions).some(session => session.status === "running"),
    [runLogSessions]
  );
  const canvasQueueCount = useMemo(() => countCanvasQueuedJobs({
    queuedJobs: runQueue,
    sessions: runLogSessions || [],
    projectId: activeId
  }), [activeId, runLogSessions, runQueue]);
  const logBadgeCount = useMemo(() => countCanvasRunActivity({
    canvasRunning,
    activeRunId,
    queuedJobs: runQueue,
    sessions: runLogSessions || [],
    projectId: activeId
  }), [activeId, activeRunId, canvasRunning, runLogSessions, runQueue]);

  useEffect(() => {
    const runningStep = nodes.find(node => node.type === "step" && node.data?.status === "running");
    const stepNodes = nodes.filter(node => node.type === "step");
    onRuntimeStateChange?.({
      running: canvasRunning,
      queueCount: canvasQueueCount,
      activeKind: runningStep?.data?.kind ?? null,
      activeLabel: runningStep?.data?.name ?? null,
      hasRhNodes: stepNodes.some(node => (
        node.data?.kind === STEP_KINDS.RH_APP || node.data?.kind === STEP_KINDS.RH_WF
      )),
      hasLocalNodes: stepNodes.some(node => node.data?.kind === STEP_KINDS.LOCAL)
    });
  }, [canvasRunning, canvasQueueCount, nodes, onRuntimeStateChange]);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { runLogSessionsRef.current = runLogSessions || []; }, [runLogSessions]);

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

  const applyStoredViewport = useCallback((instance, nextViewport) => {
    const normalized = normalizeCanvasViewport(nextViewport);
    if (!instance || !normalized) return;
    suppressViewportReportRef.current = true;
    instance.setViewport(normalized, { duration: 0 });
    window.requestAnimationFrame(() => {
      suppressViewportReportRef.current = false;
    });
  }, []);

  useEffect(() => {
    applyStoredViewport(reactFlowRef.current, viewport);
  }, [activeId, applyStoredViewport, viewport]);

  const beginViewportGesture = useCallback(() => {
    suppressViewportReportRef.current = true;
  }, []);

  const endViewportGesture = useCallback((nextViewport) => {
    suppressViewportReportRef.current = false;
    if (nextViewport) reportViewport(nextViewport);
  }, [reportViewport]);

  useEffect(() => {
    function handleUndoRedo(event) {
      const isUndoKey = event.key?.toLowerCase() === "z";
      const isRedoKey = event.key?.toLowerCase() === "y";
      if ((!isUndoKey && !isRedoKey) || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[role='dialog'], .imageEditorModal, .inputLibraryModal, .imageLightbox, .maskEditorModal, .canvasContextMenu")) {
        return;
      }
      const redo = isRedoKey || (isUndoKey && event.shiftKey);
      const handled = redo ? redoCanvas() : undoCanvas();
      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleUndoRedo, true);
    return () => window.removeEventListener("keydown", handleUndoRedo, true);
  }, [redoCanvas, undoCanvas]);

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

  useEffect(() => {
    if (!runLogOpen) return;
    refreshRunLogSessions?.();
  }, [runLogOpen, refreshRunLogSessions]);

  const rhApiKey = useMemo(() => getPrimaryRhApiKey(rhSettings), [rhSettings]);

  const makeRunLogger = useCallback((runId, provider) => (level, message) => {
    runLogAppendLog?.(runId, level, message, { provider });
  }, [runLogAppendLog]);

  const nextPosition = useCallback(() => {
    const count = nodesRef.current.length;
    return { x: 120 + (count % 4) * 60, y: 80 + count * 40 };
  }, []);

  const handleAddStep = useCallback(async (item, position) => {
    setAddingRef(item.ref);
    try {
      const def = await loadStepDefinition({ kind: item.kind, ref: item.ref, apiKey: rhApiKey });
      const values = def.kind === STEP_KINDS.RH_APP
        ? buildCanvasNodeDefaults(def.nodes || [])
        : buildDefaults(flattenInputs(def.config?.input || {}));
      addNode({
        id: `n_${crypto.randomUUID().slice(0, 8)}`,
        type: "step",
        position: position || nextPosition(),
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

  const handleAddSource = useCallback((sourceType, position) => {
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
      position: position || nextPosition(),
      data: {
        sourceType: definition.sourceType,
        name: definition.name,
        port: definition.port,
        values: { main: definition.value },
        status: "idle"
      }
    });
  }, [addNode, nextPosition]);

  const resolveDropPosition = useCallback((event) => {
    const instance = reactFlowRef.current;
    if (!instance?.screenToFlowPosition) return nextPosition();
    return instance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    });
  }, [nextPosition]);

  const handleCanvasDragOver = useCallback((event) => {
    if (!shouldAcceptCanvasDrop(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setPaletteDropActive(true);
  }, []);

  const handleCanvasDrop = useCallback((event) => {
    if (!shouldAcceptCanvasDrop(event)) return;
    const payload = readCanvasDragPayload(event.dataTransfer);
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    setPaletteDropActive(false);
    const position = resolveDropPosition(event);
    if (payload.type === "step") {
      void handleAddStep({
        kind: payload.kind,
        ref: payload.ref,
        name: payload.name
      }, position);
      return;
    }
    if (payload.type === "source") {
      handleAddSource(payload.sourceType, position);
    }
  }, [handleAddSource, handleAddStep, resolveDropPosition]);

  useEffect(() => {
    const root = canvasWorkspaceRef.current;
    if (!root) return undefined;

    function handleDragEnter(event) {
      if (!isCanvasDragEvent(event)) return;
      if (event.target instanceof Element && event.target.closest(".canvasFlyout, .canvasDock, .canvasFlowPanel")) {
        return;
      }
      setPaletteDropActive(true);
    }

    function handleDragLeave(event) {
      if (root.contains(event.relatedTarget)) return;
      setPaletteDropActive(false);
    }

    root.addEventListener("dragenter", handleDragEnter);
    root.addEventListener("dragover", handleCanvasDragOver);
    root.addEventListener("dragleave", handleDragLeave);
    root.addEventListener("drop", handleCanvasDrop);
    return () => {
      root.removeEventListener("dragenter", handleDragEnter);
      root.removeEventListener("dragover", handleCanvasDragOver);
      root.removeEventListener("dragleave", handleDragLeave);
      root.removeEventListener("drop", handleCanvasDrop);
    };
  }, [handleCanvasDragOver, handleCanvasDrop]);

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
    updateNodeData(id, prev => ({ values: { ...(prev.values || {}), ...patch } }), { history: true });
  }, [updateNodeData]);

  const resetRunningNodes = useCallback(() => {
    for (const node of nodesRef.current) {
      if (node.type === "step" && node.data?.status === "running") {
        updateNodeData(node.id, { status: "idle", error: "" });
      }
    }
  }, [updateNodeData]);

  const isLocalCanvasRun = useCallback((runId) => (
    Boolean(runId)
    && activeRunIdRef.current === runId
    && Boolean(abortControllerRef.current)
  ), []);

  useCanvasRunSync({
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
    isLocalRun: isLocalCanvasRun,
    isQueuedLocally: (runId) => runQueueRef.current.some(job => job.runId === runId)
  });

  const executeNode = useCallback(async (node, contextNodes, {
    pipelineIntro = "",
    runKind = "canvas-node",
    edges: runEdges,
    rhAuth: runRhAuth,
    historyContext
  } = {}) => {
    const runId = crypto.randomUUID();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    activeRunIdRef.current = runId;
    activeRunKindRef.current = node.data.kind;
    const provider = runLogProvider(node.data.kind);
    const job = buildCanvasRunJob(node, runId);
    setActiveRunId(runId);
    runLogStartSession?.(job, {
      provider,
      status: "running",
      canvasNodeId: node.id,
      canvasProjectId: activeId,
      runKind
    });
    const log = makeRunLogger(runId, provider);
    if (pipelineIntro) log("info", pipelineIntro);
    try {
      const runner = node.data?.bypassed ? bypassCanvasNode : runCanvasNode;
      const { outputs, raw } = await runner({
        node,
        nodes: contextNodes,
        edges: runEdges,
        rhAuth: runRhAuth,
        runId,
        signal: abortController.signal,
        onLog: log,
        historyContext
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
    }
  }, [activeId, makeRunLogger, runLogStartSession, runLogEndSession]);

  const cancelCanvasRun = useCallback(async () => {
    pipelineCancelledRef.current = true;
    abortControllerRef.current?.abort();
    runLockRef.current = false;

    const runId = activeRunIdRef.current;
    const kind = activeRunKindRef.current;
    if (runId) {
      await cancelServerRun({
        runId,
        provider: kind === STEP_KINDS.LOCAL ? "local" : "runninghub"
      });
    }

    const skipRunIds = new Set(runId ? [runId] : []);
    const stale = findStaleRunLogSessions(runLogSessionsRef.current, skipRunIds)
      .filter(session => session.status === "running");
    for (const session of stale) {
      reconciledStaleRunIdsRef.current.add(session.runId);
      await cancelServerRun(session);
      runLogEndSession?.(session.runId, "cancelled", { error: "interrupted_by_reload" });
    }

    setGraphRunning(false);
    setNodeRunning(false);
    resetRunningNodes();
    refreshRunLogSessions?.();
  }, [resetRunningNodes, refreshRunLogSessions, runLogEndSession]);

  const clearCanvasQueue = useCallback(async () => {
    runQueueRef.current = [];
    setRunQueue([]);

    for (const session of findCanvasQueuedSessions(runLogSessionsRef.current, { projectId: activeId })) {
      runLogEndSession?.(session.runId, "cancelled", { error: "queue_cleared" });
    }

    try {
      await fetch("/api/run-queue/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runKindPrefix: "canvas" })
      });
    } catch {}

    await refreshRunLogSessions?.();
  }, [activeId, refreshRunLogSessions, runLogEndSession]);

  const stopAllCanvasRuns = useCallback(async () => {
    await clearCanvasQueue();
    await cancelCanvasRun();
  }, [cancelCanvasRun, clearCanvasQueue]);

  const applyStepSuccess = useCallback((live, stepId, outputs, runId = "", metadata = {}) => {
    const index = live.findIndex(item => item.id === stepId);
    if (index < 0) return;
    const patch = nodeRunCachePatch(outputs, runId, metadata);
    live[index] = { ...live[index], data: { ...live[index].data, ...patch } };
    updateNodeData(stepId, patch);
    syncLiveToRefs(live);
  }, [updateNodeData, syncLiveToRefs]);

  const runStepInLive = useCallback(async (
    live,
    stepId,
    runEdges,
    runRhAuth,
    pipelineIntro = "",
    runKind = "canvas-node",
    historyContext = null
  ) => {
    const index = live.findIndex(item => item.id === stepId);
    if (index < 0) throw new Error("Node not found");
    const startPatch = beginNodeExecutionPatch();
    live[index] = { ...live[index], data: { ...live[index].data, ...startPatch } };
    updateNodeData(stepId, startPatch);
    syncLiveToRefs(live);
    const { outputs, runId, metadata } = await executeNode(live[index], live, {
      pipelineIntro,
      runKind,
      edges: runEdges,
      rhAuth: runRhAuth,
      historyContext
    });
    return { outputs, runId, metadata };
  }, [executeNode, updateNodeData, syncLiveToRefs]);

  const executeNodeRun = useCallback(async (job) => {
    const { nodeId: id, snapshot } = job;
    const runEdges = snapshot.edges;
    const runRhAuth = snapshot.rhAuth;
    const snapRhSettings = snapshot.rhSettings;

    setNodeRunning(true);
    pipelineCancelledRef.current = false;
    try {
      const live = snapshot.nodes.map(item => ({ ...item, data: { ...item.data } }));
      const node = live.find(item => item.id === id);
      if (!node || node.type !== "step") return false;

      const missingSources = linkedImageInputsMissingSource(node, live, runEdges);
      const blocked = missingSources.find(item => !item.canAutoRun);
      if (blocked) {
        const sourceName = blocked.source.data?.name || blocked.source.id;
        updateNodeData(id, {
          status: "error",
          error: `Input ảnh "${blocked.port.label}" thiếu ảnh từ "${sourceName}" — thêm ảnh vào node nguồn trước`
        });
        return true;
      }

      const upstreamIds = await upstreamStepsNeedingRunAsync(id, live, runEdges);
      const stepsToRun = [...upstreamIds, id];
      const needsRhAny = stepsToRun.some(stepId => {
        const step = live.find(item => item.id === stepId);
        return step && !step.data.bypassed && (
          step.data.kind === STEP_KINDS.RH_APP || step.data.kind === STEP_KINDS.RH_WF
        );
      });
      if (needsRhAny && !hasRhApiKey(snapRhSettings)) {
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
          const { outputs, runId, metadata } = await runStepInLive(
            live,
            upstreamId,
            runEdges,
            runRhAuth,
            intro,
            "canvas-node",
            canvasHistoryContextForJob(job, upstream)
          );
          applyStepSuccess(live, upstreamId, outputs, runId, metadata);
          refreshOutputHistory?.();
        } catch (err) {
          if (err.name === "AbortError" || pipelineCancelledRef.current) {
            updateNodeData(upstreamId, { status: "idle", error: "" });
            updateNodeData(id, { status: "idle", error: "" });
            return;
          }
          updateNodeData(upstreamId, {
            status: "error",
            error: err.message
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
        runEdges
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
        const targetNode = live.find(item => item.id === id);
        const { outputs, runId, metadata } = await runStepInLive(
          live,
          id,
          runEdges,
          runRhAuth,
          "",
          "canvas-node",
          canvasHistoryContextForJob(job, targetNode)
        );
        applyStepSuccess(live, id, outputs, runId, metadata);
        refreshOutputHistory?.();
      };

      try {
        await runTarget();
      } catch (err) {
        if (!err.message?.includes("file không tồn tại")) throw err;
        const staleIds = await upstreamStepsWithStaleFilesAsync(id, live, runEdges);
        if (!staleIds.length) throw err;
        for (const upstreamId of staleIds) {
          if (pipelineCancelledRef.current) break;
          const upstream = live.find(item => item.id === upstreamId);
          const intro = upstream
            ? `Tự chạy lại node upstream (file output đã mất): ${upstream.data?.name || upstreamId}`
            : "";
          const { outputs, runId, metadata } = await runStepInLive(
            live,
            upstreamId,
            runEdges,
            runRhAuth,
            intro,
            "canvas-node",
            canvasHistoryContextForJob(job, upstream)
          );
          applyStepSuccess(live, upstreamId, outputs, runId, metadata);
          refreshOutputHistory?.();
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
        error: err.message
      });
    } finally {
      setNodeRunning(false);
      runLockRef.current = false;
      queueMicrotask(() => drainRunQueueRef.current());
    }
    return true;
  }, [
    updateNodeData,
    runStepInLive,
    applyStepSuccess,
    refreshOutputHistory
  ]);

  const executeGraphRun = useCallback(async (job) => {
    const { snapshot } = job;
    const runEdges = snapshot.edges;
    const runRhAuth = snapshot.rhAuth;
    const live = snapshot.nodes.map(node => ({ ...node, data: { ...node.data } }));
    const order = topoOrder(live, runEdges);
    pipelineCancelledRef.current = false;
    setGraphRunning(true);

    let pipelineIntroLogged = false;
    try {
      for (const id of order) {
        if (pipelineCancelledRef.current) break;
        const index = live.findIndex(node => node.id === id);
        if (index < 0 || live[index].type !== "step") continue;
        try {
          const pipelineIntro = !pipelineIntroLogged
            ? `Pipeline: ${order.filter(stepId => live.find(item => item.id === stepId)?.type === "step").length} node theo thứ tự topo`
            : "";
          pipelineIntroLogged = true;
          const { outputs, runId, metadata } = await runStepInLive(
            live,
            id,
            runEdges,
            runRhAuth,
            pipelineIntro,
            "canvas-graph",
            canvasHistoryContextForJob(job, live[index])
          );
          if (pipelineCancelledRef.current) break;
          applyStepSuccess(live, id, outputs, runId, metadata);
          refreshOutputHistory?.();
        } catch (err) {
          if (err.name === "AbortError" || pipelineCancelledRef.current) break;
          updateNodeData(id, {
            status: "error",
            error: err.message
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
    runStepInLive,
    applyStepSuccess,
    updateNodeData,
    refreshOutputHistory,
    syncLiveToRefs,
    resetRunningNodes
  ]);

  executeNodeRunRef.current = executeNodeRun;
  executeGraphRunRef.current = executeGraphRun;

  const buildRunJob = useCallback((partial) => {
    queueSequenceRef.current += 1;
    return createCanvasRunJob({
      nodes: nodesRef.current,
      edges: edgesRef.current,
      rhSettings,
      sequence: queueSequenceRef.current,
      canvasProjectId: activeId,
      canvasGroupLabel: `Canvas · ${activeName || "Project"}`,
      ...partial
    });
  }, [activeId, activeName, rhSettings]);

  const buildBackendQueueJob = useCallback(async (job) => {
    const { nodeId: id, snapshot } = job;
    const live = snapshot.nodes.map(item => ({ ...item, data: { ...item.data } }));
    const node = live.find(item => item.id === id);
    if (!node || node.type !== "step") return null;
    if (node.data?.bypassed) {
      throw new Error("Node bypass không thể gửi vào backend queue");
    }
    const request = await prepareCanvasNodeRunRequest({
      node,
      nodes: live,
      edges: snapshot.edges,
      rhAuth: snapshot.rhAuth,
      runId: job.runId,
      onLog: null,
      historyContext: canvasHistoryContextForJob(job, node)
    });
    return {
      endpoint: request.endpoint,
      body: request.body,
      meta: {
        provider: request.provider,
        canvasNodeId: id,
        canvasProjectId: activeId,
        runKind: "canvas-node",
        waitForRunId: activeRunIdRef.current || (
          (runLogSessionsRef.current || []).find(session => (
            session.status === "running"
            && String(session.runKind || "").startsWith("canvas")
          ))?.runId || ""
        )
      }
    };
  }, [activeId]);

  const hasBackendCanvasActivity = useCallback(() => (
    Boolean(activeRunIdRef.current)
    || (runLogSessionsRef.current || []).some(session => (
      (session.status === "running" || session.status === "queued")
      && String(session.runKind || "").startsWith("canvas")
    ))
  ), []);

  const graphJobAsSingleNodeJob = useCallback((job) => {
    const stepNodes = job.snapshot.nodes.filter(node => node.type === "step");
    if (stepNodes.length !== 1) return null;
    return {
      ...job,
      type: "node",
      nodeId: stepNodes[0].id,
      jobLabel: stepNodes[0].data?.name || job.jobLabel || stepNodes[0].id
    };
  }, []);

  const submitBackendQueueJobs = useCallback(async (queueJobs) => {
    if (!queueJobs.length) return;
    const response = await fetch("/api/run-queue/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobs: queueJobs })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Không gửi được hàng chờ backend");
    refreshRunLogSessions?.();
  }, [refreshRunLogSessions]);

  const enqueueRunJobs = useCallback((jobs) => {
    if (!jobs.length) return;
    const next = [...runQueueRef.current, ...jobs];
    runQueueRef.current = next;
    setRunQueue(next);
    for (const job of jobs) {
      runLogStartSession?.({
        runId: job.runId,
        template: "",
        templateId: "",
        webappId: "",
        jobLabel: job.jobLabel || "Canvas queued graph"
      }, {
        provider: runLogProviderForSnapshot(job.snapshot),
        status: "queued",
        canvasProjectId: activeId,
        runKind: job.type === "graph" ? "canvas-graph" : "canvas-node"
      });
    }
    refreshRunLogSessions?.();
  }, [activeId, refreshRunLogSessions, runLogStartSession]);

  const startOrQueueRunJobs = useCallback((jobs) => {
    const runnable = jobs.filter(job => snapshotRhApiKeyReady(job.snapshot));
    if (!runnable.length) return;
    if (runLockRef.current || runQueueRef.current.length > 0) {
      enqueueRunJobs(runnable);
      return;
    }
    const [first, ...queued] = runnable;
    if (queued.length) enqueueRunJobs(queued);
    runLockRef.current = true;
    if (first.type === "node") {
      void executeNodeRunRef.current?.(first);
    } else {
      void executeGraphRunRef.current?.(first);
    }
  }, [enqueueRunJobs]);

  const drainRunQueue = useCallback(() => {
    if (pipelineCancelledRef.current) return;
    if (runLockRef.current) return;
    const [job, ...remaining] = runQueueRef.current;
    if (!job) return;

    if (!snapshotRhApiKeyReady(job.snapshot)) {
      runQueueRef.current = remaining;
      setRunQueue(remaining);
      queueMicrotask(() => drainRunQueueRef.current());
      return;
    }

    runLockRef.current = true;
    runQueueRef.current = remaining;
    setRunQueue(remaining);

    if (job.type === "node") {
      void executeNodeRunRef.current?.(job);
    } else {
      void executeGraphRunRef.current?.(job);
    }
  }, []);
  drainRunQueueRef.current = drainRunQueue;

  const runNode = useCallback(async (id) => {
    const node = nodesRef.current.find(item => item.id === id);
    if (!node || node.type !== "step") return;
    const job = buildRunJob({
      type: "node",
      nodeId: id,
      jobLabel: node.data?.name || id
    });
    try {
      const jobs = await expandCanvasRunJobImageBatches(job, { rootNodeId: id });
      const queueJobs = (await Promise.all(jobs.map(buildBackendQueueJob))).filter(Boolean);
      await submitBackendQueueJobs(queueJobs);
    } catch (err) {
      updateNodeData(id, { status: "error", error: err.message || "Không tạo được hàng chờ ảnh" });
    }
  }, [buildBackendQueueJob, buildRunJob, submitBackendQueueJobs, updateNodeData]);

  const runGraph = useCallback(async () => {
    if (!nodesRef.current.some(node => node.type === "step")) return;
    const job = buildRunJob({ type: "graph", jobLabel: "Canvas pipeline" });
    try {
      const jobs = await expandCanvasRunJobImageBatches(job);
      const nodeJobs = jobs.map(graphJobAsSingleNodeJob);
      if (nodeJobs.every(Boolean)) {
        const queueJobs = (await Promise.all(nodeJobs.map(buildBackendQueueJob))).filter(Boolean);
        await submitBackendQueueJobs(queueJobs);
        return;
      }
      if (hasBackendCanvasActivity()) {
        enqueueRunJobs(jobs);
        return;
      }
      startOrQueueRunJobs(jobs);
    } catch (err) {
      const firstStep = nodesRef.current.find(node => node.type === "step");
      if (firstStep) {
        updateNodeData(firstStep.id, { status: "error", error: err.message || "Không tạo được hàng chờ ảnh" });
      }
    }
  }, [
    buildBackendQueueJob,
    buildRunJob,
    enqueueRunJobs,
    graphJobAsSingleNodeJob,
    hasBackendCanvasActivity,
    startOrQueueRunJobs,
    submitBackendQueueJobs,
    updateNodeData
  ]);

  useEffect(() => {
    function handleRunShortcut(event) {
      if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.repeat || isTypingTarget(event.target)) return;
      if (event.target instanceof Element && event.target.closest(
        "[role='dialog'], .imageEditorModal, .inputLibraryModal, .imageLightbox, .maskEditorModal, .canvasContextMenu"
      )) return;

      const selectedStep = nodesRef.current.find(node => node.type === "step" && node.selected);
      const hasStep = nodesRef.current.some(node => node.type === "step");
      if (!selectedStep && !hasStep) return;

      event.preventDefault();
      event.stopPropagation();
      if (selectedStep) {
        runNode(selectedStep.id);
      } else {
        runGraph();
      }
    }

    window.addEventListener("keydown", handleRunShortcut, true);
    return () => window.removeEventListener("keydown", handleRunShortcut, true);
  }, [runGraph, runNode]);

  const queuedNodeCounts = useMemo(() => {
    const counts = {};
    for (const job of runQueue) {
      if (job.type !== "node" || !job.nodeId) continue;
      counts[job.nodeId] = (counts[job.nodeId] || 0) + 1;
    }
    return counts;
  }, [runQueue]);

  const outputMetadataByRunId = useMemo(() => Object.fromEntries(
    [...outputHistoryByRunId(outputHistory || [])]
      .map(([runId, item]) => [runId, {
        durationMs: item.durationMs ?? item.result?.durationMs ?? null,
        rhCoins: item.rhCoins ?? item.result?.rhCoins ?? null,
        provider: item.provider || item.result?.provider || ""
      }])
  ), [outputHistory]);

  const latestOutputByNodeId = useMemo(
    () => outputHistoryByCanvasNodeId(outputHistory || [], activeId),
    [activeId, outputHistory]
  );

  // The server writes each node result before the remaining graph finishes.
  // Reconcile those completed child runs immediately so previews do not wait
  // for the entire graph run (and can also recover after a client-side race).
  useEffect(() => {
    for (const [nodeId, historyItem] of latestOutputByNodeId) {
      const node = nodesRef.current.find(item => item.id === nodeId);
      if (!node || node.type !== "step") continue;

      const currentCache = getNodeRunCache(node);
      if (currentCache?.runId === historyItem.id) continue;

      const completedAt = historyItem?.completedAt
        ? new Date(historyItem.completedAt).getTime()
        : 0;
      if (currentCache?.runAt && completedAt && currentCache.runAt > completedAt) continue;

      const outputs = historyItemToOutputs(historyItem);
      if (!outputs.length) continue;
      const patch = nodeRunCachePatch(outputs, historyItem.id, {
        durationMs: historyItem.durationMs ?? historyItem.result?.durationMs ?? null,
        rhCoins: historyItem.rhCoins ?? historyItem.result?.rhCoins ?? null,
        provider: historyItem.provider || historyItem.result?.provider || ""
      });

      // A previous history result may be restored while this same node is
      // running again. Keep the active state until the new run is complete.
      if (node.data?.status === "running") patch.status = "running";
      updateNodeData(nodeId, patch);
    }
  }, [latestOutputByNodeId, updateNodeData]);

  // React Flow creates a new node object on every drag frame. Keep the graph
  // context identity stable while only positions/selection change so memoized
  // custom nodes that are not being dragged do not render again.
  const graphContextRef = useRef({ nodes, edges, nodeData: new Map() });
  const previousGraph = graphContextRef.current;
  const graphDataChanged = previousGraph.edges !== edges
    || previousGraph.nodes.length !== nodes.length
    || nodes.some(node => previousGraph.nodeData.get(node.id) !== node.data);
  if (graphDataChanged) {
    graphContextRef.current = {
      nodes,
      edges,
      nodeData: new Map(nodes.map(node => [node.id, node.data]))
    };
  } else {
    // Consumers that render for their own React Flow prop change still read
    // the latest positions without broadcasting a context update to all nodes.
    previousGraph.nodes = nodes;
  }
  const graphContextValue = graphContextRef.current;

  const renderedEdges = useMemo(() => edges.map(edge => (
    edge.type === "default" && edge.animated === false
      ? edge
      : { ...edge, type: "default", animated: false }
  )), [edges]);

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
    commitNodeResize,
    runNode,
    removeNode,
    removeEdge,
    disconnectTargetPort,
    toggleNodeBypass,
    convertInputToSource,
    convertOutputToSource,
    openContextMenu,
    closeContextMenu,
    connectedInputs,
    graphRunning: canvasRunning,
    queuedNodeCounts,
    outputMetadataByRunId,
    inputImages: inputImages || EMPTY_INPUT_IMAGES,
    refreshInputImages: refreshInputImages || NOOP_ASYNC,
    updateInputImages: updateInputImages || NOOP
  }), [
    updateNodeValues, updateNodeSize, commitNodeResize, runNode, removeNode, removeEdge,
    disconnectTargetPort, toggleNodeBypass, convertInputToSource, convertOutputToSource,
    openContextMenu, closeContextMenu, connectedInputs, canvasRunning, queuedNodeCounts,
    outputMetadataByRunId,
    inputImages, refreshInputImages, updateInputImages
  ]);

  const flyoutTitle = activePanel ? CANVAS_PANELS[activePanel]?.label : "";

  return (
    <div className={`canvasView${canvasInteracting ? " is-interacting" : ""}`}>
      <div className="canvasStage">
        <div
          ref={canvasWorkspaceRef}
          className={`canvasWorkspace${paletteDropActive ? " isPaletteDropTarget" : ""}`}
        >
          <CanvasDock
            activePanel={activePanel}
            onSelect={setActivePanel}
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
            <CanvasGraphContext.Provider value={graphContextValue}>
            <ReactFlow
              className={`canvasTool-${activeCanvasTool}`}
              nodes={nodes}
              edges={renderedEdges}
              nodeTypes={nodeTypes}
              onInit={instance => {
                reactFlowRef.current = instance;
                applyStoredViewport(instance, viewport);
              }}
              onNodesChange={onNodesChange}
              onNodeDragStart={() => setCanvasInteracting(true)}
              onNodeDragStop={() => setCanvasInteracting(false)}
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
              onMoveStart={() => {
                beginViewportGesture();
                setCanvasInteracting(true);
              }}
              onMoveEnd={(_event, nextViewport) => {
                endViewportGesture(nextViewport);
                setCanvasInteracting(false);
              }}
              isValidConnection={isValidConnection}
              minZoom={0.1}
              maxZoom={30}
              zoomOnScroll
              zoomOnDoubleClick={false}
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
              <Background
                gap={18}
                size={1.25}
                color="var(--canvas-dot)"
                bgColor="var(--canvas-bg)"
              />
              <CanvasFlowPanel
                minimapOpen={minimapOpen}
                onToggleMinimap={toggleMinimap}
                logOpen={runLogOpen}
                onToggleLog={toggleLog}
                logHasActivity={logHasActivity}
                logBadgeCount={logBadgeCount}
                minZoom={0.1}
                maxZoom={30}
                selectedTool={canvasTool}
                activeTool={activeCanvasTool}
                onToolChange={setCanvasTool}
                spaceHeld={spaceHeld}
                running={canvasRunning}
                canRun={nodes.some(node => node.type === "step")}
                canCancel={Boolean(canvasRunning || hasStaleRunningSessions)}
                queueCount={canvasQueueCount}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undoCanvas}
                onRedo={redoCanvas}
                onRun={runGraph}
                onCancel={cancelCanvasRun}
                onClearQueue={clearCanvasQueue}
                onStopAll={stopAllCanvasRuns}
                onViewportGestureStart={beginViewportGesture}
                onViewportGestureEnd={endViewportGesture}
              />
            </ReactFlow>
            </CanvasGraphContext.Provider>
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
            onRefresh={refreshRunLogSessions}
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
            queueRunKind="canvas"
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
