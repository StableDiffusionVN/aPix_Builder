import { useCallback, useEffect, useRef, useState } from "react";
import { applyEdgeChanges, applyNodeChanges, addEdge } from "@xyflow/react";
import { stripRhDefaultImages, getNodeRunCache, buildNodeRunCache, deriveStepPorts, portTypeForUi } from "./canvasModel.js";
import { resolveFieldValueForSource } from "./canvasMenuHelpers.js";

/** Strip transient runtime fields before persisting a node; keep runCache. */
function serializeNode(node) {
  const data = { ...(node.data || {}) };
  if (data.status === "running") data.status = "idle";
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data
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
  setState({
    activeId: data.activeId || "",
    activeName: data.name || "Project",
    projects: Array.isArray(data.projects) ? data.projects : [],
    nodes: (Array.isArray(data.nodes) ? data.nodes : [])
      .map(node => normalizeNodePorts(normalizeNodeRunCache(stripRhDefaultImages(node)))),
    edges: Array.isArray(data.edges) ? data.edges : []
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
    setNodes(current => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges(current => applyEdgeChanges(changes, current));
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
    updateNodeData(id, prev => ({ bypassed: !prev.bypassed }));
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
        values: { main: value }
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
    disconnectTargetPort, toggleNodeBypass, convertInputToSource, clearProject,
    switchProject, createProject, renameProject, deleteProject
  };
}
