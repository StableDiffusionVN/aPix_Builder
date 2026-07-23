import { RUNNINGHUB_BASE, RUNNINGHUB_HOST } from "./runningHubClient.js";

// API nội bộ của website runninghub.ai (không cần API key) — dùng cho thư viện duyệt app/workflow.
// Không tài liệu chính thức: mọi lỗi ở đây phải fail mềm, không ảnh hưởng phần chạy task.

const TAG_CACHE_MS = 10 * 60 * 1000;
const LIST_SORTS = new Set(["RECOMMEND", "HOTTEST", "NEWEST", "REPUTATION"]);
const KIND_CONFIG = {
  app: { rang: "WEBAPP", listPath: "/api/webapp/list" },
  workflow: { rang: "WORKFLOW", listPath: "/api/portal/template/list" }
};

const tagCache = new Map();

async function postPortalJson(pathname, body, signal) {
  const response = await fetch(`${RUNNINGHUB_BASE}${pathname}`, {
    method: "POST",
    headers: {
      Host: RUNNINGHUB_HOST,
      "Content-Type": "application/json",
      Accept: "application/json",
      // Origin/Referer quyết định ngôn ngữ dữ liệu (thiếu sẽ trả tên tiếng Trung)
      Origin: RUNNINGHUB_BASE,
      Referer: `${RUNNINGHUB_BASE}/ai-apps`,
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    },
    body: JSON.stringify(body),
    signal
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`RunningHub library HTTP ${response.status}`);
  }
  if (data.code !== 0 && data.code !== "0") {
    throw new Error(data.msg || data.message || `RunningHub library error ${data.code}`);
  }
  return data.data;
}

function normalizeKind(kind) {
  return kind === "workflow" ? "workflow" : "app";
}

function normalizeTagNode(node) {
  if (!node || !node.id) return null;
  return {
    id: String(node.id),
    name: node.name || "",
    children: Array.isArray(node.childTags)
      ? node.childTags.map(normalizeTagNode).filter(Boolean)
      : []
  };
}

export async function fetchRhLibraryTags(kind, signal) {
  const normalizedKind = normalizeKind(kind);
  const cached = tagCache.get(normalizedKind);
  if (cached && Date.now() - cached.at < TAG_CACHE_MS) return cached.data;

  const raw = await postPortalJson("/api/portal/tag/tree", { rang: KIND_CONFIG[normalizedKind].rang }, signal);
  const tags = Array.isArray(raw) ? raw.map(normalizeTagNode).filter(Boolean) : [];
  tagCache.set(normalizedKind, { at: Date.now(), data: tags });
  return tags;
}

function normalizeCover(entry) {
  if (!entry || !entry.url) return null;
  const url = String(entry.url);
  return {
    url,
    thumbnail: entry.thumbnailUri || url,
    width: Number(entry.imageWidth) || null,
    height: Number(entry.imageHeight) || null,
    isVideo: /\.(mp4|webm|mov)(\?|$)/i.test(url)
  };
}

function normalizeRecord(record) {
  if (!record || !record.id) return null;
  const stats = record.statisticsInfo || {};
  return {
    id: String(record.id),
    name: record.name || "",
    intro: record.intro || record.desc || "",
    cover: normalizeCover(record.preview) || normalizeCover(record.covers?.[0]),
    owner: record.owner
      ? { name: record.owner.name || "", avatar: record.owner.avatar || "" }
      : null,
    stats: {
      useCount: Number(stats.useCount) || 0,
      likeCount: Number(stats.likeCount) || 0,
      collectCount: Number(stats.collectCount) || 0
    },
    tags: Array.isArray(record.tags)
      ? record.tags.filter(tag => tag && tag.id).map(tag => ({ id: String(tag.id), name: tag.name || "" }))
      : [],
    publishTime: Number(record.publishTime) || null
  };
}

/// Chi tiết app từ API nội bộ — dùng lấy `instanceType` ("plus" = app chạy Plus GPU,
/// API key thường có thể không hỗ trợ). Fail mềm: lỗi → null.
export async function fetchRhWebappDetail(webappId, signal) {
  try {
    const raw = await postPortalJson("/api/webapp/detail", { webappId: String(webappId) }, signal);
    if (!raw || typeof raw !== "object") return null;
    return {
      instanceType: raw.instanceType || null,
      description: raw.description || "",
      avgRunningSeconds: Number(raw.avgRunningSeconds) || null,
      runningSuccessRate: raw.runningSuccessRate ?? null
    };
  } catch {
    return null;
  }
}

export async function fetchRhLibraryList(options = {}, signal) {
  const normalizedKind = normalizeKind(options.kind);
  const sort = LIST_SORTS.has(options.sort) ? options.sort : "RECOMMEND";
  const current = Math.max(1, Number(options.current) || 1);
  const size = Math.min(60, Math.max(1, Number(options.size) || 30));
  const tags = Array.isArray(options.tags)
    ? options.tags.map(String).filter(Boolean).slice(0, 64)
    : [];
  const body = { current, size, tags, sort };
  const search = typeof options.search === "string" ? options.search.trim() : "";
  if (search) body.search = search;
  if (sort === "HOTTEST" || sort === "REPUTATION") body.days = Number(options.days) || 3;

  const raw = await postPortalJson(KIND_CONFIG[normalizedKind].listPath, body, signal);
  const records = Array.isArray(raw?.records) ? raw.records.map(normalizeRecord).filter(Boolean) : [];
  return {
    total: Number(raw?.total) || 0,
    current,
    size,
    records
  };
}
