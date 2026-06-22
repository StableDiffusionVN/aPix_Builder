import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { archiveTemplateDirectory, isInsideAsar } from "../server/lib/templateArchive.js";

describe("template archive export", () => {
  test("detects Electron asar bundle paths", () => {
    expect(isInsideAsar("/Applications/aPix Builder.app/Contents/Resources/app.asar/config/default/foo")).toBe(true);
    expect(isInsideAsar(path.join("/tmp", "project", "config", "default", "foo"))).toBe(false);
  });

  test("stages nested templates inside app.asar before tarring", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "apix-template-export-asar-"));
    const templateDir = path.join(root, "aPix Builder.app", "Contents", "Resources", "app.asar", "config", "default", "my-template");
    const nestedDir = path.join(templateDir, "assets");
    await mkdir(nestedDir, { recursive: true });
    await writeFile(path.join(templateDir, "app_build.yaml"), "app:\n  name: Demo\n");
    await writeFile(path.join(templateDir, "api.json"), "{}\n");
    await writeFile(path.join(nestedDir, "readme.txt"), "nested\n");

    const archive = await archiveTemplateDirectory(templateDir);
    expect(archive.length).toBeGreaterThan(0);
    expect(archive[0]).toBe(0x1f);
    expect(archive[1]).toBe(0x8b);

    await rm(root, { recursive: true, force: true });
  });

  test("packages a template directory as gzip tar", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "apix-template-export-"));
    const templateDir = path.join(root, "my-template");
    await mkdir(templateDir, { recursive: true });
    await writeFile(path.join(templateDir, "app_build.yaml"), "app:\n  name: Demo\n");
    await writeFile(path.join(templateDir, "api.json"), "{}\n");

    const archive = await archiveTemplateDirectory(templateDir);
    expect(archive.length).toBeGreaterThan(0);
    expect(archive[0]).toBe(0x1f);
    expect(archive[1]).toBe(0x8b);

    await rm(root, { recursive: true, force: true });
  });
});
