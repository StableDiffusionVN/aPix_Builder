import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry } from "../lib/fetchRetry.js";
import { buildPatchedRunningHubWorkflow, buildRunningHubNodeInfoList } from "../lib/runningHubWorkflow.js";
import { TEMPLATE_SCOPES } from "../lib/templateService.js";
import {
  getWebappCallDemo,
  getWorkflowJson,
  parsePromptTips,
  prepareNodeInfoList,
  submitAiAppTask,
  submitWorkflowTask,
  waitForTaskOutputs,
  extractRhConsumeCoins,
  fetchFullAccountStatus,
  fetchAccountRemainCoins,
  resolveRhTaskCoins,
  inspectRhTask,
  submitRhTaskWhenReady,
  waitForRhApiKeyIdle
} from "../lib/runningHubClient.js";
import { withRhTokenFailover, resolveRhApiKeys, RH_TOKEN_POLICY } from "../lib/rhTokenFailover.js";
import { normalizeValues } from "../lib/comfyClient.js";
import { mapValuesToRequest } from "../lib/workflowPatcher.js";
import { decorateCanvasHistoryItem, mergeCanvasHistoryItem } from "../lib/canvasHistory.js";

const runningHubTimeoutMs = Number(process.env.RUNNINGHUB_TIMEOUT_MS || 10 * 60 * 1000);

export function createRunningHubService({ storage, runCoordinator, readBody, send, resourceRoot, dataRoot }) {
  const resourceConfigDir = path.join(resourceRoot, "config");
  const defaultRhDir = path.join(resourceConfigDir, "default-rh");
  const resourceRhDefaultAppsFilePath = path.join(defaultRhDir, "apps.json");
  const legacyRhAppsDir = path.join(dataRoot, "rh-apps");
  const legacyRhSavedAppsFilePath = path.join(legacyRhAppsDir, "apps.json");
  const legacyRhDefaultAppsFilePath = path.join(legacyRhAppsDir, "defaults.json");
  const RH_DEFAULT_WEBAPP_IDS = ["2039924771751731201", "2064284416448491522"];

  let configDir;
  let templatesRhDir;
  let rhSavedAppsFilePath;
  let rhDefaultAppsFilePath;

  function syncPaths() {
    const paths = storage.getPaths();
    configDir = paths.configDir;
    templatesRhDir = path.join(configDir, "templates-rh");
    rhSavedAppsFilePath = path.join(templatesRhDir, "apps.json");
    rhDefaultAppsFilePath = path.join(configDir, "runninghub-default-apps.json");
  }

  const {
    activeRhRuns,
    pendingSseClients,
    broadcastRunEvent,
    drainBackendRunQueue,
    cancelQueuedBackendRun,
    getRunLogSessions,
    ensureRunLogSession
  } = runCoordinator;

  function normalizeRhSavedApps(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .map(entry => {
        const id = String(entry?.id || "").trim();
        if (!id) return null;
        const name = String(entry?.name || "").trim() || id;
        return { id, name };
      })
      .filter(entry => {
        if (!entry || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
  }
  
  async function migrateRhAppsFile(legacyPath, targetPath) {
    try {
      await access(targetPath);
      return;
    } catch {}
    try {
      const raw = await readFile(legacyPath, "utf8");
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, raw, "utf8");
    } catch {}
  }
  
  async function readRhSavedApps() {
    syncPaths();
    try {
      await migrateRhAppsFile(legacyRhSavedAppsFilePath, rhSavedAppsFilePath);
      await mkdir(templatesRhDir, { recursive: true });
      const raw = await readFile(rhSavedAppsFilePath, "utf8");
      return normalizeRhSavedApps(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  
  async function writeRhSavedApps(apps) {
    syncPaths();
    const normalized = normalizeRhSavedApps(apps);
    await mkdir(templatesRhDir, { recursive: true });
    await writeFile(rhSavedAppsFilePath, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }
  
  function buildRhDefaultApps(entries = []) {
    const normalized = normalizeRhSavedApps(entries);
    const byId = new Map(normalized.map(app => [app.id, app]));
    const canonical = {
      "2039924771751731201": "SDVN Klein Upscale",
      "2064284416448491522": "SDVN Make Cosplay"
    };
    const built = RH_DEFAULT_WEBAPP_IDS.map(id => {
      const fromFile = byId.get(id);
      const name = String(fromFile?.name || canonical[id] || id).trim() || id;
      return { id, name };
    });
    const nameCounts = new Map();
    for (const app of built) {
      nameCounts.set(app.name, (nameCounts.get(app.name) || 0) + 1);
    }
    return built.map(app => {
      if ((nameCounts.get(app.name) || 0) <= 1) return app;
      return { id: app.id, name: canonical[app.id] || `${app.name} · ${app.id.slice(-6)}` };
    });
  }
  
  async function readRhDefaultApps() {
    syncPaths();
    try {
      await migrateRhAppsFile(legacyRhDefaultAppsFilePath, rhDefaultAppsFilePath);
      let raw;
      try {
        raw = await readFile(rhDefaultAppsFilePath, "utf8");
      } catch {
        raw = await readFile(resourceRhDefaultAppsFilePath, "utf8");
      }
      return buildRhDefaultApps(JSON.parse(raw));
    } catch {
      return buildRhDefaultApps();
    }
  }
  
  async function writeRhDefaultApps(apps) {
    syncPaths();
    const normalized = buildRhDefaultApps(apps);
    await mkdir(configDir, { recursive: true });
    await writeFile(rhDefaultAppsFilePath, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }
  
  async function refreshRhDefaultApps(apiKey) {
    const trimmedKey = String(apiKey || "").trim();
    if (!trimmedKey) {
      throw new Error("Missing RunningHub API key");
    }
    const current = buildRhDefaultApps(await readRhDefaultApps());
    const byId = new Map(current.map(app => [app.id, app]));
    for (const id of RH_DEFAULT_WEBAPP_IDS) {
      try {
        const demo = await getWebappCallDemo(trimmedKey, id);
        const name = String(demo.webappName || "").trim();
        if (name) {
          byId.set(id, { id, name });
        }
      } catch (error) {
        console.warn(`Failed to refresh RunningHub default app ${id}:`, error.message || error);
      }
    }
    return writeRhDefaultApps(RH_DEFAULT_WEBAPP_IDS.map(id => byId.get(id)));
  }
  
  async function handleRhDefaultApps(req, res) {
    send(res, 200, { apps: await readRhDefaultApps() });
  }
  
  async function handleRhDefaultAppsRefresh(req, res) {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const apps = await refreshRhDefaultApps(body.apiKey);
      send(res, 200, { success: true, apps });
    } catch (error) {
      send(res, 400, { error: error.message || "Không cập nhật được app mặc định RunningHub" });
    }
  }
  
  function runningHubHistoryValues(nodes = []) {
    const values = {};
    for (const node of nodes) {
      if (!node?.nodeId || !node?.fieldName) continue;
      values[`${node.nodeId}|${node.fieldName}`] = storage.trimHistoryValue(node.fieldValue ?? "");
    }
    return values;
  }
  
  function attachRhRun(runId, abortController) {
    const pending = pendingSseClients.get(runId);
    const run = {
      abortController,
      cancelled: false,
      sseClients: new Set(pending || []),
      taskId: null
    };
    pendingSseClients.delete(runId);
    activeRhRuns.set(runId, run);
    return run;
  }
  
  function closeRhRun(run, runId) {
    broadcastRunEvent(run, { type: "run_end", data: { runId } });
    for (const client of run.sseClients) {
      try { client.res.end(); } catch {}
    }
    activeRhRuns.delete(runId);
    queueMicrotask(drainBackendRunQueue);
  }
  
  async function handleRunningHubWfWorkflowJson(req, res) {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const apiKey = String(body.apiKey || "").trim();
      const workflowId = String(body.workflowId || "").trim();
      if (!apiKey) {
        send(res, 400, { error: "Missing RunningHub API key" });
        return;
      }
      if (!workflowId) {
        send(res, 400, { error: "Missing RunningHub workflowId" });
        return;
      }
      const workflow = await getWorkflowJson(apiKey, workflowId);
      send(res, 200, { workflow, workflowId });
    } catch (error) {
      send(res, 500, { error: error.message || "Không load được workflow từ RunningHub" });
    }
  }
  async function handleRunningHubNodes(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const apiKey = String(body.apiKey || "").trim();
    const webappId = String(body.webappId || "").trim();
    if (!apiKey) {
      send(res, 400, { error: "Missing RunningHub API key" });
      return;
    }
    if (!webappId) {
      send(res, 400, { error: "Missing RunningHub webappId" });
      return;
    }
    const webapp = await getWebappCallDemo(apiKey, webappId);
    send(res, 200, {
      nodes: webapp.nodeInfoList,
      webappId,
      webappName: webapp.webappName,
      accessEncrypted: webapp.accessEncrypted,
      statisticsInfo: webapp.statisticsInfo,
      covers: webapp.covers,
      tags: webapp.tags
    });
  }
  
  async function handleRunningHubAccountStatus(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const apiKey = String(body.apiKey || "").trim();
    if (!apiKey) {
      send(res, 400, { error: "Missing RunningHub API key" });
      return;
    }
  
    const data = await fetchFullAccountStatus(apiKey);
    send(res, 200, {
      account: {
        keyStatus: "valid",
        apiType: data.apiType ?? null,
        remainCoins: data.remainCoins ?? null,
        remainMoney: data.remainMoney ?? null,
        currency: data.currency ?? null,
        currentTaskCounts: data.currentTaskCounts ?? null,
        refreshedAt: new Date().toISOString()
      }
    });
  }
  
  async function archiveRunningHubOutputs({
    runId,
    webappId,
    workflowId,
    rhMode = "app",
    rhWfTemplateId = "",
    taskId,
    outputs,
    rhCoins = null,
    nodes,
    values: savedValues,
    submittedAt,
    signal,
    onDownloadRetry,
    canvasHistory
  }) {
    const { outputDir } = storage.getPaths();
    await mkdir(outputDir, { recursive: true });
    const completedAt = new Date().toISOString();
    const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(submittedAt || completedAt).getTime());
    const archivedOutputs = [];
    let index = 0;
  
    for (const output of outputs) {
      const fileUrl = output.fileUrl || output.url;
      if (!fileUrl) continue;
      try {
        const response = await fetchWithRetry(fileUrl, {
          signal,
          onRetry: ({ attempt, waitMs }) => {
            onDownloadRetry?.({
              attempt,
              waitMs,
              fileUrl,
              label: `Đang thử tải lại ảnh kết quả RunningHub (${attempt})...`
            });
          }
        });
        const ext = String(output.fileType || path.extname(fileUrl).slice(1) || "png").replace(/^\./, "");
        const filename = `${Date.now()}_${runId}_${index}_rh.${ext}`;
        await writeFile(path.join(outputDir, filename), Buffer.from(await response.arrayBuffer()));
        archivedOutputs.push({
          nodeId: output.nodeId || "runninghub",
          filename,
          originalFilename: path.basename(fileUrl.split("?")[0]),
          url: storage.outputImageUrl(filename),
          remoteUrl: fileUrl
        });
        index += 1;
      } catch {
        // Try remaining outputs; fail only if nothing could be archived.
      }
    }
  
    if (!archivedOutputs.length) {
      throw new Error("RunningHub hoàn tất nhưng không tải được file kết quả sau nhiều lần thử");
    }
  
    const resolvedRhCoins = rhCoins ?? extractRhConsumeCoins(outputs, { data: outputs });
  
    const isWf = rhMode === "wf";
    const resourceId = isWf ? workflowId : webappId;
    const templatePrefix = isWf ? "runninghub-wf" : "runninghub-app";
    const templateId = `${templatePrefix}:${resourceId}`;
    const templateName = isWf
      ? (rhWfTemplateId ? `RH Wf · ${rhWfTemplateId}` : `RunningHub Wf ${workflowId}`)
      : `RunningHub App ${webappId}`;
  
    const item = decorateCanvasHistoryItem({
      id: runId,
      templateId: isWf && rhWfTemplateId ? `runninghub-wf-template:${rhWfTemplateId}` : templateId,
      templateName,
      address: "RunningHub Cloud",
      promptId: String(taskId),
      createdAt: completedAt,
      submittedAt: submittedAt || completedAt,
      completedAt,
      durationMs,
      rhCoins: resolvedRhCoins,
      outputs: archivedOutputs,
      status: "success",
      provider: "runninghub",
      rhMode,
      rhWfTemplateId: isWf ? (rhWfTemplateId || undefined) : undefined,
      webappId: isWf ? undefined : webappId,
      workflowId: isWf ? workflowId : undefined,
      nodes: storage.trimHistoryValue(Array.isArray(nodes) ? nodes : []),
      values: savedValues && Object.keys(savedValues).length
        ? storage.trimHistoryValues(savedValues)
        : runningHubHistoryValues(nodes),
      result: {
        runId,
        taskId: String(taskId),
        template: templateId,
        address: "RunningHub Cloud",
        provider: "runninghub",
        rhMode,
        rhWfTemplateId: isWf ? (rhWfTemplateId || undefined) : undefined,
        webappId: isWf ? undefined : webappId,
        workflowId: isWf ? workflowId : undefined,
        submittedAt: submittedAt || completedAt,
        completedAt,
        durationMs,
        rhCoins: resolvedRhCoins,
        outputs: archivedOutputs
      }
    }, canvasHistory);
    const current = await storage.readOutputHistory();
    await storage.writeOutputHistory(mergeCanvasHistoryItem(current, item));
    return item;
  }
  
  async function handleRunningHubRun(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const runId = body.runId || randomUUID();
    const submittedAt = new Date().toISOString();
    const apiKeys = resolveRhApiKeys(body);
    const tokenPolicy = body.tokenPolicy === RH_TOKEN_POLICY.ROTATE
      ? RH_TOKEN_POLICY.ROTATE
      : RH_TOKEN_POLICY.PRIORITY;
    const rotateIndex = Number(body.rotateIndex) || 0;
    const webappId = String(body.webappId || "").trim();
    const abortController = new AbortController();
    const run = attachRhRun(runId, abortController);
    const existingRunSession = getRunLogSessions().find(session => session.runId === runId);
    ensureRunLogSession({
      runId,
      provider: "runninghub",
      status: "running",
      job: { webappId, queuedAt: body.queuedAt || submittedAt },
      meta: { runKind: body.runKind || existingRunSession?.runKind || "form" }
    });
    const emitRhStatus = (status, label, taskId = run.taskId) => {
      broadcastRunEvent(run, {
        type: "rh_task_status",
        data: { taskId: taskId ? String(taskId) : null, status, label }
      });
    };
  
    const onTokenWait = ({ label, status }) => {
      emitRhStatus(status || "waiting", label || "Đang chờ API key RunningHub rảnh...");
    };
    const onTokenSwitch = ({ label, reason }) => {
      const status = reason === "resource_access" ? "warning" : "waiting";
      emitRhStatus(status, label || "Đang chuyển sang token RunningHub kế tiếp...");
    };
    const onResourceAccessExhausted = ({ label, status }) => {
      emitRhStatus(status || "warning", label);
    };
  
    try {
      if (!apiKeys.length) throw new Error("Missing RunningHub API key");
      if (!webappId) throw new Error("Missing RunningHub webappId");
      if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
        throw new Error("Missing RunningHub node list");
      }
  
      await withRhTokenFailover({
        apiKeys,
        tokenPolicy,
        rotateIndex,
        resourceKind: "app",
        runId,
        signal: abortController.signal,
        onWait: onTokenWait,
        onSwitch: onTokenSwitch,
        onExhausted: onResourceAccessExhausted
      }, async (apiKey) => {
        await waitForRhApiKeyIdle(apiKey, {
          signal: abortController.signal,
          onWait: onTokenWait
        });
  
        const coinsBefore = await fetchAccountRemainCoins(apiKey, abortController.signal);
        emitRhStatus("upload", "Đang upload dữ liệu lên RunningHub...");
        const nodeInfoList = await prepareNodeInfoList(apiKey, body.nodes, {
        inputDir: storage.getPaths().inputDir,
        outputDir: storage.getPaths().outputDir,
          signal: abortController.signal,
          onProgress: ({ label }) => emitRhStatus("upload", label || "Đang upload dữ liệu...")
        });
        emitRhStatus("submit", "Đang gửi task lên RunningHub...");
        const submitData = await submitRhTaskWhenReady(
          apiKey,
          () => submitAiAppTask(apiKey, webappId, nodeInfoList, abortController.signal),
          { signal: abortController.signal, onWait: onTokenWait }
        );
        const taskId = submitData.taskId;
        if (!taskId) throw new Error("RunningHub không trả về taskId");
        run.taskId = taskId;
        broadcastRunEvent(run, {
          type: "rh_task_submitted",
          data: { taskId: String(taskId) }
        });
  
        const promptTips = parsePromptTips(submitData.promptTips);
        if (promptTips?.node_errors && Object.keys(promptTips.node_errors).length > 0) {
          const firstError = Object.entries(promptTips.node_errors)[0];
          throw new Error(`Node ${firstError[0]} lỗi: ${JSON.stringify(firstError[1])}`);
        }
  
        const { outputs, rhCoins } = await waitForTaskOutputs(apiKey, taskId, {
          timeoutMs: runningHubTimeoutMs,
          signal: abortController.signal,
          onStatus: ({ type, label }) => emitRhStatus(type || "waiting", label || "Đang chờ RunningHub...", taskId)
        });
        const resolvedRhCoins = await resolveRhTaskCoins(apiKey, {
          outputs,
          rhCoins,
          coinsBefore,
          signal: abortController.signal
        });
        const historyItem = await archiveRunningHubOutputs({
          runId,
          webappId,
          rhMode: "app",
          taskId,
          outputs,
          rhCoins: resolvedRhCoins,
          nodes: body.nodes,
          submittedAt,
          signal: abortController.signal,
          onDownloadRetry: ({ label, attempt }) => {
            emitRhStatus("download", label, taskId);
            broadcastRunEvent(run, {
              type: "output_download_retry",
              data: { label, attempt, taskId: String(taskId) }
            });
          },
          canvasHistory: body
        });
        send(res, 200, {
          runId,
          taskId: String(taskId),
          provider: "runninghub",
          rhMode: "app",
          webappId,
          submittedAt: historyItem.submittedAt,
          completedAt: historyItem.completedAt,
          durationMs: historyItem.durationMs,
          rhCoins: historyItem.rhCoins,
          outputs: historyItem.outputs,
          historyItem
        });
      });
    } finally {
      closeRhRun(run, runId);
    }
  }
  
  async function handleRunningHubWfRun(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const runId = body.runId || randomUUID();
    const submittedAt = new Date().toISOString();
    const apiKeys = resolveRhApiKeys(body);
    const tokenPolicy = body.tokenPolicy === RH_TOKEN_POLICY.ROTATE
      ? RH_TOKEN_POLICY.ROTATE
      : RH_TOKEN_POLICY.PRIORITY;
    const rotateIndex = Number(body.rotateIndex) || 0;
    const templateId = String(body.templateId || "").trim();
    const abortController = new AbortController();
    const run = attachRhRun(runId, abortController);
    const existingRunSession = getRunLogSessions().find(session => session.runId === runId);
    ensureRunLogSession({
      runId,
      provider: "runninghub",
      status: "running",
      job: { templateId, queuedAt: body.queuedAt || submittedAt },
      meta: { runKind: body.runKind || existingRunSession?.runKind || "form" }
    });
    const emitRhStatus = (status, label, taskId = run.taskId) => {
      broadcastRunEvent(run, {
        type: "rh_task_status",
        data: { taskId: taskId ? String(taskId) : null, status, label }
      });
    };
  
    const onTokenWait = ({ label, status }) => {
      emitRhStatus(status || "waiting", label || "Đang chờ API key RunningHub rảnh...");
    };
    const onTokenSwitch = ({ label, reason }) => {
      const status = reason === "resource_access" ? "warning" : "waiting";
      emitRhStatus(status, label || "Đang chuyển sang token RunningHub kế tiếp...");
    };
    const onResourceAccessExhausted = ({ label, status }) => {
      emitRhStatus(status || "warning", label);
    };
  
    try {
      if (!apiKeys.length) throw new Error("Missing RunningHub API key");
      if (!templateId) throw new Error("Missing RunningHub Workflow template");
  
      const { config, template } = await storage.getTemplates().loadConfig(templateId, TEMPLATE_SCOPES.runninghubWf);
      const sourceWorkflowId = String(config.runninghub?.workflowId || "").trim();
      const taskOptions = storage.getTemplates().runningHubTaskOptions(config);
      const useSavedWorkflowJson = storage.getTemplates().usesSavedWorkflowJson(config, template);
      if (!sourceWorkflowId && !useSavedWorkflowJson) {
        throw new Error("Template thiếu runninghub.workflowId");
      }
  
      const normalized = await normalizeValues(body.values || {});
      const request = mapValuesToRequest(config, normalized);
      if (!Object.keys(request).length) {
        throw new Error("Template chưa có input nào để gửi");
      }
  
      await withRhTokenFailover({
        apiKeys,
        tokenPolicy,
        rotateIndex,
        resourceKind: "workflow",
        runId,
        signal: abortController.signal,
        onWait: onTokenWait,
        onSwitch: onTokenSwitch,
        onExhausted: onResourceAccessExhausted
      }, async (apiKey) => {
        await waitForRhApiKeyIdle(apiKey, {
          signal: abortController.signal,
          onWait: onTokenWait
        });
  
        const coinsBefore = await fetchAccountRemainCoins(apiKey, abortController.signal);
        emitRhStatus("upload", "Đang chuẩn bị dữ liệu workflow...");
        const emitPrepareProgress = ({ type, status, label } = {}) => {
          if (!label) return;
          emitRhStatus(type || status || "upload", label);
        };
        const mappedFieldCount = Object.keys(request).length;
        let submitData;
        if (useSavedWorkflowJson) {
          if (!template.workflowPath) {
            throw new Error("Template bật lưu JSON nhưng thiếu file api.json");
          }
          emitRhStatus("upload", `Đang đọc api.json và patch ${mappedFieldCount} input...`);
          const workflow = structuredClone(JSON.parse(await readFile(template.workflowPath, "utf8")));
          const patchedWorkflow = await buildPatchedRunningHubWorkflow(workflow, request, apiKey, {
            inputDir: storage.getPaths().inputDir,
            outputDir: storage.getPaths().outputDir,
            signal: abortController.signal,
            onProgress: emitPrepareProgress
          });
          emitRhStatus("submit", "Đang gửi workflow lên RunningHub...");
          submitData = await submitRhTaskWhenReady(
            apiKey,
            () => submitWorkflowTask(apiKey, {
              workflow: patchedWorkflow,
              ...taskOptions,
              workflowId: sourceWorkflowId
            }, abortController.signal),
            { signal: abortController.signal, onWait: onTokenWait }
          );
        } else {
          emitRhStatus("upload", `Đang chuẩn bị ${mappedFieldCount} input cho workflow...`);
          const nodeInfoList = await buildRunningHubNodeInfoList(request, apiKey, {
            inputDir: storage.getPaths().inputDir,
            outputDir: storage.getPaths().outputDir,
            signal: abortController.signal,
            onProgress: emitPrepareProgress
          });
          emitRhStatus("submit", `Đang gửi workflow lên RunningHub (${nodeInfoList.length} field)...`);
          submitData = await submitRhTaskWhenReady(
            apiKey,
            () => submitWorkflowTask(apiKey, {
              nodeInfoList,
              ...taskOptions,
              workflowId: sourceWorkflowId
            }, abortController.signal),
            { signal: abortController.signal, onWait: onTokenWait }
          );
        }
        const taskId = submitData.taskId;
        if (!taskId) throw new Error("RunningHub không trả về taskId");
        run.taskId = taskId;
        broadcastRunEvent(run, {
          type: "rh_task_submitted",
          data: { taskId: String(taskId) }
        });
  
        const promptTips = parsePromptTips(submitData.promptTips);
        if (promptTips?.node_errors && Object.keys(promptTips.node_errors).length > 0) {
          const firstError = Object.entries(promptTips.node_errors)[0];
          throw new Error(`Node ${firstError[0]} lỗi: ${JSON.stringify(firstError[1])}`);
        }
  
        const { outputs, rhCoins } = await waitForTaskOutputs(apiKey, taskId, {
          timeoutMs: runningHubTimeoutMs,
          signal: abortController.signal,
          onStatus: ({ type, label }) => emitRhStatus(type || "waiting", label || "Đang chờ RunningHub...", taskId)
        });
        const resolvedRhCoins = await resolveRhTaskCoins(apiKey, {
          outputs,
          rhCoins,
          coinsBefore,
          signal: abortController.signal
        });
        const historyItem = await archiveRunningHubOutputs({
          runId,
          workflowId: sourceWorkflowId,
          rhMode: "wf",
          rhWfTemplateId: templateId,
          taskId,
          outputs,
          rhCoins: resolvedRhCoins,
          nodes: [],
          values: body.values || {},
          submittedAt,
          signal: abortController.signal,
          onDownloadRetry: ({ label, attempt }) => {
            emitRhStatus("download", label, taskId);
            broadcastRunEvent(run, {
              type: "output_download_retry",
              data: { label, attempt, taskId: String(taskId) }
            });
          },
          canvasHistory: body
        });
        send(res, 200, {
          runId,
          taskId: String(taskId),
          provider: "runninghub",
          rhMode: "wf",
          workflowId: sourceWorkflowId,
          templateId,
          submittedAt: historyItem.submittedAt,
          completedAt: historyItem.completedAt,
          durationMs: historyItem.durationMs,
          rhCoins: historyItem.rhCoins,
          outputs: historyItem.outputs,
          historyItem
        });
      });
    } finally {
      closeRhRun(run, runId);
    }
  }
  
  async function handleRunningHubCancel(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    if (await cancelQueuedBackendRun(body.runId)) {
      send(res, 200, { cancelled: true, queued: true, message: "Removed from backend queue" });
      return;
    }
    const run = activeRhRuns.get(body.runId);
    if (!run) {
      send(res, 200, { cancelled: false, message: "Run is not active" });
      return;
    }
    run.cancelled = true;
    run.abortController.abort();
    send(res, 200, { cancelled: true, message: "Đã hủy task RunningHub đang chờ" });
  }
  
  async function handleRunningHubTaskCheck(req, res) {
    const body = JSON.parse(await readBody(req) || "{}");
    const apiKey = String(body.apiKey || "").trim();
    const taskId = String(body.taskId || "").trim();
    if (!apiKey) {
      send(res, 400, { error: "Missing RunningHub API key" });
      return;
    }
    if (!taskId) {
      send(res, 400, { error: "Missing taskId" });
      return;
    }
    const detail = await inspectRhTask(apiKey, taskId);
    send(res, 200, { detail });
  }

  return {
    handleRhDefaultApps,
    handleRhDefaultAppsRefresh,
    handleRunningHubAccountStatus,
    handleRunningHubCancel,
    handleRunningHubNodes,
    handleRunningHubRun,
    handleRunningHubTaskCheck,
    handleRunningHubWfRun,
    handleRunningHubWfWorkflowJson,
    readRhSavedApps,
    writeRhSavedApps,
    syncPaths
  };
}
