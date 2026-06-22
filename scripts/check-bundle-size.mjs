import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const assetsDir = path.resolve("dist/assets");
const budgets = [
  { pattern: /^index-.*\.js$/, maxBytes: 590_000, label: "main JavaScript" },
  { pattern: /^InfiniteCanvas-.*\.js$/, maxBytes: 310_000, label: "canvas JavaScript" },
  { pattern: /^index-.*\.css$/, maxBytes: 260_000, label: "main CSS" }
];

const files = await readdir(assetsDir);
let failed = false;

for (const budget of budgets) {
  const matches = files.filter(file => budget.pattern.test(file));
  if (!matches.length) {
    console.error(`Bundle budget: missing ${budget.label} asset`);
    failed = true;
    continue;
  }
  const sizes = await Promise.all(matches.map(async file => ({
    file,
    bytes: (await stat(path.join(assetsDir, file))).size
  })));
  const largest = sizes.sort((a, b) => b.bytes - a.bytes)[0];
  const status = largest.bytes <= budget.maxBytes ? "PASS" : "FAIL";
  console.log(`${status} ${budget.label}: ${largest.bytes} / ${budget.maxBytes} bytes (${largest.file})`);
  if (status === "FAIL") failed = true;
}

if (failed) process.exitCode = 1;
