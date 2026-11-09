// Numeric fields with ui.step: a typed value is rounded to the nearest multiple of the step and kept
// inside minimum / maximum (moving to the nearest multiple inside the range when a bound is not one).
const isSet = bound => bound !== "" && bound !== null && bound !== undefined && Number.isFinite(Number(bound));

export function snapToStep(value, { step, minimum, maximum, integer = false } = {}) {
  if (value === "" || value === null || value === undefined) return value;
  let number = Number(value);
  if (!Number.isFinite(number)) return value;
  const size = Number(step);
  const hasStep = Number.isFinite(size) && size > 0;
  const decimals = hasStep ? Math.min(10, (String(size).split(".")[1] || "").length) : 10;
  const round = n => Number(n.toFixed(decimals));
  if (hasStep) number = round(Math.round(number / size) * size);
  if (isSet(minimum) && number < Number(minimum)) {
    number = hasStep ? round(Math.ceil(Number(minimum) / size - 1e-9) * size) : Number(minimum);
  }
  if (isSet(maximum) && number > Number(maximum)) {
    number = hasStep ? round(Math.floor(Number(maximum) / size + 1e-9) * size) : Number(maximum);
  }
  return integer ? Math.round(number) : number;
}

/** ui → options for snapToStep (only when the template sets a step). */
export function stepOptions(ui = {}) {
  const type = String(ui.type || "").toLowerCase();
  if (!["int", "float", "number", "slider"].includes(type) || !(Number(ui.step) > 0)) return null;
  return { step: ui.step, minimum: ui.minimum, maximum: ui.maximum, integer: type === "int" };
}
