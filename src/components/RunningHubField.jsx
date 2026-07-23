import { nodeFieldKey } from "../hooks/useRunningHub";
import { DynamicField } from "./DynamicField";

function listChoices(node) {
  const data = node.fieldData;
  const normalize = choice => {
    if (choice == null) return "";
    if (typeof choice === "object") return String(choice.value ?? choice.label ?? choice.name ?? "");
    return String(choice);
  };
  // ComfyUI COMBO trả tuple [[...options], {config}] — lấy mảng con đầu làm danh sách chọn.
  const fromArray = arr => {
    const list = Array.isArray(arr[0]) ? arr[0] : arr;
    return list.map(normalize).filter(Boolean);
  };
  if (Array.isArray(data)) {
    const choices = fromArray(data);
    if (choices.length) return choices;
  }
  if (Array.isArray(data?.options)) return data.options.map(normalize).filter(Boolean);
  if (Array.isArray(data?.values)) return data.values.map(normalize).filter(Boolean);
  if (Array.isArray(data?.choices)) return data.choices.map(normalize).filter(Boolean);
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        const choices = fromArray(parsed);
        if (choices.length) return choices;
      }
    } catch {}
  }
  return node.fieldValue ? [String(node.fieldValue)] : [];
}

export function RunningHubField({
  node,
  value,
  onChange,
  inputImages = [],
  onRefreshInputImages,
  onUpdateInputImages
}) {
  const fieldType = String(node.fieldType || "").toUpperCase();
  const label = node.description || node.nodeName || node.fieldName;
  const key = nodeFieldKey(node);

  const choices = listChoices(node);
  const isLongText = String(value || "").length > 80 || /prompt|text|caption|value/i.test(node.fieldName);
  const uiType =
    fieldType === "IMAGE" ? "image_mask"
    : fieldType === "AUDIO" ? "audio"
    : fieldType === "VIDEO" ? "video"
    : fieldType === "LIST" ? "dropdown"
    : fieldType === "INT" || fieldType === "INTEGER" ? "int"
    : fieldType === "FLOAT" || fieldType === "NUMBER" ? "float"
    : isLongText ? "text"
    : "string";

  const item = {
    key,
    id: key,
    ui: {
      type: uiType,
      label,
      choices,
      lines: isLongText ? 4 : undefined
    }
  };

  return (
    <div className="rhFieldWrap">
      <DynamicField
        item={item}
        value={value ?? ""}
        onChange={onChange}
        inputImages={inputImages}
        onRefreshInputImages={onRefreshInputImages}
        onUpdateInputImages={onUpdateInputImages}
      />
    </div>
  );
}
