import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, ".package", "aPix Builder");

const entries = [
  "manifest.json",
  "index.html",
  "styles.css",
  "dist",
  "templates",
  "templates-rh",
  "icons"
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of entries) {
  const source = path.join(root, entry);
  const target = path.join(outDir, entry);
  await stat(source);
  await cp(source, target, {
    recursive: true,
    filter: (sourcePath) => !sourcePath.endsWith(".DS_Store")
  });
}

console.log(`Prepared clean UXP package folder: ${outDir}`);
