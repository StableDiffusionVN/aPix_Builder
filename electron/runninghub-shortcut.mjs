import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const SKIPPED_TYPES = new Set(["note", "checkpoints"]);
const NUMBER_TYPES = new Set(["int", "float", "seed"]);
const ASAR_SEGMENT = `${path.sep}app.asar${path.sep}`;
const SHORTCUT_WORKFLOW_TYPES = [
  "QuickActions",
  "ActionExtension",
  "WFWorkflowTypeShowInSearch"
];
const SHORTCUT_QUICK_ACTION_SURFACES = ["Services"];
const SHORTCUT_IMAGE_INPUT_CLASSES = [
  "WFAppContentItem",
  "WFGenericFileContentItem",
  "WFImageContentItem",
  "WFPDFContentItem",
  "WFRichTextContentItem",
  "WFSafariWebPageContentItem",
  "WFStringContentItem"
];
const SHORTCUT_TEXT_INPUT_CLASSES = [
  "WFGenericFileContentItem",
  "WFStringContentItem",
  "WFRichTextContentItem"
];

export function applyShortcutPresentationSettings(workflow, { hasImageInput = false } = {}) {
  workflow.WFWorkflowImportQuestions = [];
  workflow.WFWorkflowTypes = SHORTCUT_WORKFLOW_TYPES;
  workflow.WFQuickActionSurfaces = SHORTCUT_QUICK_ACTION_SURFACES;
  workflow.WFWorkflowInputContentItemClasses = hasImageInput
    ? SHORTCUT_IMAGE_INPUT_CLASSES
    : SHORTCUT_TEXT_INPUT_CLASSES;
}

export function resolveShortcutAssetsDir(resourceRoot) {
  const envDir = String(process.env.APIX_SHORTCUT_ASSETS_DIR || "").trim();
  if (envDir) return path.resolve(envDir);

  const bundledDir = path.join(resourceRoot, "electron", "shortcut-assets");
  if (bundledDir.includes(ASAR_SEGMENT)) {
    return bundledDir.replace(ASAR_SEGMENT, `${path.sep}app.asar.unpacked${path.sep}`);
  }
  return bundledDir;
}

function uuid() {
  return randomUUID().toUpperCase();
}

function parseTargetId(value) {
  const parts = String(value || "").split("-");
  if (parts.length < 2 || !parts[0]) {
    throw new Error(`Invalid input id "${value}". Expected nodeId-fieldName.`);
  }
  if (parts.length >= 3 && parts[1] === "inputs") {
    return [parts[0], parts.slice(2).join("-")];
  }
  return [parts[0], parts.slice(1).join("-")];
}

function nestedValue(data, paths) {
  for (const keys of paths) {
    let current = data;
    for (const key of keys) {
      if (!current || typeof current !== "object" || !(key in current)) {
        current = null;
        break;
      }
      current = current[key];
    }
    if (current != null && String(current).trim()) return String(current).trim();
  }
  return "";
}

export function detectRunningHubResource(config, kindOverride, idOverride) {
  const workflowId = nestedValue(config, [["runninghub", "workflowId"]]);
  const appId = nestedValue(config, [
    ["runninghub", "appId"],
    ["runninghub", "appid"],
    ["runninghub", "webappId"],
    ["runninghub", "webAppId"],
    ["runninghub", "webapp", "id"],
    ["runninghub", "app", "id"]
  ]);

  if (kindOverride) {
    const resourceId = String(idOverride || (kindOverride === "workflow" ? workflowId : appId)).trim();
    if (!resourceId) throw new Error(`Missing ${kindOverride} resource ID.`);
    return { kind: kindOverride, resourceId };
  }
  if (idOverride) throw new Error("resourceId requires kind.");
  if (workflowId) return { kind: "workflow", resourceId: workflowId };
  if (appId) return { kind: "app", resourceId: appId };
  throw new Error("Configuration has no RunningHub workflow or app ID.");
}

function parseMenuChoice(choice, labelSyntax) {
  const raw = String(choice);
  if (labelSyntax && raw.includes(":")) {
    const separator = raw.indexOf(":");
    const label = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (label && value) return { label, value };
  }
  return { label: raw, value: raw };
}

export function collectShortcutControls(config) {
  const controls = [];
  for (const [key, item] of Object.entries(config?.input || {})) {
    if (!item || typeof item !== "object") continue;
    const ui = item.ui || {};
    const uiType = String(ui.type || "string");
    if (!item.id || SKIPPED_TYPES.has(uiType)) continue;
    const [nodeId, fieldName] = parseTargetId(item.id);
    const type = uiType === "image" || uiType === "image_mask"
      ? "image"
      : uiType === "menu" || uiType === "dropdown"
        ? "menu"
        : NUMBER_TYPES.has(uiType)
          ? "number"
          : "text";
    const fieldType = type === "image"
      ? "IMAGE"
      : uiType === "float"
        ? "FLOAT"
        : type === "number"
          ? "INT"
          : "STRING";
    const choices = (ui.choices || []).map(choice => parseMenuChoice(choice, ui.menuLabelSyntax === true));
    const defaultValue = ui.value ?? choices[0]?.value ?? (type === "number" ? ui.minimum ?? 0 : "");
    controls.push({
      key: String(key),
      label: String(ui.label || key),
      type,
      uiType,
      menuLabelSyntax: ui.menuLabelSyntax === true,
      nodeId,
      fieldName,
      fieldType,
      defaultValue,
      choices
    });
  }
  return controls;
}

function actionOutput(actionUuid, outputName) {
  return {
    Value: { OutputUUID: actionUuid, Type: "ActionOutput", OutputName: outputName },
    WFSerializationType: "WFTextTokenAttachment"
  };
}

function variableToken(variableName) {
  return {
    Value: {
      string: "\ufffc",
      attachmentsByRange: {
        "{0, 1}": { VariableName: variableName, Type: "Variable" }
      }
    },
    WFSerializationType: "WFTextTokenString"
  };
}

function actionOutputToken(actionUuid, outputName) {
  return {
    Value: {
      string: "\ufffc",
      attachmentsByRange: {
        "{0, 1}": {
          OutputUUID: actionUuid,
          Type: "ActionOutput",
          OutputName: outputName
        }
      }
    },
    WFSerializationType: "WFTextTokenString"
  };
}

function askActions(control) {
  const actionUuid = uuid();
  const parameters = {
    WFAskActionDefaultAnswer: String(control.defaultValue),
    WFAskActionPrompt: control.label,
    UUID: actionUuid
  };
  if (control.type === "number") parameters.WFInputType = "Number";
  return [
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.ask",
      WFWorkflowActionParameters: parameters
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
      WFWorkflowActionParameters: {
        WFInput: actionOutput(actionUuid, "Yêu cầu đầu vào"),
        WFVariableName: control.key
      }
    }
  ];
}

function menuActions(control) {
  const textUuid = uuid();
  const dictionaryUuid = uuid();
  const valueUuid = uuid();
  const chooseUuid = uuid();
  if (!control.menuLabelSyntax) {
    return [
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.gettext",
        WFWorkflowActionParameters: {
          WFTextActionText: JSON.stringify({ choices: control.choices.map(choice => choice.value) }),
          UUID: textUuid
        }
      },
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.detect.dictionary",
        WFWorkflowActionParameters: {
          WFInput: actionOutput(textUuid, "Văn bản"),
          UUID: dictionaryUuid
        }
      },
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.getvalueforkey",
        WFWorkflowActionParameters: {
          WFInput: actionOutput(dictionaryUuid, "Từ điển"),
          WFDictionaryKey: "choices",
          UUID: valueUuid
        }
      },
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.choosefromlist",
        WFWorkflowActionParameters: {
          WFInput: actionOutput(valueUuid, "Giá trị từ điển"),
          WFChooseFromListActionPrompt: control.label,
          UUID: chooseUuid
        }
      },
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
        WFWorkflowActionParameters: {
          WFInput: actionOutput(chooseUuid, "Mục đã chọn"),
          WFVariableName: control.key
        }
      }
    ];
  }

  const selectedValueUuid = uuid();
  const choiceMap = Object.fromEntries(control.choices.map(choice => [choice.label, choice.value]));
  return [
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.gettext",
      WFWorkflowActionParameters: {
        WFTextActionText: JSON.stringify(choiceMap),
        UUID: textUuid
      }
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.detect.dictionary",
      WFWorkflowActionParameters: {
        WFInput: actionOutput(textUuid, "Văn bản"),
        UUID: dictionaryUuid
      }
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.getvalueforkey",
      WFWorkflowActionParameters: {
        WFInput: actionOutput(dictionaryUuid, "Từ điển"),
        WFGetDictionaryValueType: "All Keys",
        UUID: valueUuid
      }
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.choosefromlist",
      WFWorkflowActionParameters: {
        WFInput: actionOutput(valueUuid, "Giá trị từ điển"),
        WFChooseFromListActionPrompt: control.label,
        UUID: chooseUuid
      }
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.getvalueforkey",
      WFWorkflowActionParameters: {
        WFInput: actionOutput(dictionaryUuid, "Từ điển"),
        WFDictionaryKey: actionOutputToken(chooseUuid, "Mục đã chọn"),
        UUID: selectedValueUuid
      }
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
      WFWorkflowActionParameters: {
        WFInput: actionOutput(selectedValueUuid, "Giá trị từ điển"),
        WFVariableName: control.key
      }
    }
  ];
}

function dictionaryItem(items, key) {
  return items.find(item => item?.WFKey?.Value?.string === key);
}

function configItems(action) {
  return action.WFWorkflowActionParameters.WFItems.Value.WFDictionaryFieldValueItems;
}

function findConfigIndex(actions) {
  const index = actions.findIndex(action => {
    if (action.WFWorkflowActionIdentifier !== "is.workflow.actions.dictionary") return false;
    try {
      return Boolean(dictionaryItem(configItems(action), "appid"));
    } catch {
      return false;
    }
  });
  if (index === -1) throw new Error("Shortcut template configuration dictionary not found.");
  return index;
}

function findRunAction(actions) {
  const action = actions.find(item => item?.WFWorkflowActionParameters?.WFJSONValues?.Value?.WFDictionaryFieldValueItems);
  if (!action) throw new Error("Shortcut template RunningHub request action not found.");
  return action;
}

function nodeFields(node) {
  return node.WFValue.Value.Value.WFDictionaryFieldValueItems;
}

function setPlainField(fields, key, value) {
  const item = dictionaryItem(fields, key);
  if (!item) throw new Error(`Shortcut template node field missing: ${key}`);
  item.WFValue.Value = { string: String(value) };
}

function setVariableField(fields, key, variable, itemType) {
  const item = dictionaryItem(fields, key);
  if (!item) throw new Error(`Shortcut template node field missing: ${key}`);
  item.WFItemType = itemType;
  item.WFValue = variableToken(variable);
}

function setConfigString(items, key, value) {
  const item = dictionaryItem(items, key);
  if (!item) throw new Error(`Shortcut template config key missing: ${key}`);
  item.WFValue = {
    Value: { string: value },
    WFSerializationType: "WFTextTokenString"
  };
}

export function usesEmbeddedWorkflowJson(config) {
  return config?.runninghub?.saveWorkflowJson === true;
}

function setRequestStringField(items, key, value) {
  const item = dictionaryItem(items, key);
  if (!item) throw new Error(`Shortcut template request key missing: ${key}`);
  item.WFItemType = 0;
  item.WFValue = {
    Value: { string: String(value) },
    WFSerializationType: "WFTextTokenString"
  };
}

function addRequestStringField(items, key, value, prototypeKey = "instanceType") {
  if (dictionaryItem(items, key)) {
    setRequestStringField(items, key, value);
    return;
  }
  const prototype = dictionaryItem(items, prototypeKey);
  if (!prototype) throw new Error(`Shortcut template request prototype missing: ${prototypeKey}`);
  const item = structuredClone(prototype);
  item.WFKey = { Value: { string: key }, WFSerializationType: "WFTextTokenString" };
  item.WFItemType = 0;
  item.WFValue = {
    Value: { string: String(value) },
    WFSerializationType: "WFTextTokenString"
  };
  items.push(item);
}

export function buildRunningHubShortcut(template, config, apiKey, options = {}) {
  const { kind, resourceId } = detectRunningHubResource(config, options.kind, options.resourceId);
  const controls = collectShortcutControls(config);
  if (!controls.length) throw new Error("Configuration contains no supported input controls.");

  const workflow = structuredClone(template);
  const sourceActions = workflow.WFWorkflowActions;
  const configIndex = findConfigIndex(sourceActions);
  const controlActions = controls.flatMap(control => (
    control.type === "image" ? [] : control.type === "menu" ? menuActions(control) : askActions(control)
  ));
  workflow.WFWorkflowActions = [
    ...sourceActions.slice(0, 2),
    ...controlActions,
    ...sourceActions.slice(configIndex)
  ];

  const actions = workflow.WFWorkflowActions;
  const appName = String(config?.app?.name || "RunningHub Shortcut");
  actions[0].WFWorkflowActionParameters.WFCommentActionText = `Generated by aPix Builder for ${appName}.`;
  actions[1].WFWorkflowActionParameters.WFCommentActionText =
    "RunningHub API key was embedded when this shortcut was generated.";

  const items = configItems(actions[2 + controlActions.length]);
  setConfigString(items, "api", apiKey);
  setConfigString(items, "appid", resourceId);
  setConfigString(items, "appid_workflow", kind === "workflow" ? "true" : "false");
  const imageControl = controls.find(control => control.type === "image");
  if (imageControl) setConfigString(items, "nodeid", imageControl.nodeId);
  const outputName = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "output";
  setConfigString(items, "output_name", outputName);

  const requestItems = findRunAction(actions)
    .WFWorkflowActionParameters.WFJSONValues.Value.WFDictionaryFieldValueItems;
  const nodeInfo = dictionaryItem(requestItems, "nodeInfoList");
  const prototype = nodeInfo?.WFValue?.Value?.[0];
  if (!prototype) throw new Error("Shortcut template nodeInfoList has no node prototype.");
  nodeInfo.WFValue.Value = controls.map(control => {
    const node = structuredClone(prototype);
    const fields = nodeFields(node);
    setPlainField(fields, "nodeId", control.nodeId);
    setPlainField(fields, "fieldName", control.fieldName);
    if (control.type === "image") {
      setVariableField(fields, "fieldValue", "UploadedFileName", 0);
    } else {
      setVariableField(fields, "fieldValue", control.key, ["INT", "FLOAT"].includes(control.fieldType) ? 3 : 0);
    }
    return node;
  });

  if (kind === "workflow" && usesEmbeddedWorkflowJson(config)) {
    const embeddedWorkflow = options.embeddedWorkflow;
    if (!embeddedWorkflow || typeof embeddedWorkflow !== "object") {
      throw new Error("Template lưu JSON nhưng thiếu workflow api.json khi export Shortcut.");
    }
    addRequestStringField(requestItems, "workflow", JSON.stringify(embeddedWorkflow));
  }

  applyShortcutPresentationSettings(workflow, { hasImageInput: Boolean(imageControl) });
  workflow.WFWorkflowName = appName;

  return {
    workflow,
    kind,
    resourceId,
    mapping: controls.map(control => `${control.nodeId}-${control.fieldName}`)
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited with code ${code}`));
    });
  });
}

export async function createSignedRunningHubShortcut({
  config,
  apiKey,
  outputPath,
  assetsDir,
  kind,
  resourceId,
  workflow: embeddedWorkflow
}) {
  if (process.platform !== "darwin") {
    throw new Error("Export Shortcut requires macOS.");
  }
  if (!apiKey?.trim()) throw new Error("Missing RunningHub API key.");

  const resource = detectRunningHubResource(config, kind, resourceId);
  const templatePath = path.join(
    assetsDir,
    resource.kind === "workflow"
      ? "workflow-template.unsigned.shortcut"
      : "app-template.unsigned.shortcut"
  );
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "apix-rh-shortcut-"));
  try {
    const templateJsonPath = path.join(tempDir, "template.json");
    const generatedJsonPath = path.join(tempDir, "generated.json");
    const unsignedPath = path.join(tempDir, "generated.unsigned.shortcut");
    await run("/usr/bin/plutil", ["-convert", "json", "-o", templateJsonPath, templatePath]);
    const template = JSON.parse(await readFile(templateJsonPath, "utf8"));
    const result = buildRunningHubShortcut(template, config, apiKey.trim(), {
      ...resource,
      embeddedWorkflow
    });
    await writeFile(generatedJsonPath, JSON.stringify(result.workflow), { mode: 0o600 });
    await run("/usr/bin/plutil", ["-convert", "binary1", "-o", unsignedPath, generatedJsonPath]);
    await run("/usr/bin/shortcuts", [
      "sign",
      "--mode",
      "anyone",
      "--input",
      unsignedPath,
      "--output",
      outputPath
    ]);
    const header = await readFile(outputPath);
    if (header.subarray(0, 4).toString("ascii") !== "AEA1") {
      throw new Error("Signed Shortcut validation failed.");
    }
    return {
      kind: result.kind,
      resourceId: result.resourceId,
      mapping: result.mapping,
      outputPath
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
