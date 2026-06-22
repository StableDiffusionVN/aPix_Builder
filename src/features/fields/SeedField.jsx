import { memo } from "react";
import { RefreshCcw } from "lucide-react";
import { fieldPropsAreEqual } from "./fieldMemo.js";

function tooltipProps(description, extraClass = "") {
  const text = String(description || "").trim();
  const className = ["field", text ? "fieldWithTooltip" : "", extraClass].filter(Boolean).join(" ");
  return text
    ? { className, "data-field-tooltip": text }
    : { className };
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
  onChange
}) {
  void fieldKey;
  const isRandomSeed = value === "random_seed" || value === "";
  return (
    <label {...tooltipProps(description, "compact")}>
      <span>{label}</span>
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
        <button type="button" className="fieldResetButton" onClick={() => onChange("random_seed")} title={randomSeedLabel}>
          <RefreshCcw size={13} />
        </button>
      </div>
    </label>
  );
}

export const SeedField = memo(SeedFieldInner, fieldPropsAreEqual);
