import { useEffect, useState } from "react";
import { Loader2, RefreshCcw, ScrollText, Trash2 } from "lucide-react";

function formatTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function sessionLabel(session) {
  const job = session?.job || {};
  if (job.webappId) return `RH App ${job.webappId}`;
  if (job.templateId) return `RH Wf ${job.templateId}`;
  if (job.template) return job.template;
  return session?.runId?.slice(0, 8) || "Run";
}

export function CanvasHistoryPanel({
  outputHistory,
  onRefreshOutputHistory,
  runLogSessions,
  onRefreshRunLogs,
  onOpenRunLog
}) {
  const [tab, setTab] = useState("outputs");
  const [loadingOutputs, setLoadingOutputs] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingOutputs(true);
    Promise.resolve(onRefreshOutputHistory?.())
      .finally(() => {
        if (!cancelled) setLoadingOutputs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onRefreshOutputHistory]);

  useEffect(() => {
    let cancelled = false;
    setLoadingLogs(true);
    Promise.resolve(onRefreshRunLogs?.())
      .finally(() => {
        if (!cancelled) setLoadingLogs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onRefreshRunLogs]);

  return (
    <div className="canvasHistoryPanel">
      <div className="canvasHistoryTabs">
        <button type="button" className={tab === "outputs" ? "active" : ""} onClick={() => setTab("outputs")}>
          Kết quả ({outputHistory.length})
        </button>
        <button type="button" className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>
          Run log ({runLogSessions.length})
        </button>
      </div>

      <button type="button" className="canvasFlyoutAction" onClick={onOpenRunLog}>
        <ScrollText size={14} /> Mở run.log
      </button>

      {tab === "outputs" ? (
        <div className="canvasHistorySection">
          <div className="canvasHistorySectionHeader">
            <span>Ảnh đã tạo</span>
            <button type="button" className="canvasNodeBtn" onClick={onRefreshOutputHistory} title="Tải lại">
              {loadingOutputs ? <Loader2 size={13} className="spin" /> : <RefreshCcw size={13} />}
            </button>
          </div>
          {!outputHistory.length ? (
            <p className="canvasFlyoutEmpty">Chưa có kết quả nào.</p>
          ) : (
            <ul className="canvasHistoryOutputs">
              {outputHistory.slice(0, 40).map(item => {
                const thumb = item.outputs?.[0]?.url;
                return (
                  <li key={item.id} className="canvasHistoryOutputItem">
                    {thumb ? <img src={thumb} alt="" draggable="false" /> : <div className="canvasHistoryOutputPlaceholder" />}
                    <div className="canvasHistoryOutputMeta">
                      <strong>{item.webappId || item.template || item.provider || "Output"}</strong>
                      <small>{formatTime(item.completedAt || item.submittedAt)}</small>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "runs" ? (
        <div className="canvasHistorySection">
          <div className="canvasHistorySectionHeader">
            <span>Phiên chạy</span>
            <button type="button" className="canvasNodeBtn" onClick={onRefreshRunLogs} title="Tải lại">
              {loadingLogs ? <Loader2 size={13} className="spin" /> : <RefreshCcw size={13} />}
            </button>
          </div>
          {!runLogSessions.length ? (
            <p className="canvasFlyoutEmpty">Chưa có run log.</p>
          ) : (
            <ul className="canvasHistoryRuns">
              {runLogSessions.slice(0, 30).map(session => (
                <li key={session.id} className="canvasHistoryRunItem">
                  <strong>{sessionLabel(session)}</strong>
                  <small>
                    {session.status || "unknown"} · {formatTime(session.endedAt || session.startedAt)}
                    {session.logs?.length ? ` · ${session.logs.length} dòng log` : ""}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
