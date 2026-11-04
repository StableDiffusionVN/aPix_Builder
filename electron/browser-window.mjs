// "aPix Browser": a small tabbed browser window (Colab, remote ComfyUI servers…)
// with its own persistent session, so Google sign-in survives restarts.
import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import path from "node:path";

const PARTITION = "persist:apix-browser";
const SHORTCUTS = { t: "new-tab", w: "close-tab", l: "focus-address", r: "reload" };

let browserWindow = null;
let sessionConfigured = false;

// Google refuses sign-in from user agents that advertise Electron.
function chromeLikeUserAgent() {
  return app.userAgentFallback
    .replace(/\s*Electron\/\S+/i, "")
    .replace(new RegExp(`\\s*${app.getName().replace(/[^\w-]/g, ".")}\\/\\S+`, "i"), "");
}

function configureSession() {
  if (sessionConfigured) return;
  sessionConfigured = true;
  session.fromPartition(PARTITION).setUserAgent(chromeLikeUserAgent());
}

function isColabUrl(url) {
  return /^https:\/\/colab\.research\.google\.com\//.test(String(url || ""));
}

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function attachGuest(guest) {
  guest.setWindowOpenHandler(({ url, disposition }) => {
    if (!isHttpUrl(url)) return { action: "deny" };
    // window.open popups (Google auth, Drive mount) keep their opener; links become tabs.
    if (disposition === "new-window") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { width: 520, height: 680, parent: browserWindow, autoHideMenuBar: true }
      };
    }
    browserWindow?.webContents.send("browser:open-tab", url);
    return { action: "deny" };
  });
  // Shortcuts still work while a page has keyboard focus.
  guest.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !(input.meta || input.control) || input.shift || input.alt) return;
    const action = SHORTCUTS[input.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    browserWindow?.webContents.send("browser:shortcut", action);
  });
}

export function getBrowserWindow() {
  return browserWindow && !browserWindow.isDestroyed() ? browserWindow : null;
}

export function openBrowserWindow(appRoot, url) {
  configureSession();
  const target = isHttpUrl(url) ? url : null;
  if (browserWindow && !browserWindow.isDestroyed()) {
    if (target) browserWindow.webContents.send("browser:open-tab", target);
    if (browserWindow.isMinimized()) browserWindow.restore();
    browserWindow.show();
    browserWindow.focus();
    return;
  }

  const isMac = process.platform === "darwin";
  browserWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: "aPix Browser",
    backgroundColor: "#111318",
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    titleBarOverlay: isMac ? undefined : { color: "#191c23", symbolColor: "#f1f3f7", height: 38 },
    webPreferences: {
      preload: path.join(appRoot, "electron", "browser-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  const shellContents = browserWindow.webContents;
  shellContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // Pages run without any preload or Node access, always in the browser session.
  shellContents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    params.partition = PARTITION;
    if (params.src && !isHttpUrl(params.src) && params.src !== "about:blank") event.preventDefault();
  });
  shellContents.on("did-attach-webview", (_event, guest) => attachGuest(guest));

  browserWindow.loadFile(path.join(appRoot, "electron", "browser", "browser.html"), target ? { query: { url: target } } : undefined);
  browserWindow.on("closed", () => {
    browserWindow = null;
  });
}

async function probeComfy(url) {
  try {
    const { origin } = new URL(url);
    const response = await fetch(`${origin}/system_stats`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.system || data?.devices);
  } catch {
    return false;
  }
}

export function registerBrowserIpc({ appRoot, getMainWindow }) {
  const fromBrowser = event => browserWindow && !browserWindow.isDestroyed() && event.sender === browserWindow.webContents;

  ipcMain.handle("browser:open", (_event, url) => {
    openBrowserWindow(appRoot, url);
    return true;
  });

  ipcMain.handle("browser:probe-comfy", (event, url) => (fromBrowser(event) ? probeComfy(url) : false));

  ipcMain.handle("browser:use-comfy-url", async (event, url) => {
    if (!fromBrowser(event) || !isHttpUrl(url)) return { ok: false, error: "Địa chỉ không hợp lệ" };
    // On a Colab tab the server is the ComfyUI link the notebook prints, not Colab itself.
    if (isColabUrl(url)) {
      const colab = globalThis.apixDesktopBridge?.colab;
      if (!colab) return { ok: false, error: "Không đọc được Colab" };
      try {
        const result = await colab.findServer({ apply: true, url });
        return result.found
          ? { ok: true, address: result.address, fromColab: true }
          : { ok: false, error: "Chưa thấy link ComfyUI chạy được trong output — chạy ô RUN và chờ ComfyUI in link." };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }
    const address = new URL(url).origin;
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: "Cửa sổ aPix chưa mở" };
    mainWindow.webContents.send("app:use-comfy-url", address);
    return { ok: true, address, comfy: await probeComfy(address) };
  });

  ipcMain.handle("browser:open-external", async (event, url) => {
    if (!fromBrowser(event) || !isHttpUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });
}
