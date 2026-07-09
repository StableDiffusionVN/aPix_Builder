// Bơm danh sách checkpoint/lora từ thư viện SDVN vào discovery cho các type mà
// node loader trong workflow có class_type chứa "SDVN" (server tính sẵn config.sdvnModelTypes).
//
// Danh sách được fetch qua server (/api/sdvn-models) thay vì gọi thẳng
// raw.githubusercontent.com: server cache kết quả (TTL) nên nhiều tab/nhiều máy
// dùng chung một lần fetch tới GitHub, tránh 429 Too Many Requests.

const sdvnLibCache = {};

/** Tên model/lora trong thư viện SDVN. type: "checkpoints" | "loras".
 * Cache theo promise để nhiều field gọi cùng lúc (canvas) chỉ fetch một lần; kết quả rỗng/lỗi thì bỏ cache để thử lại. */
export function fetchSdvnLibraryNames(type, signal) {
  if (sdvnLibCache[type]) return sdvnLibCache[type];
  const promise = (async () => {
    try {
      const response = await fetch(`/api/sdvn-models?type=${encodeURIComponent(type)}`, { signal });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.names) ? data.names : [];
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
