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

/** True only when the user is typing text — not for select/button/range shortcuts. */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target.getAttribute("type") || "text").toLowerCase();
  return TEXT_INPUT_TYPES.has(type);
}

export function isUiControlTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "BUTTON" || target.tagName === "SELECT") return true;
  return target.tagName === "INPUT" && target.type === "range";
}

export function releaseGlobalShortcutFocus(target) {
  if (isUiControlTarget(target)) target.blur();
}

export function preventToolbarFocus(event) {
  event.preventDefault();
}
