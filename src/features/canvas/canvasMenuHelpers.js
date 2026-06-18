import {
  coerceImageRef,
  imageDisplayUrl,
  incomingEdgesByInput,
  nodeOutputUrl,
  nodeOutputValue,
  resolveEffectiveImageSource,
  resolveEffectiveNodeOutputUrl,
  portTypeForUi
} from "./canvasModel.js";
import { downloadImage } from "../../lib/download.js";
import { isStepOutputDetached } from "./canvasNodeLayout.js";

function imageFilename(url, fallback) {
  if (!url) return fallback;
  try {
    const parsed = new URL(url, "http://localhost");
    const named = parsed.searchParams.get("name");
    if (named) return named;
    const basename = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    return basename.includes(".") ? basename : fallback;
  } catch {
    return fallback;
  }
}

export function buildNodeContextMenuItems({
  node,
  nodes = [],
  edges,
  runNode,
  removeNode,
  toggleNodeBypass,
  removeEdge,
  convertOutputToSource
}) {
  if (!node) return [];

  const items = [];

  if (node.type === "step") {
    items.push({
      id: "run",
      label: "Chạy node",
      disabled: node.data?.status === "running",
      onClick: () => runNode?.(node.id)
    });
    items.push({
      id: "bypass",
      label: node.data?.bypassed ? "Bỏ bypass" : "Bypass node",
      onClick: () => toggleNodeBypass?.(node.id)
    });
    const outputs = node.data?.ports?.outputs || [];
    if (outputs.length && !isStepOutputDetached(node.id, outputs[0].key, nodes, edges || [])) {
      items.push({
        id: "convert-output-source",
        label: "Tách thành node Ảnh",
        onClick: () => convertOutputToSource?.(node.id, outputs[0].key)
      });
    }
  }

  if (node.type === "source") {
    const outgoing = edges.filter(edge => edge.source === node.id);
    items.push({
      id: "disconnect-out",
      label: "Ngắt kết nối output",
      disabled: !outgoing.length,
      onClick: () => outgoing.forEach(edge => removeEdge?.(edge.id))
    });
  }

  items.push({
    id: "delete",
    label: "Xóa node",
    danger: true,
    onClick: () => removeNode?.(node.id)
  });

  return items;
}

export function buildFieldContextMenuItems({
  node,
  port,
  linked,
  edges,
  nodes,
  value,
  convertInputToSource,
  disconnectTargetPort
}) {
  if (!node || !port) return [];

  const valueKey = port.valueKey || port.key;
  const incoming = edges.find(edge => (
    edge.target === node.id && edge.targetHandle === `in:${valueKey}`
  ));

  const items = [];
  const type = port.type || portTypeForUi(port.uiType);

  if (type === "image") {
    const source = incoming
      ? nodes?.find(item => item.id === incoming.source)
      : null;
    const imageUrl = incoming
      ? resolveEffectiveNodeOutputUrl(incoming.source, incoming.sourceHandle, nodes, edges)
      : imageDisplayUrl(value);

    if (imageUrl) {
      items.push({
        id: "save-input-image",
        label: "Lưu ảnh",
        onClick: async () => {
          try {
            await downloadImage({
              url: imageUrl,
              filename: imageFilename(imageUrl, `input-${Date.now()}.png`)
            });
          } catch (error) {
            console.error("Could not save canvas input image:", error);
          }
        }
      });
    }
  }

  if (linked || incoming) {
    items.push({
      id: "disconnect",
      label: "Ngắt kết nối pipe",
      onClick: () => disconnectTargetPort?.(node.id, valueKey)
    });
  }

  if (node.type === "step") {
    const sourceLabel = {
      image: "Ảnh",
      text: "Text",
      number: String(port.uiType || "").toLowerCase() === "int" ? "Số nguyên" : "Số",
      boolean: "Boolean",
      choice: port.label || "Menu",
      any: port.label || "Giá trị"
    }[type] || port.label || "Giá trị";
    items.push({
      id: "convert-source",
      label: `Tách thành node ${sourceLabel}`,
      onClick: () => convertInputToSource?.(node.id, valueKey)
    });
  }

  return items;
}

export function buildPreviewContextMenuItems({
  node,
  nodes = [],
  disconnectTargetPort,
  edges,
  imageUrl,
  outputFilename = "",
  inputImageUrl = "",
  convertOutputToSource,
  outputKey = "main"
}) {
  if (!node || node.type !== "step") return [];

  const items = [{
    id: "save-image",
    label: "Lưu ảnh",
    disabled: !imageUrl,
    onClick: async () => {
      try {
        await downloadImage({
          url: imageUrl,
          filename: outputFilename || imageFilename(imageUrl, `output-${Date.now()}.png`)
        });
      } catch (error) {
        console.error("Could not save canvas image:", error);
      }
    }
  }, {
    id: "convert-output-source",
    label: "Tách thành node Ảnh",
    disabled: isStepOutputDetached(node.id, outputKey, nodes, edges || []),
    onClick: () => convertOutputToSource?.(node.id, outputKey)
  }];

  if (inputImageUrl && inputImageUrl !== imageUrl) {
    items.push({
      id: "save-input-image",
      label: "Lưu ảnh input",
      onClick: async () => {
        try {
          await downloadImage({
            url: inputImageUrl,
            filename: imageFilename(inputImageUrl, `input-${Date.now()}.png`)
          });
        } catch (error) {
          console.error("Could not save canvas input image:", error);
        }
      }
    });
  }

  const incoming = edges.filter(edge => edge.target === node.id);
  if (incoming.length) {
    items.push({
      id: "disconnect-all",
      label: "Ngắt tất cả kết nối vào node",
      onClick: () => {
        incoming.forEach(edge => disconnectTargetPort?.(edge.target, edge.targetHandle?.slice(3)));
      }
    });
  }

  return items;
}

export function buildPassthroughPreviewContextMenuItems({
  passthroughNode,
  imageUrl,
  outputFilename = "",
  inputImageUrl = "",
  edges = [],
  removeEdge
}) {
  if (!passthroughNode || passthroughNode.type !== "source") return [];

  const items = [{
    id: "save-image",
    label: "Lưu ảnh",
    disabled: !imageUrl,
    onClick: async () => {
      try {
        await downloadImage({
          url: imageUrl,
          filename: outputFilename || imageFilename(imageUrl, `output-${Date.now()}.png`)
        });
      } catch (error) {
        console.error("Could not save canvas passthrough image:", error);
      }
    }
  }];

  if (inputImageUrl && inputImageUrl !== imageUrl) {
    items.push({
      id: "save-input-image",
      label: "Lưu ảnh input",
      onClick: async () => {
        try {
          await downloadImage({
            url: inputImageUrl,
            filename: imageFilename(inputImageUrl, `input-${Date.now()}.png`)
          });
        } catch (error) {
          console.error("Could not save canvas input image:", error);
        }
      }
    });
  }

  const outgoing = (edges || []).filter(edge => edge.source === passthroughNode.id);
  if (outgoing.length) {
    items.push({
      id: "disconnect-out",
      label: "Ngắt kết nối output",
      onClick: () => outgoing.forEach(edge => removeEdge?.(edge.id))
    });
  }

  return items;
}

export function buildEdgeContextMenuItems({ edge, removeEdge }) {
  if (!edge) return [];
  return [{
    id: "disconnect",
    label: "Ngắt kết nối",
    onClick: () => removeEdge?.(edge.id)
  }];
}

export function resolveOutputValueForSource(node, outputKey = "main") {
  const port = (node.data?.ports?.outputs || []).find(item => item.key === outputKey);
  if (!port) return { sourceType: "image", value: "", imageUrl: "", label: "Output", port: { type: "image" } };

  const sourceType = port.type || portTypeForUi(port.uiType) || "image";
  const rawValue = nodeOutputValue(node, `out:${outputKey}`);
  const coerced = coerceImageRef(rawValue);
  const imageUrl = sourceType === "image" ? (imageDisplayUrl(coerced) || coerced) : "";
  const value = sourceType === "image" ? (coerced || "") : rawValue;

  return {
    sourceType,
    value,
    imageUrl,
    label: port.label || "Output",
    port: {
      type: sourceType,
      uiType: port.uiType,
      choices: port.choices,
      menuLabelSyntax: port.menuLabelSyntax,
      minimum: port.minimum,
      maximum: port.maximum,
      step: port.step
    }
  };
}

export function resolveFieldValueForSource(node, valueKey, nodes, edges) {
  const port = (node.data?.ports?.inputs || []).find(item => item.valueKey === valueKey);
  if (!port) return { sourceType: "image", value: "" };

  const sourceType = port.type || portTypeForUi(port.uiType);
  const incoming = incomingEdgesByInput(node.id, edges)[valueKey];
  let value = node.data?.values?.[valueKey] ?? "";

  if (incoming) {
    const resolved = resolveEffectiveImageSource(incoming.source, incoming.sourceHandle, nodes, edges);
    const upstream = resolved?.node || nodes.find(item => item.id === incoming.source);
    if (upstream?.type === "source") {
      value = upstream.data?.values?.main ?? value;
    } else {
      value = nodeOutputUrl(upstream, resolved?.sourceHandle || incoming.sourceHandle) || value;
    }
  } else {
    value = imageDisplayUrl(value) || value;
  }

  return {
    sourceType,
    value,
    label: port.label || "Input",
    port: {
      type: sourceType,
      uiType: port.uiType,
      choices: port.choices,
      menuLabelSyntax: port.menuLabelSyntax,
      minimum: port.minimum,
      maximum: port.maximum,
      step: port.step
    }
  };
}
