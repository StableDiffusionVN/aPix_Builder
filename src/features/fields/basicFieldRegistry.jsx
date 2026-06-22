import { RefreshCcw } from "lucide-react";
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
import { DropdownField } from "./DropdownField.jsx";
import { SeedField } from "./SeedField.jsx";
import { SliderField } from "./SliderField.jsx";
import { TextField } from "./TextField.jsx";

function tooltipProps(description, extraClass = "") {
  const text = String(description || "").trim();
  const className = ["field", text ? "fieldWithTooltip" : "", extraClass].filter(Boolean).join(" ");
  return text
    ? { className, "data-field-tooltip": text }
    : { className };
}

function choicesSignature(rawChoices, choices) {
  if (choices?.length) {
    return choices.map(choice => `${choice.value}:${choice.label}`).join("|");
  }
  return (rawChoices || []).join("|");
}

const renderers = {
  seed({ item, ui, label, description, value, onChange, t }) {
    return (
      <SeedField
        fieldKey={item?.key || label}
        label={label}
        description={description}
        value={value}
        minimum={ui.minimum ?? 0}
        maximum={ui.maximum}
        step={ui.step ?? 1}
        randomSeedLabel={t("field.randomSeed")}
        onChange={onChange}
        choicesSignature=""
      />
    );
  },
  text({ item, ui, label, description, value, onChange }) {
    return (
      <TextField
        fieldKey={item?.key || label}
        label={label}
        description={description}
        value={value}
        multiline
        rows={ui.lines || 3}
        placeholder={ui.placeholder || ""}
        onChange={onChange}
        choicesSignature=""
      />
    );
  },
  string({ item, ui, label, description, display, value, onChange }) {
    const multiline = display === "multiline" || ui.multiline === true || Number(ui.lines || ui.rows || 1) > 1;
    return (
      <TextField
        fieldKey={item?.key || label}
        label={label}
        description={description}
        value={value}
        multiline={multiline}
        rows={ui.lines || ui.rows || 3}
        placeholder={ui.placeholder || ""}
        onChange={onChange}
        choicesSignature=""
      />
    );
  },
  slider({ item, ui, label, description, value, onChange, parseNumber, resetValue }) {
    return (
      <SliderField
        fieldKey={item?.key || label}
        label={label}
        description={description}
        value={value}
        minimum={ui.minimum}
        maximum={ui.maximum}
        step={ui.step || 1}
        resetValue={resetValue}
        parseNumber={parseNumber}
        onChange={onChange}
        choicesSignature=""
      />
    );
  },
  dropdown(context) {
    const { item, ui, label, description, value, onChange, discovery, discoveryLoading, t } = context;
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
      <DropdownField
        fieldKey={item?.key || label}
        label={label}
        description={description}
        value={value}
        choices={choices}
        selected={selected}
        discoveryLoading={dynamic && discoveryLoading}
        emptyLabel={dynamic ? t("field.noData") : t("field.noChoices")}
        loadingLabel={t("field.scanning")}
        onChange={onChange}
        choicesSignature={choicesSignature(rawChoices, choices)}
      />
    );
  },
  radio({ ui, label, description, value, onChange }) {
    const options = menuChoiceOptions(ui);
    const choices = parseMenuChoices(ui.choices || [], options);
    const selected = resolveMenuStoredValue(value, ui.choices, options);
    return (
      <fieldset {...tooltipProps(description, "radioGroup")}>
        <legend>{label}</legend>
        {choices.map(choice => (
          <label key={choice.value}>
            <input type="radio" checked={selected === choice.value} onChange={() => onChange(choice.value)} />
            {choice.label}
          </label>
        ))}
      </fieldset>
    );
  },
  boolean({ label, description, value, onChange }) {
    return (
      <fieldset {...tooltipProps(description, "booleanField")}>
        <legend>{label}</legend>
        <div className="booleanToggle">
          <button type="button" className={value === true ? "active" : ""} onClick={() => onChange(true)}>True</button>
          <button type="button" className={value === false ? "active" : ""} onClick={() => onChange(false)}>False</button>
        </div>
      </fieldset>
    );
  },
  number({ ui, label, description, value, onChange, parseNumber, resetValue, isAtResetValue, t }) {
    return (
      <label {...tooltipProps(description, "compact")}>
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
      </label>
    );
  },
  colorpicker({ label, description, value, onChange }) {
    return <label {...tooltipProps(description, "compact colorField")}><span>{label}</span><input type="color" value={value || "#10b981"} onChange={event => onChange(event.target.value)} /></label>;
  },
  date({ label, description, value, onChange }) {
    return <label {...tooltipProps(description, "compact")}><span>{label}</span><input type="date" value={value || ""} onChange={event => onChange(event.target.value)} /></label>;
  },
  json({ item, label, description, value, onChange }) {
    return (
      <TextField
        fieldKey={item?.key || label}
        label={label}
        description={description}
        value={value}
        multiline
        rows={5}
        onChange={onChange}
        choicesSignature=""
      />
    );
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
