import { useState } from "react";
import { FolderOpen, Loader2, Play, Square } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { flushAppSettings, getSetting, setSetting } from "../../lib/appSettings.js";
import { useComfyLocal } from "./useComfyLocal.js";

const BUSY = new Set(["installing", "starting", "stopping"]);

/** Settings → ComfyUI Server: the ComfyUI folder on this machine, started / stopped by aPix (desktop). */
export function ComfyLocalSettings() {
  const { t } = useI18n();
  const { api, state } = useComfyLocal();
  const [config, setConfig] = useState(() => ({ folder: "", python: "", args: "", port: "", ...getSetting("connection.local", {}) }));
  const [check, setCheck] = useState(null);
  const [showLog, setShowLog] = useState(false);


  if (!api) return null;

  const update = patch => {
    const next = { ...config, ...patch };
    setConfig(next);
    setCheck(null);
    setSetting("connection.local", next);
  };
  const runCheck = async (folder = config.folder) => {
    if (!folder) return;
    setCheck({ loading: true });
    setCheck(await api.inspect(folder, config.python));
  };
  const pick = async () => {
    const folder = await api.pickFolder();
    if (!folder) return;
    update({ folder });
    void runCheck(folder);
  };
  const start = async () => {
    await flushAppSettings();
    void api.start();
  };
  const phase = state?.phase || "off";
  const busy = BUSY.has(phase);

  return (
    <section className="comfyLocalPanel">
      <div className="comfyLocalHeader">
        <div>
          <h4>{t("comfyLocal.title")}</h4>
          <p>{t("comfyLocal.hint")}</p>
        </div>
        {phase === "ready" && state.ours ? (
          <button type="button" className="secondaryActionButton" onClick={() => void api.stop()}>
            <Square size={13} /> {t("comfyLocal.stop")}
          </button>
        ) : busy ? (
          <button type="button" className="secondaryActionButton" onClick={() => void api.stop()}>
            <Loader2 size={13} className="spin" /> {t("comfyLocal.cancel")}
          </button>
        ) : (
          <button type="button" className="primaryActionButton" disabled={!config.folder} onClick={() => void start()}>
            <Play size={13} /> {t("comfyLocal.start")}
          </button>
        )}
      </div>
      <div className="comfyLocalFolder">
        <input
          value={config.folder}
          placeholder={t("comfyLocal.folderPlaceholder")}
          spellCheck={false}
          onChange={event => update({ folder: event.target.value })}
          onBlur={() => void runCheck()}
        />
        <button type="button" className="secondaryActionButton" onClick={() => void pick()}>
          <FolderOpen size={14} /> {t("comfyLocal.pick")}
        </button>
      </div>
      <div className="comfyLocalGrid">
        <label>
          <span>{t("comfyLocal.python")}</span>
          <input value={config.python} placeholder={t("comfyLocal.pythonAuto")} spellCheck={false} onChange={event => update({ python: event.target.value })} onBlur={() => void runCheck()} />
        </label>
        <label>
          <span>{t("comfyLocal.args")}</span>
          <input value={config.args} placeholder="--lowvram" spellCheck={false} onChange={event => update({ args: event.target.value })} />
        </label>
        <label>
          <span>{t("comfyLocal.port")}</span>
          <input value={config.port} placeholder="8188" inputMode="numeric" onChange={event => update({ port: event.target.value.replace(/\D/g, "").slice(0, 5) })} />
        </label>
      </div>
      {check?.loading ? <p className="comfyLocalNote"><Loader2 size={12} className="spin" /> {t("comfyLocal.checking")}</p> : null}
      {check && !check.loading ? (
        check.ok ? (
          <p className="comfyLocalNote">
            {check.portable ? t("comfyLocal.portable") : "ComfyUI"} · {check.comfyDir}<br />
            Python · {check.python}<br />
            {check.sdvnInstalled ? t("comfyLocal.sdvnInstalled") : t("comfyLocal.sdvnMissing")}
          </p>
        ) : <p className="comfyLocalNote isError">{check.error}</p>
      ) : null}
      {phase !== "off" || state?.message ? (
        <p className={`comfyLocalStatus phase-${phase}`}>
          {busy ? <Loader2 size={12} className="spin" /> : <span className="comfyLocalDot" />}
          {state?.message || t(`comfyLocal.phase.${phase}`)}
          {state?.log?.length ? (
            <button type="button" className="linkButton" onClick={() => setShowLog(open => !open)}>
              {t(showLog ? "comfyLocal.hideLog" : "comfyLocal.showLog")}
            </button>
          ) : null}
        </p>
      ) : null}
      {showLog && state?.log?.length ? <pre className="comfyLocalLog">{state.log.join("\n")}</pre> : null}
    </section>
  );
}
