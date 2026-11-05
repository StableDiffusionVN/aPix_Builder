export function isLegacyInpaintAsset(name) {
  return /^inpaint_(crop|original)_\d+\.png$/.test(String(name || ""));
}

export function inpaintAssetName(value) {
  const source = typeof value === "string" ? value : value?.url;
  if (typeof source !== "string" || !/^(\/|https?:\/\/)/.test(source)) return "";
  try {
    const url = new URL(source, "http://localhost");
    const name = url.searchParams.get("name") || "";
    if (!/^[\w.-]+\.png$/.test(name)) return "";
    if (url.pathname === "/api/inpaint-image" || (url.pathname === "/api/input-image" && isLegacyInpaintAsset(name))) return name;
  } catch { /* Not an image reference. */ }
  return "";
}

export function collectInpaintAssets(value, names = new Set(), seen = new WeakSet()) {
  if (typeof value === "string") {
    const name = inpaintAssetName(value);
    if (name) names.add(name);
  } else if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    Object.values(value).forEach(child => collectInpaintAssets(child, names, seen));
  }
  return names;
}
