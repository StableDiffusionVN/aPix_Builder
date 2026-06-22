import { useReactFlow } from "@xyflow/react";
import { CANVAS_NODE_DEFAULT_WIDTH } from "./CanvasNodeResizeHandles.jsx";
import { AlertCircle, CheckCircle2, Image as ImageIcon, Loader2, Play, Trash2, Type } from "lucide-react";
import { STEP_KINDS } from "./canvasModel.js";
import { useI18n } from "../../i18n/I18nContext.jsx";

const KIND_LABEL = {
  [STEP_KINDS.LOCAL]: "ComfyUI",
  [STEP_KINDS.RH_WF]: "RH Workflow",
  [STEP_KINDS.RH_APP]: "RH App"
};

function StatusIcon({ status }) {
  if (status === "running") return <Loader2 size={12} className="spin" />;
  if (status === "done") return <CheckCircle2 size={12} className="canvasStatusDone" />;
  if (status === "error") return <AlertCircle size={12} className="canvasStatusError" />;
  return null;
}

function nodeLabel(node, t) {
  if (node.type === "source") {
    return node.data?.name || (node.data?.sourceType === "text" ? t("canvas.node.type.textInput") : t("canvas.node.type.imageInput"));
  }
  return node.data?.name || node.id;
}

function nodeKindLabel(node, t) {
  if (node.type === "source") return node.data?.sourceType === "text" ? "Text" : t("canvas.node.type.image");
  return KIND_LABEL[node.data?.kind] || node.data?.kind || t("canvas.node.type.step");
}

export function CanvasNodesPanel({ nodes, onRunNode, onRemoveNode }) {
  const { t } = useI18n();
  const { setCenter } = useReactFlow();

  function focusNode(node) {
    const width = CANVAS_NODE_DEFAULT_WIDTH;
    const height = 120;
    setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 1.05, duration: 280 });
  }

  if (!nodes.length) {
    return <p className="canvasFlyoutEmpty">{t("canvas.nodes.empty")}</p>;
  }

  return (
    <ul className="canvasNodesList">
      {nodes.map(node => (
        <li key={node.id} className="canvasNodesListItem">
          <button type="button" className="canvasNodesListMain" onClick={() => focusNode(node)}>
            <span className="canvasNodesListIcon">
              {node.type === "source"
                ? (node.data?.sourceType === "text" ? <Type size={13} /> : <ImageIcon size={13} />)
                : <StatusIcon status={node.data?.status} />}
            </span>
            <span className="canvasNodesListText">
              <strong>{nodeLabel(node, t)}</strong>
              <small>{nodeKindLabel(node, t)} · {node.type === "step" ? t(`canvas.node.status.${node.data?.status || "idle"}`) : t("canvas.node.type.source")}</small>
            </span>
          </button>
          {node.type === "step" ? (
            <div className="canvasNodesListActions">
              <button type="button" className="canvasNodeBtn" title={t("canvas.node.run")} onClick={() => onRunNode(node.id)}>
                <Play size={12} />
              </button>
              <button type="button" className="canvasNodeBtn danger" title={t("canvas.node.deleteShort")} onClick={() => onRemoveNode(node.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ) : (
            <button type="button" className="canvasNodeBtn danger" title={t("canvas.node.deleteShort")} onClick={() => onRemoveNode(node.id)}>
              <Trash2 size={12} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
