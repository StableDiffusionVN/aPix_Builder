export function isHttpImageUrl(raw = "") {
  return /^https?:\/\//i.test(String(raw || "").trim());
}

export function normalizeLocalPathInput(raw = "", { windowsFileUrl = false } = {}) {
  let value = String(raw || "").trim();
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (/^file:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:\//.test(value)) {
        value = value.slice(1);
        if (windowsFileUrl) value = value.replace(/\//g, "\\");
      }
    } catch {
      value = value.replace(/^file:\/\//i, "");
    }
  }
  return value.replace(/[\\/]+$/, "");
}

export function isLocalFolderPath(raw = "", options = {}) {
  const value = normalizeLocalPathInput(raw, options);
  if (!value || isHttpImageUrl(value) || value.startsWith("data:")) return false;
  return (
    value.startsWith("/")
    || value.startsWith("~")
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.startsWith("\\\\")
  );
}
