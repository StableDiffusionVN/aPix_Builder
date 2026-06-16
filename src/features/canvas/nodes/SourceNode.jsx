import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Binary, CheckSquare, Database, Hash, Image as ImageIcon, List, Trash2, Type } from "lucide-react";
import { NodeField } from "../NodeField.jsx";
import { CanvasNodeFrame } from "../CanvasNodeFrame.jsx";
import { buildNodeContextMenuItems } from "../canvasMenuHelpers.js";
import { resolveEffectiveNodeOutputUrl, withImageCacheBust } from "../canvasModel.js";
import { useCanvasActions } from "../canvasContext.js";

const SOURCE_META = {
  image: { label: "Ảnh", title: "Image input", Icon: ImageIcon },
  text: { label: "Text", title: "Text input", Icon: Type },
  number: { label: "Số", title: "Number input", Icon: Hash },
  boolean: { label: "Boolean", title: "Boolean input", Icon: CheckSquare },
  choice: { label: "Menu", title: "Choice input", Icon: List },
  any: { label: "Giá trị", title: "Value input", Icon: Binary }
};

function SourceNodeComponent({ id, data, selected }) {
  const {
    updateNodeValues,
    removeNode,
    removeEdge,
    openContextMenu,
    nodes,
    edges
  } = useCanvasActions();
  const sourceType = data.sourceType || data.port?.type || "any";
  const uiType = String(data.port?.uiType || "").toLowerCase();
  const hasChoices = Boolean(data.port?.choices?.length);
  const meta = SOURCE_META[sourceType] || SOURCE_META.any;
  const Icon = hasChoices ? List : (uiType === "checkpoints" || uiType === "checkpoint" || uiType === "loras" || uiType === "lora")
    ? Database
    : meta.Icon;
  const isPassthrough = Boolean(data.passthroughFromOutput);
  const badgeLabel = isPassthrough
    ? "Output"
    : hasChoices
    ? "Menu"
    : uiType === "checkpoints" || uiType === "checkpoint"
      ? "Checkpoint"
      : uiType === "loras" || uiType === "lora"
        ? "Lora"
        : uiType === "int"
          ? "Số nguyên"
          : uiType === "float"
            ? "Số thực"
            : meta.label;
  const value = data.values?.main;
  const node = nodes?.find(item => item.id === id);
  const incoming = (edges || []).find(edge => edge.target === id && edge.targetHandle === "in:main");
  const upstreamPreviewUrl = isPassthrough && incoming
    ? resolveEffectiveNodeOutputUrl(incoming.source, incoming.sourceHandle, nodes || [], edges || [])
    : "";
  const [previewSize, setPreviewSize] = useState(null);
  const previewUrl = upstreamPreviewUrl
    ? withImageCacheBust(upstreamPreviewUrl, upstreamPreviewUrl)
    : "";
  const fieldPort = {
    label: data.name || meta.label,
    type: sourceType,
    uiType: data.port?.uiType,
    choices: data.port?.choices,
    menuLabelSyntax: data.port?.menuLabelSyntax,
    minimum: data.port?.minimum,
    maximum: data.port?.maximum,
    step: data.port?.step
  };

  return (
    <CanvasNodeFrame
      id={id}
      data={data}
      selected={selected}
      className="canvasSourceNode"
      onContextMenu={event => openContextMenu?.(event, buildNodeContextMenuItems({
        node,
        edges: edges || [],
        removeNode,
        removeEdge
      }))}
    >
      <header className="canvasNodeHeader">
        <span className="canvasKindBadge kind-source">
          <Icon size={11} />
          {badgeLabel}
        </span>
        <span className="canvasNodeTitle">{data.name || meta.title}</span>
        <button type="button" className="canvasNodeBtn danger" title="Xóa node" onClick={() => removeNode(id)}>
          <Trash2 size={12} />
        </button>
      </header>

      <div className="canvasNodeBody nowheel">
        {isPassthrough ? (
          <div className="canvasInputRow hasHandle hasOutputHandle">
            <Handle
              type="target"
              position={Position.Left}
              id="in:main"
              className={`canvasHandle in type-${sourceType}`}
              isConnectable
            />
            <div className="canvasField">
              <span className="canvasFieldLabel">{data.name || meta.label}</span>
              {previewUrl ? (
                <div className="canvasImageThumb">
                  <img
                    src={previewUrl}
                    alt={data.name || meta.label}
                    draggable="false"
                    onLoad={event => {
                      const { naturalWidth, naturalHeight } = event.currentTarget;
                      setPreviewSize(naturalWidth && naturalHeight
                        ? { width: naturalWidth, height: naturalHeight }
                        : null);
                    }}
                  />
                  {previewSize ? (
                    <div
                      className="imageSizeBadge"
                      title={`${data.name || meta.label}: ${previewSize.width} x ${previewSize.height}`}
                    >
                      {previewSize.width} x {previewSize.height}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="canvasImageLinked">
                  <span>Chờ output từ node trước</span>
                </div>
              )}
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id="out:main"
              className={`canvasHandle out type-${sourceType}`}
              isConnectable
            />
          </div>
        ) : (
          <div className="canvasInputRow hasOutputHandle">
            <NodeField
              port={fieldPort}
              value={value}
              onChange={next => updateNodeValues(id, { main: next })}
            />
            <Handle
              type="source"
              position={Position.Right}
              id="out:main"
              className={`canvasHandle out type-${sourceType}`}
              isConnectable
            />
          </div>
        )}
      </div>
    </CanvasNodeFrame>
  );
}

export const SourceNode = memo(SourceNodeComponent);
