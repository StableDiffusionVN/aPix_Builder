import { useCallback, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { exportCameraRawPreset, importCameraRawPreset } from "../../lib/cameraRawPresets.js";
import { XMP_MAX_BYTES } from "../../../shared/cameraRawXmp.js";

function downloadText(text, fileName) {
  const blob = new Blob([text], { type: "application/rdf+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeFileName = name => `${String(name || "aPix preset").replace(/[\\/:*?"<>|]+/g, "").trim() || "aPix preset"}.xmp`;

/**
 * Import .xmp presets (Lightroom / Camera Raw) into the custom library and export
 * the current look as an .xmp Lightroom can import.
 */
export function useCameraRawPresetIO({ adjustments, allPresets, activePresetId, customPresets, addPresets, onApply }) {
  const { t } = useI18n();
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const importFiles = useCallback(async (fileList) => {
    const files = [...(fileList || [])].filter(file => /\.xmp$/i.test(file.name));
    if (!files.length) return;
    setBusy(true);
    const imported = [];
    const failed = [];
    const stamp = Date.now();
    for (const [index, file] of files.entries()) {
      try {
        if (file.size > XMP_MAX_BYTES) throw new Error("too large");
        const preset = importCameraRawPreset(await file.text(), file.name);
        const duplicate = customPresets.some(item => item.name === preset.name
          && JSON.stringify(item.adjustments) === JSON.stringify(preset.adjustments));
        if (!duplicate) imported.push({ id: `custom_xmp_${stamp}_${index}`, ...preset });
      } catch {
        failed.push(file.name);
      }
    }
    if (imported.length) addPresets(imported);
    if (imported.length === 1) onApply(imported[0]);
    setMessage({
      error: failed.length > 0 && !imported.length,
      text: t("editor.xmpImported", { count: imported.length })
        + (failed.length ? ` ${t("editor.xmpFailed", { files: failed.join(", ") })}` : "")
    });
    setBusy(false);
  }, [addPresets, customPresets, onApply, t]);

  const exportCurrent = useCallback(() => {
    const active = allPresets.find(item => item.id === activePresetId);
    const name = active?.name || "aPix look";
    const { text, unsupported } = exportCameraRawPreset({ name, adjustments, cameraRaw: active?.cameraRaw });
    downloadText(text, safeFileName(name));
    setMessage(unsupported.length
      ? { error: false, text: t("editor.xmpExportSkipped", { items: unsupported.join(", ") }) }
      : null);
  }, [activePresetId, adjustments, allPresets, t]);

  return { importFiles, exportCurrent, busy, message };
}

export function CameraRawPresetActions({ io }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  return (
    <div className="xmpPresetActions">
      <div className="lutActions">
        <button type="button" className="lutActionBtn" disabled={io.busy} onClick={() => inputRef.current?.click()}>
          {t("editor.xmpImport")}
        </button>
        <button type="button" className="lutActionBtn" onClick={io.exportCurrent} title={t("editor.xmpExportHint")}>
          {t("editor.xmpExport")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xmp"
          multiple
          hidden
          onChange={event => {
            const files = [...(event.target.files || [])];
            event.target.value = "";
            io.importFiles(files);
          }}
        />
      </div>
      {io.message ? <p className={io.message.error ? "lutError" : "lutHint"}>{io.message.text}</p> : null}
    </div>
  );
}
