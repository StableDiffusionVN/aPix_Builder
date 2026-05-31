import { useRef } from "react";

const WORKSPACE_STORAGE_KEY = "comfyui-build:workspace:v1";

function loadStoredWorkspace() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || "{}");
    return {
      selectedTemplate: typeof parsed.selectedTemplate === "string" ? parsed.selectedTemplate : "",
      valuesByTemplate: parsed.valuesByTemplate && typeof parsed.valuesByTemplate === "object" ? parsed.valuesByTemplate : {}
    };
  } catch {
    return { selectedTemplate: "", valuesByTemplate: {} };
  }
}

function sanitizeWorkspaceValue(value) {
  if (typeof value === "string") return value.startsWith("data:") || value.length > 200000 ? "" : value;
  if (Array.isArray(value)) return value.map(sanitizeWorkspaceValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeWorkspaceValue(v)]));
  }
  return value;
}

export function sanitizeWorkspaceValues(values = {}) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, sanitizeWorkspaceValue(value)]));
}

function saveStoredWorkspace(workspace) {
  try { localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace)); } catch {}
}

export function useWorkspace() {
  const workspaceRef = useRef(loadStoredWorkspace());

  function getStoredValues(templateId) {
    return workspaceRef.current.valuesByTemplate?.[templateId] || null;
  }

  function saveValues(templateId, values) {
    const nextWorkspace = {
      ...workspaceRef.current,
      selectedTemplate: templateId,
      valuesByTemplate: {
        ...workspaceRef.current.valuesByTemplate,
        [templateId]: sanitizeWorkspaceValues(values)
      }
    };
    workspaceRef.current = nextWorkspace;
    saveStoredWorkspace(nextWorkspace);
  }

  function getLastTemplate() {
    return workspaceRef.current.selectedTemplate;
  }

  return { workspaceRef, getStoredValues, saveValues, getLastTemplate };
}
