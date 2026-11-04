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
