import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Loader2, Lock, RefreshCcw, Settings2 } from "lucide-react";
import { RunningHubField } from "./RunningHubField";
import { ComfyUiLogomark } from "./icons/ComfyUiIcon";
import { RunningHubLogomark } from "./icons/RunningHubIcon";
import { AppleShortcutsIcon } from "./icons/AppleShortcutsIcon";
import { useI18n } from "../i18n/I18nContext";
import { isDefaultRhWebapp } from "../lib/rhSavedApps.js";

function formatRhStatValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "");
  return numeric.toLocaleString();
}

function RunningHubAppInfo({ info, t }) {
  const cover = info?.covers?.[0];
  const coverUrl = cover?.thumbnailUri || cover?.url || "";
  const stats = useMemo(() => {
    const source = info?.statisticsInfo;
    if (!source) return [];
    return [
      { key: "useCount", label: t("rh.statUses"), value: source.useCount },
      { key: "collectCount", label: t("rh.statCollects"), value: source.collectCount },
      { key: "likeCount", label: t("rh.statLikes"), value: source.likeCount },
      { key: "downloadCount", label: t("rh.statDownloads"), value: source.downloadCount }
    ].filter(item => item.value != null && String(item.value).trim() !== "");
  }, [info?.statisticsInfo, t]);

  const tags = useMemo(
    () => (info?.tags || []).map(tag => tag.nameEn || tag.name).filter(Boolean),
    [info?.tags]
  );

  if (!info?.webappName && !coverUrl && !stats.length && !tags.length) return null;

  return (
    <div className="rhAppInfo">
      {coverUrl ? (
        <div className="rhAppInfoCover">
          <img src={coverUrl} alt={info.webappName || "RunningHub App"} draggable="false" />
        </div>
      ) : null}
      <div className="rhAppInfoBody">
        <div className="rhAppInfoTitleRow">
          <strong className="rhAppInfoTitle">{info.webappName || t("rh.unnamedApp")}</strong>
          {info.accessEncrypted ? (
            <span className="rhAppInfoEncrypted" title={t("rh.accessEncrypted")}>
              <Lock size={12} />
              <span>{t("rh.accessEncryptedShort")}</span>
            </span>
          ) : null}
        </div>
        {info.webappId ? <small className="rhAppInfoId">ID {info.webappId}</small> : null}
        {stats.length ? (
          <div className="rhAppInfoStats">
            {stats.map(item => (
              <span key={item.key} className="rhAppInfoStat">
                <b>{formatRhStatValue(item.value)}</b>
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        ) : null}
        {tags.length ? (
          <div className="rhAppInfoTags">
            {tags.map(tag => (
              <span key={tag} className="rhAppInfoTag">{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const EXECUTION_MODE_OPTIONS = [
  { id: "local", label: "ComfyUI", icon: ComfyUiLogomark, iconTitle: "ComfyUI", title: "ComfyUI (Alt/Option+1)", shortcut: "Alt+1" },
  { id: "runninghub-wf", label: "RH Workflow", title: "RunningHub Workflow (Alt/Option+2)", icon: RunningHubLogomark, iconTitle: "RunningHub", shortcut: "Alt+2" },
  { id: "runninghub-app", label: "RH App", title: "RunningHub App (Alt/Option+3)", icon: RunningHubLogomark, iconTitle: "RunningHub", shortcut: "Alt+3" }
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
            aria-keyshortcuts={option.shortcut}
            onClick={() => onChange(option.id)}
          >
            {Icon ? (
              <Icon
                className="executionModeIcon"
                title={option.iconTitle}
                {...(Icon === RunningHubLogomark ? { sizedByCss: true } : { size: 12 })}
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
  webappOptions = [],
  savedWebapps = [],
  savedAppsError = "",
  onSaveWebapp,
  nodes,
  webappInfo = null,
  values,
  onValuesChange,
  nodesLoading,
  nodesError,
  onRefreshNodes,
  onExportShortcut,
  shortcutExporting = false,
  shortcutExportAvailable = false,
  inputImages,
  onRefreshInputImages,
  onUpdateInputImages
}) {
  const { t } = useI18n();
  const [saveHint, setSaveHint] = useState("");
  const selectedPresetId = webappOptions.some(app => app.id === settings.webappId)
    ? settings.webappId
    : "custom";
  const canSaveWebapp = Boolean(
    settings.webappId?.trim()
    && webappInfo?.webappName
    && webappInfo.webappId === settings.webappId.trim()
  );
  const isSavedWebapp = savedWebapps.some(app => app.id === settings.webappId?.trim());
  const isBuiltinWebapp = isDefaultRhWebapp(settings.webappId);
  const canToggleWebapp = Boolean(
    !isBuiltinWebapp
    && settings.webappId?.trim()
    && (isSavedWebapp || canSaveWebapp)
  );

  function handleSaveWebapp() {
    void (async () => {
      const result = await onSaveWebapp?.();
      if (!result) return;
      if (!result.ok) {
        setSaveHint(result.error || "");
        return;
      }
      setSaveHint(result.removed ? t("rh.appRemoved") : t("rh.appSaved"));
    })();
  }

  return (
    <section className="settingsGroup runningHubPanel">
      <div className="settingsHeader">
        <Settings2 size={16} />
        <h2>{webappInfo?.webappName || "RunningHub App"}</h2>
        <button
          type="button"
          className="rhWebappActionBtn rhExportShortcutBtn"
          onClick={onExportShortcut}
          disabled={!shortcutExportAvailable || shortcutExporting}
          title={shortcutExportAvailable ? t("rh.exportShortcut") : t("rh.exportShortcutWindowsDisabled")}
          aria-label={t("rh.exportShortcut")}
        >
          {shortcutExporting ? <Loader2 size={14} className="spin" /> : <AppleShortcutsIcon size={16} />}
        </button>
      </div>

      <div className="rhAppPicker">
        <label className="field compact">
          <span>App</span>
          <select
            value={selectedPresetId}
            onChange={event => {
              const nextId = event.target.value;
              if (nextId === "custom") return;
              setSaveHint("");
              onSettingsChange?.({ webappId: nextId });
            }}
          >
            {webappOptions.map(app => (
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
            onChange={event => {
              setSaveHint("");
              onSettingsChange?.({ webappId: event.target.value });
            }}
          />
          </label>
          <div className="rhWebappActions">
            {!isBuiltinWebapp ? (
              <button
                type="button"
                className={`rhWebappActionBtn${isSavedWebapp ? " isSaved" : ""}`}
                onClick={handleSaveWebapp}
                disabled={!canToggleWebapp}
                title={isSavedWebapp ? t("rh.removeApp") : canSaveWebapp ? t("rh.saveApp") : t("rh.saveAppNeedReload")}
                aria-label={isSavedWebapp ? t("rh.removeApp") : t("rh.saveApp")}
                aria-pressed={isSavedWebapp}
              >
                <Bookmark size={14} />
              </button>
            ) : null}
            <button
              type="button"
              className="rhWebappActionBtn"
              onClick={onRefreshNodes}
              disabled={nodesLoading}
              title={t("rh.reload")}
              aria-label={t("rh.reload")}
            >
              {nodesLoading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
            </button>
          </div>
        </div>
        {saveHint ? <small className="rhAppSaveHint">{saveHint}</small> : null}
        {savedAppsError ? <small className="rhAppSaveHint rhAppSaveHintError">{savedAppsError}</small> : null}
      </div>

      {nodesError ? <div className="rhPanelError">{nodesError}</div> : null}
      {webappInfo ? <RunningHubAppInfo info={webappInfo} t={t} /> : null}

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
