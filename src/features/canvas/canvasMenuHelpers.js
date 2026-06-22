import {
  coerceImageRef,
  imageDisplayUrl,
  incomingEdgesByInput,
  nodeOutputUrl,
  nodeOutputValue,
  cloneImageValueForSource,
  resolveEffectiveImageSource,
  resolveEffectiveNodeOutputUrl,
  portTypeForUi
} from "./canvasModel.js";
import { downloadImage } from "../../lib/download.js";
import { isStepOutputDetached } from "./canvasNodeLayout.js";

function translate(t, key, fallback, variables) {
  return typeof t === "function" ? t(key, variables) : fallback;
}

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
  convertOutputToSource,
  t
}) {
  if (!node) return [];

  const items = [];

  if (node.type === "step") {
    items.push({
      id: "run",
      label: translate(t, "canvas.node.run", "Chạy node"),
      disabled: node.data?.status === "running",
      onClick: () => runNode?.(node.id)
    });
    items.push({
      id: "bypass",
      label: node.data?.bypassed
        ? translate(t, "canvas.menu.removeBypass", "Bỏ bypass")
        : translate(t, "canvas.menu.bypass", "Bypass node"),
      onClick: () => toggleNodeBypass?.(node.id)
    });
    const outputs = node.data?.ports?.outputs || [];
    for (const port of outputs) {
      if (isStepOutputDetached(node.id, port.key, nodes, edges || [])) continue;
      const splitLabel = translate(t, "canvas.menu.splitImage", "Tách thành node Ảnh");
      items.push({
        id: `convert-output-source-${port.key}`,
        label: outputs.length > 1 ? `${splitLabel}: ${port.label}` : splitLabel,
        onClick: () => convertOutputToSource?.(node.id, port.key)
      });
    }
  }

  if (node.type === "source") {
    const outgoing = edges.filter(edge => edge.source === node.id);
    items.push({
      id: "disconnect-out",
      label: translate(t, "canvas.menu.disconnectOutput", "Ngắt kết nối output"),
      disabled: !outgoing.length,
      onClick: () => outgoing.forEach(edge => removeEdge?.(edge.id))
    });
  }

  items.push({
    id: "delete",
    label: translate(t, "canvas.node.delete", "Xóa node"),
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
  disconnectTargetPort,
  t
}) {
  if (!node || !port) return [];

  const valueKey = port.valueKey || port.key;
  const incoming = edges.find(edge => (
    edge.target === node.id && edge.targetHandle === `in:${valueKey}`
  ));

  const items = [];
  const type = port.type || portTypeForUi(port.uiType);

  if (type === "image") {
    const imageUrl = incoming
      ? resolveEffectiveNodeOutputUrl(incoming.source, incoming.sourceHandle, nodes, edges)
      : imageDisplayUrl(value);

    if (imageUrl) {
      items.push({
        id: "save-input-image",
        label: translate(t, "canvas.menu.saveImage", "Lưu ảnh"),
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
      label: translate(t, "canvas.menu.disconnectPipe", "Ngắt kết nối pipe"),
      onClick: () => disconnectTargetPort?.(node.id, valueKey)
    });
  }

  if (node.type === "step") {
    const sourceLabel = {
      image: translate(t, "canvas.node.type.image", "Ảnh"),
      text: "Text",
      number: String(port.uiType || "").toLowerCase() === "int"
        ? translate(t, "canvas.node.type.integer", "Số nguyên")
        : translate(t, "canvas.node.type.number", "Số"),
      boolean: "Boolean",
      choice: port.label || "Menu",
      any: port.label || translate(t, "canvas.node.type.value", "Giá trị")
    }[type] || port.label || translate(t, "canvas.node.type.value", "Giá trị");
    items.push({
      id: "convert-source",
      label: translate(t, "canvas.menu.splitSource", `Tách thành node ${sourceLabel}`, { name: sourceLabel }),
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
  outputKey = "main",
  t
}) {
  if (!node || node.type !== "step") return [];

  const items = [{
    id: "save-image",
    label: translate(t, "canvas.menu.saveImage", "Lưu ảnh"),
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
    label: translate(t, "canvas.menu.splitImage", "Tách thành node Ảnh"),
    disabled: isStepOutputDetached(node.id, outputKey, nodes, edges || []),
    onClick: () => convertOutputToSource?.(node.id, outputKey)
  }];

  if (inputImageUrl && inputImageUrl !== imageUrl) {
    items.push({
      id: "save-input-image",
      label: translate(t, "canvas.menu.saveInputImage", "Lưu ảnh input"),
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
      label: translate(t, "canvas.menu.disconnectAllInputs", "Ngắt tất cả kết nối vào node"),
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
  removeEdge,
  t
}) {
  if (!passthroughNode || passthroughNode.type !== "source") return [];

  const items = [{
    id: "save-image",
    label: translate(t, "canvas.menu.saveImage", "Lưu ảnh"),
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
      label: translate(t, "canvas.menu.saveInputImage", "Lưu ảnh input"),
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
      label: translate(t, "canvas.menu.disconnectOutput", "Ngắt kết nối output"),
      onClick: () => outgoing.forEach(edge => removeEdge?.(edge.id))
    });
  }

  return items;
}

export function buildEdgeContextMenuItems({ edge, removeEdge, t }) {
  if (!edge) return [];
  return [{
    id: "disconnect",
    label: translate(t, "canvas.menu.disconnect", "Ngắt kết nối"),
    onClick: () => removeEdge?.(edge.id)
  }];
}

export function resolveOutputValueForSource(node, outputKey = "main", t) {
  const port = (node.data?.ports?.outputs || []).find(item => item.key === outputKey);
  if (!port) return {
    sourceType: "image",
    value: "",
    imageUrl: "",
    label: translate(t, "canvas.preview.output", "Output"),
    port: { type: "image" }
  };

  const sourceType = port.type || portTypeForUi(port.uiType) || "image";
  const rawValue = nodeOutputValue(node, `out:${outputKey}`);
  const coerced = coerceImageRef(rawValue);
  const imageUrl = sourceType === "image" ? (imageDisplayUrl(coerced) || coerced) : "";
  const value = sourceType === "image" ? (coerced || "") : rawValue;

  return {
    sourceType,
    value,
    imageUrl,
    label: port.label || translate(t, "canvas.preview.output", "Output"),
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

export function resolveFieldValueForSource(node, valueKey, nodes, edges, t) {
  const port = (node.data?.ports?.inputs || []).find(item => item.valueKey === valueKey);
  if (!port) return { sourceType: "image", value: "" };

  const sourceType = port.type || portTypeForUi(port.uiType);
  const incoming = incomingEdgesByInput(node.id, edges)[valueKey];
  let value = node.data?.values?.[valueKey] ?? "";

  if (incoming) {
    const resolved = resolveEffectiveImageSource(incoming.source, incoming.sourceHandle, nodes, edges);
    const upstream = resolved?.node || nodes.find(item => item.id === incoming.source);
    if (upstream?.type === "source") {
      value = nodeOutputValue(upstream, incoming.sourceHandle, nodes, edges) ?? value;
    } else {
      value = nodeOutputValue(upstream, resolved?.sourceHandle || incoming.sourceHandle, nodes, edges) || value;
    }
  } else if (sourceType === "image") {
    value = cloneImageValueForSource(value);
  } else {
    value = imageDisplayUrl(value) || value;
  }

  return {
    sourceType,
    value,
    label: port.label || translate(t, "canvas.preview.input", "Input"),
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
