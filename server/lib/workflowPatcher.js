import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { lookupMenuSubFields, menuChoiceOptions, menuChoiceValue, resolveMenuStoredValue } from "./menuChoices.js";

function menuSubSelectionStorageKey(yamlKey) {
  return `__menu__${yamlKey}`;
}

function flattenMenuSubInputIds(item) {
  const ids = [];
  if (item?.id) ids.push(item.id);
  for (const fields of Object.values(item?.ui?.sub || {})) {
    for (const child of Object.values(fields || {})) {
      if (child?.id) ids.push(child.id);
    }
  }
  return ids;
}

function collectMenuSubRequest(item, yamlKey, values, request) {
  const choices = item.ui?.choices || [];
  const menuOpts = menuChoiceOptions(item.ui);
  const menuValue = item.id
    ? values[item.id]
    : values[menuSubSelectionStorageKey(yamlKey)];
  const selected = resolveMenuStoredValue(
    menuValue ?? item.ui?.value ?? menuChoiceValue(choices[0], menuOpts),
    choices,
    menuOpts
  );
  if (item.id && item.id in values) request[item.id] = values[item.id];
  const subs = lookupMenuSubFields(item.ui?.sub || {}, selected, choices, menuOpts);
  for (const subItem of Object.values(subs)) {
    if (!subItem?.id) continue;
    if (Array.isArray(subItem.id)) {
      subItem.id.forEach(childId => {
        if (childId in values) request[childId] = values[childId];
      });
    } else if (subItem.id in values) {
      request[subItem.id] = values[subItem.id];
    }
  }
}

export function flattenInputIds(config) {
  const ids = [];
  for (const item of Object.values(config.input || {})) {
    if (item?.ui?.type === "col") {
      for (const child of Object.values(item.ui.col || {})) {
        if (child.id) ids.push(child.id);
      }
    } else if (item?.ui?.type === "menu-sub") {
      ids.push(...flattenMenuSubInputIds(item));
    } else if (item?.id) {
      ids.push(item.id);
    }
  }
  return ids;
}

export function mapValuesToRequest(config, values) {
  const request = {};
  for (const [yamlKey, item] of Object.entries(config.input || {})) {
    if (item?.ui?.type === "col") {
      for (const child of Object.values(item.ui.col || {})) {
        if (!child?.id) continue;
        if (Array.isArray(child.id)) {
          child.id.forEach(childId => {
            if (childId in values) request[childId] = values[childId];
          });
        } else if (child.id in values) {
          request[child.id] = values[child.id];
        }
      }
      continue;
    }
    if (item?.ui?.type === "menu-sub") {
      collectMenuSubRequest(item, yamlKey, values, request);
      continue;
    }
    if (!item?.id) continue;
    if (Array.isArray(item.id)) {
      item.id.forEach(childId => {
        if (childId in values) request[childId] = values[childId];
      });
    } else if (item.id in values) {
      request[item.id] = values[item.id];
    }
  }
  return request;
}

export function resolveWorkflowInput(workflow, id) {
  const parts = String(id).split("-");
  if (parts.length < 2) {
    throw new Error(`Invalid YAML id "${id}". Expected "node-field" or "node-inputs-field".`);
  }
  const [nodeId] = parts;
  const hasSection = parts.length >= 3;
  const section = hasSection ? parts[1] : "inputs";
  const requestedField = (hasSection ? parts.slice(2) : parts.slice(1)).join("-");
  const node = workflow[nodeId];
  if (!node) {
    throw new Error(`Workflow node not found for YAML id "${id}": node ${nodeId}`);
  }
  const nodeInputs = node[section];
  if (!nodeInputs) {
    throw new Error(`Workflow path not found for YAML id "${id}": ${nodeId}.${section}`);
  }
  const field = Object.keys(nodeInputs).find(key => key === requestedField)
    || Object.keys(nodeInputs).find(key => key.toLowerCase() === requestedField.toLowerCase());
  if (!field) {
    throw new Error(`Workflow field not found for YAML id "${id}": ${nodeId}.${section}.${requestedField}`);
  }
  return { nodeInputs, section, field };
}

export function parseWorkflowFieldId(id) {
  const parts = String(id || "").split("-");
  if (parts.length >= 3 && parts[1] === "inputs") {
    return { nodeId: parts[0], fieldName: parts.slice(2).join("-") };
  }
  return { nodeId: parts[0] || "", fieldName: parts.slice(1).join("-") };
}

export function inferRunningHubFieldType(fieldName, value) {
  const lower = String(fieldName || "").toLowerCase();
  if (lower.includes("image")) return "IMAGE";
  if (lower.includes("audio")) return "AUDIO";
  if (lower.includes("video")) return "VIDEO";
  if (typeof value === "number") return Number.isInteger(value) ? "INT" : "FLOAT";
  if (value && typeof value === "object") {
    if (value.kind === "input-image" || value.url) return "IMAGE";
    return "STRING";
  }
  return "STRING";
}

export function payloadToRunningHubNodes(payload = {}) {
  return Object.entries(payload).map(([id, fieldValue]) => {
    const { nodeId, fieldName } = parseWorkflowFieldId(id);
    return {
      nodeId,
      fieldName,
      fieldType: inferRunningHubFieldType(fieldName, fieldValue),
      fieldValue
    };
  });
}

export function validateWorkflowMappings(config, workflow, options = {}) {
  const requireOutput = options.requireOutput !== false;
  for (const id of flattenInputIds(config)) {
    if (Array.isArray(id)) {
      id.forEach(childId => resolveWorkflowInput(workflow, childId));
    } else {
      resolveWorkflowInput(workflow, id);
    }
  }
  if (!requireOutput) return;
  for (const item of Object.values(config.output || {})) {
    const nodeId = String(item.id || "");
    if (!nodeId) {
      throw new Error("Output mapping is missing required node id");
    }
    if (!workflow[nodeId]) {
      throw new Error(`Workflow output node not found: ${nodeId}`);
    }
  }
}

export async function persistDataUrl(uploadDir, dataUrl, index) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return dataUrl;
  const extension = match[1].includes("jpeg") ? "jpg" : match[1].split("/")[1] || "png";
  await mkdir(uploadDir, { recursive: true });
  const filename = `upload_${Date.now()}_${index}.${extension}`;
  const filePath = path.join(uploadDir, filename);
  await writeFile(filePath, Buffer.from(match[2], "base64"));
  return filePath;
}

function mimeTypeForFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

async function inputImageToUpload(inputDir, value) {
  const filename = path.basename(value.name || value.filename || "");
  if (!filename) throw new Error("Input image is missing filename");
  const filePath = path.join(inputDir, filename);
  if (!filePath.startsWith(inputDir)) throw new Error("Invalid input image path");
  return {
    kind: "upload",
    index: Date.now(),
    mimeType: mimeTypeForFile(filename),
    buffer: await readFile(filePath)
  };
}

async function applyMask(target, uploaded, maskDataUrl, signal, options) {
  const { uploadMaskToComfy, parseDataUrl } = options;
  if (!maskDataUrl || !uploadMaskToComfy || !parseDataUrl) return null;
  const parsed = parseDataUrl(maskDataUrl);
  if (!parsed) return null;
  const originalRef = {
    filename: uploaded.name || uploaded.filename,
    subfolder: uploaded.subfolder || "",
    type: uploaded.type || "input"
  };
  const maskUploaded = await uploadMaskToComfy(
    target,
    { mimeType: parsed.mimeType, buffer: parsed.buffer, index: Date.now() },
    originalRef,
    signal
  );
  const name = maskUploaded.name || maskUploaded.filename;
  return maskUploaded.subfolder ? `${maskUploaded.subfolder}/${name}` : name;
}

export async function setWorkflowValue(workflow, id, value, target, signal, options = {}) {
  const { nodeInputs, section, field } = resolveWorkflowInput(workflow, id);
  const { inputDir, uploadDir, uploadImageToComfy, uploadedImageUrl, urlUploadMode } = options;

  if (value?.kind === "input-image") {
    const upload = await inputImageToUpload(inputDir, value);
    if (section === "inputs" && field.toLowerCase() === "url") {
      const uploaded = await uploadImageToComfy(target, upload, signal);
      if ("Load_url" in nodeInputs) nodeInputs.Load_url = true;
      if ("mode" in nodeInputs) nodeInputs.mode = "Url";
      if ("image" in nodeInputs) nodeInputs.image = "None";
      nodeInputs[field] = uploadedImageUrl(target, uploaded);
      return nodeInputs[field];
    }
    if (section === "inputs" && "image" in nodeInputs) {
      const uploaded = await uploadImageToComfy(target, upload, signal);
      if ("Load_url" in nodeInputs) nodeInputs.Load_url = false;
      if ("Url" in nodeInputs) nodeInputs.Url = "";
      if ("url" in nodeInputs) nodeInputs.url = "";
      if ("mode" in nodeInputs) nodeInputs.mode = "Image";
      const masked = await applyMask(target, uploaded, value.maskDataUrl, signal, options);
      nodeInputs.image = masked || uploaded.name || uploaded.filename || uploaded.image || uploaded;
      return nodeInputs.image;
    }
    nodeInputs[field] = await persistDataUrl(
      uploadDir,
      `data:${upload.mimeType};base64,${upload.buffer.toString("base64")}`,
      upload.index
    );
    return nodeInputs[field];
  }

  if (value?.kind === "upload") {
    if (section === "inputs" && field.toLowerCase() === "url") {
      if (urlUploadMode === "local_path") {
        nodeInputs[field] = await persistDataUrl(
          uploadDir,
          `data:${value.mimeType};base64,${value.buffer.toString("base64")}`,
          value.index
        );
        if ("Load_url" in nodeInputs) nodeInputs.Load_url = true;
        if ("image" in nodeInputs) nodeInputs.image = "None";
        return nodeInputs[field];
      }
      const uploaded = await uploadImageToComfy(target, value, signal);
      if ("Load_url" in nodeInputs) nodeInputs.Load_url = true;
      if ("mode" in nodeInputs) nodeInputs.mode = "Url";
      if ("image" in nodeInputs) nodeInputs.image = "None";
      nodeInputs[field] = uploadedImageUrl(target, uploaded);
      return nodeInputs[field];
    }
    if (section === "inputs" && "image" in nodeInputs) {
      const uploaded = await uploadImageToComfy(target, value, signal);
      if ("Load_url" in nodeInputs) nodeInputs.Load_url = false;
      if ("Url" in nodeInputs) nodeInputs.Url = "";
      if ("url" in nodeInputs) nodeInputs.url = "";
      if ("mode" in nodeInputs) nodeInputs.mode = "Image";
      nodeInputs.image = uploaded.name || uploaded.filename || uploaded.image || uploaded;
      return nodeInputs.image;
    }
    nodeInputs[field] = await persistDataUrl(
      uploadDir,
      `data:${value.mimeType};base64,${value.buffer.toString("base64")}`,
      value.index
    );
    return nodeInputs[field];
  }

  nodeInputs[field] = value;
  return value;
}

export function collectOutputs(config, history, target) {
  const outputIds = Object.values(config.output || {}).map(item => String(item.id));
  const outputs = [];
  for (const nodeId of outputIds) {
    const images = history?.outputs?.[nodeId]?.images || [];
    for (const image of images) {
      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder || "",
        type: image.type || "output"
      });
      outputs.push({
        nodeId,
        filename: image.filename,
        url: `/api/comfy-view?address=${encodeURIComponent(target.proxyAddress)}&${query.toString()}`
      });
    }
  }
  return outputs;
}
