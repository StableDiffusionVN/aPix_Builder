import { Fragment, memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Loader2, Play, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  activeStepInputPorts,
  findLinkedImageSource,
  findNodeInputImageUrl,
  getNodeRunCache,
  withImageCacheBust
} from "../canvasModel.js";
import { NodeField } from "../NodeField.jsx";
import { CanvasNodeComparePreview } from "../CanvasNodeComparePreview.jsx";
import { CanvasNodeFrame } from "../CanvasNodeFrame.jsx";
import { isStepOutputDetached } from "../canvasNodeLayout.js";
import { buildFieldContextMenuItems, buildNodeContextMenuItems, buildPreviewContextMenuItems } from "../canvasMenuHelpers.js";
import { useCanvasActions, useCanvasGraph } from "../canvasContext.js";
import { handleNodeBodyWheel } from "../canvasWheel.js";
import { formatOutputTimingLabel } from "../../../lib/runLog.js";
import { localizeRuntimeMessage, useI18n } from "../../../i18n/I18nContext.jsx";
import {
  OUTPUT_HANDLE_GAP,
  outputColorClass
} from "../canvasOutputColors.js";

const KIND_BADGE = {
  local: { label: "ComfyUI", className: "kind-local" },
  "runninghub-wf": { label: "RH Workflow", className: "kind-rhwf" },
  "runninghub-app": { label: "RH App", className: "kind-rhapp" }
};

function StatusIcon({ status }) {
  if (status === "running") return <Loader2 size={13} className="spin" />;
  if (status === "done") return <CheckCircle2 size={13} className="canvasStatusDone" />;
  if (status === "error") return <AlertCircle size={13} className="canvasStatusError" />;
  return null;
}

function StepNodeComponent({ id, data, selected }) {
  const { locale, t } = useI18n();
  const {
    updateNodeValues,
    runNode,
    removeNode,
    removeEdge,
    disconnectTargetPort,
    toggleNodeBypass,
    convertInputToSource,
    convertOutputToSource,
    openContextMenu,
    connectedInputs,
    graphRunning,
    queuedNodeCounts,
    outputMetadataByRunId
  } = useCanvasActions();
  const { nodes, edges, nodeById } = useCanvasGraph();
  const badge = KIND_BADGE[data.kind] || { label: data.kind, className: "" };
  const connected = connectedInputs(id);
  const values = data.values || {};
  const inputs = activeStepInputPorts(data.ports?.inputs || [], values);
  const outputs = data.ports?.outputs || [];
  const primaryOutputKey = outputs[0]?.key || "main";
  const outputDetached = isStepOutputDetached(id, primaryOutputKey, nodes || [], edges || []);
  const runCache = getNodeRunCache({ id, data, type: "step" });
  const outputUrl = runCache?.outputs?.find(item => item.key === primaryOutputKey)?.url
    || runCache?.primary?.url
    || runCache?.outputs?.[0]?.url
    || "";
  const node = nodeById?.get(id);
  const inputImageUrl = findNodeInputImageUrl(node, nodes || [], edges || []);
  const linkedSource = findLinkedImageSource(node, nodes || [], edges || []);
  const linkedCache = linkedSource ? getNodeRunCache(linkedSource) : null;
  const inputPreviewUrl = withImageCacheBust(
    inputImageUrl,
    linkedCache?.runAt || inputImageUrl
  );
  const outputPreviewUrl = withImageCacheBust(outputUrl, runCache?.runAt || outputUrl);
  const historyMetadata = outputMetadataByRunId?.[runCache?.runId] || {};
  const outputTimingLabel = formatOutputTimingLabel({
    durationMs: runCache?.durationMs ?? historyMetadata.durationMs,
    rhCoins: runCache?.rhCoins ?? historyMetadata.rhCoins,
    provider: runCache?.provider || historyMetadata.provider || (
      data.kind === "local" ? "local" : "runninghub"
    )
  });
  const queuedCount = queuedNodeCounts?.[id] || 0;

  const handleOutputSplit = (event, outputKey) => {
    event.preventDefault();
    event.stopPropagation();
    convertOutputToSource(id, outputKey);
  };

  const renderOutputHandles = () => {
    if (!outputs.length) return null;
    return outputs.map((port, index) => {
      const insetSlots = outputs.length - 1 - index;
      const rightPx = insetSlots * OUTPUT_HANDLE_GAP;
      const colorClass = outputColorClass(index);
      return (
        <Fragment key={port.key}>
          <Handle
            type="source"
            position={Position.Right}
            id={`out:${port.key}`}
            className={`canvasHandle out nodrag nopan ${colorClass}`}
            style={{ right: rightPx, top: 7 }}
            isConnectable
            title={port.label || t("canvas.node.split", { name: port.key })}
            onDoubleClick={event => handleOutputSplit(event, port.key)}
          />
          <span
            className="canvasOutputHandleHit nodrag nopan"
            style={{ right: rightPx - 6 }}
            title={port.label || t("canvas.node.split", { name: port.key })}
            onDoubleClick={event => handleOutputSplit(event, port.key)}
          />
        </Fragment>
      );
    });
  };

  const menuActions = {
    node,
    edges: edges || [],
    runNode,
    removeNode,
    toggleNodeBypass,
    removeEdge,
    convertInputToSource,
    disconnectTargetPort,
    convertOutputToSource
  };

  return (
    <CanvasNodeFrame
      id={id}
      data={data}
      selected={selected}
      bypassed={Boolean(data.bypassed)}
      className={`status-${data.status || "idle"}`}
      onContextMenu={event => openContextMenu?.(event, buildNodeContextMenuItems({
        ...menuActions,
        nodes: nodes || [],
        t
      }))}
    >
      <header className="canvasNodeHeader">
        <span className={`canvasKindBadge ${badge.className}`}>{badge.label}</span>
        <span className="canvasNodeTitle" title={data.name}>{data.name}</span>
        <span className="canvasNodeStatus"><StatusIcon status={data.status} /></span>
        <button
          type="button"
          className={`canvasNodeBtn${queuedCount ? " hasQueue" : ""}`}
          title={graphRunning || data.status === "running" ? t("canvas.node.queue") : t("canvas.node.run")}
          aria-label={queuedCount ? t("canvas.node.queued", { count: queuedCount }) : t("canvas.node.run")}
          onClick={() => runNode(id)}
        >
          <Play size={12} />
          {queuedCount ? <span className="canvasNodeQueueBadge">{queuedCount}</span> : null}
        </button>
        <button type="button" className="canvasNodeBtn danger" title={t("canvas.node.delete")} onClick={() => removeNode(id)}>
          <Trash2 size={12} />
        </button>
      </header>

      <div className="canvasNodeBody" onWheelCapture={handleNodeBodyWheel}>
        {inputs.map((port, index) => {
          const isLinked = Boolean(connected[port.valueKey]);
          const showOutputs = index === 0 && outputs.length > 0;
          return (
            <div
              className={`canvasInputRow hasHandle${showOutputs ? " hasOutputHandle" : ""}`}
              key={port.key}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`in:${port.valueKey}`}
                className={`canvasHandle in nodrag nopan type-${port.type}`}
                isConnectable
                title={t("canvas.node.split", { name: port.label })}
                onDoubleClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  convertInputToSource(id, port.valueKey);
                }}
              />
              <NodeField
                port={port}
                value={values[port.valueKey]}
                linked={isLinked}
                onChange={next => updateNodeValues(id, { [port.valueKey]: next })}
                onContextMenu={event => openContextMenu?.(event, buildFieldContextMenuItems({
                  node,
                  port,
                  linked: isLinked,
                  edges: edges || [],
                  nodes: nodes || [],
                  value: values[port.valueKey],
                  convertInputToSource,
                  disconnectTargetPort,
                  t
                }))}
              />
              {showOutputs ? renderOutputHandles() : null}
            </div>
          );
        })}
        {!inputs.length && outputs.length ? (
          <div className="canvasInputRow hasOutputHandle">
            <div className="canvasField">
              <span className="canvasFieldLabel">{outputs[0].label}</span>
            </div>
            {renderOutputHandles()}
          </div>
        ) : null}
        {!inputs.length && !outputs.length ? <p className="canvasNodeEmpty">{t("canvas.node.noInput")}</p> : null}
      </div>

      <CanvasNodeComparePreview
        inputUrl={inputPreviewUrl}
        outputUrl={outputDetached ? "" : outputPreviewUrl}
        outputTimingLabel={outputTimingLabel}
        onContextMenu={(event, target) => openContextMenu?.(event, buildPreviewContextMenuItems({
          node,
          nodes: nodes || [],
          edges: edges || [],
          disconnectTargetPort,
          imageUrl: target?.imageUrl || outputPreviewUrl,
          outputFilename: runCache?.primary?.filename || "",
          inputImageUrl: inputPreviewUrl,
          convertOutputToSource,
          outputKey: primaryOutputKey,
          t
        }))}
      />
      {data.error ? (
        <p className="canvasNodeError" title={localizeRuntimeMessage(data.error, locale)}>
          {localizeRuntimeMessage(data.error, locale)}
        </p>
      ) : null}
    </CanvasNodeFrame>
  );
}

export const StepNode = memo(StepNodeComponent);
