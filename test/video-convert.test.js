import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convertMovToMp4, findFfmpeg, isQuickTime } from "../server/lib/videoConvert.js";

describe("MOV → MP4", () => {
  it("only touches QuickTime uploads", async () => {
    expect(isQuickTime("video/quicktime")).toBe(true);
    expect(isQuickTime("video/mp4")).toBe(false);
    const mp4 = { kind: "upload", mimeType: "video/mp4", buffer: Buffer.from("x") };
    expect(await convertMovToMp4(mp4)).toBe(mp4);
  });

  it("converts a MOV when ffmpeg is installed", async () => {
    const ffmpeg = await findFfmpeg();
    if (!ffmpeg) return; // CI without ffmpeg: the upload is sent unchanged
    const dir = mkdtempSync(path.join(os.tmpdir(), "apix-mov-test-"));
    try {
      const mov = path.join(dir, "clip.mov");
      execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=12", "-t", "1", "-c:v", "prores_ks", mov]);
      const result = await convertMovToMp4({ kind: "upload", mimeType: "video/quicktime", buffer: readFileSync(mov), index: 0 });
      expect(result.mimeType).toBe("video/mp4");
      expect(result.buffer.subarray(4, 8).toString()).toBe("ftyp");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
