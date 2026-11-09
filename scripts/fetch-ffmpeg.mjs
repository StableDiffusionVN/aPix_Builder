// Downloads the ffmpeg binary bundled with the desktop app (MOV → MP4 for video inputs).
// Static builds from github.com/eugeneware/ffmpeg-static (GPL — the LICENSE/README ship with it).
// Usage: node scripts/fetch-ffmpeg.mjs [darwin-arm64 win32-x64 …]  (default: this machine)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const RELEASE = "b6.1.1";
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = process.argv.slice(2).length ? process.argv.slice(2) : [`${process.platform}-${process.arch}`];

async function download(url) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url).catch(error => ({ ok: false, status: error.message }));
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (attempt >= 4) throw new Error(`Không tải được ${url}: ${response.status}`);
    await new Promise(resolve => setTimeout(resolve, attempt * 3000));
  }
}

for (const target of targets) {
  const dir = path.join(root, "vendor", "ffmpeg", target);
  const binary = path.join(dir, target.startsWith("win32") ? "ffmpeg.exe" : "ffmpeg");
  if (existsSync(binary)) {
    console.log(`ffmpeg ${target}: đã có (${path.relative(root, binary)})`);
    continue;
  }
  await mkdir(dir, { recursive: true });
  console.log(`ffmpeg ${target}: đang tải ${RELEASE}…`);
  const data = gunzipSync(await download(`${BASE}/ffmpeg-${target}.gz`));
  await writeFile(`${binary}.tmp`, data);
  await chmod(`${binary}.tmp`, 0o755);
  await rename(`${binary}.tmp`, binary);
  for (const doc of ["LICENSE", "README"]) {
    await writeFile(path.join(dir, `ffmpeg-${doc}.txt`), await download(`${BASE}/${target}.${doc}`));
  }
  if (target === `${process.platform}-${process.arch}`) {
    console.log(execFileSync(binary, ["-version"]).toString().split("\n")[0]);
  }
}
