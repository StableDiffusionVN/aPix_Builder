import { describe, expect, test } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setWorkflowValue } from "../server/lib/workflowPatcher.js";
import { prepareCanvasNodeRunRequest } from "../src/features/canvas/canvasRunner.js";
import { STEP_KINDS } from "../src/features/canvas/canvasModel.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function dirsWithOutput(name) {
  const root = await mkdtemp(path.join(tmpdir(), "apix-canvas-"));
  const inputDir = path.join(root, "input");
  const outputDir = path.join(root, "output");
  await mkdtemp(inputDir).catch(() => {});
  const { mkdir } = await import("node:fs/promises");
  await mkdir(inputDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, name), PNG);
  return { inputDir, outputDir };
}

describe("canvas: ảnh output node trước → input node sau (ComfyUI)", () => {
  test("chuỗi /api/output-image được upload lên ComfyUI thay vì gán thẳng", async () => {
    const { inputDir, outputDir } = await dirsWithOutput("out1.png");
    const workflow = { "7": { class_type: "LoadImage", inputs: { image: "" } } };
    const uploads = [];
    const result = await setWorkflowValue(
      workflow,
      "7-image",
      "/api/output-image?name=out1.png",
      { httpBase: "http://127.0.0.1:8188", headers: {} },
      undefined,
      {
        inputDir,
        outputDir,
        uploadDir: outputDir,
        uploadImageToComfy: async (_target, upload) => {
          uploads.push(upload);
          return { name: "comfy_uploaded.png" };
        },
        uploadedImageUrl: () => "http://comfy/view",
        parseDataUrl: () => null
      }
    );

    expect(uploads).toHaveLength(1);
    expect(uploads[0].buffer.equals(PNG)).toBe(true);
    expect(result).toBe("comfy_uploaded.png");
    expect(workflow["7"].inputs.image).toBe("comfy_uploaded.png");
  });

  test("input-image trỏ ảnh output đọc từ thư mục output", async () => {
    const { inputDir, outputDir } = await dirsWithOutput("out2.png");
    const workflow = { "7": { class_type: "LoadImage", inputs: { image: "" } } };
    const uploads = [];
    await setWorkflowValue(
      workflow,
      "7-image",
      { kind: "input-image", url: "/api/output-image?name=out2.png", name: "out2.png" },
      { httpBase: "http://127.0.0.1:8188", headers: {} },
      undefined,
      {
        inputDir,
        outputDir,
        uploadDir: outputDir,
        uploadImageToComfy: async (_target, upload) => {
          uploads.push(upload);
          return { name: "comfy_uploaded2.png" };
        },
        uploadedImageUrl: () => "http://comfy/view",
        parseDataUrl: () => null
      }
    );
    expect(uploads).toHaveLength(1);
    expect(workflow["7"].inputs.image).toBe("comfy_uploaded2.png");
  });

  test("canvas runner truyền ref output của node trước qua node output trung gian", async () => {
    const stepA = {
      id: "step-A",
      type: "step",
      data: {
        kind: STEP_KINDS.LOCAL,
        ref: "swapface",
        name: "Swapface",
        runCache: {
          outputs: [{ url: "/api/output-image?name=out1.png", key: "61-images", filename: "out1.png" }],
          primary: { url: "/api/output-image?name=out1.png", key: "61-images", filename: "out1.png" },
          runAt: 1,
          runId: "r1"
        }
      }
    };
    const outNode = {
      id: "out-1",
      type: "source",
      data: {
        passthroughFromOutput: true,
        passthroughSourceNodeId: "step-A",
        passthroughOutputKey: "main",
        sourceType: "image"
      }
    };
    const stepB = {
      id: "step-B",
      type: "step",
      data: {
        kind: STEP_KINDS.LOCAL,
        ref: "upscale",
        name: "Upscale",
        config: { input: { upscale_image: { id: "7-image", ui: { type: "image" } } } },
        ports: { inputs: [{ valueKey: "7-image", label: "Upscale Image", type: "image", uiType: "image" }] },
        values: {}
      }
    };
    const request = await prepareCanvasNodeRunRequest({
      node: stepB,
      nodes: [stepA, outNode, stepB],
      edges: [{ id: "e1", source: "out-1", target: "step-B", sourceHandle: "out:main", targetHandle: "in:7-image" }],
      rhAuth: {},
      comfyAddress: "http://127.0.0.1:8188"
    });
    expect(request.body.values["7-image"]).toBe("/api/output-image?name=out1.png");
  });
});
