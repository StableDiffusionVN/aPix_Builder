import { useMemo, useState } from "react";
import {
  Activity,
  CircleDollarSign,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import {
  createRhToken,
  getEnabledRhTokens,
  getPrimaryRhApiKey,
  maskRhApiKey,
  reorderRhTokens,
  RH_TOKEN_POLICY
} from "../lib/rhTokenPool.js";

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
  onRefreshAccount,
  tokenAccounts = [],
  totalCoins
}) {
  const [showKeys, setShowKeys] = useState({});
  const [dragTokenId, setDragTokenId] = useState("");
  const { locale, t } = useI18n();
  const tokens = settings.tokens || [];
  const enabledTokens = useMemo(() => getEnabledRhTokens(settings), [settings]);
  const hasApiKey = enabledTokens.length > 0;
  const tokenPolicy = settings.tokenPolicy === RH_TOKEN_POLICY.ROTATE
    ? RH_TOKEN_POLICY.ROTATE
    : RH_TOKEN_POLICY.PRIORITY;

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
      label: enabledTokens.length > 1 ? t("rh.totalCoinBalance") : t("rh.coinBalance"),
      value: totalCoins ?? account?.remainCoins ?? "—"
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

  function updateTokens(nextTokens) {
    onChange({ tokens: nextTokens });
  }

  function updateToken(tokenId, patch) {
    updateTokens(tokens.map(token => (
      token.id === tokenId ? { ...token, ...patch } : token
    )));
  }

  function handleAddToken() {
    updateTokens([...tokens, createRhToken({ label: t("rh.tokenDefaultLabel", { n: tokens.length + 1 }) })]);
  }

  function handleRemoveToken(tokenId) {
    updateTokens(tokens.filter(token => token.id !== tokenId));
  }

  function handleDrop(targetId) {
    if (!dragTokenId || dragTokenId === targetId) return;
    const fromIndex = tokens.findIndex(token => token.id === dragTokenId);
    const toIndex = tokens.findIndex(token => token.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    updateTokens(reorderRhTokens(tokens, fromIndex, toIndex));
    setDragTokenId("");
  }

  function toggleKeyVisibility(tokenId) {
    setShowKeys(current => ({ ...current, [tokenId]: !current[tokenId] }));
  }

  function findTokenAccount(tokenId) {
    return tokenAccounts.find(entry => entry.tokenId === tokenId);
  }

  return (
    <div className="runningHubSettings">
      <header className="settingsPaneHeader rhSettingsHeader">
        <div className="rhSettingsHeaderTop">
          <h3>RunningHub API</h3>
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

      <section className="rhTokenPool" aria-label={t("rh.tokenPool")}>
        <div className="rhTokenPoolHeader">
          <div>
            <h4>{t("rh.tokenPool")}</h4>
            <p>{t("rh.tokenPoolHint")}</p>
          </div>
          <button type="button" className="rhTokenAddBtn" onClick={handleAddToken}>
            <Plus size={14} />
            {t("rh.addToken")}
          </button>
        </div>

        <div className="rhTokenPolicy" role="radiogroup" aria-label={t("rh.tokenPolicy")}>
          <label className={`rhTokenPolicyOption${tokenPolicy === RH_TOKEN_POLICY.PRIORITY ? " isActive" : ""}`}>
            <input
              type="radio"
              name="rh-token-policy"
              checked={tokenPolicy === RH_TOKEN_POLICY.PRIORITY}
              onChange={() => onChange({ tokenPolicy: RH_TOKEN_POLICY.PRIORITY })}
            />
            <span>
              <b>{t("rh.tokenPolicyPriority")}</b>
              <small>{t("rh.tokenPolicyPriorityHint")}</small>
            </span>
          </label>
          <label className={`rhTokenPolicyOption${tokenPolicy === RH_TOKEN_POLICY.ROTATE ? " isActive" : ""}`}>
            <input
              type="radio"
              name="rh-token-policy"
              checked={tokenPolicy === RH_TOKEN_POLICY.ROTATE}
              onChange={() => onChange({ tokenPolicy: RH_TOKEN_POLICY.ROTATE })}
            />
            <span>
              <b>{t("rh.tokenPolicyRotate")}</b>
              <small>{t("rh.tokenPolicyRotateHint")}</small>
            </span>
          </label>
        </div>

        {tokens.length ? (
          <ul className="rhTokenList">
            {tokens.map((token, index) => {
              const tokenAccount = findTokenAccount(token.id);
              const showKey = Boolean(showKeys[token.id]);
              const isPrimary = index === 0;
              return (
                <li
                  key={token.id}
                  className={`rhTokenItem${isPrimary ? " isPrimary" : ""}${dragTokenId === token.id ? " isDragging" : ""}`}
                  draggable
                  onDragStart={() => setDragTokenId(token.id)}
                  onDragEnd={() => setDragTokenId("")}
                  onDragOver={event => event.preventDefault()}
                  onDrop={() => handleDrop(token.id)}
                >
                  <button
                    type="button"
                    className="rhTokenDragHandle"
                    aria-label={t("rh.dragToken")}
                    title={t("rh.dragToken")}
                  >
                    <GripVertical size={14} />
                  </button>

                  <div className="rhTokenMain">
                    <div className="rhTokenTopRow">
                      <span className={`rhTokenBadge${isPrimary ? " isPrimary" : ""}`}>
                        {isPrimary ? t("rh.tokenPrimary") : t("rh.tokenFallback", { n: index })}
                      </span>
                      <label className="rhTokenEnable">
                        <input
                          type="checkbox"
                          checked={token.enabled !== false}
                          onChange={event => updateToken(token.id, { enabled: event.target.checked })}
                        />
                        <span>{t("rh.tokenEnabled")}</span>
                      </label>
                    </div>

                    <label className="rhTokenLabelField">
                      <span>{t("rh.tokenLabel")}</span>
                      <input
                        type="text"
                        value={token.label || ""}
                        placeholder={t("rh.tokenDefaultLabel", { n: index + 1 })}
                        onChange={event => updateToken(token.id, { label: event.target.value })}
                      />
                    </label>

                    <label className="rhTokenLabelField">
                      <span>API Key</span>
                      <div className="secretInput rhApiKeyInput">
                        <input
                          type={showKey ? "text" : "password"}
                          value={token.apiKey || ""}
                          placeholder={t("rh.apiPlaceholder")}
                          onChange={event => updateToken(token.id, { apiKey: event.target.value })}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="secretToggleButton"
                          onClick={() => toggleKeyVisibility(token.id)}
                          title={showKey ? t("rh.hideKey") : t("rh.showKey")}
                          aria-label={showKey ? t("rh.hideKey") : t("rh.showKey")}
                          aria-pressed={showKey}
                        >
                          {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </label>

                    <div className="rhTokenMeta">
                      <span>{maskRhApiKey(token.apiKey) || t("rh.noKey")}</span>
                      {tokenAccount?.account?.remainCoins != null ? (
                        <span className="rhTokenMetaCoins">
                          <Coins size={11} />
                          {tokenAccount.account.remainCoins}
                        </span>
                      ) : null}
                      {tokenAccount?.error ? (
                        <span className="rhTokenMetaError">{tokenAccount.error}</span>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="rhTokenRemoveBtn"
                    onClick={() => handleRemoveToken(token.id)}
                    disabled={tokens.length <= 1}
                    title={tokens.length <= 1 ? t("rh.tokenKeepOne") : t("rh.removeToken")}
                    aria-label={t("rh.removeToken")}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rhTokenEmpty">{t("rh.tokenEmpty")}</div>
        )}
      </section>

      <div className="rhSettingsActions">
        <button type="button" className="rhTestBtn" onClick={onTestConnection} disabled={testing || !getPrimaryRhApiKey(settings)}>
          {testing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
          {t("rh.test")}
        </button>
      </div>

      {testResult ? (
        <div className={`rhTestResult ${testResult.ok ? "ok" : "bad"}`}>{testResult.message}</div>
      ) : null}
    </div>
  );
}
