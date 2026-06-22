import { CheckCircle2, Loader2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { SdvnWaterLogo } from "../../components/SdvnWaterLogo";

export function ShortcutRow({ label, keys }) {
  return (
    <div className="shortcutRow">
      <span>{label}</span>
      <span className="keyGroup">{keys.map(key => <kbd key={key}>{key}</kbd>)}</span>
    </div>
  );
}

export function RunningState({ progress, status, progressPct }) {
  const { t } = useI18n();
  const phase =
    !progress || progress.type === "start" ? 1
      : progress.type === "cached" || progress.type === "executing" || progress.type === "progress" || progress.type === "executed" ? 2
        : 1;

  const detail = progress?.label || status || t("running.waiting");

  return (
    <div className="runningState">
      <SdvnWaterLogo
        percent={progressPct}
        indeterminate={progressPct === null}
        tone="accent"
        title={t("running.comfy")}
      />

      <p className="runningTitle">{t("running.comfy")}</p>

      <div className="runPhases">
        <RunPhase label={t("running.submit")} active={phase === 1} done={phase > 1} />
        <span className="runPhaseSep" aria-hidden="true" />
        <RunPhase label={t("running.nodes")} active={phase === 2} done={phase > 2} />
        <span className="runPhaseSep" aria-hidden="true" />
        <RunPhase label={t("running.save")} active={phase === 3} done={false} />
      </div>

      <p className="runDetail">{detail}</p>
    </div>
  );
}

function RunPhase({ label, active, done }) {
  return (
    <span className={`runPhase ${active ? "active" : ""} ${done ? "done" : ""}`}>
      {done ? <CheckCircle2 size={11} /> : active ? <Loader2 size={11} className="spin" /> : null}
      {label}
    </span>
  );
}
