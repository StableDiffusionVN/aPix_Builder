import { useEffect, useState } from "react";
import "../../styles/fieldInfo.css";
import { KeyRound, Loader2 } from "lucide-react";
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

  const expires = status?.expiresAt ? new Date(status.expiresAt).toLocaleString() : "";
  return (
    <div className="apixKeyPanel">
      <div className="apixKeyHeader">
        <KeyRound size={15} />
        <strong>{t("apixKey.title")}</strong>
      </div>
      <p className="aiConnectHint">{t("apixKey.hint")}</p>
      <div className="apixKeyRow">
        <input
          type="password"
          value={value}
          placeholder="apx_…"
          autoComplete="off"
          spellCheck={false}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") void save();
          }}
        />
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
