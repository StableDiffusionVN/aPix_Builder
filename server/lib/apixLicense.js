// aPix key: kept in app settings, pushed to the SDVN nodes of each ComfyUI server
// (POST /sdvn/apix/session) before a run so private [SDVN] models download with a
// signed link — never sent inside the workflow (ComfyUI keeps workflows in PNGs and /history).
import { readFile } from "node:fs/promises";
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
      body: JSON.stringify({ key }),
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
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { configured: true, valid: false, error: data.error || `HTTP ${response.status}` };
    pushed.clear();
    // The key's own expiry, not the short session's (older license servers: session).
    const expiresAt = data.keyExpiresAt !== undefined ? data.keyExpiresAt : data.expiresAt;
    return { configured: true, valid: true, label: data.label || "", expiresAt: expiresAt || null };
  } catch (error) {
    return { configured: true, valid: false, error: `Không kết nối được license server: ${error.message}` };
  }
}
