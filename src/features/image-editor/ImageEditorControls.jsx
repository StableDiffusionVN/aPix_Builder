import { useRef } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { clamp, clampCrop } from "../../lib/imageAdjustments.js";
import { preventToolbarFocus } from "../../lib/keyboard.js";
import { useI18n } from "../../i18n/I18nContext.jsx";

export function CropOverlay({ crop, ratio, aspect, onChange, onCommit }) {
  const boxRef = useRef(null);
  const dragRef = useRef(null);
  const minimum = 0.06;
  const left = clampCrop(crop.cropLeft);
  const top = clampCrop(crop.cropTop);
  const right = clampCrop(crop.cropRight);
  const bottom = clampCrop(crop.cropBottom);

  function emit(x0, y0, x1, y1) {
    onChange({
      cropLeft: Math.round(x0 * 100),
      cropTop: Math.round(y0 * 100),
      cropRight: Math.round((1 - x1) * 100),
      cropBottom: Math.round((1 - y1) * 100)
    });
  }

  function onMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / drag.rect.width;
    const dy = (event.clientY - drag.startY) / drag.rect.height;
    let { x0, y0, x1, y1 } = drag;
    const normalizedRatio = ratio ? ratio / aspect : null;
    if (drag.handle === "move") {
      const width = x1 - x0;
      const height = y1 - y0;
      const nextX = clamp(x0 + dx, 0, 1 - width);
      const nextY = clamp(y0 + dy, 0, 1 - height);
      emit(nextX, nextY, nextX + width, nextY + height);
      return;
    }
    const east = drag.handle.includes("e");
    const west = drag.handle.includes("w");
    const south = drag.handle.includes("s");
    const north = drag.handle.includes("n");
    if (east) x1 = clamp(x1 + dx, x0 + minimum, 1);
    if (west) x0 = clamp(x0 + dx, 0, x1 - minimum);
    if (south) y1 = clamp(y1 + dy, y0 + minimum, 1);
    if (north) y0 = clamp(y0 + dy, 0, y1 - minimum);
    if (normalizedRatio) {
      let width = x1 - x0;
      let height = width / normalizedRatio;
      if (north) y0 = clamp(y1 - height, 0, y1 - minimum);
      else y1 = clamp(y0 + height, y0 + minimum, 1);
      height = y1 - y0;
      width = height * normalizedRatio;
      if (west) x0 = clamp(x1 - width, 0, x1 - minimum);
      else if (east) x1 = clamp(x0 + width, x0 + minimum, 1);
      else {
        const center = (x0 + x1) / 2;
        x0 = clamp(center - width / 2, 0, 1);
        x1 = clamp(center + width / 2, 0, 1);
      }
    }
    emit(x0, y0, x1, y1);
  }

  function endDrag() {
    dragRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    onCommit?.();
  }

  function startDrag(handle, event) {
    event.preventDefault();
    event.stopPropagation();
    const container = boxRef.current?.parentElement;
    if (!container) return;
    dragRef.current = {
      handle,
      rect: container.getBoundingClientRect(),
      startX: event.clientX,
      startY: event.clientY,
      x0: left / 100,
      y0: top / 100,
      x1: 1 - right / 100,
      y1: 1 - bottom / 100
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
  }

  const handles = ratio ? ["nw", "ne", "se", "sw"] : ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  return (
    <div className="cropOverlay">
      <div
        ref={boxRef}
        className="cropBox"
        style={{ left: `${left}%`, top: `${top}%`, right: `${right}%`, bottom: `${bottom}%` }}
        onPointerDown={event => startDrag("move", event)}
      >
        <span className="cropThird cropThirdV" style={{ left: "33.33%" }} />
        <span className="cropThird cropThirdV" style={{ left: "66.66%" }} />
        <span className="cropThird cropThirdH" style={{ top: "33.33%" }} />
        <span className="cropThird cropThirdH" style={{ top: "66.66%" }} />
        {handles.map(handle => (
          <span key={handle} className={`cropHandle cropHandle-${handle}`} onPointerDown={event => startDrag(handle, event)} />
        ))}
      </div>
    </div>
  );
}

export function AccordionSection({ icon: Icon, title, open, onToggle, children }) {
  return (
    <div className={`imageEditorAccordion ${open ? "isOpen" : ""}`}>
      <button type="button" className="imageEditorAccordionHeader" onMouseDown={preventToolbarFocus} onClick={onToggle} aria-expanded={open}>
        <span className="imageEditorAccordionTitle"><Icon size={14} /> {title}</span>
        <ChevronDown size={15} className="imageEditorAccordionChevron" />
      </button>
      {open ? <div className="imageEditorAccordionBody">{children}</div> : null}
    </div>
  );
}

export function EditorRange({ label, value, min, max, step = 1, resetValue = 0, onChange, onCommit, onDragStart }) {
  const { t } = useI18n();
  const isDefault = Number(value) === Number(resetValue);
  return (
    <label className="editorRange">
      <span>{label}</span>
      <b>{value}</b>
      <button
        type="button"
        className="editorRangeReset"
        title={t("editor.reset")}
        disabled={isDefault}
        onMouseDown={preventToolbarFocus}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          onChange(resetValue);
          onCommit?.();
        }}
      >
        <RotateCcw size={12} />
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => onDragStart?.()}
        onChange={event => onChange(Number(event.target.value))}
        onMouseUp={event => {
          onCommit?.();
          event.currentTarget.blur();
        }}
        onTouchEnd={event => {
          onCommit?.();
          event.currentTarget.blur();
        }}
        onBlur={onCommit}
      />
    </label>
  );
}
