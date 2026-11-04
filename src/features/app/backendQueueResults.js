export const BACKEND_RUN_TERMINAL_STATUSES = new Set(["success", "error", "cancelled"]);
export const BACKEND_RUN_ACTIVE_STATUSES = new Set(["running", "queued"]);

// Lệnh do MCP / CLI `apix` gửi thẳng vào hàng chờ backend.
export const EXTERNAL_RUN_KIND = "mcp";

/**
 * Các phiên "form" và "mcp" đang chạy/chờ ở backend (không do client này thực thi).
 * Client chỉ nhận onComplete cho lệnh nó tự gọi /api/run, nên phần còn lại của
 * batch — và lệnh từ MCP/CLI — phải được theo dõi để nạp ảnh kết quả vào thư viện.
 * Lệnh MCP xong sau `externalSince` (lúc client bắt đầu theo dõi) cũng được nhận,
 * kể cả khi chạy nhanh hơn một vòng poll.
 */
export function collectBackendFormRunIds(sessions = [], isOwnRun, { externalSince = null } = {}) {
  const runIds = [];
  for (const session of sessions) {
    if (!session?.runId) continue;
    const runKind = String(session.runKind || "");
    if (runKind !== "form" && runKind !== EXTERNAL_RUN_KIND) continue;
    if (isOwnRun?.(session.runId)) continue;
    const active = BACKEND_RUN_ACTIVE_STATUSES.has(session.status);
    const recentExternal = runKind === EXTERNAL_RUN_KIND
      && externalSince !== null
      && session.status === "success"
      && Date.parse(session.completedAt || "") >= externalSince;
    if (!active && !recentExternal) continue;
    runIds.push(session.runId);
  }
  return runIds;
}

/** RunId đã kết thúc (hoặc biến mất khỏi run log) → tới lượt đọc output history. */
export function pickSettledRunIds(watchedRunIds = [], sessions = []) {
  const statusByRunId = new Map(
    (sessions || []).filter(session => session?.runId).map(session => [session.runId, session.status])
  );
  return [...watchedRunIds].filter(runId => {
    const status = statusByRunId.get(runId);
    return !status || BACKEND_RUN_TERMINAL_STATUSES.has(status);
  });
}

/** Dựng lại `result` cho khung xem ảnh từ một mục output history. */
export function historyItemToResult(item) {
  if (!item) return null;
  return {
    ...(item.result || {
      runId: item.id,
      promptId: item.promptId,
      template: item.templateId,
      address: item.address,
      outputs: item.outputs || []
    }),
    runId: item.result?.runId || item.id,
    provider: item.provider || item.result?.provider,
    rhCoins: item.rhCoins ?? item.result?.rhCoins ?? null,
    durationMs: item.durationMs ?? item.result?.durationMs,
    submittedAt: item.submittedAt ?? item.result?.submittedAt,
    completedAt: item.completedAt || item.createdAt || item.result?.completedAt,
    outputs: item.outputs || item.result?.outputs || [],
    historyItem: item
  };
}
