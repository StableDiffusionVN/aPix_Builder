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
