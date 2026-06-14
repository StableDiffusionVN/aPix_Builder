import { describe, expect, test } from "vitest";
import { resolveBasicFieldKind } from "../src/features/fields/basicFieldRegistry.jsx";
import {
  defaultsForType,
  inferRowType,
  moveRow,
  pruneInputRows,
  reorderRows,
  slugifyTemplateKey,
  workflowNodes
} from "../src/features/template-editor/templateEditorModel.js";
import { buildRunningHubAppShortcutConfig } from "../src/lib/runningHubShortcut.js";

describe("DynamicField registry", () => {
  test("maps supported ui types to renderers", () => {
    expect(resolveBasicFieldKind({ type: "int" }, "slider")).toBe("slider");
    expect(resolveBasicFieldKind({ type: "int" }, "input")).toBe("number");
    expect(resolveBasicFieldKind({ type: "checkpoints" }, "")).toBe("dropdown");
    expect(resolveBasicFieldKind({ type: "image" }, "")).toBe("");
  });
});

describe("TemplateEditor model", () => {
  test("builds node metadata and prunes stale mappings", () => {
    const workflow = {
      "1": {
        class_type: "KSampler",
        _meta: { title: "Sampler" },
        inputs: { seed: 1 }
      }
    };
    expect(workflowNodes(workflow)).toEqual([{
      id: "1",
      title: "Sampler",
      classType: "KSampler",
      fields: ["seed"]
    }]);
    expect(pruneInputRows([
      { rowId: "valid", nodeId: "1", field: "seed" },
      { rowId: "stale", nodeId: "2", field: "prompt" },
      { rowId: "note", kind: "note" }
    ], workflow).map(row => row.rowId)).toEqual(["valid", "note"]);
  });

  test("infers types and keeps row ordering deterministic", () => {
    expect(inferRowType({ field: "image", nodeClass: "", value: "" }, "runninghub-wf")).toBe("image");
    expect(defaultsForType("menu", ["a", "b"]).value).toBe("a");
    expect(slugifyTemplateKey("Ảnh Kết Quả")).toBe("anh_ket_qua");

    const rows = [{ rowId: "a" }, { rowId: "b" }, { rowId: "c" }];
    expect(moveRow(rows, "b", -1).map(row => row.rowId)).toEqual(["b", "a", "c"]);
    expect(reorderRows(rows, "a", "c").map(row => row.rowId)).toEqual(["b", "c", "a"]);
  });
});

describe("RunningHub Shortcut model", () => {
  test("converts app nodes to app_build-compatible inputs", () => {
    const config = buildRunningHubAppShortcutConfig({
      webappId: "123",
      appName: "Demo App",
      nodes: [
        { nodeId: "7", fieldName: "image", fieldType: "IMAGE", description: "Source Image" },
        { nodeId: "8", fieldName: "steps", fieldType: "INT", fieldValue: "20" },
        { nodeId: "9", fieldName: "mode", fieldType: "LIST", fieldData: ["fast", "quality"] }
      ],
      values: { "8|steps": 30 }
    });
    expect(config.runninghub.webappId).toBe("123");
    expect(Object.values(config.input).map(item => item.ui.type)).toEqual(["image", "int", "menu"]);
    expect(Object.values(config.input)[1].ui.value).toBe(30);
  });

  test("preserves RunningHub app menu labels and API values", () => {
    const config = buildRunningHubAppShortcutConfig({
      webappId: "123",
      nodes: [{
        nodeId: "9",
        fieldName: "model",
        fieldType: "LIST",
        fieldData: [
          { label: "Product", value: "product.safetensors" },
          { label: "Architecture", value: "architecture.safetensors" }
        ]
      }]
    });
    const menu = Object.values(config.input)[0].ui;
    expect(menu.menuLabelSyntax).toBe(true);
    expect(menu.choices).toEqual([
      "Product:product.safetensors",
      "Architecture:architecture.safetensors"
    ]);
  });
});
