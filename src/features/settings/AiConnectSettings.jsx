import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Plug, RefreshCw, Unplug } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { buildMcpSnippets } from "./aiConnect.js";

function CopyBlock({ label, hint, text }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="aiConnectBlock">
      <div className="aiConnectBlockHeader">
        <strong>{label}</strong>
        <button
          type="button"
          className="aiConnectCopy"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }).catch(() => {});
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t("aiConnect.copied") : t("aiConnect.copy")}
        </button>
      </div>
      {hint ? <p className="aiConnectHint">{hint}</p> : null}
      <pre className="aiConnectCode">{text}</pre>
    </div>
  );
}

async function postClient(action, client) {
  const response = await fetch(`/api/mcp-clients/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data.client;
}

function ClientRow({ client, onChange }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(client.error || "");
  const [restartNote, setRestartNote] = useState(false);

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      onChange(await postClient(action, client.id));
      setRestartNote(true);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const connected = client.status === "connected";
  const outdated = client.status === "outdated";
  return (
    <div className={`aiClientRow${client.detected ? "" : " notDetected"}`}>
      <div className="aiClientInfo">
        <strong>{client.name}</strong>
        <span className={`aiClientStatus is-${client.status}`}>
          {connected ? t("aiConnect.statusConnected") : outdated ? t("aiConnect.statusOutdated") : client.detected ? t("aiConnect.statusReady") : t("aiConnect.statusNotFound")}
        </span>
        <small title={client.file}>{client.file}</small>
        {error ? <small className="aiConnectError">{error}</small> : null}
        {restartNote && !error ? <small className="aiConnectHint">{t("aiConnect.restartClient")}</small> : null}
      </div>
      <div className="aiClientActions">
        {connected ? (
          <button type="button" className="aiConnectCopy" disabled={busy} onClick={() => run("uninstall")}>
            {busy ? <Loader2 size={13} className="spin" /> : <Unplug size={13} />}
            {t("aiConnect.disconnect")}
          </button>
        ) : (
          <button type="button" className="aiConnectCopy primary" disabled={busy} onClick={() => run("install")}>
            {busy ? <Loader2 size={13} className="spin" /> : outdated ? <RefreshCw size={13} /> : <Plug size={13} />}
            {outdated ? t("aiConnect.update") : t("aiConnect.connect")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Settings → AI connect: register the aPix MCP server with AI apps and CLIs on this computer. */
export function AiConnectSettings() {
  const { t } = useI18n();
  const [config, setConfig] = useState(null);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/mcp-config").then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))),
      fetch("/api/mcp-clients").then(response => (response.ok ? response.json() : { clients: [] }))
    ])
      .then(([launch, list]) => {
        setConfig(launch);
        setClients(list.clients || []);
      })
      .catch(err => setError(err.message || String(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const snippets = buildMcpSnippets(config || {});
  const sorted = [...clients].sort((a, b) => Number(b.detected) - Number(a.detected));
  const updateClient = next => setClients(current => current.map(item => (item.id === next.id ? next : item)));

  return (
    <div className="aiConnectPanel">
      <ol className="aiConnectSteps">
        <li>{t("aiConnect.step1")}</li>
        <li>{t("aiConnect.step2")}</li>
        <li>{t("aiConnect.step3")}</li>
      </ol>
      {error ? <p className="aiConnectError">{t("aiConnect.loadError")} {error}</p> : null}

      {sorted.length ? (
        <section className="aiConnectSection">
          <h4>{t("aiConnect.appsTitle")}</h4>
          <div className="aiClientList">
            {sorted.map(client => <ClientRow key={client.id} client={client} onChange={updateClient} />)}
          </div>
        </section>
      ) : null}

      {snippets ? (
        <section className="aiConnectSection">
          <h4>{t("aiConnect.cliTitle")}</h4>
          <CopyBlock label="Claude Code" hint={t("aiConnect.claudeCodeHint")} text={snippets.claudeCode} />
          <CopyBlock label="Codex CLI" hint={t("aiConnect.codexHint")} text={snippets.codex} />
          <CopyBlock label="Gemini CLI" hint={t("aiConnect.geminiHint")} text={snippets.gemini} />
          <h4>{t("aiConnect.manualTitle")}</h4>
          <CopyBlock label="JSON (mcpServers)" hint={t("aiConnect.manualHint")} text={snippets.claudeDesktop} />
          <CopyBlock label={`Codex — ${snippets.codexConfigPath}`} hint={t("aiConnect.codexTomlHint")} text={snippets.codexToml} />
        </section>
      ) : null}
      <p className="aiConnectHint">{t("aiConnect.footer")}</p>
    </div>
  );
}
