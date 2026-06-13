import { useCallback, useEffect, useRef, useState } from "react";
import { getSetting, setSetting } from "../lib/appSettings.js";

export const SIDEBAR_MIN_WIDTH = 320;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_DEFAULT_WIDTH = 430;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadLayout() {
  try {
    const raw = getSetting("layout.sidebar", {});
    const side = raw.side === "right" ? "right" : "left";
    const width = Number(raw.width);
    return {
      side,
      width: Number.isFinite(width)
        ? clamp(width, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
        : SIDEBAR_DEFAULT_WIDTH
    };
  } catch {
    return { side: "left", width: SIDEBAR_DEFAULT_WIDTH };
  }
}

function clearDragClasses() {
  document.body.classList.remove(
    "sidebar-layout-dragging",
    "sidebar-layout-moving",
    "sidebar-layout-resizing"
  );
}

export function useSidebarLayout() {
  const [layout, setLayout] = useState(loadLayout);
  const layoutRef = useRef(layout);
  const dragRef = useRef(null);

  layoutRef.current = layout;

  useEffect(() => {
    setSetting("layout.sidebar", layout);
  }, [layout]);

  useEffect(() => {
    function onPointerMove(event) {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.type === "move") {
        const side = event.clientX >= window.innerWidth / 2 ? "right" : "left";
        setLayout(current => (current.side === side ? current : { ...current, side }));
        return;
      }

      const delta = event.clientX - drag.startX;
      let nextWidth = drag.startWidth;

      if (drag.side === "left") {
        nextWidth = drag.edge === "end" ? drag.startWidth + delta : drag.startWidth - delta;
      } else {
        nextWidth = drag.edge === "start" ? drag.startWidth - delta : drag.startWidth + delta;
      }

      nextWidth = clamp(nextWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
      setLayout(current => (current.width === nextWidth ? current : { ...current, width: nextWidth }));
    }

    function onPointerUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      clearDragClasses();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      clearDragClasses();
    };
  }, []);

  const startMove = useCallback(event => {
    if (event.button !== 0 || window.matchMedia("(max-width: 1080px)").matches) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { type: "move" };
    document.body.classList.add("sidebar-layout-dragging", "sidebar-layout-moving");
  }, []);

  const startResize = useCallback((event, edge) => {
    if (event.button !== 0 || window.matchMedia("(max-width: 1080px)").matches) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "resize",
      edge,
      side: layoutRef.current.side,
      startX: event.clientX,
      startWidth: layoutRef.current.width
    };
    document.body.classList.add("sidebar-layout-dragging", "sidebar-layout-resizing");
  }, []);

  return {
    side: layout.side,
    width: layout.width,
    startMove,
    startResize
  };
}
