import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { createLicenseServer } from "../license-server/server.mjs";
import { LicenseStore } from "../license-server/licenseStore.mjs";
import { syncDefaultTemplates } from "../server/lib/defaultTemplates.js";
import { createTemplateService } from "../server/lib/templateService.js";

const api = JSON.stringify({ 1: { class_type: "SaveImage", inputs: {} } });
const zip = (id, name) => Buffer.from(zipSync({
  [`${id}/app_build.yaml`]: strToU8(YAML.stringify({ app: { name }, input: {}, output: { result: { id: "1" } } })),
  [`${id}/api.json`]: strToU8(api)
}));
const writeTemplate = async (root, id, name) => {
  await mkdir(path.join(root, id), { recursive: true });
  await writeFile(path.join(root, id, "app_build.yaml"), YAML.stringify({ app: { name }, input: {}, output: { result: { id: "1" } } }));
  await writeFile(path.join(root, id, "api.json"), api);
};

let licenseDir;
let server;
let url;
let dir;
let paths;
let bundled;

beforeAll(async () => {
  licenseDir = await mkdtemp(path.join(os.tmpdir(), "apix-defaults-license-"));
  ({ server } = createLicenseServer({ store: new LicenseStore(licenseDir), secret: "s".repeat(24), hfToken: "x", dataDir: licenseDir }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server?.close();
  await rm(licenseDir, { recursive: true, force: true });
});
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "apix-defaults-"));
  paths = { configDir: path.join(dir, "config") };
  bundled = path.join(dir, "bundled");
  await mkdir(paths.configDir, { recursive: true });
  await rm(path.join(licenseDir, "defaults"), { recursive: true, force: true });
  await mkdir(path.join(licenseDir, "defaults"), { recursive: true });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const publish = async (id, name) => writeFile(path.join(licenseDir, "defaults", `${id}.zip`), zip(id, name));
const sync = () => syncDefaultTemplates(paths, { licenseUrl: url });
const registry = () => createTemplateService({ configDir: paths.configDir, defaultDir: bundled, templatesDir: path.join(paths.configDir, "templates") }).loadTemplateRegistry();

describe("default templates from the license server", () => {
  test("listing follows order.json, the first is the default template", async () => {
    await publish("b-temp", "B");
    await publish("a-temp", "A");
    await writeFile(path.join(licenseDir, "defaults", "order.json"), JSON.stringify(["b-temp"]));
    const response = await fetch(`${url}/v1/defaults/list`);
    expect((await response.json()).templates.map(item => item.id)).toEqual(["b-temp", "a-temp"]);
    expect((await fetch(`${url}/v1/defaults/download?id=../x`)).status).toBe(400);
  });

  test("new and edited templates arrive without an app update; removed ones disappear", async () => {
    await writeTemplate(bundled, "old-temp", "Old bundled");
    await publish("new-temp", "New");
    expect(await sync()).toMatchObject({ changed: true, templates: [{ id: "new-temp", name: "New" }] });
    let result = await registry();
    expect(result.templates.map(item => item.id)).toEqual(["new-temp"]); // the server no longer lists old-temp
    expect(result.default).toBe("new-temp");
    expect(result.templates[0].isDefault).toBe(true);

    expect((await sync()).changed).toBe(false);
    await publish("new-temp", "New v2");
    await sync();
    result = await registry();
    expect(result.templates[0].name).toBe("New v2");

    await publish("other", "Other");
    await rm(path.join(licenseDir, "defaults", "new-temp.zip"));
    await sync();
    expect((await registry()).templates.map(item => item.id)).toEqual(["other"]);
  });

  test("offline or nothing published: bundled defaults stay", async () => {
    await writeTemplate(bundled, "old-temp", "Old bundled");
    expect(await syncDefaultTemplates(paths, { licenseUrl: "http://127.0.0.1:9" })).toMatchObject({ offline: true });
    expect(await sync()).toMatchObject({ offline: true }); // empty list on the server
    expect((await registry()).templates.map(item => item.id)).toEqual(["old-temp"]);
  });
});
