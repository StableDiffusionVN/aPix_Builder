import { useCallback, useEffect, useRef, useState } from "react";

const PRESETS_KEY = "comfyui-build:presets:v1";

function loadLegacyLocalStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESETS_KEY) || "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLegacyLocalStorage(presets) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error("Failed to save workflow presets to localStorage:", error);
  }
}

function hasPresetData(presets) {
  return Object.keys(presets).some(key => Array.isArray(presets[key]) && presets[key].length > 0);
}

function mergePresetStores(primary, secondary) {
  const merged = { ...primary };
  for (const [templateId, list] of Object.entries(secondary || {})) {
    if (!Array.isArray(list) || !list.length) continue;
    const existing = merged[templateId] || [];
    const seen = new Set(existing.map(p => p.id));
    const extras = list.filter(p => p?.id && !seen.has(p.id));
    if (extras.length) merged[templateId] = [...existing, ...extras];
  }
  return merged;
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
  const dataRef = useRef({});
  const persistQueueRef = useRef(Promise.resolve());
  const serverAvailableRef = useRef(false);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");

  const bump = useCallback(() => {
    setVersion(v => v + 1);
  }, []);

  const queuePersist = useCallback((next) => {
    dataRef.current = next;
    writeLegacyLocalStorage(next);
    persistQueueRef.current = persistQueueRef.current
      .catch(() => {})
      .then(async () => {
        if (!serverAvailableRef.current) return;
        await persistWorkflowPresets(next);
        setStorageWarning("");
      })
      .catch(error => {
        console.error("Failed to save workflow presets to server:", error);
        setStorageWarning("Preset đang lưu cục bộ trên trình duyệt — restart server để đồng bộ file.");
      });
    bump();
  }, [bump]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const legacy = loadLegacyLocalStorage();
      let presets = legacy;
      let serverOk = false;

      try {
        const serverPresets = await fetchWorkflowPresets();
        serverOk = true;
        presets = mergePresetStores(serverPresets, legacy);

        if (hasPresetData(presets) && JSON.stringify(presets) !== JSON.stringify(serverPresets)) {
          await persistWorkflowPresets(presets);
        }
      } catch (error) {
        console.error("Failed to load workflow presets from server:", error);
        presets = legacy;
        if (hasPresetData(legacy)) {
          setStorageWarning("Không kết nối API preset — dùng bản sao localStorage. Restart server để đồng bộ file.");
        } else if (error.message?.includes("404")) {
          setStorageWarning("Server chưa có API workflow-presets — restart server với code mới nhất.");
        }
      }

      if (!cancelled) {
        serverAvailableRef.current = serverOk;
        dataRef.current = presets;
        if (hasPresetData(presets)) writeLegacyLocalStorage(presets);
        setReady(true);
        bump();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bump]);

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
