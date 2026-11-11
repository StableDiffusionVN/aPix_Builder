import { describe, expect, it } from "vitest";
import { Jimp } from "jimp";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getOutputThumb, removeOutputThumbs, THUMB_SIZE, warmOutputThumb } from "../server/lib/outputThumbs.js";
import { outputThumbUrl } from "../src/lib/mediaKind.js";

describe("output thumbnails", () => {
  it("creates a small cached JPEG for a large output and removes it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "apix-thumb-"));
    const img = new Jimp({ width: 1600, height: 1000, color: 0xff8800ff });
    const data = img.bitmap.data;
    for (let i = 0; i < data.length; i++) data[i] = (i % 4 === 3) ? 255 : (Math.imul(i, 2654435761) >>> 24);
    await img.write(path.join(dir, "big.png"));
    const st = await stat(path.join(dir, "big.png"));
    expect(st.size).toBeGreaterThan(256 * 1024);

    const [a, b] = await Promise.all([getOutputThumb(dir, "big.png", st), getOutputThumb(dir, "big.png", st)]);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    const thumb = await Jimp.read(a);
    expect(Math.min(thumb.bitmap.width, thumb.bitmap.height)).toBe(THUMB_SIZE);
    expect((await stat(a)).size).toBeLessThan(st.size / 5);

    await removeOutputThumbs(dir, "big.png");
    expect(await readdir(path.join(dir, ".thumbs"))).toEqual([]);

    // Saving an output pre-builds its thumbnail in the background.
    warmOutputThumb(dir, "big.png");
    for (let i = 0; i < 100 && !(await readdir(path.join(dir, ".thumbs"))).length; i++) await new Promise(r => setTimeout(r, 50));
    expect((await readdir(path.join(dir, ".thumbs"))).length).toBe(1);
    await removeOutputThumbs(dir, "big.png");
    expect(await readdir(path.join(dir, ".thumbs"))).toEqual([]);
  }, 30000);

  it("skips small or unsupported files", async () => {
    expect(await getOutputThumb("/x", "a.png", { size: 1000 })).toBeNull();
    expect(await getOutputThumb("/x", "a.webp", { size: 10_000_000 })).toBeNull();
  });

  it("only rewrites local output urls", () => {
    expect(outputThumbUrl("/api/output-image?name=a.png")).toBe("/api/output-image?name=a.png&thumb=1");
    expect(outputThumbUrl("/api/output-image?name=a.png&thumb=1")).toBe("/api/output-image?name=a.png&thumb=1");
    expect(outputThumbUrl("https://x/y.png")).toBe("https://x/y.png");
  });
});
