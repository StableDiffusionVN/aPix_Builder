import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Monitor } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";

/**
 * Run → ComfyUI server not answering: ask "ComfyUI on this machine" (the user starts
 * it) or "Google Colab" (desktop: start the notebook, wait for its link, then run).
 * While Colab starts, the Run button shows a running state with the Colab progress.
 */
export function useComfyServerGate({ enabled, healthStatus, onRun, onLocalChosen }) {
  const { t } = useI18n();
  const colab = typeof window !== "undefined" ? window.apixDesktop?.colab : null;
  const [promptOpen, setPromptOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [colabState, setColabState] = useState(null);
  const runRef = useRef(onRun);
  runRef.current = onRun;

  useEffect(() => {
    if (!colab) return undefined;
    colab.getState().then(state => state && setColabState(state)).catch(() => {});
    return colab.onState(setColabState);
  }, [colab]);

  // Colab ready and the app sees the server (discovery online) → run what was asked.
  useEffect(() => {
    if (!pending) return;
    if (colabState?.phase === "error" || colabState?.phase === "off") {
      setPending(false);
      return;
    }
    if (colabState?.phase === "ready" && healthStatus === "online") {
      setPending(false);
      void runRef.current?.();
    }
  }, [pending, colabState, healthStatus]);

  const handleRun = useCallback(() => {
    if (pending) {
      setPending(false); // second click cancels the wait (Colab keeps running)
      return undefined;
    }
    if (enabled && healthStatus === "offline") {
      setPromptOpen(true);
      return undefined;
    }
    return runRef.current?.();
  }, [enabled, healthStatus, pending]);

  const chooseColab = useCallback(() => {
    setPromptOpen(false);
    setPending(true);
    void colab?.start();
  }, [colab]);

  const chooseLocal = useCallback(() => {
    setPromptOpen(false);
    onLocalChosen?.();
  }, [onLocalChosen]);

  const prompt = promptOpen ? (
    <div className="modalBackdrop" role="presentation" onMouseDown={() => setPromptOpen(false)}>
      <section
        className="settingsModal serverGateModal"
        role="dialog"
        aria-modal="true"
        aria-label={t("serverGate.title")}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modalHeader">
          <div>
            <h2>{t("serverGate.title")}</h2>
            <p>{t("serverGate.body")}</p>
          </div>
        </div>
        <div className="serverGateOptions">
          {colab ? (
            <button type="button" className="serverGateOption primary" onClick={chooseColab}>
              <Cloud size={18} />
              <span>
                <strong>{t("serverGate.colab")}</strong>
                <small>{t("serverGate.colabHint")}</small>
              </span>
            </button>
          ) : null}
          <button type="button" className="serverGateOption" onClick={chooseLocal}>
            <Monitor size={18} />
            <span>
              <strong>{t("serverGate.local")}</strong>
              <small>{t("serverGate.localHint")}</small>
            </span>
          </button>
        </div>
        <div className="templateDeleteActions">
          <button type="button" className="secondaryActionButton" onClick={() => setPromptOpen(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  const preparingLabel = pending
    ? (colabState?.message || t("serverGate.colabStarting"))
    : "";

  return { handleRun, preparing: pending, preparingLabel, prompt };
}
