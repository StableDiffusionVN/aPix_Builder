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
  applyShortcutPresentationSettings,
  buildRunningHubShortcut,
  collectShortcutControls,
  createSignedRunningHubShortcut,
  detectRunningHubResource,
  resolveShortcutAssetsDir,
  usesEmbeddedWorkflowJson
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

function shortcutRequestItems(workflow) {
  const action = workflow.WFWorkflowActions.find(item => (
    item?.WFWorkflowActionParameters?.WFJSONValues?.Value?.WFDictionaryFieldValueItems
  ));
  return action.WFWorkflowActionParameters.WFJSONValues.Value.WFDictionaryFieldValueItems;
}

test("usesEmbeddedWorkflowJson follows saveWorkflowJson flag", () => {
  expect(usesEmbeddedWorkflowJson({ runninghub: { saveWorkflowJson: true } })).toBe(true);
  expect(usesEmbeddedWorkflowJson({ runninghub: { saveWorkflowJson: false } })).toBe(false);
  expect(usesEmbeddedWorkflowJson({ runninghub: {} })).toBe(false);
});

test("exported shortcut surfaces match Share Sheet, Spotlight, and Services quick action", () => {
  const templatePath = path.join(
    process.cwd(),
    "electron/shortcut-assets/workflow-template.unsigned.shortcut"
  );
  const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", templatePath], {
    encoding: "utf8"
  });
  const config = {
    app: { name: "Surface Test" },
    input: {
      prompt: { id: "6-text", ui: { type: "text", label: "Prompt", value: "hello" } }
    },
    runninghub: { workflowId: "workflow-123" }
  };
  const result = buildRunningHubShortcut(JSON.parse(json), config, "hidden-test-key");
  expect(result.workflow.WFWorkflowTypes).toEqual([
    "QuickActions",
    "ActionExtension",
    "WFWorkflowTypeShowInSearch"
  ]);
  expect(result.workflow.WFQuickActionSurfaces).toEqual(["Services"]);
  expect(result.workflow.WFWorkflowInputContentItemClasses).toEqual([
    "WFGenericFileContentItem",
    "WFStringContentItem",
    "WFRichTextContentItem"
  ]);
});

test("image workflow shortcuts accept share sheet and services input classes", () => {
  const templatePath = path.join(
    process.cwd(),
    "electron/shortcut-assets/workflow-template.unsigned.shortcut"
  );
  const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", templatePath], {
    encoding: "utf8"
  });
  const config = {
    app: { name: "Routine Flatlay" },
    input: {
      image: { id: "48-image", ui: { type: "image", label: "Image" } },
      prompt: { id: "6-text", ui: { type: "text", label: "Prompt", value: "hello" } }
    },
    runninghub: { workflowId: "workflow-123" }
  };
  const result = buildRunningHubShortcut(JSON.parse(json), config, "hidden-test-key");
  expect(result.workflow.WFWorkflowName).toBe("Routine Flatlay");
  expect(result.workflow.WFWorkflowInputContentItemClasses).toEqual([
    "WFAppContentItem",
    "WFGenericFileContentItem",
    "WFImageContentItem",
    "WFPDFContentItem",
    "WFRichTextContentItem",
    "WFSafariWebPageContentItem",
    "WFStringContentItem"
  ]);
});

test("workflow shortcut template ships with share surfaces enabled", () => {
  const templatePath = path.join(
    process.cwd(),
    "electron/shortcut-assets/workflow-template.unsigned.shortcut"
  );
  const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", templatePath], {
    encoding: "utf8"
  });
  const workflow = JSON.parse(json);
  expect(workflow.WFWorkflowTypes).toEqual([
    "QuickActions",
    "ActionExtension",
    "WFWorkflowTypeShowInSearch"
  ]);
  expect(workflow.WFQuickActionSurfaces).toEqual(["Services"]);
  expect(workflow.WFWorkflowInputContentItemClasses).toContain("WFGenericFileContentItem");
});

test("embedded workflow JSON is embedded in shortcut request body", () => {
  const templatePath = path.join(
    process.cwd(),
    "electron/shortcut-assets/workflow-template.unsigned.shortcut"
  );
  const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", templatePath], {
    encoding: "utf8"
  });
  const config = {
    app: { name: "Embedded WF" },
    input: {
      prompt: { id: "6-text", ui: { type: "text", label: "Prompt", value: "hello" } }
    },
    runninghub: { workflowId: "workflow-123", saveWorkflowJson: true }
  };
  const embeddedWorkflow = {
    6: { class_type: "CLIPTextEncode", inputs: { text: "default" } }
  };
  const result = buildRunningHubShortcut(JSON.parse(json), config, "hidden-test-key", { embeddedWorkflow });
  const requestItems = shortcutRequestItems(result.workflow);
  const workflowItem = requestItems.find(item => item?.WFKey?.Value?.string === "workflow");
  expect(workflowItem).toBeTruthy();
  expect(JSON.parse(workflowItem.WFValue.Value.string)).toEqual(embeddedWorkflow);
  const nodeInfoList = requestItems.find(item => item?.WFKey?.Value?.string === "nodeInfoList");
  expect(nodeInfoList?.WFValue?.Value).toHaveLength(1);
});

test("embedded workflow shortcut export requires api.json", () => {
  const templatePath = path.join(
    process.cwd(),
    "electron/shortcut-assets/workflow-template.unsigned.shortcut"
  );
  const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", templatePath], {
    encoding: "utf8"
  });
  const config = {
    app: { name: "Embedded WF" },
    input: {
      prompt: { id: "6-text", ui: { type: "text", label: "Prompt", value: "hello" } }
    },
    runninghub: { workflowId: "workflow-123", saveWorkflowJson: true }
  };
  expect(() => buildRunningHubShortcut(JSON.parse(json), config, "hidden-test-key", {}))
    .toThrow(/api\.json/);
});

test("signed shortcut round-trip keeps share surfaces metadata", async () => {
  const shortcutSign = "/tmp/shortcut-sign-full/build/usr/bin/shortcut-sign";
  if (process.platform !== "darwin" || !require("node:fs").existsSync(shortcutSign)) return;

  const { createSignedRunningHubShortcut, resolveShortcutAssetsDir } = await import("../electron/runninghub-shortcut.mjs");
  const templatePath = path.join(
    process.cwd(),
    "electron/shortcut-assets/workflow-template.unsigned.shortcut"
  );
  const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", templatePath], {
    encoding: "utf8"
  });
  const config = {
    app: { name: "Signed Surface Test" },
    input: {
      image: { id: "48-image", ui: { type: "image", label: "Image" } }
    },
    runninghub: { workflowId: "workflow-123" }
  };
  const unsignedDir = require("node:fs").mkdtempSync(path.join(require("node:os").tmpdir(), "apix-signed-"));
  const signedPath = path.join(unsignedDir, "signed.shortcut");
  const extractedPath = path.join(unsignedDir, "extracted.plist");
  await createSignedRunningHubShortcut({
    config,
    apiKey: "hidden-test-key",
    outputPath: signedPath,
    assetsDir: resolveShortcutAssetsDir(process.cwd()),
    kind: "workflow",
    resourceId: "workflow-123"
  });
  execFileSync(shortcutSign, ["extract", "-i", signedPath, "-o", extractedPath]);
  const extracted = JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", extractedPath], {
    encoding: "utf8"
  }));
  expect(extracted.WFWorkflowTypes).toEqual([
    "QuickActions",
    "ActionExtension",
    "WFWorkflowTypeShowInSearch"
  ]);
  expect(extracted.WFQuickActionSurfaces).toEqual(["Services"]);
  expect(extracted.WFWorkflowInputContentItemClasses).toContain("WFGenericFileContentItem");
});
