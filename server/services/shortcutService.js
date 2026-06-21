import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createSignedRunningHubShortcut,
  resolveShortcutAssetsDir
} from "../../electron/runninghub-shortcut.mjs";

export function createShortcutService({ readBody, send, resourceRoot }) {
  const shortcutAssetsDir = resolveShortcutAssetsDir(resourceRoot);

  function shortcutDownloadName(value) {
    const base = String(value || "RunningHub Shortcut")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80);
    return `${base || "RunningHub-Shortcut"}.shortcut`;
  }
  
  async function handleRunningHubShortcutExport(req, res) {
    if (process.platform !== "darwin") {
      send(res, 400, { error: "Export Shortcut requires macOS." });
      return;
    }
    const body = JSON.parse(await readBody(req) || "{}");
    const config = body.config;
    const apiKey = String(body.apiKey || "").trim();
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      send(res, 400, { error: "Missing RunningHub configuration." });
      return;
    }
    if (!apiKey) {
      send(res, 400, { error: "Missing RunningHub API key." });
      return;
    }
  
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "apix-shortcut-download-"));
    const outputPath = path.join(tempDir, shortcutDownloadName(body.name));
    try {
      const result = await createSignedRunningHubShortcut({
        config,
        apiKey,
        outputPath,
        assetsDir: shortcutAssetsDir,
        kind: body.kind,
        resourceId: body.resourceId
      });
      const data = await readFile(outputPath);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${path.basename(outputPath)}"`,
        "content-length": data.length,
        "x-runninghub-shortcut-kind": result.kind,
        "x-runninghub-resource-id": result.resourceId,
        "x-runninghub-mapping": encodeURIComponent(result.mapping.join(","))
      });
      res.end(data);
    } catch (error) {
      send(res, 400, { error: error.message || "Could not export Shortcut." });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  return { handleRunningHubShortcutExport };
}
