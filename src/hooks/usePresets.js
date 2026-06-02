import { useRef, useState } from "react";

const PRESETS_KEY = "comfyui-build:presets:v1";

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESETS_KEY) || "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function persistData(data) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(data)); } catch {}
}

function sanitizePresetValues(values) {
  const result = {};
  for (const [key, value] of Object.entries(values || {})) {
    if (typeof value === "string" && (value.startsWith("data:") || value.length > 200000)) continue;
    if (value && typeof value === "object" && (value.kind === "upload" || value.kind === "input-image")) continue;
    result[key] = value;
  }
  return result;
}

export function usePresets() {
  const dataRef = useRef(loadData());
  const [version, setVersion] = useState(0);

  function bump() { setVersion(v => v + 1); }

  function getPresets(templateId) {
    return dataRef.current[templateId] || [];
  }

  function savePreset(templateId, name, values) {
    const trimmed = name.trim() || "Preset";
    const presets = getPresets(templateId);
    if (presets.some(p => p.name === trimmed)) return null;
    const id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const next = {
      ...dataRef.current,
      [templateId]: [...presets, { id, name: trimmed, values: sanitizePresetValues(values), createdAt: new Date().toISOString() }]
    };
    dataRef.current = next;
    persistData(next);
    bump();
    return id;
  }

  function updatePreset(templateId, presetId, values) {
    const presets = getPresets(templateId).map(p =>
      p.id === presetId ? { ...p, values: sanitizePresetValues(values) } : p
    );
    const next = { ...dataRef.current, [templateId]: presets };
    dataRef.current = next;
    persistData(next);
    bump();
  }

  function deletePreset(templateId, presetId) {
    const presets = getPresets(templateId).filter(p => p.id !== presetId);
    const next = { ...dataRef.current, [templateId]: presets };
    dataRef.current = next;
    persistData(next);
    bump();
  }

  return { getPresets, savePreset, updatePreset, deletePreset, presetsVersion: version };
}
