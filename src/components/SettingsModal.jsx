import {
  ChevronsUpDown,
  Loader2,
  Palette,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { ConnectionPanel, SavedServerList, AddServerForm } from "./ConnectionPanel";
import { RunningHubSettings } from "./RunningHubSettings";
import { ComfyUiLogomark } from "./icons/ComfyUiIcon";
import { RunningHubLogomark } from "./icons/RunningHubIcon";
import {
  COLORFUL_THEME_OPTIONS,
  MAIN_FONT_OPTIONS,
  PRO_THEME_OPTIONS
} from "../constants/appearance";
import { useI18n } from "../i18n/I18nContext";

export function SettingsModal({
  open,
  onClose,
  settingsTab,
  setSettingsTab,
  theme,
  setTheme,
  themeMenuOpen,
  setThemeMenuOpen,
  selectedThemeOption,
  mainFont,
  setMainFont,
  languagePreference,
  setLanguagePreference,
  healthStatus,
  showServerDetails,
  setShowServerDetails,
  notifyEnabled,
  setNotifyEnabled,
  comfyAddress,
  setComfyAddress,
  serverAddress,
  discovery,
  discoveryLoading,
  discoverySystem,
  discoveryDevice,
  serverDetailRows,
  formatBytes,
  getServers,
  addServer,
  removeServer,
  addServerOpen,
  setAddServerOpen,
  rhSettings,
  updateRhSettings,
  handleRhTestConnection,
  rhTesting,
  rhTestResult,
  rhAccount,
  rhAccountLoading,
  rhAccountError,
  handleRhAccountRefresh,
  setRhTestResult,
  setRhAccount,
  setRhAccountError
}) {
  const { t } = useI18n();

  if (!open) return null;

  const healthLabel = healthStatus === "online"
    ? t("health.online")
    : healthStatus === "loading"
      ? t("health.connectingShort")
      : t("health.offline");

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="settingsModal appSettingsModal" role="dialog" aria-modal="true" aria-label={t("settings.title")} onMouseDown={event => event.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <h2>{t("settings.title")}</h2>
            <p>{t("settings.description")}</p>
          </div>
          <button className="modalClose" onClick={onClose} title={t("common.close")}><X size={18} /></button>
        </div>

        <div className="appSettingsBody">
          <nav className="settingsTabs" role="tablist" aria-label={t("settings.sections")}>
            <button type="button" role="tab" aria-selected={settingsTab === "appearance"} className={settingsTab === "appearance" ? "active" : ""} onClick={() => setSettingsTab("appearance")}>
              <Palette size={17} />
              <span>
                <b>{t("settings.appearance")}</b>
                <small>{t("settings.appearanceHint")}</small>
              </span>
            </button>
            <button type="button" role="tab" aria-selected={settingsTab === "comfy"} className={`settingsTabComfy ${settingsTab === "comfy" ? "active" : ""}`} onClick={() => setSettingsTab("comfy")}>
              <ComfyUiLogomark size={22} title="ComfyUI" />
              <span>
                <b>ComfyUI Server</b>
                <small>{healthLabel}</small>
              </span>
              <i className={`settingsTabStatus health-${healthStatus}`} aria-hidden="true" />
            </button>
            <button type="button" role="tab" aria-selected={settingsTab === "runninghub"} className={settingsTab === "runninghub" ? "active" : ""} onClick={() => setSettingsTab("runninghub")}>
              <RunningHubLogomark size={22} title="RunningHub" compact />
              <span>
                <b>RunningHub</b>
                <small>{t("settings.rhDesc")}</small>
              </span>
            </button>
          </nav>

          <div className="settingsTabContent">
            {settingsTab === "appearance" ? (
              <section className="settingsPane" role="tabpanel">
                <header className="settingsPaneHeader">
                  <h3>{t("settings.appearance")}</h3>
                  <p>{t("settings.appearanceDesc")}</p>
                </header>
                <div className="settingsPaneFields">
                  <div className="field themeSelectField">
                    <span>{t("settings.theme")}</span>
                    <div className={`themeSelectWrap ${themeMenuOpen ? "open" : ""}`} style={{ "--theme-swatch": selectedThemeOption.swatch }}>
                      <button type="button" className="themeSelectButton" onClick={() => setThemeMenuOpen(current => !current)} aria-haspopup="listbox" aria-expanded={themeMenuOpen}>
                        <span className="themeSwatch" aria-hidden="true" />
                        <span>{selectedThemeOption.label}</span>
                        <ChevronsUpDown size={17} />
                      </button>
                      {themeMenuOpen ? (
                        <div className="themeMenu" role="listbox" aria-label="Theme">
                          {PRO_THEME_OPTIONS.map(option => (
                            <button key={option.id} type="button" role="option" aria-selected={theme === option.id}
                              className={`themeMenuItem ${theme === option.id ? "active" : ""}`}
                              style={{ "--theme-swatch": option.swatch }}
                              onClick={() => { setTheme(option.id); setThemeMenuOpen(false); }}>
                              <span className="themeSwatch" aria-hidden="true" />
                              <span>{option.label}</span>
                            </button>
                          ))}
                          <div className="themeMenuDivider" role="presentation">{t("settings.colorful")}</div>
                          {COLORFUL_THEME_OPTIONS.map(option => (
                            <button key={option.id} type="button" role="option" aria-selected={theme === option.id}
                              className={`themeMenuItem ${theme === option.id ? "active" : ""}`}
                              style={{ "--theme-swatch": option.swatch }}
                              onClick={() => { setTheme(option.id); setThemeMenuOpen(false); }}>
                              <span className="themeSwatch" aria-hidden="true" />
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <label className="field">
                    <span>{t("settings.font")}</span>
                    <select value={mainFont} onChange={event => setMainFont(event.target.value)}>
                      {MAIN_FONT_OPTIONS.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>{t("language.label")}</span>
                    <select value={languagePreference} onChange={event => setLanguagePreference(event.target.value)}>
                      <option value="auto">{t("language.auto")}</option>
                      <option value="vi">{t("language.vi")}</option>
                      <option value="en">{t("language.en")}</option>
                    </select>
                  </label>
                </div>
              </section>
            ) : null}

            {settingsTab === "comfy" ? (
              <section className="settingsPane comfySettingsPane" role="tabpanel">
                <header className="settingsPaneHeader settingsPaneHeaderWithStatus">
                  <div className="comfySettingsHeading">
                    <div>
                      <h3>ComfyUI Server</h3>
                      <p>{t("settings.comfyDesc")}</p>
                    </div>
                  </div>
                  <div className={`healthBadge health-${healthStatus}`}>
                    {healthStatus === "loading" ? <Loader2 size={11} className="spin" /> :
                     healthStatus === "online" ? <Wifi size={11} /> : <WifiOff size={11} />}
                    <span>{healthStatus === "online" ? t("health.online") : healthStatus === "loading" ? t("health.connecting") : t("health.offline")}</span>
                  </div>
                </header>
                <div className="settingsInlineOptions">
                  <label className="serverDetailToggle">
                    <input type="checkbox" checked={showServerDetails} onChange={event => setShowServerDetails(event.target.checked)} />
                    <span>{t("server.details")}</span>
                  </label>
                  <label className="serverDetailToggle" title={typeof Notification !== "undefined" && Notification.permission === "denied"
                    ? t("settings.notifyBlocked")
                    : t("settings.notifyHint")}>
                    <input
                      type="checkbox"
                      checked={notifyEnabled}
                      onChange={async event => {
                        const next = event.target.checked;
                        if (next && typeof Notification !== "undefined" && Notification.permission !== "granted") {
                          const perm = await Notification.requestPermission();
                          if (perm !== "granted") return;
                        }
                        setNotifyEnabled(next);
                      }}
                    />
                    <span>{t("server.notifications")}</span>
                  </label>
                </div>
                <ConnectionPanel comfyAddress={comfyAddress} serverAddress={serverAddress} onAddressChange={setComfyAddress} />
                <div className="note serverDiscoverySummary">
                  {discoveryLoading ? (
                    <span>{t("server.scanning")}</span>
                  ) : discovery ? (
                    <span>
                      ComfyUI {discoverySystem?.comfyui_version || "unknown"} · {discoveryDevice?.type || "device unknown"}
                      {discoveryDevice?.vram_free ? ` · ${t("server.freeVram", { value: formatBytes(discoveryDevice.vram_free) })}` : ""}
                      {discovery.cached ? ` · ${t("server.cache")}` : ""}
                      <br />
                      {discovery.nodeTypes?.length || 0} node · {discovery.dynamicChoices?.checkpoints?.length || 0} checkpoints · {discovery.dynamicChoices?.loras?.length || 0} loras · {discovery.dynamicChoices?.controlnets?.length || 0} controlnets
                    </span>
                  ) : (
                    <span>{t("server.noDiscovery")}</span>
                  )}
                </div>
                {showServerDetails ? (
                  <div className="serverDetailTable" role="table" aria-label={t("serverDetail.table")}>
                    {serverDetailRows.length ? serverDetailRows.map(([label, value]) => (
                      <div className="serverDetailRow" role="row" key={label}>
                        <span role="cell">{label}</span>
                        <b role="cell">{String(value)}</b>
                      </div>
                    )) : (
                      <div className="serverDetailEmpty">{t("server.noDetails")}</div>
                    )}
                  </div>
                ) : null}
                <SavedServerList
                  servers={getServers()}
                  currentAddress={comfyAddress}
                  onSwitch={addr => { setComfyAddress(addr); }}
                  onRemove={removeServer}
                />
                {addServerOpen ? (
                  <AddServerForm
                    onAdd={(label, address) => { addServer(label, address); setAddServerOpen(false); }}
                    onCancel={() => setAddServerOpen(false)}
                  />
                ) : (
                  <button className="addServerToggleBtn" onClick={() => setAddServerOpen(true)}>
                    {t("server.saveAddress")}
                  </button>
                )}
              </section>
            ) : null}

            {settingsTab === "runninghub" ? (
              <section className="settingsPane" role="tabpanel">
                <RunningHubSettings
                  settings={rhSettings}
                  onChange={patch => {
                    updateRhSettings(patch);
                    setRhTestResult(null);
                    setRhAccount(null);
                    setRhAccountError("");
                  }}
                  onTestConnection={handleRhTestConnection}
                  testing={rhTesting}
                  testResult={rhTestResult}
                  account={rhAccount}
                  accountLoading={rhAccountLoading}
                  accountError={rhAccountError}
                  onRefreshAccount={handleRhAccountRefresh}
                />
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
