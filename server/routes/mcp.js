// How to launch the aPix MCP server from this install (shown in Settings → AI connect).
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "mcp", "apix-mcp.mjs");

export function mcpLaunchConfig() {
  const electron = Boolean(process.versions.electron);
  return {
    // Inside the desktop app the Electron binary runs the script as plain Node,
    // so the user's machine does not need Node installed. A dev checkout uses the
    // `node` on PATH (an absolute Homebrew path would break on Node upgrades).
    command: electron ? process.execPath : "node",
    args: [scriptPath],
    env: electron ? { ELECTRON_RUN_AS_NODE: "1" } : {},
    desktop: electron,
    platform: process.platform
  };
}

export function createMcpRoutes({ send }) {
  return async function mcpRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/mcp-config") {
      send(res, 200, mcpLaunchConfig());
      return true;
    }
    return false;
  };
}
