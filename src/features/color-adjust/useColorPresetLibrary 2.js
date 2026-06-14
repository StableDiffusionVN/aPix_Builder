import { useCallback, useEffect, useState } from "react";

export function useColorPresetLibrary(adjustments) {
  const [customPresets, setCustomPresets] = useState([]);
  const [showNewPresetForm, setShowNewPresetForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const savePresets = useCallback((updated) => {
    setCustomPresets(updated);
    fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presets: updated })
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (data.success && Array.isArray(data.presets)) setCustomPresets(data.presets);
      })
      .catch(error => {
        console.error("Failed to sync presets with server", error);
      });
  }, []);

  useEffect(() => {
    fetch("/api/presets")
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (Array.isArray(data?.presets)) setCustomPresets(data.presets);
      })
      .catch(error => {
        console.error("Failed to load presets from server", error);
      });
  }, []);

  const handleCreatePreset = useCallback(() => {
    if (!newPresetName.trim()) return;
    savePresets([...customPresets, {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      adjustments: structuredClone(adjustments)
    }]);
    setShowNewPresetForm(false);
    setNewPresetName("");
  }, [adjustments, customPresets, newPresetName, savePresets]);

  const handleDeletePreset = useCallback((id) => {
    savePresets(customPresets.filter(item => item.id !== id));
  }, [customPresets, savePresets]);

  const handleUpdatePresetSettings = useCallback((id) => {
    savePresets(customPresets.map(item => (
      item.id === id ? { ...item, adjustments: structuredClone(adjustments) } : item
    )));
  }, [adjustments, customPresets, savePresets]);

  const handleSaveRename = useCallback((id) => {
    if (!renameValue.trim()) return;
    savePresets(customPresets.map(item => (
      item.id === id ? { ...item, name: renameValue.trim() } : item
    )));
    setEditingPresetId(null);
  }, [customPresets, renameValue, savePresets]);

  return {
    customPresets,
    showNewPresetForm,
    newPresetName,
    editingPresetId,
    renameValue,
    handleCreatePreset,
    handleDeletePreset,
    handleUpdatePresetSettings,
    handleSaveRename,
    setShowNewPresetForm,
    setNewPresetName,
    setEditingPresetId,
    setRenameValue
  };
}
