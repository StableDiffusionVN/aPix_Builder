import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { pruneUnusedVariantFiles, unusedVariantFiles } from "../server/lib/workflowVariants.js";
import { archiveTemplateDirectory } from "../server/lib/templateArchive.js";

const config = {
  input: {
    mode: {
      id: "1",
      ui: {
        type: "menu-sub",
        choices: "Auto Swapface\n+ Upscale",
        workflows: { "Auto Swapface": { file: "workflows/swap_new.json" } }
      }
    }
  }
};

let dir;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function templateDir(files) {
  dir = await mkdtemp(path.join(os.tmpdir(), "apix-variants-"));
  await mkdir(path.join(dir, "workflows"));
  for (const file of files) await writeFile(path.join(dir, file), "{}");
  return dir;
}

describe("option workflow cleanup", () => {
  it("finds and deletes JSONs no option uses any more", async () => {
    const root = await templateDir(["api.json", "app_build.yaml", "workflows/swap_new.json", "workflows/swap_old.json", "workflows/upscale_old.json"]);
    expect((await unusedVariantFiles(root, config)).sort()).toEqual(["workflows/swap_old.json", "workflows/upscale_old.json"]);
    await pruneUnusedVariantFiles(root, config);
    expect(await readdir(path.join(root, "workflows"))).toEqual(["swap_new.json"]);
  });

  it("removes the workflows folder when no option has its own JSON", async () => {
    const root = await templateDir(["api.json", "workflows/swap_old.json"]);
    await pruneUnusedVariantFiles(root, { input: {} });
    expect(await readdir(root)).toEqual(["api.json"]);
  });

  it("leaves excluded files out of the ZIP", async () => {
    const root = await templateDir(["api.json", "workflows/swap_new.json", "workflows/swap_old.json"]);
    const zip = await archiveTemplateDirectory(root, "tpl", { exclude: await unusedVariantFiles(root, config) });
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(["tpl/api.json", "tpl/workflows/swap_new.json"]);
  });
});
