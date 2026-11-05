import { afterEach, expect, test, vi } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Jimp } from "jimp";
import { createStorageService } from "../server/services/storageService.js";
import { localImageRefToUpload, parseLocalImageRef } from "../server/lib/localImageRef.js";
import { prepareNodeInfoList } from "../server/lib/runningHubClient.js";
import { setWorkflowValue } from "../server/lib/workflowPatcher.js";
import { prepareCropInpaint } from "../server/lib/cropInpaint.js";

let root;
afterEach(async () => { vi.unstubAllGlobals(); if (root) await rm(root, { recursive: true, force: true }); root = null; });
async function fixture(beforeInit = async () => {}) {
  root = await mkdtemp(path.join(os.tmpdir(), "apix-private-inpaint-"));
  let response;
  let protectedValues = [];
  const storage = createStorageService({ resourceRoot: root, dataRoot: root,
    readBody: async req => JSON.stringify(req.body),
    send: (_res, status, body) => { response = { status, ...body }; },
    hasActiveRuns: () => false, getProtectedInpaintValues: () => protectedValues
  });
  await beforeInit(root);
  await storage.init();
  const png = await new Jimp({ width: 12, height: 10, color: 0x224466ff }).getBuffer("image/png");
  const upload = async (buffer = png) => {
    await storage.handleInpaintUpload({ body: { dataUrl: `data:image/png;base64,${buffer.toString("base64")}` } }, {});
    expect(response.status).toBe(200);
    return { kind: "input-image", ...response.image };
  };
  return { storage, upload, png, response: () => response, protect: values => { protectedValues = values; } };
}

test("private images stay outside the input library and survive settings serialization", async () => {
  const { storage, upload, png } = await fixture();
  await writeFile(path.join(storage.getPaths().inputDir, "user-photo.png"), png);
  const image = await upload();
  expect((await storage.listInputImages()).map(item => item.name)).toEqual(["user-photo.png"]);
  const restored = JSON.parse(JSON.stringify(image));
  const ref = parseLocalImageRef(restored.url);
  expect(ref.kind).toBe("inpaint");
  expect((await localImageRefToUpload(ref, storage.getPaths())).buffer).toEqual(png);
  await storage.writeOutputHistory([{ id: "run-1", values: { image: restored }, outputs: [] }]);
  expect((await storage.readOutputHistory())[0].values.image.url).toBe(image.url);
});

test("private crop + mask upload to ComfyUI and stitch against a private original", async () => {
  const { storage, upload } = await fixture();
  const original = await upload();
  const cropPng = await new Jimp({ width: 6, height: 4, color: 0x224466ff }).getBuffer("image/png");
  const crop = await upload(cropPng);
  const mask = await upload(await new Jimp({ width: 6, height: 4, color: 0xffffff00 }).getBuffer("image/png"));
  const value = { ...crop, maskDataUrl: mask.url, cropInpaint: { original, originalWidth: 12, originalHeight: 10, rect: { x: 3, y: 2, width: 6, height: 4 }, blendPixels: 0 } };
  const workflow = { 5: { inputs: { image: "" } } };
  let uploadedMask;
  await setWorkflowValue(workflow, "5-image", value, {}, null, { ...storage.getPaths(),
    parseDataUrl: () => null,
    uploadImageToComfy: async (_target, image) => { expect(image.buffer).toEqual(cropPng); return { name: "crop.png" }; },
    uploadMaskToComfy: async (_target, payload) => { uploadedMask = await Jimp.read(payload.buffer); return { name: "masked.png" }; }
  });
  expect(uploadedMask.bitmap.width).toBe(6);
  expect(workflow[5].inputs.image).toBe("masked.png");
  const stitch = await prepareCropInpaint({ image: value }, storage.getPaths());
  const patch = await new Jimp({ width: 6, height: 4, color: 0xff0000ff }).getBuffer("image/png");
  const output = await Jimp.read(await stitch(patch));
  expect(output.getPixelColor(3, 2)).toBe(0xff0000ff);
  expect(output.getPixelColor(0, 0)).toBe(0x224466ff);
});

test("RunningHub uploads private crop files without fetching their URLs remotely", async () => {
  const { storage, upload, png } = await fixture();
  const image = await upload();
  vi.stubGlobal("fetch", async (_url, options) => {
    expect(Buffer.from(await options.body.get("file").arrayBuffer())).toEqual(png);
    return new Response(JSON.stringify({ code: 0, data: { fileName: "api/private.png" } }));
  });
  const nodes = await prepareNodeInfoList("test", [{ nodeId: "5", fieldName: "image", fieldType: "IMAGE", fieldValue: image }], storage.getPaths());
  expect(nodes[0].fieldValue).toBe("api/private.png");
});

test("history deletion preserves shared assets until their last reference is deleted", async () => {
  const { storage, upload, png } = await fixture();
  const crop = await upload(); const original = await upload(); const mask = await upload();
  await writeFile(path.join(storage.getPaths().inputDir, "user-photo.png"), png);
  const value = { ...crop, maskDataUrl: mask.url, cropInpaint: { original } };
  await storage.writeOutputHistory([
    { id: "first", values: { image: value }, outputs: [] },
    { id: "canvas-group", runs: [{ values: { image: value } }], outputs: [] }
  ]);
  const assetPath = image => path.join(storage.getPaths().inputDir, ".inpaint", image.name);
  await storage.handleDeleteOutputHistory({ body: { id: "first" } }, {});
  await expect(access(assetPath(crop))).resolves.toBeUndefined();
  await storage.handleDeleteOutputHistory({ body: { id: "canvas-group" } }, {});
  for (const image of [crop, original, mask]) await expect(access(assetPath(image))).rejects.toThrow();
  await expect(access(path.join(storage.getPaths().inputDir, "user-photo.png"))).resolves.toBeUndefined();
});

test("cleanup waits for active/queued runs that still need a deleted history's crop", async () => {
  const { storage, upload, protect } = await fixture();
  const crop = await upload();
  await storage.writeOutputHistory([{ id: "first", values: { image: crop }, outputs: [] }]);
  protect([{ image: crop }]);
  await storage.handleDeleteOutputHistory({ body: { id: "first" } }, {});
  const filename = path.join(storage.getPaths().inputDir, ".inpaint", crop.name);
  await expect(access(filename)).resolves.toBeUndefined();
  protect([]); await storage.cleanupInpaintAssets();
  await expect(access(filename)).rejects.toThrow();
});

test("migrates old generated crops while their historical input-image URLs still work", async () => {
  const bytes = await new Jimp({ width: 2, height: 2, color: 0x00ff00ff }).getBuffer("image/png");
  const name = "inpaint_crop_1793078881523.png";
  const { storage } = await fixture(async dir => {
    await mkdir(path.join(dir, "user/input"), { recursive: true });
    await writeFile(path.join(dir, "user/input", name), bytes);
  });
  expect(await storage.listInputImages()).toEqual([]);
  expect(await readFile(path.join(storage.getPaths().inputDir, ".inpaint", name))).toEqual(bytes);
  expect((await localImageRefToUpload(parseLocalImageRef(`/api/input-image?name=${name}`), storage.getPaths())).buffer).toEqual(bytes);
  await storage.writeOutputHistory([{ id: "old", values: { image: { kind: "input-image", name, url: `/api/input-image?name=${name}` } }, outputs: [] }]);
  await storage.handleDeleteOutputHistory({ body: { id: "old" } }, {});
  await expect(access(path.join(storage.getPaths().inputDir, ".inpaint", name))).rejects.toThrow();
});
