import { useCallback, useEffect, useState } from "react";

export const EXECUTION_MODE_KEY = "comfyui-build:execution-mode";
export const RUNNINGHUB_STORAGE_KEY = "comfyui-build:runninghub:v1";
export const DEFAULT_RH_WEBAPP_ID = "2039924771751731201";
export const DEFAULT_RH_WF_ID = "2064644362323189762";
export const RUNNINGHUB_APP_OPTIONS = [
  { id: DEFAULT_RH_WEBAPP_ID, name: "SDVN Upscale" }
];

export function loadExecutionMode() {
  const stored = localStorage.getItem(EXECUTION_MODE_KEY);
  if (stored === "runninghub") return "runninghub-app";
  if (stored === "runninghub-app" || stored === "runninghub-wf") return stored;
  return "local";
}

export function isRunningHubMode(mode) {
  return mode === "runninghub-app" || mode === "runninghub-wf";
}

export function loadRunningHubSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUNNINGHUB_STORAGE_KEY) || "{}");
    return {
      apiKey: parsed.apiKey || "",
      webappId: parsed.webappId || DEFAULT_RH_WEBAPP_ID,
      workflowId: parsed.workflowId || ""
    };
  } catch {
    return { apiKey: "", webappId: DEFAULT_RH_WEBAPP_ID, workflowId: "" };
  }
}

export function nodeFieldKey(node) {
  return `${node.nodeId}|${node.fieldName}`;
}

export function buildNodeDefaults(nodes = []) {
  const values = {};
  for (const node of nodes) {
    values[nodeFieldKey(node)] = node.fieldValue ?? "";
  }
  return values;
}

export function useRunningHub() {
  const [settings, setSettings] = useState(loadRunningHubSettings);
  const [nodes, setNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState("");

  useEffect(() => {
    localStorage.setItem(RUNNINGHUB_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((patch) => {
    setSettings(current => ({ ...current, ...patch }));
  }, []);

  const restoreNodes = useCallback((nextNodes = []) => {
    setNodes(Array.isArray(nextNodes) ? nextNodes : []);
    setNodesError("");
  }, []);

  const fetchNodes = useCallback(async (override = {}) => {
    const apiKey = override.apiKey ?? settings.apiKey;
    const webappId = override.webappId ?? settings.webappId;
    const shouldThrow = override.throwOnError === true;
    if (!apiKey?.trim()) {
      const message = "Chưa nhập API Key RunningHub";
      setNodesError(message);
      setNodes([]);
      if (shouldThrow) throw new Error(message);
      return [];
    }
    if (!webappId?.trim()) {
      const message = "Chưa nhập WebApp ID";
      setNodesError(message);
      setNodes([]);
      if (shouldThrow) throw new Error(message);
      return [];
    }

    setNodesLoading(true);
    setNodesError("");
    try {
      const response = await fetch("/api/runninghub/nodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), webappId: webappId.trim() })
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {
        throw new Error(text || "Backend không trả về JSON khi lấy node RunningHub");
      }
      if (!response.ok) throw new Error(data.error || data.msg || "Không lấy được node từ RunningHub");
      const nextNodes = data.nodes || [];
      setNodes(nextNodes);
      return nextNodes;
    } catch (error) {
      setNodesError(error.message);
      setNodes([]);
      if (shouldThrow) throw error;
      return [];
    } finally {
      setNodesLoading(false);
    }
  }, [settings.apiKey, settings.webappId]);

  return {
    settings,
    updateSettings,
    nodes,
    restoreNodes,
    nodesLoading,
    nodesError,
    fetchNodes
  };
}
