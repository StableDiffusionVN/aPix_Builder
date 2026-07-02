// Bơm danh sách checkpoint/lora từ thư viện SDVN vào discovery cho các type mà
// node loader trong workflow có class_type chứa "SDVN" (server tính sẵn config.sdvnModelTypes).

const SDVN_LIB_URLS = {
  checkpoints: "https://raw.githubusercontent.com/StableDiffusionVN/SDVN_Comfy_node/refs/heads/main/model_lib.json",
  loras: "https://raw.githubusercontent.com/StableDiffusionVN/SDVN_Comfy_node/refs/heads/main/lora_lib.json"
};
const sdvnLibCache = {};

/** Tên model/lora trong thư viện SDVN (key của JSON). type: "checkpoints" | "loras".
 * Cache theo promise để nhiều field gọi cùng lúc (canvas) chỉ fetch một lần; kết quả rỗng/lỗi thì bỏ cache để thử lại. */
export function fetchSdvnLibraryNames(type, signal) {
  if (sdvnLibCache[type]) return sdvnLibCache[type];
  const url = SDVN_LIB_URLS[type];
  if (!url) return Promise.resolve([]);
  const promise = (async () => {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) return [];
      const obj = await response.json();
      return [...new Set(Object.keys(obj || {}).filter(name => typeof name === "string" && name.trim()))];
    } catch {
      return [];
    }
  })();
  sdvnLibCache[type] = promise;
  promise.then(names => { if (!names.length) delete sdvnLibCache[type]; });
  return promise;
}

/** Gộp danh sách model SDVN vào discovery cho các type chỉ định ("None" đầu tiên, server trước, SDVN sau). */
export async function augmentDiscoveryWithSdvn(discovery, sdvnModelTypes, signal) {
  if (!discovery || !Array.isArray(sdvnModelTypes) || !sdvnModelTypes.length) return discovery;
  const dynamicChoices = { ...(discovery.dynamicChoices || {}) };
  for (const type of sdvnModelTypes) {
    const extra = await fetchSdvnLibraryNames(type, signal);
    if (extra.length) {
      dynamicChoices[type] = [...new Set(["None", ...(dynamicChoices[type] || []), ...extra])];
    }
  }
  return { ...discovery, dynamicChoices, modelLists: dynamicChoices };
}
