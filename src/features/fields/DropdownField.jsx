import { memo } from "react";
import { fieldPropsAreEqual } from "./fieldMemo.js";

function tooltipProps(description) {
  const text = String(description || "").trim();
  const className = ["field", text ? "fieldWithTooltip" : ""].filter(Boolean).join(" ");
  return text
    ? { className, "data-field-tooltip": text }
    : { className };
}

function DropdownFieldInner({
  fieldKey,
  label,
  description,
  selected,
  choices,
  discoveryLoading = false,
  emptyLabel,
  loadingLabel,
  onChange
}) {
  void fieldKey;
  return (
    <label {...tooltipProps(description)}>
      <span>{label}</span>
      <div className="fieldSelectWrap">
        <select value={selected} onChange={event => onChange(event.target.value)} disabled={discoveryLoading}>
          {discoveryLoading && !choices.length ? <option value="">{loadingLabel}</option> : null}
          {!discoveryLoading && !choices.length ? <option value="">{emptyLabel}</option> : null}
          {choices.map(choice => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>
      </div>
    </label>
  );
}

export const DropdownField = memo(DropdownFieldInner, fieldPropsAreEqual);
