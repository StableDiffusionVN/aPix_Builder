import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, ScrollText } from "lucide-react";
import { ImageLightboxOverlay } from "../../components/ImageLightboxOverlay.jsx";
import { useI18n } from "../../i18n/I18nContext.jsx";

function formatTime(value, locale) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
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
  const { locale, t } = useI18n();
  const [tab, setTab] = useState("outputs");
  const [loadingOutputs, setLoadingOutputs] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [lightboxItem, setLightboxItem] = useState(null);
  const didAutoRefreshRef = useRef(false);

  useEffect(() => {
    if (didAutoRefreshRef.current) return;
    didAutoRefreshRef.current = true;
    void onRefreshOutputHistory?.();
    void onRefreshRunLogs?.();
  }, [onRefreshOutputHistory, onRefreshRunLogs]);

  function refreshOutputs() {
    setLoadingOutputs(true);
    Promise.resolve(onRefreshOutputHistory?.())
      .finally(() => {
        setLoadingOutputs(false);
      });
  }

  function refreshLogs() {
    setLoadingLogs(true);
    Promise.resolve(onRefreshRunLogs?.())
      .finally(() => {
        setLoadingLogs(false);
      });
  }

  return (
    <div className="canvasHistoryPanel">
      <div className="canvasHistoryTabs">
        <button type="button" className={tab === "outputs" ? "active" : ""} onClick={() => setTab("outputs")}>
          {t("canvas.history.outputs", { count: outputHistory.length })}
        </button>
        <button type="button" className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>
          {t("canvas.history.runLogs", { count: runLogSessions.length })}
        </button>
      </div>

      <button type="button" className="canvasFlyoutAction" onClick={onOpenRunLog}>
        <ScrollText size={14} /> {t("canvas.history.openLog")}
      </button>

      {tab === "outputs" ? (
        <div className="canvasHistorySection">
          <div className="canvasHistorySectionHeader">
            <span>{t("canvas.history.createdImages")}</span>
            <button type="button" className="canvasNodeBtn" onClick={refreshOutputs} title={t("canvas.history.reload")}>
              {loadingOutputs ? <Loader2 size={13} className="spin" /> : <RefreshCcw size={13} />}
            </button>
          </div>
          {!outputHistory.length ? (
            <p className="canvasFlyoutEmpty">{t("canvas.history.noOutputs")}</p>
          ) : (
            <ul className="canvasHistoryOutputs">
              {outputHistory.slice(0, 40).map(item => {
                const outputs = (item.outputs || []).filter(output => output?.url);
                const thumb = outputs[0]?.url;
                const outputName = item.templateName
                  || outputs[0]?.canvasNodeName
                  || outputs[0]?.filename
                  || item.webappId
                  || item.template
                  || item.provider
                  || t("canvas.preview.output");
                return (
                  <li key={item.id} className="canvasHistoryOutputItem">
                    <button
                      type="button"
                      className="canvasHistoryOutputButton"
                      onClick={() => {
                        if (thumb) {
                          setLightboxItem({
                            title: outputName,
                            images: outputs.map((output, index) => ({
                              ...output,
                              name: output.canvasNodeName || output.filename || `${t("canvas.preview.output")} ${index + 1}`
                            }))
                          });
                        }
                      }}
                      disabled={!thumb}
                      title={thumb ? t("canvas.history.viewImage") : t("canvas.history.noImage")}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" draggable="false" loading="lazy" decoding="async" />
                      ) : <div className="canvasHistoryOutputPlaceholder" />}
                      <div className="canvasHistoryOutputMeta">
                        <strong>{outputName}</strong>
                        <small>
                          {formatTime(item.completedAt || item.submittedAt, locale)}
                          {outputs.length > 1 ? ` · ${t("canvas.history.imageCount", { count: outputs.length })}` : ""}
                        </small>
                      </div>
                    </button>
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
            <span>{t("canvas.history.sessions")}</span>
            <button type="button" className="canvasNodeBtn" onClick={refreshLogs} title={t("canvas.history.reload")}>
              {loadingLogs ? <Loader2 size={13} className="spin" /> : <RefreshCcw size={13} />}
            </button>
          </div>
          {!runLogSessions.length ? (
            <p className="canvasFlyoutEmpty">{t("canvas.history.noLogs")}</p>
          ) : (
            <ul className="canvasHistoryRuns">
              {runLogSessions.slice(0, 30).map(session => (
                <li key={session.id} className="canvasHistoryRunItem">
                  <strong>{sessionLabel(session)}</strong>
                  <small>
                    {t(`canvas.history.status.${session.status || "unknown"}`)} · {formatTime(session.endedAt || session.startedAt, locale)}
                    {session.logs?.length ? ` · ${t("canvas.history.logLines", { count: session.logs.length })}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <ImageLightboxOverlay
        open={Boolean(lightboxItem)}
        images={lightboxItem?.images}
        title={lightboxItem?.title || t("canvas.preview.output")}
        onClose={() => setLightboxItem(null)}
      />
    </div>
  );
}
