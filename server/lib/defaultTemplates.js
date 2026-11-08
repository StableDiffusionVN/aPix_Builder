// Default templates live on the license server (public, no aPix key), so they can be added,
// edited or removed at any time without a new app release. The app keeps a cached copy and
// still ships the same templates in config/default as the offline / first-run fallback.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { LICENSE_URL } from "./apixLicense.js";
import { installVipZip } from "./vipTemplates.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MANIFEST = ".vip.json";
const LISTING = ".listing.json";

export const remoteDefaultsDir = configDir => path.join(configDir, "remote-default-templates");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Ids (in order) of the server's last default list, or null before the first successful sync.
 * Bundled defaults missing from it were removed on the server and must not show.
 */
export async function readDefaultsListing(configDir) {
  const listing = await readJson(path.join(remoteDefaultsDir(configDir), LISTING), null);
  return Array.isArray(listing) ? listing.filter(id => ID_PATTERN.test(String(id))) : null;
}

async function installedTemplates(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const list = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.endsWith(".tmp")) continue;
    const manifest = await readJson(path.join(dir, entry.name, MANIFEST), null);
    if (manifest?.id) list.push(manifest);
  }
  return list;
}

/** paths: storage paths ({ configDir }). Network failures keep what is cached. */
export async function syncDefaultTemplates(paths, { licenseUrl = LICENSE_URL, fetchImpl = fetch } = {}) {
  const dir = remoteDefaultsDir(paths.configDir);
  const installed = await installedTemplates(dir);
  const get = route => fetchImpl(`${licenseUrl}${route}`, { signal: AbortSignal.timeout(30000) });
  const publicList = list => list.map(({ id, name }) => ({ id, name }));

  let remote;
  try {
    const response = await get("/v1/defaults/list");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    remote = ((await response.json()).templates || []).filter(item => ID_PATTERN.test(item?.id || ""));
    // An empty list is treated as "nothing published yet", never as "hide every default".
    if (!remote.length) throw new Error("empty");
  } catch {
    return { templates: publicList(installed), changed: false, offline: true };
  }

  let changed = false;
  const result = [];
  for (const item of remote) {
    const current = installed.find(entry => entry.id === item.id);
    if (current?.sha256 === item.sha256) {
      result.push(current);
      continue;
    }
    try {
      const response = await get(`/v1/defaults/download?id=${encodeURIComponent(item.id)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error("Sai checksum");
      result.push(await installVipZip(dir, item.id, bytes, item.sha256));
      changed = true;
    } catch (error) {
      console.warn(`Không tải được template mặc định ${item.id}: ${error.message}`);
      if (current) result.push(current);
    }
  }
  for (const item of installed) {
    if (!remote.some(entry => entry.id === item.id)) {
      await rm(path.join(dir, item.id), { recursive: true, force: true });
      changed = true;
    }
  }
  const ids = remote.map(item => item.id);
  const previous = await readDefaultsListing(paths.configDir);
  if (JSON.stringify(previous) !== JSON.stringify(ids)) changed = true;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, LISTING), JSON.stringify(ids));
  return { templates: publicList(result), changed };
}
