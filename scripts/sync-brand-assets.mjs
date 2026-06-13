import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = path.join(root, "_local", "apix.iconset");
const buildDir = path.join(root, "build");
const publicDir = path.join(root, "public");

function fail(message) {
  console.error(`[sync:brand] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || `${command} ${args.join(" ")} failed`);
  }
}

function requireSource(relativePath) {
  const absolutePath = path.join(sourceDir, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`Missing source asset: _local/apix.iconset/${relativePath}`);
  }
  return absolutePath;
}

if (!existsSync(sourceDir)) {
  fail("Missing _local/apix.iconset — copy the master icon set there first.");
}

mkdirSync(buildDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const tempIconset = path.join(buildDir, ".apix.iconset");
rmSync(tempIconset, { recursive: true, force: true });
mkdirSync(tempIconset);

for (const name of readdirSync(sourceDir)) {
  if (/^icon_.*\.png$/i.test(name)) {
    cpSync(path.join(sourceDir, name), path.join(tempIconset, name));
  }
}

const desktopIcon = path.join(buildDir, "icon.icns");
run("/usr/bin/iconutil", ["-c", "icns", tempIconset, "-o", desktopIcon]);
rmSync(tempIconset, { recursive: true, force: true });

const faviconPath = path.join(publicDir, "favicon.png");
copyFileSync(requireSource("icon_256x256.png"), faviconPath);

console.log("Synced brand assets:");
console.log(`  ${path.relative(root, desktopIcon)} (macOS DMG + Windows portable)`);
console.log(`  ${path.relative(root, faviconPath)} (tab browser, notification)`);
console.log("  public/sdvn-mark.png + sdvn-mark-light.png (top bar, waiting screen — giữ nguyên, không ghi đè)");
