import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { createLicenseServer } from "../license-server/server.mjs";
import { LicenseStore } from "../license-server/licenseStore.mjs";
import { createTemplateService } from "../server/lib/templateService.js";
import { isKnownVipTemplate, syncVipTemplates, vipTemplatesDir } from "../server/lib/vipTemplates.js";

const yaml = YAML.stringify({ app: { name: "Swap VIP" }, input: {}, output: { result: { id: "1" } } });
const api = JSON.stringify({ 1: { class_type: "SaveImage", inputs: {} } });
const zip = (extra = {}) => Buffer.from(zipSync({
  "sdvn-swap/app_build.yaml": strToU8(yaml),
  "sdvn-swap/api.json": strToU8(api),
  ...extra
}));

let dir;
let licenseDir;
let server;
let url;
let key;
let store;
let paths;

beforeAll(async () => {
  licenseDir = await mkdtemp(path.join(os.tmpdir(), "apix-vip-license-"));
  store = new LicenseStore(licenseDir);
  ({ server } = createLicenseServer({ store, secret: "s".repeat(24), hfToken: "x", dataDir: licenseDir }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  await mkdir(path.join(licenseDir, "vip"), { recursive: true });
  await writeFile(path.join(licenseDir, "vip", "sdvn-swap.zip"), zip());
  ({ key } = await store.add({ label: "t" }));
});
afterAll(async () => {
  server?.close();
  await rm(licenseDir, { recursive: true, force: true });
});
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "apix-vip-"));
  paths = { configDir: path.join(dir, "config"), personalDataDir: dir };
  await mkdir(paths.configDir, { recursive: true });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const saveKey = value => writeFile(path.join(dir, "app-settings.json"), JSON.stringify({ license: { apixKey: value } }));
const sync = options => syncVipTemplates(paths, { licenseUrl: url, ...options });
const service = () => createTemplateService({ configDir: paths.configDir, defaultDir: path.join(dir, "nodefault"), templatesDir: path.join(paths.configDir, "templates") });

describe("VIP workflows", () => {
  test("appear with a valid key, read-only and not exportable", async () => {
    await saveKey(key);
    const result = await sync();
    expect(result).toMatchObject({ changed: true, workflows: [{ id: "sdvn-swap", name: "Swap VIP" }] });
    const templates = service();
    const registry = await templates.loadTemplateRegistry();
    expect(registry.templates.find(item => item.id === "sdvn-swap")).toMatchObject({ vip: true, isDefault: true });
    await expect(templates.getTemplateExportSource("sdvn-swap")).rejects.toThrow(/VIP/);
    await expect(templates.resolveSaveTargetRoot("sdvn-swap")).rejects.toThrow(/VIP/);
    expect((await sync()).changed).toBe(false); // unchanged zip: nothing to do
  });

  test("disappear without a key or with a rejected key, and never fall back to another workflow", async () => {
    await saveKey(key);
    await sync();
    await saveKey("apx_wrong");
    const result = await sync();
    expect(result).toEqual({ workflows: [], changed: true });
    expect(existsSync(path.join(vipTemplatesDir(paths.configDir), "sdvn-swap"))).toBe(false);
    expect(await isKnownVipTemplate(paths.configDir, "sdvn-swap")).toBe(true);
    const other = path.join(paths.configDir, "templates", "other");
    await mkdir(other, { recursive: true });
    await writeFile(path.join(other, "app_build.yaml"), yaml);
    await writeFile(path.join(other, "api.json"), api);
    await expect(service().loadConfig("sdvn-swap")).rejects.toThrow(/mã aPix/);
  });

  test("offline keeps what is installed", async () => {
    await saveKey(key);
    await sync();
    const result = await syncVipTemplates(paths, { licenseUrl: "http://127.0.0.1:1" });
    expect(result).toMatchObject({ offline: true, changed: false, workflows: [{ id: "sdvn-swap" }] });
  });

  test("license server refuses requests without a session", async () => {
    const response = await fetch(`${url}/v1/vip/download`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "nope", id: "sdvn-swap" }) });
    expect(response.status).toBe(401);
  });

  test("rejects unsafe paths in a ZIP", async () => {
    const { installVipZip } = await import("../server/lib/vipTemplates.js");
    const bad = Buffer.from(zipSync({ "../evil.txt": strToU8("x"), "app_build.yaml": strToU8(yaml) }));
    await expect(installVipZip(vipTemplatesDir(paths.configDir), "bad", bad, "0")).rejects.toThrow(/không hợp lệ/);
    expect(existsSync(path.join(paths.configDir, "evil.txt"))).toBe(false);
  });
});
