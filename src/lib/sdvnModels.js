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

/** Gắn danh sách model SDVN theo TỪNG FIELD (per-field — đồng bộ iOS/Android) vào
 * discovery.sdvnExtras = { [normalizeId(item.id)]: names }. KHÔNG đụng dynamicChoices
 * dùng chung: field trỏ node loader thường không được thấy model SDVN (chọn sẽ fail
 * khi chạy vì chỉ node SDVN tự tải model theo tên). */
export async function augmentDiscoveryWithSdvn(discovery, sdvnModelFields, signal) {
  const entries = Object.entries(sdvnModelFields || {});
  if (!discovery || !entries.length) return discovery;
  const namesByType = {};
  for (const type of new Set(entries.map(([, type]) => type))) {
    namesByType[type] = await fetchSdvnLibraryNames(type, signal);
  }
  // Ghi entry cho MỌI field trong map (kể cả rỗng khi thư viện chưa tải được) —
  // sdvnFieldPending dựa vào sự tồn tại của entry để biết augment đã chạy xong.
  const sdvnExtras = {};
  for (const [fieldKey, type] of entries) {
    sdvnExtras[fieldKey] = namesByType[type] || [];
  }
  return { ...discovery, sdvnExtras };
}

/** Field thuộc sdvnModelFields nhưng discovery hiện tại CHƯA có entry cho nó
 * (discovery của template khác / augment chưa xong) → chờ, không reset value. */
export function sdvnFieldPending(discovery, sdvnModelFields, fieldKey) {
  if (!fieldKey || !sdvnModelFields?.[fieldKey]) return false;
  return !discovery?.sdvnExtras || !(fieldKey in discovery.sdvnExtras);
}

/** Danh sách choices cuối cùng cho 1 field dynamic: field có thư viện SDVN riêng →
 * "None" đầu tiên, danh sách server trước, SDVN sau; field khác giữ nguyên danh sách server. */
export function fieldChoicesWithSdvn(discovery, baseChoices, fieldKey) {
  const extras = fieldKey ? discovery?.sdvnExtras?.[fieldKey] : null;
  if (!extras?.length) return baseChoices;
  return [...new Set(["None", ...(baseChoices || []), ...extras])];
}
