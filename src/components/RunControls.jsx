import { Loader2, Play, Square } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

export function RunControls({ running, canRun, canCancel, queueCount = 0, onRun, onCancel, runLabel }) {
  const { t } = useI18n();
  const idleLabel = runLabel || "Run";
  return (
    <div className={`actionRow ${runLabel ? "rhActionRow" : ""}`}>
      <button
        className={`runButton ${runLabel ? "rhRunButton" : ""}`}
        onClick={onRun}
        disabled={!canRun}
        title={running ? t("run.queueTitle") : `${idleLabel} (⌘/Ctrl+Enter)`}
      >
        {running ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
        <span>{running ? `${t("run.queue")}${queueCount ? ` (${queueCount})` : ""}` : idleLabel}</span>
      </button>
      <button className="stopButton" onClick={onCancel} disabled={!canCancel}>
        <Square size={14} />
        <span>Stop</span>
      </button>
    </div>
  );
}
