import { Cloud, Loader2, RefreshCcw, Wifi, WifiOff } from "lucide-react";
import { RunningHubField } from "./RunningHubField";
import { RUNNINGHUB_APP_OPTIONS } from "../hooks/useRunningHub";

export function ExecutionModeToggle({ mode, onChange }) {
  return (
    <div className="executionModeToggle" role="tablist" aria-label="Chế độ thực thi">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "local"}
        className={mode === "local" ? "active" : ""}
        onClick={() => onChange("local")}
      >
        ComfyUI
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "runninghub"}
        className={`rhModeBtn ${mode === "runninghub" ? "active" : ""}`}
        onClick={() => onChange("runninghub")}
      >
        <Cloud size={14} />
        RunningHub
      </button>
    </div>
  );
}

export function RunningHubPanel({
  settings,
  onSettingsChange,
  nodes,
  values,
  onValuesChange,
  nodesLoading,
  nodesError,
  onRefreshNodes,
  inputImages,
  onRefreshInputImages,
  onUpdateInputImages
}) {
  const connected = Boolean(nodes.length && !nodesError);
  const healthStatus = nodesLoading ? "loading" : connected ? "online" : "offline";
  const selectedPresetId = RUNNINGHUB_APP_OPTIONS.some(app => app.id === settings.webappId)
    ? settings.webappId
    : "custom";

  return (
    <section className="settingsGroup runningHubPanel">
      <div className="settingsHeader">
        <Cloud size={16} />
        <h2>RunningHub Cloud</h2>
        <span className={`healthDot health-${healthStatus}`} title={
          healthStatus === "online" ? "Đã kết nối RunningHub API" :
          healthStatus === "loading" ? "Đang tải node..." : "Chưa kết nối RunningHub"
        }>
          {healthStatus === "loading" ? <Loader2 size={10} className="spin" /> :
           healthStatus === "online" ? <Wifi size={10} /> : <WifiOff size={10} />}
        </span>
      </div>

      <div className="rhAppPicker">
        <label className="field compact">
          <span>App</span>
          <select
            value={selectedPresetId}
            onChange={event => {
              const nextId = event.target.value;
              if (nextId === "custom") return;
              onSettingsChange?.({ webappId: nextId });
            }}
          >
            {RUNNINGHUB_APP_OPTIONS.map(app => (
              <option key={app.id} value={app.id}>{app.name}</option>
            ))}
            <option value="custom">Custom WebApp ID</option>
          </select>
        </label>
        <div className="rhWebappIdRow">
          <label className="field compact">
          <span>App ID</span>
          <input
            value={settings.webappId}
            placeholder="2039924771751731201"
            onChange={event => onSettingsChange?.({ webappId: event.target.value })}
          />
          </label>
          <button type="button" className="rhRefreshBtn" onClick={onRefreshNodes} disabled={nodesLoading}>
            {nodesLoading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
            Reload
          </button>
        </div>
      </div>

      {nodesError ? <div className="rhPanelError">{nodesError}</div> : null}

      <div className="formStack rhFormStack">
        {nodesLoading && !nodes.length ? (
          <div className="rhPanelLoading">
            <Loader2 size={20} className="spin" />
            <span>Đang lấy nodeInfoList từ RunningHub...</span>
          </div>
        ) : null}
        {nodes.map(node => (
          <RunningHubField
            key={`${node.nodeId}-${node.fieldName}`}
            node={node}
            value={values[`${node.nodeId}|${node.fieldName}`]}
            onChange={next => onValuesChange(current => ({ ...current, [`${node.nodeId}|${node.fieldName}`]: next }))}
            inputImages={inputImages}
            onRefreshInputImages={onRefreshInputImages}
            onUpdateInputImages={onUpdateInputImages}
          />
        ))}
        {!nodesLoading && !nodes.length ? (
          <div className="rhPanelEmpty">
            <Cloud size={28} />
            <p>Nhập API Key trong Settings rồi bấm &quot;Tải lại node&quot;.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
