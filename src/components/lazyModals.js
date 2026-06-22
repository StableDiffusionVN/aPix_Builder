import { lazy } from "react";

function withModalStyles(loadModule) {
  return Promise.all([
    import("../styles/modals.css"),
    loadModule()
  ]).then(([, module]) => module);
}

export const ImageEditorModal = lazy(() =>
  withModalStyles(() => import("./ImageEditorModal.jsx")).then(m => ({ default: m.ImageEditorModal }))
);

export const TemplateEditorModal = lazy(() =>
  withModalStyles(() => import("./TemplateEditorModal.jsx")).then(m => ({ default: m.TemplateEditorModal }))
);

export const RunLogPanel = lazy(() =>
  withModalStyles(() => import("./RunLogPanel.jsx")).then(m => ({ default: m.RunLogPanel }))
);

const loadSettingsModal = () => withModalStyles(() => import("./SettingsModal.jsx"));

export const WorkspaceInfoModal = lazy(() =>
  withModalStyles(() => import("../features/app/WorkspaceInfoModal.jsx"))
    .then(m => ({ default: m.WorkspaceInfoModal }))
);

export const SettingsModal = lazy(() =>
  loadSettingsModal().then(m => ({ default: m.SettingsModal }))
);

export function preloadSettingsModal() {
  void loadSettingsModal();
}
