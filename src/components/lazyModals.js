import { lazy } from "react";

export const ImageEditorModal = lazy(() =>
  import("./ImageEditorModal.jsx").then(m => ({ default: m.ImageEditorModal }))
);

export const TemplateEditorModal = lazy(() =>
  import("./TemplateEditorModal.jsx").then(m => ({ default: m.TemplateEditorModal }))
);

export const RunLogPanel = lazy(() =>
  import("./RunLogPanel.jsx").then(m => ({ default: m.RunLogPanel }))
);

const loadSettingsModal = () => import("./SettingsModal.jsx");

export const SettingsModal = lazy(() =>
  loadSettingsModal().then(m => ({ default: m.SettingsModal }))
);

export function preloadSettingsModal() {
  void loadSettingsModal();
}
