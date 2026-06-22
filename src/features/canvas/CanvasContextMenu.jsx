import { useEffect } from "react";
import { createPortal } from "react-dom";

export function CanvasContextMenu({ menu, onClose }) {
  useEffect(() => {
    if (!menu) return undefined;

    function handlePointerDown(event) {
      if (event.target instanceof Element && event.target.closest(".canvasContextMenu")) return;
      onClose?.();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <div
      className="canvasContextMenu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      onContextMenu={event => event.preventDefault()}
    >
      {menu.items.map(item => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`canvasContextMenuItem${item.danger ? " danger" : ""}`}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onClick?.();
            onClose?.();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
