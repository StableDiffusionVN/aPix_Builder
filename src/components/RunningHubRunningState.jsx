import { CheckCircle2, Loader2 } from "lucide-react";
import { estimateRhProgressPct, SdvnWaterLogo } from "./SdvnWaterLogo";
import { useI18n } from "../i18n/I18nContext";

export function RunningHubRunningState({ progress, status }) {
  const { t } = useI18n();
  const phase =
    progress?.type === "submit" ? 1
    : progress?.type === "queued" ? 2
    : progress?.type === "running" || progress?.type === "upload" ? 3
    : progress?.type === "success" ? 4
    : 2;

  const detail = progress?.label || status || t("running.rhConnecting");
  const progressPct = estimateRhProgressPct(progress);

  return (
    <div className="rhRunningState">
      <SdvnWaterLogo
        percent={progressPct}
        indeterminate={progressPct === null}
        tone="rh"
        title={t("running.rh")}
      />

      <p className="rhRunningTitle">{t("running.rh")}</p>
      <p className="rhRunningSubtitle">{t("running.rhSubtitle")}</p>

      <div className="rhRunPhases">
        <RhRunPhase label={t("running.submitTask")} active={phase === 1} done={phase > 1} />
        <span className="rhRunPhaseSep" aria-hidden="true" />
        <RhRunPhase label={t("running.queue")} active={phase === 2} done={phase > 2} />
        <span className="rhRunPhaseSep" aria-hidden="true" />
        <RhRunPhase label={t("running.cloudRender")} active={phase === 3} done={phase > 3} />
        <span className="rhRunPhaseSep" aria-hidden="true" />
        <RhRunPhase label={t("running.receive")} active={phase === 4} done={false} />
      </div>

      <p className="rhRunDetail">{detail}</p>
    </div>
  );
}

function RhRunPhase({ label, active, done }) {
  return (
    <span className={`rhRunPhase ${active ? "active" : ""} ${done ? "done" : ""}`}>
      {done ? <CheckCircle2 size={11} /> : active ? <Loader2 size={11} className="spin" /> : null}
      {label}
    </span>
  );
}
