import { RefreshCcw } from "lucide-react";
import { EditorRange } from "../../components/ImageAdjustmentControls.jsx";
import {
  canonicalDynamicType,
  dynamicFieldChoices,
  isDynamicFieldType
} from "../../lib/dynamicTypes.js";
import {
  menuChoiceOptions,
  parseMenuChoices,
  resolveMenuStoredValue
} from "../../../shared/menuChoices.js";

function descriptionNode(description) {
  return description ? <small className="fieldDescription">{description}</small> : null;
}

const renderers = {
  seed({ ui, label, value, onChange, t }) {
    const isRandomSeed = value === "random_seed" || value === "";
    return (
      <label className="field compact">
        <span>{label}</span>
        <div className="inlineControl">
          <input
            type="number"
            min={ui.minimum ?? 0}
            max={ui.maximum}
            step={ui.step ?? 1}
            placeholder={isRandomSeed ? t("field.randomSeed") : ""}
            value={isRandomSeed ? "" : value}
            onChange={event => {
              if (event.target.value === "") return onChange("random_seed");
              const next = Math.max(ui.minimum ?? 0, Math.trunc(Number(event.target.value)));
              onChange(Number.isFinite(next) ? next : "random_seed");
            }}
          />
          <button type="button" className="fieldResetButton" onClick={() => onChange("random_seed")} title={t("field.randomSeed")}>
            <RefreshCcw size={13} />
          </button>
        </div>
      </label>
    );
  },
  text({ ui, label, description, value, onChange }) {
    return (
      <label className="field">
        <span>{label}</span>
        <textarea rows={ui.lines || 3} placeholder={ui.placeholder || ""} value={value} onChange={event => onChange(event.target.value)} />
        {descriptionNode(description)}
      </label>
    );
  },
  string({ ui, label, description, display, value, onChange }) {
    const multiline = display === "multiline" || ui.multiline === true || Number(ui.lines || ui.rows || 1) > 1;
    return (
      <label className="field">
        <span>{label}</span>
        {multiline
          ? <textarea rows={ui.lines || ui.rows || 3} placeholder={ui.placeholder || ""} value={value} onChange={event => onChange(event.target.value)} />
          : <input type="text" placeholder={ui.placeholder || ""} value={value} onChange={event => onChange(event.target.value)} />}
        {descriptionNode(description)}
      </label>
    );
  },
  slider({ ui, label, description, value, onChange, parseNumber, resetValue }) {
    return (
      <div className="field">
        <EditorRange
          label={label}
          value={value}
          min={ui.minimum}
          max={ui.maximum}
          step={ui.step || 1}
          resetValue={resetValue}
          onChange={next => onChange(parseNumber(next))}
        />
        {descriptionNode(description)}
      </div>
    );
  },
  dropdown(context) {
    const { ui, label, description, value, onChange, discovery, discoveryLoading, t } = context;
    const dynamicKind = canonicalDynamicType(ui.type);
    const dynamic = isDynamicFieldType(ui.type);
    const rawChoices = dynamic ? dynamicFieldChoices(discovery, dynamicKind) : ui.choices || [];
    const options = menuChoiceOptions(ui);
    const choices = dynamic
      ? rawChoices.map(choice => ({ label: choice, value: choice }))
      : parseMenuChoices(rawChoices, options);
    const selected = dynamic
      ? (rawChoices.includes(value) ? value : "")
      : resolveMenuStoredValue(value, rawChoices, options);
    return (
      <label className="field">
        <span>{label}</span>
        <div className="fieldSelectWrap">
          <select value={selected} onChange={event => onChange(event.target.value)} disabled={dynamic && discoveryLoading}>
            {dynamic && !rawChoices.length ? <option value="">{discoveryLoading ? t("field.scanning") : t("field.noData")}</option> : null}
            {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
        </div>
        {descriptionNode(description)}
      </label>
    );
  },
  radio({ ui, label, description, value, onChange }) {
    const options = menuChoiceOptions(ui);
    const choices = parseMenuChoices(ui.choices || [], options);
    const selected = resolveMenuStoredValue(value, ui.choices, options);
    return (
      <fieldset className="field radioGroup">
        <legend>{label}</legend>
        {choices.map(choice => (
          <label key={choice.value}>
            <input type="radio" checked={selected === choice.value} onChange={() => onChange(choice.value)} />
            {choice.label}
          </label>
        ))}
        {descriptionNode(description)}
      </fieldset>
    );
  },
  boolean({ label, description, value, onChange }) {
    return (
      <fieldset className="field booleanField">
        <legend>{label}</legend>
        <div className="booleanToggle">
          <button type="button" className={value === true ? "active" : ""} onClick={() => onChange(true)}>True</button>
          <button type="button" className={value === false ? "active" : ""} onClick={() => onChange(false)}>False</button>
        </div>
        {descriptionNode(description)}
      </fieldset>
    );
  },
  number({ ui, label, description, value, onChange, parseNumber, resetValue, isAtResetValue, t }) {
    return (
      <label className="field compact">
        <span>{label}</span>
        <div className="inlineControl">
          <input
            type="number"
            min={ui.minimum}
            max={ui.maximum}
            step={ui.step || (ui.type === "float" ? 0.1 : 1)}
            value={value}
            onChange={event => onChange(parseNumber(event.target.value))}
          />
          <button type="button" className="fieldResetButton" onClick={() => onChange(resetValue)} disabled={isAtResetValue} title={t("field.reset")}>
            <RefreshCcw size={13} />
          </button>
        </div>
        {descriptionNode(description)}
      </label>
    );
  },
  colorpicker({ label, description, value, onChange }) {
    return <label className="field compact colorField"><span>{label}</span><input type="color" value={value || "#10b981"} onChange={event => onChange(event.target.value)} />{descriptionNode(description)}</label>;
  },
  date({ label, description, value, onChange }) {
    return <label className="field compact"><span>{label}</span><input type="date" value={value || ""} onChange={event => onChange(event.target.value)} />{descriptionNode(description)}</label>;
  },
  json({ label, description, value, onChange }) {
    return <label className="field"><span>{label}</span><textarea rows={5} value={value} onChange={event => onChange(event.target.value)} />{descriptionNode(description)}</label>;
  }
};

export function resolveBasicFieldKind(ui, display) {
  if (ui.type === "seed" || ui.type === "text" || ui.type === "string") return ui.type;
  if (ui.type === "slider" || (["number", "int", "float"].includes(ui.type) && display === "slider")) return "slider";
  if (ui.type === "dropdown" || ui.type === "menu" || isDynamicFieldType(ui.type)) return "dropdown";
  if (ui.type === "radio") return "radio";
  if (ui.type === "checkbox" || ui.type === "boolean") return "boolean";
  if (["number", "int", "float"].includes(ui.type)) return "number";
  if (ui.type === "colorpicker" || ui.type === "date" || ui.type === "json") return ui.type;
  return "";
}

export function renderBasicField(context) {
  const kind = resolveBasicFieldKind(context.ui, context.display);
  return kind ? renderers[kind](context) : null;
}
