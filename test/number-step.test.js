import { describe, expect, it } from "vitest";
import { snapToStep, stepOptions } from "../shared/numberStep.js";
import { flattenInputs, requestPayload } from "../src/lib/template.js";

describe("snapToStep", () => {
  const width = { step: 32, minimum: 512, maximum: 2048, integer: true };
  it("rounds to the nearest multiple of the step", () => {
    expect(snapToStep(1290, width)).toBe(1280);
    expect(snapToStep(1300, width)).toBe(1312);
    expect(snapToStep(1280, width)).toBe(1280);
  });
  it("stays inside min / max on a multiple", () => {
    expect(snapToStep(100, width)).toBe(512);
    expect(snapToStep(5000, width)).toBe(2048);
    expect(snapToStep(3, { step: 8, minimum: 1, maximum: 30 })).toBe(8);
    expect(snapToStep(29, { step: 8, minimum: 1, maximum: 30 })).toBe(24);
  });
  it("handles decimal steps without float noise", () => {
    expect(snapToStep(0.33, { step: 0.05 })).toBe(0.35);
    expect(snapToStep(1.04, { step: 0.1, minimum: 0, maximum: 1 })).toBe(1);
  });
  it("leaves empty and non-numeric values alone", () => {
    expect(snapToStep("", width)).toBe("");
    expect(snapToStep("abc", width)).toBe("abc");
  });
  it("only applies to numeric fields that declare a step", () => {
    expect(stepOptions({ type: "int", step: 32 })).toMatchObject({ step: 32, integer: true });
    expect(stepOptions({ type: "int" })).toBeNull();
    expect(stepOptions({ type: "seed", step: 1 })).toBeNull();
  });
  it("runs are always sent on the step", () => {
    const items = flattenInputs({ w: { id: "5-width", ui: { type: "int", step: 32, minimum: 512, maximum: 2048 } } });
    expect(requestPayload(items, { "5-width": 1290 })["5-width"]).toBe(1280);
  });
});
