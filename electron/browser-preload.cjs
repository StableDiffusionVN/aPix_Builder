// CommonJS: sandboxed preloads cannot be ES modules (see preload.cjs).
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("apixBrowser", {
  platform: process.platform,
  useComfyUrl: url => ipcRenderer.invoke("browser:use-comfy-url", url),
  openExternal: url => ipcRenderer.invoke("browser:open-external", url),
  onNavigate: callback => subscribe("browser:navigate", callback),
  onShortcut: callback => subscribe("browser:shortcut", callback)
});
