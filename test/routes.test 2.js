import { expect, test } from "vitest";
import { createImagesRoutes } from "../server/routes/images.js";
import { createRunRoutes } from "../server/routes/run.js";
import { createStorageRoutes } from "../server/routes/storage.js";
import { createTemplateRoutes } from "../server/routes/templates.js";

function request(method, pathname) {
  return {
    req: { method },
    res: {},
    url: new URL(`http://localhost${pathname}`)
  };
}

test("storage routes dispatch only supported methods", async () => {
  const calls = [];
  const route = createStorageRoutes({
    handleAppSettings: () => calls.push("app"),
    handleOpenDirectory: () => calls.push("open"),
    handleStorageSettings: () => calls.push("storage")
  });
  expect(await route(...Object.values(request("GET", "/api/storage-settings")))).toBe(true);
  expect(await route(...Object.values(request("DELETE", "/api/storage-settings")))).toBe(false);
  expect(calls).toEqual(["storage"]);
});

test("template registry route uses the requested scope", async () => {
  const sent = [];
  const route = createTemplateRoutes({
    TEMPLATE_SCOPES: { runninghubWf: "runninghub-wf" },
    assertTemplateWorkflow() {},
    handleTemplateDelete() {},
    handleTemplateEditor() {},
    handleTemplateSave() {},
    send(_res, status, body) { sent.push({ status, body }); },
    templateScopeFromUrl: url => url.searchParams.get("scope"),
    templates: () => ({
      loadTemplateRegistry: scope => ({ scope })
    })
  });
  const args = request("GET", "/api/templates?scope=local");
  expect(await route(args.req, args.res, args.url)).toBe(true);
  expect(sent).toEqual([{ status: 200, body: { scope: "local" } }]);
});

test("run and image routes leave unrelated paths untouched", async () => {
  const noop = () => {};
  const runRoute = createRunRoutes({
    cancelQueueItems: noop,
    handleCancel: noop,
    handleComfyDiscovery: noop,
    handleComfyHealth: noop,
    handleComfyModels: noop,
    handleComfyView: noop,
    handleRun: noop,
    handleRunEvents: noop,
    normalizeComfyTarget: noop,
    readBody: noop,
    send: noop
  });
  const imageRoute = createImagesRoutes({
    handleDeleteInputImage: noop,
    handleDeleteOutputHistory: noop,
    handleInputFromUrl: noop,
    handleInputImage: noop,
    handleInputScanFolder: noop,
    handleInputUpload: noop,
    handleOutputImage: noop,
    handleReplaceOutputImage: noop,
    handleSaveColorAdjust: noop,
    handleSaveEditedOutput: noop,
    listInputImages: noop,
    readOutputHistory: noop,
    send: noop
  });
  const args = request("GET", "/api/unknown");
  expect(await runRoute(args.req, args.res, args.url)).toBe(false);
  expect(await imageRoute(args.req, args.res, args.url)).toBe(false);
});
