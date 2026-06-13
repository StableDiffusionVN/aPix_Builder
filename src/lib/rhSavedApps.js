export const RH_SAVED_APPS_KEY = "comfyui-build:runninghub-saved-apps:v1";

export const DEFAULT_RH_WEBAPP_IDS = [
  "2039924771751731201",
  "2064284416448491522"
];

export const DEFAULT_RH_WEBAPP_ID = DEFAULT_RH_WEBAPP_IDS[0];

export const DEFAULT_RH_APP_CANONICAL_NAMES = {
  "2039924771751731201": "SDVN Klein Upscale",
  "2064284416448491522": "SDVN Make Cosplay"
};

export function isDefaultRhWebapp(id) {
  return DEFAULT_RH_WEBAPP_IDS.includes(String(id || "").trim());
}

export function normalizeAppEntry(entry) {
  const id = String(entry?.id || "").trim();
  if (!id) return null;
  const name = String(entry?.name || "").trim() || id;
  return { id, name };
}

export function normalizeSavedRhApps(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .map(normalizeAppEntry)
    .filter(entry => {
      if (!entry || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
}

export function loadLegacySavedRhApps() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RH_SAVED_APPS_KEY) || "[]");
    return normalizeSavedRhApps(parsed);
  } catch {
    return [];
  }
}

export function clearLegacySavedRhApps() {
  try {
    localStorage.removeItem(RH_SAVED_APPS_KEY);
  } catch {}
}

export function upsertSavedRhAppList(apps, { id, name }) {
  const entry = normalizeAppEntry({ id, name });
  if (!entry) return normalizeSavedRhApps(apps);
  const next = normalizeSavedRhApps(apps).filter(app => app.id !== entry.id);
  next.unshift(entry);
  return next;
}

export function removeSavedRhAppFromList(apps, id) {
  const trimmedId = String(id || "").trim();
  if (!trimmedId) return normalizeSavedRhApps(apps);
  return normalizeSavedRhApps(apps).filter(app => app.id !== trimmedId);
}

export function listRhAppOptions(builtinApps = [], savedApps = []) {
  const seen = new Set();
  const merged = [];
  const builtin = buildDefaultRhApps(builtinApps);
  for (const app of builtin) {
    const entry = normalizeAppEntry(app);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  for (const app of savedApps) {
    const entry = normalizeAppEntry(app);
    if (!entry || seen.has(entry.id) || isDefaultRhWebapp(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged;
}

export async function fetchSavedRhApps() {
  const response = await fetch("/api/runninghub/saved-apps");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeSavedRhApps(data.apps);
}

export async function persistSavedRhApps(apps) {
  const normalized = normalizeSavedRhApps(apps);
  const response = await fetch("/api/runninghub/saved-apps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apps: normalized })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeSavedRhApps(data.apps);
}

export function buildDefaultRhApps(entries = []) {
  const normalized = normalizeSavedRhApps(entries);
  const byId = new Map(normalized.map(app => [app.id, app]));
  const built = DEFAULT_RH_WEBAPP_IDS.map(id => {
    const fromFile = byId.get(id);
    const canonical = DEFAULT_RH_APP_CANONICAL_NAMES[id];
    const name = String(fromFile?.name || canonical || id).trim() || id;
    return { id, name };
  });
  const nameCounts = new Map();
  for (const app of built) {
    nameCounts.set(app.name, (nameCounts.get(app.name) || 0) + 1);
  }
  return built.map(app => {
    if ((nameCounts.get(app.name) || 0) <= 1) return app;
    return {
      id: app.id,
      name: DEFAULT_RH_APP_CANONICAL_NAMES[app.id] || `${app.name} · ${app.id.slice(-6)}`
    };
  });
}

export async function fetchDefaultRhApps() {
  const response = await fetch("/api/runninghub/default-apps");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return buildDefaultRhApps(data.apps);
}

export async function refreshDefaultRhApps(apiKey) {
  const response = await fetch("/api/runninghub/default-apps/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey: String(apiKey || "").trim() })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return buildDefaultRhApps(data.apps);
}
