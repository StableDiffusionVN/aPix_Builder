import { useRef } from "react";
import { Aperture, Film, Palette } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { AccordionSection, EditorRange } from "../image-editor/ImageEditorControls.jsx";
import { GRADING_ZONES, normalizeCalibration, PRESET_AMOUNT_MAX } from "../../lib/imageAdjustments.js";
import "../../styles/colorExtras.css";

const ZONE_LABELS = { shadows: "Shadows", midtones: "Midtones", highlights: "Highlights" };

export function PresetAmountRange({ extras, onDragStart, onCommit }) {
  if (extras.presetAmount === null) return null;
  return (
    <div className="presetAmountRow">
      <EditorRange
        label="Amount (%)"
        value={extras.presetAmount}
        min={0}
        max={PRESET_AMOUNT_MAX}
        resetValue={100}
        onChange={extras.setPresetAmount}
        onDragStart={onDragStart}
        onCommit={onCommit}
      />
    </div>
  );
}

export function ColorGradingSection({ extras, open, onToggle, onDragStart, onCommit }) {
  const { grading, updateGrading } = extras;
  return (
    <AccordionSection icon={Palette} title="Color Grading" open={open} onToggle={onToggle}>
      {GRADING_ZONES.map(zone => (
        <div key={zone} className="gradingZone">
          <div className="gradingZoneHeader">
            <span
              className="gradingSwatch"
              style={{ background: `hsl(${grading[zone].h} ${Math.max(grading[zone].s, 6)}% 50%)` }}
            />
            <span>{ZONE_LABELS[zone]}</span>
          </div>
          <div className="gradingHueRange">
            <EditorRange label="Hue" value={grading[zone].h} min={0} max={360} onChange={value => updateGrading(zone, "h", value)} onDragStart={onDragStart} onCommit={onCommit} />
          </div>
          <EditorRange label="Saturation" value={grading[zone].s} min={0} max={100} onChange={value => updateGrading(zone, "s", value)} onDragStart={onDragStart} onCommit={onCommit} />
        </div>
      ))}
      <EditorRange label="Balance" value={grading.balance} min={-100} max={100} onChange={value => updateGrading("balance", null, value)} onDragStart={onDragStart} onCommit={onCommit} />
    </AccordionSection>
  );
}

const CALIBRATION_ROWS = [
  ["shadowTint", "Shadows Tint"],
  ["redHue", "Red Primary · Hue"],
  ["redSaturation", "Red Primary · Saturation"],
  ["greenHue", "Green Primary · Hue"],
  ["greenSaturation", "Green Primary · Saturation"],
  ["blueHue", "Blue Primary · Hue"],
  ["blueSaturation", "Blue Primary · Saturation"]
];

// Lightroom-style Calibration (RGB primaries), used by most film presets.
export function CalibrationSection({ adjustments, setAdjustments, open, onToggle, onDragStart, onCommit }) {
  const { t } = useI18n();
  const calibration = normalizeCalibration(adjustments.calibration);
  return (
    <AccordionSection icon={Aperture} title={t("editor.calibration")} open={open} onToggle={onToggle}>
      {CALIBRATION_ROWS.map(([key, label]) => (
        <EditorRange
          key={key}
          label={label}
          value={calibration[key]}
          min={-100}
          max={100}
          onChange={value => setAdjustments(current => ({
            ...current,
            calibration: { ...normalizeCalibration(current.calibration), [key]: value }
          }))}
          onDragStart={onDragStart}
          onCommit={onCommit}
        />
      ))}
    </AccordionSection>
  );
}

export function LutSection({ extras, adjustments, open, onToggle, onDragStart, onCommit }) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const activeLut = adjustments.lut;
  const missing = activeLut && !extras.luts.some(item => item.id === activeLut.id);

  return (
    <AccordionSection icon={Film} title="LUT" open={open} onToggle={onToggle}>
      <label className="field compact presetSelectField">
        <span>{t("editor.lutSelect")}</span>
        <select
          value={activeLut?.id || ""}
          onChange={event => {
            const item = extras.luts.find(lut => lut.id === event.target.value) || null;
            extras.selectLut(item);
          }}
        >
          <option value="">{t("editor.lutNone")}</option>
          {missing ? <option value={activeLut.id}>{activeLut.name} ({t("editor.lutMissing")})</option> : null}
          {extras.luts.map(item => (
            <option key={item.id} value={item.id}>{item.name} · {item.size}³</option>
          ))}
        </select>
      </label>

      {activeLut ? (
        <EditorRange
          label="Amount (%)"
          value={activeLut.amount ?? 100}
          min={0}
          max={100}
          resetValue={100}
          onChange={extras.updateLutAmount}
          onDragStart={onDragStart}
          onCommit={onCommit}
        />
      ) : null}

      <div className="lutActions">
        <button
          type="button"
          className="lutActionBtn"
          disabled={extras.lutBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {extras.lutBusy ? t("editor.lutImporting") : t("editor.lutImport")}
        </button>
        {activeLut && !missing ? (
          <button
            type="button"
            className="lutActionBtn danger"
            title={t("editor.lutDeleteHint")}
            onClick={() => extras.deleteLut(activeLut.id)}
          >
            {t("editor.lutDelete")}
          </button>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept=".cube"
          hidden
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            extras.importLutFile(file);
          }}
        />
      </div>
      {extras.lutError ? <p className="lutError">{extras.lutError}</p> : null}

      <button type="button" className="saveNewPresetBtn" onClick={() => extras.exportCube()}>
        {t("editor.lutExport")}
      </button>
      <p className="lutHint">{t("editor.lutExportHint")}</p>
    </AccordionSection>
  );
}
