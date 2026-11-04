import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { getSetting, setSetting } from "../../lib/appSettings.js";
import "../../styles/colabButton.css";

const BUSY = new Set(["opening", "starting", "waiting", "stopping"]);
const IDLE_CHOICES = [15, 30, 60, 120, 0];

/**
 * One-button Colab (desktop): start the SDVN notebook, wire its ComfyUI link as the
 * server, stop it when idle or on quit. Hidden outside the desktop app.
 */
export function ColabButton() {
  const { t } = useI18n();
  const api = typeof window !== "undefined" ? window.apixDesktop?.colab : null;
  const [state, setState] = useState({ phase: "off", message: "" });
  const [open, setOpen] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState(() => Number(getSetting("colab.idleMinutes", 30)));
  const [stopOnQuit, setStopOnQuit] = useState(() => getSetting("colab.stopOnQuit", true) !== false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!api) return undefined;
    api.getState().then(current => current && setState(current)).catch(() => {});
    return api.onState(next => setState(next));
  }, [api]);

  useEffect(() => {
    if (!api) return;
    setSetting("colab.idleMinutes", idleMinutes);
    setSetting("colab.stopOnQuit", stopOnQuit);
    api.configure({ idleMinutes, stopOnQuit }).catch(() => {});
  }, [api, idleMinutes, stopOnQuit]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (!api) return null;
  const { phase } = state;
  const busy = BUSY.has(phase);
  const start = () => {
    void api.start();
    setOpen(true);
  };
  const title = `${t("colab.title")} — ${t(`colab.phase.${phase}`)}`;

  return (
    <div className="colabButtonRoot" ref={rootRef}>
      <button
        type="button"
        className={`appTopBarButton colabButton is-${phase}`}
        title={title}
        aria-label={title}
        onClick={() => (phase === "off" || phase === "error" ? start() : setOpen(current => !current))}
      >
        {busy ? <Loader2 size={15} className="spin" /> : phase === "off" ? <CloudOff size={15} /> : <Cloud size={15} />}
        <span className="colabButtonLabel">Colab</span>
        <span className={`colabButtonDot is-${phase}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="colabPopover" role="dialog" aria-label={t("colab.title")}>
          <div className="colabPopoverHeader">
            <strong>{t("colab.title")}</strong>
            <span className={`colabPhase is-${phase}`}>{t(`colab.phase.${phase}`)}</span>
          </div>
          {state.message ? <p className="colabMessage">{state.message}</p> : null}
          {state.address ? <p className="colabAddress" title={state.address}>{state.address}</p> : null}
          <div className="colabActions">
            {phase === "off" || phase === "error" ? (
              <button type="button" className="colabAction primary" onClick={start}>{t("colab.start")}</button>
            ) : (
              <button type="button" className="colabAction danger" disabled={phase === "stopping"} onClick={() => void api.stop()}>
                {t("colab.stop")}
              </button>
            )}
            <button type="button" className="colabAction" onClick={() => window.apixDesktop?.openBrowser?.()}>{t("colab.openBrowser")}</button>
          </div>
          <label className="colabSetting">
            <span>{t("colab.idle")}</span>
            <select value={idleMinutes} onChange={event => setIdleMinutes(Number(event.target.value))}>
              {IDLE_CHOICES.map(value => (
                <option key={value} value={value}>{value ? t("colab.minutes", { count: value }) : t("colab.never")}</option>
              ))}
            </select>
          </label>
          <label className="colabSetting checkbox">
            <input type="checkbox" checked={stopOnQuit} onChange={event => setStopOnQuit(event.target.checked)} />
            <span>{t("colab.stopOnQuit")}</span>
          </label>
          <p className="colabHint">{t("colab.hint")}</p>
        </div>
      ) : null}
    </div>
  );
}
