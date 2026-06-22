import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatVersionLabel } from "../shared/version.js";

const GITHUB_REPO = "StableDiffusionVN/aPix_Builder";
const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const notes = process.argv.slice(2);
const version = pkg.version;
const label = formatVersionLabel(version);
const productName = pkg.build?.productName ?? pkg.productName ?? "aPix Builder";
const ghSlug = productName.replace(/ /g, ".");
const tag = `v${version}`;
const ghBase = `https://github.com/${GITHUB_REPO}/releases/download/${tag}`;

const manifest = {
  version,
  label,
  publishedAt: new Date().toISOString(),
  notes: notes.length > 0 ? notes : [`aPix Builder ${label}`],
  downloadUrl: `${ghBase}/${ghSlug}-${version}-arm64.dmg`,
  downloadUrlWin: `${ghBase}/${ghSlug}-${version}-x64-portable.exe`,
  releasePageUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
  mandatory: false
};

const target = path.join(root, "releases", "latest.json");
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${target}`);
