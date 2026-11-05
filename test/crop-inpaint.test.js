import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Jimp } from "jimp";
import { prepareCropInpaint } from "../server/lib/cropInpaint.js";
import { clampCropRect, cropInpaintSource, findCropInpaint, isInpaintCropEnabled, imageValueForUi } from "../shared/cropInpaint.js";
import { extractImageValueUrl, expandImageBatchValues, requestPayload } from "../src/lib/template.js";
import { cloneImageValueForSource, finalizeCanvasImageValue } from "../src/features/canvas/canvasModel.js";
import { setWorkflowValue, mapValuesToRequest } from "../server/lib/workflowPatcher.js";
import { prepareNodeInfoList } from "../server/lib/runningHubClient.js";
import { prepareCanvasNodeRunRequest } from "../src/features/canvas/canvasRunner.js";
import { STEP_KINDS, findNodeInputImageUrl, deriveStepPorts } from "../src/features/canvas/canvasModel.js";

let tempDir;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = null;
});

async function png(width, height, color) {
  return new Jimp({ width, height, color }).getBuffer("image/png");
}
async function fixture() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "apix-inpaint-test-"));
  await writeFile(path.join(tempDir, "original.png"), await png(12, 10, 0x224466ff));
  await writeFile(path.join(tempDir, "crop.png"), await png(6, 4, 0x224466ff));
  return {
    value: {
      kind: "input-image", name: "crop.png", url: "/api/input-image?name=crop.png",
      cropInpaint: {
        original: { kind: "input-image", url: "/api/input-image?name=original.png" },
        originalWidth: 12, originalHeight: 10,
        rect: { x: 3, y: 2, width: 6, height: 4 }, blendPixels: 0
      }
    },
    paths: { inputDir: tempDir, outputDir: tempDir }
  };
}

describe("Crop Inpaint", () => {
  test("clamps drag and numeric coordinates to image pixels", () => {
    expect(clampCropRect({ x: -20, y: 99, width: 200, height: 0 }, 12, 10))
      .toEqual({ x: 0, y: 9, width: 12, height: 1 });
  });

  test("restores original and compares the full source image", async () => {
    const { value } = await fixture();
    expect(cropInpaintSource(value)).toEqual(value.cropInpaint.original);
    expect(extractImageValueUrl(value)).toBe("/api/input-image?name=original.png");
  });

  test("carries crop through batching, request mapping, source splitting and canvas finalization", async () => {
    const { value } = await fixture();
    const config = [{ id: "5-image", ui: { type: "image", inpaintCrop: true } }];
    const jobs = expandImageBatchValues(config, { "5-image": [value, "second"] });
    expect(requestPayload(config, jobs[0])["5-image"].cropInpaint).toEqual(value.cropInpaint);
    expect(jobs[1]["5-image"]).toBe("second");
    expect(cloneImageValueForSource(value).cropInpaint).toEqual(value.cropInpaint);
    expect(finalizeCanvasImageValue(value).cropInpaint).toEqual(value.cropInpaint);
  });

  test.each([STEP_KINDS.LOCAL, STEP_KINDS.RH_WF, STEP_KINDS.RH_APP])("canvas %s keeps stitch metadata in submitted jobs", async kind => {
    const { value } = await fixture();
    const key = kind === STEP_KINDS.RH_APP ? "5|image" : "5-image";
    const node = {
      id: "step", type: "step", data: {
        kind, ref: "demo", config: { input: { photo: { id: key, ui: { type: "image", inpaintCrop: true } } } },
        nodes: [{ nodeId: "5", fieldName: "image", fieldType: "IMAGE", inpaintCrop: true }],
        ports: { inputs: [{ valueKey: key, type: "image", uiType: "image", label: "Photo", inpaintCrop: true }] },
        values: { [key]: value }
      }
    };
    const request = await prepareCanvasNodeRunRequest({ node, nodes: [node], edges: [], rhAuth: { apiKey: "test" } });
    const submitted = kind === STEP_KINDS.RH_APP ? request.body.nodes[0].fieldValue : request.body.values[key];
    expect(submitted.cropInpaint).toEqual(value.cropInpaint);
    expect(findNodeInputImageUrl(node, [node], [])).toBe(value.cropInpaint.original.url);
  });

  test("crop is opt-in per image field and disabled fields restore the original", async () => {
    const { value } = await fixture();
    expect(isInpaintCropEnabled({ type: "image" })).toBe(false);
    expect(isInpaintCropEnabled({ type: "image", inpaintCrop: "true" })).toBe(false);
    expect(isInpaintCropEnabled({ type: "text", inpaintCrop: true })).toBe(false);
    expect(isInpaintCropEnabled({ type: "image_mask", inpaintCrop: true })).toBe(true);
    expect(imageValueForUi([value], { type: "image" })).toEqual([value.cropInpaint.original]);
    const input = {
      enabled: { id: "5-image", ui: { type: "image", inpaintCrop: true } },
      disabled: { id: "6-image", ui: { type: "image" } },
      col: { ui: { type: "col", col: { photo: { id: "7-image", ui: { type: "image" } } } } },
      menu: { ui: { type: "menu-sub", choices: ["a"], value: "a", sub: {
        a: { photo: { id: "8-image", ui: { type: "image", inpaintCrop: true } } }
      } } }
    };
    const values = { "5-image": value, "6-image": value, "7-image": value, "8-image": value };
    const mapped = mapValuesToRequest({ input }, values);
    expect(mapped["5-image"].cropInpaint).toEqual(value.cropInpaint);
    expect(mapped["6-image"]).toEqual(value.cropInpaint.original);
    expect(mapped["7-image"]).toEqual(value.cropInpaint.original);
    expect(mapped["8-image"].cropInpaint).toEqual(value.cropInpaint);
    expect(requestPayload([input.enabled, input.disabled], values)).toEqual({
      "5-image": value, "6-image": value.cropInpaint.original
    });
    const ports = deriveStepPorts({ input }).inputs;
    expect(ports.find(port => port.valueKey === "5-image").inpaintCrop).toBe(true);
    expect(ports.find(port => port.valueKey === "6-image").inpaintCrop).toBe(false);
    expect(ports.find(port => port.valueKey === "8-image").inpaintCrop).toBe(true);
  });

  test("allows repeated mapping but rejects ambiguous crop sources before submission", async () => {
    const { value, paths } = await fixture();
    expect(findCropInpaint({ a: value, b: structuredClone(value) })).toEqual(value);
    const other = structuredClone(value);
    other.cropInpaint.rect.x = 1;
    await expect(prepareCropInpaint({ a: value, b: other }, paths)).rejects.toThrow(/một vùng/);
    expect(await prepareCropInpaint({ a: "ordinary image" }, paths)).toBeNull();
  });

  test("resizes results into exact coordinates, preserves every pixel outside crop, and snapshots original", async () => {
    const { value, paths } = await fixture();
    const stitch = await prepareCropInpaint({ image: value }, paths);
    // Source changes during a long run must not change its original snapshot.
    await writeFile(path.join(tempDir, "original.png"), await png(12, 10, 0x000000ff));
    const out = await Jimp.read(await stitch(await png(24, 16, 0xff0000ff)));
    expect([out.bitmap.width, out.bitmap.height]).toEqual([12, 10]);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) {
      expect(out.getPixelColor(x, y)).toBe(x >= 3 && x < 9 && y >= 2 && y < 6 ? 0xff0000ff : 0x224466ff);
    }
    const second = await Jimp.read(await stitch(await png(6, 4, 0x00ff00ff)));
    expect(second.getPixelColor(3, 2)).toBe(0x00ff00ff);
    expect(second.getPixelColor(0, 0)).toBe(0x224466ff);
  });

  test("transparent output preserves original; partial alpha blends with it", async () => {
    const { value, paths } = await fixture();
    const stitch = await prepareCropInpaint({ image: value }, paths);
    const transparent = await Jimp.read(await stitch(await png(6, 4, 0xff000000)));
    expect(transparent.getPixelColor(4, 3)).toBe(0x224466ff);
    const partial = await Jimp.read(await stitch(await png(6, 4, 0xff000080)));
    expect([...partial.bitmap.data.subarray((3 * 12 + 4) * 4, (3 * 12 + 4) * 4 + 4)])
      .toEqual([145, 34, 51, 255]);
  });

  test("ComfyUI mask alpha restricts replacement to the painted region", async () => {
    const { value, paths } = await fixture();
    const mask = new Jimp({ width: 6, height: 4, color: 0xffffffff });
    mask.setPixelColor(0xffffff00, 2, 1);
    value.maskDataUrl = `data:image/png;base64,${(await mask.getBuffer("image/png")).toString("base64")}`;
    const stitch = await prepareCropInpaint({ image: value }, paths);
    const out = await Jimp.read(await stitch(await png(6, 4, 0xff0000ff)));
    expect(out.getPixelColor(5, 3)).toBe(0xff0000ff);
    expect(out.getPixelColor(4, 3)).toBe(0x224466ff);
    expect(out.getPixelColor(0, 0)).toBe(0x224466ff);
  });

  test("feathers crop edges without changing pixels outside the region", async () => {
    const { value, paths } = await fixture();
    value.cropInpaint.blendPixels = 2;
    const stitch = await prepareCropInpaint({ image: value }, paths);
    const out = await Jimp.read(await stitch(await png(6, 4, 0xff0000ff)));
    const channel = (x, y) => out.bitmap.data[(y * 12 + x) * 4];
    expect(channel(3, 2)).toBeGreaterThan(34);
    expect(channel(3, 2)).toBeLessThan(channel(5, 3));
    expect(out.getPixelColor(2, 2)).toBe(0x224466ff);
  });

  test("rejects stale dimensions, out of bounds crops and unreadable output", async () => {
    const { value, paths } = await fixture();
    const stitch = await prepareCropInpaint({ image: value }, paths);
    await expect(stitch(Buffer.from("invalid image"))).rejects.toThrow(/Không ghép được/);
    value.cropInpaint.rect.x = 100;
    await expect(prepareCropInpaint({ image: value }, paths)).rejects.toThrow(/không hợp lệ/);
    value.cropInpaint.originalWidth = 99;
    await expect(prepareCropInpaint({ image: value }, paths)).rejects.toThrow(/đổi kích thước/);
  });

  test("ComfyUI receives the cropped file, leaving stitch metadata out of workflow", async () => {
    const { value, paths } = await fixture();
    let uploaded;
    const workflow = { 5: { inputs: { image: "" } } };
    await setWorkflowValue(workflow, "5-image", value, {}, undefined, {
      ...paths,
      uploadImageToComfy: async (_target, payload) => { uploaded = await Jimp.read(payload.buffer); return { name: "uploaded_crop.png" }; }
    });
    expect([uploaded.bitmap.width, uploaded.bitmap.height]).toEqual([6, 4]);
    expect(workflow[5].inputs.image).toBe("uploaded_crop.png");
    expect(JSON.stringify(workflow)).not.toContain("cropInpaint");
  });

  test("RunningHub uploads only cropped pixels and strips stitch metadata from nodeInfoList", async () => {
    const { value, paths } = await fixture();
    let uploaded;
    vi.stubGlobal("fetch", async (_url, options) => {
      const file = options.body.get("file");
      uploaded = await Jimp.read(Buffer.from(await file.arrayBuffer()));
      return new Response(JSON.stringify({ code: 0, data: { fileName: "api/cropped.png" } }));
    });
    const nodes = await prepareNodeInfoList("test-key", [{ nodeId: "5", fieldName: "image", fieldType: "IMAGE", fieldValue: value }], paths);
    expect([uploaded.bitmap.width, uploaded.bitmap.height]).toEqual([6, 4]);
    expect(nodes[0].fieldValue).toBe("api/cropped.png");
    expect(JSON.stringify(nodes)).not.toContain("cropInpaint");
  });
});
