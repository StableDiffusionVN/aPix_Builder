import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isVersionNewer } from "../shared/version.js";
import { createSignedRunningHubShortcut, resolveShortcutAssetsDir } from "./runninghub-shortcut.mjs";
import { guardWebviewHost, registerBrowserIpc } from "./browser-window.mjs";
import { createColabController } from "./colabControl.mjs";
import { createColabSession } from "./colabSession.mjs";
import { createComfyLocalSession } from "./comfyLocal.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preloadPath = path.join(appRoot, "electron", "preload.cjs");
const shortcutAssetsDir = resolveShortcutAssetsDir(appRoot);
const UPDATE_MANIFEST_URL = process.env.APIX_UPDATE_MANIFEST_URL ?? "https://apix.sdvn.vn/releases/latest.json";
const UPDATE_CHECK_DELAY_MS = 5000;

// Dev only: a separate profile so a source build can run beside the installed app.
if (!app.isPackaged && process.env.APIX_ELECTRON_USER_DATA) app.setPath("userData", process.env.APIX_ELECTRON_USER_DATA);
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow;
let backend;
let dismissedUpdateVersion = "";
let colabSession = null;
let comfyLocal = null;
let quittingAfterColab = false;

async function readDismissedUpdateVersion() {
  try {
    const filePath = path.join(app.getPath("userData"), "update-dismiss.json");
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    dismissedUpdateVersion = typeof parsed?.version === "string" ? parsed.version : "";
  } catch {
    dismissedUpdateVersion = "";
  }
}

async function writeDismissedUpdateVersion(version) {
  dismissedUpdateVersion = version;
  const filePath = path.join(app.getPath("userData"), "update-dismiss.json");
  await fs.writeFile(filePath, `${JSON.stringify({ version }, null, 2)}\n`, "utf8");
}

async function fetchUpdateManifest() {
  const response = await fetch(UPDATE_MANIFEST_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Update manifest request failed (${response.status})`);
  }

  return response.json();
}

function normalizeManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return null;
  const version = String(manifest.version ?? "").trim();
  const downloadUrl = String(manifest.downloadUrl ?? "").trim();
  if (!version || !downloadUrl) return null;

  // Windows dùng downloadUrlWin (exe) — trước đây luôn trả downloadUrl là bản DMG macOS.
  const platformDownloadUrl = process.platform === "win32"
    ? String(manifest.downloadUrlWin ?? "").trim() || downloadUrl
    : downloadUrl;

  return {
    version,
    label: String(manifest.label ?? version).trim(),
    publishedAt: manifest.publishedAt ?? null,
    notes: Array.isArray(manifest.notes) ? manifest.notes.map(String) : [],
    downloadUrl: platformDownloadUrl,
    mandatory: Boolean(manifest.mandatory)
  };
}

async function checkForUpdates({ notify = true } = {}) {
  const currentVersion = app.getVersion();
  const manifest = normalizeManifest(await fetchUpdateManifest());
  if (!manifest) return null;

  if (!isVersionNewer(manifest.version, currentVersion)) return null;
  if (manifest.version === dismissedUpdateVersion) return null;

  if (notify && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app:update-available", manifest);
  }

  return manifest;
}

function scheduleUpdateCheck() {
  setTimeout(() => {
    checkForUpdates().catch(error => {
      console.warn("Update check failed:", error.message);
    });
  }, UPDATE_CHECK_DELAY_MS);
}

function shortcutFilename(value) {
  const base = String(value || "RunningHub Shortcut")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "RunningHub-Shortcut"}.shortcut`;
}

async function createWindow() {
  if (!backend) {
    process.env.APIX_RESOURCE_ROOT = appRoot;
    process.env.APIX_SHORTCUT_ASSETS_DIR = shortcutAssetsDir;
    // Dev / npm run desktop → repo/user/ · Packaged DMG/exe → OS app data folder
    process.env.APIX_DATA_ROOT = app.isPackaged ? app.getPath("userData") : appRoot;
    process.env.APIX_SERVE_FRONTEND = "1";
    process.env.PORT = "0";

    // Desktop-only capabilities the in-process server exposes to MCP (Colab control).
    const colab = createColabController({
      appRoot,
      getMainWindow: () => mainWindow,
      getSavedServers: async () => {
        if (!backend) return [];
        const response = await fetch(`http://${backend.host}:${backend.port}/api/app-settings`).catch(() => null);
        const data = response?.ok ? await response.json() : {};
        return (data.settings || data).connection?.servers || [];
      }
    });
    colabSession = createColabSession({
      colab,
      getBackend: () => backend,
      onState: state => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("colab:state", state);
      }
    });
    // ComfyUI on this machine (Settings → ComfyUI Server → folder): started / stopped here.
    comfyLocal = createComfyLocalSession({
      getConfig: async () => {
        if (!backend) return {};
        const response = await fetch(`http://${backend.host}:${backend.port}/api/app-settings`).catch(() => null);
        const data = response?.ok ? await response.json() : {};
        return (data.settings || data).connection?.local || {};
      },
      onState: state => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("comfy-local:state", state);
      }
    });
    globalThis.apixDesktopBridge = { colab, colabSession, comfyLocal };
    const { serverReady } = await import("../server/server.js");
    backend = await serverReady;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#111318",
    title: "aPix Builder",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true // Colab sheet (guarded: no preload, forced session)
    }
  });
  guardWebviewHost(mainWindow.webContents);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // The Colab browser only hides on close, so it would keep Windows/Linux running.
  mainWindow.on("closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  await mainWindow.loadURL(`http://${backend.host}:${backend.port}/`);
  scheduleUpdateCheck();
}

// Default menus + View → show / hide the Colab sheet on Cmd+~ / Cmd+` (Ctrl on Windows).
// macOS claims Cmd+` for "cycle windows" before the page sees it, so it must be a
// menu accelerator.
function installAppMenu() {
  const toggleColab = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("browser:shortcut", "toggle");
  };
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Hiện / ẩn notebook Colab", accelerator: "CommandOrControl+`", click: toggleColab },
        { label: "Hiện / ẩn notebook Colab (~)", accelerator: "CommandOrControl+Shift+`", click: toggleColab, visible: false, acceleratorWorksWhenHidden: true },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpcHandlers() {
  registerBrowserIpc({ appRoot, getMainWindow: () => mainWindow });
  ipcMain.handle("colab:start", () => colabSession?.start());
  ipcMain.handle("colab:stop", () => colabSession?.stop());
  ipcMain.handle("colab:get-state", () => colabSession?.getState() || null);
  ipcMain.handle("colab:configure", (_event, config) => colabSession?.configure(config || {}));
  ipcMain.handle("comfy-local:start", () => comfyLocal?.start());
  ipcMain.handle("comfy-local:stop", () => comfyLocal?.stop());
  ipcMain.handle("comfy-local:get-state", () => comfyLocal?.getState() || null);
  ipcMain.handle("comfy-local:inspect", async (_event, folder, python) => {
    try {
      return { ok: true, ...(await comfyLocal.inspect(folder, python)) };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle("comfy-local:pick-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: "Chọn thư mục ComfyUI", properties: ["openDirectory"] });
    return result.canceled ? "" : result.filePaths[0] || "";
  });
  ipcMain.handle("app:get-version", () => app.getVersion());

  ipcMain.handle("app:check-for-updates", async () => {
    try {
      return await checkForUpdates({ notify: true });
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle("app:open-external", async (_event, url) => {
    if (typeof url !== "string" || !/^https?:/i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("app:dismiss-update", async (_event, version) => {
    if (typeof version !== "string" || !version.trim()) return false;
    await writeDismissedUpdateVersion(version.trim());
    return true;
  });

  ipcMain.handle("runninghub:export-shortcut", async (_event, payload = {}) => {
    try {
      if (process.platform !== "darwin") {
        return { ok: false, error: "Export Shortcut requires macOS." };
      }
      const config = payload.config;
      const apiKey = String(payload.apiKey || "").trim();
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        return { ok: false, error: "Missing RunningHub configuration." };
      }
      if (!apiKey) return { ok: false, error: "Missing RunningHub API key." };

      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: "Export RunningHub Shortcut",
        defaultPath: path.join(app.getPath("downloads"), shortcutFilename(payload.name)),
        filters: [{ name: "Apple Shortcut", extensions: ["shortcut"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"]
      });
      if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true };
      const outputPath = saveResult.filePath.toLowerCase().endsWith(".shortcut")
        ? saveResult.filePath
        : `${saveResult.filePath}.shortcut`;
      const result = await createSignedRunningHubShortcut({
        config,
        apiKey,
        outputPath,
        assetsDir: shortcutAssetsDir,
        kind: payload.kind,
        resourceId: payload.resourceId,
        workflow: payload.workflow
      });
      await fs.chmod(outputPath, 0o600);
      return { ok: true, ...result };
    } catch (error) {
      console.error("RunningHub Shortcut export failed:", error.message);
      return { ok: false, error: error.message || "Could not export Shortcut." };
    }
  });
}

if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
    registerIpcHandlers();
    installAppMenu();
    await readDismissedUpdateVersion();
    await createWindow();
  }).catch(error => {
    console.error("Failed to start aPix Builder:", error);
    app.quit();
  });

  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("activate", () => {
    // The aPix Browser window may still be open after the main window was closed.
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow().catch(error => {
        console.error("Failed to recreate aPix Builder window:", error);
        app.quit();
      });
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", event => {
    comfyLocal?.killNow(); // only the ComfyUI aPix started itself
    // Free the Colab GPU before quitting (best effort, ≤ 15 s).
    if (!quittingAfterColab && colabSession) {
      event.preventDefault();
      quittingAfterColab = true;
      const stopColab = async () => {
        if (!(await colabSession.shouldStopOnQuit())) return;
        // Looks quit already while the runtime is released in the background.
        for (const window of BrowserWindow.getAllWindows()) window.hide();
        await colabSession.stop({ reason: "quit", force: true });
      };
      // ≤ 45 s: the notebook may have to be reopened in the background first.
      Promise.race([stopColab().catch(error => console.error("Colab stop on quit failed:", error)), new Promise(resolve => setTimeout(resolve, 45000))])
        .finally(() => app.quit());
      return;
    }
    backend?.server?.close();
  });
}
