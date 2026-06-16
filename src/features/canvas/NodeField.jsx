import { Link2 } from "lucide-react";
import { parseMenuChoices, resolveMenuStoredValue } from "../../../shared/menuChoices.js";
import { portTypeForUi } from "./canvasModel.js";
import { CanvasImageField } from "./CanvasImageField.jsx";

export function NodeField({ port, value, onChange, linked, onContextMenu }) {
  const type = port.type || portTypeForUi(port.uiType);
  const choices = Array.isArray(port.choices) ? port.choices : null;

  if (type === "image") {
    if (linked) {
      return (
        <div className="canvasField" onContextMenu={onContextMenu}>
          <span className="canvasFieldLabel">{port.label}</span>
          <div className="canvasImageLinked">
            <Link2 size={12} /> <span>Liên kết từ node trước</span>
          </div>
        </div>
      );
    }
    return (
      <CanvasImageField
        label={port.label}
        value={value}
        onChange={onChange}
        onContextMenu={onContextMenu}
      />
    );
  }

  if (linked) {
    return (
      <div className="canvasField" onContextMenu={onContextMenu}>
        <span className="canvasFieldLabel">{port.label}</span>
        <div className="canvasImageLinked">
          <Link2 size={12} /> <span>Liên kết từ node trước</span>
        </div>
      </div>
    );
  }

  if (type === "boolean") {
    return (
      <label className="canvasField canvasFieldInline nodrag" onContextMenu={onContextMenu}>
        <input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />
        <span className="canvasFieldLabel">{port.label}</span>
      </label>
    );
  }

  if (type === "number") {
    return (
      <label className="canvasField nodrag" onContextMenu={onContextMenu}>
        <span className="canvasFieldLabel">{port.label}</span>
        <input
          type="number"
          className="canvasInput"
          value={value ?? ""}
          min={port.minimum}
          max={port.maximum}
          step={port.step ?? (String(port.uiType || "").toLowerCase() === "float" ? "any" : 1)}
          onChange={event => onChange(event.target.value === "" ? "" : Number(event.target.value))}
        />
      </label>
    );
  }

  if (choices && choices.length) {
    const menuOptions = { labelSyntax: port.menuLabelSyntax === true };
    const parsedChoices = parseMenuChoices(choices, menuOptions);
    const selectedValue = resolveMenuStoredValue(value, choices, menuOptions);
    return (
      <label className="canvasField nodrag" onContextMenu={onContextMenu}>
        <span className="canvasFieldLabel">{port.label}</span>
        <select className="canvasInput" value={selectedValue} onChange={event => onChange(event.target.value)}>
          {parsedChoices.map(choice => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (type === "text") {
    return (
      <label className="canvasField nodrag" onContextMenu={onContextMenu}>
        <span className="canvasFieldLabel">{port.label}</span>
        <textarea
          className="canvasInput canvasTextarea"
          rows={2}
          value={value ?? ""}
          onChange={event => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="canvasField nodrag" onContextMenu={onContextMenu}>
      <span className="canvasFieldLabel">{port.label}</span>
      <input
        className="canvasInput"
        value={value ?? ""}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}
