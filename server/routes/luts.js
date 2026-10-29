import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { CUBE_MAX_BYTES, parseCubeLut } from "../../shared/cubeLut.js";

// .cube LUT library: <personalDataDir>/presets/luts/{index.json, <id>.cube}
export function createLutRoutes(context) {
  const { getStoragePaths, readBody, send } = context;

  function lutsDir() {
    return path.join(getStoragePaths().personalDataDir, "presets", "luts");
  }

  async function readIndex() {
    try {
      const parsed = JSON.parse(await readFile(path.join(lutsDir(), "index.json"), "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function writeIndex(items) {
    await mkdir(lutsDir(), { recursive: true });
    await writeFile(path.join(lutsDir(), "index.json"), JSON.stringify(items, null, 2), "utf8");
  }

  function lutFile(id) {
    if (!/^lut_[a-z0-9_-]{1,64}$/i.test(id)) return null;
    return path.join(lutsDir(), `${id}.cube`);
  }

  return async function lutRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/luts")) return false;

    if (req.method === "GET" && url.pathname === "/api/luts") {
      send(res, 200, { luts: await readIndex() });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/luts") {
      const raw = await readBody(req);
      if (raw.length > CUBE_MAX_BYTES * 1.2) {
        send(res, 413, { error: "File .cube quá lớn" });
        return true;
      }
      const body = JSON.parse(raw || "{}");
      let lut;
      try {
        lut = parseCubeLut(String(body.text || ""));
      } catch (error) {
        send(res, 400, { error: error.message });
        return true;
      }
      const id = `lut_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const name = String(body.name || lut.title || "LUT").trim().slice(0, 80) || "LUT";
      await mkdir(lutsDir(), { recursive: true });
      await writeFile(lutFile(id), String(body.text), "utf8");
      const item = { id, name, size: lut.size, createdAt: new Date().toISOString() };
      await writeIndex([...(await readIndex()), item]);
      send(res, 200, { success: true, lut: item });
      return true;
    }

    const match = url.pathname.match(/^\/api\/luts\/([^/]+)$/);
    const id = match ? decodeURIComponent(match[1]) : "";
    const file = lutFile(id);
    if (!file) {
      send(res, 404, { error: "LUT không tồn tại" });
      return true;
    }

    if (req.method === "GET") {
      try {
        const text = await readFile(file, "utf8");
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" });
        res.end(text);
      } catch {
        send(res, 404, { error: "LUT không tồn tại" });
      }
      return true;
    }

    if (req.method === "DELETE") {
      await rm(file, { force: true });
      await writeIndex((await readIndex()).filter(item => item.id !== id));
      send(res, 200, { success: true });
      return true;
    }

    return false;
  };
}
