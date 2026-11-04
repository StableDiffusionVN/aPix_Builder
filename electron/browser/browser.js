// aPix Browser — small tabbed browser for Colab / remote ComfyUI servers.
// Runs in a sandboxed window; privileged actions go through window.apixBrowser (preload).

const bridge = window.apixBrowser;
const PARTITION = "persist:apix-browser";
const STORAGE_KEY = "apix.browser.tabs";
// Default: the SDVN ComfyUI notebook (installs the SDVN nodes, prints the server link).
const HOME_URL = "https://colab.research.google.com/github/StableDiffusionVN/SDVN-WebUI/blob/main/SDVN_ComfyUI.ipynb";
const BOOKMARKS = [
  { label: "SDVN ComfyUI (Colab)", url: HOME_URL },
  { label: "Google Colab", url: "https://colab.research.google.com/" },
  { label: "Colab SDVN", url: "https://sdvn.me" },
  { label: "Google Drive", url: "https://drive.google.com/" }
];

const tabsEl = document.getElementById("tabs");
const viewsEl = document.getElementById("views");
const addressEl = document.getElementById("address");
const backBtn = document.getElementById("back");
const forwardBtn = document.getElementById("forward");
const reloadBtn = document.getElementById("reload");
const useComfyBtn = document.getElementById("useComfy");
const toastEl = document.getElementById("toast");

const tabs = [];
let activeId = null;
let nextId = 1;
let toastTimer = null;

document.body.classList.toggle("win", bridge?.platform === "win32");

function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

function normalizeInput(value) {
  const text = value.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(text)) return `http://${text}`;
  if (!/\s/.test(text) && /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text)) return `https://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

function activeTab() {
  return tabs.find(tab => tab.id === activeId) || null;
}

function saveTabs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      urls: tabs.map(tab => tab.url).filter(Boolean),
      active: tabs.findIndex(tab => tab.id === activeId)
    }));
  } catch {
    // Storage unavailable: tabs simply are not restored next time.
  }
}

function renderTabs() {
  tabsEl.replaceChildren(...tabs.map(tab => {
    const el = document.createElement("div");
    el.className = `tab${tab.id === activeId ? " active" : ""}`;
    el.title = tab.title || tab.url;
    if (tab.favicon) {
      const icon = document.createElement("img");
      icon.src = tab.favicon;
      icon.alt = "";
      el.append(icon);
    }
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = tab.loading ? "Đang tải…" : (tab.title || tab.url || "Tab mới");
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.title = "Đóng tab (⌘W)";
    // Selecting re-renders the tab strip on mousedown, which would replace this
    // button before its click arrives — so the close button acts on mousedown itself.
    close.addEventListener("mousedown", event => {
      event.stopPropagation();
      if (event.button === 0) closeTab(tab.id);
    });
    el.append(title, close);
    el.addEventListener("mousedown", event => {
      if (event.button === 1) closeTab(tab.id);
      else if (event.button === 0) selectTab(tab.id);
    });
    return el;
  }));
}

function canGo(view, direction) {
  try {
    return direction < 0 ? view.canGoBack() : view.canGoForward();
  } catch {
    return false; // webview not attached yet
  }
}

async function refreshToolbar() {
  const tab = activeTab();
  if (!tab) return;
  if (document.activeElement !== addressEl) addressEl.value = tab.url || "";
  backBtn.disabled = !canGo(tab.view, -1);
  forwardBtn.disabled = !canGo(tab.view, 1);
  const onColab = /^https:\/\/colab\.research\.google\.com\//.test(tab.url || "");
  useComfyBtn.classList.toggle("ready", Boolean(tab.isComfy));
  useComfyBtn.textContent = onColab
    ? "Lấy link ComfyUI từ Colab"
    : tab.isComfy ? "✓ Dùng làm server ComfyUI" : "Dùng làm server ComfyUI";
  useComfyBtn.title = onColab
    ? "Dò link ComfyUI mà notebook in ra (ô RUN), kiểm tra chạy được rồi đặt làm server của aPix"
    : "Đặt địa chỉ trang đang mở làm server ComfyUI của aPix";
}

async function probeComfy(tab) {
  const url = tab.url;
  if (!/^https?:/i.test(url || "")) {
    tab.isComfy = false;
    return;
  }
  const ok = await bridge?.probeComfy?.(url).catch(() => false);
  if (tab.url === url) {
    tab.isComfy = Boolean(ok);
    if (tab.id === activeId) refreshToolbar();
  }
}

function openTab(url = HOME_URL, { activate = true } = {}) {
  const view = document.createElement("webview");
  view.setAttribute("partition", PARTITION);
  view.setAttribute("allowpopups", "");
  view.setAttribute("src", url);
  const tab = { id: nextId++, view, url, title: "", favicon: "", loading: true, isComfy: false };
  tabs.push(tab);
  viewsEl.append(view);

  const onNavigate = event => {
    tab.url = event.url || view.getURL();
    tab.isComfy = false;
    probeComfy(tab);
    saveTabs();
    if (tab.id === activeId) refreshToolbar();
    renderTabs();
  };
  view.addEventListener("did-navigate", onNavigate);
  view.addEventListener("did-navigate-in-page", event => {
    if (event.isMainFrame) onNavigate(event);
  });
  view.addEventListener("page-title-updated", event => {
    tab.title = event.title;
    renderTabs();
  });
  view.addEventListener("page-favicon-updated", event => {
    tab.favicon = event.favicons?.[0] || "";
    renderTabs();
  });
  view.addEventListener("did-start-loading", () => {
    tab.loading = true;
    renderTabs();
  });
  view.addEventListener("did-stop-loading", () => {
    tab.loading = false;
    renderTabs();
    if (tab.id === activeId) refreshToolbar();
  });

  if (activate) selectTab(tab.id);
  else view.classList.add("hidden");
  renderTabs();
  saveTabs();
  return tab;
}

function selectTab(id) {
  activeId = id;
  for (const tab of tabs) tab.view.classList.toggle("hidden", tab.id !== id);
  renderTabs();
  refreshToolbar();
  saveTabs();
}

function closeTab(id) {
  const index = tabs.findIndex(tab => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  tab.view.remove();
  if (!tabs.length) {
    openTab(HOME_URL);
    return;
  }
  if (activeId === id) selectTab(tabs[Math.min(index, tabs.length - 1)].id);
  else renderTabs();
  saveTabs();
}

function navigateActive(url) {
  const tab = activeTab();
  if (!tab || !url) return;
  tab.url = url;
  tab.view.loadURL(url).catch(() => {});
}

document.getElementById("addressForm").addEventListener("submit", event => {
  event.preventDefault();
  const url = normalizeInput(addressEl.value);
  if (url) navigateActive(url);
  addressEl.blur();
});
addressEl.addEventListener("focus", () => addressEl.select());
backBtn.addEventListener("click", () => canGo(activeTab()?.view, -1) && activeTab().view.goBack());
forwardBtn.addEventListener("click", () => canGo(activeTab()?.view, 1) && activeTab().view.goForward());
reloadBtn.addEventListener("click", () => activeTab()?.view.reload());
document.getElementById("newTab").addEventListener("click", () => openTab(HOME_URL));
document.getElementById("external").addEventListener("click", () => {
  const url = activeTab()?.url;
  if (url) bridge?.openExternal?.(url);
});

useComfyBtn.addEventListener("click", async () => {
  const url = activeTab()?.url;
  if (!url) return;
  const result = await bridge?.useComfyUrl?.(url).catch(() => null);
  if (result?.ok) toast(`Đã đặt server ComfyUI: ${result.address}`);
  else toast(result?.error || "Không đặt được server ComfyUI");
});

const bookmarksEl = document.getElementById("bookmarks");
for (const item of BOOKMARKS) {
  const button = document.createElement("button");
  button.className = "bookmark";
  button.textContent = item.label;
  button.title = item.url;
  button.addEventListener("click", () => navigateActive(item.url));
  bookmarksEl.append(button);
}

document.addEventListener("keydown", event => {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod) return;
  const key = event.key.toLowerCase();
  if (key === "t") openTab(HOME_URL);
  else if (key === "w") closeTab(activeId);
  else if (key === "l") addressEl.focus();
  else if (key === "r") activeTab()?.view.reload();
  else return;
  event.preventDefault();
});

// Popups and target=_blank links from pages open as new tabs (routed by main).
bridge?.onOpenTab?.(url => openTab(url));
bridge?.onShortcut?.(action => {
  if (action === "new-tab") openTab(HOME_URL);
  else if (action === "close-tab") closeTab(activeId);
  else if (action === "focus-address") addressEl.focus();
  else if (action === "reload") activeTab()?.view.reload();
});

(function restore() {
  const requested = new URLSearchParams(location.search).get("url");
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    saved = null;
  }
  const urls = Array.isArray(saved?.urls) && saved.urls.length ? saved.urls : [HOME_URL];
  urls.forEach((url, index) => openTab(url, { activate: index === (saved?.active ?? 0) }));
  if (!activeTab()) selectTab(tabs[0].id);
  if (requested) openTab(requested);
})();
