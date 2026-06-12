import esbuild from "esbuild";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const watch = process.argv.includes("--watch");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function compileTemplates() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "compile-templates.mjs")], {
      stdio: "inherit",
      cwd: root
    });
    child.on("error", reject);
    child.on("exit", code => (code === 0 ? resolve() : reject(new Error(`compile-templates exited ${code}`))));
  });
}

await compileTemplates();

const options = {
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "dist/main.js",
  format: "iife",
  target: "es2020",
  external: ["photoshop", "uxp", "fs"],
  define: {
    "process.env.NODE_ENV": '"production"'
  },
  logLevel: "info"
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log("Watching Photoshop plugin source...");
} else {
  await esbuild.build(options);
}
