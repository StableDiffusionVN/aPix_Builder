import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";

function sanitizePresetValues(values) {
  const result = {};
  for (const [key, value] of Object.entries(values || {})) {
    if (typeof value === "string" && (value.startsWith("data:") || value.length > 200000)) continue;
    if (Array.isArray(value) && value.some(item => (
      typeof item === "string" && item.startsWith("data:")
      || item && typeof item === "object" && (item.kind === "upload" || item.kind === "input-image")
    ))) continue;
    if (value && typeof value === "object" && (value.kind === "upload" || value.kind === "input-image")) continue;
    result[key] = value;
  }
  return result;
}

async function fetchWorkflowPresets() {
  const response = await fetch("/api/workflow-presets");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return typeof data.presets === "object" && data.presets !== null && !Array.isArray(data.presets)
    ? data.presets
    : {};
}

async function persistWorkflowPresets(presets) {
  const response = await fetch("/api/workflow-presets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ presets })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export function usePresets() {
  const { t } = useI18n();
  const dataRef = useRef({});
  const persistQueueRef = useRef(Promise.resolve());
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");

  const bump = useCallback(() => {
    setVersion(v => v + 1);
  }, []);

  const queuePersist = useCallback((next) => {
    dataRef.current = next;
    persistQueueRef.current = persistQueueRef.current
      .catch(() => {})
      .then(async () => {
        await persistWorkflowPresets(next);
        setStorageWarning("");
      })
      .catch(error => {
        console.error("Failed to save workflow presets to server:", error);
        setStorageWarning(t("preset.noApi"));
      });
    bump();
  }, [bump, t]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let presets = {};

      try {
        presets = await fetchWorkflowPresets();
      } catch (error) {
        console.error("Failed to load workflow presets from server:", error);
        setStorageWarning(t("preset.noApi"));
      }

      if (!cancelled) {
        dataRef.current = presets;
        setReady(true);
        bump();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bump, t]);

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
      [templateId]: [...presets, {
        id,
        name: trimmed,
        values: sanitizePresetValues(values),
        createdAt: new Date().toISOString()
      }]
    };
    queuePersist(next);
    return id;
  }

  function updatePreset(templateId, presetId, values) {
    const presets = getPresets(templateId).map(p =>
      p.id === presetId ? { ...p, values: sanitizePresetValues(values) } : p
    );
    queuePersist({ ...dataRef.current, [templateId]: presets });
  }

  function deletePreset(templateId, presetId) {
    const presets = getPresets(templateId).filter(p => p.id !== presetId);
    queuePersist({ ...dataRef.current, [templateId]: presets });
  }

  return {
    getPresets,
    savePreset,
    updatePreset,
    deletePreset,
    presetsVersion: version,
    presetsReady: ready,
    presetsStorageWarning: storageWarning
  };
}
