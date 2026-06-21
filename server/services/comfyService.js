import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cancelQueueItems,
  getHistory,
  getComfyDiscovery,
  getComfyHealth,
  interruptComfy,
  listComfyModels,
  normalizeComfyTarget,
  normalizeValues,
  parseDataUrl,
  queuePrompt,
  uploadImageToComfy,
  uploadMaskToComfy,
  uploadedImageUrl,
  waitForPrompt
} from "../lib/comfyClient.js";
import { fetchWithRetry } from "../lib/fetchRetry.js";
import {
  collectOutputs,
  mapValuesToRequest,
  setWorkflowValue,
  validateWorkflowMappings
} from "../lib/workflowPatcher.js";
import { decorateCanvasHistoryItem, mergeCanvasHistoryItem } from "../lib/canvasHistory.js";

const comfyTimeoutMs = Number(process.env.COMFY_TIMEOUT_MS || 10 * 60 * 1000);

export function createComfyService({ storage, runCoordinator, readBody, send }) {
  const {
    activeRuns,
    pendingSseClients,
    broadcastRunEvent,
    drainBackendRunQueue,
    cancelQueuedBackendRun,
    getRunLogSessions,
    ensureRunLogSession
  } = runCoordinator;

  function safeOutputName(rawName = "") {
    return path.basename(String(rawName)).replace(/[^\w.-]+/g, "_");
  }

  async function assertTemplateWorkflow(config, template, options = {}) {
    const workflow = JSON.parse(await readFile(template.workflowPath, "utf8"));
    validateWorkflowMappings(config, workflow, options);
    return workflow;
  }
  
  async function handleRun(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const runId = body.runId || randomUUID();
    const submittedAt = new Date().toISOString();
    const abortController = new AbortController();
    const run = {
      id: runId,
      abortController,
      cancelled: false,
      target: null,
      promptId: null,
      ws: null,
      sseClients: new Set(pendingSseClients.get(runId) || [])
    };
    pendingSseClients.delete(runId);
    activeRuns.set(runId, run);
    const existingRunSession = getRunLogSessions().find(session => session.runId === runId);
    ensureRunLogSession({
      runId,
      provider: "local",
      status: "running",
      job: { template: body.template || "", queuedAt: body.queuedAt || submittedAt },
      meta: { runKind: body.runKind || existingRunSession?.runKind || "form" }
    });
  
    try {
      const { config, server, template } = await storage.getTemplates().loadConfig(body.template);
      const target = normalizeComfyTarget(body.address || server.address);
      const workflow = await assertTemplateWorkflow(config, template);
      run.target = target;
  
      const normalized = await normalizeValues(body.values || {});
      const request = mapValuesToRequest(config, normalized);
      const responseRequest = {};
      const { inputDir, uploadDir } = storage.getPaths();
    const patchOptions = {
      inputDir,
      uploadDir,
      uploadImageToComfy,
      uploadMaskToComfy,
      parseDataUrl,
      uploadedImageUrl,
      urlUploadMode: template.id === "image-adjust" ? "local_path" : "comfy_view_url"
      };
      for (const [id, value] of Object.entries(request)) {
        const patchedValue = await setWorkflowValue(workflow, id, value, target, abortController.signal, patchOptions);
        responseRequest[id] = value?.kind === "upload" || value?.kind === "input-image" || value?.kind === "local-file"
          ? patchedValue
          : value;
      }
  
      const clientId = randomUUID();
      const queued = await queuePrompt(target, workflow, clientId, abortController.signal);
      run.promptId = queued.prompt_id;
      const onEvent = (message) => broadcastRunEvent(run, message);
      await waitForPrompt(target, queued.prompt_id, clientId, run, comfyTimeoutMs, onEvent);
      const historyRoot = await getHistory(target, queued.prompt_id, abortController.signal);
      const history = historyRoot[queued.prompt_id];
      const outputs = collectOutputs(config, history, target);
      if (outputs.length === 0) {
        const status = history?.status ? ` Status: ${JSON.stringify(history.status)}` : "";
        throw new Error(`ComfyUI finished prompt ${queued.prompt_id}, but no images were found for output node(s) in this template.${status}`);
      }
      const historyItem = await archiveOutputRun({
        runId,
        promptId: queued.prompt_id,
        template,
        address: target.label,
        target,
        config,
        history,
        values: body.values || {},
        submittedAt,
        signal: abortController.signal,
        onDownloadRetry: ({ label, attempt }) => {
          broadcastRunEvent(run, {
            type: "output_download_retry",
            data: { label, attempt }
          });
        },
        canvasHistory: body
      });
      send(res, 200, {
        runId,
        promptId: queued.prompt_id,
        template: template.id,
        address: target.label,
        submittedAt: historyItem.submittedAt,
        completedAt: historyItem.completedAt,
        durationMs: historyItem.durationMs,
        request: responseRequest,
        outputs: historyItem.outputs,
        rawOutputs: history?.outputs || {},
        historyItem
      });
    } finally {
      broadcastRunEvent(run, { type: "run_end", data: { runId } });
      for (const client of run.sseClients) {
        try { client.res.end(); } catch {}
      }
      activeRuns.delete(runId);
      queueMicrotask(drainBackendRunQueue);
    }
  }
  
  async function handleCancel(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    if (cancelQueuedBackendRun(body.runId)) {
      send(res, 200, { cancelled: true, queued: true, message: "Removed from backend queue" });
      return;
    }
    const run = activeRuns.get(body.runId);
    if (!run) {
      send(res, 200, { cancelled: false, message: "Run is not active" });
      return;
    }
    run.cancelled = true;
    run.abortController.abort();
    try {
      run.ws?.close();
    } catch {
      // Ignore websocket close errors while cancelling.
    }
    if (run.target) {
      try {
        if (run.promptId) {
          await cancelQueueItems(run.target, { promptIds: [run.promptId] }).catch(() => {});
        }
        await interruptComfy(run.target);
      } catch (error) {
        send(res, 200, {
          cancelled: true,
          warning: error.message || String(error)
        });
        return;
      }
    }
    send(res, 200, { cancelled: true });
  }
  
  async function handleComfyView(req, res, url) {
    const target = normalizeComfyTarget(url.searchParams.get("address"));
    url.searchParams.delete("address");
    const response = await fetch(`${target.httpBase}/view?${url.searchParams.toString()}`, {
      headers: target.headers
    });
    if (!response.ok) {
      send(res, response.status, await response.text());
      return;
    }
    const contentType = response.headers.get("content-type") || "image/png";
    res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
    res.end(Buffer.from(await response.arrayBuffer()));
  }
  
  async function handleComfyModels(req, res, url) {
    const target = normalizeComfyTarget(url.searchParams.get("address"));
    send(res, 200, await listComfyModels(target));
  }
  
  async function handleComfyDiscovery(req, res, url) {
    const target = normalizeComfyTarget(url.searchParams.get("address"));
    const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
    send(res, 200, await getComfyDiscovery(target, { refresh }));
  }
  
  async function handleComfyHealth(req, res, url) {
    const target = normalizeComfyTarget(url.searchParams.get("address"));
    send(res, 200, await getComfyHealth(target));
  }
  
  async function archiveOutputRun({
    // paths resolved below
    runId,
    promptId,
    template,
    address,
    target,
    config,
    history,
    values,
    submittedAt,
    signal,
    onDownloadRetry,
    canvasHistory
  }) {
    const { outputDir } = storage.getPaths();

    await mkdir(outputDir, { recursive: true });
    const completedAt = new Date().toISOString();
    const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(submittedAt || completedAt).getTime());
    const outputIds = Object.values(config.output || {}).map(item => String(item.id));
    const archivedOutputs = [];
    let index = 0;
  
    for (const nodeId of outputIds) {
      const images = history?.outputs?.[nodeId]?.images || [];
      for (const image of images) {
        const query = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder || "",
          type: image.type || "output"
        });
        try {
          const response = await fetchWithRetry(`${target.httpBase}/view?${query.toString()}`, {
            headers: target.headers,
            signal,
            onRetry: ({ attempt, waitMs }) => {
              onDownloadRetry?.({
                attempt,
                waitMs,
                filename: image.filename,
                label: `Đang thử tải lại ảnh kết quả (${attempt})...`
              });
            }
          });
          const originalName = safeOutputName(image.filename || `output_${index}.png`);
          const ext = path.extname(originalName) || ".png";
          const base = originalName.replace(/\.[^.]+$/, "") || "output";
          const filename = `${Date.now()}_${runId}_${index}_${base}${ext}`;
          await writeFile(path.join(outputDir, filename), Buffer.from(await response.arrayBuffer()));
          archivedOutputs.push({
            nodeId,
            filename,
            originalFilename: image.filename,
            url: storage.outputImageUrl(filename)
          });
          index += 1;
        } catch {
          // Try remaining outputs; fail only if nothing could be archived.
        }
      }
    }
  
    if (!archivedOutputs.length) {
      throw new Error("ComfyUI hoàn tất nhưng không tải được ảnh kết quả sau nhiều lần thử");
    }
  
    const item = decorateCanvasHistoryItem({
      id: runId,
      templateId: template.id,
      templateName: template.name || template.id,
      address,
      promptId,
      createdAt: completedAt,
      submittedAt: submittedAt || completedAt,
      completedAt,
      durationMs,
      outputs: archivedOutputs,
      status: "success",
      values: storage.trimHistoryValues(values),
      result: {
        runId,
        promptId,
        template: template.id,
        address,
        submittedAt: submittedAt || completedAt,
        completedAt,
        durationMs,
        outputs: archivedOutputs
      }
    }, canvasHistory);
    const current = await storage.readOutputHistory();
    await storage.writeOutputHistory(mergeCanvasHistoryItem(current, item));
    return item;
  }

  return {
    assertTemplateWorkflow,
    handleRun,
    handleCancel,
    handleComfyView,
    handleComfyModels,
    handleComfyDiscovery,
    handleComfyHealth,
    cancelQueueItems,
    normalizeComfyTarget
  };
}
