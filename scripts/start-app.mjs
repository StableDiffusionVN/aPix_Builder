import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const url = "http://localhost:5173/";
const apiUrl = `${url}api/presets`;
const children = new Set();
let startupError = null;

function fail(message) {
  console.error(`\nERROR: ${message}`);
  stopAll();
  process.exit(1);
}

function hasSupportedNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
}

function dependenciesAreReady() {
  const required = [
    join(root, "node_modules", ".package-lock.json"),
    join(root, "node_modules", "vite", "bin", "vite.js"),
    join(root, "node_modules", "yaml", "package.json")
  ];
  if (process.platform === "win32") {
    required.push(join(root, "node_modules", ".bin", "vite.cmd"));
  } else {
    required.push(join(root, "node_modules", ".bin", "vite"));
  }
  return required.every(existsSync);
}

async function responseIsOk(target) {
  try {
    const response = await fetch(target);
    return response.ok;
  } catch {
    return false;
  }
}

function portIsOpen(port) {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: options.stdio || "inherit",
    shell: false,
    env: process.env
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  child.on("error", error => {
    startupError ||= `${command} could not start: ${error.message}`;
  });
  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) {
      child.kill(process.platform === "win32" ? undefined : "SIGTERM");
    }
  }
}

async function waitForApp(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (startupError) return false;
    try {
      const [uiResponse, apiResponse] = await Promise.all([fetch(url), fetch(apiUrl)]);
      if (uiResponse.ok && apiResponse.ok) return true;
    } catch {
      // One or both servers are still starting.
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

if (!hasSupportedNodeVersion()) {
  fail(
    `Node.js ${process.versions.node} is not supported. ` +
    "Install Node.js 20.19+ or 22.12+ (current LTS recommended)."
  );
}

if (!dependenciesAreReady()) {
  console.log("Dependencies are missing or belong to another operating system.");
  console.log("Running npm install. This may take a few minutes...");
  const install = spawnSync(npm, ["install"], { cwd: root, stdio: "inherit" });
  if (install.error) {
    fail(`npm install could not start: ${install.error.message}`);
  }
  if (install.status !== 0) {
    fail(`npm install failed with exit code ${install.status ?? "unknown"}.`);
  }
  if (!dependenciesAreReady()) {
    fail("Dependencies are still incomplete after npm install.");
  }
}

const [existingUi, existingApi] = await Promise.all([
  responseIsOk(url),
  responseIsOk(apiUrl)
]);

if (existingUi && existingApi) {
  console.log("aPix Builder is already running. Opening it in the browser...");
  openBrowser(url);
  process.exit(0);
}

const [uiPortInUse, apiPortInUse] = await Promise.all([
  portIsOpen(5173),
  portIsOpen(8787)
]);

if (uiPortInUse || apiPortInUse) {
  const ports = [
    uiPortInUse ? "5173" : null,
    apiPortInUse ? "8787" : null
  ].filter(Boolean).join(" and ");
  fail(`Port ${ports} is already in use by another process. Close that process and try again.`);
}

console.log("Starting backend and UI...");
const server = run(npm, ["run", "server"]);
const dev = run(npm, ["run", "dev", "--", "--strictPort"]);

server.on("exit", code => {
  if (code !== 0 && code !== null) {
    startupError ||= `Backend stopped with exit code ${code}. Port 8787 may already be in use.`;
    console.error(startupError);
  }
});

dev.on("exit", code => {
  if (code !== 0 && code !== null) {
    startupError ||= `UI stopped with exit code ${code}. Port 5173 may already be in use.`;
    console.error(startupError);
  }
});

if (await waitForApp()) {
  console.log(`Opening ${url}`);
  openBrowser(url);
} else {
  fail(startupError || "The UI or backend did not respond within 30 seconds.");
}

console.log("Keep this window open while using the app. Press Ctrl+C to stop.");
