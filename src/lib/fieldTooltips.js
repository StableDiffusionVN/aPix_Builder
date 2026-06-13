const POINTER_HEIGHT = 6;
const EDGE_INSET = 8;
const IDLE_DELAY_MS = 700;
const MOVE_THRESHOLD_PX = 2;

/** @type {WeakMap<HTMLElement, { lastX: number, lastY: number, timer: ReturnType<typeof setTimeout> | null }>} */
const fieldState = new WeakMap();

function updateFieldTooltipPointer(field, clientX, clientY) {
  const rect = field.getBoundingClientRect();
  const x = Math.max(EDGE_INSET, Math.min(clientX - rect.left, rect.width - EDGE_INSET));
  const y = Math.max(EDGE_INSET, Math.min(clientY - rect.top, rect.height - POINTER_HEIGHT));
  field.style.setProperty("--tooltip-pointer-x", `${x}px`);
  field.style.setProperty("--tooltip-pointer-y", `${y}px`);
}

function hideFieldTooltip(field) {
  field.classList.remove("isTooltipVisible");
}

function showFieldTooltip(field) {
  field.classList.add("isTooltipVisible");
}

function clearIdleTimer(field) {
  const state = fieldState.get(field);
  if (!state?.timer) return;
  clearTimeout(state.timer);
  state.timer = null;
}

function scheduleIdleShow(field) {
  clearIdleTimer(field);
  const state = fieldState.get(field);
  if (!state) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    showFieldTooltip(field);
  }, IDLE_DELAY_MS);
}

function beginFieldTooltip(field, clientX, clientY) {
  fieldState.set(field, { lastX: clientX, lastY: clientY, timer: null });
  updateFieldTooltipPointer(field, clientX, clientY);
  hideFieldTooltip(field);
  scheduleIdleShow(field);
}

function trackFieldTooltipMove(field, clientX, clientY) {
  let state = fieldState.get(field);
  if (!state) {
    beginFieldTooltip(field, clientX, clientY);
    return;
  }

  const movedX = Math.abs(clientX - state.lastX);
  const movedY = Math.abs(clientY - state.lastY);
  if (movedX < MOVE_THRESHOLD_PX && movedY < MOVE_THRESHOLD_PX) return;

  state.lastX = clientX;
  state.lastY = clientY;
  updateFieldTooltipPointer(field, clientX, clientY);
  hideFieldTooltip(field);
  scheduleIdleShow(field);
}

function endFieldTooltip(field) {
  clearIdleTimer(field);
  fieldState.delete(field);
  hideFieldTooltip(field);
}

export function initFieldTooltips() {
  if (typeof document === "undefined") return;

  document.addEventListener("pointerover", event => {
    const field = event.target.closest?.(".fieldWithTooltip");
    if (!(field instanceof HTMLElement)) return;
    if (field.contains(event.relatedTarget)) return;
    beginFieldTooltip(field, event.clientX, event.clientY);
  }, { passive: true });

  document.addEventListener("pointermove", event => {
    const field = event.target.closest?.(".fieldWithTooltip");
    if (!(field instanceof HTMLElement)) return;
    trackFieldTooltipMove(field, event.clientX, event.clientY);
  }, { passive: true });

  document.addEventListener("pointerout", event => {
    const field = event.target.closest?.(".fieldWithTooltip");
    if (!(field instanceof HTMLElement)) return;
    if (field.contains(event.relatedTarget)) return;
    endFieldTooltip(field);
  }, { passive: true });
}
