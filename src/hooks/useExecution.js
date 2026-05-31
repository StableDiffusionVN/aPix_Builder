import { useRef, useState } from "react";

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function useExecution({ onComplete } = {}) {
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [runQueue, setRunQueue] = useState([]);
  const [status, setStatus] = useState("Đang tải cấu hình YAML...");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const runQueueRef = useRef([]);

  function setQueue(nextQueue) {
    runQueueRef.current = nextQueue;
    setRunQueue(nextQueue);
  }

  function handleProgressEvent(message) {
    const data = message.data || {};
    switch (message.type) {
      case "execution_start":
        setProgress({ value: 0, max: 0, node: null, type: "start", label: "Bắt đầu xử lý..." });
        setStatus("Bắt đầu thực thi workflow...");
        break;
      case "execution_cached": {
        const count = (data.nodes || []).length;
        setProgress(prev => ({ ...(prev || {}), type: "cached", label: `${count} node từ cache` }));
        break;
      }
      case "executing":
        if (data.node != null) {
          setProgress(prev => ({ ...(prev || {}), type: "executing", node: data.node, label: `Đang xử lý node ${data.node}...` }));
          setStatus(`Đang xử lý node ${data.node}...`);
        }
        break;
      case "progress":
        setProgress({ value: data.value, max: data.max, node: data.node, type: "progress", label: `${data.value} / ${data.max}` });
        break;
      case "status":
        if (data.exec_info?.queue_remaining > 0) {
          setStatus(`Đang chờ trong hàng đợi ComfyUI: còn ${data.exec_info.queue_remaining} trước...`);
        }
        break;
      default:
        break;
    }
  }

  async function executeRun(job) {
    setActiveRunId(job.runId);
    setRunning(true);
    setError("");
    setResult(null);
    setProgress(null);
    const clientSubmittedAt = new Date().toISOString();
    setStatus(runQueueRef.current.length
      ? `Đang chạy request, còn ${runQueueRef.current.length} trong hàng chờ...`
      : "Đang gửi workflow tới ComfyUI...");

    // Open SSE before POSTing to catch early events
    let eventSource = null;
    try {
      eventSource = new EventSource(`/api/run-events?runId=${encodeURIComponent(job.runId)}`);
      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "run_end") { eventSource.close(); return; }
          handleProgressEvent(message);
        } catch {}
      };
    } catch {}

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: job.runId,
          template: job.template,
          address: job.address,
          values: job.values,
          queuedAt: job.queuedAt
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Run failed");
      setProgress(null);
      const clientCompletedAt = new Date().toISOString();
      const clientDurationMs = new Date(clientCompletedAt).getTime() - new Date(clientSubmittedAt).getTime();
      const timedHistoryItem = data.historyItem ? {
        ...data.historyItem,
        submittedAt: data.historyItem.submittedAt || data.submittedAt || clientSubmittedAt,
        completedAt: data.historyItem.completedAt || data.completedAt || clientCompletedAt,
        durationMs: data.historyItem.durationMs ?? data.durationMs ?? clientDurationMs
      } : null;
      const timedResult = {
        ...data,
        submittedAt: data.submittedAt || timedHistoryItem?.submittedAt || clientSubmittedAt,
        completedAt: data.completedAt || timedHistoryItem?.completedAt || clientCompletedAt,
        durationMs: data.durationMs ?? timedHistoryItem?.durationMs ?? clientDurationMs,
        historyItem: timedHistoryItem
      };
      setResult(timedResult);
      setStatus(`Hoàn tất prompt ${data.promptId}${timedResult.durationMs ? ` trong ${formatDuration(timedResult.durationMs)}` : ""}`);
      onComplete?.(timedHistoryItem, timedResult);
    } catch (err) {
      setProgress(null);
      setError(err.message);
      setStatus("Request thất bại");
    } finally {
      eventSource?.close();
      setActiveRunId("");
      const [nextJob, ...remaining] = runQueueRef.current;
      setQueue(remaining);
      if (nextJob) {
        setStatus(`Đang lấy request tiếp theo, còn ${remaining.length} trong hàng chờ...`);
        executeRun(nextJob);
      } else {
        setRunning(false);
      }
    }
  }

  async function cancelWorkflow() {
    if (!activeRunId) return;
    // Hủy luôn các request đang chờ ở phía client.
    if (runQueueRef.current.length) setQueue([]);
    setStatus("Đang ngắt request...");
    try {
      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: activeRunId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cancel failed");
      setStatus(data.warning ? `Đã yêu cầu ngắt, cảnh báo: ${data.warning}` : "Đã gửi lệnh ngắt request");
    } catch (err) {
      setError(err.message);
      setStatus("Không gửi được lệnh ngắt");
    }
  }

  function runWorkflow(job) {
    if (running) {
      setQueue([...runQueueRef.current, job]);
      setStatus(`Đã thêm vào hàng chờ (${runQueueRef.current.length + 1} request)`);
      return;
    }
    executeRun(job);
  }

  return {
    running, activeRunId, runQueue,
    status, setStatus, error, setError,
    result, setResult, progress,
    runWorkflow, cancelWorkflow
  };
}
