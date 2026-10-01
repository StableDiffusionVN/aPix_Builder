/**
 * Mất kết nối giữa UI và server app KHÔNG có nghĩa là lệnh thất bại: server vẫn
 * chạy tiếp (upload/submit/chờ RunningHub) và vẫn lưu kết quả vào lịch sử. Trước
 * đây UI báo "request thất bại" trong khi run log vẫn ghi status=running —
 * xung đột thông tin và người dùng tưởng mất lệnh.
 */

/** Lỗi fetch do đứt kết nối (không phải lỗi nghiệp vụ có phản hồi từ server). */
export function isNetworkFetchError(error) {
  if (!error) return false;
  if (error.name === "AbortError") return false;
  const message = String(error.message || "");
  return error.name === "TypeError"
    || /failed to fetch|load failed|network ?error|network request failed|connection (closed|reset)/i.test(message);
}

/** Run còn đang chạy trên server app? (dùng khi UI mất kết nối giữa chừng) */
export async function runStillActiveOnServer(runId) {
  if (!runId) return false;
  try {
    const response = await fetch("/api/active-runs");
    if (!response.ok) return false;
    const data = await response.json();
    return (Array.isArray(data?.runs) ? data.runs : []).some(run => run?.runId === runId);
  } catch {
    return false;
  }
}

/** Mất kết nối nhưng server vẫn giữ run → UI nên chờ thay vì báo lỗi. */
export async function shouldKeepRunAfterFetchError(error, runId) {
  if (!isNetworkFetchError(error)) return false;
  return runStillActiveOnServer(runId);
}
