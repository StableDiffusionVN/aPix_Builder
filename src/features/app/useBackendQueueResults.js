import { useEffect, useRef } from "react";
import { fetchOutputHistoryByRunId } from "../canvas/canvasRuntimeSync.js";
import { collectBackendFormRunIds, pickSettledRunIds } from "./backendQueueResults.js";

const POLL_MS = 2500;
// Khi rảnh vẫn hỏi run log để thấy lệnh mới gửi từ MCP / CLI `apix`.
const IDLE_POLL_MS = 5000;

/**
 * Batch nhiều ảnh: client chỉ chạy lệnh đầu, phần còn lại do hàng chờ backend
 * thực thi nên không có onComplete. Hook này theo dõi các phiên đó và trả về
 * mục history ngay khi backend chạy xong để thư viện/khung xem cập nhật liền.
 */
export function useBackendQueueResults({ sessions, isOwnRun, hasHistoryItem, onAdopt, refreshSessions }) {
  const sessionsRef = useRef(sessions);
  const isOwnRunRef = useRef(isOwnRun);
  const hasHistoryItemRef = useRef(hasHistoryItem);
  const onAdoptRef = useRef(onAdopt);
  const refreshSessionsRef = useRef(refreshSessions);
  const watchingRef = useRef(new Set());

  sessionsRef.current = sessions;
  isOwnRunRef.current = isOwnRun;
  hasHistoryItemRef.current = hasHistoryItem;
  onAdoptRef.current = onAdopt;
  refreshSessionsRef.current = refreshSessions;

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const externalSince = Date.now();

    const watch = (currentSessions) => {
      const runIds = collectBackendFormRunIds(currentSessions, isOwnRunRef.current, { externalSince });
      for (const runId of runIds) {
        if (!hasHistoryItemRef.current?.(runId)) watchingRef.current.add(runId);
      }
    };

    const adopt = async (currentSessions) => {
      const settled = pickSettledRunIds(watchingRef.current, currentSessions);
      if (!settled.length) return;
      const historyByRunId = await fetchOutputHistoryByRunId();
      if (cancelled) return;
      const sessionByRunId = new Map((currentSessions || []).map(session => [session.runId, session]));
      for (const runId of settled) {
        watchingRef.current.delete(runId);
        const item = historyByRunId.get(runId);
        if (!item) continue;
        if (hasHistoryItemRef.current?.(runId)) continue;
        onAdoptRef.current?.(item, sessionByRunId.get(runId) || null);
      }
    };

    const tick = async () => {
      watch(sessionsRef.current);
      const latest = await refreshSessionsRef.current?.() || sessionsRef.current;
      if (cancelled) return;
      watch(latest);
      await adopt(latest);
    };

    const loop = async () => {
      try {
        await tick();
      } catch {
        // Mất kết nối tạm thời: thử lại ở vòng sau.
      }
      if (cancelled) return;
      timer = window.setTimeout(loop, watchingRef.current.size ? POLL_MS : IDLE_POLL_MS);
    };

    void loop();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);
}
