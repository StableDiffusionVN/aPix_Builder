import { FolderKanban, History, LayoutGrid, Network, X } from "lucide-react";

export const CANVAS_PANELS = {
  projects: {
    id: "projects",
    label: "Thư viện project",
    icon: FolderKanban
  },
  library: {
    id: "library",
    label: "Thư viện node",
    icon: LayoutGrid
  },
  nodes: {
    id: "nodes",
    label: "Node trong project",
    icon: Network
  },
  history: {
    id: "history",
    label: "Lịch sử chạy",
    icon: History
  }
};

export function CanvasDock({ activePanel, onSelect, nodeCount = 0 }) {
  return (
    <nav className="canvasDock" aria-label="Canvas tools">
      {Object.values(CANVAS_PANELS).map(panel => {
        const Icon = panel.icon;
        const isActive = activePanel === panel.id;
        return (
          <button
            key={panel.id}
            type="button"
            className={`canvasDockBtn${isActive ? " active" : ""}`}
            title={panel.label}
            aria-label={panel.label}
            aria-pressed={isActive}
            onClick={() => onSelect(isActive ? null : panel.id)}
          >
            <Icon size={18} />
            {panel.id === "nodes" && nodeCount > 0 ? (
              <span className="canvasDockBadge">{nodeCount > 99 ? "99+" : nodeCount}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function CanvasFlyoutPanel({ title, onClose, children }) {
  return (
    <aside className="canvasFlyout" aria-label={title}>
      <header className="canvasFlyoutHeader">
        <h3>{title}</h3>
        <button type="button" className="canvasNodeBtn" onClick={onClose} title="Đóng">
          <X size={14} />
        </button>
      </header>
      <div className="canvasFlyoutBody">
        {children}
      </div>
    </aside>
  );
}
