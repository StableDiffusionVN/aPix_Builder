import { useEffect, useMemo } from "react";
import { Link2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { parseMenuChoices, resolveMenuStoredValue } from "../../../shared/menuChoices.js";
import { canonicalDynamicType, dynamicFieldChoices } from "../../lib/dynamicTypes.js";
import { SearchableSelect } from "../fields/SearchableSelect.jsx";
import { portTypeForUi } from "./canvasModel.js";
import { CanvasImageField } from "./CanvasImageField.jsx";
import { useCanvasActions } from "./canvasContext.js";

export function NodeField({ port, value, onChange, linked, onContextMenu }) {
  const { t } = useI18n();
  const { discovery } = useCanvasActions();
  const type = port.type || portTypeForUi(port.uiType);
  const staticChoices = Array.isArray(port.choices) && port.choices.length ? port.choices : null;
  // Field dynamic (checkpoints/loras/vae/samplers…) không có choices tĩnh → lấy danh sách từ discovery ComfyUI.
  const dynamicKind = staticChoices ? "" : canonicalDynamicType(port.uiType);
  const dynamicList = useMemo(
    () => (dynamicKind ? dynamicFieldChoices(discovery, dynamicKind) : []),
    [dynamicKind, discovery]
  );
  const choices = staticChoices || (dynamicList.length ? dynamicList : null);

  useEffect(() => {
    if (!dynamicKind || !dynamicList.length || linked) return;
    if (!dynamicList.includes(value)) onChange(dynamicList[0]);
  }, [dynamicKind, dynamicList, value, linked, onChange]);

  if (type === "image") {
    if (linked) {
      return (
        <div className="canvasField" onContextMenu={onContextMenu}>
          <span className="canvasFieldLabel">{port.label}</span>
          <div className="canvasImageLinked">
            <Link2 size={12} /> <span>{t("canvas.node.linked")}</span>
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
          <Link2 size={12} /> <span>{t("canvas.node.linked")}</span>
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
        <SearchableSelect selected={selectedValue} choices={parsedChoices} onChange={onChange} />
      </label>
    );
  }

  if (type === "text") {
    return (
      <label className="canvasField nodrag" onContextMenu={onContextMenu}>
        <span className="canvasFieldLabel">{port.label}</span>
        <textarea
          className="canvasInput canvasTextarea nowheel"
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
