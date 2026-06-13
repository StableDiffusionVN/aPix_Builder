import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatVersionLabel } from "../shared/version.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const notes = process.argv.slice(2);
const version = pkg.version;
const label = formatVersionLabel(version);
const artifactName = `${pkg.build?.productName ?? pkg.productName ?? "aPix Builder"}-${version}-arm64.dmg`;

const manifest = {
  version,
  label,
  publishedAt: new Date().toISOString(),
  notes: notes.length > 0 ? notes : [`aPix Builder ${label}`],
  downloadUrl: `https://apix.sdvn.vn/releases/${encodeURIComponent(artifactName.replace(/ /g, " "))}`,
  mandatory: false
};

const target = path.join(root, "releases", "latest.json");
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${target}`);
