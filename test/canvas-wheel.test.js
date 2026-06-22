import { describe, expect, test, vi } from "vitest";
import { handleNodeBodyWheel } from "../src/features/canvas/canvasWheel.js";

function wheelEvent(target, deltaY) {
  return {
    currentTarget: target,
    deltaY,
    stopPropagation: vi.fn()
  };
}

describe("handleNodeBodyWheel", () => {
  test("does not stop propagation when body does not overflow", () => {
    const el = { scrollHeight: 100, clientHeight: 100, scrollTop: 0 };
    const event = wheelEvent(el, 10);
    handleNodeBodyWheel(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  test("stops propagation when scrolling inside overflow body", () => {
    const el = { scrollHeight: 200, clientHeight: 100, scrollTop: 50 };
    const event = wheelEvent(el, 10);
    handleNodeBodyWheel(event);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  test("allows zoom when scrolled to bottom and wheel down", () => {
    const el = { scrollHeight: 200, clientHeight: 100, scrollTop: 100 };
    const event = wheelEvent(el, 10);
    handleNodeBodyWheel(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
