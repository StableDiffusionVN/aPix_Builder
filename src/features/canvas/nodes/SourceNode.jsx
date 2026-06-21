import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Binary, CheckSquare, Database, Hash, Image as ImageIcon, List, Trash2, Type } from "lucide-react";
import { NodeField } from "../NodeField.jsx";
import { CanvasNodeFrame } from "../CanvasNodeFrame.jsx";
import { CanvasNodeComparePreview } from "../CanvasNodeComparePreview.jsx";
import { buildNodeContextMenuItems, buildPassthroughPreviewContextMenuItems } from "../canvasMenuHelpers.js";
import {
  findLinkedImageSource,
  findNodeInputImageUrl,
  getNodeRunCache,
  resolveEffectiveNodeOutputUrl,
  withImageCacheBust
} from "../canvasModel.js";
import { useCanvasActions, useCanvasGraph } from "../canvasContext.js";
import { handleNodeBodyWheel } from "../canvasWheel.js";
import { formatOutputTimingLabel } from "../../../lib/runLog.js";
import { useI18n } from "../../../i18n/I18nContext.jsx";

const SOURCE_META = {
  image: { label: "Ảnh", title: "Image input", Icon: ImageIcon },
  text: { label: "Text", title: "Text input", Icon: Type },
  number: { label: "Số", title: "Number input", Icon: Hash },
  boolean: { label: "Boolean", title: "Boolean input", Icon: CheckSquare },
  choice: { label: "Menu", title: "Choice input", Icon: List },
  any: { label: "Giá trị", title: "Value input", Icon: Binary }
};

function SourceNodeComponent({ id, data, selected }) {
  const { t } = useI18n();
  const {
    updateNodeValues,
    removeNode,
    removeEdge,
    openContextMenu,
    outputMetadataByRunId
  } = useCanvasActions();
  const { nodes, edges } = useCanvasGraph();
  const sourceType = data.sourceType || data.port?.type || "any";
  const uiType = String(data.port?.uiType || "").toLowerCase();
  const hasChoices = Boolean(data.port?.choices?.length);
  const meta = SOURCE_META[sourceType] || SOURCE_META.any;
  const Icon = hasChoices ? List : (uiType === "checkpoints" || uiType === "checkpoint" || uiType === "loras" || uiType === "lora")
    ? Database
    : meta.Icon;
  const isPassthrough = Boolean(data.passthroughFromOutput);
  const badgeLabel = isPassthrough
    ? t("canvas.preview.output")
    : hasChoices
    ? "Menu"
    : uiType === "checkpoints" || uiType === "checkpoint"
      ? "Checkpoint"
      : uiType === "loras" || uiType === "lora"
        ? "Lora"
        : uiType === "int"
          ? t("canvas.node.type.integer")
          : uiType === "float"
            ? t("canvas.node.type.float")
            : sourceType === "image"
              ? t("canvas.node.type.image")
              : sourceType === "number"
                ? t("canvas.node.type.number")
                : sourceType === "any"
                  ? t("canvas.node.type.value")
                  : meta.label;
  const value = data.values?.main;
  const node = nodes?.find(item => item.id === id);
  const stepNode = isPassthrough
    ? nodes?.find(item => item.id === data.passthroughSourceNodeId)
    : null;
  const outputKey = data.passthroughOutputKey || "main";
  const stepRunCache = stepNode ? getNodeRunCache(stepNode) : null;
  const outputUrl = isPassthrough
    ? resolveEffectiveNodeOutputUrl(
      data.passthroughSourceNodeId,
      `out:${outputKey}`,
      nodes || [],
      edges || []
    )
    : "";
  const inputImageUrl = stepNode ? findNodeInputImageUrl(stepNode, nodes || [], edges || []) : "";
  const linkedSource = stepNode ? findLinkedImageSource(stepNode, nodes || [], edges || []) : null;
  const linkedCache = linkedSource ? getNodeRunCache(linkedSource) : null;
  const inputPreviewUrl = withImageCacheBust(
    inputImageUrl,
    linkedCache?.runAt || inputImageUrl
  );
  const outputPreviewUrl = withImageCacheBust(outputUrl, stepRunCache?.runAt || outputUrl);
  const historyMetadata = outputMetadataByRunId?.[stepRunCache?.runId] || {};
  const outputTimingLabel = formatOutputTimingLabel({
    durationMs: stepRunCache?.durationMs ?? historyMetadata.durationMs,
    rhCoins: stepRunCache?.rhCoins ?? historyMetadata.rhCoins,
    provider: stepRunCache?.provider || historyMetadata.provider || (
      stepNode?.data?.kind === "local" ? "local" : "runninghub"
    )
  });
  const outputFilename = stepRunCache?.outputs?.find(item => item.key === outputKey)?.filename
    || stepRunCache?.primary?.filename
    || "";
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
        removeEdge,
        t
      }))}
    >
      <header className="canvasNodeHeader">
        <span className="canvasKindBadge kind-source">
          <Icon size={11} />
          {badgeLabel}
        </span>
        <span className="canvasNodeTitle">{data.name || meta.title}</span>
        <button type="button" className="canvasNodeBtn danger" title={t("canvas.node.delete")} onClick={() => removeNode(id)}>
          <Trash2 size={12} />
        </button>
      </header>

      <div className="canvasNodeBody" onWheelCapture={handleNodeBodyWheel}>
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
              {outputPreviewUrl ? (
                <div className="canvasImageThumb">
                  <CanvasNodeComparePreview
                    embedded
                    inputUrl={inputPreviewUrl}
                    outputUrl={outputPreviewUrl}
                    outputTimingLabel={outputTimingLabel}
                    onContextMenu={(event, target) => openContextMenu?.(event, buildPassthroughPreviewContextMenuItems({
                      passthroughNode: node,
                      edges: edges || [],
                      imageUrl: target?.imageUrl || outputPreviewUrl,
                      outputFilename,
                      inputImageUrl: inputPreviewUrl,
                      removeEdge,
                      t
                    }))}
                  />
                </div>
              ) : (
                <div className="canvasImageLinked">
                  <span>{t("canvas.node.waitingOutput")}</span>
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
