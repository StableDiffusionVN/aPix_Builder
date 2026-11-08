import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveComfyLayout } from "../electron/comfyLocal.mjs";

let dir;
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "apix-comfy-local-")); });
afterEach(() => rm(dir, { recursive: true, force: true }));
const touch = async file => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "");
};

describe("resolveComfyLayout", () => {
  test("a ComfyUI checkout, its parent, and its own venv", async () => {
    await touch(path.join(dir, "ComfyUI", "main.py"));
    expect(resolveComfyLayout(path.join(dir, "ComfyUI"))).toMatchObject({ comfyDir: path.join(dir, "ComfyUI"), python: null, portable: false });
    expect(resolveComfyLayout(dir).comfyDir).toBe(path.join(dir, "ComfyUI"));
    const venvPython = process.platform === "win32" ? path.join(dir, "ComfyUI", "venv", "Scripts", "python.exe") : path.join(dir, "ComfyUI", "venv", "bin", "python");
    await touch(venvPython);
    expect(resolveComfyLayout(dir).python).toBe(venvPython);
  });

  test("portable: python_embeded next to ComfyUI", async () => {
    await touch(path.join(dir, "ComfyUI", "main.py"));
    await touch(path.join(dir, "python_embeded", process.platform === "win32" ? "python.exe" : "bin/python"));
    expect(resolveComfyLayout(dir)).toMatchObject({ comfyDir: path.join(dir, "ComfyUI"), portable: true });
  });

  test("a folder without ComfyUI is refused", () => {
    expect(() => resolveComfyLayout(dir)).toThrow(/main\.py/);
    expect(() => resolveComfyLayout("")).toThrow();
  });
});
