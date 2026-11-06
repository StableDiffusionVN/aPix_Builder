import { useEffect, useState } from "react";
import "../../styles/fieldInfo.css";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { getSetting, setSetting } from "../../lib/appSettings.js";
import { syncVipTemplates } from "../../lib/vipTemplates.js";

/**
 * aPix key for paid workflows: aPix sends it to the SDVN nodes of the ComfyUI server
 * (Colab) so private [SDVN] models download — no HuggingFace token on Colab.
 */
export function ApixKeySettings() {
  const { t } = useI18n();
  const [value, setValue] = useState(() => getSetting("license.apixKey", ""));
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [vip, setVip] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/apix-license/status");
      setStatus(await response.json());
      setVip(await syncVipTemplates());
    } catch (error) {
      setStatus({ configured: true, valid: false, error: error.message });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (getSetting("license.apixKey", "")) void check();
  }, []);

  const save = async () => {
    const key = value.trim();
    setSetting("license.apixKey", key);
    // Settings are synced to the app server shortly after; give it a moment before checking.
    await new Promise(resolve => setTimeout(resolve, 600));
    if (key) await check();
    else {
      setStatus(null);
      setVip(await syncVipTemplates());
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const expires = status?.expiresAt ? new Date(status.expiresAt).toLocaleString() : "";
  return (
    <div className="apixKeyPanel">
      <div className="apixKeyHeader">
        <KeyRound size={15} />
        <strong>{t("apixKey.title")}</strong>
      </div>
      <div className="apixKeyRow">
        <div className="apixKeyInput">
          <input
            type={revealed ? "text" : "password"}
            value={value}
            placeholder="apx_…"
            autoComplete="off"
            spellCheck={false}
            onChange={event => setValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") void save();
            }}
          />
          <button
            type="button"
            onClick={() => setRevealed(current => !current)}
            title={t(revealed ? "apixKey.hide" : "apixKey.show")}
            aria-label={t(revealed ? "apixKey.hide" : "apixKey.show")}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => void copy()}
            title={t(copied ? "apixKey.copied" : "apixKey.copy")}
            aria-label={t(copied ? "apixKey.copied" : "apixKey.copy")}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <button type="button" className="aiConnectCopy primary" disabled={checking} onClick={() => void save()}>
          {checking ? <Loader2 size={13} className="spin" /> : null}
          {t("apixKey.save")}
        </button>
      </div>
      {status?.configured ? (
        <p className={status.valid ? "apixKeyOk" : "aiConnectError"}>
          {status.valid
            ? t("apixKey.valid", { label: status.label || "—", expires: expires || t("apixKey.noExpiry") })
            : `${t("apixKey.invalid")} ${status.error || ""}`}
        </p>
      ) : null}
      {vip && status?.valid ? (
        <div className="apixVipList">
          <strong>{t("apixKey.vipTitle")}</strong>
          {vip.offline ? <p className="aiConnectHint">{t("apixKey.vipOffline")}</p> : null}
          {vip.workflows?.length ? (
            <ul>{vip.workflows.map(item => <li key={item.id}>★ {item.name}</li>)}</ul>
          ) : <p className="aiConnectHint">{t("apixKey.vipNone")}</p>}
        </div>
      ) : null}
    </div>
  );
}
