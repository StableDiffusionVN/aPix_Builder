import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryOutput = path.join(tmpdir(), "apix-builder-release-win");
const releaseDir = path.join(root, "release");
const electronBuilder = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";
const electronBuilderPath = path.join(root, "node_modules", ".bin", electronBuilder);

rmSync(temporaryOutput, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

for (const name of readdirSync(releaseDir)) {
  if (name.endsWith("-portable.exe") || name.endsWith("-portable.exe.blockmap")) {
    rmSync(path.join(releaseDir, name), { force: true });
  }
}

const build = spawnSync(
  electronBuilderPath,
  ["--win", "portable", "--x64", `--config.directories.output=${temporaryOutput}`],
  { cwd: root, stdio: "inherit" }
);

if (build.status !== 0) {
  process.exit(build.status || 1);
}

const artifacts = readdirSync(temporaryOutput)
  .filter(name => name.endsWith("-portable.exe") || name.endsWith("-portable.exe.blockmap"));

if (!artifacts.some(name => name.endsWith("-portable.exe"))) {
  console.error("Windows build completed without producing a portable .exe artifact.");
  process.exit(1);
}

for (const artifact of artifacts) {
  cpSync(path.join(temporaryOutput, artifact), path.join(releaseDir, artifact));
}

rmSync(temporaryOutput, { recursive: true, force: true });
console.log(`Portable Windows build copied to ${releaseDir}`);
