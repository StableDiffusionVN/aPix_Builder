function nodeChoices(node) {
  const data = node?.fieldData;
  const normalize = choice => {
    if (choice == null) return null;
    if (typeof choice === "object") {
      const label = String(choice.label ?? choice.name ?? choice.value ?? "").trim();
      const value = String(choice.value ?? choice.label ?? choice.name ?? "").trim();
      return label && value ? { label, value } : null;
    }
    const value = String(choice).trim();
    return value ? { label: value, value } : null;
  };
  if (Array.isArray(data)) return data.map(normalize).filter(Boolean);
  for (const key of ["options", "values", "choices"]) {
    if (Array.isArray(data?.[key])) return data[key].map(normalize).filter(Boolean);
  }
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.map(normalize).filter(Boolean);
    } catch {}
  }
  const fallback = normalize(node?.fieldValue);
  return fallback ? [fallback] : [];
}

function shortcutInputKey(node, index) {
  const source = String(node.description || node.nodeName || node.fieldName || `input_${index + 1}`)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${source || "input"}_${node.nodeId}_${index + 1}`;
}

export function buildRunningHubAppShortcutConfig({
  webappId,
  appName,
  nodes = [],
  values = {}
}) {
  const input = {};
  nodes.forEach((node, index) => {
    const fieldType = String(node.fieldType || "").toUpperCase();
    if (fieldType === "AUDIO" || fieldType === "VIDEO") return;
    const choices = nodeChoices(node);
    const menuLabelSyntax = choices.some(choice => choice.label !== choice.value);
    const serializedChoices = choices.map(choice => (
      menuLabelSyntax ? `${choice.label}:${choice.value}` : choice.value
    ));
    const type = fieldType === "IMAGE"
      ? "image"
      : fieldType === "LIST" || choices.length > 1
        ? "menu"
        : fieldType === "INT" || fieldType === "INTEGER"
          ? "int"
          : fieldType === "FLOAT" || fieldType === "NUMBER"
            ? "float"
            : "string";
    const valueKey = `${node.nodeId}|${node.fieldName}`;
    const value = values[valueKey] ?? node.fieldValue ?? "";
    input[shortcutInputKey(node, index)] = {
      id: `${node.nodeId}-${node.fieldName}`,
      ui: {
        type,
        label: String(node.description || node.nodeName || node.fieldName || valueKey),
        ...(serializedChoices.length ? { choices: serializedChoices } : {}),
        ...(menuLabelSyntax ? { menuLabelSyntax: true } : {}),
        ...(type !== "image" ? { value } : {})
      }
    };
  });
  return {
    app: { name: String(appName || "RunningHub App") },
    input,
    runninghub: { webappId: String(webappId || "").trim() }
  };
}
