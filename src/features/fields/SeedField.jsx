import { memo } from "react";
import { RefreshCcw } from "lucide-react";
import { FieldInfo } from "./FieldInfo.jsx";
import { fieldPropsAreEqual } from "./fieldMemo.js";

const RANDOM_SEED_CAP = 2 ** 48;

/** A new random seed inside the field's range (an empty field still means "random each run"). */
export function randomSeedValue(minimum = 0, maximum) {
  const low = Math.max(0, Math.ceil(Number(minimum) || 0));
  const max = Number(maximum);
  const high = Number.isFinite(max) && max > low ? Math.floor(max) : RANDOM_SEED_CAP;
  return low + Math.floor(Math.random() * (Math.min(high, Number.MAX_SAFE_INTEGER) - low + 1));
}

function SeedFieldInner({
  fieldKey,
  label,
  description,
  value,
  minimum = 0,
  maximum,
  step = 1,
  randomSeedLabel,
  newSeedLabel,
  onChange
}) {
  void fieldKey;
  const isRandomSeed = value === "random_seed" || value === "";
  return (
    <label className="field compact">
      <span>{label}<FieldInfo text={description} /></span>
      <div className="inlineControl">
        <input
          type="number"
          min={minimum}
          max={maximum}
          step={step}
          placeholder={isRandomSeed ? randomSeedLabel : ""}
          value={isRandomSeed ? "" : value}
          onChange={event => {
            if (event.target.value === "") return onChange("random_seed");
            const next = Math.max(minimum, Math.trunc(Number(event.target.value)));
            onChange(Number.isFinite(next) ? next : "random_seed");
          }}
        />
        <button type="button" className="fieldResetButton" onClick={() => onChange(randomSeedValue(minimum, maximum))} title={newSeedLabel || randomSeedLabel}>
          <RefreshCcw size={13} />
        </button>
      </div>
    </label>
  );
}

export const SeedField = memo(SeedFieldInner, fieldPropsAreEqual);
