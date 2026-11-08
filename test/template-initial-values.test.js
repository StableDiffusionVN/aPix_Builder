import { describe, expect, it } from "vitest";
import { flattenInputs, initialValues } from "../src/lib/template.js";

const items = flattenInputs({
  image: { id: "1-image", ui: { type: "image" } },
  steps: { id: "7-steps", ui: { type: "int", value: 20 } },
  menu: { ui: { type: "menu-sub", choices: ["A", "B"], value: "A", sub: {
    A: { mask: { id: "3-image", ui: { type: "image_mask" } }, cfg: { id: "7-cfg", ui: { type: "float", value: 1 } } },
    B: {}
  } } }
});
const stored = { "1-image": "photo.png", "3-image": "mask.png", "7-steps": 5, "7-cfg": 3, __menu__menu: "B" };

describe("initialValues", () => {
  it("picking another template resets every parameter but keeps its images", () => {
    expect(initialValues(items, stored, { resetParams: true })).toEqual({
      "1-image": "photo.png", "3-image": "mask.png", "7-steps": 20, "7-cfg": 1, __menu__menu: "A"
    });
  });

  it("reopening the app keeps the last values", () => {
    expect(initialValues(items, stored)).toMatchObject({ "7-steps": 5, "7-cfg": 3, __menu__menu: "B" });
  });

  it("no stored values: defaults", () => {
    expect(initialValues(items, null, { resetParams: true })["7-steps"]).toBe(20);
  });
});
