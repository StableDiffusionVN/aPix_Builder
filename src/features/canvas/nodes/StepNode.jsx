import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Loader2, Play, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
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
import { useCanvasActions } from "../canvasContext.js";
import { handleNodeBodyWheel } from "../canvasWheel.js";
import { formatOutputTimingLabel } from "../../../lib/runLog.js";

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
    outputMetadataByRunId,
    nodes,
    edges
  } = useCanvasActions();
  const badge = KIND_BADGE[data.kind] || { label: data.kind, className: "" };
  const connected = connectedInputs(id);
  const inputs = data.ports?.inputs || [];
  const outputs = data.ports?.outputs || [];
  const values = data.values || {};
  const primaryOutputKey = outputs[0]?.key || "main";
  const outputDetached = isStepOutputDetached(id, primaryOutputKey, nodes || [], edges || []);
  const runCache = getNodeRunCache({ id, data, type: "step" });
  const outputUrl = runCache?.primary?.url || runCache?.outputs?.[0]?.url || "";
  const node = nodes?.find(item => item.id === id);
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
        nodes: nodes || []
      }))}
    >
      <header className="canvasNodeHeader">
        <span className={`canvasKindBadge ${badge.className}`}>{badge.label}</span>
        <span className="canvasNodeTitle" title={data.name}>{data.name}</span>
        <span className="canvasNodeStatus"><StatusIcon status={data.status} /></span>
        <button
          type="button"
          className={`canvasNodeBtn${queuedCount ? " hasQueue" : ""}`}
          title={graphRunning || data.status === "running" ? "Thêm node vào hàng chờ" : "Chạy node"}
          aria-label={queuedCount ? `Chạy node, ${queuedCount} lượt đang chờ` : "Chạy node"}
          onClick={() => runNode(id)}
        >
          <Play size={12} />
          {queuedCount ? <span className="canvasNodeQueueBadge">{queuedCount}</span> : null}
        </button>
        <button type="button" className="canvasNodeBtn danger" title="Xóa node" onClick={() => removeNode(id)}>
          <Trash2 size={12} />
        </button>
      </header>

      <div className="canvasNodeBody" onWheelCapture={handleNodeBodyWheel}>
        {inputs.map((port, index) => {
          const isLinked = Boolean(connected[port.valueKey]);
          const showOutput = index === 0 && outputs.length > 0;
          const outputPort = outputs[0];
          return (
            <div
              className={`canvasInputRow hasHandle${showOutput ? " hasOutputHandle" : ""}`}
              key={port.key}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`in:${port.valueKey}`}
                className={`canvasHandle in nodrag nopan type-${port.type}`}
                isConnectable
                title={`Nháy đúp để tách "${port.label}" thành node riêng`}
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
                  disconnectTargetPort
                }))}
              />
              {showOutput ? (
                <>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`out:${outputPort.key}`}
                    className="canvasHandle out nodrag nopan"
                    isConnectable
                    title={`Nháy đúp để tách "${outputPort.label}" thành node riêng`}
                    onDoubleClick={event => handleOutputSplit(event, outputPort.key)}
                  />
                  <span
                    className="canvasOutputHandleHit nodrag nopan"
                    title={`Nháy đúp để tách "${outputPort.label}" thành node riêng`}
                    onDoubleClick={event => handleOutputSplit(event, outputPort.key)}
                  />
                </>
              ) : null}
            </div>
          );
        })}
        {!inputs.length && outputs.length ? (
          <div className="canvasInputRow hasOutputHandle">
            <div className="canvasField">
              <span className="canvasFieldLabel">{outputs[0].label}</span>
            </div>
            {outputs.map(port => (
              <Handle
                key={port.key}
                type="source"
                position={Position.Right}
                id={`out:${port.key}`}
                className="canvasHandle out nodrag nopan"
                isConnectable
                title={`Nháy đúp để tách "${port.label}" thành node riêng`}
                onDoubleClick={event => handleOutputSplit(event, port.key)}
              />
            ))}
            <span
              className="canvasOutputHandleHit nodrag nopan"
              title={`Nháy đúp để tách "${outputs[0].label}" thành node riêng`}
              onDoubleClick={event => handleOutputSplit(event, outputs[0].key)}
            />
          </div>
        ) : null}
        {!inputs.length && !outputs.length ? <p className="canvasNodeEmpty">Không có input</p> : null}
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
          outputKey: primaryOutputKey
        }))}
      />
      {data.error ? <p className="canvasNodeError" title={data.error}>{data.error}</p> : null}
    </CanvasNodeFrame>
  );
}

export const StepNode = memo(StepNodeComponent);
