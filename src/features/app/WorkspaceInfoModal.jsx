import { X } from "lucide-react";
import { APP_VERSION_LABEL } from "../../constants/app";
import { useI18n } from "../../i18n/I18nContext";
import { ShortcutRow } from "./AppWorkspaceRunningUi.jsx";

export function WorkspaceInfoModal({
  open,
  onClose,
  infoModeLabel,
  infoTemplateLabel,
  infoTargetLabel,
  isDesktop,
  updateChecking,
  updateCheckError,
  updateUpToDate,
  availableUpdate,
  checkForUpdates,
  downloadUpdate
}) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="modalBackdrop infoBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="settingsModal infoModal" role="dialog" aria-modal="true" aria-label={t("info.dialog")} onMouseDown={event => event.stopPropagation()}>
        <button type="button" className="modalClose infoModalClose" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
          <X size={14} />
        </button>
        <div className="modalHeader infoModalHeader">
          <div className="infoModalHeaderMain">
            <div>
              <h2 className="infoModalTitle">
                aPix Builder <span className="infoVersion">{APP_VERSION_LABEL}</span>
              </h2>
              <p className="infoModalLead">{t("info.description")}</p>
            </div>
          </div>
          <div className="infoStatusStrip" aria-label={t("info.summary")}>
            <div><span>{t("info.mode")}</span><b>{infoModeLabel}</b></div>
            <div><span>{t("info.currentTemplate")}</span><b title={infoTemplateLabel}>{infoTemplateLabel}</b></div>
            <div><span>{t("info.target")}</span><b title={infoTargetLabel}>{infoTargetLabel}</b></div>
          </div>
        </div>

        <div className="infoModalBody">
          <div className="infoFeatureBar" aria-label={t("info.update")}>
            <span className="infoFeatureBarLabel">{t("info.update")}</span>
            <ul className="infoFeatureList">
              {t("info.updateText").split(/,\s*/).filter(Boolean).map(item => (
                <li key={item}>{item.trim()}</li>
              ))}
            </ul>
          </div>

          <div className="infoMainWide">
            <section className="infoPanel infoGuidePanel" aria-label={t("info.guideTitle")}>
              <h3>{t("info.guideTitle")}</h3>
              <div className="infoGuideGrid">
                <article className="infoGuideBlock">
                  <h4>{t("info.guideQuickStart")}</h4>
                  <ol className="infoGuideList">
                    <li>{t("info.guideQuick1")}</li>
                    <li>{t("info.guideQuick2")}</li>
                    <li>{t("info.guideQuick3")}</li>
                    <li>{t("info.guideQuick4")}</li>
                    <li>{t("info.guideQuick5")}</li>
                  </ol>
                </article>
                <article className="infoGuideBlock">
                  <h4>{t("info.guideInput")}</h4>
                  <ul className="infoGuideList infoGuideListBullets">
                    <li>{t("info.guideInput1")}</li>
                    <li>{t("info.guideInput2")}</li>
                    <li>{t("info.guideInput3")}</li>
                    <li>{t("info.guideInput4")}</li>
                  </ul>
                </article>
                <article className="infoGuideBlock">
                  <h4>{t("info.guideOutput")}</h4>
                  <ul className="infoGuideList infoGuideListBullets">
                    <li>{t("info.guideOutput1")}</li>
                    <li>{t("info.guideOutput2")}</li>
                    <li>{t("info.guideOutput3")}</li>
                    <li>{t("info.guideOutput4")}</li>
                  </ul>
                </article>
                <article className="infoGuideBlock">
                  <h4>{t("info.guideModes")}</h4>
                  <ul className="infoGuideList infoGuideListBullets">
                    <li>{t("info.guideModes1")}</li>
                    <li>{t("info.guideModes2")}</li>
                    <li>{t("info.guideModes3")}</li>
                    <li>{t("info.guideModes4")}</li>
                  </ul>
                </article>
              </div>
            </section>

            <section className="infoPanel infoShortcutsPanel" aria-label={t("info.shortcutsTitle")}>
              <h3>{t("info.shortcutsTitle")}</h3>
              <div className="infoShortcutSheet infoShortcutSheetWide">
                <div className="infoShortcutGroup">
                  <h4>{t("info.shortcutsGeneral")}</h4>
                  <div className="shortcutList">
                    <ShortcutRow label={t("info.shortcutSettings")} keys={["Cmd/Ctrl", ","]} />
                    <ShortcutRow label={t("info.shortcutHelp")} keys={["Cmd/Ctrl", "/"]} />
                    <ShortcutRow label={t("info.shortcutModeComfy")} keys={["Alt/Option", "1"]} />
                    <ShortcutRow label={t("info.shortcutModeRhWf")} keys={["Alt/Option", "2"]} />
                    <ShortcutRow label={t("info.shortcutModeRhApp")} keys={["Alt/Option", "3"]} />
                    <ShortcutRow label={t("info.shortcutModeCanvas")} keys={["Alt/Option", "`"]} />
                    <ShortcutRow label={t("info.shortcutRun")} keys={["Cmd/Ctrl", "Enter"]} />
                    <ShortcutRow label={t("info.shortcutFullscreen")} keys={["Cmd/Ctrl", "Shift", "F"]} />
                    <ShortcutRow label={t("info.shortcutLog")} keys={["`"]} />
                    <ShortcutRow label={t("info.shortcutClose")} keys={["Esc"]} />
                  </div>
                </div>
                <div className="infoShortcutGroup">
                  <h4>{t("info.shortcutsPreview")}</h4>
                  <div className="shortcutList">
                    <ShortcutRow label={t("info.shortcutResetZoom")} keys={["Space"]} />
                    <ShortcutRow label={t("info.shortcutCompare")} keys={["S"]} />
                    <ShortcutRow label={t("info.shortcutOutputNav")} keys={["←", "→"]} />
                    <ShortcutRow label={t("info.shortcutColorPanel")} keys={["Tab"]} />
                    <ShortcutRow label={t("info.shortcutZoom")} keys={[t("info.mouseWheel")]} />
                    <ShortcutRow label={t("info.shortcutPan")} keys={[t("info.dragImage")]} />
                  </div>
                </div>
                <div className="infoShortcutGroup">
                  <h4>{t("info.shortcutsEditorColor")}</h4>
                  <div className="shortcutList">
                    <ShortcutRow label={t("info.shortcutBeforeAfter")} keys={["S"]} />
                    <ShortcutRow label={t("info.shortcutResetAdjustments")} keys={["Cmd/Ctrl", "Shift", "R"]} />
                    <ShortcutRow label={t("info.shortcutSpaceDual")} keys={[t("info.holdSpace")]} />
                    <ShortcutRow label={t("info.shortcutUndo")} keys={["Cmd/Ctrl", "Z"]} />
                    <ShortcutRow label={t("info.shortcutRedo")} keys={["Cmd/Ctrl", "Shift", "Z"]} />
                    <ShortcutRow label={t("info.shortcutSaveOutput")} keys={["Save"]} />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="infoPanel infoContactsPanel" aria-label={t("info.creatorSection")}>
            <h3>{t("info.project")}</h3>
            <div className="infoContactRows">
              <div className="infoContactRow">
                <span>{t("info.version")}</span>
                <b>{APP_VERSION_LABEL}</b>
              </div>
              {isDesktop ? (
                <div className="infoContactRow infoUpdateRow">
                  <span>{t("update.label")}</span>
                  <div className="infoUpdateActions">
                    <button
                      type="button"
                      className="infoUpdateButton"
                      onClick={() => { checkForUpdates(); }}
                      disabled={updateChecking}
                    >
                      {updateChecking ? t("update.checking") : t("update.checkNow")}
                    </button>
                    {updateCheckError ? (
                      <span className="infoUpdateStatus isError">{t("update.checkFailed")}</span>
                    ) : updateUpToDate ? (
                      <span className="infoUpdateStatus">{t("update.upToDate")}</span>
                    ) : availableUpdate ? (
                      <button type="button" className="infoUpdateLink" onClick={downloadUpdate}>
                        {t("update.download")} {availableUpdate.label || `v${availableUpdate.version}`}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="infoContactRow">
                <span>{t("info.officialWebsite")}</span>
                <a href="https://apix.sdvn.vn" target="_blank" rel="noreferrer">apix.sdvn.vn</a>
              </div>
              <div className="infoContactRow">
                <span>{t("info.creator")}</span>
                <a href="https://www.facebook.com/phamhungd/" target="_blank" rel="noreferrer">© Phạm Hưng</a>
              </div>
              <div className="infoContactRow">
                <span>{t("info.contact")}</span>
                <a href="https://zalo.me/0355873687" target="_blank" rel="noreferrer">0355873687</a>
              </div>
              <div className="infoContactRow">
                <span>{t("info.community")}</span>
                <a href="https://www.facebook.com/groups/stablediffusion.vn" target="_blank" rel="noreferrer">SDVN AI Art</a>
              </div>
              <div className="infoContactRow">
                <span>GitHub</span>
                <a href="https://github.com/StableDiffusionVN/" target="_blank" rel="noreferrer">StableDiffusionVN</a>
              </div>
              <div className="infoContactRow">
                <span>HuggingFace</span>
                <a href="https://huggingface.co/StableDiffusionVN/" target="_blank" rel="noreferrer">StableDiffusionVN</a>
              </div>
            </div>
            <div className="infoLinkBlocks">
              <div className="infoLinkBlock">
                <span>Website</span>
                <div className="infoLinkPills">
                  <a href="https://apix.sdvn.vn" target="_blank" rel="noreferrer">apix.sdvn.vn</a>
                  <a href="https://sdvn.vn" target="_blank" rel="noreferrer">sdvn.vn</a>
                  <a href="https://hungdiffusion.com" target="_blank" rel="noreferrer">hungdiffusion.com</a>
                  <a href="https://trainlora.vn" target="_blank" rel="noreferrer">trainlora.vn</a>
                  <a href="https://stablediffusion.vn" target="_blank" rel="noreferrer">stablediffusion.vn</a>
                  <a href="https://comfy.vn" target="_blank" rel="noreferrer">comfy.vn</a>
                </div>
              </div>
              <div className="infoLinkBlock">
                <span>{t("info.learnMore")}</span>
                <div className="infoLinkPills">
                  <a href="https://aistudio.google.com/app/u/0/apps/d798af97-ec18-4946-bce4-3b5b0e7d403e?showPreview=true&showAssistant=true&fullscreenApplet=true" target="_blank" rel="noreferrer">aPix Studio</a>
                  <a href="https://github.com/StableDiffusionVN/sdvn_apix_python" target="_blank" rel="noreferrer">aPix Python</a>
                  <a href="https://github.com/StableDiffusionVN/sdvn_apix_react" target="_blank" rel="noreferrer">aPix React</a>
                  <a href="https://sdvn.me" target="_blank" rel="noreferrer">Colab SDVN</a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
