import { useRef, useState } from "react";
import { describeJob } from "../lib/runLog";
import { localizeRuntimeMessage, useI18n } from "../i18n/I18nContext";

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

async function submitLocalBackendQueueJob(job, { waitForRunId = "" } = {}) {
  const response = await fetch("/api/run-queue/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jobs: [{
        endpoint: "/api/run",
        body: {
          runId: job.runId,
          template: job.template,
          address: job.address,
          values: job.values,
          queuedAt: job.queuedAt
        },
        meta: { provider: "local", runKind: "form", waitForRunId }
      }]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.accepted) throw new Error(data.error || "Queue submit failed");
}

async function clearFormBackendQueue() {
  const response = await fetch("/api/run-queue/clear", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runKind: "form" })
  });
  if (!response.ok) throw new Error("Queue clear failed");
}

export function useExecution({ onComplete, runLog } = {}) {
  const { locale, t } = useI18n();
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [runQueue, setRunQueue] = useState([]);
  const [status, setStatus] = useState(() => t("exec.loadingYaml"));
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
        setProgress({ value: 0, max: 0, node: null, type: "start", label: t("exec.starting") });
        setStatus(t("exec.startingWorkflow"));
        appendLog("info", t("exec.comfyStarted"));
        break;
      case "execution_cached": {
        const count = (data.nodes || []).length;
        setProgress(prev => ({ ...(prev || {}), type: "cached", label: t("exec.cachedNodes", { count }) }));
        appendLog("info", t("exec.cachedNodesLog", { count }));
        break;
      }
      case "executing":
        if (data.node != null) {
          setProgress(prev => ({ ...(prev || {}), type: "executing", node: data.node, label: t("exec.processingNode", { node: data.node }) }));
          setStatus(t("exec.processingNode", { node: data.node }));
          appendLog("info", t("exec.processingNodeLog", { node: data.node }));
        }
        break;
      case "progress": {
        setProgress({ value: data.value, max: data.max, node: data.node, type: "progress", label: `${data.value} / ${data.max}` });
        const nodeKey = String(data.node ?? "?");
        const now = Date.now();
        const lastLoggedAt = progressLogRef.current.get(nodeKey) || 0;
        if (now - lastLoggedAt >= 1000) {
          progressLogRef.current.set(nodeKey, now);
          appendLog("info", t("exec.nodeProgress", { node: nodeKey, value: data.value, max: data.max }));
        }
        break;
      }
      case "status":
        if (data.exec_info?.queue_remaining > 0) {
          const queueRemaining = data.exec_info.queue_remaining;
          setStatus(t("exec.queueWaiting", { count: queueRemaining }));
          appendLog("info", t("exec.queueWaitingLog", { count: queueRemaining }));
        }
        break;
      case "output_download_retry": {
        const label = data.label || t("exec.downloadRetry");
        setProgress({ type: "download", label });
        setStatus(label);
        appendLog("warn", label, { runId: activeRunIdRef.current, attempt: data.attempt });
        break;
      }
      default:
        break;
    }
  }

  function endQueuedSessions(status = "cancelled") {
    for (const queuedJob of runQueueRef.current) {
      runLog?.endSession?.(queuedJob.runId, status);
    }
  }

  function clearQueue() {
    if (runQueueRef.current.length) {
      endQueuedSessions("cancelled");
      setQueue([]);
    }
    void clearFormBackendQueue()
      .finally(() => runLog?.refreshSessions?.());
    setStatus(t("exec.queueCleared"));
    appendLog("warn", t("exec.queueCleared"));
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
      ? t("exec.runningWithQueue", { count: queueAhead })
      : t("exec.sendingWorkflow"));
    appendLog("info", t("exec.startingJob", { job: describeJob(job) }), { runId: job.runId });
    if (queueAhead) appendLog("info", t("exec.queueRemaining", { count: queueAhead }));

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
      if (!response.ok) throw new Error(localizeRuntimeMessage(data.error, locale) || "Run failed");
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
      const durationPart = timedResult.durationMs
        ? t("exec.promptCompleteDuration", { duration: formatDuration(timedResult.durationMs) })
        : "";
      const completedMessage = t("exec.promptComplete", { promptId: data.promptId, duration: durationPart });
      setStatus(completedMessage);
      appendLog("success", completedMessage, { runId: job.runId });
      runLog?.endSession?.(job.runId, "success", { durationMs: timedResult.durationMs });
      onComplete?.(timedHistoryItem, timedResult);
    } catch (err) {
      setProgress(null);
      const message = localizeRuntimeMessage(err.message, locale);
      setError(message);
      setStatus(t("exec.requestFailed"));
      appendLog("error", message || t("exec.requestFailed"), { runId: job.runId });
      runLog?.endSession?.(job.runId, "error", { error: message });
    } finally {
      eventSource?.close();
      activeRunIdRef.current = "";
      setActiveRunId("");
      setActiveJob(null);
      const [nextJob, ...remaining] = runQueueRef.current;
      setQueue(remaining);
      if (nextJob) {
        activeRunIdRef.current = nextJob.runId;
        setActiveRunId(nextJob.runId);
        setStatus(t("exec.nextRequest", { count: remaining.length }));
        appendLog("info", t("exec.movingToNext", { job: describeJob(nextJob) }), { runId: nextJob.runId });
        executeRun(nextJob);
      } else {
        setRunning(false);
      }
    }
  }

  async function cancelWorkflow() {
    if (!activeRunIdRef.current) return;
    setStatus(t("exec.stopping"));
    appendLog("warn", t("exec.sendingStop"), { runId: activeRunIdRef.current });
    try {
      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: activeRunIdRef.current })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cancel failed");
      const cancelMessage = data.warning
        ? t("exec.stopWithWarning", { warning: data.warning })
        : t("exec.stopSent");
      setStatus(cancelMessage);
      appendLog("warn", cancelMessage, { runId: activeRunIdRef.current });
      runLog?.endSession?.(activeRunIdRef.current, "cancelled");
    } catch (err) {
      const message = localizeRuntimeMessage(err.message, locale);
      setError(message);
      setStatus(t("exec.stopFailed"));
      appendLog("error", message || t("exec.stopFailed"), { runId: activeRunIdRef.current });
    }
  }

  async function stopAllWorkflow() {
    clearQueue();
    await cancelWorkflow();
  }

  function runWorkflow(job) {
    if (activeRunIdRef.current || runQueueRef.current.length > 0) {
      const queueSize = runQueueRef.current.length + 1;
      setStatus(t("exec.addedToQueue", { count: queueSize }));
      void submitLocalBackendQueueJob(job, { waitForRunId: activeRunIdRef.current })
        .then(() => {
          runLog?.refreshSessions?.();
        })
        .catch(() => {
          setQueue([...runQueueRef.current, job]);
          runLog?.startSession?.(job, { provider: "local", status: "queued", runKind: "form" });
          appendLog("queue", t("exec.queueAdded", { job: describeJob(job), position: runQueueRef.current.length }), { runId: job.runId });
        });
      return;
    }
    activeRunIdRef.current = job.runId;
    setActiveRunId(job.runId);
    runLog?.startSession?.(job, { provider: "local", status: "running", runKind: "form" });
    executeRun(job);
  }

  return {
    running, activeRunId, activeJob, activeTaskId: "", taskStatus: null, runQueue,
    status, setStatus, error, setError,
    result, setResult, progress,
    runWorkflow, cancelWorkflow, clearQueue, stopAllWorkflow
  };
}
