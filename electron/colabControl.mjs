// Drives Google Colab inside the aPix Browser window (signed-in session) so MCP
// tools can open the SDVN notebook, run it, read its state and find the ComfyUI
// link it prints. Uses Colab's page objects (colab.global.notebook) — Colab has no
// public API — and falls back to keyboard shortcuts; anything needing the user
// (sign-in, Drive permission, captcha) is reported, never bypassed.
import { webContents } from "electron";
import { getBrowserWindow, openBrowserWindow } from "./browser-window.mjs";

export const COLAB_NOTEBOOK_URL = "https://colab.research.google.com/github/StableDiffusionVN/SDVN-WebUI/blob/main/SDVN_ComfyUI.ipynb";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Tunnel hosts the SDVN notebook can print for ComfyUI (plus custom domains on saved servers).
const TUNNEL_HOST = /(trycloudflare\.com|ngrok(-free)?\.(app|io|dev)|tunn\.dev|pinggy[\w-]*\.(link|online|io|net)|tunnelmole\.net|loca\.lt|gradio\.live|comfy\.vn)$/i;
// Preferred tunnel when several work: pinggy, then a custom domain, then the rest.
function tunnelRank(host) {
  if (/pinggy/i.test(host)) return 0;
  if (/comfy\.vn$/i.test(host)) return 1;
  if (/tunn\.dev$/i.test(host)) return 2;
  if (/trycloudflare\.com$/i.test(host)) return 3;
  return 4;
}
const IGNORED_HOST = /(google|gstatic|googleusercontent|github|youtube|youtu\.be|shields\.io|sdvn\.vn|stablediffusion\.vn|hungdiffusion|facebook|comfy\.vn\/huongdan)/i;

const STATUS_SCRIPT = `(() => {
  const deep = (root, selector, out = []) => {
    root.querySelectorAll(selector).forEach(el => out.push(el));
    root.querySelectorAll("*").forEach(el => { if (el.shadowRoot) deep(el.shadowRoot, selector, out); });
    return out;
  };
  const nb = window.colab && window.colab.global && window.colab.global.notebook;
  if (!nb) return { ready: false };
  const kernel = nb.kernel;
  const cells = Array.isArray(nb.cells) ? nb.cells : [];
  const btn = document.querySelector("colab-connect-button");
  const connectText = ((btn && (btn.shadowRoot || btn).textContent) || "").replace(/\\s+/g, " ").replace("arrow_drop_down", "").trim();
  const signInVisible = [...document.querySelectorAll("a, button")].some(el => /^\\s*(Sign in|Đăng nhập)\\s*$/i.test(el.textContent || ""));
  const dialogs = deep(document, "mwc-dialog[open], md-dialog[open], paper-dialog[opened], dialog[open]")
    .map(el => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim()).filter(Boolean).map(text => text.slice(0, 300));
  const outputs = [...document.querySelectorAll(".output")].map(el => el.innerText || "").join("\\n");
  return {
    ready: true,
    signedIn: !signInVisible,
    kernelState: kernel && (kernel.getState ? kernel.getState() : kernel.state),
    connected: kernel && kernel.isConnected ? kernel.isConnected() : null,
    executing: nb.isExecuting ? nb.isExecuting() : null,
    runningCells: cells.filter(cell => cell.isRunning && cell.isRunning()).length,
    cells: cells.length,
    connectText,
    dialogs,
    outputTail: outputs.slice(-1200)
  };
})()`;

// Buttons on Colab's own confirmation dialogs that mean "yes, run it".
const CONFIRM_SCRIPT = `(() => {
  const deep = (root, out = []) => {
    root.querySelectorAll("button, mwc-button, md-text-button, md-filled-button, paper-button").forEach(el => out.push(el));
    root.querySelectorAll("*").forEach(el => { if (el.shadowRoot) deep(el.shadowRoot, out); });
    return out;
  };
  // Only "run anyway" — never Drive/OAuth "connect" buttons: those stay with the user.
  const wanted = /^(run anyway|vẫn chạy)$/i;
  const clicked = [];
  for (const el of deep(document)) {
    const label = (el.innerText || el.textContent || el.getAttribute("label") || "").replace(/\\s+/g, " ").trim();
    const inDialog = el.closest && el.closest("mwc-dialog, md-dialog, paper-dialog, dialog, [role=dialog], [role=alertdialog]");
    const host = el.getRootNode && el.getRootNode().host;
    const inShadowDialog = host && host.closest && host.closest("mwc-dialog, md-dialog, paper-dialog, dialog, [role=dialog]");
    if ((inDialog || inShadowDialog) && wanted.test(label)) { el.click(); clicked.push(label); }
  }
  return clicked;
})()`;

function sameNotebook(a, b) {
  const clean = url => String(url || "").split(/[?#]/)[0].replace(/\/+$/, "");
  return clean(a) === clean(b);
}

export function createColabController({ appRoot, getMainWindow, getSavedServers }) {
  // The notebook colab_open last opened: later calls (run, status…) act on that tab.
  let lastNotebook = null;
  function colabGuests() {
    const host = getBrowserWindow()?.webContents;
    if (!host) return [];
    return webContents.getAllWebContents().filter(contents => contents.getType() === "webview"
      && contents.hostWebContents === host
      && /^https:\/\/colab\.research\.google\.com\//.test(contents.getURL()));
  }

  // A specific notebook only matches its own tab; without one, the active Colab tab.
  function guest(url) {
    const guests = colabGuests();
    if (url) return guests.find(contents => sameNotebook(contents.getURL(), url)) || null;
    return lastNotebook && guests.find(contents => sameNotebook(contents.getURL(), lastNotebook)) || guests[0] || null;
  }

  async function requireGuest() {
    const contents = guest();
    if (!contents) throw new Error("Chưa mở Colab trong trình duyệt aPix — gọi colab_open trước.");
    return contents;
  }

  async function waitForNotebook(contents, timeoutMs = 45000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await contents.executeJavaScript(STATUS_SCRIPT).catch(() => null);
      if (state?.ready) return state;
      await sleep(1000);
    }
    return { ready: false };
  }

  async function open(url = COLAB_NOTEBOOK_URL) {
    const target = url || COLAB_NOTEBOOK_URL;
    lastNotebook = target;
    let contents = guest(target);
    if (contents) {
      openBrowserWindow(appRoot);
    } else {
      openBrowserWindow(appRoot, target);
      const deadline = Date.now() + 30000;
      while (!(contents = guest(target)) && Date.now() < deadline) await sleep(500);
      if (!contents) throw new Error("Không mở được tab Colab trong trình duyệt aPix.");
    }
    const state = await waitForNotebook(contents);
    return { url: contents.getURL(), ...state, ...(state.signedIn === false ? { hint: "Chưa đăng nhập Google: đăng nhập trong cửa sổ trình duyệt aPix rồi gọi lại." } : {}) };
  }

  async function status() {
    const contents = await requireGuest();
    const state = await contents.executeJavaScript(STATUS_SCRIPT);
    // Outputs live in sandboxed iframes: read their text too.
    const frames = contents.mainFrame.framesInSubtree.filter(frame => frame !== contents.mainFrame);
    const texts = [];
    for (const frame of frames) {
      const text = await frame.executeJavaScript("document.body ? document.body.innerText : ''").catch(() => "");
      if (text.trim()) texts.push(text.trim());
    }
    const outputTail = [state.outputTail, ...texts].join("\n").trim().slice(-1500);
    return { url: contents.getURL(), ...state, outputTail };
  }

  async function run() {
    const contents = await requireGuest();
    const before = await contents.executeJavaScript(STATUS_SCRIPT);
    if (!before.ready) throw new Error("Notebook Colab chưa tải xong.");
    if (before.signedIn === false) throw new Error("Chưa đăng nhập Google trong trình duyệt aPix — đăng nhập rồi chạy lại.");
    const started = await contents.executeJavaScript(`(() => {
      const nb = window.colab && window.colab.global && window.colab.global.notebook;
      if (nb && typeof nb.runAll === "function") { nb.runAll(); return "runAll"; }
      return "";
    })()`);
    if (!started) {
      // Fallback: Colab's "Run all" shortcut (⌘/Ctrl+F9).
      contents.focus();
      const modifiers = [process.platform === "darwin" ? "meta" : "control"];
      contents.sendInputEvent({ type: "keyDown", keyCode: "F9", modifiers });
      contents.sendInputEvent({ type: "keyUp", keyCode: "F9", modifiers });
    }
    // Accept Colab's own "this notebook was not authored by Google" style prompts.
    const confirmed = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(1000);
      confirmed.push(...await contents.executeJavaScript(CONFIRM_SCRIPT).catch(() => []));
    }
    const after = await contents.executeJavaScript(STATUS_SCRIPT);
    return { started: started || "shortcut", confirmed, ...after };
  }

  async function frameTexts(contents) {
    const texts = [];
    for (const frame of contents.mainFrame.framesInSubtree) {
      const text = await frame.executeJavaScript("document.body ? document.body.innerText : ''").catch(() => "");
      if (text) texts.push(text);
    }
    return texts.join("\n");
  }

  async function probe(address) {
    const parsed = new URL(address);
    const headers = {};
    if (parsed.username) {
      headers.authorization = `Basic ${Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString("base64")}`;
    }
    try {
      const response = await fetch(`${parsed.origin}/system_stats`, { headers, signal: AbortSignal.timeout(6000) });
      if (!response.ok) return { status: response.status, comfy: false };
      const data = await response.json().catch(() => null);
      return { status: response.status, comfy: Boolean(data?.system || data?.devices) };
    } catch (error) {
      return { status: 0, comfy: false, error: error.message };
    }
  }

  async function findServer({ apply = false, url = "", raw = false } = {}) {
    const contents = url ? guest(url) : await requireGuest();
    if (!contents) throw new Error("Không thấy tab Colab này trong trình duyệt aPix.");
    const text = await frameTexts(contents);
    const urls = [...new Set((text.match(/https?:\/\/[^\s"'<>)\]]+/g) || []).map(url => url.replace(/[.,;]+$/, "")))];
    // The notebook prints its tunnels as "🔗 Link online để sử dụng: <url>".
    const announced = new Set((text.match(/Link online[^\n]*?(https?:\/\/[^\s"'<>)\]]+)/gi) || [])
      .map(line => line.match(/https?:\/\/[^\s"'<>)\]]+/)[0].replace(/[.,;]+$/, "")));
    const saved = (await getSavedServers?.()) || [];
    const candidates = [];
    for (const url of urls) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        continue;
      }
      if (/^dashboard\.pinggy\.io$/i.test(parsed.hostname)) continue;
      const isTunnel = TUNNEL_HOST.test(parsed.hostname) || announced.has(url);
      if (!isTunnel || (IGNORED_HOST.test(parsed.hostname) && !TUNNEL_HOST.test(parsed.hostname) && !announced.has(url))) continue;
      // A saved server for the same host carries its login (e.g. https://user:pass@colab.comfy.vn).
      const savedMatch = saved.find(server => {
        try {
          return new URL(server.address).host === parsed.host;
        } catch {
          return false;
        }
      });
      const address = savedMatch ? savedMatch.address : parsed.origin;
      if (candidates.some(item => item.address === address)) continue;
      candidates.push({ address, label: savedMatch?.label || "", rank: tunnelRank(parsed.hostname), ...(await probe(address)) });
    }
    candidates.sort((a, b) => a.rank - b.rank);
    const found = candidates.find(item => item.comfy) || null;
    if (found && apply) {
      const mainWindow = getMainWindow?.();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("app:use-comfy-url", found.address);
    }
    const mask = address => address.replace(/\/\/[^/@]+@/, "//***@");
    return {
      found: Boolean(found),
      address: found ? mask(found.address) : "",
      // Unmasked (may carry a saved login): only for in-process callers, never returned over HTTP.
      ...(raw && found ? { rawAddress: found.address } : {}),
      applied: Boolean(found && apply),
      candidates: candidates.map(item => ({ ...item, address: mask(item.address) }))
    };
  }

  // Reopens the notebook (in the background) when the browser window is gone, and
  // waits until Colab has reconnected to the runtime so it can be released.
  async function guestForStop({ background }) {
    let contents = guest();
    if (!contents) {
      openBrowserWindow(appRoot, lastNotebook || COLAB_NOTEBOOK_URL, { show: !background });
      const deadline = Date.now() + 20000;
      while (!(contents = guest()) && Date.now() < deadline) await sleep(500);
      if (!contents) throw new Error("Không mở được notebook Colab để tắt runtime.");
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const state = await contents.executeJavaScript(STATUS_SCRIPT).catch(() => null);
      if (state?.ready && state.connected) break;
      await sleep(1000);
    }
    return contents;
  }

  // Whether the notebook in the aPix Browser is attached to a runtime right now.
  async function hasRuntime() {
    const contents = guest();
    if (!contents) return false;
    const state = await contents.executeJavaScript(STATUS_SCRIPT).catch(() => null);
    return Boolean(state?.connected || state?.executing);
  }

  async function stop({ deleteRuntime = true, background = false } = {}) {
    const contents = await guestForStop({ background });
    const result = await contents.executeJavaScript(`(() => {
      const nb = window.colab && window.colab.global && window.colab.global.notebook;
      const kernel = nb && nb.kernel;
      if (!kernel) return "no-kernel";
      if (${deleteRuntime ? "true" : "false"} && typeof kernel.unassignCurrentVm === "function") { kernel.unassignCurrentVm(); return "unassign"; }
      if (typeof kernel.interrupt === "function") { kernel.interrupt(); return "interrupt"; }
      return "unsupported";
    })()`);
    const confirmed = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      await sleep(1000);
      confirmed.push(...await contents.executeJavaScript(CONFIRM_SCRIPT.replace("run anyway|vẫn chạy", "yes|có|đồng ý|disconnect and delete|ngắt kết nối và xoá|delete runtime")).catch(() => []));
    }
    return { action: result, confirmed, ...(await contents.executeJavaScript(STATUS_SCRIPT)) };
  }

  return { open, status, run, findServer, stop, hasRuntime };
}
