import { useState } from "react";
import { Bookmark, BookmarkPlus, Check, RefreshCw, Tag, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

export function PresetBar({ templateId, presets, onLoad, onSave, onUpdate, onDelete, storageWarning = "" }) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [nameError, setNameError] = useState("");

  if (!templateId) return null;

  const selectedPreset = presets.find(p => p.id === selectedId) || null;

  function handleSelect(id) {
    setSelectedId(id);
    if (!id) return;
    const preset = presets.find(p => p.id === id);
    if (preset) onLoad(preset.values);
  }

  function handleSaveClick() {
    setSaveName("");
    setNameError("");
    setSaving(true);
  }

  function handleConfirmSave() {
    const name = saveName.trim() || "Preset";
    const id = onSave(name);
    if (id === null) { setNameError(t("preset.exists", { name })); return; }
    setSelectedId(id);
    setSaving(false);
    setNameError("");
  }

  function handleCancelSave() {
    setSaving(false);
    setNameError("");
  }

  function handleNameChange(e) {
    setSaveName(e.target.value);
    if (nameError) setNameError("");
  }

  function handleSaveKeyDown(event) {
    if (event.key === "Enter") { event.preventDefault(); handleConfirmSave(); }
    if (event.key === "Escape") { event.preventDefault(); handleCancelSave(); }
  }

  return (
    <label className="field">
      <span>Preset</span>
      {saving ? (
        <>
          <div className="presetActRow">
            <div className={`templateSelect presetInputBox ${nameError ? "presetInputError" : ""}`}>
              <Tag size={16} />
              <input
                className="presetInput"
                placeholder={t("preset.name")}
                value={saveName}
                onChange={handleNameChange}
                onKeyDown={handleSaveKeyDown}
                autoFocus
              />
            </div>
            <button type="button" className="templateEditButton presetConfirmBtn" onClick={handleConfirmSave} title={t("preset.confirm")}>
              <Check size={15} />
            </button>
            <button type="button" className="templateEditButton" onClick={handleCancelSave} title={t("common.cancel")}>
              <X size={15} />
            </button>
          </div>
          {nameError ? <span className="presetNameError">{nameError}</span> : null}
        </>
      ) : (
        <div className="presetActRow">
          <div className="templateSelect">
            <Bookmark size={16} />
            <select value={selectedId} onChange={e => handleSelect(e.target.value)}>
              <option value="">{t("preset.none")}</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button type="button" className="templateEditButton" onClick={handleSaveClick} title={t("preset.saveNew")}>
            <BookmarkPlus size={15} />
          </button>
          {selectedPreset ? (
            <>
              <button type="button" className="templateEditButton presetUpdateBtn" onClick={() => onUpdate(selectedId)} title={t("preset.update", { name: selectedPreset.name })}>
                <RefreshCw size={15} />
              </button>
              <button type="button" className="templateEditButton presetDeleteBtn" onClick={() => { onDelete(selectedId); setSelectedId(""); }} title={t("preset.delete")}>
                <Trash2 size={15} />
              </button>
            </>
          ) : null}
        </div>
      )}
      {!saving && storageWarning ? <span className="presetStorageWarning">{storageWarning}</span> : null}
    </label>
  );
}
