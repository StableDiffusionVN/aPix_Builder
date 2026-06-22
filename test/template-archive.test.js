import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { archiveTemplateDirectory } from "../server/lib/templateArchive.js";

describe("template archive export", () => {
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
