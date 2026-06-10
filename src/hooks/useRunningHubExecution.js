import { useRef, useState } from "react";
import { nodeFieldKey } from "./useRunningHub";

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function useRunningHubExecution({ onComplete } = {}) {
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [runQueue, setRunQueue] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const runQueueRef = useRef([]);

  function setQueue(nextQueue) {
    runQueueRef.current = nextQueue;
    setRunQueue(nextQueue);
  }

  async function executeRun(job) {
    setActiveRunId(job.runId);
    setRunning(true);
    setError("");
    setResult(null);
    setProgress({ type: "submit", label: "Đang gửi task lên RunningHub cloud..." });
    const clientSubmittedAt = new Date().toISOString();
    setStatus(runQueueRef.current.length
      ? `Đang chạy trên RunningHub, còn ${runQueueRef.current.length} trong hàng chờ...`
      : "Đang gửi task lên RunningHub...");

    try {
      const response = await fetch("/api/runninghub/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Run failed");

      setProgress({ type: "success", label: "Hoàn tất trên RunningHub" });
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
        provider: "runninghub",
        submittedAt: data.submittedAt || timedHistoryItem?.submittedAt || clientSubmittedAt,
        completedAt: data.completedAt || timedHistoryItem?.completedAt || clientCompletedAt,
        durationMs: data.durationMs ?? timedHistoryItem?.durationMs ?? clientDurationMs,
        historyItem: timedHistoryItem
      };
      setResult(timedResult);
      setStatus(`RunningHub hoàn tất task ${data.taskId}${timedResult.durationMs ? ` trong ${formatDuration(timedResult.durationMs)}` : ""}`);
      onComplete?.(timedHistoryItem, timedResult);
    } catch (err) {
      setProgress(null);
      setError(err.message);
      setStatus("RunningHub request thất bại");
    } finally {
      setActiveRunId("");
      const [nextJob, ...remaining] = runQueueRef.current;
      setQueue(remaining);
      if (nextJob) {
        setStatus(`Đang lấy request tiếp theo, còn ${remaining.length} trong hàng chờ...`);
        executeRun(nextJob);
      } else {
        setRunning(false);
        setProgress(null);
      }
    }
  }

  async function cancelWorkflow() {
    if (!activeRunId) return;
    if (runQueueRef.current.length) setQueue([]);
    setStatus("Đang hủy task RunningHub...");
    try {
      const response = await fetch("/api/runninghub/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: activeRunId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cancel failed");
      setStatus(data.message || "Đã gửi yêu cầu hủy RunningHub");
    } catch (err) {
      setError(err.message);
      setStatus("Không hủy được task RunningHub");
    }
  }

  function runWorkflow(job) {
    if (running) {
      setQueue([...runQueueRef.current, job]);
      setStatus(`Đã thêm vào hàng chờ RunningHub (${runQueueRef.current.length + 1} request)`);
      return;
    }
    executeRun(job);
  }

  return {
    running, activeRunId, runQueue,
    status, setStatus, error, setError,
    result, setResult, progress, setProgress,
    runWorkflow, cancelWorkflow
  };
}

export function buildRunningHubJob({ runId, apiKey, webappId, nodes, values }) {
  const nodePayload = nodes.map(node => ({
    nodeId: node.nodeId,
    fieldName: node.fieldName,
    fieldType: node.fieldType,
    fieldValue: values[nodeFieldKey(node)] ?? node.fieldValue ?? ""
  }));
  return {
    runId: runId || crypto.randomUUID(),
    apiKey,
    webappId,
    nodes: nodePayload,
    queuedAt: new Date().toISOString()
  };
}
