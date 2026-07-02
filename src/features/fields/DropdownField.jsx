import { memo } from "react";
import { fieldPropsAreEqual } from "./fieldMemo.js";
import { SearchableSelect } from "./SearchableSelect.jsx";

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
      <SearchableSelect
        selected={selected}
        choices={choices}
        disabled={discoveryLoading}
        placeholder={discoveryLoading && !choices.length ? loadingLabel : (!choices.length ? emptyLabel : "")}
        onChange={onChange}
      />
    </label>
  );
}

export const DropdownField = memo(DropdownFieldInner, fieldPropsAreEqual);
