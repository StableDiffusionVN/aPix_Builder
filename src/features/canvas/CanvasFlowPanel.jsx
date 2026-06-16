import { MiniMap, Panel, useReactFlow, useViewport } from "@xyflow/react";
import { Hand, Map, Maximize2, Minus, MousePointer2, Plus, ScrollText } from "lucide-react";

const ZOOM_EPSILON = 0.001;

function minimapNodeColor(node) {
  if (node.type === "source") return "rgba(148, 163, 184, 0.7)";
  if (node.data?.status === "done") return "rgba(96, 165, 250, 0.9)";
  if (node.data?.status === "running") return "rgba(250, 204, 21, 0.9)";
  if (node.data?.status === "error") return "rgba(248, 113, 113, 0.9)";
  return "rgba(96, 165, 250, 0.6)";
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
  spaceHeld = false
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const zoomPercent = Math.round(zoom * 100);

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
          maskColor="rgba(8, 10, 16, 0.65)"
          maskStrokeColor="rgba(255, 255, 255, 0.18)"
          bgColor="rgba(10, 12, 18, 0.95)"
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
        <output className="canvasZoomValue" aria-label={`Mức zoom ${zoomPercent}%`}>
          {zoomPercent}%
        </output>
        <button
          type="button"
          className="canvasZoomBtn"
          onClick={() => zoomOut()}
          title="Thu nhỏ"
          disabled={zoom <= minZoom + ZOOM_EPSILON}
        >
          <Minus size={14} />
        </button>
        <button type="button" className="canvasZoomBtn" onClick={() => fitView({ padding: 0.2 })} title="Vừa khung">
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
      </div>
    </Panel>
  );
}
