import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
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

/** Settings → AI connect: register the aPix MCP server with Claude Code, Codex, Claude Desktop. */
export function AiConnectSettings() {
  const { t } = useI18n();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/mcp-config")
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(data => {
        if (alive) setConfig(data);
      })
      .catch(err => {
        if (alive) setError(err.message || String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  const snippets = buildMcpSnippets(config || {});

  return (
    <div className="aiConnectPanel">
      <ol className="aiConnectSteps">
        <li>{t("aiConnect.step1")}</li>
        <li>{t("aiConnect.step2")}</li>
        <li>{t("aiConnect.step3")}</li>
      </ol>
      {error ? <p className="aiConnectError">{t("aiConnect.loadError")} {error}</p> : null}
      {snippets ? (
        <>
          <CopyBlock label="Claude Code" hint={t("aiConnect.claudeCodeHint")} text={snippets.claudeCode} />
          <CopyBlock label="Codex CLI" hint={t("aiConnect.codexHint")} text={snippets.codex} />
          <CopyBlock label={`Codex — ${snippets.codexConfigPath}`} hint={t("aiConnect.codexTomlHint")} text={snippets.codexToml} />
          <CopyBlock label={`Claude Desktop — ${snippets.claudeDesktopPath}`} hint={t("aiConnect.claudeDesktopHint")} text={snippets.claudeDesktop} />
        </>
      ) : null}
      <p className="aiConnectHint">{t("aiConnect.footer")}</p>
    </div>
  );
}
