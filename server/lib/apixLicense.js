// aPix key: kept in app settings, pushed to the SDVN nodes of each ComfyUI server
// (POST /sdvn/apix/session) before a run so private [SDVN] models download with a
// signed link — never sent inside the workflow (ComfyUI keeps workflows in PNGs and /history).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const LICENSE_URL = (process.env.APIX_LICENSE_URL || "https://apix.sdvn.vn/license").replace(/\/+$/, "");
const PUSH_TTL_MS = 30 * 60 * 1000;
const pushed = new Map();

// Storage paths ({ personalDataDir }) → app-settings.json.
function settingsFile(paths) {
  return typeof paths === "string" ? paths : path.join(paths?.personalDataDir || "", "app-settings.json");
}

export async function readApixKey(paths) {
  try {
    const settings = JSON.parse(await readFile(settingsFile(paths), "utf8"));
    const key = String(settings?.license?.apixKey || "").trim();
    return key.startsWith("apx_") ? key : "";
  } catch {
    return "";
  }
}

/**
 * This machine's id (random, kept beside the settings — never synced): a key may be installed on any
 * number of machines, but only one machine at a time may run with it (license server lease).
 */
let deviceIdCache = "";
export async function readDeviceId(paths) {
  if (deviceIdCache) return deviceIdCache;
  const file = path.join(path.dirname(settingsFile(paths)), "device-id");
  try {
    deviceIdCache = (await readFile(file, "utf8")).trim();
  } catch {
    deviceIdCache = "";
  }
  if (!/^[a-z0-9-]{8,80}$/i.test(deviceIdCache)) {
    deviceIdCache = `desktop-${randomUUID()}`;
    await mkdir(path.dirname(file), { recursive: true }).catch(() => {});
    await writeFile(file, deviceIdCache).catch(() => {});
  }
  return deviceIdCache;
}

let session = null; // { key, token, exp }
async function sessionToken(paths, key) {
  if (session && session.key === key && session.exp - 60000 > Date.now()) return session.token;
  const response = await fetch(`${LICENSE_URL}/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, deviceId: await readDeviceId(paths) }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) return "";
  session = { key, token: data.token, exp: Date.parse(data.expiresAt) || Date.now() + 3600000 };
  return session.token;
}

export class ApixDeviceBusyError extends Error {}

/**
 * Before / during a run with an aPix key: hold the key for this machine. Throws ApixDeviceBusyError
 * when another machine is running with it; other failures (offline, invalid key) never block a run.
 */
export async function acquireRunLease(paths) {
  const key = await readApixKey(paths);
  if (!key) return { skipped: true };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await sessionToken(paths, key);
      if (!token) return { skipped: true };
      const response = await fetch(`${LICENSE_URL}/v1/lease`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(15000)
      });
      if (response.status === 401) {
        session = null;
        continue;
      }
      if (response.status === 409) {
        const data = await response.json().catch(() => ({}));
        throw new ApixDeviceBusyError(data.error || "Mã aPix này đang chạy trên máy khác.");
      }
      // 404: a license server without leases yet.
      return { ok: response.ok };
    }
  } catch (error) {
    if (error instanceof ApixDeviceBusyError) throw error;
    return { offline: true };
  }
  return { skipped: true };
}

/** Push the key to a ComfyUI server once per TTL. Never fails the run: public workflows don't need it. */
export async function pushApixKey(target, appSettingsPath) {
  const key = await readApixKey(appSettingsPath);
  if (!key || !target?.httpBase) return null;
  const cached = pushed.get(target.httpBase);
  if (cached && cached.key === key && Date.now() - cached.at < PUSH_TTL_MS) return cached.result;
  let result;
  try {
    const response = await fetch(`${target.httpBase}/sdvn/apix/session`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(target.headers || {}) },
      // deviceId: the node's own downloads count as this machine, not as a second one.
      body: JSON.stringify({ key, deviceId: await readDeviceId(appSettingsPath) }),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json().catch(() => ({}));
    // 404: the server's SDVN nodes predate aPix keys — nothing to do.
    result = response.status === 404 ? { supported: false } : { supported: true, ok: Boolean(data.ok), error: data.error || "" };
  } catch (error) {
    result = { supported: false, error: error.message };
  }
  pushed.set(target.httpBase, { key, at: Date.now(), result });
  return result;
}

/** Validate the saved key against the license server (Settings status). */
export async function checkApixKey(appSettingsPath) {
  const key = await readApixKey(appSettingsPath);
  if (!key) return { configured: false };
  try {
    const response = await fetch(`${LICENSE_URL}/v1/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, deviceId: await readDeviceId(appSettingsPath) }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    session = null;
    if (!response.ok) return { configured: true, valid: false, error: data.error || `HTTP ${response.status}` };
    pushed.clear();
    // The key's own expiry, not the short session's (older license servers: session).
    const expiresAt = data.keyExpiresAt !== undefined ? data.keyExpiresAt : data.expiresAt;
    return { configured: true, valid: true, label: data.label || "", expiresAt: expiresAt || null };
  } catch (error) {
    return { configured: true, valid: false, error: `Không kết nối được license server: ${error.message}` };
  }
}
