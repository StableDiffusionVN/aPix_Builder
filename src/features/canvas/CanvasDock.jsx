import { FolderKanban, History, LayoutGrid, Network, X } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";

export const CANVAS_PANELS = {
  projects: {
    id: "projects",
    labelKey: "canvas.panel.projects",
    icon: FolderKanban
  },
  library: {
    id: "library",
    labelKey: "canvas.panel.library",
    icon: LayoutGrid
  },
  nodes: {
    id: "nodes",
    labelKey: "canvas.panel.nodes",
    icon: Network
  },
  history: {
    id: "history",
    labelKey: "canvas.panel.history",
    icon: History
  }
};

export function CanvasDock({ activePanel, onSelect }) {
  const { t } = useI18n();
  return (
    <nav className="canvasDock" aria-label={t("canvas.tools")}>
      {Object.values(CANVAS_PANELS).map(panel => {
        const Icon = panel.icon;
        const isActive = activePanel === panel.id;
        const label = t(panel.labelKey);
        return (
          <button
            key={panel.id}
            type="button"
            className={`canvasDockBtn${isActive ? " active" : ""}`}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => onSelect(isActive ? null : panel.id)}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </nav>
  );
}

export function CanvasFlyoutPanel({ title, onClose, children }) {
  const { t } = useI18n();
  return (
    <aside className="canvasFlyout" aria-label={title}>
      <header className="canvasFlyoutHeader">
        <h3>{title}</h3>
        <button type="button" className="canvasNodeBtn" onClick={onClose} title={t("common.close")}>
          <X size={14} />
        </button>
      </header>
      <div className="canvasFlyoutBody">
        {children}
      </div>
    </aside>
  );
}
