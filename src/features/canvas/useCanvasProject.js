import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyEdgeChanges, applyNodeChanges, addEdge } from "@xyflow/react";
import { clearNodeRunCachePatch, stripRhDefaultImages, getNodeRunCache, buildNodeRunCache, deriveStepPorts, portTypeForUi } from "./canvasModel.js";
import { resolveFieldValueForSource, resolveOutputValueForSource } from "./canvasMenuHelpers.js";
import { CANVAS_NODE_DEFAULT_WIDTH } from "./CanvasNodeResizeHandles.jsx";
import { compactStepNodeSize, growStepNodesToFit, isStepOutputDetached, normalizeOutputSplitNodes, reconcileOutputSplitOnEdgeRemove, restoreInputSourceOnRemove, restoreOutputPassthroughOnRemove } from "./canvasNodeLayout.js";
import { canvasViewportsEqual, normalizeCanvasViewport } from "./canvasViewport.js";
import { createWorkflowFile, parseWorkflowFile } from "./workflowFile.js";

const CANVAS_HISTORY_LIMIT = 80;

export function snapshotCanvasState(nodes, edges) {
  return {
    // Canvas updates are immutable. Retain node/edge objects so undo history
    // shares heavy config and image metadata instead of cloning it 80 times.
    nodes: [...(nodes || [])],
    edges: [...(edges || [])]
  };
}

export function canvasSnapshotsEqual(a, b) {
  if (!a || !b) return false;
  return a.nodes.length === b.nodes.length
    && a.edges.length === b.edges.length
    && a.nodes.every((node, index) => node === b.nodes[index])
    && a.edges.every((edge, index) => edge === b.edges[index]);
}

/** Strip transient runtime fields before persisting a node; keep runCache. */
function serializeNode(node) {
  const data = { ...(node.data || {}) };
  if (data.status === "running") data.status = "idle";
  delete data.detachedOutputs;
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data
  };
}

function normalizeNodeRuntime(node) {
  if (node.type !== "step" || !node.data || node.data.status !== "running") return node;
  return {
    ...node,
    data: {
      ...node.data,
      status: "idle",
      error: node.data.error || ""
    }
  };
}

/** Ensure legacy output/outputs are stored as runCache when loading a project. */
function normalizeNodeRunCache(node) {
  if (node.type !== "step" || node.data?.runCache?.outputs?.length) return node;
  const cache = getNodeRunCache(node);
  if (!cache) return node;
  return {
    ...node,
    data: {
      ...node.data,
      runCache: buildNodeRunCache(cache.outputs, cache.runId, cache)
    }
  };
}

function normalizeNodePorts(node) {
  if (node.type !== "step" || !node.data?.ports?.inputs) return node;
  const configPorts = node.data?.config ? deriveStepPorts(node.data.config).inputs : [];
  const configPortsByValueKey = new Map(configPorts.map(port => [port.valueKey, port]));
  const inputs = node.data.ports.inputs.map(port => {
    const configPort = configPortsByValueKey.get(port.valueKey);
    const inferredType = portTypeForUi(configPort?.uiType || port.uiType);
    return {
      ...port,
      ...configPort,
      type: inferredType === "any" ? (configPort?.type || port.type || "any") : inferredType,
      connectable: true
    };
  });
  return {
    ...node,
    data: {
      ...node.data,
      ports: { ...node.data.ports, inputs }
    }
  };
}

async function postCanvasProject(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function applyProjectPayload(data, applyState) {
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const nodes = normalizeOutputSplitNodes(
    (Array.isArray(data.nodes) ? data.nodes : [])
      .map(node => normalizeNodeRuntime(normalizeNodePorts(normalizeNodeRunCache(stripRhDefaultImages(node))))),
    edges
  );
  applyState({
    activeId: data.activeId || "",
    activeName: data.name || "Workflow",
    projects: Array.isArray(data.projects) ? data.projects : [],
    nodes,
    edges,
    viewport: normalizeCanvasViewport(data.viewport)
  });
}

function isProjectUnsavedToLibrary(project, dirtyTabIds) {
  if (!project) return false;
  return dirtyTabIds.has(project.id);
}

function serializeBaseline(nodes, edges) {
  return JSON.stringify({
    nodes: (nodes || []).map(serializeNode),
    edges: edges || []
  });
}

export function useCanvasProject() {
  const [nodes, rawSetNodes] = useState([]);
  const [edges, rawSetEdges] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [activeName, setActiveName] = useState("Workflow");
  const [viewport, setViewport] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [workspaceSaveState, setWorkspaceSaveState] = useState("idle");
  const [tabOrder, setTabOrder] = useState([]);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const persistTimer = useRef(null);
  const persistEnabled = useRef(false);
  const viewportRef = useRef(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const historyRef = useRef({ past: [], future: [] });
  const dragStartSnapshotRef = useRef(null);
  const resizeStartSnapshotRef = useRef(null);
  const interactionActiveRef = useRef(false);
  const suppressLibraryDirtyRef = useRef(true);
  const libraryDirtyTabsRef = useRef(new Set());
  const libraryBaselineRef = useRef(new Map());
  const [libraryDirtyTick, setLibraryDirtyTick] = useState(0);

  const syncLibraryBaseline = useCallback((projectId, nextNodes, nextEdges) => {
    if (!projectId) return;
    libraryBaselineRef.current.set(projectId, serializeBaseline(nextNodes, nextEdges));
    if (libraryDirtyTabsRef.current.delete(projectId)) {
      setLibraryDirtyTick(tick => tick + 1);
    }
  }, []);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    setTabOrder(current => {
      const ids = projects.map(project => project.id);
      const next = current.filter(id => ids.includes(id));
      for (const id of ids) {
        if (!next.includes(id)) next.push(id);
      }
      return next.length ? next : ids;
    });
  }, [projects]);

  const orderedTabs = useMemo(() => {
    const byId = new Map(projects.map(project => [project.id, project]));
    return tabOrder.map(id => byId.get(id)).filter(Boolean);
  }, [projects, tabOrder]);

  const publishHistoryAvailability = useCallback(() => {
    const { past, future } = historyRef.current;
    setHistoryAvailability({
      canUndo: past.length > 0,
      canRedo: future.length > 0
    });
  }, []);

  const resetHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] };
    dragStartSnapshotRef.current = null;
    resizeStartSnapshotRef.current = null;
    interactionActiveRef.current = false;
    publishHistoryAvailability();
  }, [publishHistoryAvailability]);

  const markLibraryDirtySuppressed = useCallback(() => {
    suppressLibraryDirtyRef.current = true;
    window.requestAnimationFrame(() => {
      suppressLibraryDirtyRef.current = false;
    });
  }, []);

  const flushActiveSession = useCallback(async () => {
    if (!persistEnabled.current || !activeIdRef.current) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    await postCanvasProject("/api/canvas-project", {
      nodes: nodesRef.current.map(serializeNode),
      edges: edgesRef.current,
      viewport: viewportRef.current
    });
  }, []);

  const currentSnapshot = useCallback(() => (
    snapshotCanvasState(nodesRef.current, edgesRef.current)
  ), []);

  const pushHistorySnapshot = useCallback((snapshot = currentSnapshot()) => {
    const history = historyRef.current;
    const last = history.past[history.past.length - 1];
    if (canvasSnapshotsEqual(last, snapshot)) return;
    historyRef.current = {
      past: [...history.past, snapshot].slice(-CANVAS_HISTORY_LIMIT),
      future: []
    };
    publishHistoryAvailability();
  }, [currentSnapshot, publishHistoryAvailability]);

  const applyCanvasSnapshot = useCallback((snapshot) => {
    nodesRef.current = snapshot.nodes;
    edgesRef.current = snapshot.edges;
    rawSetNodes(snapshot.nodes);
    rawSetEdges(snapshot.edges);
  }, []);

  const applyCanvasState = useCallback((nextNodes, nextEdges, { history = true } = {}) => {
    if (history) pushHistorySnapshot();
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    rawSetNodes(nextNodes);
    rawSetEdges(nextEdges);
  }, [pushHistorySnapshot]);

  const setNodes = useCallback((updater, options = {}) => {
    const nextNodes = typeof updater === "function" ? updater(nodesRef.current) : updater;
    applyCanvasState(nextNodes, edgesRef.current, options);
  }, [applyCanvasState]);

  const setEdges = useCallback((updater, options = {}) => {
    const nextEdges = typeof updater === "function" ? updater(edgesRef.current) : updater;
    applyCanvasState(nodesRef.current, nextEdges, options);
  }, [applyCanvasState]);

  const undoCanvas = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past[history.past.length - 1];
    if (!previous) return false;
    const current = currentSnapshot();
    historyRef.current = {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, CANVAS_HISTORY_LIMIT)
    };
    applyCanvasSnapshot(previous);
    publishHistoryAvailability();
    return true;
  }, [applyCanvasSnapshot, currentSnapshot, publishHistoryAvailability]);

  const redoCanvas = useCallback(() => {
    const history = historyRef.current;
    const next = history.future[0];
    if (!next) return false;
    const current = currentSnapshot();
    historyRef.current = {
      past: [...history.past, current].slice(-CANVAS_HISTORY_LIMIT),
      future: history.future.slice(1)
    };
    applyCanvasSnapshot(next);
    publishHistoryAvailability();
    return true;
  }, [applyCanvasSnapshot, currentSnapshot, publishHistoryAvailability]);

  // Auto-grow fixed-height step nodes when their content (image input, output
  // preview, split state, error row…) needs more room than the current height.
  useEffect(() => {
    if (interactionActiveRef.current) return;
    const { nodes: grown, changed } = growStepNodesToFit(nodes, edges);
    if (changed) {
      setNodes(grown, { history: false });
      if (activeIdRef.current) {
        libraryBaselineRef.current.set(
          activeIdRef.current,
          serializeBaseline(grown, edges)
        );
      }
    }
  }, [nodes, edges, setNodes]);

  const [libraryWorkflows, setLibraryWorkflows] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const reloadLibraryWorkflows = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const response = await fetch("/api/canvas-workflows");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLibraryWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
      return data.workflows;
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const loadProject = useCallback(async () => {
    const response = await fetch("/api/canvas-project");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    applyProjectPayload(data, ({ activeId: id, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges, viewport: nextViewport }) => {
      activeIdRef.current = id;
      setActiveId(id);
      setActiveName(name);
      setProjects(list);
      viewportRef.current = nextViewport;
      setViewport(nextViewport);
      applyCanvasState(nextNodes, nextEdges, { history: false });
      resetHistory();
      syncLibraryBaseline(id, nextNodes, nextEdges);
      markLibraryDirtySuppressed();
    });
    return data;
  }, [applyCanvasState, markLibraryDirtySuppressed, resetHistory, syncLibraryBaseline]);

  useEffect(() => {
    let cancelled = false;
    loadProject()
      .then(() => {
        if (!cancelled) {
          setLoaded(true);
          persistEnabled.current = true;
          setWorkspaceSaveState("saved");
          void reloadLibraryWorkflows();
        }
      })
      .catch(error => {
        console.error("Could not load canvas project:", error);
        if (!cancelled) {
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadProject, reloadLibraryWorkflows]);

  useEffect(() => {
    if (!loaded || !persistEnabled.current) return undefined;
    setWorkspaceSaveState("pending");
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      if (interactionActiveRef.current) return;
      setWorkspaceSaveState("saving");
      fetch("/api/canvas-project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nodes: nodes.map(serializeNode),
          edges,
          viewport: viewportRef.current
        })
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data.projects)) setProjects(data.projects);
          setWorkspaceSaveState("saved");
        })
        .catch(error => {
          console.error("Could not save canvas project:", error);
          setWorkspaceSaveState("error");
        });
    }, 400);
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, [nodes, edges, viewport, loaded]);

  useEffect(() => {
    if (!loaded || suppressLibraryDirtyRef.current || !activeId) return;
    const baseline = libraryBaselineRef.current.get(activeId);
    const current = serializeBaseline(nodes, edges);
    if (baseline === undefined) {
      libraryBaselineRef.current.set(activeId, current);
      return;
    }
    const dirty = baseline !== current;
    const wasDirty = libraryDirtyTabsRef.current.has(activeId);
    if (dirty && !wasDirty) {
      libraryDirtyTabsRef.current.add(activeId);
      setLibraryDirtyTick(tick => tick + 1);
    } else if (!dirty && wasDirty) {
      libraryDirtyTabsRef.current.delete(activeId);
      setLibraryDirtyTick(tick => tick + 1);
    }
  }, [nodes, edges, activeId, loaded]);

  const isTabUnsavedToLibrary = useCallback((projectId) => {
    const project = projects.find(item => item.id === projectId);
    return isProjectUnsavedToLibrary(project, libraryDirtyTabsRef.current);
  }, [projects, libraryDirtyTick]);

  const needsCloseConfirmation = useCallback((projectId) => {
    const project = projects.find(item => item.id === projectId);
    if (!project) return false;
    if (libraryDirtyTabsRef.current.has(projectId)) return true;
    const nodeCount = projectId === activeIdRef.current
      ? nodesRef.current.length
      : (project.nodeCount || 0);
    const edgeCount = projectId === activeIdRef.current
      ? edgesRef.current.length
      : (project.edgeCount || 0);
    if (project.librarySaved !== true && (nodeCount > 0 || edgeCount > 0)) {
      return true;
    }
    return false;
  }, [projects, libraryDirtyTick]);

  const isTabInLibrary = useCallback((projectId) => {
    const project = projects.find(item => item.id === projectId);
    return project?.librarySaved === true;
  }, [projects]);

  const saveWorkflowFileRef = useRef(null);
  const switchProjectRef = useRef(null);

  const reportViewport = useCallback((nextViewport) => {
    const normalized = normalizeCanvasViewport(nextViewport);
    if (canvasViewportsEqual(viewportRef.current, normalized)) return;
    viewportRef.current = normalized;
    setViewport(normalized);
  }, []);

  const saveWorkflowFile = useCallback(async (tabId = activeIdRef.current) => {
    const targetId = tabId || activeIdRef.current;
    const summary = projects.find(project => project.id === targetId);
    const name = summary?.name || activeName;
    const file = createWorkflowFile({
      id: targetId,
      name,
      createdAt: summary?.createdAt || null,
      updatedAt: summary?.updatedAt || null,
      nodes: nodesRef.current.map(serializeNode),
      edges: edgesRef.current,
      viewport: viewportRef.current
    });
    const data = await postCanvasProject("/api/canvas-project/save-file", {
      projectId: targetId,
      file
    });
    if (Array.isArray(data.projects)) setProjects(data.projects);
    syncLibraryBaseline(targetId, nodesRef.current, edgesRef.current);
    await reloadLibraryWorkflows();
    return data;
  }, [activeName, projects, syncLibraryBaseline, reloadLibraryWorkflows]);

  saveWorkflowFileRef.current = saveWorkflowFile;

  const exportWorkflow = useCallback(() => {
    const summary = projects.find(project => project.id === activeId);
    return createWorkflowFile({
      id: activeId,
      name: activeName,
      createdAt: summary?.createdAt || null,
      updatedAt: summary?.updatedAt || null,
      nodes: nodesRef.current.map(serializeNode),
      edges: edgesRef.current,
      viewport: viewportRef.current
    });
  }, [activeId, activeName, projects]);

  const importWorkflow = useCallback(async (fileContents) => {
    const workflow = parseWorkflowFile(fileContents);
    persistEnabled.current = false;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    try {
      await flushActiveSession();
      const data = await postCanvasProject("/api/canvas-project/open-tab", workflow);
      applyProjectPayload(data, ({ activeId: nextId, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges, viewport: nextViewport }) => {
        activeIdRef.current = nextId;
        setActiveId(nextId);
        setActiveName(name);
        setProjects(list);
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
        applyCanvasState(nextNodes, nextEdges, { history: false });
        resetHistory();
        syncLibraryBaseline(nextId, nextNodes, nextEdges);
        markLibraryDirtySuppressed();
      });
      return data;
    } finally {
      persistEnabled.current = true;
    }
  }, [applyCanvasState, flushActiveSession, markLibraryDirtySuppressed, resetHistory, syncLibraryBaseline]);

  const onNodesChange = useCallback((changes) => {
    const currentNodes = nodesRef.current;
    const hasUndoableChange = changes.some(change => change.type !== "select" && change.type !== "dimensions");
    const hasDraggingPosition = changes.some(change => change.type === "position" && change.dragging);
    const hasDragEndPosition = changes.some(change => change.type === "position" && change.dragging === false);

    if (hasDraggingPosition) interactionActiveRef.current = true;

    if (hasDraggingPosition && !dragStartSnapshotRef.current) {
      dragStartSnapshotRef.current = currentSnapshot();
    }

    const removedNodes = changes
      .filter(change => change.type === "remove")
      .map(change => currentNodes.find(node => node.id === change.id))
      .filter(Boolean);

    const removedOutputIds = removedNodes
      .filter(node => node.type === "source" && node.data?.passthroughFromOutput)
      .map(node => node.id);

    const removedInputIds = removedNodes
      .filter(node => node.type === "source" && node.data?.passthroughFromInput)
      .map(node => node.id);

    if (!removedOutputIds.length && !removedInputIds.length) {
      const nextNodes = applyNodeChanges(changes, currentNodes);
      if (hasDragEndPosition && dragStartSnapshotRef.current) {
        interactionActiveRef.current = false;
        pushHistorySnapshot(dragStartSnapshotRef.current);
        dragStartSnapshotRef.current = null;
        applyCanvasState(nextNodes, edgesRef.current, { history: false });
        return;
      }
      if (hasDragEndPosition) interactionActiveRef.current = false;
      applyCanvasState(nextNodes, edgesRef.current, {
        history: hasUndoableChange && !hasDraggingPosition
      });
      return;
    }

    // Deterministically restore passthrough source nodes before React Flow
    // processes the deletion, ensuring correct state for both output and input splits.
    let nodesAcc = currentNodes;
    let edgesAcc = edgesRef.current;

    for (const passthroughId of removedOutputIds) {
      const restored = restoreOutputPassthroughOnRemove(nodesAcc, edgesAcc, passthroughId);
      if (restored) {
        nodesAcc = restored.nodes;
        edgesAcc = restored.edges;
      }
    }

    for (const sourceId of removedInputIds) {
      const restored = restoreInputSourceOnRemove(nodesAcc, edgesAcc, sourceId);
      if (restored) {
        nodesAcc = restored.nodes;
        edgesAcc = restored.edges;
      }
    }

    const handledIds = new Set([...removedOutputIds, ...removedInputIds]);
    const remainingChanges = changes.filter(change => !(
      change.type === "remove" && handledIds.has(change.id)
    ));
    applyCanvasState(applyNodeChanges(remainingChanges, nodesAcc), edgesAcc, {
      history: hasUndoableChange
    });
  }, [applyCanvasState, currentSnapshot, pushHistorySnapshot]);

  const onEdgesChange = useCallback((changes) => {
    const currentEdges = edgesRef.current;
    const currentNodes = nodesRef.current;
    let nextEdges = applyEdgeChanges(changes, currentEdges);
    let nextNodes = currentNodes;

    const removals = changes.filter(change => change.type === "remove");
    for (const change of removals) {
      const removedEdge = currentEdges.find(edge => edge.id === change.id);
      if (!removedEdge) continue;
      const restored = reconcileOutputSplitOnEdgeRemove(nextNodes, nextEdges, removedEdge);
      if (restored) {
        nextNodes = restored.nodes;
        nextEdges = restored.edges;
      }
    }

    applyCanvasState(nextNodes, nextEdges, {
      history: removals.length > 0 || changes.some(change => change.type !== "select")
    });
  }, [applyCanvasState]);

  const onConnect = useCallback((connection) => {
    const deduped = edgesRef.current.filter(edge => !(
      edge.target === connection.target && edge.targetHandle === connection.targetHandle
    ));
    applyCanvasState(
      nodesRef.current,
      addEdge({ ...connection, type: "default", animated: false }, deduped)
    );
  }, [applyCanvasState]);

  const addNode = useCallback((node) => {
    setNodes(current => [...current, node]);
  }, [setNodes]);

  const updateNodeData = useCallback((id, patch, options = { history: false }) => {
    setNodes(current => current.map(node => (
      node.id === id
        ? { ...node, data: { ...node.data, ...(typeof patch === "function" ? patch(node.data) : patch) } }
        : node
    )), options);
  }, [setNodes]);

  const updateNodeSize = useCallback((id, { width, height, position }) => {
    if (!resizeStartSnapshotRef.current) {
      resizeStartSnapshotRef.current = currentSnapshot();
    }
    interactionActiveRef.current = true;
    setNodes(current => current.map(node => {
      if (node.id !== id) return node;
      return {
        ...node,
        position: position
          ? { ...node.position, x: position.x, y: position.y ?? node.position.y }
          : node.position,
        data: {
          ...node.data,
          size: { width, height }
        }
      };
    }), { history: false });
  }, [currentSnapshot, setNodes]);

  const commitNodeResize = useCallback(() => {
    interactionActiveRef.current = false;
    if (!resizeStartSnapshotRef.current) return;
    pushHistorySnapshot(resizeStartSnapshotRef.current);
    resizeStartSnapshotRef.current = null;
    // Trigger the debounced persistence effect after the transient resize.
    rawSetNodes(current => [...current]);
  }, [pushHistorySnapshot]);

  const removeNode = useCallback((id) => {
    const restoredOutput = restoreOutputPassthroughOnRemove(nodesRef.current, edgesRef.current, id);
    if (restoredOutput) {
      applyCanvasState(restoredOutput.nodes, restoredOutput.edges);
      return;
    }
    const restoredInput = restoreInputSourceOnRemove(nodesRef.current, edgesRef.current, id);
    if (restoredInput) {
      applyCanvasState(restoredInput.nodes, restoredInput.edges);
      return;
    }
    applyCanvasState(
      nodesRef.current.filter(node => node.id !== id),
      edgesRef.current.filter(edge => edge.source !== id && edge.target !== id)
    );
  }, [applyCanvasState]);

  const removeEdge = useCallback((edgeId) => {
    setEdges(current => current.filter(edge => edge.id !== edgeId));
  }, [setEdges]);

  const disconnectTargetPort = useCallback((nodeId, valueKey) => {
    setEdges(current => current.filter(edge => !(
      edge.target === nodeId && edge.targetHandle === `in:${valueKey}`
    )));
  }, [setEdges]);

  const toggleNodeBypass = useCallback((id) => {
    updateNodeData(id, prev => ({
      bypassed: !prev.bypassed,
      ...(!prev.bypassed ? { ...clearNodeRunCachePatch(), status: "idle", error: "" } : {})
    }), { history: true });
  }, [updateNodeData]);

  const convertInputToSource = useCallback((nodeId, valueKey) => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const node = currentNodes.find(item => item.id === nodeId);
    if (!node || node.type !== "step") return;

    const { sourceType, value, label, port } = resolveFieldValueForSource(
      node,
      valueKey,
      currentNodes,
      currentEdges
    );
    const newId = `source-${crypto.randomUUID().slice(0, 8)}`;
    const newNode = {
      id: newId,
      type: "source",
      position: {
        x: (node.position?.x || 0) - 280,
        y: (node.position?.y || 0) + 20
      },
      data: {
        sourceType,
        name: label,
        port,
        values: { main: value },
        passthroughFromInput: true,
        passthroughTargetNodeId: nodeId,
        passthroughInputValueKey: valueKey
      }
    };

    applyCanvasState(currentNodes
      .map(item => (
        item.id === nodeId
          ? {
            ...item,
            data: {
              ...item.data,
              values: { ...(item.data?.values || {}), [valueKey]: "" }
            }
          }
          : item
      ))
      .concat(newNode), [
      ...currentEdges.filter(edge => !(
        edge.target === nodeId && edge.targetHandle === `in:${valueKey}`
      )),
      {
        id: `e-${newId}-${nodeId}`,
        source: newId,
        target: nodeId,
        sourceHandle: "out:main",
        targetHandle: `in:${valueKey}`,
        type: "default",
        animated: false
      }
    ]);
  }, [applyCanvasState]);

  const convertOutputToSource = useCallback((nodeId, outputKey = "main") => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const node = currentNodes.find(item => item.id === nodeId);
    if (!node || node.type !== "step") return;
    if (isStepOutputDetached(nodeId, outputKey, currentNodes, currentEdges)) return;

    const { sourceType, label, port } = resolveOutputValueForSource(node, outputKey);
    const outputs = node.data?.ports?.outputs || [];
    if (!outputs.some(item => item.key === outputKey)) return;

    const width = node.data?.size?.width || CANVAS_NODE_DEFAULT_WIDTH;
    const sourceHandle = `out:${outputKey}`;
    const outgoing = currentEdges.filter(edge => (
      edge.source === nodeId && edge.sourceHandle === sourceHandle
    ));

    const newId = `source-${crypto.randomUUID().slice(0, 8)}`;
    const newNode = {
      id: newId,
      type: "source",
      position: {
        x: (node.position?.x || 0) + width + 40,
        y: (node.position?.y || 0) + 20
      },
      data: {
        sourceType,
        name: label,
        port,
        passthroughFromOutput: true,
        passthroughSourceNodeId: nodeId,
        passthroughOutputKey: outputKey,
        values: { main: "" }
      }
    };

    const nextEdges = [
      ...currentEdges.filter(edge => !(edge.source === nodeId && edge.sourceHandle === sourceHandle)),
      {
        id: `e-${nodeId}-${newId}`,
        source: nodeId,
        target: newId,
        sourceHandle,
        targetHandle: "in:main",
        type: "default",
        animated: false
      },
      ...outgoing.map((edge, index) => ({
        id: `e-${newId}-${edge.target}-${index}`,
        source: newId,
        target: edge.target,
        sourceHandle: "out:main",
        targetHandle: edge.targetHandle,
        type: edge.type || "default",
        animated: edge.animated ?? false
      }))
    ];
    applyCanvasState(currentNodes.map(item => (
      item.id === nodeId
        ? {
          ...item,
          data: {
            ...item.data,
            size: compactStepNodeSize(width)
          }
        }
        : item
    )).concat(newNode), nextEdges);
  }, [applyCanvasState]);

  const clearProject = useCallback(() => {
    applyCanvasState([], []);
  }, [applyCanvasState]);

  const switchProject = useCallback(async (id) => {
    if (id === activeIdRef.current) return;
    persistEnabled.current = false;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    try {
      await flushActiveSession();
      const data = await postCanvasProject("/api/canvas-project/switch", { id });
      applyProjectPayload(data, ({ activeId: nextId, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges, viewport: nextViewport }) => {
        activeIdRef.current = nextId;
        setActiveId(nextId);
        setActiveName(name);
        setProjects(list);
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
        applyCanvasState(nextNodes, nextEdges, { history: false });
        resetHistory();
        syncLibraryBaseline(nextId, nextNodes, nextEdges);
        markLibraryDirtySuppressed();
      });
    } finally {
      persistEnabled.current = true;
    }
  }, [applyCanvasState, flushActiveSession, markLibraryDirtySuppressed, resetHistory, syncLibraryBaseline]);

  switchProjectRef.current = switchProject;

  const saveTabToLibrary = useCallback(async (tabId) => {
    const targetId = tabId || activeIdRef.current;
    if (targetId && targetId !== activeIdRef.current) {
      await switchProjectRef.current?.(targetId);
    }
    return saveWorkflowFileRef.current?.(targetId);
  }, []);

  const openNewTab = useCallback(async () => {
    persistEnabled.current = false;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    try {
      await flushActiveSession();
      const data = await postCanvasProject("/api/canvas-project/create", {
        name: `Workflow ${projects.length + 1}`
      });
      applyProjectPayload(data, ({ activeId: nextId, activeName: nextName, projects: list, nodes: nextNodes, edges: nextEdges, viewport: nextViewport }) => {
        activeIdRef.current = nextId;
        setActiveId(nextId);
        setActiveName(nextName);
        setProjects(list);
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
        applyCanvasState(nextNodes, nextEdges, { history: false });
        resetHistory();
        syncLibraryBaseline(nextId, nextNodes, nextEdges);
        markLibraryDirtySuppressed();
      });
    } finally {
      persistEnabled.current = true;
    }
  }, [applyCanvasState, flushActiveSession, markLibraryDirtySuppressed, projects.length, resetHistory, syncLibraryBaseline]);

  const createProject = useCallback(async (name) => {
    persistEnabled.current = false;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    try {
      await flushActiveSession();
      const data = await postCanvasProject("/api/canvas-project/create", { name });
      applyProjectPayload(data, ({ activeId: nextId, activeName: nextName, projects: list, nodes: nextNodes, edges: nextEdges, viewport: nextViewport }) => {
        activeIdRef.current = nextId;
        setActiveId(nextId);
        setActiveName(nextName);
        setProjects(list);
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
        applyCanvasState(nextNodes, nextEdges, { history: false });
        resetHistory();
        syncLibraryBaseline(nextId, nextNodes, nextEdges);
        markLibraryDirtySuppressed();
      });
    } finally {
      persistEnabled.current = true;
    }
  }, [applyCanvasState, flushActiveSession, markLibraryDirtySuppressed, resetHistory, syncLibraryBaseline]);

  const openLibraryWorkflow = useCallback(async (slug) => {
    if (!slug) return;
    persistEnabled.current = false;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    try {
      await flushActiveSession();
      const data = await postCanvasProject("/api/canvas-workflows/open", { slug });
      applyProjectPayload(data, ({ activeId: nextId, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges, viewport: nextViewport }) => {
        activeIdRef.current = nextId;
        setActiveId(nextId);
        setActiveName(name);
        setProjects(list);
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
        applyCanvasState(nextNodes, nextEdges, { history: false });
        resetHistory();
        syncLibraryBaseline(nextId, nextNodes, nextEdges);
        markLibraryDirtySuppressed();
      });
      return data;
    } finally {
      persistEnabled.current = true;
    }
  }, [applyCanvasState, flushActiveSession, markLibraryDirtySuppressed, resetHistory, syncLibraryBaseline]);

  const deleteLibraryWorkflow = useCallback(async (slug) => {
    if (!slug) return;
    const data = await postCanvasProject("/api/canvas-workflows/delete", { slug });
    if (Array.isArray(data.workflows)) setLibraryWorkflows(data.workflows);
    if (Array.isArray(data.projects)) setProjects(data.projects);
    setLibraryDirtyTick(tick => tick + 1);
    return data;
  }, []);

  const closeTab = useCallback(async (tabId, { discardChanges = false } = {}) => {
    if (!tabId) return;
    persistEnabled.current = false;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    try {
      if (!discardChanges) {
        await flushActiveSession();
      }
      libraryDirtyTabsRef.current.delete(tabId);
      libraryBaselineRef.current.delete(tabId);
      const data = await postCanvasProject("/api/canvas-project/close-tab", { id: tabId });
      applyProjectPayload(data, ({ activeId: nextId, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges, viewport: nextViewport }) => {
        activeIdRef.current = nextId;
        setActiveId(nextId);
        setActiveName(name);
        setProjects(list);
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
        applyCanvasState(nextNodes, nextEdges, { history: false });
        resetHistory();
        syncLibraryBaseline(nextId, nextNodes, nextEdges);
        markLibraryDirtySuppressed();
      });
    } finally {
      persistEnabled.current = true;
    }
  }, [applyCanvasState, flushActiveSession, markLibraryDirtySuppressed, resetHistory, syncLibraryBaseline]);

  const renameProject = useCallback(async (id, name) => {
    const data = await postCanvasProject("/api/canvas-project/rename", { id, name });
    if (Array.isArray(data.projects)) setProjects(data.projects);
    if (id === activeId) setActiveName(name);
  }, [activeId]);

  const deleteProject = useCallback(async (id) => {
    persistEnabled.current = false;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    try {
      if (id === activeIdRef.current) await flushActiveSession();
      libraryDirtyTabsRef.current.delete(id);
      libraryBaselineRef.current.delete(id);
      const data = await postCanvasProject("/api/canvas-project/delete", { id });
      applyProjectPayload(data, ({ activeId: nextId, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges, viewport: nextViewport }) => {
        activeIdRef.current = nextId;
        setActiveId(nextId);
        setActiveName(name);
        setProjects(list);
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
        applyCanvasState(nextNodes, nextEdges, { history: false });
        resetHistory();
        syncLibraryBaseline(nextId, nextNodes, nextEdges);
        markLibraryDirtySuppressed();
      });
    } finally {
      persistEnabled.current = true;
    }
  }, [applyCanvasState, flushActiveSession, markLibraryDirtySuppressed, resetHistory, syncLibraryBaseline]);

  return {
    nodes, edges, loaded,
    projects, orderedTabs, activeId, activeName, viewport,
    workspaceSaveState,
    canUndo: historyAvailability.canUndo,
    canRedo: historyAvailability.canRedo,
    setNodes, setEdges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, updateNodeData, updateNodeSize, commitNodeResize, removeNode, removeEdge,
    disconnectTargetPort, toggleNodeBypass, convertInputToSource, convertOutputToSource, clearProject,
    undoCanvas, redoCanvas,
    switchProject, createProject, renameProject, deleteProject,
    openNewTab, closeTab, saveTabToLibrary, isTabUnsavedToLibrary, isTabInLibrary, needsCloseConfirmation,
    libraryWorkflows, libraryLoading, reloadLibraryWorkflows, openLibraryWorkflow, deleteLibraryWorkflow,
    saveWorkflowFile, exportWorkflow, importWorkflow,
    reportViewport
  };
}
