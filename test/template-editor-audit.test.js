import { describe, expect, it } from "vitest";
import { buildConfig, rowFromConfig } from "../src/components/TemplateEditorModal.jsx";
import {
  defaultFieldForNode, inferRowType, parseFieldId, pruneInputRows, remapChoiceEntries, workflowNodes
} from "../src/features/template-editor/templateEditorModel.js";
import { buildDefaults, flattenInputs, menuChoiceDefaults, requestPayload } from "../src/lib/template.js";
import { setWorkflowValue } from "../server/lib/workflowPatcher.js";

const workflow = {
  2: { class_type: "Loader", inputs: { Model: "a.safetensors" } },
  6: { class_type: "Encode", inputs: { clip: ["9", 1], positive: "hi", "my-field": 1 } },
  7: { class_type: "KSampler", inputs: { steps: 20 } }
};
const choice = value => ({ value, raw: value, label: value });
const baseRow = { rowId: "x", nodeId: "7", field: "steps", label: "Steps", type: "int", display: "input", value: 20, minimum: 0, maximum: "", step: 1, choicesText: "" };
const build = inputRows => buildConfig({ appName: "T", inputRows, outputRows: [] });

describe("options mapping the same node field", () => {
  const item = { key: "m", ui: { type: "menu-sub", choices: ["Base", "Turbo"], value: "Base", sub: {
    Base: { steps: { id: "7-steps", ui: { type: "int", value: 20 } } },
    Turbo: { steps: { id: "7-steps", ui: { type: "int", value: 8 } } }
  } } };

  it("starts from the default option's value, not the last option's", () => {
    const items = flattenInputs({ m: item });
    expect(requestPayload(items, buildDefaults(items))["7-steps"]).toBe(20);
  });

  it("switching option brings that option's default", () => {
    expect(menuChoiceDefaults(item, "Turbo")).toEqual({ "7-steps": 8 });
    expect(menuChoiceDefaults(item, "Base")).toEqual({ "7-steps": 20 });
  });

  it("leaves fields only one option uses alone", () => {
    const single = { key: "m", ui: { ...item.ui, sub: { Base: item.ui.sub.Base, Turbo: {} } } };
    expect(menuChoiceDefaults(single, "Base")).toEqual({});
  });
});

describe("renaming a menu option", () => {
  const sub = { Base: ["a"], Turbo: ["b"] };
  it("keeps its sub-inputs while typing", () => {
    expect(remapChoiceEntries(sub, [choice("Base"), choice("Turbo")], [choice("Base2"), choice("Turbo")]).Base2).toEqual(["a"]);
  });
  it("survives clearing a line and retyping the same name", () => {
    const cleared = remapChoiceEntries(sub, [choice("Base"), choice("Turbo")], [choice("Turbo")]);
    expect(remapChoiceEntries(cleared, [choice("Turbo")], [choice("Base"), choice("Turbo")]).Base).toEqual(["a"]);
  });
  it("does not swap data when options are swapped", () => {
    const next = remapChoiceEntries(sub, [choice("Base"), choice("Turbo")], [choice("Turbo"), choice("Base")]);
    expect(next.Base).toEqual(["a"]);
    expect(next.Turbo).toEqual(["b"]);
  });
});

describe("workflow changes", () => {
  it("drops only the menu target when the new workflow lacks it, not the whole menu", () => {
    const row = { kind: "menu-sub", hasTargetId: true, nodeId: "99", field: "x", sub: { Base: [{ nodeId: "7", field: "steps" }] } };
    const [next] = pruneInputRows([row], workflow);
    expect(next).toMatchObject({ hasTargetId: false, nodeId: "", field: "" });
    expect(next.sub.Base).toHaveLength(1);
  });
});

describe("wires", () => {
  const nodes = workflowNodes(workflow);
  it("a new row points at a widget, not a wire", () => {
    expect(defaultFieldForNode(nodes.find(node => node.id === "6"))).toBe("positive");
  });
  it("a wire is not a menu of choices", () => {
    expect(inferRowType({ field: "clip", value: ["9", 1] })).toBe("string");
    expect(inferRowType({ field: "x", value: ["a", "b"] })).toBe("menu");
  });
  it("an empty value does not cut a wire", async () => {
    const copy = structuredClone(workflow);
    await setWorkflowValue(copy, "6-clip", "", {}, null, {});
    expect(copy[6].inputs.clip).toEqual(["9", 1]);
  });
});

describe("save and reload", () => {
  it("keeps the whole field name when it contains a dash", () => {
    expect(parseFieldId("6-my-field")).toEqual({ nodeId: "6", field: "my-field" });
    expect(parseFieldId("6-inputs-steps")).toEqual({ nodeId: "6", field: "steps" });
    expect(rowFromConfig({ id: "6-my-field", ui: { type: "int" } }, workflow, "k").field).toBe("my-field");
  });

  it("keeps ui keys the form has no control for", () => {
    const item = { id: "7-steps", ui: { type: "dropdown", label: "S", choices: ["1", "2"], value: "1", multiple: true } };
    const config = build([rowFromConfig(item, workflow, "s")]);
    expect(config.input.s.ui).toMatchObject({ type: "dropdown", choices: ["1", "2"], multiple: true, value: "1" });
  });

  it("refuses to silently drop a row without node/field", () => {
    expect(() => build([{ ...baseRow, field: "" }])).toThrow(/Steps/);
    expect(() => build([{ ...baseRow, nodeId: "" }])).toThrow(/Steps/);
  });

  it("refuses the same field twice", () => {
    expect(() => build([baseRow, { ...baseRow, rowId: "y" }])).toThrow(/7-steps/);
  });

  it("allows the same field across menu options", () => {
    const menu = { kind: "menu-sub", label: "M", choicesText: "Base\nTurbo", value: "Base", sub: { Base: [baseRow], Turbo: [{ ...baseRow, value: 8 }] } };
    const { ui } = build([menu]).input.m;
    expect(ui.sub.Turbo.steps.ui.value).toBe(8);
  });

  it("keeps field order for numeric labels", () => {
    const config = build([{ ...baseRow, label: "Zeta" }, { ...baseRow, nodeId: "2", field: "Model", type: "string", label: "1024" }]);
    expect(Object.keys(config.input)).toEqual(["zeta", "f_1024"]);
  });
});
