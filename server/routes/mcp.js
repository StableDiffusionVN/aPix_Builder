// How to launch the aPix MCP server from this install (shown in Settings → AI connect).
import { syncVipTemplates } from "../lib/vipTemplates.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installMcpClient, listMcpClients, uninstallMcpClient } from "../lib/mcpClients.js";
import { checkApixKey } from "../lib/apixLicense.js";

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

export function createMcpRoutes({ getStoragePaths, readBody, send }) {
  return async function mcpRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/apix-license/status") {
      send(res, 200, await checkApixKey(getStoragePaths()));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/apix-license/sync-vip") {
      send(res, 200, await syncVipTemplates(getStoragePaths()));
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/mcp-config") {
      send(res, 200, mcpLaunchConfig());
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/mcp-clients") {
      send(res, 200, { clients: await listMcpClients(mcpLaunchConfig()) });
      return true;
    }
    if (req.method === "POST" && (url.pathname === "/api/mcp-clients/install" || url.pathname === "/api/mcp-clients/uninstall")) {
      // Only a known client id is accepted; the entry written is always this install's own launch command.
      const body = JSON.parse(await readBody(req) || "{}");
      const action = url.pathname.endsWith("install") && !url.pathname.endsWith("uninstall") ? installMcpClient : uninstallMcpClient;
      try {
        send(res, 200, { client: await action(String(body.client || ""), mcpLaunchConfig()) });
      } catch (error) {
        send(res, 400, { error: error.message });
      }
      return true;
    }
    return false;
  };
}
