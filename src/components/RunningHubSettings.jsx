import { useState } from "react";
import { Activity, CircleDollarSign, Coins, ExternalLink, Eye, EyeOff, KeyRound, Loader2, RefreshCcw, ShieldCheck } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

const RUNNINGHUB_API_GUIDE_URL = "https://www.runninghub.ai/enterprise-api/consumerApi";

export function RunningHubSettings({
  settings,
  onChange,
  onTestConnection,
  testing,
  testResult,
  account,
  accountLoading,
  accountError,
  onRefreshAccount
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const { locale, t } = useI18n();
  const hasApiKey = Boolean(settings.apiKey?.trim());
  const accountItems = [
    {
      key: "status",
      icon: ShieldCheck,
      label: t("rh.keyStatus"),
      value: account ? t("rh.keyValid") : accountError ? t("rh.keyInvalid") : hasApiKey ? t("rh.notChecked") : t("rh.noKey"),
      tone: account ? "ok" : accountError ? "bad" : "muted"
    },
    {
      key: "type",
      icon: KeyRound,
      label: t("rh.apiType"),
      value: account?.apiType || "—"
    },
    {
      key: "coins",
      icon: Coins,
      label: t("rh.coinBalance"),
      value: account?.remainCoins ?? "—"
    },
    {
      key: "money",
      icon: CircleDollarSign,
      label: t("rh.moneyBalance"),
      value: account?.remainMoney != null
        ? `${account.remainMoney}${account.currency ? ` ${account.currency}` : ""}`
        : "—"
    },
    {
      key: "tasks",
      icon: Activity,
      label: t("rh.activeTasks"),
      value: account?.currentTaskCounts ?? "—"
    }
  ];

  return (
    <div className="runningHubSettings">
      <header className="settingsPaneHeader">
        <h3>RunningHub API</h3>
        <p>{t("rh.intro")}</p>
      </header>

      <section className="rhAccountOverview" aria-label={t("rh.accountOverview")}>
        <div className="rhAccountHeader">
          <div>
            <h4>{t("rh.accountOverview")}</h4>
            <p>
              {account?.refreshedAt
                ? t("rh.updatedAt", { value: new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(account.refreshedAt)) })
                : t("rh.refreshHint")}
            </p>
          </div>
          <button
            type="button"
            className="rhAccountRefresh"
            onClick={onRefreshAccount}
            disabled={accountLoading || !hasApiKey}
            title={t("rh.refresh")}
            aria-label={t("rh.refresh")}
          >
            {accountLoading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
          </button>
        </div>
        <div className="rhAccountGrid">
          {accountItems.map(item => {
            const Icon = item.icon;
            return (
              <div className={`rhAccountMetric ${item.tone ? `is-${item.tone}` : ""}`} key={item.key}>
                <span className="rhAccountMetricIcon"><Icon size={15} /></span>
                <span>
                  <small>{item.label}</small>
                  <b>{String(item.value)}</b>
                </span>
              </div>
            );
          })}
        </div>
        {accountError ? <div className="rhAccountError">{accountError}</div> : null}
      </section>

      <label className="field">
        <span>API Key</span>
        <div className="secretInput rhApiKeyInput">
          <input
            type={showApiKey ? "text" : "password"}
            value={settings.apiKey}
            placeholder={t("rh.apiPlaceholder")}
            onChange={event => onChange({ apiKey: event.target.value })}
            autoComplete="off"
          />
          <button
            type="button"
            className="secretToggleButton"
            onClick={() => setShowApiKey(current => !current)}
            title={showApiKey ? t("rh.hideKey") : t("rh.showKey")}
            aria-label={showApiKey ? t("rh.hideKey") : t("rh.showKey")}
            aria-pressed={showApiKey}
          >
            {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <small>{t("rh.apiStored")}</small>
      </label>

      <div className="rhSettingsActions">
        <button type="button" className="rhTestBtn" onClick={onTestConnection} disabled={testing}>
          {testing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
          {t("rh.test")}
        </button>
        <a
          className="rhDocLink"
          href={RUNNINGHUB_API_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} />
          {t("rh.guide")}
        </a>
      </div>

      {testResult ? (
        <div className={`rhTestResult ${testResult.ok ? "ok" : "bad"}`}>{testResult.message}</div>
      ) : null}
    </div>
  );
}
