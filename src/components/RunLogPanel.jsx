import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Copy, Download, GripHorizontal, ImageIcon, Loader2, ScrollText, Trash2, X } from "lucide-react";
import {
  copyToClipboard,
  describeJob,
  downloadTextFile,
  exportSessionAsText,
  exportSessionsAsJson,
  exportSessionsAsText,
  filterRunLogSessions,
  formatDurationMs,
  formatLevelCode,
  formatProviderCode,
  formatRhCoins,
  formatRunId,
  formatStatusCode,
  formatTechDateTime,
  formatTechTimestamp,
  sumRhCoins
} from "../lib/runLog";

const LOG_HEIGHT_KEY = "comfyui-build:run-log-height";
const DEFAULT_LOG_HEIGHT = 520;
const MIN_LOG_HEIGHT = 320;
const MAX_LOG_HEIGHT = 760;
const LOG_ROW_HEIGHT = 22;
const LOG_OVERSCAN = 8;

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

function confirmAction(message) {
  if (typeof window === "undefined") return false;
  return window.confirm(message);
}

function CopyButton({ value, label, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(event) {
    event.stopPropagation();
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className={`logCopyButton ${className}`.trim()}
      title={copied ? "Đã copy" : `Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={handleCopy}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          handleCopy(event);
        }
      }}
    >
      <Copy size={10} />
      {copied ? <span className="logCopyFeedback">ok</span> : null}
    </span>
  );
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

function VirtualLogStream({ logs = [], autoScroll = true }) {
  const scrollRef = useRef(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 200 });
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const sync = () => setViewport({ scrollTop: el.scrollTop, height: el.clientHeight });
    sync();
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < LOG_ROW_HEIGHT * 2;
      sync();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!autoScroll || !stickToBottomRef.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    setViewport(current => ({ ...current, scrollTop: scrollRef.current?.scrollTop || 0 }));
  }, [autoScroll, logs.length]);

  if (!logs.length) {
    return <div className="logStreamEmpty">// no events</div>;
  }

  const startIndex = Math.max(0, Math.floor(viewport.scrollTop / LOG_ROW_HEIGHT) - LOG_OVERSCAN);
  const visibleCount = Math.ceil(viewport.height / LOG_ROW_HEIGHT) + LOG_OVERSCAN * 2;
  const endIndex = Math.min(logs.length, startIndex + visibleCount);
  const visibleLogs = logs.slice(startIndex, endIndex);
  const totalHeight = logs.length * LOG_ROW_HEIGHT;
  const offsetY = startIndex * LOG_ROW_HEIGHT;

  return (
    <div className="logStreamVirtual" ref={scrollRef}>
      <div className="logStreamSpacer" style={{ height: `${totalHeight}px` }}>
        <div className="logStreamWindow" style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleLogs.map(entry => (
            <div key={entry.id} className={`logLine ${levelClass(entry.level)}`} style={{ minHeight: `${LOG_ROW_HEIGHT}px` }}>
              <span className="logCol logColTime">{formatTechTimestamp(entry.timestamp)}</span>
              <span className="logCol logColLevel">{formatLevelCode(entry.level)}</span>
              {entry.runId ? <span className="logCol logColRun">run={formatRunId(entry.runId)}</span> : null}
              {entry.taskId ? <span className="logCol logColTask">task={entry.taskId}</span> : null}
              {entry.rhCoins != null ? <span className="logCol logColCoin">coin={formatRhCoins(entry.rhCoins)}</span> : null}
              <span className="logCol logColMsg">{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionRow({
  session,
  expanded,
  focused,
  onToggle,
  onDelete,
  onInspectTask,
  onRestoreOutput,
  taskInspect,
  outputHistoryItem,
  rhApiKey = "",
  isActive = false
}) {
  const provider = formatProviderCode(session.provider);
  const status = formatStatusCode(session.status);
  const duration = formatDurationMs(session.durationMs);
  const coins = session.provider === "runninghub" ? formatRhCoins(session.rhCoins) : "—";
  const logCount = session.logs?.length || 0;
  const isRh = session.provider === "runninghub";
  const canInspectTask = isRh && Boolean(session.taskId);
  const statusTitle = session.error ? session.error : session.status || "";

  return (
    <article
      className={`logSession ${expanded ? "expanded" : ""} ${isActive ? "active" : ""} ${focused ? "focused" : ""}`}
      aria-expanded={expanded}
    >
      <div
        className="logSessionRow"
        onClick={onToggle}
        title={session.error || undefined}
      >
        <span className={`logExpand ${expanded ? "open" : ""}`} aria-hidden="true">
          <ChevronRight size={12} />
        </span>
        <span className="logCol logColTime">{formatTechTimestamp(session.startedAt, { withMs: false })}</span>
        <span className={`logCol logColStatus ${session.status || ""}`} title={statusTitle}>{status}</span>
        <span className="logCol logColProvider">{provider}</span>
        <span className="logCol logColTarget" title={sessionTarget(session)}>{sessionTarget(session)}</span>
        <span className="logCol logColDur">{duration}</span>
        <span className="logCol logColCoin">{coins}</span>
        <span className="logCol logColRun logCopyableCell" title={session.runId}>
          <span>run={formatRunId(session.runId)}</span>
          <CopyButton value={session.runId} label="run id" />
        </span>
        {canInspectTask ? (
          <span className="logCol logColTask logCopyableCell">
            <button
              type="button"
              className={`logTaskButton ${taskInspect?.open ? "active" : ""}`}
              title={rhApiKey?.trim() ? "Check task trên server (RunningHub)" : "Cần API key RunningHub để check task"}
              onClick={(event) => onInspectTask?.(session, event)}
            >
              task={session.taskId}
            </button>
            <CopyButton value={session.taskId} label="task id" />
          </span>
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
          <span className="logMetaCopyable">
            run_id={session.runId || "—"}
            {session.runId ? <CopyButton value={session.runId} label="run id" /> : null}
          </span>
          {canInspectTask ? (
            <button type="button" className="logMetaAction" onClick={(event) => onInspectTask?.(session, event)}>
              task_id={session.taskId} (check)
            </button>
          ) : session.taskId ? (
            <span className="logMetaCopyable">
              task_id={session.taskId}
              <CopyButton value={session.taskId} label="task id" />
            </span>
          ) : null}
          <span>provider={session.provider || "local"}</span>
          <span>status={session.status || "—"}</span>
          {session.durationMs != null ? <span>duration_ms={session.durationMs}</span> : null}
          {session.provider === "runninghub" && session.rhCoins != null ? <span>rh_coins={session.rhCoins}</span> : null}
          {session.error ? <span className="logMetaError">error={session.error}</span> : null}
          {outputHistoryItem ? (
            <button
              type="button"
              className="logMetaAction logMetaOutput"
              onClick={(event) => {
                event.stopPropagation();
                onRestoreOutput?.(outputHistoryItem);
              }}
            >
              <ImageIcon size={11} />
              output
            </button>
          ) : null}
        </div>
      ) : null}
      {expanded ? <TaskInspectBlock inspect={taskInspect} /> : null}
      {expanded ? (
        <div className="logSessionBody">
          <VirtualLogStream logs={session.logs} autoScroll={isActive || session.status === "running"} />
        </div>
      ) : null}
    </article>
  );
}

export function RunLogPanel({
  open,
  onToggle,
  sessions = [],
  outputHistory = [],
  onDeleteSession,
  onClearHistory,
  onRestoreOutput,
  onRhTaskInspected,
  runQueue = [],
  activeRunId = "",
  status = "",
  running = false,
  rhApiKey = ""
}) {
  const panelRef = useRef(null);
  const resizeRef = useRef({ dragging: false, startY: 0, startHeight: DEFAULT_LOG_HEIGHT });
  const [popupHeight, setPopupHeight] = useState(loadLogHeight);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [focusedSessionId, setFocusedSessionId] = useState("");
  const [taskInspectMap, setTaskInspectMap] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const historyByRunId = useMemo(() => {
    const map = new Map();
    for (const item of outputHistory) {
      if (item?.id) map.set(item.id, item);
      if (item?.runId && !map.has(item.runId)) map.set(item.runId, item);
    }
    return map;
  }, [outputHistory]);

  const filteredSessions = useMemo(
    () => filterRunLogSessions(sessions, { query: searchQuery, status: statusFilter, provider: providerFilter }),
    [sessions, searchQuery, statusFilter, providerFilter]
  );

  const totalRhCoins = useMemo(() => sumRhCoins(sessions), [sessions]);

  useEffect(() => {
    if (!running || !activeRunId) return;
    setExpandedIds(current => {
      if (current.has(activeRunId)) return current;
      return new Set([...current, activeRunId]);
    });
    setFocusedSessionId(activeRunId);
  }, [running, activeRunId]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!focusedSessionId) {
      if (filteredSessions[0]?.id) setFocusedSessionId(filteredSessions[0].id);
      return;
    }
    if (!filteredSessions.some(session => session.id === focusedSessionId)) {
      setFocusedSessionId(filteredSessions[0]?.id || "");
    }
  }, [filteredSessions, focusedSessionId]);

  useEffect(() => {
    if (!open || !focusedSessionId) return;
    panelRef.current?.querySelector(".logSession.focused")?.scrollIntoView({ block: "nearest" });
  }, [focusedSessionId, open, filteredSessions.length]);

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
    setFocusedSessionId(sessionId);
    setExpandedIds(current => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function handleDeleteSession(sessionId) {
    if (!sessionId) return;
    if (!confirmAction("Xóa session log này?")) return;
    onDeleteSession?.(sessionId);
  }

  function handleClearHistory() {
    if (!sessions.length) return;
    if (!confirmAction("Xóa toàn bộ run log history?")) return;
    onClearHistory?.();
    setExpandedIds(new Set());
    setFocusedSessionId("");
    setTaskInspectMap({});
  }

  function handleExportSession(session) {
    if (!session) return;
    downloadTextFile(`run-log-${formatRunId(session.runId, false)}.log`, exportSessionAsText(session));
  }

  function handleExportAllText() {
    const content = exportSessionsAsText(filteredSessions.length ? filteredSessions : sessions);
    downloadTextFile("run-log-export.log", content);
  }

  function handleExportAllJson() {
    const content = exportSessionsAsJson(filteredSessions.length ? filteredSessions : sessions);
    downloadTextFile("run-log-export.json", content, "application/json;charset=utf-8");
  }

  function moveFocus(step) {
    if (!filteredSessions.length) return;
    const currentIndex = filteredSessions.findIndex(session => session.id === focusedSessionId);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.min(filteredSessions.length - 1, Math.max(0, baseIndex + step));
    setFocusedSessionId(filteredSessions[nextIndex].id);
  }

  function handlePanelKeyDown(event) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onToggle?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
      return;
    }
    if (event.key === "Enter" && focusedSessionId) {
      event.preventDefault();
      toggleSession(focusedSessionId);
    }
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
  const focusedSession = filteredSessions.find(session => session.id === focusedSessionId) || null;

  return (
    <div
      className="outputLogDock"
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {open ? (
        <section
          ref={panelRef}
          className="outputLogPopup logTerminal"
          style={{ height: `${popupHeight}px` }}
          tabIndex={-1}
          onKeyDown={handlePanelKeyDown}
          aria-label="Run log panel"
        >
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
              <span className="logHeaderMeta">{filteredSessions.length}/{sessions.length} sessions</span>
              {totalRhCoins > 0 ? <span className="logHeaderMeta">rh_total={totalRhCoins}</span> : null}
            </div>
            <div className="logHeaderActions">
              {focusedSession ? (
                <button type="button" className="logAction" onClick={() => handleExportSession(focusedSession)} title="Export session đang focus">
                  <Download size={12} />
                </button>
              ) : null}
              {sessions.length ? (
                <>
                  <button type="button" className="logAction" onClick={handleExportAllText} title="Export .log">.log</button>
                  <button type="button" className="logAction" onClick={handleExportAllJson} title="Export JSON">json</button>
                  <button type="button" className="logAction" onClick={handleClearHistory}>clear</button>
                </>
              ) : null}
              <button type="button" className="logAction logActionIcon" onClick={onToggle} title="close (`)">
                <X size={13} />
              </button>
            </div>
          </header>

          <div className="logToolbar">
            <input
              type="search"
              className="logSearchInput"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="search run/task/message..."
              aria-label="Tìm trong run log"
            />
            <select className="logFilterSelect" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Lọc status">
              <option value="all">all st</option>
              <option value="running">RUN</option>
              <option value="queued">QUE</option>
              <option value="success"> OK</option>
              <option value="error">ERR</option>
              <option value="cancelled">CNL</option>
            </select>
            <select className="logFilterSelect" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} aria-label="Lọc provider">
              <option value="all">all pv</option>
              <option value="local">CU</option>
              <option value="runninghub">RH</option>
            </select>
          </div>

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
              {filteredSessions.length ? filteredSessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  expanded={expandedIds.has(session.id)}
                  focused={session.id === focusedSessionId}
                  isActive={session.runId === activeRunId}
                  onToggle={() => toggleSession(session.id)}
                  onDelete={handleDeleteSession}
                  onInspectTask={handleInspectTask}
                  onRestoreOutput={onRestoreOutput}
                  taskInspect={taskInspectMap[session.id]}
                  outputHistoryItem={historyByRunId.get(session.runId) || historyByRunId.get(session.id) || null}
                  rhApiKey={rhApiKey}
                />
              )) : (
                <div className="logStreamEmpty">// no matching sessions</div>
              )}
            </div>
          </div>

          <div className="logKeyboardHint">↑↓ focus · Enter expand · Esc close · ` toggle</div>
        </section>
      ) : null}

      <button
        type="button"
        className={`outputLogButton ${hasActivity ? "hasActivity" : ""} ${open ? "active" : ""}`}
        onClick={onToggle}
        title="run.log (`)"
        aria-expanded={open}
        aria-keyshortcuts="Backquote"
      >
        <ScrollText size={15} />
        {(running || queueCount > 0) ? (
          <span className="outputLogBadge">{queueCount + (running ? 1 : 0)}</span>
        ) : null}
      </button>
    </div>
  );
}
