import { useEffect, useRef, useState } from "react";
import { ChevronRight, GripHorizontal, Loader2, ScrollText, Trash2, X } from "lucide-react";
import {
  describeJob,
  formatDurationMs,
  formatLevelCode,
  formatProviderCode,
  formatRhCoins,
  formatRunId,
  formatStatusCode,
  formatTechDateTime,
  formatTechTimestamp
} from "../lib/runLog";

const LOG_HEIGHT_KEY = "comfyui-build:run-log-height";
const DEFAULT_LOG_HEIGHT = 520;
const MIN_LOG_HEIGHT = 320;
const MAX_LOG_HEIGHT = 760;

function loadLogHeight() {
  try {
    const stored = Number(localStorage.getItem(LOG_HEIGHT_KEY));
    if (Number.isFinite(stored) && stored >= MIN_LOG_HEIGHT && stored <= MAX_LOG_HEIGHT) return stored;
  } catch {}
  return DEFAULT_LOG_HEIGHT;
}

function levelClass(level) {
  if (level === "error") return "lvl-err";
  if (level === "success") return "lvl-ok";
  if (level === "queue") return "lvl-que";
  if (level === "warn") return "lvl-wrn";
  return "lvl-inf";
}

function sessionTarget(session) {
  if (session.templateId) return `tpl=${session.templateId}`;
  if (session.template) return `tpl=${session.template}`;
  if (session.webappId) return `app=${session.webappId}`;
  return session.jobLabel || "—";
}

function TaskInspectBlock({ inspect }) {
  if (!inspect?.open) return null;

  if (inspect.loading) {
    return (
      <div className="logTaskInspect">
        <div className="logTaskInspectHead">
          <Loader2 size={11} className="spin" />
          <span>query runninghub task...</span>
        </div>
      </div>
    );
  }

  if (inspect.error) {
    return (
      <div className="logTaskInspect logTaskInspectError">
        <div className="logTaskInspectHead">$ rh task-check</div>
        <div className="logTaskInspectLine lvl-err">error={inspect.error}</div>
      </div>
    );
  }

  const detail = inspect.data;
  if (!detail) return null;

  return (
    <div className="logTaskInspect">
      <div className="logTaskInspectHead">$ rh task-check task={detail.taskId}</div>
      <div className="logTaskInspectLine">status={detail.statusLabel} code={detail.code}</div>
      {detail.msg ? <div className="logTaskInspectLine">msg={detail.msg}</div> : null}
      {detail.rhCoins != null ? <div className="logTaskInspectLine">rh_coins={detail.rhCoins}</div> : null}
      {detail.netWssUrl ? <div className="logTaskInspectLine">wss={detail.netWssUrl}</div> : null}
      {detail.outputs?.length ? detail.outputs.map(output => (
        <div key={`${output.index}-${output.nodeId}-${output.fileUrl}`} className="logTaskInspectLine">
          output[{output.index}] node={output.nodeId || "—"} type={output.fileType || "—"}
          {output.taskCostTime != null ? ` cost=${output.taskCostTime}s` : ""}
          {output.consumeCoins != null ? ` coin=${output.consumeCoins}` : ""}
          {output.fileUrl ? (
            <a className="logTaskInspectLink" href={output.fileUrl} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>
              {output.fileUrl}
            </a>
          ) : null}
        </div>
      )) : (
        <div className="logTaskInspectLine">outputs=0</div>
      )}
      {detail.failedReason ? (
        <>
          <div className="logTaskInspectLine lvl-err">failed node={detail.failedReason.node_name || detail.failedReason.node_id || "—"}</div>
          {detail.failedReason.exception_message ? (
            <div className="logTaskInspectLine lvl-err">{detail.failedReason.exception_message}</div>
          ) : null}
        </>
      ) : null}
      {detail.queriedAt ? <div className="logTaskInspectLine muted">queried_at={formatTechDateTime(detail.queriedAt)}</div> : null}
    </div>
  );
}

function LogStream({ logs = [] }) {
  if (!logs.length) {
    return <div className="logStreamEmpty">// no events</div>;
  }
  return (
    <div className="logStream">
      {logs.map(entry => (
        <div key={entry.id} className={`logLine ${levelClass(entry.level)}`}>
          <span className="logCol logColTime">{formatTechTimestamp(entry.timestamp)}</span>
          <span className="logCol logColLevel">{formatLevelCode(entry.level)}</span>
          {entry.runId ? <span className="logCol logColRun">run={formatRunId(entry.runId)}</span> : null}
          {entry.taskId ? <span className="logCol logColTask">task={entry.taskId}</span> : null}
          {entry.rhCoins != null ? <span className="logCol logColCoin">coin={formatRhCoins(entry.rhCoins)}</span> : null}
          <span className="logCol logColMsg">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}

function SessionRow({
  session,
  expanded,
  onToggle,
  onDelete,
  onInspectTask,
  taskInspect,
  rhApiKey = "",
  isActive = false
}) {
  const detailRef = useRef(null);

  useEffect(() => {
    if (!expanded || !detailRef.current) return;
    detailRef.current.scrollTop = detailRef.current.scrollHeight;
  }, [expanded, session.logs?.length]);

  const provider = formatProviderCode(session.provider);
  const status = formatStatusCode(session.status);
  const duration = formatDurationMs(session.durationMs);
  const coins = session.provider === "runninghub" ? formatRhCoins(session.rhCoins) : "—";
  const logCount = session.logs?.length || 0;
  const isRh = session.provider === "runninghub";
  const canInspectTask = isRh && Boolean(session.taskId);

  return (
    <article className={`logSession ${expanded ? "expanded" : ""} ${isActive ? "active" : ""}`} aria-expanded={expanded}>
      <div
        className="logSessionRow"
        onClick={onToggle}
      >
        <span className={`logExpand ${expanded ? "open" : ""}`} aria-hidden="true">
          <ChevronRight size={12} />
        </span>
        <span className="logCol logColTime">{formatTechTimestamp(session.startedAt, { withMs: false })}</span>
        <span className={`logCol logColStatus ${session.status || ""}`}>{status}</span>
        <span className="logCol logColProvider">{provider}</span>
        <span className="logCol logColTarget" title={sessionTarget(session)}>{sessionTarget(session)}</span>
        <span className="logCol logColDur">{duration}</span>
        <span className="logCol logColCoin">{coins}</span>
        <span className="logCol logColRun" title={session.runId}>run={formatRunId(session.runId)}</span>
        {canInspectTask ? (
          <button
            type="button"
            className={`logCol logColTask logTaskButton ${taskInspect?.open ? "active" : ""}`}
            title={rhApiKey?.trim() ? "Check task trên server (RunningHub)" : "Cần API key RunningHub để check task"}
            onClick={(event) => onInspectTask?.(session, event)}
          >
            task={session.taskId}
          </button>
        ) : (
          <span className="logCol logColTask">{session.taskId ? `task=${session.taskId}` : "—"}</span>
        )}
        <span className="logCol logColCount">n={logCount}</span>
        <button
          type="button"
          className="logDelete"
          title="delete session"
          aria-label="Xóa session log"
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.(session.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      {expanded ? (
        <div className="logSessionMeta">
          <span>started={formatTechDateTime(session.startedAt)}</span>
          {session.completedAt ? <span>completed={formatTechDateTime(session.completedAt)}</span> : null}
          <span>run_id={session.runId || "—"}</span>
          {canInspectTask ? (
            <button type="button" className="logMetaAction" onClick={(event) => onInspectTask?.(session, event)}>
              task_id={session.taskId} (check)
            </button>
          ) : session.taskId ? (
            <span>task_id={session.taskId}</span>
          ) : null}
          <span>provider={session.provider || "local"}</span>
          <span>status={session.status || "—"}</span>
          {session.durationMs != null ? <span>duration_ms={session.durationMs}</span> : null}
          {session.provider === "runninghub" && session.rhCoins != null ? <span>rh_coins={session.rhCoins}</span> : null}
        </div>
      ) : null}
      {expanded ? <TaskInspectBlock inspect={taskInspect} /> : null}
      {expanded ? (
        <div className="logSessionBody" ref={detailRef}>
          <LogStream logs={session.logs} />
        </div>
      ) : null}
    </article>
  );
}

export function RunLogPanel({
  open,
  onToggle,
  sessions = [],
  onDeleteSession,
  onClearHistory,
  onRhTaskInspected,
  runQueue = [],
  activeRunId = "",
  status = "",
  running = false,
  rhApiKey = ""
}) {
  const resizeRef = useRef({ dragging: false, startY: 0, startHeight: DEFAULT_LOG_HEIGHT });
  const [popupHeight, setPopupHeight] = useState(loadLogHeight);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [taskInspectMap, setTaskInspectMap] = useState({});

  useEffect(() => {
    if (!running || !activeRunId) return;
    setExpandedIds(current => {
      if (current.has(activeRunId)) return current;
      return new Set([...current, activeRunId]);
    });
  }, [running, activeRunId]);

  useEffect(() => {
    setTaskInspectMap(current => {
      let changed = false;
      const next = { ...current };
      for (const [sessionId, inspect] of Object.entries(current)) {
        if (inspect?.open && !expandedIds.has(sessionId)) {
          next[sessionId] = { ...inspect, open: false };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [expandedIds]);

  useEffect(() => {
    try {
      localStorage.setItem(LOG_HEIGHT_KEY, String(popupHeight));
    } catch {}
  }, [popupHeight]);

  function handleResizePointerDown(event) {
    resizeRef.current = { dragging: true, startY: event.clientY, startHeight: popupHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerMove(event) {
    if (!resizeRef.current.dragging) return;
    const delta = resizeRef.current.startY - event.clientY;
    setPopupHeight(Math.min(MAX_LOG_HEIGHT, Math.max(MIN_LOG_HEIGHT, resizeRef.current.startHeight + delta)));
  }

  function handleResizePointerUp(event) {
    resizeRef.current.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function toggleSession(sessionId) {
    setExpandedIds(current => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  async function handleInspectTask(session, event) {
    event?.stopPropagation?.();
    if (!session?.taskId) return;

    const sessionId = session.id;
    if (!rhApiKey?.trim()) {
      setTaskInspectMap(current => ({
        ...current,
        [sessionId]: { open: true, loading: false, data: null, error: "Thiếu RunningHub API key" }
      }));
      setExpandedIds(current => new Set([...current, sessionId]));
      return;
    }

    setTaskInspectMap(current => ({
      ...current,
      [sessionId]: { open: true, loading: true, data: current[sessionId]?.data || null, error: "" }
    }));
    setExpandedIds(current => new Set([...current, sessionId]));

    try {
      const response = await fetch("/api/runninghub/task-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: rhApiKey.trim(), taskId: session.taskId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Check task thất bại");

      setTaskInspectMap(current => ({
        ...current,
        [sessionId]: { open: true, loading: false, data: payload.detail, error: "" }
      }));
      onRhTaskInspected?.(session, payload.detail);
    } catch (error) {
      setTaskInspectMap(current => ({
        ...current,
        [sessionId]: {
          open: true,
          loading: false,
          data: current[sessionId]?.data || null,
          error: error.message || "Check task thất bại"
        }
      }));
    }
  }

  const queueCount = runQueue.length;
  const hasActivity = running || queueCount > 0 || sessions.length > 0;
  const liveTag = running ? "RUN" : queueCount ? "QUE" : "IDL";

  return (
    <div className="outputLogDock" onWheel={(event) => event.stopPropagation()}>
      {open ? (
        <section className="outputLogPopup logTerminal" style={{ height: `${popupHeight}px` }}>
          <div
            className="outputLogResizeHandle"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
          >
            <GripHorizontal size={12} />
          </div>

          <header className="logHeader">
            <div className="logHeaderTitle">
              <span className="logPrompt">$</span>
              <span>run.log</span>
              <span className="logHeaderMeta">{sessions.length} sessions</span>
            </div>
            <div className="logHeaderActions">
              {sessions.length ? (
                <button type="button" className="logAction" onClick={onClearHistory}>clear</button>
              ) : null}
              <button type="button" className="logAction logActionIcon" onClick={onToggle} title="close (F1)">
                <X size={13} />
              </button>
            </div>
          </header>

          <div className="logLive">
            <span className={`logLiveTag ${liveTag.toLowerCase()}`}>{liveTag}</span>
            {running ? <Loader2 size={11} className="spin logLiveSpin" /> : null}
            <span className="logLiveText">{running ? (status || "processing...") : queueCount ? `queue_depth=${queueCount}` : "idle"}</span>
            {running && activeRunId ? <span className="logLiveMeta">run={formatRunId(activeRunId)}</span> : null}
          </div>

          {queueCount ? (
            <div className="logQueue">
              {runQueue.map((job, index) => (
                <div key={job.runId || `${index}`} className="logQueueLine">
                  <span className="logCol logColQueue">Q{index + 1}</span>
                  <span className="logCol logColRun">run={formatRunId(job.runId)}</span>
                  <span className="logCol logColTarget">job={describeJob(job)}</span>
                  {job.queuedAt ? <span className="logCol logColTime">at={formatTechTimestamp(job.queuedAt)}</span> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="logTableScroll">
            <div className="logTableHead">
              <span className="logHeadExpand" />
              <span>time</span>
              <span>st</span>
              <span>pv</span>
              <span>target</span>
              <span>dur</span>
              <span>coin</span>
              <span>run</span>
              <span>task</span>
              <span>n</span>
              <span className="logHeadAction" />
            </div>

            <div className="logTableBody">
              {sessions.length ? sessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  expanded={expandedIds.has(session.id)}
                  isActive={session.runId === activeRunId}
                  onToggle={() => toggleSession(session.id)}
                  onDelete={onDeleteSession}
                  onInspectTask={handleInspectTask}
                  taskInspect={taskInspectMap[session.id]}
                  rhApiKey={rhApiKey}
                />
              )) : (
                <div className="logStreamEmpty">// empty log buffer</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className={`outputLogButton ${hasActivity ? "hasActivity" : ""} ${open ? "active" : ""}`}
        onClick={onToggle}
        title="run.log (F1)"
        aria-expanded={open}
        aria-keyshortcuts="F1"
      >
        <ScrollText size={15} />
        {(running || queueCount > 0) ? (
          <span className="outputLogBadge">{queueCount + (running ? 1 : 0)}</span>
        ) : null}
      </button>
    </div>
  );
}
