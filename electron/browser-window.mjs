// Colab view: the SDVN ComfyUI notebook in a <webview> with its own persistent session
// (Google sign-in survives restarts). It lives in the main window as a bottom sheet
// (src/features/app/ColabSheet.jsx); a separate hidden window is only the fallback
// host when the main window is gone (e.g. releasing the runtime on quit).
import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";

const PARTITION = "persist:apix-browser";
const SHORTCUTS = { r: "reload" };

let browserWindow = null;
let getMainWindow = () => null;
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

function isGoogleUrl(url) {
  try {
    return /(^|\.)(google\.com|googleusercontent\.com|gstatic\.com|google\.com\.vn)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

// Small diagnostics log (userData/colab-browser.log): popups and failed loads of the
// Colab view, so account / Drive problems can be traced without a debugger.
function logBrowser(message) {
  try {
    const file = path.join(app.getPath("userData"), "colab-browser.log");
    if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.rmSync(file);
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break the browser.
  }
}

const shortUrl = url => String(url || "").replace(/([?#]).*$/, "$1…").slice(0, 160);

function attachGuest(guest, host) {
  const hostWindow = () => BrowserWindow.fromWebContents(host);
  const popupOptions = () => ({
    action: "allow",
    overrideBrowserWindowOptions: { width: 520, height: 700, parent: hostWindow() || undefined, autoHideMenuBar: true }
  });
  guest.setWindowOpenHandler(({ url, disposition }) => {
    logBrowser(`open ${disposition} ${shortUrl(url)}`);
    // A blank popup the page fills in itself (Google account menu, OAuth): allow it.
    if (!url || /^about:blank/i.test(url)) return popupOptions();
    if (!isHttpUrl(url)) return { action: "deny" };
    // window.open popups (Google auth, Drive mount) keep their opener.
    if (disposition === "new-window") return popupOptions();
    // Google account / Drive / Colab pages (sign out, add account…) stay in the view
    // so the session keeps the sign-in; anything else opens in the system browser.
    if (isGoogleUrl(url) && !host.isDestroyed()) host.send("browser:navigate", url);
    else void shell.openExternal(url);
    return { action: "deny" };
  });
  // Account popups (add account, sign out) change the sign-in: reload the notebook
  // when one closes so it shows the current account.
  guest.on("did-create-window", child => {
    child.webContents.on("did-navigate", (_event, url) => logBrowser(`popup ${shortUrl(url)}`));
    child.on("closed", () => {
      if (!guest.isDestroyed()) guest.reload();
    });
  });
  guest.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (code !== -3) logBrowser(`fail ${code} ${description} ${isMainFrame ? "main" : "frame"} ${shortUrl(url)}`);
  });
  guest.on("will-navigate", (_event, url) => logBrowser(`navigate ${shortUrl(url)}`));
  // Colab's "Leave site?" (beforeunload) has no dialog in a webview and silently blocks
  // every navigation — e.g. switching account (?authuser=1). The notebook comes from
  // GitHub (nothing to save) and leaving the page does not stop the runtime: allow it.
  guest.on("will-prevent-unload", event => {
    logBrowser("beforeunload ignored");
    event.preventDefault();
  });
  // Shortcuts still work while the page has keyboard focus.
  guest.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !(input.meta || input.control) || input.shift || input.alt) return;
    const key = input.key.toLowerCase();
    if (key !== "w" && !SHORTCUTS[key]) return;
    event.preventDefault();
    if (host.isDestroyed()) return;
    if (key === "w") {
      if (host === browserWindow?.webContents) browserWindow.close();
      else host.send("browser:shortcut", "hide");
      return;
    }
    host.send("browser:shortcut", SHORTCUTS[key]);
  });
}

/** Lets a window host the Colab <webview>: no preload / Node in pages, forced session. */
export function guardWebviewHost(contents) {
  configureSession();
  contents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    params.partition = PARTITION;
    if (params.src && !isHttpUrl(params.src) && params.src !== "about:blank") event.preventDefault();
  });
  contents.on("did-attach-webview", (_event, guest) => attachGuest(guest, contents));
}

function liveMainWindow() {
  const main = getMainWindow();
  return main && !main.isDestroyed() ? main : null;
}

/** Web contents that may host the Colab view (main window sheet, fallback window). */
export function colabHostContents() {
  return [liveMainWindow()?.webContents, getBrowserWindow()?.webContents].filter(Boolean);
}

export function getBrowserWindow() {
  return browserWindow && !browserWindow.isDestroyed() ? browserWindow : null;
}

// show: false opens it in the background (e.g. to stop the runtime when quitting).
export function openBrowserWindow(appRoot, url, { show = true } = {}) {
  configureSession();
  const target = isHttpUrl(url) ? url : null;
  const main = liveMainWindow();
  if (main) {
    // Bottom sheet in the main window (mounts the view, slides up when show).
    main.webContents.send("colab-sheet:open", { url: target, show });
    if (show) {
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
    }
    return;
  }
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
  guardWebviewHost(shellContents);

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

export function registerBrowserIpc({ appRoot, getMainWindow: mainGetter }) {
  getMainWindow = mainGetter || getMainWindow;
  const fromBrowser = event => colabHostContents().includes(event.sender);

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
