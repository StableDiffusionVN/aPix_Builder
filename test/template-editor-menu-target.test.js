import { describe, expect, it } from "vitest";
import { menuTargetPatch, workflowNodes } from "../src/features/template-editor/templateEditorModel.js";

const nodes = workflowNodes({
  1: { class_type: "SDVN Load Image", inputs: { Load_url: true, Url: "", image: "None" } },
  2: { class_type: "SDVN AnyDownload List", inputs: { Model: "qwen.safetensors" } }
});

describe("menuTargetPatch", () => {
  it("moves the field to the new node instead of keeping the old node's field", () => {
    expect(menuTargetPatch(nodes, { nodeId: "2" })).toEqual({ nodeId: "2", field: "Model" });
  });

  it("clears the field when the node has no inputs or does not exist", () => {
    expect(menuTargetPatch(nodes, { nodeId: "9" })).toEqual({ nodeId: "9", field: "" });
  });

  it("leaves patches without a node untouched", () => {
    expect(menuTargetPatch(nodes, { field: "Url" })).toEqual({ field: "Url" });
    expect(menuTargetPatch(nodes, { label: "Model Type" })).toEqual({ label: "Model Type" });
  });
});
