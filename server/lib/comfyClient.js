export function normalizeComfyTarget(rawAddress) {
  if (!rawAddress) {
    throw new Error("Missing ComfyUI address");
  }
  let value = String(rawAddress).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    const parts = value.split(":");
    if (parts.length === 3 && !/^\d+$/.test(parts[1])) {
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
  return {
    label: url.host,
    httpBase: url.origin,
    proxyAddress: `${url.protocol}//${authPart}${url.host}`,
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
  const filename = `codex_upload_${Date.now()}_${upload.index}.${extension}`;
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

export function waitForPrompt(target, promptId, clientId, run, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${target.wsBase}/ws?clientId=${clientId}`);
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
      if (message.type === "execution_error") {
        const node = data.node_id || data.node || "unknown";
        const detail = data.exception_message || data.exception_type || JSON.stringify(data);
        finish(reject, new Error(`ComfyUI execution error at node ${node}: ${detail}`));
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
