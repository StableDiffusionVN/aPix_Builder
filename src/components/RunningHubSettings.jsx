import { useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2, RefreshCcw } from "lucide-react";
import { RunningHubLogomark } from "./icons/RunningHubIcon";

const RUNNINGHUB_API_GUIDE_URL = "https://www.runninghub.ai/enterprise-api/consumerApi";

export function RunningHubSettings({
  settings,
  onChange,
  onTestConnection,
  testing,
  testResult
}) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="modalSection runningHubSettings">
      <div className="modalSectionTitle">
        <h3>RunningHub API</h3>
        <span className="rhSettingsBadge">
          <RunningHubLogomark size={11} title="RunningHub" />
          Cloud
        </span>
      </div>

      <p className="rhSettingsIntro">
        Kết nối RunningHub Cloud. Lấy API Key tại trang tài khoản RunningHub; chọn WebApp ở tab RH App hoặc Workflow ID ở tab RH Wf.
      </p>

      <label className="field">
        <span>API Key</span>
        <div className="secretInput rhApiKeyInput">
          <input
            type={showApiKey ? "text" : "password"}
            value={settings.apiKey}
            placeholder="Nhập RunningHub API Key"
            onChange={event => onChange({ apiKey: event.target.value })}
            autoComplete="off"
          />
          <button
            type="button"
            className="secretToggleButton"
            onClick={() => setShowApiKey(current => !current)}
            title={showApiKey ? "Ẩn API Key" : "Hiện API Key"}
            aria-label={showApiKey ? "Ẩn API Key" : "Hiện API Key"}
            aria-pressed={showApiKey}
          >
            {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <small>API Key được lưu cục bộ trên trình duyệt.</small>
      </label>

      <div className="rhSettingsActions">
        <button type="button" className="rhTestBtn" onClick={onTestConnection} disabled={testing}>
          {testing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
          Kiểm tra kết nối
        </button>
        <a
          className="rhDocLink"
          href={RUNNINGHUB_API_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} />
          Hướng dẫn lấy API
        </a>
      </div>

      {testResult ? (
        <div className={`rhTestResult ${testResult.ok ? "ok" : "bad"}`}>{testResult.message}</div>
      ) : null}
    </div>
  );
}
