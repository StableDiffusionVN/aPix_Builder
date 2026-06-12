import { state, setStatus, setProgress } from "../state.js";

export const DYNAMIC_TYPE_REGISTRY = {
  checkpoints:    { aliases: ["checkpoint", "ckpt"],                        node: "CheckpointLoaderSimple", field: "ckpt_name" },
  loras:          { aliases: ["lora"],                                       node: "LoraLoader",             field: "lora_name" },
  vae:            { aliases: ["vaes"],                                       node: "VAELoader",              field: "vae_name" },
  controlnets:    { aliases: ["controlnet", "control_net"],                  node: "ControlNetLoader",       field: "control_net_name" },
  upscale_models: { aliases: ["upscale_model", "upscalers"],                 node: "UpscaleModelLoader",     field: "model_name" },
  samplers:       { aliases: ["sampler"],                                    node: "KSampler",               field: "sampler_name" },
  schedulers:     { aliases: ["scheduler"],                                  node: "KSampler",               field: "scheduler" },
  unet:           { aliases: ["unets", "diffusion_models", "diffusion_model"], node: "UNETLoader",           field: "unet_name" },
  style_models:   { aliases: ["style_model"],                                node: "StyleModelLoader",       field: "style_model_name" },
  embeddings:     { aliases: ["embedding"],                                  node: "CLIPTextEncode",         field: "text" },
  clip:           { aliases: ["clips", "text_encoders", "text_encoder"],     node: "CLIPLoader",             field: "clip_name" },
  clip_vision:    { aliases: ["clipvision", "clip_visions"],                 node: "CLIPVisionLoader",       field: "clip_name" }
};

const DYNAMIC_TYPE_ALIAS_MAP = (() => {
  const map = {};
  for (const [canonical, cfg] of Object.entries(DYNAMIC_TYPE_REGISTRY)) {
    map[canonical] = canonical;
    for (const alias of cfg.aliases) map[alias] = canonical;
  }
  return map;
})();

export function canonicalDynamicType(type) {
  return DYNAMIC_TYPE_ALIAS_MAP[String(type || "").toLowerCase()] || "";
}

// Session-persistent Client ID
let sessionClientId = null;
export function getClientId() {
  if (!sessionClientId) {
    if (globalThis.crypto?.randomUUID) {
      sessionClientId = globalThis.crypto.randomUUID();
    } else {
      sessionClientId = `apix-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }
  return sessionClientId;
}

// Websocket Registry: promptId -> callback functions
const promptListeners = new Map();
let socketUrl = null;

function handleWebSocketMessage(event) {
  if (typeof event.data !== "string") return;
  try {
    const message = JSON.parse(event.data);
    const data = message.data || {};
    const promptId = data.prompt_id;

    if (!promptId) return;

    // Check if we have a registered listener for this promptId
    const listener = promptListeners.get(promptId);
    if (!listener) return;

    if (message.type === "progress") {
      setProgress(data.value, data.max);
    }
    if (message.type === "executing" && data.node) {
      setStatus(`Processing node ${data.node}...`);
    }
    if (message.type === "execution_error") {
      const detail = data.exception_message || data.exception_type || JSON.stringify(data);
      listener.reject(new Error(`ComfyUI execution error: ${detail}`));
      promptListeners.delete(promptId);
    }
    if (message.type === "execution_interrupted") {
      listener.reject(new Error("ComfyUI execution interrupted"));
      promptListeners.delete(promptId);
    }
    if (message.type === "executing" && data.node === null) {
      // Finished execution
      listener.resolve();
      promptListeners.delete(promptId);
    }
  } catch (error) {
    console.error("Error processing websocket message", error);
  }
}

function handleWebSocketClose() {
  setStatus("WebSocket connection closed");
  state.activeWebSocket = null;
  socketUrl = null;
  // Reject all active prompt listeners
  for (const [promptId, listener] of promptListeners.entries()) {
    listener.reject(new Error("ComfyUI websocket closed before completion"));
    promptListeners.delete(promptId);
  }
}

function handleWebSocketError() {
  setStatus("WebSocket connection error");
}

export function connectWebSocket(target) {
  const wsUrl = `${target.wsBase}/ws?clientId=${getClientId()}`;
  
  if (state.activeWebSocket) {
    // If target changed, close the old one
    if (socketUrl !== wsUrl) {
      try {
        state.activeWebSocket.close();
      } catch {}
      state.activeWebSocket = null;
    } else if (state.activeWebSocket.readyState === WebSocket.OPEN) {
      return state.activeWebSocket;
    } else if (state.activeWebSocket.readyState === WebSocket.CONNECTING) {
      return state.activeWebSocket;
    }
  }

  setStatus("Opening WebSocket...");
  const ws = new WebSocket(wsUrl);
  state.activeWebSocket = ws;
  socketUrl = wsUrl;

  ws.addEventListener("message", handleWebSocketMessage);
  ws.addEventListener("close", handleWebSocketClose);
  ws.addEventListener("error", handleWebSocketError);
  
  return ws;
}

// Service functions
export function isLocalHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host === "::1" || host === "0.0.0.0" || host.endsWith(".local")) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(host)) return true;
  return false;
}

export function normalizeComfyTarget(rawAddress) {
  if (!rawAddress) throw new Error("Missing ComfyUI server URL");
  let value = String(rawAddress).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  let url = new URL(value);
  if (url.protocol === "http:" && !isLocalHost(url.hostname)) {
    url.protocol = "https:";
  }
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  const username = decodeURIComponent(url.username || "");
  const password = decodeURIComponent(url.password || "");
  const authHeader = username || password ? `Basic ${btoa(`${username}:${password}`)}` : null;
  const authPart = username || password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
  return {
    label: `${url.protocol}//${authPart}${url.host}`,
    httpBase: url.origin,
    wsBase: `${wsProtocol}//${authPart}${url.host}`,
    headers: authHeader ? { authorization: authHeader } : {}
  };
}

export function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2],
    blob: base64ToBlob(match[2], match[1])
  };
}

export function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export async function uploadImageToComfy(target, upload, signal) {
  const extension = upload.mimeType.includes("jpeg") ? "jpg" : upload.mimeType.split("/")[1] || "png";
  const filename = `apix_ps_${Date.now()}_${upload.index}.${extension}`;
  setStatus(`Uploading image input ${upload.index + 1}...`);
  const form = new FormData();
  form.append("image", upload.blob, filename);
  form.append("type", "input");
  form.append("overwrite", "true");
  let response;
  try {
    response = await fetch(`${target.httpBase}/upload/image`, {
      method: "POST",
      headers: target.headers,
      body: form,
      signal
    });
  } catch (error) {
    const msg = error?.message || String(error);
    if (/manifest entry not found|permission denied/i.test(msg)) {
      throw new Error(`${msg} — add ${target.httpBase} to manifest.json network.domains, then unload and reload the plugin`);
    }
    throw error;
  }
  if (!response.ok) throw new Error(`ComfyUI /upload/image failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function uploadedName(uploaded) {
  return uploaded.name || uploaded.filename || uploaded.image || uploaded;
}

export function resolveWorkflowInput(workflow, id) {
  const parts = String(id).split("-");
  if (parts.length < 2) throw new Error(`Invalid YAML id "${id}". Expected "node-field".`);
  const [nodeId] = parts;
  const hasSection = parts.length >= 3;
  const section = hasSection ? parts[1] : "inputs";
  const requestedField = (hasSection ? parts.slice(2) : parts.slice(1)).join("-");
  const node = workflow[nodeId];
  if (!node) throw new Error(`Workflow node not found: ${nodeId}`);
  const nodeInputs = node[section];
  if (!nodeInputs) throw new Error(`Workflow path not found: ${nodeId}.${section}`);
  const field = Object.keys(nodeInputs).find(key => key === requestedField)
    || Object.keys(nodeInputs).find(key => key.toLowerCase() === requestedField.toLowerCase());
  if (!field) throw new Error(`Workflow field not found: ${nodeId}.${section}.${requestedField}`);
  return { nodeInputs, section, field };
}

export async function setWorkflowValue(workflow, id, value, target, signal) {
  const { nodeInputs, section, field } = resolveWorkflowInput(workflow, id);
  if (value?.kind === "upload") {
    const uploaded = await uploadImageToComfy(target, value, signal);
    if (section === "inputs" && field.toLowerCase() === "url") {
      const query = new URLSearchParams({ filename: uploadedName(uploaded), subfolder: uploaded.subfolder || "", type: uploaded.type || "input" });
      if ("Load_url" in nodeInputs) nodeInputs.Load_url = true;
      if ("mode" in nodeInputs) nodeInputs.mode = "Url";
      if ("image" in nodeInputs) nodeInputs.image = "None";
      nodeInputs[field] = `${target.label}/view?${query.toString()}`;
      return;
    }
    if (section === "inputs" && "image" in nodeInputs) {
      if ("Load_url" in nodeInputs) nodeInputs.Load_url = false;
      if ("Url" in nodeInputs) nodeInputs.Url = "";
      if ("url" in nodeInputs) nodeInputs.url = "";
      if ("mode" in nodeInputs) nodeInputs.mode = "Image";
      nodeInputs.image = uploadedName(uploaded);
      return;
    }
  }
  nodeInputs[field] = value;
}

export async function queuePrompt(target, workflow, signal) {
  const response = await fetch(`${target.httpBase}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json", ...target.headers },
    body: JSON.stringify({ prompt: workflow, client_id: getClientId() }),
    signal
  });
  if (!response.ok) throw new Error(`ComfyUI /prompt failed: ${response.status} ${await response.text()}`);
  const queued = await response.json();
  if (queued.node_errors && Object.keys(queued.node_errors).length) {
    throw new Error(`ComfyUI validation failed: ${JSON.stringify(queued.node_errors)}`);
  }
  if (!queued.prompt_id) throw new Error(`ComfyUI did not return prompt_id: ${JSON.stringify(queued)}`);
  return queued;
}

export async function getHistory(target, promptId, signal) {
  const response = await fetch(`${target.httpBase}/history/${promptId}`, {
    headers: target.headers,
    signal
  });
  if (!response.ok) throw new Error(`ComfyUI /history failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Request cancelled"));
    }, { once: true });
  });
}

export async function waitForPromptHistory(target, promptId, signal) {
  while (!signal?.aborted) {
    const history = await getHistory(target, promptId, signal);
    if (history?.[promptId]) return history;
    await delay(800, signal);
  }
  throw new Error("Request cancelled");
}

export function waitForPrompt(target, promptId, signal) {
  return new Promise((resolve, reject) => {
    // Register listener for events on this promptId
    promptListeners.set(promptId, { resolve, reject });
    
    // Ensure socket is active
    try {
      connectWebSocket(target);
    } catch (wsError) {
      promptListeners.delete(promptId);
      reject(wsError);
      return;
    }

    signal?.addEventListener("abort", () => {
      promptListeners.delete(promptId);
      reject(new Error("Request cancelled"));
    }, { once: true });
  });
}

export async function waitForPromptCompletion(target, promptId, signal) {
  let websocketError = null;
  await Promise.race([
    waitForPrompt(target, promptId, signal).catch(error => {
      if (/execution error|execution interrupted/i.test(error.message || "")) throw error;
      websocketError = error;
      return waitForPromptHistory(target, promptId, signal);
    }),
    waitForPromptHistory(target, promptId, signal)
  ]);
  if (websocketError) {
    console.warn("ComfyUI websocket wait failed, completed through history polling", websocketError);
  }
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
      outputs.push({ nodeId, filename: image.filename, url: `${target.label}/view?${query.toString()}`, headers: target.headers });
    }
  }
  if (!outputs.length) {
    for (const [nodeId, output] of Object.entries(history?.outputs || {})) {
      for (const image of output?.images || []) {
        const query = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder || "",
          type: image.type || "output"
        });
        outputs.push({ nodeId, filename: image.filename, url: `${target.label}/view?${query.toString()}`, headers: target.headers });
      }
    }
  }
  return outputs;
}

export async function fetchOutputBytes(output, signal) {
  const response = await fetch(output.url, {
    headers: output.headers || {},
    signal
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return {
    buffer: await response.arrayBuffer(),
    mimeType: response.headers.get("content-type") || "image/png"
  };
}

export async function fetchServerChoices() {
  if (!state.settings.serverUrl) return;
  try {
    const target = normalizeComfyTarget(state.settings.serverUrl);
    // Deduplicate node classes (e.g. samplers+schedulers both use KSampler)
    const nodeMap = {};
    for (const [canonical, cfg] of Object.entries(DYNAMIC_TYPE_REGISTRY)) {
      if (!nodeMap[cfg.node]) nodeMap[cfg.node] = [];
      nodeMap[cfg.node].push({ canonical, field: cfg.field });
    }
    const results = await Promise.allSettled(
      Object.entries(nodeMap).map(([nodeClass, targets]) =>
        fetch(`${target.httpBase}/object_info/${nodeClass}`, { headers: target.headers })
          .then(r => r.ok ? r.json() : null)
          .then(data => ({ nodeClass, targets, data }))
      )
    );
    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value?.data) continue;
      const { nodeClass, targets, data } = result.value;
      const nodeInfo = data[nodeClass];
      for (const { canonical, field } of targets) {
        const choices =
          nodeInfo?.input?.required?.[field]?.[0] ||
          nodeInfo?.input?.optional?.[field]?.[0];
        if (Array.isArray(choices) && choices.length) {
          state.serverChoices[canonical] = choices;
        }
      }
    }
  } catch (error) {
    console.warn("fetchServerChoices failed", error);
  }
}
