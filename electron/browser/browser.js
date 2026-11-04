// aPix Browser — one fixed page: the SDVN ComfyUI Colab notebook (no tabs, no address bar).
// Runs in a sandboxed window; privileged actions go through window.apixBrowser (preload).

const bridge = window.apixBrowser;
const PARTITION = "persist:apix-browser";
const HOME_URL = "https://colab.research.google.com/github/StableDiffusionVN/SDVN-WebUI/blob/main/SDVN_ComfyUI.ipynb";

const viewsEl = document.getElementById("views");
const titleEl = document.getElementById("title");
const backBtn = document.getElementById("back");
const useComfyBtn = document.getElementById("useComfy");
const toastEl = document.getElementById("toast");
let toastTimer = null;

document.body.classList.toggle("win", bridge?.platform === "win32");

function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

const startUrl = new URLSearchParams(location.search).get("url") || HOME_URL;
const view = document.createElement("webview");
view.setAttribute("partition", PARTITION);
view.setAttribute("allowpopups", "");
view.setAttribute("src", startUrl);
viewsEl.append(view);

function canGoBack() {
  try {
    return view.canGoBack();
  } catch {
    return false; // webview not attached yet
  }
}

function refresh() {
  backBtn.disabled = !canGoBack();
}

function navigate(url) {
  if (url) view.loadURL(url).catch(() => {});
}

view.addEventListener("did-navigate", refresh);
view.addEventListener("did-navigate-in-page", refresh);
view.addEventListener("page-title-updated", event => {
  titleEl.textContent = event.title || "SDVN ComfyUI — Colab";
});
view.addEventListener("did-start-loading", () => titleEl.classList.add("loading"));
view.addEventListener("did-stop-loading", () => {
  titleEl.classList.remove("loading");
  refresh();
});

backBtn.addEventListener("click", () => canGoBack() && view.goBack());
document.getElementById("reload").addEventListener("click", () => view.reload());
document.getElementById("home").addEventListener("click", () => navigate(HOME_URL));
document.getElementById("external").addEventListener("click", () => {
  const url = view.getURL();
  if (url) bridge?.openExternal?.(url);
});

useComfyBtn.addEventListener("click", async () => {
  const result = await bridge?.useComfyUrl?.(view.getURL()).catch(() => null);
  if (result?.ok) toast(`Đã đặt server ComfyUI: ${result.address}`);
  else toast(result?.error || "Không đặt được server ComfyUI");
});

document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
    event.preventDefault();
    view.reload();
  }
});

// Main asks to show a specific notebook (e.g. MCP colab_open with another URL).
bridge?.onNavigate?.(navigate);
bridge?.onShortcut?.(action => {
  if (action === "reload") view.reload();
});
