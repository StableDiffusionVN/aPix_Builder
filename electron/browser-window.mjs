// "aPix Browser": a single-page window showing the SDVN ComfyUI Colab notebook, with
// its own persistent session so Google sign-in survives restarts. Closing it only
// hides it, so the Colab session can still read / stop the runtime afterwards.
import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import path from "node:path";

const PARTITION = "persist:apix-browser";
const SHORTCUTS = { r: "reload" };

let browserWindow = null;
let sessionConfigured = false;
let appQuitting = false;
app.on("before-quit", () => {
  appQuitting = true;
});

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
    // window.open popups (Google auth, Drive mount) keep their opener; other links
    // open in the system browser (this window only shows the Colab notebook).
    if (disposition === "new-window") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { width: 520, height: 680, parent: browserWindow, autoHideMenuBar: true }
      };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });
  // Shortcuts still work while a page has keyboard focus.
  guest.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !(input.meta || input.control) || input.shift || input.alt) return;
    const action = SHORTCUTS[input.key.toLowerCase()];
    if (input.key.toLowerCase() === "w") {
      event.preventDefault();
      browserWindow?.close();
      return;
    }
    if (!action) return;
    event.preventDefault();
    browserWindow?.webContents.send("browser:shortcut", action);
  });
}

export function getBrowserWindow() {
  return browserWindow && !browserWindow.isDestroyed() ? browserWindow : null;
}

// show: false opens it in the background (e.g. to stop the runtime when quitting).
export function openBrowserWindow(appRoot, url, { show = true } = {}) {
  configureSession();
  const target = isHttpUrl(url) ? url : null;
  if (browserWindow && !browserWindow.isDestroyed()) {
    if (target) browserWindow.webContents.send("browser:navigate", target);
    if (!show) return;
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
    title: "SDVN ComfyUI — Colab",
    show,
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
  browserWindow.on("close", event => {
    if (appQuitting) return;
    event.preventDefault();
    browserWindow.hide();
  });
  browserWindow.on("closed", () => {
    browserWindow = null;
  });
}

export function registerBrowserIpc({ appRoot }) {
  const fromBrowser = event => browserWindow && !browserWindow.isDestroyed() && event.sender === browserWindow.webContents;

  ipcMain.handle("browser:open", (_event, url) => {
    openBrowserWindow(appRoot, url);
    return true;
  });

  ipcMain.handle("browser:use-comfy-url", async (event, url) => {
    if (!fromBrowser(event) || !isHttpUrl(url)) return { ok: false, error: "Địa chỉ không hợp lệ" };
    // The server is the ComfyUI link the notebook prints, not Colab itself.
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
    return { ok: false, error: "Trang này không phải notebook Colab — bấm ⌂ để về notebook SDVN ComfyUI." };
  });

  ipcMain.handle("browser:open-external", async (event, url) => {
    if (!fromBrowser(event) || !isHttpUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });
}
