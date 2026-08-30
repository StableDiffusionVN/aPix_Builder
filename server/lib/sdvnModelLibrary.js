// Proxy + cache cho danh sách checkpoint/lora SDVN — server fetch live từ GitHub,
// cache trong RAM một khoảng thời gian để nhiều client/tab không tự gọi thẳng
// raw.githubusercontent.com (gây 429 Too Many Requests khi nhiều người dùng chung IP/văn phòng).

const SDVN_LIB_URLS = {
  checkpoints: "https://raw.githubusercontent.com/StableDiffusionVN/SDVN_Comfy_node/refs/heads/main/model_lib.json",
  loras: "https://raw.githubusercontent.com/StableDiffusionVN/SDVN_Comfy_node/refs/heads/main/lora_lib.json"
};

const CACHE_TTL_MS = 30 * 60 * 1000;
// Khi GitHub đang rate-limit hoặc fetch lỗi, giữ nguyên cache cũ (nếu có) nhưng vẫn
// né gọi lại GitHub trong ít nhất khoảng thời gian này, để tránh dội bom trong lúc bị 429.
const FAILURE_RETRY_MS = 60 * 1000;
const cache = {}; // type -> { names, expiresAt }
const inflight = {}; // type -> Promise
let nextAttemptAt = {}; // type -> timestamp; chặn gọi lại GitHub sớm sau khi fetch lỗi

async function fetchFromGithub(type, { retries = 2 } = {}) {
  const url = SDVN_LIB_URLS[type];
  if (!url) return [];
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        if (attempt < retries) {
          const retryAfterSec = Number(response.headers.get("retry-after")) || 2 ** attempt;
          await new Promise(resolve => setTimeout(resolve, retryAfterSec * 1000));
          continue;
        }
        return null; // vẫn 429 sau khi retry
      }
      if (!response.ok) return null;
      const obj = await response.json();
      return [...new Set(Object.keys(obj || {}).filter(name => typeof name === "string" && name.trim()))];
    } catch {
      if (attempt < retries) continue;
      return null;
    }
  }
  return null;
}

/** Tên model/lora SDVN, có cache TTL server-side. type: "checkpoints" | "loras". */
export async function getSdvnLibraryNames(type) {
  const cached = cache[type];
  if (cached && cached.expiresAt > Date.now()) return cached.names;
  if (nextAttemptAt[type] > Date.now()) return cached ? cached.names : [];
  if (!inflight[type]) {
    inflight[type] = fetchFromGithub(type).finally(() => { delete inflight[type]; });
  }
  const names = await inflight[type];
  if (names === null) {
    nextAttemptAt[type] = Date.now() + FAILURE_RETRY_MS;
    return cached ? cached.names : [];
  }
  cache[type] = { names, expiresAt: Date.now() + CACHE_TTL_MS };
  return names;
}
