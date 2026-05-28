import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const url = "http://localhost:5173/";
const children = new Set();

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: options.stdio || "inherit",
    shell: false,
    env: process.env
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) {
      child.kill(process.platform === "win32" ? undefined : "SIGTERM");
    }
  }
}

async function waitForUrl(target, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(target);
      if (response.ok) return true;
    } catch {
      // Server is still starting.
    }
    await delay(500);
  }
  return false;
}

function openBrowser(target) {
  if (process.platform === "darwin") {
    spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

if (!existsSync(join(root, "node_modules"))) {
  console.log("Installing dependencies...");
  const install = spawnSync(npm, ["install"], { cwd: root, stdio: "inherit" });
  if (install.status !== 0) {
    process.exit(install.status || 1);
  }
}

console.log("Starting backend and UI...");
const server = run(npm, ["run", "server"]);
const dev = run(npm, ["run", "dev", "--", "--strictPort"]);

server.on("exit", code => {
  if (code !== 0 && code !== null) {
    console.error(`Backend stopped with exit code ${code}.`);
  }
});

dev.on("exit", code => {
  if (code !== 0 && code !== null) {
    console.error(`UI stopped with exit code ${code}.`);
  }
});

if (await waitForUrl(url)) {
  console.log(`Opening ${url}`);
  openBrowser(url);
} else {
  console.warn(`UI did not respond within 30 seconds. Try opening ${url} manually.`);
}

console.log("Keep this window open while using the app. Press Ctrl+C to stop.");
