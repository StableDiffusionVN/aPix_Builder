import { memo } from "react";
import { fieldPropsAreEqual } from "./fieldMemo.js";
import { FieldInfo } from "./FieldInfo.jsx";
import { SearchableSelect } from "./SearchableSelect.jsx";

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
    <label className="field">
      <span>{label}<FieldInfo text={description} /></span>
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
