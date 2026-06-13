import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let mainWindow;
let backend;

async function createWindow() {
  if (!backend) {
    process.env.APIX_RESOURCE_ROOT = appRoot;
    process.env.APIX_DATA_ROOT = app.getPath("userData");
    process.env.APIX_SERVE_FRONTEND = "1";
    process.env.PORT = "0";

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://${backend.host}:${backend.port}/`);
}

app.whenReady().then(createWindow).catch(error => {
  console.error("Failed to start aPix Builder:", error);
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  backend?.server?.close();
});
