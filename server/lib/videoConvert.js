// MOV (QuickTime) → MP4 before a video goes to ComfyUI, so every video node accepts it.
// Uses an ffmpeg found on this machine (APIX_FFMPEG, PATH, Homebrew…); without one the file is
// sent unchanged (ComfyUI's own LoadVideo still reads most MOV files).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CANDIDATES = process.platform === "win32"
  ? ["ffmpeg.exe", "C:\\ffmpeg\\bin\\ffmpeg.exe"]
  : ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg", "ffmpeg"];

let ffmpegPath;

function run(file, args, timeout = 10 * 60 * 1000) {
  return new Promise(resolve => {
    execFile(file, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (error, _stdout, stderr) => {
      resolve({ ok: !error, stderr: String(stderr || "") });
    });
  });
}

export async function findFfmpeg() {
  if (ffmpegPath !== undefined) return ffmpegPath;
  for (const candidate of [process.env.APIX_FFMPEG, ...CANDIDATES].filter(Boolean)) {
    if (path.isAbsolute(candidate) && !existsSync(candidate)) continue;
    if ((await run(candidate, ["-version"], 10000)).ok) {
      ffmpegPath = candidate;
      return ffmpegPath;
    }
  }
  ffmpegPath = null;
  return ffmpegPath;
}

export function isQuickTime(mimeType = "") {
  return /^video\/(quicktime|x-quicktime)$/i.test(String(mimeType));
}

/**
 * upload ({ mimeType, buffer, index }) → the same upload as MP4 when it is a MOV and ffmpeg exists.
 * Remux first (fast, lossless); re-encode to H.264/AAC when the codecs do not fit MP4 (ProRes…).
 */
export async function convertMovToMp4(upload, { onLog } = {}) {
  if (!isQuickTime(upload?.mimeType)) return upload;
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) {
    onLog?.("Không tìm thấy ffmpeg — gửi file MOV nguyên bản");
    return upload;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "apix-mov-"));
  try {
    const input = path.join(dir, "input.mov");
    const output = path.join(dir, "output.mp4");
    await writeFile(input, upload.buffer);
    const base = ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-movflags", "+faststart"];
    let result = await run(ffmpeg, [...base, "-c:v", "copy", "-c:a", "aac", output]);
    if (!result.ok) {
      result = await run(ffmpeg, [...base, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", output]);
    }
    if (!result.ok) {
      onLog?.(`Không chuyển được MOV sang MP4 — gửi file gốc (${result.stderr.trim().split("\n").pop() || "ffmpeg lỗi"})`);
      return upload;
    }
    return { ...upload, mimeType: "video/mp4", buffer: await readFile(output) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
