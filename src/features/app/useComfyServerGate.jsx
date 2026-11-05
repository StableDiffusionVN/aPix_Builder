import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Loader2, Monitor } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { getSetting } from "../../lib/appSettings.js";

const DEFAULT_LOCAL = "http://127.0.0.1:8188";
const isLocalAddress = address => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/i.test(String(address || "").trim());

/** Local ComfyUI to try first: the current address if local, else a saved local server, else :8188. */
function localCandidate(current) {
  if (isLocalAddress(current)) return String(current).trim().replace(/\/$/, "");
  const saved = (() => {
    try {
      const list = getSetting("connection.servers", []);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  })();
  const local = saved.find(server => isLocalAddress(server?.address));
  return local ? String(local.address).trim().replace(/\/$/, "") : DEFAULT_LOCAL;
}

async function comfyOnline(address) {
  try {
    const response = await fetch(`/api/comfy-health?address=${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => ({}));
    return response.ok && data.online === true;
  } catch {
    return false;
  }
}

/**
 * Run → ComfyUI server not answering: ask "ComfyUI on this machine" (the user starts
 * it) or "Google Colab" (desktop: start the notebook, wait for its link, then run).
 * While Colab starts, the Run button shows a running state with the Colab progress.
 */
export function useComfyServerGate({ enabled, healthStatus, comfyAddress, onRun, onUseServer }) {
  const { t } = useI18n();
  const colab = typeof window !== "undefined" ? window.apixDesktop?.colab : null;
  const [promptOpen, setPromptOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [colabState, setColabState] = useState(null);
  // Local choice: { status: "checking" | "failed", address, port }
  const [local, setLocal] = useState(null);
  const [localPending, setLocalPending] = useState(false);
  const runRef = useRef(onRun);
  const colabBaselineRef = useRef(null);
  runRef.current = onRun;

  useEffect(() => {
    if (!colab) return undefined;
    colab.getState().then(state => state && setColabState(state)).catch(() => {});
    return colab.onState(setColabState);
  }, [colab]);

  // Colab ready and the app sees the server (discovery online) → run what was asked.
  useEffect(() => {
    if (!pending) return;
    // Right after the choice the state is still the old one ("off", or a stale
    // "error"/"ready"): wait for start() to report before judging it.
    if (colabState === colabBaselineRef.current) return;
    const phase = colabState?.phase;
    if (phase === "error" || phase === "off") {
      setPending(false);
      return;
    }
    if (colabState?.phase === "ready" && healthStatus === "online") {
      setPending(false);
      void runRef.current?.();
    }
  }, [pending, colabState, healthStatus]);

  // Local server answered and the app has scanned it → run what was asked.
  useEffect(() => {
    if (localPending && healthStatus === "online") {
      setLocalPending(false);
      void runRef.current?.();
    }
  }, [localPending, healthStatus]);

  const handleRun = useCallback(() => {
    if (pending || localPending) {
      setPending(false); // second click cancels the wait (Colab keeps running)
      setLocalPending(false);
      return undefined;
    }
    if (enabled && healthStatus === "offline") {
      setPromptOpen(true);
      return undefined;
    }
    return runRef.current?.();
  }, [enabled, healthStatus, pending, localPending]);

  const chooseColab = useCallback(() => {
    setPromptOpen(false);
    colabBaselineRef.current = colabState;
    setPending(true);
    void colab?.start();
  }, [colab, colabState]);

  const tryLocal = useCallback(async address => {
    setLocal(current => ({ port: current?.port || "", ...current, status: "checking", address }));
    if (await comfyOnline(address)) {
      setLocal(null);
      setPromptOpen(false);
      setLocalPending(true);
      onUseServer?.(address);
      return;
    }
    const port = (() => {
      try {
        return new URL(address).port || "8188";
      } catch {
        return "8188";
      }
    })();
    setLocal({ status: "failed", address, port });
  }, [onUseServer]);

  const chooseLocal = useCallback(() => {
    void tryLocal(localCandidate(comfyAddress));
  }, [comfyAddress, tryLocal]);

  const retryLocal = useCallback(event => {
    event?.preventDefault();
    const port = String(local?.port || "").trim();
    if (!/^\d{2,5}$/.test(port)) return;
    void tryLocal(`http://127.0.0.1:${port}`);
  }, [local, tryLocal]);

  const closePrompt = useCallback(() => {
    setPromptOpen(false);
    setLocal(null);
  }, []);

  const prompt = promptOpen ? (
    <div className="modalBackdrop" role="presentation" onMouseDown={closePrompt}>
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
          <button type="button" className={`serverGateOption${local ? " isActive" : ""}`} onClick={chooseLocal} disabled={local?.status === "checking"}>
            {local?.status === "checking" ? <Loader2 size={18} className="spin" /> : <Monitor size={18} />}
            <span>
              <strong>{t("serverGate.local")}</strong>
              <small>
                {local?.status === "checking"
                  ? t("serverGate.localChecking", { address: local.address })
                  : t("serverGate.localHint", { address: localCandidate(comfyAddress) })}
              </small>
            </span>
          </button>
        </div>
        {local?.status === "failed" || (local?.status === "checking" && local.port) ? (
          <form className="serverGateLocalRetry" onSubmit={retryLocal}>
            <p>{t("serverGate.localFailed", { address: local.address })}</p>
            <label>
              <span>http://127.0.0.1:</span>
              <input
                type="text"
                inputMode="numeric"
                value={local.port}
                onChange={event => setLocal(current => ({ ...current, port: event.target.value.replace(/\D/g, "").slice(0, 5) }))}
                autoFocus
                aria-label={t("serverGate.localPort")}
              />
              <button type="submit" className="secondaryActionButton" disabled={local.status === "checking" || !/^\d{2,5}$/.test(local.port)}>
                {t("serverGate.localRetry")}
              </button>
            </label>
          </form>
        ) : null}
        <div className="templateDeleteActions">
          <button type="button" className="secondaryActionButton" onClick={closePrompt}>
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  const preparingLabel = pending
    ? (colabState?.message || t("serverGate.colabStarting"))
    : localPending ? t("serverGate.localConnecting") : "";

  return { handleRun, preparing: pending || localPending, preparingLabel, prompt };
}
