import { useCallback, useEffect, useRef, useState } from "react";
import { applyEdgeChanges, applyNodeChanges, addEdge } from "@xyflow/react";
import { clearNodeRunCachePatch, stripRhDefaultImages, getNodeRunCache, buildNodeRunCache, deriveStepPorts, portTypeForUi } from "./canvasModel.js";
import { resolveFieldValueForSource, resolveOutputValueForSource } from "./canvasMenuHelpers.js";
import { CANVAS_NODE_DEFAULT_WIDTH } from "./CanvasNodeResizeHandles.jsx";
import { compactStepNodeSize, growStepNodesToFit, isStepOutputDetached, normalizeOutputSplitNodes, reconcileOutputSplitOnEdgeRemove, restoreInputSourceOnRemove, restoreOutputPassthroughOnRemove } from "./canvasNodeLayout.js";

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

function applyProjectPayload(data, setState) {
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const nodes = normalizeOutputSplitNodes(
    (Array.isArray(data.nodes) ? data.nodes : [])
      .map(node => normalizeNodeRuntime(normalizeNodePorts(normalizeNodeRunCache(stripRhDefaultImages(node))))),
    edges
  );
  setState({
    activeId: data.activeId || "",
    activeName: data.name || "Project",
    projects: Array.isArray(data.projects) ? data.projects : [],
    nodes,
    edges
  });
}

export function useCanvasProject() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [activeName, setActiveName] = useState("Project");
  const [loaded, setLoaded] = useState(false);
  const persistTimer = useRef(null);
  const persistEnabled = useRef(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // Auto-grow fixed-height step nodes when their content (image input, output
  // preview, split state, error row…) needs more room than the current height.
  useEffect(() => {
    const { nodes: grown, changed } = growStepNodesToFit(nodes, edges);
    if (changed) setNodes(grown);
  }, [nodes, edges]);

  const loadProject = useCallback(async () => {
    const response = await fetch("/api/canvas-project");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    applyProjectPayload(data, ({ activeId: id, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges }) => {
      setActiveId(id);
      setActiveName(name);
      setProjects(list);
      setNodes(nextNodes);
      setEdges(nextEdges);
    });
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadProject()
      .then(() => {
        if (!cancelled) {
          setLoaded(true);
          persistEnabled.current = true;
        }
      })
      .catch(error => {
        console.error("Could not load canvas project:", error);
        if (!cancelled) {
          setLoaded(true);
          persistEnabled.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadProject]);

  useEffect(() => {
    if (!loaded || !persistEnabled.current) return undefined;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      fetch("/api/canvas-project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nodes: nodes.map(serializeNode),
          edges
        })
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data.projects)) setProjects(data.projects);
        })
        .catch(error => {
          console.error("Could not save canvas project:", error);
        });
    }, 400);
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, [nodes, edges, loaded]);

  const onNodesChange = useCallback((changes) => {
    const currentNodes = nodesRef.current;

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
      setNodes(current => applyNodeChanges(changes, current));
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
    setNodes(applyNodeChanges(remainingChanges, nodesAcc));
    setEdges(edgesAcc);
  }, []);

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

    if (nextNodes !== currentNodes) setNodes(nextNodes);
    setEdges(nextEdges);
  }, []);

  const onConnect = useCallback((connection) => {
    setEdges(current => {
      const deduped = current.filter(edge => !(
        edge.target === connection.target && edge.targetHandle === connection.targetHandle
      ));
      return addEdge({ ...connection, type: "default", animated: false }, deduped);
    });
  }, []);

  const addNode = useCallback((node) => {
    setNodes(current => [...current, node]);
  }, []);

  const updateNodeData = useCallback((id, patch) => {
    setNodes(current => current.map(node => (
      node.id === id
        ? { ...node, data: { ...node.data, ...(typeof patch === "function" ? patch(node.data) : patch) } }
        : node
    )));
  }, []);

  const updateNodeSize = useCallback((id, { width, height, position }) => {
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
    }));
  }, []);

  const removeNode = useCallback((id) => {
    const restoredOutput = restoreOutputPassthroughOnRemove(nodesRef.current, edgesRef.current, id);
    if (restoredOutput) {
      setNodes(restoredOutput.nodes);
      setEdges(restoredOutput.edges);
      return;
    }
    const restoredInput = restoreInputSourceOnRemove(nodesRef.current, edgesRef.current, id);
    if (restoredInput) {
      setNodes(restoredInput.nodes);
      setEdges(restoredInput.edges);
      return;
    }
    setNodes(current => current.filter(node => node.id !== id));
    setEdges(current => current.filter(edge => edge.source !== id && edge.target !== id));
  }, []);

  const removeEdge = useCallback((edgeId) => {
    setEdges(current => current.filter(edge => edge.id !== edgeId));
  }, []);

  const disconnectTargetPort = useCallback((nodeId, valueKey) => {
    setEdges(current => current.filter(edge => !(
      edge.target === nodeId && edge.targetHandle === `in:${valueKey}`
    )));
  }, []);

  const toggleNodeBypass = useCallback((id) => {
    updateNodeData(id, prev => ({
      bypassed: !prev.bypassed,
      ...(!prev.bypassed ? { ...clearNodeRunCachePatch(), status: "idle", error: "" } : {})
    }));
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

    setNodes(currentNodes
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
      .concat(newNode));

    setEdges([
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
  }, []);

  const convertOutputToSource = useCallback((nodeId, outputKey = "main") => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const node = currentNodes.find(item => item.id === nodeId);
    if (!node || node.type !== "step") return;
    if (isStepOutputDetached(nodeId, outputKey, currentNodes, currentEdges)) return;

    const { sourceType, value, label, port } = resolveOutputValueForSource(node, outputKey);
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
    setNodes(currentNodes.map(item => (
      item.id === nodeId
        ? {
          ...item,
          data: {
            ...item.data,
            size: compactStepNodeSize(width)
          }
        }
        : item
    )).concat(newNode));

    setEdges(nextEdges);
  }, []);

  const clearProject = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, []);

  const switchProject = useCallback(async (id) => {
    persistEnabled.current = false;
    const data = await postCanvasProject("/api/canvas-project/switch", { id });
    applyProjectPayload(data, ({ activeId: nextId, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges }) => {
      setActiveId(nextId);
      setActiveName(name);
      setProjects(list);
      setNodes(nextNodes);
      setEdges(nextEdges);
    });
    persistEnabled.current = true;
  }, []);

  const createProject = useCallback(async (name) => {
    persistEnabled.current = false;
    const data = await postCanvasProject("/api/canvas-project/create", { name });
    applyProjectPayload(data, ({ activeId: nextId, activeName: nextName, projects: list, nodes: nextNodes, edges: nextEdges }) => {
      setActiveId(nextId);
      setActiveName(nextName);
      setProjects(list);
      setNodes(nextNodes);
      setEdges(nextEdges);
    });
    persistEnabled.current = true;
  }, []);

  const renameProject = useCallback(async (id, name) => {
    const data = await postCanvasProject("/api/canvas-project/rename", { id, name });
    if (Array.isArray(data.projects)) setProjects(data.projects);
    if (id === activeId) setActiveName(name);
  }, [activeId]);

  const deleteProject = useCallback(async (id) => {
    persistEnabled.current = false;
    const data = await postCanvasProject("/api/canvas-project/delete", { id });
    applyProjectPayload(data, ({ activeId: nextId, activeName: name, projects: list, nodes: nextNodes, edges: nextEdges }) => {
      setActiveId(nextId);
      setActiveName(name);
      setProjects(list);
      setNodes(nextNodes);
      setEdges(nextEdges);
    });
    persistEnabled.current = true;
  }, []);

  return {
    nodes, edges, loaded,
    projects, activeId, activeName,
    setNodes, setEdges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, updateNodeData, updateNodeSize, removeNode, removeEdge,
    disconnectTargetPort, toggleNodeBypass, convertInputToSource, convertOutputToSource, clearProject,
    switchProject, createProject, renameProject, deleteProject
  };
}
