export const RH_TOKEN_POLICY = {
  PRIORITY: "priority",
  ROTATE: "rotate"
};

function makeTokenId() {
  return crypto.randomUUID();
}

export function createRhToken({ label = "", apiKey = "" } = {}) {
  return {
    id: makeTokenId(),
    label: String(label || "").trim(),
    apiKey: String(apiKey || "").trim(),
    enabled: true
  };
}

export function normalizeRhTokenEntry(entry, index = 0) {
  if (!entry || typeof entry !== "object") return null;
  const apiKey = String(entry.apiKey || "").trim();
  if (!apiKey) return null;
  return {
    id: String(entry.id || makeTokenId()),
    label: String(entry.label || "").trim() || `Token ${index + 1}`,
    apiKey,
    enabled: entry.enabled !== false
  };
}

export function normalizeRhSettings(raw = {}) {
  const parsed = raw && typeof raw === "object" ? raw : {};
  let tokens = Array.isArray(parsed.tokens)
    ? parsed.tokens.map((entry, index) => normalizeRhTokenEntry(entry, index)).filter(Boolean)
    : [];

  const legacyKey = String(parsed.apiKey || "").trim();
  if (!tokens.length) {
    tokens = legacyKey
      ? [createRhToken({ label: "Primary", apiKey: legacyKey })]
      : [createRhToken({ label: "Primary" })];
  }

  const tokenPolicy = parsed.tokenPolicy === RH_TOKEN_POLICY.ROTATE
    ? RH_TOKEN_POLICY.ROTATE
    : RH_TOKEN_POLICY.PRIORITY;
  const rotateIndex = Number.isFinite(Number(parsed.rotateIndex))
    ? Math.max(0, Math.floor(Number(parsed.rotateIndex)))
    : 0;

  return {
    apiKey: tokens[0]?.apiKey || legacyKey || "",
    webappId: parsed.webappId || "",
    workflowId: parsed.workflowId || "",
    tokens,
    tokenPolicy,
    rotateIndex
  };
}

export function getEnabledRhTokens(settings) {
  return (settings?.tokens || []).filter(token => token?.enabled !== false && token.apiKey?.trim());
}

export function getPrimaryRhApiKey(settings) {
  return getEnabledRhTokens(settings)[0]?.apiKey?.trim() || String(settings?.apiKey || "").trim();
}

export function hasRhApiKey(settings) {
  return getEnabledRhTokens(settings).length > 0;
}

export function orderRhApiKeys(settings) {
  const keys = getEnabledRhTokens(settings).map(token => token.apiKey.trim()).filter(Boolean);
  if (!keys.length) return [];
  if (settings?.tokenPolicy !== RH_TOKEN_POLICY.ROTATE || keys.length === 1) return keys;

  const start = ((Number(settings.rotateIndex) || 0) % keys.length + keys.length) % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

export function buildRhRunAuth(settings) {
  const apiKeys = orderRhApiKeys(settings);
  return {
    apiKey: apiKeys[0] || getPrimaryRhApiKey(settings),
    apiKeys,
    tokenPolicy: settings?.tokenPolicy === RH_TOKEN_POLICY.ROTATE
      ? RH_TOKEN_POLICY.ROTATE
      : RH_TOKEN_POLICY.PRIORITY,
    rotateIndex: Number(settings?.rotateIndex) || 0
  };
}

export function advanceRhRotateIndex(settings) {
  const keys = getEnabledRhTokens(settings);
  if (settings?.tokenPolicy !== RH_TOKEN_POLICY.ROTATE || keys.length <= 1) {
    return settings?.rotateIndex || 0;
  }
  return ((Number(settings.rotateIndex) || 0) + 1) % keys.length;
}

export function syncPrimaryApiKey(settings) {
  const primary = getPrimaryRhApiKey(settings);
  return { ...settings, apiKey: primary };
}

export function reorderRhTokens(tokens, fromIndex, toIndex) {
  const list = [...(tokens || [])];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
    return list;
  }
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
  return list;
}

export function maskRhApiKey(apiKey) {
  const value = String(apiKey || "").trim();
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
