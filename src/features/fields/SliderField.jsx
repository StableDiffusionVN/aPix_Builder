import { memo, useCallback } from "react";
import { EditorRange } from "../../components/ImageAdjustmentControls.jsx";
import { useDebouncedCommit } from "../../hooks/useDebouncedCommit.js";
import { FieldInfo } from "./FieldInfo.jsx";
import { fieldPropsAreEqual } from "./fieldMemo.js";

function SliderFieldInner({
  fieldKey,
  label,
  description,
  value,
  minimum,
  maximum,
  step = 1,
  resetValue,
  parseNumber,
  onChange
}) {
  void fieldKey;
  const { localValue, setDebounced, flush } = useDebouncedCommit(value, onChange, 150);

  const handleChange = useCallback((next) => {
    setDebounced(parseNumber(next));
  }, [parseNumber, setDebounced]);

  return (
    <div className="field">
      <EditorRange
        label={label}
        labelExtra={<FieldInfo text={description} />}
        value={localValue}
        min={minimum}
        max={maximum}
        step={step}
        resetValue={resetValue}
        onChange={handleChange}
        onCommit={flush}
      />
    </div>
  );
}

export const SliderField = memo(SliderFieldInner, fieldPropsAreEqual);
