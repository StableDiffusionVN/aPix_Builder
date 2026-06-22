export function normalizeComfyTarget(rawAddress) {
  if (!rawAddress) {
    throw new Error("Missing ComfyUI address");
  }
  let value = String(rawAddress).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    const parts = value.split(":");
    if (value.includes("@")) {
      value = `http://${value}`;
    } else if (parts.length === 3 && !/^\d+$/.test(parts[1])) {
      value = `http://${encodeURIComponent(parts[1])}:${encodeURIComponent(parts[2])}@${parts[0]}`;
    } else {
      value = `http://${value}`;
    }
  }
  const url = new URL(value);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  const username = decodeURIComponent(url.username || "");
  const password = decodeURIComponent(url.password || "");
  const authHeader = username || password
    ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    : null;
  const authPart = username || password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : "";
  const proxyAddress = `${url.protocol}//${authPart}${url.host}`;
  return {
    label: proxyAddress,
    httpBase: url.origin,
    proxyAddress,
    wsBase: `${wsProtocol}//${authPart}${url.host}`,
    headers: authHeader ? { authorization: authHeader } : {}
  };
}

export async function normalizeValues(values) {
  const normalized = {};
  let fileIndex = 0;
  for (const [key, value] of Object.entries(values || {})) {
    if (value === "random_seed") {
      normalized[key] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    } else if (typeof value === "string" && value.startsWith("data:")) {
      normalized[key] = { kind: "upload", index: fileIndex++, ...parseDataUrl(value) };
    } else if (Array.isArray(value)) {
      normalized[key] = await Promise.all(value.map(item => (
        typeof item === "string" && item.startsWith("data:")
          ? { kind: "upload", index: fileIndex++, ...parseDataUrl(item) }
          : item
      )));
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

export async function uploadImageToComfy(target, upload, signal) {
  const extension = upload.mimeType.includes("jpeg") ? "jpg" : upload.mimeType.split("/")[1] || "png";
  const filename = `sdvn_build_${Date.now()}_${upload.index}.${extension}`;
  const form = new FormData();
  form.append("image", new File([upload.buffer], filename, { type: upload.mimeType }));
  form.append("type", "input");
  form.append("overwrite", "true");
  const response = await fetch(`${target.httpBase}/upload/image`, {
    method: "POST",
    headers: target.headers,
    body: form,
    signal: signal || AbortSignal.timeout(120 * 1000)
  });
  if (!response.ok) {
    throw new Error(`ComfyUI /upload/image failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function uploadMaskToComfy(target, maskUpload, originalRef, signal) {
  const extension = maskUpload.mimeType?.includes("jpeg") ? "jpg" : (maskUpload.mimeType?.split("/")[1] || "png");
  const filename = `sdvn_mask_${Date.now()}_${maskUpload.index ?? 0}.${extension}`;
  const form = new FormData();
  form.append("image", new File([maskUpload.buffer], filename, { type: maskUpload.mimeType || "image/png" }));
  form.append("type", "input");
  form.append("subfolder", "clipspace");
  form.append("overwrite", "true");
  form.append("original_ref", JSON.stringify(originalRef));
  const response = await fetch(`${target.httpBase}/upload/mask`, {
    method: "POST",
    headers: target.headers,
    body: form,
    signal: signal || AbortSignal.timeout(120 * 1000)
  });
  if (!response.ok) {
    throw new Error(`ComfyUI /upload/mask failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function cancelQueueItems(target, { clear = false, promptIds = [] } = {}, signal) {
  const body = clear ? { clear: true } : { delete: promptIds };
  const response = await fetch(`${target.httpBase}/queue`, {
    method: "POST",
    headers: { "content-type": "application/json", ...target.headers },
    body: JSON.stringify(body),
    signal: signal || AbortSignal.timeout(15 * 1000)
  });
  if (!response.ok) {
    throw new Error(`ComfyUI /queue failed: ${response.status} ${await response.text()}`);
  }
  return { ok: true };
}

export function uploadedImageUrl(target, uploaded) {
  const filename = uploaded.name || uploaded.filename || uploaded.image || uploaded;
  const subfolder = uploaded.subfolder || "";
  const type = uploaded.type || "input";
  const query = new URLSearchParams({ filename, subfolder, type });
  return `${target.proxyAddress}/view?${query.toString()}`;
}

export async function queuePrompt(target, workflow, clientId, signal) {
  const response = await fetch(`${target.httpBase}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json", ...target.headers },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: signal || AbortSignal.timeout(60 * 1000)
  });
  if (!response.ok) {
    throw new Error(`ComfyUI /prompt failed: ${response.status} ${await response.text()}`);
  }
  const queued = await response.json();
  if (queued.node_errors && Object.keys(queued.node_errors).length > 0) {
    throw new Error(`ComfyUI validation failed: ${JSON.stringify(queued.node_errors)}`);
  }
  if (!queued.prompt_id) {
    throw new Error(`ComfyUI did not return prompt_id: ${JSON.stringify(queued)}`);
  }
  return queued;
}

export function waitForPrompt(target, promptId, clientId, run, timeoutMs, onEvent) {
  return new Promise((resolve, reject) => {
    const wsUrl = `${target.wsBase}/ws?clientId=${clientId}`;

    const startConnection = (WSClass) => {
      try {
        const ws = new WSClass(wsUrl);
        if (run) run.ws = ws;
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            ws.close();
          } catch {
            // Ignore close errors while resolving the request.
          }
          fn(value);
        };
        if (run?.abortController?.signal.aborted) {
          finish(reject, new Error("Request cancelled by user"));
          return;
        }
        const onAbort = () => finish(reject, new Error("Request cancelled by user"));
        run?.abortController?.signal.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => {
          finish(reject, new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ComfyUI prompt ${promptId}`));
        }, timeoutMs);

        ws.addEventListener("message", event => {
          if (typeof event.data !== "string") return;
          const message = JSON.parse(event.data);
          const data = message.data || {};
          if (data.prompt_id && data.prompt_id !== promptId) return;

          // Forward all events to SSE subscribers
          try { onEvent?.(message); } catch {}

          if (message.type === "execution_error") {
            const node = data.node_id || data.node || "unknown";
            const nodeType = data.node_type ? ` (${data.node_type})` : "";
            const detail = data.exception_message || data.exception_type || JSON.stringify(data);
            finish(reject, new Error(`ComfyUI execution error at node ${node}${nodeType}: ${detail}`));
            return;
          }
          if (message.type === "execution_interrupted") {
            finish(reject, new Error(run?.cancelled ? "Request cancelled by user" : `ComfyUI execution interrupted for prompt ${promptId}`));
            return;
          }
          if (message.type === "executing" && message.data?.node === null && message.data?.prompt_id === promptId) {
            finish(resolve);
          }
        });
        ws.addEventListener("error", error => {
          finish(reject, new Error(`ComfyUI websocket error: ${error.message || "connection failed"}`));
        });
        ws.addEventListener("close", () => {
          if (!settled) {
            finish(reject, new Error(`ComfyUI websocket closed before prompt ${promptId} finished`));
          }
        });
      } catch (err) {
        reject(new Error(`Failed to initialize WebSocket connection: ${err.message}`));
      }
    };

    if (typeof globalThis.WebSocket !== "undefined") {
      startConnection(globalThis.WebSocket);
    } else {
      import("ws")
        .then(module => {
          startConnection(module.default);
        })
        .catch(_err => {
          reject(new Error(
            `Node.js global WebSocket is not available (Node.js <22) and the 'ws' package is not installed. ` +
            `Please upgrade Node.js to v22+ or install the 'ws' package: npm install ws`
          ));
        });
    }
  });
}

export async function getHistory(target, promptId, signal) {
  const response = await fetch(`${target.httpBase}/history/${promptId}`, {
    headers: target.headers,
    signal: signal || AbortSignal.timeout(60 * 1000)
  });
  if (!response.ok) {
    throw new Error(`ComfyUI /history failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function interruptComfy(target) {
  const response = await fetch(`${target.httpBase}/interrupt`, {
    method: "POST",
    headers: { "content-type": "application/json", ...target.headers },
    body: "{}",
    signal: AbortSignal.timeout(10 * 1000)
  });
  if (!response.ok) {
    throw new Error(`ComfyUI /interrupt failed: ${response.status} ${await response.text()}`);
  }
}

const DISCOVERY_CACHE_TTL_MS = Number(process.env.COMFY_DISCOVERY_CACHE_MS || 5 * 60 * 1000);
const discoveryCache = new Map();

const dynamicChoiceSources = {
  checkpoints: {
    modelFolder: "checkpoints",
    objectInfo: [
      ["CheckpointLoaderSimple", "ckpt_name"],
      ["CheckpointLoader", "ckpt_name"]
    ]
  },
  loras: {
    modelFolder: "loras",
    objectInfo: [
      ["LoraLoader", "lora_name"],
      ["LoraLoaderModelOnly", "lora_name"]
    ]
  },
  vae: {
    modelFolder: "vae",
    objectInfo: [["VAELoader", "vae_name"]]
  },
  controlnets: {
    modelFolder: "controlnet",
    objectInfo: [
      ["ControlNetLoader", "control_net_name"],
      ["DiffControlNetLoader", "model_name"]
    ]
  },
  upscale_models: {
    modelFolder: "upscale_models",
    objectInfo: [["UpscaleModelLoader", "model_name"]]
  },
  samplers: {
    objectInfo: [
      ["KSampler", "sampler_name"],
      ["KSamplerAdvanced", "sampler_name"]
    ]
  },
  schedulers: {
    objectInfo: [
      ["KSampler", "scheduler"],
      ["KSamplerAdvanced", "scheduler"]
    ]
  },
  unet: {
    modelFolder: "diffusion_models",
    objectInfo: [["UNETLoader", "unet_name"]]
  },
  style_models: {
    modelFolder: "style_models",
    objectInfo: [["StyleModelLoader", "style_model_name"]]
  },
  embeddings: {
    modelFolder: "embeddings"
  },
  clip: {
    modelFolder: "text_encoders",
    objectInfo: [
      ["CLIPLoader", "clip_name"],
      ["DualCLIPLoader", "clip_name1"],
      ["DualCLIPLoader", "clip_name2"]
    ]
  },
  clip_vision: {
    modelFolder: "clip_vision",
    objectInfo: [["CLIPVisionLoader", "clip_name"]]
  }
};

async function fetchComfyJson(target, path, signal, timeoutMs = 30 * 1000) {
  const response = await fetch(`${target.httpBase}${path}`, {
    headers: target.headers,
    signal: signal || AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`ComfyUI ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function tryFetchComfyJson(target, path, signal, fallback) {
  try {
    return await fetchComfyJson(target, path, signal);
  } catch {
    return fallback;
  }
}

function readChoiceList(objectInfo, nodeType, inputName) {
  const choices = objectInfo?.[nodeType]?.input?.required?.[inputName]?.[0]
    ?? objectInfo?.[nodeType]?.input?.optional?.[inputName]?.[0];
  return Array.isArray(choices) ? choices.filter(item => typeof item === "string") : [];
}

function uniqueStrings(items) {
  return [...new Set((items || []).filter(item => typeof item === "string" && item.trim()))];
}

function buildNodeTypes(objectInfo) {
  return Object.entries(objectInfo || {}).map(([classType, node]) => ({
    classType,
    displayName: node?.display_name || node?.name || classType,
    category: node?.category || "",
    outputNode: Boolean(node?.output_node),
    requiredInputs: Object.keys(node?.input?.required || {}),
    optionalInputs: Object.keys(node?.input?.optional || {}),
    outputs: Array.isArray(node?.output) ? node.output : []
  }));
}

function choicesFromObjectInfo(objectInfo, sources = []) {
  return uniqueStrings(sources.flatMap(([nodeType, inputName]) => readChoiceList(objectInfo, nodeType, inputName)));
}

async function buildDynamicChoices(target, objectInfo, modelFolders, signal) {
  const modelsByFolder = {};
  const dynamicChoices = {};
  const folderSet = new Set(modelFolders || []);

  await Promise.all(Object.values(dynamicChoiceSources).map(async source => {
    if (!source.modelFolder || !folderSet.has(source.modelFolder)) return;
    const models = await tryFetchComfyJson(
      target,
      `/models/${encodeURIComponent(source.modelFolder)}`,
      signal,
      []
    );
    modelsByFolder[source.modelFolder] = Array.isArray(models) ? uniqueStrings(models) : [];
  }));

  for (const [type, source] of Object.entries(dynamicChoiceSources)) {
    const fromModels = source.modelFolder ? modelsByFolder[source.modelFolder] || [] : [];
    const fromObjectInfo = choicesFromObjectInfo(objectInfo, source.objectInfo);
    dynamicChoices[type] = uniqueStrings([...fromModels, ...fromObjectInfo]);
  }

  return { dynamicChoices, modelsByFolder };
}

export async function getComfyDiscovery(target, options = {}) {
  const now = Date.now();
  const cacheKey = target.label;
  const cached = discoveryCache.get(cacheKey);
  if (!options.refresh && cached && now - cached.fetchedAtMs < DISCOVERY_CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const signal = options.signal;
  const [system, features, modelFolders, embeddings, objectInfo] = await Promise.all([
    tryFetchComfyJson(target, "/system_stats", signal, null),
    tryFetchComfyJson(target, "/features", signal, null),
    tryFetchComfyJson(target, "/models", signal, []),
    tryFetchComfyJson(target, "/embeddings", signal, []),
    fetchComfyJson(target, "/object_info", signal)
  ]);

  const { dynamicChoices, modelsByFolder } = await buildDynamicChoices(
    target,
    objectInfo,
    Array.isArray(modelFolders) ? modelFolders : [],
    signal
  );
  dynamicChoices.embeddings = uniqueStrings([
    ...(dynamicChoices.embeddings || []),
    ...(Array.isArray(embeddings) ? embeddings : [])
  ]);

  const data = {
    address: target.label,
    fetchedAt: new Date(now).toISOString(),
    cached: false,
    cacheTtlMs: DISCOVERY_CACHE_TTL_MS,
    system,
    features,
    modelFolders: Array.isArray(modelFolders) ? modelFolders : [],
    modelsByFolder,
    embeddings: Array.isArray(embeddings) ? embeddings : [],
    dynamicChoices,
    modelLists: dynamicChoices,
    nodeTypes: buildNodeTypes(objectInfo)
  };
  discoveryCache.set(cacheKey, { fetchedAtMs: now, data });
  return data;
}

export async function getComfyHealth(target, signal) {
  const [system, features, queue, prompt] = await Promise.all([
    tryFetchComfyJson(target, "/system_stats", signal, null),
    tryFetchComfyJson(target, "/features", signal, null),
    tryFetchComfyJson(target, "/queue", signal, null),
    tryFetchComfyJson(target, "/prompt", signal, null)
  ]);
  return {
    online: Boolean(system || features || queue || prompt),
    address: target.label,
    checkedAt: new Date().toISOString(),
    system: system?.system || system || null,
    devices: system?.devices || [],
    features,
    queue,
    prompt
  };
}

export async function listComfyModels(target, signal) {
  const discovery = await getComfyDiscovery(target, { signal });
  return discovery.dynamicChoices;
}
