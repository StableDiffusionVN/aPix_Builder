import { memo, useCallback } from "react";
import { useDebouncedCommit } from "../../hooks/useDebouncedCommit.js";
import { fieldPropsAreEqual } from "./fieldMemo.js";

function tooltipProps(description) {
  const text = String(description || "").trim();
  const className = ["field", text ? "fieldWithTooltip" : ""].filter(Boolean).join(" ");
  return text
    ? { className, "data-field-tooltip": text }
    : { className };
}

function TextFieldInner({
  fieldKey,
  label,
  description,
  value,
  multiline = false,
  rows = 3,
  placeholder = "",
  onChange
}) {
  void fieldKey;
  const { localValue, setDebounced, flush } = useDebouncedCommit(value, onChange, 150);

  const handleChange = useCallback((event) => {
    setDebounced(event.target.value);
  }, [setDebounced]);

  return (
    <label {...tooltipProps(description)}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={rows}
          placeholder={placeholder}
          value={localValue}
          onChange={handleChange}
          onBlur={flush}
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={localValue}
          onChange={handleChange}
          onBlur={flush}
        />
      )}
    </label>
  );
}

export const TextField = memo(TextFieldInner, fieldPropsAreEqual);
