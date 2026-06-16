import { MiniMap, Panel, useReactFlow, useViewport } from "@xyflow/react";
import { useCallback, useEffect } from "react";
import { Hand, Map, Maximize2, Minus, MousePointer2, Plus, ScrollText } from "lucide-react";
import { RunControls } from "../../components/RunControls.jsx";
import { isTypingTarget } from "../../lib/keyboard.js";
import { fitCanvasWorkflowView } from "./canvasFitView.js";

const ZOOM_EPSILON = 0.001;

function readCanvasThemeVar(name, fallback) {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function minimapNodeColor(node) {
  if (node.type === "source") {
    return readCanvasThemeVar("--canvas-minimap-node-source", "rgba(148, 163, 184, 0.7)");
  }
  if (node.data?.status === "done") {
    return readCanvasThemeVar("--canvas-minimap-node-done", "rgba(96, 165, 250, 0.9)");
  }
  if (node.data?.status === "running") {
    return readCanvasThemeVar("--canvas-minimap-node-running", "rgba(250, 204, 21, 0.9)");
  }
  if (node.data?.status === "error") {
    return readCanvasThemeVar("--canvas-minimap-node-error", "rgba(248, 113, 113, 0.9)");
  }
  return readCanvasThemeVar("--canvas-minimap-node-default", "rgba(96, 165, 250, 0.6)");
}

export function CanvasFlowPanel({
  minimapOpen,
  onToggleMinimap,
  logOpen = false,
  onToggleLog,
  logHasActivity = false,
  logBadgeCount = 0,
  minZoom = 0.1,
  maxZoom = 10,
  selectedTool = "select",
  activeTool = selectedTool,
  onToolChange,
  spaceHeld = false,
  running = false,
  canRun = false,
  canCancel = false,
  queueCount = 0,
  onRun,
  onCancel
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const zoomPercent = Math.round(zoom * 100);

  const fitWorkflowView = useCallback(() => {
    const viewport = document.querySelector(".canvasWorkspace .react-flow");
    fitCanvasWorkflowView(fitView, viewport);
  }, [fitView]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== "1" || event.repeat || isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest(
        "[role='dialog'], .imageEditorModal, .inputLibraryModal, .imageLightbox, .maskEditorModal"
      )) return;
      event.preventDefault();
      fitWorkflowView();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [fitWorkflowView]);

  return (
    <Panel position="bottom-right" className="canvasFlowPanel">
      {minimapOpen ? (
        <MiniMap
          className="canvasMinimap"
          style={{ width: 200, height: 120 }}
          pannable
          zoomable
          nodeColor={minimapNodeColor}
          nodeBorderRadius={4}
        />
      ) : null}
      <div className="canvasZoomBar" role="toolbar" aria-label="Canvas zoom">
        <button
          type="button"
          className={`canvasZoomBtn${activeTool === "select" ? " active" : ""}`}
          onClick={() => onToolChange?.("select")}
          title={`Select - kéo nền để pan, Shift-kéo để chọn vùng${spaceHeld ? " (tạm thời qua Space)" : ""}`}
          aria-label="Công cụ Select"
          aria-pressed={selectedTool === "select"}
        >
          <MousePointer2 size={14} />
        </button>
        <button
          type="button"
          className={`canvasZoomBtn${activeTool === "hand" ? " active" : ""}`}
          onClick={() => onToolChange?.("hand")}
          title={`Hand${spaceHeld ? " (tạm thời qua Space)" : ""}`}
          aria-label="Công cụ Hand"
          aria-pressed={selectedTool === "hand"}
        >
          <Hand size={14} />
        </button>
        <span className="canvasZoomDivider" aria-hidden="true" />
        <button
          type="button"
          className="canvasZoomBtn"
          onClick={() => zoomIn()}
          title="Phóng to"
          disabled={zoom >= maxZoom - ZOOM_EPSILON}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="canvasZoomValue canvasZoomValueAction"
          onContextMenu={event => {
            event.preventDefault();
            fitWorkflowView();
          }}
          title="Chuột phải hoặc phím 1: vừa khung và căn giữa quy trình"
          aria-label={`Mức zoom ${zoomPercent}%. Chuột phải hoặc phím 1 để vừa khung.`}
          aria-keyshortcuts="1"
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          className="canvasZoomBtn"
          onClick={() => zoomOut()}
          title="Thu nhỏ"
          disabled={zoom <= minZoom + ZOOM_EPSILON}
        >
          <Minus size={14} />
        </button>
        <button type="button" className="canvasZoomBtn" onClick={fitWorkflowView} title="Vừa khung (1)">
          <Maximize2 size={13} />
        </button>
        <button
          type="button"
          className={`canvasZoomBtn${minimapOpen ? " active" : ""}`}
          onClick={onToggleMinimap}
          title={minimapOpen ? "Ẩn minimap" : "Hiện minimap"}
          aria-pressed={minimapOpen}
        >
          <Map size={14} />
        </button>
        <button
          type="button"
          className={`canvasZoomBtn canvasZoomLogBtn${logOpen ? " active" : ""}${logHasActivity ? " hasActivity" : ""}`}
          onClick={onToggleLog}
          title="Run log (`)"
          aria-pressed={logOpen}
          aria-keyshortcuts="Backquote"
        >
          <ScrollText size={14} />
          {logBadgeCount > 0 ? (
            <span className="canvasZoomLogBadge">{logBadgeCount}</span>
          ) : null}
        </button>
        <span className="canvasZoomDivider" aria-hidden="true" />
        <RunControls
          running={running}
          canRun={canRun}
          canCancel={canCancel}
          queueCount={queueCount}
          onRun={onRun}
          onCancel={onCancel}
          runLabel="Run"
          compact
          stopInsideRun
        />
      </div>
    </Panel>
  );
}
