// ComfyUI on this machine, started and stopped by the desktop app.
// Same shape as colabSession.mjs (start / stop / getState / getServerAddress / shouldStopOnQuit)
// so the Run gate, MCP and the Canvas bridge can use either one.
//
// Settings (app-settings.json → connection.local): { folder, python, args, port }.
// folder: a ComfyUI checkout (main.py), its parent, or a Windows portable folder
// (python_embeded + ComfyUI). Before starting, custom_nodes/SDVN_Comfy_node is installed
// (latest from GitHub) when missing.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SDVN_NODE = "SDVN_Comfy_node";
const SDVN_REPO = "https://github.com/StableDiffusionVN/SDVN_Comfy_node";
const SDVN_ZIP = `${SDVN_REPO}/archive/refs/heads/main.zip`;
const START_TIMEOUT_MS = 10 * 60 * 1000;
const LOG_LINES = 400;
const isWindows = process.platform === "win32";

function run(file, args, options = {}) {
  return new Promise(resolve => {
    execFile(file, args, { timeout: options.timeout || 20000, maxBuffer: 8 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error?.code, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

/** PATH as a login shell sees it: apps opened from Finder only get /usr/bin:/bin. */
let loginPath = null;
async function shellPath() {
  if (loginPath !== null) return loginPath;
  loginPath = process.env.PATH || "";
  if (!isWindows) {
    const shell = process.env.SHELL || "/bin/zsh";
    const result = await run(shell, ["-lic", "printf '%s' \"$PATH\""], { timeout: 8000 });
    if (result.ok && result.stdout.trim()) loginPath = result.stdout.trim().split("\n").pop();
  }
  return loginPath;
}

/** { comfyDir, python?, portable } for a folder the user picked, or throws a readable error. */
export function resolveComfyLayout(folder) {
  const root = path.resolve(String(folder || "").trim());
  if (!folder || !existsSync(root)) throw new Error("Không tìm thấy thư mục ComfyUI.");
  const embedded = path.join(root, "python_embeded", isWindows ? "python.exe" : "bin/python");
  if (existsSync(path.join(root, "ComfyUI", "main.py")) && existsSync(embedded)) {
    return { comfyDir: path.join(root, "ComfyUI"), python: embedded, portable: true };
  }
  const comfyDir = existsSync(path.join(root, "main.py")) ? root
    : existsSync(path.join(root, "ComfyUI", "main.py")) ? path.join(root, "ComfyUI")
      : null;
  if (!comfyDir) throw new Error("Thư mục này không có ComfyUI (không thấy main.py).");
  const venvs = [comfyDir, path.dirname(comfyDir)].flatMap(base => [".venv", "venv", "env"].map(name => path.join(base, name)));
  for (const venv of venvs) {
    const python = isWindows ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");
    if (existsSync(python)) return { comfyDir, python, portable: false };
  }
  return { comfyDir, python: null, portable: false };
}

function pythonCandidates() {
  const home = os.homedir();
  if (isWindows) return ["python", "py"];
  return [
    ...["miniconda3", "anaconda3", "miniforge3", "mambaforge"].flatMap(name => [path.join(home, name, "bin/python"), `/opt/${name}/bin/python`]),
    "/opt/homebrew/Caskroom/miniconda/base/bin/python",
    path.join(home, ".pyenv/shims/python3"),
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "python3",
    "/usr/bin/python3"
  ];
}

/** A Python that can run ComfyUI: the configured one, the folder's own, else the first with torch. */
export async function findPython(layout, configured = "") {
  const env = { ...process.env, PATH: await shellPath() };
  if (configured?.trim()) return configured.trim();
  if (layout.python) return layout.python;
  for (const candidate of pythonCandidates()) {
    if (path.isAbsolute(candidate) && !existsSync(candidate)) continue;
    const result = await run(candidate, ["-c", "import torch, sys; print(sys.executable)"], { env, timeout: 30000 });
    if (result.ok) return result.stdout.trim().split("\n").pop() || candidate;
  }
  throw new Error("Không tìm thấy Python có cài torch để chạy ComfyUI — nhập đường dẫn Python trong Settings.");
}

export function createComfyLocalSession({ getConfig, onState }) {
  let state = { phase: "off", message: "", address: "", ours: false, startedAt: null, readyAt: null, log: [] };
  let child = null;
  let runToken = 0;

  const set = patch => {
    state = { ...state, ...patch };
    onState?.(getState());
  };
  const log = text => {
    const lines = String(text).split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return;
    state.log = [...state.log, ...lines].slice(-LOG_LINES);
    onState?.(getState());
  };
  function getState() {
    return { ...state, log: state.log.slice(-60) };
  }

  async function config() {
    const value = (await getConfig()) || {};
    const port = Number(value.port) || 8188;
    return { folder: value.folder || "", python: value.python || "", args: value.args || "", port };
  }

  async function online(port) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/system_stats`, { signal: AbortSignal.timeout(3000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function installSdvnNode(layout, python, env) {
    const target = path.join(layout.comfyDir, "custom_nodes", SDVN_NODE);
    if (existsSync(path.join(target, "__init__.py"))) return false;
    set({ phase: "installing", message: "Đang cài bộ node SDVN (bản mới nhất)…" });
    await mkdir(path.dirname(target), { recursive: true });
    await rm(target, { recursive: true, force: true });
    const cloned = await run("git", ["clone", "--depth", "1", SDVN_REPO, target], { env, timeout: 5 * 60 * 1000 });
    if (!cloned.ok) {
      log(`git không dùng được (${cloned.stderr.trim().split("\n").pop() || cloned.code}) — tải zip từ GitHub`);
      const response = await fetch(SDVN_ZIP, { signal: AbortSignal.timeout(5 * 60 * 1000) });
      if (!response.ok) throw new Error(`Không tải được bộ node SDVN (HTTP ${response.status})`);
      const { unzipSync } = await import("fflate");
      const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
      const staging = `${target}.tmp`;
      await rm(staging, { recursive: true, force: true });
      for (const [name, data] of Object.entries(entries)) {
        const relative = name.split("/").slice(1).join("/");
        if (!relative || name.endsWith("/")) continue;
        const output = path.resolve(staging, relative);
        if (!output.startsWith(`${path.resolve(staging)}${path.sep}`)) continue;
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, data);
      }
      await rename(staging, target);
    }
    log(`Đã tải bộ node SDVN vào ${target}`);
    if (existsSync(path.join(target, "requirements.txt"))) {
      set({ message: "Đang cài thư viện cho bộ node SDVN…" });
      const pip = await new Promise(resolve => {
        const proc = spawn(python, ["-m", "pip", "install", "-r", "requirements.txt"], { cwd: target, env });
        proc.stdout.on("data", log);
        proc.stderr.on("data", log);
        proc.on("close", code => resolve(code));
        proc.on("error", () => resolve(-1));
      });
      if (pip !== 0) log("Cảnh báo: cài thư viện cho node SDVN chưa trọn vẹn — xem log");
    }
    return true;
  }

  async function start() {
    if (["installing", "starting"].includes(state.phase)) return getState();
    const token = ++runToken;
    const alive = () => token === runToken;
    // Report "starting" before any await: callers poll right after start() and treat "off" as failed.
    state.log = [];
    set({ phase: "starting", message: "Đang chuẩn bị ComfyUI trên máy…", address: "", ours: false, startedAt: Date.now(), readyAt: null });
    const { folder, python: configuredPython, args, port } = await config();
    const address = `http://127.0.0.1:${port}`;
    if (await online(port)) {
      set({ phase: "ready", message: "ComfyUI trên máy đang chạy", address, ours: Boolean(child), readyAt: Date.now() });
      return getState();
    }
    try {
      if (!folder) throw new Error("Chưa chọn thư mục ComfyUI (Settings → ComfyUI Server).");
      const layout = resolveComfyLayout(folder);
      const env = { ...process.env, PATH: await shellPath(), PYTHONUNBUFFERED: "1" };
      const python = await findPython(layout, configuredPython);
      log(`ComfyUI: ${layout.comfyDir}`);
      log(`Python: ${python}`);
      await installSdvnNode(layout, python, env);
      if (!alive()) return getState();

      const extra = String(args || "").trim().split(/\s+/).filter(Boolean);
      const launch = [...(layout.portable ? ["-s"] : []), "main.py", ...(layout.portable ? ["--windows-standalone-build"] : []), "--port", String(port), ...extra];
      set({ phase: "starting", message: "Đang khởi động ComfyUI trên máy…" });
      log(`$ ${python} ${launch.join(" ")}`);
      child = spawn(python, launch, { cwd: layout.comfyDir, env, detached: !isWindows, windowsHide: true });
      child.stdout.on("data", log);
      child.stderr.on("data", log);
      child.on("error", error => {
        log(error.message);
        if (alive()) set({ phase: "error", message: `Không chạy được Python: ${error.message}` });
      });
      child.on("close", code => {
        const wasOurs = state.ours || state.phase === "starting";
        child = null;
        if (!alive()) return;
        if (state.phase === "stopping") return;
        if (wasOurs) set({ phase: code === 0 ? "off" : "error", message: code === 0 ? "ComfyUI đã tắt" : `ComfyUI đã dừng (mã ${code}) — xem log`, address: "", ours: false });
      });

      const deadline = Date.now() + START_TIMEOUT_MS;
      while (alive() && child && Date.now() < deadline) {
        if (await online(port)) {
          set({ phase: "ready", message: "ComfyUI trên máy đã sẵn sàng", address, ours: true, readyAt: Date.now() });
          return getState();
        }
        const seconds = Math.round((Date.now() - state.startedAt) / 1000);
        set({ message: `Đang khởi động ComfyUI trên máy… (${seconds}s)` });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (alive() && state.phase === "starting") {
        if (!child) throw new Error(state.message || "ComfyUI dừng trước khi sẵn sàng — xem log");
        throw new Error("Quá thời gian chờ ComfyUI khởi động");
      }
    } catch (error) {
      if (alive()) set({ phase: "error", message: error.message || String(error) });
    }
    return getState();
  }

  function killTree(proc) {
    if (!proc?.pid) return;
    if (isWindows) {
      execFile("taskkill", ["/pid", String(proc.pid), "/T", "/F"], () => {});
      return;
    }
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      proc.kill("SIGTERM");
    }
  }

  async function stop() {
    runToken++;
    const proc = child;
    if (!proc) {
      set({ phase: "off", message: state.phase === "ready" && !state.ours ? "ComfyUI này không do aPix bật — tắt ở nơi đã mở nó" : "", address: "", ours: false });
      return getState();
    }
    set({ phase: "stopping", message: "Đang tắt ComfyUI trên máy…" });
    killTree(proc);
    const deadline = Date.now() + 8000;
    while (child && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
    if (child) {
      try {
        if (isWindows) proc.kill("SIGKILL");
        else process.kill(-proc.pid, "SIGKILL");
      } catch {
        proc.kill("SIGKILL");
      }
    }
    child = null;
    set({ phase: "off", message: "ComfyUI trên máy đã tắt", address: "", ours: false });
    return getState();
  }

  /** Synchronous kill for app exit (only what aPix started). */
  function killNow() {
    if (child) killTree(child);
  }

  /** Lists what a folder contains, for the Settings check button. */
  async function inspect(folderOverride, pythonOverride) {
    const current = await config();
    const layout = resolveComfyLayout(folderOverride ?? current.folder);
    const python = await findPython(layout, pythonOverride ?? current.python);
    const nodes = await readdir(path.join(layout.comfyDir, "custom_nodes")).catch(() => []);
    return { comfyDir: layout.comfyDir, python, portable: layout.portable, sdvnInstalled: nodes.includes(SDVN_NODE) };
  }

  async function isConfigured() {
    return Boolean((await config()).folder);
  }

  return {
    start,
    stop,
    killNow,
    inspect,
    isConfigured,
    getState,
    getServerAddress: () => (state.phase === "ready" ? state.address : ""),
    shouldStopOnQuit: async () => Boolean(child)
  };
}
