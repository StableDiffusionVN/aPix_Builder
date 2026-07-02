import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { unzipSync } from "fflate";
import { archiveTemplateDirectory, isInsideAsar } from "../server/lib/templateArchive.js";

describe("template archive export", () => {
  test("detects Electron asar bundle paths", () => {
    expect(isInsideAsar("/Applications/aPix Builder.app/Contents/Resources/app.asar/config/default/foo")).toBe(true);
    expect(isInsideAsar(path.join("/tmp", "project", "config", "default", "foo"))).toBe(false);
  });

  test("zips nested template files (kể cả đường dẫn app.asar) giữ cấu trúc thư mục", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "apix-template-export-asar-"));
    const templateDir = path.join(root, "aPix Builder.app", "Contents", "Resources", "app.asar", "config", "default", "my-template");
    const nestedDir = path.join(templateDir, "assets");
    await mkdir(nestedDir, { recursive: true });
    await writeFile(path.join(templateDir, "app_build.yaml"), "app:\n  name: Demo\n");
    await writeFile(path.join(templateDir, "api.json"), "{}\n");
    await writeFile(path.join(nestedDir, "readme.txt"), "nested\n");

    const archive = await archiveTemplateDirectory(templateDir);
    expect(archive[0]).toBe(0x50); // 'P'
    expect(archive[1]).toBe(0x4b); // 'K'
    const entries = unzipSync(new Uint8Array(archive));
    expect(Object.keys(entries).sort()).toEqual([
      "my-template/api.json",
      "my-template/app_build.yaml",
      "my-template/assets/readme.txt"
    ]);

    await rm(root, { recursive: true, force: true });
  });

  test("packages a template directory as zip ôm thư mục gốc", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "apix-template-export-"));
    const templateDir = path.join(root, "my-template");
    await mkdir(templateDir, { recursive: true });
    await writeFile(path.join(templateDir, "app_build.yaml"), "app:\n  name: Demo\n");
    await writeFile(path.join(templateDir, "api.json"), "{}\n");

    const archive = await archiveTemplateDirectory(templateDir);
    expect(archive[0]).toBe(0x50);
    expect(archive[1]).toBe(0x4b);
    const entries = unzipSync(new Uint8Array(archive));
    expect(new TextDecoder().decode(entries["my-template/app_build.yaml"])).toContain("Demo");

    await rm(root, { recursive: true, force: true });
  });
});
