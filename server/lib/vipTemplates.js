// VIP workflows: kept on the license server, downloaded here while the aPix key is valid and
// removed when the server says it no longer is. A network failure keeps what is installed.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import YAML from "yaml";
import { LICENSE_URL, readApixKey } from "./apixLicense.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MANIFEST = ".vip.json";
const KNOWN = ".known.json";

export const vipTemplatesDir = configDir => path.join(configDir, "vip-templates");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** Ids that were VIP on this machine, also after removal: such a template must not fall back. */
export async function isKnownVipTemplate(configDir, id) {
  const known = await readJson(path.join(vipTemplatesDir(configDir), KNOWN), []);
  return Array.isArray(known) && known.includes(id);
}

/** Unpacks into <dir>/<id>; the ZIP's single top folder is dropped, unsafe paths are rejected. */
export async function installVipZip(dir, id, zipBytes, sha256) {
  const entries = Object.entries(unzipSync(new Uint8Array(zipBytes))).filter(([name]) => !name.endsWith("/") && !name.startsWith("__MACOSX/"));
  const top = new Set(entries.map(([name]) => name.split("/")[0]));
  const prefix = top.size === 1 && entries.every(([name]) => name.includes("/")) ? `${[...top][0]}/` : "";
  const target = path.join(dir, id);
  const staging = `${target}.tmp`;
  await rm(staging, { recursive: true, force: true });
  for (const [name, data] of entries) {
    const relative = name.slice(prefix.length);
    const output = path.resolve(staging, relative);
    if (!output.startsWith(`${path.resolve(staging)}${path.sep}`)) throw new Error(`Đường dẫn không hợp lệ trong workflow VIP: ${name}`);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, data);
  }
  const raw = await readFile(path.join(staging, "app_build.yaml"), "utf8");
  const config = YAML.parse(raw);
  // The folder / id decides the template id, whatever the YAML says.
  await writeFile(path.join(staging, "app_build.yaml"), YAML.stringify({ ...config, app: { ...config.app, id }, template: { ...config.template, id } }));
  const name = config?.template?.name || config?.app?.name || id;
  await writeFile(path.join(staging, MANIFEST), JSON.stringify({ id, name, sha256 }));
  await rm(target, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await rename(staging, target);
  return { id, name };
}

async function installedWorkflows(dir) {
  const names = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const list = [];
  for (const entry of names) {
    if (!entry.isDirectory() || entry.name.endsWith(".tmp")) continue;
    const manifest = await readJson(path.join(dir, entry.name, MANIFEST), null);
    if (manifest?.id) list.push(manifest);
  }
  return list;
}

async function removeAll(dir, installed) {
  for (const item of installed) await rm(path.join(dir, item.id), { recursive: true, force: true });
  return { workflows: [], changed: installed.length > 0 };
}

/** paths: storage paths ({ configDir, personalDataDir }). */
export async function syncVipTemplates(paths, { licenseUrl = LICENSE_URL, fetchImpl = fetch } = {}) {
  const dir = vipTemplatesDir(paths.configDir);
  const installed = await installedWorkflows(dir);
  const publicList = list => list.map(({ id, name }) => ({ id, name }));
  const post = (route, body) => fetchImpl(`${licenseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const offline = () => ({ workflows: publicList(installed), changed: false, offline: true });

  const key = await readApixKey(paths);
  if (!key) return removeAll(dir, installed);
  let session;
  try {
    session = await post("/v1/session", { key });
  } catch {
    return offline();
  }
  if (session.status === 401 || session.status === 403) return removeAll(dir, installed);
  if (!session.ok) return offline();
  const { token } = await session.json();

  let listing;
  try {
    listing = await post("/v1/vip/list", { token });
  } catch {
    return offline();
  }
  if (listing.status === 401 || listing.status === 403) return removeAll(dir, installed);
  if (!listing.ok) return offline(); // e.g. a license server without VIP support yet
  const remote = ((await listing.json()).workflows || []).filter(item => ID_PATTERN.test(item?.id || ""));

  let changed = false;
  const result = [];
  for (const item of remote) {
    const current = installed.find(entry => entry.id === item.id);
    if (current?.sha256 === item.sha256) {
      result.push(current);
      continue;
    }
    try {
      const response = await post("/v1/vip/download", { token, id: item.id });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error("Sai checksum");
      result.push(await installVipZip(dir, item.id, bytes, item.sha256));
      changed = true;
    } catch (error) {
      console.warn(`Không tải được workflow VIP ${item.id}: ${error.message}`);
      if (current) result.push(current);
    }
  }
  for (const item of installed) {
    if (!remote.some(entry => entry.id === item.id)) {
      await rm(path.join(dir, item.id), { recursive: true, force: true });
      changed = true;
    }
  }
  const known = new Set([...(await readJson(path.join(dir, KNOWN), [])), ...remote.map(item => item.id)]);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, KNOWN), JSON.stringify([...known]));
  return { workflows: publicList(result), changed };
}
