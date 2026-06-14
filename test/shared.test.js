import { expect, test } from "vitest";
import {
  lookupMenuSubFields,
  menuChoiceOptions,
  parseMenuChoices,
  resolveMenuStoredValue
} from "../shared/menuChoices.js";
import {
  isHttpImageUrl,
  isLocalFolderPath,
  normalizeLocalPathInput
} from "../shared/localImagePath.js";
import {
  buildRunningHubShortcut,
  collectShortcutControls,
  detectRunningHubResource,
  resolveShortcutAssetsDir
} from "../electron/runninghub-shortcut.mjs";
import { execFileSync } from "node:child_process";
import path from "node:path";

test("menu choices preserve labels and API values", () => {
  const source = { menuLabelSyntax: true };
  const options = menuChoiceOptions(source);
  expect(parseMenuChoices(["Nhanh:fast", "Chậm:slow"], options)).toEqual([
    { label: "Nhanh", value: "fast", raw: "Nhanh:fast" },
    { label: "Chậm", value: "slow", raw: "Chậm:slow" }
  ]);
  expect(resolveMenuStoredValue("Nhanh", source.choices, options)).toBe("Nhanh");
  expect(
    lookupMenuSubFields({ fast: { steps: 4 } }, "Nhanh:fast", ["Nhanh:fast"], options),
  ).toEqual({ steps: 4 });
});

test("local image paths normalize file URLs and reject web URLs", () => {
  expect(normalizeLocalPathInput("'~/Pictures/'")).toBe("~/Pictures");
  expect(normalizeLocalPathInput("file:///C:/Images/")).toBe("C:/Images");
  expect(
    normalizeLocalPathInput("file:///C:/Images/", { windowsFileUrl: true }),
  ).toBe("C:\\Images");
  expect(isLocalFolderPath("~/Pictures")).toBe(true);
  expect(isLocalFolderPath("https://example.com/image.png")).toBe(false);
  expect(isHttpImageUrl("https://example.com/image.png")).toBe(true);
});

test("RunningHub Shortcut config detects resources and maps controls", () => {
  const config = {
    input: {
      image: { id: "7-image", ui: { type: "image", label: "Image" } },
      steps: { id: "8-inputs-steps", ui: { type: "int", value: 20 } },
      note: { ui: { type: "note" } }
    },
    runninghub: { workflowId: "workflow-123" }
  };
  expect(detectRunningHubResource(config)).toEqual({
    kind: "workflow",
    resourceId: "workflow-123"
  });
  expect(collectShortcutControls(config).map(item => `${item.nodeId}-${item.fieldName}`)).toEqual([
    "7-image",
    "8-steps"
  ]);
});

test("Shortcut assets resolve to app.asar.unpacked when bundled in asar", () => {
  const asarRoot = "/Applications/aPix Builder.app/Contents/Resources/app.asar";
  expect(resolveShortcutAssetsDir(asarRoot)).toBe(
    "/Applications/aPix Builder.app/Contents/Resources/app.asar.unpacked/electron/shortcut-assets"
  );
  expect(resolveShortcutAssetsDir(process.cwd())).toBe(
    path.join(process.cwd(), "electron/shortcut-assets")
  );
});

test("advanced Shortcut menus display labels and submit mapped values", () => {
  const templatePath = path.join(
    process.cwd(),
    "electron/shortcut-assets/workflow-template.unsigned.shortcut"
  );
  const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", templatePath], {
    encoding: "utf8"
  });
  const config = {
    app: { name: "Advanced Menu" },
    input: {
      model: {
        id: "6-lora_name",
        ui: {
          type: "menu",
          label: "Model",
          choices: ["Product:model-product.safetensors", "Architecture:model-arch.safetensors"],
          menuLabelSyntax: true
        }
      }
    },
    runninghub: { workflowId: "workflow-123" }
  };
  const result = buildRunningHubShortcut(JSON.parse(json), config, "hidden-test-key");
  const actions = result.workflow.WFWorkflowActions;
  const menuText = actions.find(action => (
    action.WFWorkflowActionIdentifier === "is.workflow.actions.gettext"
    && action.WFWorkflowActionParameters.WFTextActionText.includes("model-product.safetensors")
  ));
  expect(JSON.parse(menuText.WFWorkflowActionParameters.WFTextActionText)).toEqual({
    Product: "model-product.safetensors",
    Architecture: "model-arch.safetensors"
  });
  const chooseIndex = actions.findIndex(action => (
    action.WFWorkflowActionIdentifier === "is.workflow.actions.choosefromlist"
    && action.WFWorkflowActionParameters.WFChooseFromListActionPrompt === "Model"
  ));
  const lookup = actions[chooseIndex + 1];
  const setVariable = actions[chooseIndex + 2];
  expect(lookup.WFWorkflowActionIdentifier).toBe("is.workflow.actions.getvalueforkey");
  expect(lookup.WFWorkflowActionParameters.WFDictionaryKey.Value.attachmentsByRange["{0, 1}"].OutputUUID)
    .toBe(actions[chooseIndex].WFWorkflowActionParameters.UUID);
  expect(setVariable.WFWorkflowActionParameters.WFInput.Value.OutputUUID)
    .toBe(lookup.WFWorkflowActionParameters.UUID);
});
