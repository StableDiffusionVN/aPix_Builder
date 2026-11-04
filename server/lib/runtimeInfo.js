// Publishes where this aPix server listens (~/.apix/server.json) so local tools —
// the MCP server and the `apix` CLI — find it even on the desktop app's random port.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function runtimeInfoPath() {
  return process.env.APIX_RUNTIME_FILE || path.join(os.homedir(), ".apix", "server.json");
}

export function publishRuntimeInfo({ host, port, dataRoot = "" }) {
  const file = runtimeInfoPath();
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({
      url: `http://${host}:${port}`,
      host,
      port,
      pid: process.pid,
      dataRoot,
      desktop: Boolean(process.versions.electron),
      startedAt: new Date().toISOString()
    }, null, 2)}\n`, { mode: 0o600 });
  } catch (error) {
    console.warn("Could not write aPix runtime info:", error.message);
    return;
  }
  const cleanup = () => {
    try {
      const current = JSON.parse(readFileSync(file, "utf8"));
      if (current.pid === process.pid) rmSync(file, { force: true });
    } catch {
      // Already gone or replaced by another aPix instance.
    }
  };
  process.once("exit", cleanup);
}
