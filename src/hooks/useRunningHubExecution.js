import { useRef, useState } from "react";
import { describeJob } from "../lib/runLog";
import { nodeFieldKey } from "./useRunningHub";
import { localizeRuntimeMessage, useI18n } from "../i18n/I18nContext";

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function useRunningHubExecution({ onComplete, runLog } = {}) {
  const { locale, t } = useI18n();
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

  function rhStatusLabel(nextStatus, dataLabel) {
    if (locale === "vi") return dataLabel || t("execRh.waitingRh");
    return t(`execRh.status.${nextStatus}`) || t("execRh.waitingRh");
  }

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
        const submittedLabel = t("execRh.taskCreated");
        setTaskStatus({ status: "submitted", label: submittedLabel });
        setProgress({ type: "queued", label: submittedLabel });
        setStatus(t("execRh.taskCreatedStatus", { taskId }));
        appendLog("info", `RunningHub task ID: ${taskId}`, { runId, taskId });
        break;
      }
      case "rh_task_status": {
        const taskId = data.taskId ? String(data.taskId) : "";
        const nextStatus = data.status || "waiting";
        const label = rhStatusLabel(nextStatus, data.label);
        if (taskId) {
          activeTaskIdRef.current = taskId;
          setActiveTaskId(taskId);
          runLog?.updateSession?.(runId, { taskId });
        }
        setTaskStatus({ status: nextStatus, label });
        setProgress({ type: nextStatus, label });
        if (nextStatus === "queued" || nextStatus === "running" || nextStatus === "waiting" || nextStatus === "token_wait" || nextStatus === "upload" || nextStatus === "submit") {
          setStatus(label);
        }
        appendLog("info", label, { runId, taskId: taskId || undefined });
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
    setProgress({ type: "submit", label: t("execRh.submittingCloud") });
    const clientSubmittedAt = new Date().toISOString();
    const queueAhead = runQueueRef.current.length;
    setStatus(queueAhead
      ? t("execRh.runningWithQueue", { count: queueAhead })
      : t("execRh.submitting"));
    appendLog("info", t("execRh.startingJob", { job: describeJob(job) }), { runId: job.runId });
    if (queueAhead) appendLog("info", t("exec.queueRemaining", { count: queueAhead }));

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
      if (!response.ok) throw new Error(localizeRuntimeMessage(data.error, locale) || "Run failed");

      const taskId = String(data.taskId || "");
      if (taskId) {
        activeTaskIdRef.current = taskId;
        setActiveTaskId(taskId);
      }
      const successLabel = t("execRh.complete");
      setTaskStatus({ status: "success", label: successLabel });
      setProgress({ type: "success", label: successLabel });
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
      const suffix = finishLabel ? ` · ${finishLabel}` : "";
      setStatus(t("execRh.taskComplete", { taskId, suffix }));
      appendLog("success", `done task=${taskId}${durationLabel ? ` duration=${durationLabel}` : ""}${rhCoins != null ? ` rh_coins=${rhCoins}` : ""}`, {
        runId: job.runId,
        taskId,
        rhCoins
      });
      runLog?.endSession?.(job.runId, "success", { durationMs: timedResult.durationMs, taskId, rhCoins });
      onComplete?.(timedHistoryItem, timedResult);
    } catch (err) {
      setProgress(null);
      const message = localizeRuntimeMessage(err.message, locale);
      const failedLabel = t("execRh.requestFailed");
      setTaskStatus({ status: "error", label: message || failedLabel });
      setError(message);
      setStatus(failedLabel);
      appendLog("error", message || failedLabel, {
        runId: job.runId,
        taskId: activeTaskIdRef.current || undefined
      });
      runLog?.endSession?.(job.runId, "error", {
        error: message,
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
        setStatus(t("exec.nextRequest", { count: remaining.length }));
        appendLog("info", t("exec.movingToNext", { job: describeJob(nextJob) }), { runId: nextJob.runId });
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
      endQueuedSessions("cancelled");
      setQueue([]);
      appendLog("warn", t("exec.queueCleared"));
    }
    setStatus(t("execRh.cancelling"));
    appendLog("warn", t("execRh.sendingCancel"), {
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
      const cancelMessage = localizeRuntimeMessage(data.message, locale) || t("execRh.cancelSent");
      setStatus(cancelMessage);
      appendLog("warn", cancelMessage, {
        runId: activeRunIdRef.current,
        taskId: activeTaskIdRef.current || undefined
      });
      runLog?.endSession?.(activeRunIdRef.current, "cancelled", { taskId: activeTaskIdRef.current || undefined });
    } catch (err) {
      const message = localizeRuntimeMessage(err.message, locale);
      setError(message);
      setStatus(t("execRh.cancelFailed"));
      appendLog("error", message || t("execRh.cancelFailed"), {
        runId: activeRunIdRef.current,
        taskId: activeTaskIdRef.current || undefined
      });
    }
  }

  function runWorkflow(job) {
    if (activeRunIdRef.current) {
      setQueue([...runQueueRef.current, job]);
      const queueSize = runQueueRef.current.length;
      setStatus(t("execRh.addedToQueue", { count: queueSize }));
      runLog?.startSession?.(job, { provider: "runninghub", status: "queued" });
      appendLog("queue", t("execRh.queueAdded", { job: describeJob(job), position: queueSize }), { runId: job.runId });
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

export function buildRunningHubJob({
  runId,
  apiKey,
  apiKeys,
  tokenPolicy,
  rotateIndex,
  webappId,
  nodes,
  values,
  queuedAt
}) {
  const nodePayload = nodes.map(node => ({
    nodeId: node.nodeId,
    fieldName: node.fieldName,
    fieldType: node.fieldType,
    fieldValue: values[nodeFieldKey(node)] ?? node.fieldValue ?? ""
  }));
  const keys = Array.isArray(apiKeys) && apiKeys.length
    ? apiKeys
    : [apiKey].filter(Boolean);
  return {
    runId: runId || crypto.randomUUID(),
    apiKey: keys[0] || apiKey,
    apiKeys: keys,
    tokenPolicy,
    rotateIndex,
    webappId,
    nodes: nodePayload,
    queuedAt: queuedAt || new Date().toISOString()
  };
}

export function buildRunningHubWfJob({
  runId,
  apiKey,
  apiKeys,
  tokenPolicy,
  rotateIndex,
  templateId,
  values,
  queuedAt
}) {
  const keys = Array.isArray(apiKeys) && apiKeys.length
    ? apiKeys
    : [apiKey].filter(Boolean);
  return {
    runId: runId || crypto.randomUUID(),
    apiKey: keys[0] || apiKey,
    apiKeys: keys,
    tokenPolicy,
    rotateIndex,
    templateId,
    values,
    queuedAt: queuedAt || new Date().toISOString()
  };
}
