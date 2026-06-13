import { Pipette } from "lucide-react";
import { preventToolbarFocus } from "../lib/keyboard";

export function ColorPickCursorOverlay({ x, y }) {
  if (x == null || y == null) return null;
  return (
    <div className="colorPickCursorIcon" style={{ left: x, top: y }} aria-hidden="true">
      <Pipette size={18} strokeWidth={3.2} className="colorPickCursorOutline" />
      <Pipette size={18} strokeWidth={1.85} className="colorPickCursorInner" />
    </div>
  );
}

export function ColorPickButton({ active, title, onClick }) {
  return (
    <button
      type="button"
      className={`colorPickBtn${active ? " active" : ""}`}
      onMouseDown={preventToolbarFocus}
      onClick={onClick}
      title={title}
      aria-pressed={active}
      aria-label={title}
    >
      <Pipette size={13} />
    </button>
  );
}
