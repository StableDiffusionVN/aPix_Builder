import { Suspense } from "react";
import {
  ImageEditorModal,
  SettingsModal,
  TemplateEditorModal
} from "../../components/lazyModals";
import { SettingsModalProvider } from "../../providers/SettingsModalProvider.jsx";
import { WorkspaceInfoModal } from "./WorkspaceInfoModal.jsx";

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

      <WorkspaceInfoModal
        open={infoOpen}
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
