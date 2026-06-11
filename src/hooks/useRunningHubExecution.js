import { useRef, useState } from "react";
import { describeJob } from "../lib/runLog";
import { nodeFieldKey } from "./useRunningHub";

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function useRunningHubExecution({ onComplete, runLog } = {}) {
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [activeTaskId, setActiveTaskId] = useState("");
  const [taskStatus, setTaskStatus] = useState(null);
  const [runQueue, setRunQueue] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const runQueueRef = useRef([]);
  const activeRunIdRef = useRef("");
  const activeTaskIdRef = useRef("");

  function appendLog(level, message, meta = {}) {
    const runId = meta.runId || activeRunIdRef.current;
    runLog?.appendLog?.(runId, level, message, { provider: "runninghub", ...meta });
  }

  function setQueue(nextQueue) {
    runQueueRef.current = nextQueue;
    setRunQueue(nextQueue);
  }

  function handleRhProgressEvent(message, runId) {
    const data = message.data || {};
    switch (message.type) {
      case "rh_task_submitted": {
        const taskId = String(data.taskId || "");
        activeTaskIdRef.current = taskId;
        setActiveTaskId(taskId);
        runLog?.updateSession?.(runId, { taskId });
        setTaskStatus({ status: "submitted", label: "Đã tạo task trên RunningHub" });
        setProgress({ type: "queued", label: "Đã tạo task trên RunningHub" });
        setStatus(`RunningHub task ${taskId} đã được tạo`);
        appendLog("info", `RunningHub task ID: ${taskId}`, { runId, taskId });
        break;
      }
      case "rh_task_status": {
        const taskId = data.taskId ? String(data.taskId) : "";
        const nextStatus = data.status || "waiting";
        const label = data.label || "Đang chờ RunningHub...";
        if (taskId) {
          activeTaskIdRef.current = taskId;
          setActiveTaskId(taskId);
          runLog?.updateSession?.(runId, { taskId });
        }
        setTaskStatus({ status: nextStatus, label });
        setProgress({ type: nextStatus, label });
        if (nextStatus === "queued" || nextStatus === "running" || nextStatus === "waiting" || nextStatus === "upload" || nextStatus === "submit") {
          setStatus(label);
        }
        appendLog("info", label, { runId, taskId: taskId || undefined });
        break;
      }
      default:
        break;
    }
  }

  async function executeRun(job) {
    activeRunIdRef.current = job.runId;
    setActiveRunId(job.runId);
    setActiveJob(job);
    activeTaskIdRef.current = "";
    setActiveTaskId("");
    setTaskStatus(null);
    runLog?.updateSession?.(job.runId, { status: "running" });
    setRunning(true);
    setError("");
    setResult(null);
    setProgress({ type: "submit", label: "Đang gửi task lên RunningHub cloud..." });
    const clientSubmittedAt = new Date().toISOString();
    const queueAhead = runQueueRef.current.length;
    setStatus(queueAhead
      ? `Đang chạy trên RunningHub, còn ${queueAhead} trong hàng chờ...`
      : "Đang gửi task lên RunningHub...");
    appendLog("info", `Bắt đầu chạy ${describeJob(job)} trên RunningHub`, { runId: job.runId });
    if (queueAhead) appendLog("info", `Còn ${queueAhead} request chờ sau lệnh này`);

    let eventSource = null;
    try {
      eventSource = new EventSource(`/api/run-events?runId=${encodeURIComponent(job.runId)}`);
      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "run_end") {
            eventSource.close();
            return;
          }
          handleRhProgressEvent(message, job.runId);
        } catch {}
      };
    } catch {}

    try {
      const endpoint = job.templateId ? "/api/runninghub-wf/run" : "/api/runninghub/run";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Run failed");

      const taskId = String(data.taskId || "");
      if (taskId) {
        activeTaskIdRef.current = taskId;
        setActiveTaskId(taskId);
      }
      setTaskStatus({ status: "success", label: "Hoàn tất trên RunningHub" });
      setProgress({ type: "success", label: "Hoàn tất trên RunningHub" });
      const clientCompletedAt = new Date().toISOString();
      const clientDurationMs = new Date(clientCompletedAt).getTime() - new Date(clientSubmittedAt).getTime();
      const timedHistoryItem = data.historyItem ? {
        ...data.historyItem,
        submittedAt: data.historyItem.submittedAt || data.submittedAt || clientSubmittedAt,
        completedAt: data.historyItem.completedAt || data.completedAt || clientCompletedAt,
        durationMs: data.historyItem.durationMs ?? data.durationMs ?? clientDurationMs,
        rhCoins: data.historyItem.rhCoins ?? data.rhCoins ?? null
      } : null;
      const timedResult = {
        ...data,
        provider: "runninghub",
        submittedAt: data.submittedAt || timedHistoryItem?.submittedAt || clientSubmittedAt,
        completedAt: data.completedAt || timedHistoryItem?.completedAt || clientCompletedAt,
        durationMs: data.durationMs ?? timedHistoryItem?.durationMs ?? clientDurationMs,
        rhCoins: data.rhCoins ?? timedHistoryItem?.rhCoins ?? null,
        historyItem: timedHistoryItem
      };
      const rhCoins = timedResult.rhCoins;
      const durationLabel = timedResult.durationMs ? formatDuration(timedResult.durationMs) : "";
      const finishLabel = rhCoins != null && Number.isFinite(Number(rhCoins))
        ? `${durationLabel} - ${Number(rhCoins)} RHcoin`
        : durationLabel;
      setResult(timedResult);
      setStatus(`RunningHub hoàn tất task ${taskId}${finishLabel ? ` · ${finishLabel}` : ""}`);
      appendLog("success", `done task=${taskId}${durationLabel ? ` duration=${durationLabel}` : ""}${rhCoins != null ? ` rh_coins=${rhCoins}` : ""}`, {
        runId: job.runId,
        taskId,
        rhCoins
      });
      runLog?.endSession?.(job.runId, "success", { durationMs: timedResult.durationMs, taskId, rhCoins });
      onComplete?.(timedHistoryItem, timedResult);
    } catch (err) {
      setProgress(null);
      setTaskStatus({ status: "error", label: err.message || "RunningHub request thất bại" });
      setError(err.message);
      setStatus("RunningHub request thất bại");
      appendLog("error", err.message || "RunningHub request thất bại", {
        runId: job.runId,
        taskId: activeTaskIdRef.current || undefined
      });
      runLog?.endSession?.(job.runId, "error", {
        error: err.message,
        taskId: activeTaskIdRef.current || undefined
      });
    } finally {
      eventSource?.close();
      activeRunIdRef.current = "";
      setActiveRunId("");
      setActiveJob(null);
      activeTaskIdRef.current = "";
      setActiveTaskId("");
      setTaskStatus(null);
      const [nextJob, ...remaining] = runQueueRef.current;
      setQueue(remaining);
      if (nextJob) {
        setStatus(`Đang lấy request tiếp theo, còn ${remaining.length} trong hàng chờ...`);
        appendLog("info", `Chuyển sang request tiếp theo: ${describeJob(nextJob)}`, { runId: nextJob.runId });
        executeRun(nextJob);
      } else {
        setRunning(false);
        setProgress(null);
      }
    }
  }

  async function cancelWorkflow() {
    if (!activeRunIdRef.current) return;
    if (runQueueRef.current.length) {
      setQueue([]);
      appendLog("warn", "Đã xóa toàn bộ request đang chờ trong hàng chờ client");
    }
    setStatus("Đang hủy task RunningHub...");
    appendLog("warn", "Đang gửi lệnh hủy task RunningHub", {
      runId: activeRunIdRef.current,
      taskId: activeTaskIdRef.current || undefined
    });
    try {
      const response = await fetch("/api/runninghub/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: activeRunIdRef.current })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cancel failed");
      const cancelMessage = data.message || "Đã gửi yêu cầu hủy RunningHub";
      setStatus(cancelMessage);
      appendLog("warn", cancelMessage, {
        runId: activeRunIdRef.current,
        taskId: activeTaskIdRef.current || undefined
      });
      runLog?.endSession?.(activeRunIdRef.current, "cancelled", { taskId: activeTaskIdRef.current || undefined });
    } catch (err) {
      setError(err.message);
      setStatus("Không hủy được task RunningHub");
      appendLog("error", err.message || "Không hủy được task RunningHub", {
        runId: activeRunIdRef.current,
        taskId: activeTaskIdRef.current || undefined
      });
    }
  }

  function runWorkflow(job) {
    if (running) {
      setQueue([...runQueueRef.current, job]);
      const queueSize = runQueueRef.current.length;
      setStatus(`Đã thêm vào hàng chờ RunningHub (${queueSize} request)`);
      runLog?.startSession?.(job, { provider: "runninghub", status: "queued" });
      appendLog("queue", `Thêm vào hàng chờ RunningHub: ${describeJob(job)} (vị trí #${queueSize})`, { runId: job.runId });
      return;
    }
    runLog?.startSession?.(job, { provider: "runninghub", status: "running" });
    executeRun(job);
  }

  return {
    running, activeRunId, activeJob, activeTaskId, taskStatus, runQueue,
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

export function buildRunningHubWfJob({ runId, apiKey, templateId, values }) {
  return {
    runId: runId || crypto.randomUUID(),
    apiKey,
    templateId,
    values,
    queuedAt: new Date().toISOString()
  };
}
