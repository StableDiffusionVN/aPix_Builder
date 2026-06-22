import { describe, expect, test } from "vitest";
import {
  APIX_WORKFLOW_FORMAT,
  APIX_WORKFLOW_VERSION,
  createWorkflowFile,
  parseWorkflowFile,
  workflowFileName
} from "../src/features/canvas/workflowFile.js";

describe("workflow JSON files", () => {
  test("exports all workflow state with a versioned envelope", () => {
    const file = createWorkflowFile({
      id: "p_123",
      name: "Ảnh chân dung",
      nodes: [{ id: "n1", data: { values: { prompt: "test" } } }],
      edges: [{ id: "e1", source: "n1", target: "n1" }],
      viewport: { x: 10, y: -20, zoom: 1.25 },
      exportedAt: "2026-06-21T00:00:00.000Z"
    });

    expect(file.format).toBe(APIX_WORKFLOW_FORMAT);
    expect(file.version).toBe(APIX_WORKFLOW_VERSION);
    expect(file.workflow).toMatchObject({
      id: "p_123",
      name: "Ảnh chân dung",
      nodeCount: 1,
      edgeCount: 1,
      viewport: { x: 10, y: -20, zoom: 1.25 }
    });
    expect(parseWorkflowFile(JSON.stringify(file))).toEqual({
      name: "Ảnh chân dung",
      nodes: file.workflow.nodes,
      edges: file.workflow.edges,
      viewport: file.workflow.viewport
    });
  });

  test("accepts legacy flat workflow JSON", () => {
    expect(parseWorkflowFile({ name: "Legacy", nodes: [], edges: [] })).toEqual({
      name: "Legacy",
      nodes: [],
      edges: [],
      viewport: null
    });
  });

  test("rejects malformed and unsupported files", () => {
    expect(() => parseWorkflowFile("not-json")).toThrow("Không thể đọc");
    expect(() => parseWorkflowFile({ format: "other", nodes: [], edges: [] })).toThrow("Định dạng");
    expect(() => parseWorkflowFile({ format: APIX_WORKFLOW_FORMAT, version: 999, workflow: { nodes: [], edges: [] } })).toThrow("Phiên bản");
    expect(() => parseWorkflowFile({ name: "Missing graph" })).toThrow("nodes và edges");
    expect(() => parseWorkflowFile({
      name: "Dangling edge",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1", source: "n1", target: "missing" }]
    })).toThrow("tham chiếu node");
    expect(() => parseWorkflowFile({
      name: "Duplicate nodes",
      nodes: [{ id: "n1" }, { id: "n1" }],
      edges: []
    })).toThrow("trùng ID");
  });

  test("creates a safe workflow filename", () => {
    expect(workflowFileName("Ảnh chân dung / 01")).toBe("Anh-chan-dung-01.apix-workflow.json");
  });
});
