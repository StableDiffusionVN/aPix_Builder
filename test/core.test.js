import { describe, expect, test } from "vitest";
import {
  mapValuesToRequest,
  resolveInputImageFilename,
  resolveWorkflowInput,
  validateWorkflowMappings
} from "../server/lib/workflowPatcher.js";
import {
  TEMPLATE_SCOPES,
  validateTemplateConfig
} from "../server/lib/templateService.js";
import { buildStepJob, EXECUTION_MODES } from "../src/lib/execution/runStep.js";
import {
  lookupMenuSubFields,
  menuChoiceOptions,
  resolveMenuStoredValue
} from "../shared/menuChoices.js";

describe("workflowPatcher", () => {
  test("maps only the selected menu-sub branch", () => {
    const config = {
      input: {
        mode: {
          id: "1-mode",
          ui: {
            type: "menu-sub",
            choices: ["Fast:fast", "Quality:quality"],
            menuLabelSyntax: true,
            sub: {
              fast: { steps: { id: "2-steps" } },
              quality: { cfg: { id: "3-cfg" } }
            }
          }
        }
      }
    };
    expect(mapValuesToRequest(config, {
      "1-mode": "fast",
      "2-steps": 4,
      "3-cfg": 8
    })).toEqual({
      "1-mode": "fast",
      "2-steps": 4
    });
  });

  test("validates input and output node mappings", () => {
    const workflow = {
      "1": { inputs: { prompt: "" } },
      "9": { inputs: {} }
    };
    expect(resolveWorkflowInput(workflow, "1-prompt").field).toBe("prompt");
    expect(() => validateWorkflowMappings({
      input: { prompt: { id: "1-prompt" } },
      output: { image: { id: "9" } }
    }, workflow)).not.toThrow();
    expect(() => validateWorkflowMappings({
      input: { prompt: { id: "2-prompt" } },
      output: {}
    }, workflow)).toThrow(/node 2/);
  });

  test("resolveInputImageFilename falls back to url query name", () => {
    expect(resolveInputImageFilename({
      kind: "input-image",
      url: "/api/input-image?name=library%20shot.png"
    })).toBe("library shot.png");
    expect(resolveInputImageFilename({
      kind: "input-image",
      name: "explicit.png",
      url: "/api/input-image?name=other.png"
    })).toBe("explicit.png");
  });
});

describe("templateService.validateConfig", () => {
  test("accepts local and RunningHub workflow contracts", () => {
    expect(() => validateTemplateConfig({
      app: { name: "Local" },
      input: {},
      output: {}
    }, { id: "local" }, TEMPLATE_SCOPES.local)).not.toThrow();
    expect(() => validateTemplateConfig({
      app: { name: "RH" },
      input: {},
      runninghub: { workflowId: "123" }
    }, { id: "rh" }, TEMPLATE_SCOPES.runninghubWf)).not.toThrow();
  });

  test("reports all missing required sections", () => {
    expect(() => validateTemplateConfig({}, { id: "broken" }))
      .toThrow(/app; YAML is missing required object: input; YAML is missing required object: output/);
  });
});

describe("buildStepJob", () => {
  test("builds stable local jobs when identifiers are supplied", () => {
    expect(buildStepJob(EXECUTION_MODES.LOCAL, {
      runId: "run-1",
      queuedAt: "2026-06-13T00:00:00.000Z",
      template: "demo",
      address: "http://127.0.0.1:8188",
      values: { prompt: "test" }
    })).toEqual({
      runId: "run-1",
      queuedAt: "2026-06-13T00:00:00.000Z",
      template: "demo",
      address: "http://127.0.0.1:8188",
      values: { prompt: "test" }
    });
  });

  test("rejects unknown execution modes", () => {
    expect(() => buildStepJob("unknown", {})).toThrow(/Unknown execution mode/);
  });
});

describe("menuChoices", () => {
  test("resolves legacy labels and menu-sub fields", () => {
    const choices = ["Nhanh:fast"];
    const options = menuChoiceOptions({ menuLabelSyntax: true });
    const resolved = resolveMenuStoredValue("Nhanh", choices, options);
    expect(resolved).toBe("fast");
    expect(lookupMenuSubFields({ fast: { steps: 4 } }, resolved, choices, options))
      .toEqual({ steps: 4 });
  });
});
