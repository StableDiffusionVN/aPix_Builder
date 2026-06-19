import { useCallback, useRef } from "react";
import { getSetting, setSetting } from "../lib/appSettings.js";

function loadStoredWorkspace() {
  try {
    const parsed = getSetting("workspace", {});
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
  setSetting("workspace", {
    ...getSetting("workspace", {}),
    ...workspace
  });
}

export function useWorkspace() {
  const workspaceRef = useRef(loadStoredWorkspace());

  const getStoredValues = useCallback((templateId) => {
    return workspaceRef.current.valuesByTemplate?.[templateId] || null;
  }, []);

  const saveValues = useCallback((templateId, values) => {
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
  }, []);

  const getLastTemplate = useCallback(() => {
    return workspaceRef.current.selectedTemplate;
  }, []);

  return { workspaceRef, getStoredValues, saveValues, getLastTemplate };
}
