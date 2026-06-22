import { describe, expect, test, vi } from "vitest";
import { canvasMultiSelectKeyCode } from "../src/features/canvas/canvasSelection.js";

describe("canvas multi-select modifier", () => {
  test("uses Meta on macOS and Control elsewhere", () => {
    const macUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36";
    const winUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

    vi.stubGlobal("navigator", { userAgent: macUa, platform: "MacIntel" });
    expect(canvasMultiSelectKeyCode()).toBe("Meta");

    vi.stubGlobal("navigator", { userAgent: winUa, platform: "Win32" });
    expect(canvasMultiSelectKeyCode()).toBe("Control");

    vi.unstubAllGlobals();
  });
});
