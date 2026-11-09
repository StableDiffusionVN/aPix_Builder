// aPix license keys: issued by the admin CLI, stored hashed (keys.json), exchanged
// for short-lived HMAC session tokens; every download-url request is logged.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function hashKey(key) {
  return createHash("sha256").update(String(key).trim()).digest("hex");
}

export function generateKey() {
  const bytes = randomBytes(32);
  let body = "";
  for (const byte of bytes) body += KEY_ALPHABET[byte % KEY_ALPHABET.length];
  return `apx_${body}`;
}

const b64url = value => Buffer.from(value).toString("base64url");

export function signToken(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyToken(token, secret, now = Date.now()) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.kid || !(payload.exp > now)) return null;
    return payload;
  } catch {
    return null;
  }
}

export class LicenseStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.keysFile = path.join(dataDir, "keys.json");
    this.usageFile = path.join(dataDir, "usage.log");
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.keysFile, "utf8"));
      return Array.isArray(data.keys) ? data.keys : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async save(keys) {
    await mkdir(this.dataDir, { recursive: true });
    const temp = `${this.keysFile}.tmp`;
    await writeFile(temp, `${JSON.stringify({ keys }, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, this.keysFile);
  }

  async add({ label = "", models = "*", days = null, note = "", devices = null, workflows = "*" } = {}) {
    const keys = await this.load();
    const key = generateKey();
    const record = {
      id: `k_${randomBytes(6).toString("hex")}`,
      hash: hashKey(key),
      label,
      note,
      models,
      createdAt: new Date().toISOString(),
      expiresAt: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
      // Machines that may run at the same time (installed on any number); null = no limit.
      maxDevices: Number(devices) > 0 ? Math.floor(Number(devices)) : null,
      // VIP workflows this key unlocks: "*" = all, or a list of ids (file names in vip/ without .zip).
      workflows,
      disabled: false
    };
    keys.push(record);
    await this.save(keys);
    return { key, record };
  }

  async update(idOrLabel, patch) {
    const keys = await this.load();
    const record = keys.find(item => item.id === idOrLabel || item.label === idOrLabel);
    if (!record) throw new Error(`Không thấy mã: ${idOrLabel}`);
    Object.assign(record, patch);
    await this.save(keys);
    return record;
  }

  async remove(idOrLabel) {
    const keys = await this.load();
    const next = keys.filter(item => item.id !== idOrLabel && item.label !== idOrLabel);
    if (next.length === keys.length) throw new Error(`Không thấy mã: ${idOrLabel}`);
    await this.save(next);
  }

  /** The active record for a raw key, or a reason it cannot be used. */
  async check(key, now = Date.now()) {
    const hash = hashKey(key);
    const record = (await this.load()).find(item => item.hash === hash);
    if (!record) return { error: "Mã aPix không hợp lệ" };
    if (record.disabled) return { error: "Mã aPix đã bị khóa" };
    if (record.expiresAt && Date.parse(record.expiresAt) <= now) return { error: "Mã aPix đã hết hạn" };
    return { record };
  }

  async byId(id) {
    return (await this.load()).find(item => item.id === id) || null;
  }

  async logUsage(entry) {
    await mkdir(this.dataDir, { recursive: true });
    await appendFile(this.usageFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  }
}

/** Whether a key may download a file (models "*" or a list of file names / globs ending in "*"). */
export function allowsModel(record, file) {
  const models = record?.models;
  if (models === "*" || models === undefined) return true;
  const list = Array.isArray(models) ? models : String(models).split(",");
  const name = path.posix.basename(file);
  return list.map(item => item.trim()).filter(Boolean).some(item => (
    item.endsWith("*") ? name.startsWith(item.slice(0, -1)) || file.startsWith(item.slice(0, -1)) : item === name || item === file
  ));
}

/** Whether a key unlocks a VIP workflow (no field / "*" = all — keys made before the option). */
export function allowsWorkflow(record, id) {
  const workflows = record?.workflows ?? "*";
  if (workflows === "*") return true;
  const list = Array.isArray(workflows) ? workflows : String(workflows).split(",");
  return list.map(item => item.trim()).filter(Boolean).includes(id);
}
