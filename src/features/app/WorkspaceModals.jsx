import { Suspense } from "react";
import {
  ImageEditorModal,
  SettingsModal,
  TemplateEditorModal,
  WorkspaceInfoModal
} from "../../components/lazyModals";
import { SettingsModalProvider } from "../../providers/SettingsModalProvider.jsx";

export function WorkspaceModals({
  settingsOpen,
  settingsModalProviderValue,
  infoOpen,
  closeInfo,
  infoModeLabel,
  infoTemplateLabel,
  infoTargetLabel,
  isDesktop,
  updateChecking,
  updateCheckError,
  updateUpToDate,
  availableUpdate,
  checkForUpdates,
  downloadUpdate,
  templateEditorOpen,
  setTemplateEditorOpen,
  selectedTemplate,
  discovery,
  reloadTemplates,
  rhWfTemplateEditorOpen,
  setRhWfTemplateEditorOpen,
  rhWfSelectedTemplate,
  rhPrimaryApiKey,
  reloadRhWfTemplates,
  outputEditorOpen,
  setOutputEditorOpen,
  heroImage,
  handleSaveEditedOutput
}) {
  return (
    <>
      {settingsOpen ? (
        <SettingsModalProvider value={settingsModalProviderValue}>
          <Suspense fallback={null}>
            <SettingsModal />
          </Suspense>
        </SettingsModalProvider>
      ) : null}

      {infoOpen ? (
        <Suspense fallback={null}>
          <WorkspaceInfoModal
            open
            onClose={closeInfo}
            infoModeLabel={infoModeLabel}
            infoTemplateLabel={infoTemplateLabel}
            infoTargetLabel={infoTargetLabel}
            isDesktop={isDesktop}
            updateChecking={updateChecking}
            updateCheckError={updateCheckError}
            updateUpToDate={updateUpToDate}
            availableUpdate={availableUpdate}
            checkForUpdates={checkForUpdates}
            downloadUpdate={downloadUpdate}
          />
        </Suspense>
      ) : null}

      {templateEditorOpen ? (
        <Suspense fallback={null}>
          <TemplateEditorModal
            selectedTemplate={selectedTemplate}
            discovery={discovery}
            onClose={() => setTemplateEditorOpen(false)}
            onSaved={reloadTemplates}
          />
        </Suspense>
      ) : null}

      {rhWfTemplateEditorOpen ? (
        <Suspense fallback={null}>
          <TemplateEditorModal
            mode="runninghub-wf"
            selectedTemplate={rhWfSelectedTemplate}
            apiKey={rhPrimaryApiKey}
            onClose={() => setRhWfTemplateEditorOpen(false)}
            onSaved={reloadRhWfTemplates}
          />
        </Suspense>
      ) : null}

      {outputEditorOpen && heroImage ? (
        <Suspense fallback={null}>
          <ImageEditorModal
            source={heroImage}
            title="Output - Image Editor"
            onClose={() => setOutputEditorOpen(false)}
            onSave={handleSaveEditedOutput}
          />
        </Suspense>
      ) : null}
    </>
  );
}
