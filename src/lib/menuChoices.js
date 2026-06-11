/** Parse one menu choice: "Label:value" when labelSyntax is on, else plain. */
export function parseMenuChoice(choice, options = {}) {
  const raw = String(choice ?? "").trim();
  if (!raw) return null;
  if (options.labelSyntax !== true) {
    return { label: raw, value: raw, raw };
  }
  const colonIndex = raw.indexOf(":");
  if (colonIndex > 0) {
    const label = raw.slice(0, colonIndex).trim();
    const value = raw.slice(colonIndex + 1).trim();
    if (label && value) return { label, value, raw };
  }
  return { label: raw, value: raw, raw };
}

export function parseMenuChoices(choices = [], options = {}) {
  return (Array.isArray(choices) ? choices : [])
    .map(choice => parseMenuChoice(choice, options))
    .filter(Boolean);
}

export function menuChoiceValue(choice, options = {}) {
  return parseMenuChoice(choice, options)?.value ?? String(choice ?? "").trim();
}

export function menuLabelSyntaxEnabled(source) {
  if (typeof source === "boolean") return source;
  return source?.menuLabelSyntax === true;
}

export function menuChoiceOptions(source) {
  return { labelSyntax: menuLabelSyntaxEnabled(source) };
}

export function resolveMenuStoredValue(storedValue, choices = [], options = {}) {
  const parsed = parseMenuChoices(choices, options);
  if (!parsed.length) return storedValue ?? "";
  if (storedValue == null || storedValue === "") return parsed[0].value;
  if (parsed.some(item => item.value === storedValue)) return storedValue;
  const byRaw = parsed.find(item => item.raw === storedValue);
  if (byRaw) return byRaw.value;
  const byLabel = parsed.find(item => item.label === storedValue);
  if (byLabel) return byLabel.value;
  return storedValue;
}

/** Find menu-sub children; sub keys may be API value or legacy raw choice line. */
export function lookupMenuSubFields(sub = {}, menuValue, choices = [], options = {}) {
  if (!sub || typeof sub !== "object") return {};
  if (sub[menuValue]) return sub[menuValue];
  const parsed = parseMenuChoices(choices, options);
  const match = parsed.find(item => item.value === menuValue || item.raw === menuValue);
  if (match?.value && sub[match.value]) return sub[match.value];
  if (match?.raw && sub[match.raw]) return sub[match.raw];
  return {};
}
