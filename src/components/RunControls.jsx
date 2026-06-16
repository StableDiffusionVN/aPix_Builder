import { Loader2, Play, Square } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

export function RunControls({
  running,
  canRun,
  canCancel,
  queueCount = 0,
  onRun,
  onCancel,
  runLabel,
  compact = false,
  stopInsideRun = false
}) {
  const { t } = useI18n();
  const idleLabel = runLabel || "Run";
  const rowClassName = `actionRow ${runLabel ? "rhActionRow" : ""}${compact ? " compactActionRow" : ""}${stopInsideRun ? " runControlSplitRow" : ""}`;

  const runButton = (
    <button
      type="button"
      className={`runButton${stopInsideRun ? " runControlRun" : ""} ${runLabel ? "rhRunButton" : ""}`}
      onClick={onRun}
      disabled={!canRun}
      title={running ? t("run.queueTitle") : `${idleLabel} (⌘/Ctrl+Enter)`}
    >
      {running ? <Loader2 className="spin" size={compact ? 13 : 15} /> : <Play size={compact ? 13 : 15} />}
      <span>{running ? `${t("run.queue")}${queueCount ? ` (${queueCount})` : ""}` : idleLabel}</span>
    </button>
  );

  if (stopInsideRun) {
    return (
      <div className={rowClassName}>
        <button
          type="button"
          className="stopButton runControlStop"
          onClick={onCancel}
          disabled={!canCancel}
          title="Stop"
          aria-label="Stop"
        >
          <Square size={compact ? 12 : 14} />
        </button>
        {runButton}
      </div>
    );
  }

  return (
    <div className={rowClassName}>
      {runButton}
      <button type="button" className="stopButton" onClick={onCancel} disabled={!canCancel}>
        <Square size={compact ? 12 : 14} />
        <span>Stop</span>
      </button>
    </div>
  );
}
