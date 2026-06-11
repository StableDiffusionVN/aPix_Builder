import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, Settings2, Wifi, WifiOff } from "lucide-react";
import { RunningHubField } from "./RunningHubField";
import { ComfyUiLogomark } from "./icons/ComfyUiIcon";
import { RunningHubLogomark } from "./icons/RunningHubIcon";
import { RUNNINGHUB_APP_OPTIONS } from "../hooks/useRunningHub";
import { useI18n } from "../i18n/I18nContext";

const EXECUTION_MODE_OPTIONS = [
  { id: "local", label: "ComfyUI", icon: ComfyUiLogomark, iconTitle: "ComfyUI" },
  { id: "runninghub-wf", label: "RH Workflow", title: "RunningHub Workflow", icon: RunningHubLogomark, iconTitle: "RunningHub" },
  { id: "runninghub-app", label: "RH App", title: "RunningHub App", icon: RunningHubLogomark, iconTitle: "RunningHub" }
];

export function ExecutionModeToggle({ mode, onChange }) {
  const { locale } = useI18n();
  const trackRef = useRef(null);
  const buttonRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  const syncIndicator = useCallback(() => {
    const track = trackRef.current;
    const button = buttonRefs.current[mode];
    if (!track || !button) return;
    const trackRect = track.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    setIndicator({
      left: buttonRect.left - trackRect.left,
      width: buttonRect.width,
      ready: true
    });
  }, [mode]);

  useLayoutEffect(() => {
    syncIndicator();
  }, [syncIndicator]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const observer = new ResizeObserver(syncIndicator);
    observer.observe(track);
    window.addEventListener("resize", syncIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncIndicator);
    };
  }, [syncIndicator]);

  return (
    <div className={`executionModeToggle mode-${mode}`} role="tablist" aria-label={locale === "vi" ? "Chế độ thực thi" : "Execution mode"}>
      <div className="executionModeTrack" ref={trackRef}>
        <span
          className={`executionModeIndicator ${indicator.ready ? "is-ready" : ""}`}
          style={{
            width: indicator.width,
            transform: `translateX(${indicator.left}px)`
          }}
          aria-hidden="true"
        />
        {EXECUTION_MODE_OPTIONS.map(option => {
          const Icon = option.icon;
          return (
          <button
            key={option.id}
            type="button"
            role="tab"
            ref={node => {
              buttonRefs.current[option.id] = node;
            }}
            aria-selected={mode === option.id}
            className={`${mode === option.id ? "active" : ""}${Icon ? " hasModeIcon" : ""}`}
            title={option.title}
            onClick={() => onChange(option.id)}
          >
            {Icon ? (
              <Icon
                size={option.id === "local" ? 14 : 12}
                className="executionModeIcon"
                title={option.iconTitle}
              />
            ) : null}
            {option.label}
          </button>
          );
        })}
      </div>
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
  const { t } = useI18n();
  const connected = Boolean(nodes.length && !nodesError);
  const healthStatus = nodesLoading ? "loading" : connected ? "online" : "offline";
  const selectedPresetId = RUNNINGHUB_APP_OPTIONS.some(app => app.id === settings.webappId)
    ? settings.webappId
    : "custom";

  return (
    <section className="settingsGroup runningHubPanel">
      <div className="settingsHeader">
        <Settings2 size={16} />
        <h2>RunningHub App</h2>
        <span className={`healthDot health-${healthStatus}`} title={
          healthStatus === "online" ? t("rh.connected") :
          healthStatus === "loading" ? t("rh.loadingNodes") : t("rh.disconnected")
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
            <option value="custom">{t("rh.customId")}</option>
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
            {t("rh.reload")}
          </button>
        </div>
      </div>

      {nodesError ? <div className="rhPanelError">{nodesError}</div> : null}

      <div className="formStack rhFormStack">
        {nodesLoading && !nodes.length ? (
          <div className="rhPanelLoading">
            <Loader2 size={20} className="spin" />
            <span>{t("rh.fetching")}</span>
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
            <RunningHubLogomark size={28} title="RunningHub" />
            <p>{t("rh.empty")}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
