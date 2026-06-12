const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number"
]);

export function isTextEntryTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target.getAttribute("type") || "text").toLowerCase();
  return TEXT_INPUT_TYPES.has(type);
}

export function isUiControlTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "BUTTON") return true;
  return target.tagName === "INPUT" && target.type === "range";
}

export function preventToolbarFocus(event) {
  event.preventDefault();
}
