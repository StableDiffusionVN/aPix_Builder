import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_DELAY_MS = 220;
const MOVE_TOLERANCE_PX = 5;

/**
 * Press-and-hold without moving → `holding` is true until release (Lightroom-style
 * "show original"). Moving past a few pixels cancels, so drag-to-pan keeps working.
 */
export function usePressHold({ enabled = true, delay = HOLD_DELAY_MS } = {}) {
  const [holding, setHolding] = useState(false);
  const pressRef = useRef(null);

  const clear = useCallback(() => {
    if (pressRef.current) clearTimeout(pressRef.current.timer);
    pressRef.current = null;
    setHolding(false);
  }, []);

  useEffect(() => clear, [clear]);
  useEffect(() => {
    if (!enabled) clear();
  }, [clear, enabled]);

  const begin = useCallback((event) => {
    if (!enabled || event.button !== 0) return;
    if (pressRef.current) clearTimeout(pressRef.current.timer);
    pressRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      active: false,
      timer: setTimeout(() => {
        if (pressRef.current) pressRef.current.active = true;
        setHolding(true);
      }, delay)
    };
  }, [delay, enabled]);

  const move = useCallback((event) => {
    const press = pressRef.current;
    if (!press || press.active || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE_PX) clear();
  }, [clear]);

  return { holding, begin, move, end: clear };
}
