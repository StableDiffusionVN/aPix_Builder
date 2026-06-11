import { useRef, useState } from "react";
import { describeJob } from "../lib/runLog";

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function useExecution({ onComplete, runLog } = {}) {
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [runQueue, setRunQueue] = useState([]);
  const [status, setStatus] = useState("Đang tải cấu hình YAML...");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const runQueueRef = useRef([]);
  const activeRunIdRef = useRef("");
  const progressLogRef = useRef(new Map());

  function appendLog(level, message, meta = {}) {
    const runId = meta.runId || activeRunIdRef.current;
    runLog?.appendLog?.(runId, level, message, { provider: "local", ...meta });
  }

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
        appendLog("info", "ComfyUI bắt đầu thực thi workflow");
        break;
      case "execution_cached": {
        const count = (data.nodes || []).length;
        setProgress(prev => ({ ...(prev || {}), type: "cached", label: `${count} node từ cache` }));
        appendLog("info", `${count} node được lấy từ cache`);
        break;
      }
      case "executing":
        if (data.node != null) {
          setProgress(prev => ({ ...(prev || {}), type: "executing", node: data.node, label: `Đang xử lý node ${data.node}...` }));
          setStatus(`Đang xử lý node ${data.node}...`);
          appendLog("info", `Đang xử lý node ${data.node}`);
        }
        break;
      case "progress": {
        setProgress({ value: data.value, max: data.max, node: data.node, type: "progress", label: `${data.value} / ${data.max}` });
        const nodeKey = String(data.node ?? "?");
        const now = Date.now();
        const lastLoggedAt = progressLogRef.current.get(nodeKey) || 0;
        if (now - lastLoggedAt >= 1000) {
          progressLogRef.current.set(nodeKey, now);
          appendLog("info", `Tiến độ node ${nodeKey}: ${data.value}/${data.max}`);
        }
        break;
      }
      case "status":
        if (data.exec_info?.queue_remaining > 0) {
          const queueRemaining = data.exec_info.queue_remaining;
          setStatus(`Đang chờ trong hàng đợi ComfyUI: còn ${queueRemaining} trước...`);
          appendLog("info", `ComfyUI còn ${queueRemaining} prompt trước trong hàng đợi`);
        }
        break;
      default:
        break;
    }
  }

  function endQueuedSessions(status = "cancelled") {
    for (const queuedJob of runQueueRef.current) {
      runLog?.endSession?.(queuedJob.runId, status);
    }
  }

  async function executeRun(job) {
    activeRunIdRef.current = job.runId;
    setActiveRunId(job.runId);
    setActiveJob(job);
    progressLogRef.current = new Map();
    runLog?.updateSession?.(job.runId, { status: "running" });
    setRunning(true);
    setError("");
    setResult(null);
    setProgress(null);
    const clientSubmittedAt = new Date().toISOString();
    const queueAhead = runQueueRef.current.length;
    setStatus(queueAhead
      ? `Đang chạy request, còn ${queueAhead} trong hàng chờ...`
      : "Đang gửi workflow tới ComfyUI...");
    appendLog("info", `Bắt đầu chạy ${describeJob(job)}`, { runId: job.runId });
    if (queueAhead) appendLog("info", `Còn ${queueAhead} request chờ sau lệnh này`);

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
      appendLog("success", `Hoàn tất prompt ${data.promptId}${timedResult.durationMs ? ` trong ${formatDuration(timedResult.durationMs)}` : ""}`, { runId: job.runId });
      runLog?.endSession?.(job.runId, "success", { durationMs: timedResult.durationMs });
      onComplete?.(timedHistoryItem, timedResult);
    } catch (err) {
      setProgress(null);
      setError(err.message);
      setStatus("Request thất bại");
      appendLog("error", err.message || "Request thất bại", { runId: job.runId });
      runLog?.endSession?.(job.runId, "error", { error: err.message });
    } finally {
      eventSource?.close();
      activeRunIdRef.current = "";
      setActiveRunId("");
      setActiveJob(null);
      const [nextJob, ...remaining] = runQueueRef.current;
      setQueue(remaining);
      if (nextJob) {
        setStatus(`Đang lấy request tiếp theo, còn ${remaining.length} trong hàng chờ...`);
        appendLog("info", `Chuyển sang request tiếp theo: ${describeJob(nextJob)}`, { runId: nextJob.runId });
        executeRun(nextJob);
      } else {
        setRunning(false);
      }
    }
  }

  async function cancelWorkflow() {
    if (!activeRunIdRef.current) return;
    if (runQueueRef.current.length) {
      endQueuedSessions("cancelled");
      setQueue([]);
      appendLog("warn", "Đã xóa toàn bộ request đang chờ trong hàng chờ client");
    }
    setStatus("Đang ngắt request...");
    appendLog("warn", "Đang gửi lệnh ngắt request", { runId: activeRunIdRef.current });
    try {
      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: activeRunIdRef.current })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cancel failed");
      const cancelMessage = data.warning ? `Đã yêu cầu ngắt, cảnh báo: ${data.warning}` : "Đã gửi lệnh ngắt request";
      setStatus(cancelMessage);
      appendLog("warn", cancelMessage, { runId: activeRunIdRef.current });
      runLog?.endSession?.(activeRunIdRef.current, "cancelled");
    } catch (err) {
      setError(err.message);
      setStatus("Không gửi được lệnh ngắt");
      appendLog("error", err.message || "Không gửi được lệnh ngắt", { runId: activeRunIdRef.current });
    }
  }

  function runWorkflow(job) {
    if (running) {
      setQueue([...runQueueRef.current, job]);
      const queueSize = runQueueRef.current.length;
      setStatus(`Đã thêm vào hàng chờ (${queueSize} request)`);
      runLog?.startSession?.(job, { provider: "local", status: "queued" });
      appendLog("queue", `Thêm vào hàng chờ: ${describeJob(job)} (vị trí #${queueSize})`, { runId: job.runId });
      return;
    }
    runLog?.startSession?.(job, { provider: "local", status: "running" });
    executeRun(job);
  }

  return {
    running, activeRunId, activeJob, activeTaskId: "", taskStatus: null, runQueue,
    status, setStatus, error, setError,
    result, setResult, progress,
    runWorkflow, cancelWorkflow
  };
}
