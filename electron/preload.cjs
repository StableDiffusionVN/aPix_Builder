// CommonJS BẮT BUỘC: preload chạy trong sandbox (sandbox: true) không hỗ trợ ESM —
// bản .mjs cũ fail "Cannot use import statement outside a module" ngay khi load,
// làm window.apixDesktop không tồn tại (mất auto-update + Export Shortcut desktop).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("apixDesktop", {
  platform: process.platform,
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  dismissUpdate: version => ipcRenderer.invoke("app:dismiss-update", version),
  openExternal: url => ipcRenderer.invoke("app:open-external", url),
  exportRunningHubShortcut: payload => ipcRenderer.invoke("runninghub:export-shortcut", payload),
  openBrowser: url => ipcRenderer.invoke("browser:open", url),
  colabSheet: {
    useComfyUrl: url => ipcRenderer.invoke("browser:use-comfy-url", url),
    openExternal: url => ipcRenderer.invoke("browser:open-external", url),
    onOpen: callback => {
      const listener = (_event, payload) => callback(payload || {});
      ipcRenderer.on("colab-sheet:open", listener);
      return () => ipcRenderer.removeListener("colab-sheet:open", listener);
    },
    onNavigate: callback => {
      const listener = (_event, url) => callback(url);
      ipcRenderer.on("browser:navigate", listener);
      return () => ipcRenderer.removeListener("browser:navigate", listener);
    },
    onShortcut: callback => {
      const listener = (_event, action) => callback(action);
      ipcRenderer.on("browser:shortcut", listener);
      return () => ipcRenderer.removeListener("browser:shortcut", listener);
    }
  },
  colab: {
    start: () => ipcRenderer.invoke("colab:start"),
    stop: () => ipcRenderer.invoke("colab:stop"),
    getState: () => ipcRenderer.invoke("colab:get-state"),
    configure: config => ipcRenderer.invoke("colab:configure", config),
    onState: callback => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("colab:state", listener);
      return () => ipcRenderer.removeListener("colab:state", listener);
    }
  },
  comfyLocal: {
    start: () => ipcRenderer.invoke("comfy-local:start"),
    stop: () => ipcRenderer.invoke("comfy-local:stop"),
    getState: () => ipcRenderer.invoke("comfy-local:get-state"),
    inspect: (folder, python) => ipcRenderer.invoke("comfy-local:inspect", folder, python),
    pickFolder: () => ipcRenderer.invoke("comfy-local:pick-folder"),
    onState: callback => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("comfy-local:state", listener);
      return () => ipcRenderer.removeListener("comfy-local:state", listener);
    }
  },
  onUseComfyUrl: callback => {
    const listener = (_event, address) => callback(address);
    ipcRenderer.on("app:use-comfy-url", listener);
    return () => ipcRenderer.removeListener("app:use-comfy-url", listener);
  },
  onUpdateAvailable: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:update-available", listener);
    return () => ipcRenderer.removeListener("app:update-available", listener);
  }
});
