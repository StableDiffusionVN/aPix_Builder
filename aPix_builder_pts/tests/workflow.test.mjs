import assert from "node:assert/strict";
import test from "node:test";
import {
  flattenInputs,
  buildDefaults,
  requestPayload,
  validateWorkflowMappings,
  isImageInputItem,
  getActiveInputItems,
  getActiveSubInputs,
  getMenuSubOptions,
  menuSubValueKey
} from "../src/services/workflow.js";
import { resolveWorkflowInput } from "../src/services/comfy.js";

const config = {
  input: {
    seed: { id: "2-seed", ui: { type: "seed", value: "random_seed" } },
    group: {
      ui: {
        type: "col",
        col: {
          steps: { id: "2-steps", ui: { type: "int", value: 4 } }
        }
      }
    },
    image: { id: "5-image", ui: { type: "image" } }
  },
  output: {
    result: { id: "11" }
  }
};

const workflow = {
  "2": { inputs: { seed: 0, steps: 4 } },
  "5": { inputs: { image: "" } },
  "11": { inputs: {} }
};

test("flattenInputs expands col groups", () => {
  const items = flattenInputs(config.input);
  assert.equal(items.length, 3);
  assert.equal(items[1].key, "group.steps");
});

test("buildDefaults uses seed sentinel", () => {
  const values = buildDefaults(flattenInputs(config.input));
  assert.equal(values["2-seed"], "random_seed");
  assert.equal(values["2-steps"], 4);
});

test("requestPayload maps values to workflow ids", () => {
  const items = flattenInputs(config.input);
  const values = buildDefaults(items);
  const payload = requestPayload(items, values);
  assert.equal(payload["2-seed"], "random_seed");
  assert.equal(payload["2-steps"], 4);
});

test("menu-sub defaults all sub inputs and maps only active choice", () => {
  const menuConfig = {
    input: {
      quality: {
        ui: {
          type: "menu-sub",
          label: "Quality",
          choices: ["fast", "detail"],
          value: "detail",
          sub: {
            fast: {
              denoise: { id: "2-denoise", ui: { type: "float", value: 0.4 } }
            },
            detail: {
              steps: { id: "2-steps", ui: { type: "int", value: 24 } },
              cfg: { id: "2-cfg", ui: { type: "float", value: 7 } }
            }
          }
        }
      }
    }
  };
  const items = flattenInputs(menuConfig.input);
  const values = buildDefaults(items);
  assert.equal(values[menuSubValueKey(items[0])], "detail");
  assert.equal(values["2-steps"], 24);
  assert.equal(values["2-cfg"], 7);

  let payload = requestPayload(items, values);
  assert.deepEqual(payload, { "2-steps": 24, "2-cfg": 7 });

  values[menuSubValueKey(items[0])] = "fast";
  payload = requestPayload(items, values);
  assert.deepEqual(payload, { "2-denoise": 0.4 });
});

test("menu-sub supports object choices and nested col groups", () => {
  const item = {
    key: "quality",
    ui: {
      type: "MENU-SUB",
      value: "detail",
      choices: {
        fast: {
          denoise: { id: "2-denoise", ui: { type: "float", value: 0.4 } }
        },
        detail: {
          advanced: {
            ui: {
              type: "col",
              col: {
                steps: { id: "2-steps", ui: { type: "int", value: 24 } },
                cfg: { id: "2-cfg", ui: { type: "float", value: 7 } }
              }
            }
          }
        }
      }
    }
  };

  assert.deepEqual(getMenuSubOptions(item), [
    { value: "fast", label: "fast" },
    { value: "detail", label: "detail" }
  ]);
  assert.deepEqual(
    getActiveSubInputs(item, "detail").map(child => child.id),
    ["2-steps", "2-cfg"]
  );

  const values = buildDefaults([item]);
  assert.equal(values[menuSubValueKey(item)], "detail");
  assert.equal(values["2-steps"], 24);
  assert.equal(values["2-cfg"], 7);
});

test("active input list includes image fields from only the selected sub-menu", () => {
  const items = flattenInputs({
    source: {
      ui: {
        type: "menu-sub",
        choices: ["document", "reference"],
        value: "reference",
        sub: {
          document: {
            documentImage: { id: "5-image", ui: { type: "image" } }
          },
          reference: {
            group: {
              ui: {
                type: "col",
                col: {
                  referenceImage: { id: "6-image", ui: { type: "image" } },
                  strength: { id: "6-strength", ui: { type: "float", value: 0.8 } }
                }
              }
            }
          }
        }
      }
    }
  });
  const values = buildDefaults(items);
  const activeImageIds = getActiveInputItems(items, values)
    .filter(isImageInputItem)
    .map(item => item.id);

  assert.deepEqual(activeImageIds, ["6-image"]);

  values[menuSubValueKey(items[0])] = "document";
  assert.deepEqual(
    getActiveInputItems(items, values).filter(isImageInputItem).map(item => item.id),
    ["5-image"]
  );
});

test("validateWorkflowMappings accepts valid template", () => {
  assert.doesNotThrow(() => validateWorkflowMappings(config, workflow));
});

test("validateWorkflowMappings can skip output for RunningHub Workflow templates", () => {
  const rhConfig = {
    input: config.input,
    runninghub: { workflowId: "2064644362323189762" }
  };
  assert.doesNotThrow(() => validateWorkflowMappings(rhConfig, workflow, { requireOutput: false }));
});

test("isImageInputItem includes image_mask", () => {
  assert.equal(isImageInputItem({ ui: { type: "image_mask" } }), true);
  assert.equal(isImageInputItem({ ui: { type: "text" } }), false);
});

test("resolveWorkflowInput is case-insensitive on field names", () => {
  const wf = { "1": { inputs: { CKPT_name: "model.safetensors" } } };
  const result = resolveWorkflowInput(wf, "1-ckpt_name");
  assert.equal(result.field, "CKPT_name");
});
