import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import "../../styles/fieldInfo.css";

const GAP = 6;
const EDGE = 8;

/**
 * "i" button after a field's title: click to show its description. The popover lives on
 * document.body and is kept inside the window, so panels / scroll areas never clip it.
 */
export function FieldInfo({ text }) {
  const description = String(text || "").trim();
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const place = useCallback(() => {
    const button = buttonRef.current;
    const popover = popoverRef.current;
    if (!button || !popover) return;
    const anchor = button.getBoundingClientRect();
    const { width, height } = popover.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - EDGE));
    const above = anchor.top - height - GAP;
    const top = above >= EDGE ? above : Math.min(anchor.bottom + GAP, window.innerHeight - height - EDGE);
    setPosition({ left, top: Math.max(EDGE, top) });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
    else setPosition(null);
  }, [open, place, description]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => {
      if (!buttonRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = event => {
      if (event.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  if (!description) return null;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`fieldInfoButton nodrag${open ? " isOpen" : ""}`}
        aria-label={description}
        aria-expanded={open}
        onClick={event => {
          // The button sits inside <label>: don't activate the field.
          event.preventDefault();
          event.stopPropagation();
          setOpen(current => !current);
        }}
      >
        <Info size={12} />
      </button>
      {open ? createPortal(
        <div
          ref={popoverRef}
          className="fieldInfoPopover"
          role="tooltip"
          style={position ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: "hidden" }}
        >
          {description}
        </div>,
        document.body
      ) : null}
    </>
  );
}
