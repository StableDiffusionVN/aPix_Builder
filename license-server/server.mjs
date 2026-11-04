#!/usr/bin/env node
// aPix license server — turns an aPix key into short-lived signed download links
// for private HuggingFace models, so the HuggingFace token never leaves this server.
//
//   HF_TOKEN=hf_… LICENSE_SECRET=… node license-server/server.mjs
//
// Env: PORT (8790), HOST (127.0.0.1), LICENSE_DATA_DIR (./license-data), HF_TOKEN,
// LICENSE_SECRET (HMAC for session tokens), PROTECTED_REPOS ("phamhungd/SDVN-Model"),
// SESSION_HOURS (12), MAX_LINKS_PER_HOUR (120), BASE_PATH ("" or "/license" behind a proxy).
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allowsModel, LicenseStore, signToken, verifyToken } from "./licenseStore.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseHuggingFaceUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "huggingface.co") return null;
  // /{owner}/{repo}/(resolve|blob)/{revision}/{file…}  (datasets/spaces not handled)
  const parts = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const kind = parts[2];
  if (parts.length < 5 || (kind !== "resolve" && kind !== "blob")) return null;
  return { repo: `${parts[0]}/${parts[1]}`, revision: parts[3], file: parts.slice(4).join("/") };
}

// HuggingFace answers a resolve request with a redirect to a signed CDN URL that
// works without the token for a limited time.
async function signedHuggingFaceUrl({ repo, revision, file }, hfToken) {
  const resolveUrl = `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision)}/${file.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(resolveUrl, {
    method: "GET",
    redirect: "manual",
    headers: { authorization: `Bearer ${hfToken}` },
    signal: AbortSignal.timeout(20000)
  });
  const location = response.headers.get("location");
  await response.body?.cancel().catch(() => {});
  if (response.status >= 300 && response.status < 400 && location) {
    return new URL(location, resolveUrl).toString();
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw Object.assign(new Error(`HuggingFace từ chối (${response.status}) cho ${repo}/${file}`), { status: 502 });
  }
  throw Object.assign(new Error(`HuggingFace không trả link tải (HTTP ${response.status})`), { status: 502 });
}

export function createLicenseServer(options = {}) {
  const config = {
    dataDir: options.dataDir || process.env.LICENSE_DATA_DIR || path.join(here, "..", "license-data"),
    hfToken: options.hfToken ?? process.env.HF_TOKEN ?? "",
    secret: options.secret ?? process.env.LICENSE_SECRET ?? "",
    protectedRepos: (options.protectedRepos || process.env.PROTECTED_REPOS || "phamhungd/SDVN-Model").split(",").map(item => item.trim()).filter(Boolean),
    sessionMs: (Number(options.sessionHours || process.env.SESSION_HOURS) || 12) * 3600000,
    maxLinksPerHour: Number(options.maxLinksPerHour || process.env.MAX_LINKS_PER_HOUR) || 120,
    basePath: (options.basePath ?? process.env.BASE_PATH ?? "").replace(/\/+$/, ""),
    signUrl: options.signUrl || signedHuggingFaceUrl
  };
  if (!config.secret || config.secret.length < 16) throw new Error("LICENSE_SECRET phải có ít nhất 16 ký tự");
  const store = options.store || new LicenseStore(config.dataDir);
  const linkCounts = new Map();

  const send = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const readJson = req => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 16384) {
        reject(Object.assign(new Error("Request quá lớn"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("JSON không hợp lệ"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });

  // Behind Cloudflare + nginx the socket address is the proxy's.
  const clientIp = req => String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;

  function overLimit(kid) {
    const now = Date.now();
    const recent = (linkCounts.get(kid) || []).filter(at => now - at < 3600000);
    if (recent.length >= config.maxLinksPerHour) return true;
    recent.push(now);
    linkCounts.set(kid, recent);
    return false;
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://license.local");
    const route = config.basePath && url.pathname.startsWith(config.basePath)
      ? url.pathname.slice(config.basePath.length) || "/"
      : url.pathname;

    if (req.method === "GET" && route === "/v1/health") {
      send(res, 200, { ok: true, protectedRepos: config.protectedRepos.length, hfToken: Boolean(config.hfToken) });
      return;
    }

    if (req.method === "POST" && route === "/v1/session") {
      const body = await readJson(req);
      const { record, error } = await store.check(body.key || "");
      if (!record) {
        send(res, 401, { error });
        return;
      }
      const expiresAt = Math.min(Date.now() + config.sessionMs, record.expiresAt ? Date.parse(record.expiresAt) : Infinity);
      const token = signToken({ kid: record.id, exp: expiresAt }, config.secret);
      await store.logUsage({ kid: record.id, action: "session", ip: clientIp(req) });
      send(res, 200, { token, expiresAt: new Date(expiresAt).toISOString(), label: record.label || "" });
      return;
    }

    if (req.method === "POST" && route === "/v1/download-url") {
      const body = await readJson(req);
      const session = verifyToken(body.token, config.secret);
      if (!session) {
        send(res, 401, { error: "Phiên aPix hết hạn, cần đăng nhập lại bằng mã aPix", code: "session_expired" });
        return;
      }
      const target = parseHuggingFaceUrl(body.url || "");
      if (!target || !config.protectedRepos.includes(target.repo)) {
        // Not a protected model: the node downloads it the normal way.
        send(res, 200, { public: true });
        return;
      }
      const record = await store.byId(session.kid);
      if (!record || record.disabled || (record.expiresAt && Date.parse(record.expiresAt) <= Date.now())) {
        send(res, 403, { error: "Mã aPix không còn hiệu lực" });
        return;
      }
      if (!allowsModel(record, target.file)) {
        send(res, 403, { error: `Mã aPix không có quyền tải ${path.posix.basename(target.file)}` });
        return;
      }
      if (overLimit(record.id)) {
        send(res, 429, { error: "Vượt giới hạn số lượt tải trong 1 giờ" });
        return;
      }
      if (!config.hfToken) {
        send(res, 503, { error: "License server chưa cấu hình HF_TOKEN" });
        return;
      }
      const signed = await config.signUrl(target, config.hfToken);
      await store.logUsage({ kid: record.id, action: "download", repo: target.repo, file: target.file, ip: clientIp(req) });
      send(res, 200, { url: signed, file: path.posix.basename(target.file) });
      return;
    }

    send(res, 404, { error: "Not found" });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
      if (!res.headersSent) send(res, error.status || 500, { error: error.message || String(error) });
    });
  });
  return { server, store, config };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, config } = createLicenseServer();
  const port = Number(process.env.PORT) || 8790;
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () => {
    console.log(`aPix license server on http://${host}:${port}${config.basePath} (data: ${config.dataDir})`);
    if (!config.hfToken) console.warn("Cảnh báo: chưa đặt HF_TOKEN — không cấp được link tải model riêng.");
  });
}
