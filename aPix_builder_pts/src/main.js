import {
  state,
  els,
  BUILTIN_TEMPLATES,
  BUILTIN_RH_TEMPLATES,
  SETTINGS_KEY,
  TEMPLATE_FOLDER_KEY,
  DEFAULT_SERVER,
  byId,
  setStatus,
  setProgress,
  setImageInputValue,
  readSettings,
  saveSettings,
  normalizeId
} from "./state.js";

import {
  getSelectionInfo,
  prepareSelectionLayerInputDataUrl,
  exportActiveDocumentDataUrl,
  importBufferAsLayer
} from "./services/photoshop.js";

import {
  normalizeComfyTarget,
  setWorkflowValue,
  queuePrompt,
  waitForPromptCompletion,
  getHistory,
  collectOutputs,
  fetchOutputBytes,
  fetchServerChoices
} from "./services/comfy.js";

import {
  flattenInputs,
  buildDefaults,
  requestPayload,
  validateWorkflowMappings,
  normalizeValues,
  isImageInputItem,
  getActiveInputItems
} from "./services/workflow.js";

import {
  renderDynamicForm,
  updateServerSelects
} from "./ui/form.js";

import {
  buildPatchedRunningHubWorkflow,
  buildRunningHubDefaults,
  buildRunningHubNodeInfoList,
  DEFAULT_RH_WEBAPP_ID,
  extractRunningHubWorkflowId,
  fetchRunningHubOutputBytes,
  getWebappNodes,
  isRunningHubWfTemplate,
  listNodeChoices,
  nodeFieldKey,
  nodesWithValues,
  outputFilename,
  parsePromptTips,
  prepareNodeInfoList,
  RUNNINGHUB_APP_OPTIONS,
  runningHubTaskOptions,
  saveExecutionMode,
  saveRunningHubSettings,
  submitAiAppTask,
  submitWorkflowTask,
  usesSavedWorkflowJson,
  waitForTaskOutputs
} from "./services/runninghub.js";

import YAML from "yaml";

const fs = require("fs");
const { storage } = require("uxp");
const SETTINGS_COLLAPSED_KEY = "apix-builder:settings-collapsed:v1";

function cloneData(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function currentExecutionMode() {
  const mode = state.settings.executionMode;
  if (mode === "runninghub" || mode === "runninghub-app") return "runninghub-app";
  if (mode === "runninghub-wf") return "runninghub-wf";
  return "local";
}

function isRunningHubAppMode() {
  return currentExecutionMode() === "runninghub-app";
}

function isRunningHubWfMode() {
  return currentExecutionMode() === "runninghub-wf";
}

function isRunningHubMode() {
  return isRunningHubAppMode() || isRunningHubWfMode();
}

function currentTemplateScope() {
  return isRunningHubWfMode() ? "runninghub-wf" : "local";
}

function runningHubNodeToInput(node) {
  const fieldType = String(node.fieldType || "").toUpperCase();
  const value = state.runningHubNodeValues[nodeFieldKey(node)] ?? node.fieldValue ?? "";
  const choices = listNodeChoices(node);
  const isLongText = String(value || "").length > 80 || /prompt|text|caption|value/i.test(node.fieldName || "");
  const type = fieldType === "IMAGE" ? "image"
    : fieldType === "AUDIO" || fieldType === "VIDEO" ? "file"
      : fieldType === "LIST" ? "dropdown"
        : fieldType === "INT" || fieldType === "INTEGER" ? "int"
          : fieldType === "FLOAT" || fieldType === "NUMBER" ? "float"
            : isLongText ? "text"
              : "string";
  return {
    key: nodeFieldKey(node),
    id: nodeFieldKey(node),
    ui: {
      type,
      label: node.description || node.nodeName || node.fieldName || node.nodeId,
      choices,
      value,
      lines: isLongText ? 4 : undefined
    }
  };
}

function renderRunningHubForm() {
  state.values = state.runningHubNodeValues;
  els.workflowTitle.textContent = "RunningHub Inputs";
  renderDynamicForm(state.runningHubNodes.map(runningHubNodeToInput));
}

function renderLocalForm() {
  state.values = state.localValues;
  const inputs = flattenInputs(state.config?.input || {});
  els.workflowTitle.textContent = state.config?.app?.name || state.selectedTemplate?.name || "Inputs";
  renderDynamicForm(inputs);
}

function renderActiveForm() {
  if (isRunningHubAppMode()) {
    renderRunningHubForm();
  } else if (state.config) {
    renderLocalForm();
  } else {
    els.dynamicForm.innerHTML = "";
    els.workflowTitle.textContent = "Inputs";
  }
}

function syncModeVisibility() {
  const runningHub = isRunningHubMode();
  const runningHubApp = isRunningHubAppMode();
  els.runningHubSettings.hidden = !runningHub;
  if (els.runningHubAppSettings) {
    els.runningHubAppSettings.hidden = !runningHubApp;
    els.runningHubAppSettings.style.display = runningHubApp ? "" : "none";
  }
  const serverRow = findServerRow();
  if (serverRow) {
    serverRow.hidden = runningHub;
    serverRow.style.display = runningHub ? "none" : "";
  }
  if (els.localWorkflowSettings) {
    els.localWorkflowSettings.hidden = runningHubApp;
    els.localWorkflowSettings.style.display = runningHubApp ? "none" : "";
  }
  els.testConnectionBtn.disabled = runningHub;
  els.templateSelect.disabled = runningHubApp;
  els.chooseTemplateFolderBtn.disabled = runningHubApp;
  els.runBtn.textContent = "Run";
  syncRunningHubAppUi();
}

function syncRunningHubAppUi() {
  if (!els.runningHubAppSelect || !els.runningHubCustomWebappField) return;
  const isCustom = els.runningHubAppSelect.value === "custom";
  els.runningHubCustomWebappField.hidden = !isCustom;
  els.runningHubCustomWebappField.style.display = isCustom ? "" : "none";
}

function applySettingsToUi() {
  els.serverUrlInput.value = state.settings.serverUrl;
  els.executionModeSelect.value = currentExecutionMode();
  els.runningHubApiKeyInput.value = state.settings.runningHub?.apiKey || "";
  const webappId = state.settings.runningHub?.webappId || DEFAULT_RH_WEBAPP_ID;
  const knownApp = RUNNINGHUB_APP_OPTIONS.find(app => app.id === webappId);
  els.runningHubAppSelect.value = knownApp ? knownApp.id : "custom";
  els.runningHubCustomWebappIdInput.value = knownApp ? "" : webappId;
  syncModeVisibility();
}

async function loadBuiltInTemplate(id, scope = "local") {
  const pluginRoot = scope === "runninghub-wf" ? "plugin:templates-rh" : "plugin:templates";
  const config = JSON.parse(fs.readFileSync(`${pluginRoot}/${id}/app_build.json`, "utf8"));
  let workflow = null;
  try {
    workflow = JSON.parse(fs.readFileSync(`${pluginRoot}/${id}/api.json`, "utf8"));
  } catch {
    workflow = null;
  }
  return {
    id,
    name: config?.app?.name || id,
    source: "bundled",
    scope,
    config,
    workflow
  };
}

async function readFolderText(folder, name) {
  const file = await folder.getEntry(name);
  return file.read();
}

async function readFolderConfig(folder) {
  try {
    return JSON.parse(await readFolderText(folder, "app_build.json"));
  } catch {
    try {
      const raw = await readFolderText(folder, "app_build.yaml");
      const config = YAML.parse(raw);
      if (config?.runninghub) {
        config.runninghub.workflowId = extractRunningHubWorkflowId(raw, config);
      }
      return config;
    } catch {
      throw new Error("Folder must contain app_build.json or app_build.yaml.");
    }
  }
}

async function loadFolderTemplate(folder, options = {}) {
  const config = await readFolderConfig(folder);
  let workflow = null;
  try {
    workflow = JSON.parse(await readFolderText(folder, "api.json"));
  } catch {
    workflow = null;
  }
  const scope = isRunningHubWfTemplate(config) ? "runninghub-wf" : "local";
  return {
    id: options.id || `folder:${folder.name}`,
    name: options.name || `${config?.app?.name || folder.name} (folder)`,
    source: "folder",
    scope,
    folder,
    config,
    workflow
  };
}

function isFolderEntry(entry) {
  return Boolean(entry?.isFolder || entry?.isDirectory || entry?.getEntries);
}

async function folderEntries(folder) {
  try {
    return await folder.getEntries();
  } catch {
    return [];
  }
}

async function loadFolderTemplates(folder) {
  const templates = [];
  const errors = [];

  try {
    templates.push(await loadFolderTemplate(folder));
  } catch (error) {
    errors.push(`${folder.name}: ${error.message}`);
  }

  for (const entry of await folderEntries(folder)) {
    if (!isFolderEntry(entry)) continue;
    try {
      templates.push(await loadFolderTemplate(entry, {
        id: `folder:${folder.name}/${entry.name}`
      }));
      const last = templates[templates.length - 1];
      last.name = `${last.config?.app?.name || entry.name} (${entry.name})`;
    } catch (error) {
      errors.push(`${entry.name}: ${error.message}`);
    }
  }

  if (!templates.length) {
    throw new Error(`No valid templates found. Expected template folders with api.json and app_build.json or app_build.yaml.${errors.length ? ` First error: ${errors[0]}` : ""}`);
  }
  return templates;
}

async function loadBundledTemplates(scope = "local") {
  const templates = [];
  const errors = [];
  const ids = scope === "runninghub-wf" ? BUILTIN_RH_TEMPLATES : BUILTIN_TEMPLATES;
  for (const id of ids) {
    try {
      templates.push(await loadBuiltInTemplate(id, scope));
    } catch (error) {
      errors.push(`${id}: ${error.message}`);
      console.warn(`Failed to load bundled template ${id}`, error);
    }
  }
  return { templates, errors };
}

async function loadTemplates() {
  const scope = currentTemplateScope();
  const { templates, errors } = await loadBundledTemplates(scope);
  try {
    const token = localStorage.getItem(TEMPLATE_FOLDER_KEY);
    if (token && !isRunningHubAppMode()) {
      const folder = await storage.localFileSystem.getEntryForPersistentToken(token);
      const folderTemplates = (await loadFolderTemplates(folder))
        .filter(template => template.scope === scope);
      templates.push(...folderTemplates);
    }
  } catch (error) {
    console.warn("Stored template folder is no longer available", error);
  }
  state.templates = templates;
  els.templateSelect.innerHTML = "";
  for (const template of templates) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    els.templateSelect.append(option);
  }
  if (templates.length) {
    await selectTemplate(templates[0].id);
  } else if (isRunningHubAppMode()) {
    state.selectedTemplate = null;
    state.config = null;
    state.workflow = null;
    renderActiveForm();
    setStatus("RunningHub AI App mode — load nodes to begin");
  } else {
    setStatus(errors.length ? `No templates found: ${errors[0]}` : "No templates found");
  }
}

async function chooseTemplateFolder() {
  try {
    const folder = await storage.localFileSystem.getFolder();
    const token = await storage.localFileSystem.createPersistentToken(folder);
    localStorage.setItem(TEMPLATE_FOLDER_KEY, token);
    const scope = currentTemplateScope();
    const templates = (await loadFolderTemplates(folder))
      .filter(template => template.scope === scope);
    if (!templates.length) {
      throw new Error(scope === "runninghub-wf"
        ? "No RunningHub Workflow templates found (missing runninghub.workflowId in YAML)"
        : "No local ComfyUI templates found in folder");
    }
    state.templates = state.templates.filter(item => item.source !== "folder").concat(templates);
    await refreshTemplateSelect(templates[0].id);
    setStatus(`Loaded ${templates.length} template(s) from ${folder.name}`);
  } catch (error) {
    setStatus(`Cannot load folder: ${error.message}`);
  }
}

async function refreshTemplateSelect(selectedId) {
  els.templateSelect.innerHTML = "";
  for (const template of state.templates) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    els.templateSelect.append(option);
  }
  await selectTemplate(selectedId || state.templates[0]?.id);
}

async function selectTemplate(id) {
  const template = state.templates.find(item => item.id === id);
  if (!template) return;
  try {
    state.selectedTemplate = template;
    state.config = cloneData(template.config);
    state.workflow = template.workflow ? cloneData(template.workflow) : null;
    const rhWf = template.scope === "runninghub-wf" || isRunningHubWfTemplate(state.config);
    if (rhWf && !isRunningHubWfTemplate(state.config)) {
      throw new Error("RunningHub Workflow template is missing runninghub.workflowId");
    }
    if (state.workflow) {
      validateWorkflowMappings(state.config, state.workflow, { requireOutput: !rhWf });
    } else if (rhWf && usesSavedWorkflowJson(state.config, false)) {
      throw new Error("Template enables saveWorkflowJson but api.json is missing");
    }
    const inputs = flattenInputs(state.config.input || {});
    state.localValues = buildDefaults(inputs);
    if (!isRunningHubAppMode()) state.values = state.localValues;
    state.imageValues = {};
    state.imageSources = {};
    state.imagePreviews = {};
    els.templateSelect.value = id;
    renderActiveForm();
    setStatus(`Loaded workflow ${template.name}`);
    if (!isRunningHubMode()) {
      fetchServerChoices().then(() => updateServerSelects()).catch(() => {});
    }
  } catch (error) {
    state.selectedTemplate = null;
    state.config = null;
    state.workflow = null;
    state.values = {};
    state.localValues = {};
    state.imageValues = {};
    state.imageSources = {};
    state.imagePreviews = {};
    els.dynamicForm.innerHTML = "";
    els.workflowTitle.textContent = "Inputs";
    setStatus(`Workflow load failed: ${error.message}`);
  }
}

function selectedTemplateId() {
  const selected = els.templateSelect.options?.[els.templateSelect.selectedIndex];
  return selected?.value || els.templateSelect.value;
}

async function testConnection() {
  try {
    const raw = els.serverUrlInput.value.trim() || DEFAULT_SERVER;
    const target = normalizeComfyTarget(raw);
    state.settings.serverUrl = target.label;
    els.serverUrlInput.value = target.label;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    setStatus("Connecting...");
    const response = await fetch(`${target.httpBase}/system_stats`, {
      headers: target.headers,
      credentials: "omit"
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    setStatus("Saved — ComfyUI connected");
    fetchServerChoices().then(() => updateServerSelects()).catch(() => {});
  } catch (error) {
    const msg = error.message || String(error);
    if (/failed to fetch|network|blocked|insecure/i.test(msg)) {
      setStatus("Connection failed: check server URL and reload plugin if HTTP is blocked");
    } else {
      setStatus(`Connection failed: ${msg}`);
    }
  }
}

async function loadRunningHubNodes() {
  saveSettings();
  const apiKey = state.settings.runningHub.apiKey.trim();
  const webappId = state.settings.runningHub.webappId.trim();
  if (!apiKey) {
    setStatus("Missing RunningHub API key");
    return [];
  }
  if (!webappId) {
    setStatus("Missing RunningHub WebApp ID");
    return [];
  }
  state.runningHubNodesLoading = true;
  state.runningHubNodesError = "";
  els.loadRunningHubNodesBtn.disabled = true;
  setStatus("Loading RunningHub nodeInfoList...");
  try {
    const nodes = await getWebappNodes(apiKey, webappId, state.abortController?.signal);
    state.runningHubNodes = nodes;
    state.runningHubNodeValues = buildRunningHubDefaults(nodes);
    if (isRunningHubAppMode()) renderRunningHubForm();
    setStatus(nodes.length ? `Loaded ${nodes.length} RunningHub node(s)` : "RunningHub returned 0 nodes");
    return nodes;
  } catch (error) {
    state.runningHubNodes = [];
    state.runningHubNodeValues = {};
    state.runningHubNodesError = error.message;
    if (isRunningHubAppMode()) renderRunningHubForm();
    setStatus(`RunningHub load failed: ${error.message}`);
    return [];
  } finally {
    state.runningHubNodesLoading = false;
    els.loadRunningHubNodesBtn.disabled = false;
  }
}

function switchExecutionMode(mode) {
  const nextMode = mode === "runninghub" || mode === "runninghub-app"
    ? "runninghub-app"
    : mode === "runninghub-wf"
      ? "runninghub-wf"
      : "local";
  if (isRunningHubAppMode()) state.runningHubNodeValues = state.values;
  else state.localValues = state.values;
  state.settings.executionMode = nextMode;
  saveExecutionMode(nextMode);
  saveSettings();
  syncModeVisibility();
  loadTemplates().then(() => {
    if (nextMode === "runninghub-app") {
      state.values = state.runningHubNodeValues;
      renderRunningHubForm();
      if (!state.runningHubNodes.length && state.settings.runningHub.apiKey) {
        loadRunningHubNodes().catch(error => setStatus(`RunningHub load failed: ${error.message}`));
      }
    } else if (nextMode === "runninghub-wf") {
      state.values = state.localValues;
      renderLocalForm();
    } else {
      state.values = state.localValues;
      renderLocalForm();
      fetchServerChoices().then(() => updateServerSelects()).catch(() => {});
    }
  }).catch(error => setStatus(`Mode switch failed: ${error.message}`));
}

async function runRunningHubWorkflow(selectionInfo) {
  const apiKey = state.settings.runningHub.apiKey.trim();
  const webappId = state.settings.runningHub.webappId.trim();
  if (!apiKey) throw new Error("Missing RunningHub API key");
  if (!webappId) throw new Error("Missing RunningHub WebApp ID");
  if (!state.runningHubNodes.length) {
    const nodes = await loadRunningHubNodes();
    if (!nodes.length) throw new Error("RunningHub node list is empty");
  }

  const imageItems = state.runningHubNodes
    .filter(node => String(node.fieldType || "").toUpperCase() === "IMAGE")
    .map(runningHubNodeToInput);
  if (selectionInfo && imageItems.length) {
    const key = normalizeId(imageItems[0].id);
    setStatus("Selection detected, using selected pixels for RunningHub image input...");
    const selectionDataUrl = await prepareSelectionLayerInputDataUrl(selectionInfo, key);
    state.values[key] = selectionDataUrl;
    state.runningHubNodeValues[key] = selectionDataUrl;
  } else {
    const missingImageItems = imageItems.filter(item => {
      const key = normalizeId(item.id);
      const val = state.values[key];
      return !val || (typeof val === "string" && !val.startsWith("data:"));
    });
    if (missingImageItems.length) {
      setStatus("No RunningHub image input set — using active document...");
      const docDataUrl = await exportActiveDocumentDataUrl();
      for (const item of missingImageItems) {
        const key = normalizeId(item.id);
        setImageInputValue(key, docDataUrl, "document");
      }
    }
  }

  const nodeInfoList = await prepareNodeInfoList(
    apiKey,
    nodesWithValues(state.runningHubNodes, state.values),
    state.abortController.signal,
    setStatus
  );
  setStatus("Submitting RunningHub task...");
  const submitted = await submitAiAppTask(apiKey, webappId, nodeInfoList, state.abortController.signal);
  const taskId = submitted.taskId;
  if (!taskId) throw new Error("RunningHub did not return taskId");
  state.activeRunningHubTaskId = String(taskId);
  setStatus(`RunningHub task ${taskId} queued`);
  const outputs = await waitForTaskOutputs(apiKey, taskId, {
    signal: state.abortController.signal,
    onStatus: setStatus
  });
  let importedCount = 0;
  for (const [index, output] of outputs.entries()) {
    const { buffer } = await fetchRunningHubOutputBytes(output, state.abortController.signal);
    await importBufferAsLayer(buffer, outputFilename(output, index), selectionInfo);
    importedCount += 1;
  }
  setStatus(outputs.length
    ? `RunningHub task ${taskId} completed, imported ${importedCount} layer(s)`
    : `RunningHub task ${taskId} completed, no output files found`);
}

function activeImageInputs(inputs) {
  return getActiveInputItems(inputs, state.values)
    .filter(item => item.id && isImageInputItem(item));
}

function requestKeys(item) {
  return Array.isArray(item.id) ? item.id : [item.id];
}

function setRequestImageValue(request, item, dataUrl) {
  for (const requestKey of requestKeys(item)) {
    request[requestKey] = dataUrl;
  }
}

async function runRunningHubWfWorkflow(selectionInfo) {
  const apiKey = state.settings.runningHub.apiKey.trim();
  if (!apiKey) throw new Error("Missing RunningHub API key");
  if (!state.config) throw new Error("Select a RunningHub Workflow template first");

  const workflowId = String(state.config.runninghub?.workflowId || "").trim();
  const hasWorkflowFile = Boolean(state.workflow);
  const useSavedJson = usesSavedWorkflowJson(state.config, hasWorkflowFile);
  if (!workflowId && !useSavedJson) {
    throw new Error("Template is missing runninghub.workflowId");
  }
  if (useSavedJson && !state.workflow) {
    throw new Error("Template enables saveWorkflowJson but api.json is missing");
  }

  const inputs = flattenInputs(state.config.input || {});
  const request = requestPayload(inputs, state.values);
  const imageInputs = activeImageInputs(inputs);
  if (selectionInfo) {
    const imageInput = imageInputs[0];
    if (imageInput) {
      const imageKey = normalizeId(imageInput.id);
      const selectionDataUrl = await prepareSelectionLayerInputDataUrl(selectionInfo, imageKey);
      setRequestImageValue(request, imageInput, selectionDataUrl);
    }
  } else {
    const missingImageInputs = imageInputs.filter(item => {
      const key = normalizeId(item.id);
      const val = state.values[key];
      return !val || (typeof val === "string" && !val.startsWith("data:"));
    });
    if (missingImageInputs.length > 0) {
      setStatus("No image input set — using active document...");
      const docDataUrl = await exportActiveDocumentDataUrl();
      for (const item of missingImageInputs) {
        const key = normalizeId(item.id);
        setImageInputValue(key, docDataUrl, "document");
        setRequestImageValue(request, item, docDataUrl);
      }
    }
  }

  const normalized = await normalizeValues(request);
  const taskOptions = runningHubTaskOptions(state.config);
  const signal = state.abortController.signal;
  let submitData;

  if (useSavedJson) {
    setStatus("Patching workflow for RunningHub...");
    const patchedWorkflow = await buildPatchedRunningHubWorkflow(
      state.workflow,
      normalized,
      apiKey,
      { signal, onStatus: setStatus }
    );
    setStatus("Submitting RunningHub workflow task...");
    submitData = await submitWorkflowTask(apiKey, {
      workflow: patchedWorkflow,
      workflowId,
      ...taskOptions
    }, signal);
  } else {
    setStatus("Preparing RunningHub node list...");
    const nodeInfoList = await buildRunningHubNodeInfoList(normalized, apiKey, {
      signal,
      onStatus: setStatus
    });
    setStatus("Submitting RunningHub workflow task...");
    submitData = await submitWorkflowTask(apiKey, {
      nodeInfoList,
      workflowId,
      ...taskOptions
    }, signal);
  }

  const promptTips = parsePromptTips(submitData.promptTips);
  if (promptTips?.node_errors && Object.keys(promptTips.node_errors).length > 0) {
    const firstError = Object.entries(promptTips.node_errors)[0];
    throw new Error(`Node ${firstError[0]} error: ${JSON.stringify(firstError[1])}`);
  }

  const taskId = submitData.taskId;
  if (!taskId) throw new Error("RunningHub did not return taskId");
  state.activeRunningHubTaskId = String(taskId);
  setStatus(`RunningHub task ${taskId} queued`);
  const outputs = await waitForTaskOutputs(apiKey, taskId, {
    signal,
    onStatus: setStatus
  });
  let importedCount = 0;
  for (const [index, output] of outputs.entries()) {
    const { buffer } = await fetchRunningHubOutputBytes(output, signal);
    await importBufferAsLayer(buffer, outputFilename(output, index), selectionInfo);
    importedCount += 1;
  }
  setStatus(outputs.length
    ? `RunningHub task ${taskId} completed, imported ${importedCount} layer(s)`
    : `RunningHub task ${taskId} completed, no output files found`);
}

async function runWorkflow() {
  if (state.running) {
    setStatus("Workflow is already running");
    return;
  }
  state.running = true;
  if (!isRunningHubAppMode() && (!state.config || (!state.workflow && !isRunningHubWfMode()))) {
    await selectTemplate(selectedTemplateId());
    if (!state.config) {
      setStatus("Select a workflow first");
      state.running = false;
      return;
    }
  }
  saveSettings();
  els.runBtn.disabled = true;
  els.cancelBtn.disabled = false;
  setProgress();
  state.abortController = new AbortController();

  try {
    setStatus("Starting workflow...");
    const selectionInfo = await getSelectionInfo();
    if (selectionInfo) setStatus("Selection detected, preparing selection-aware run...");
    if (isRunningHubAppMode()) {
      await runRunningHubWorkflow(selectionInfo);
      setProgress();
      return;
    }
    if (isRunningHubWfMode()) {
      await runRunningHubWfWorkflow(selectionInfo);
      setProgress();
      return;
    }
    const target = normalizeComfyTarget(state.settings.serverUrl);
    const workflow = cloneData(state.workflow);
    const inputs = flattenInputs(state.config.input || {});
    const request = requestPayload(inputs, state.values);
    const imageInputs = activeImageInputs(inputs);
    if (selectionInfo) {
      const imageInput = imageInputs[0];
      if (imageInput) {
        const imageKey = normalizeId(imageInput.id);
        const selectionDataUrl = await prepareSelectionLayerInputDataUrl(selectionInfo, imageKey);
        setRequestImageValue(request, imageInput, selectionDataUrl);
      }
    } else {
      const missingImageInputs = imageInputs.filter(item => {
        const key = normalizeId(item.id);
        const val = state.values[key];
        return !val || (typeof val === "string" && !val.startsWith("data:"));
      });
      if (missingImageInputs.length > 0) {
        setStatus("No image input set — using active document...");
        const docDataUrl = await exportActiveDocumentDataUrl();
        for (const item of missingImageInputs) {
          const key = normalizeId(item.id);
          setImageInputValue(key, docDataUrl, "document");
          setRequestImageValue(request, item, docDataUrl);
        }
      }
    }
    const normalized = await normalizeValues(request);
    setStatus("Patching workflow...");
    for (const [id, value] of Object.entries(normalized)) {
      await setWorkflowValue(workflow, id, value, target, state.abortController.signal);
    }
    setStatus("Queueing prompt...");
    const queued = await queuePrompt(target, workflow, state.abortController.signal);
    state.activePromptId = queued.prompt_id;
    setStatus(`Queued prompt ${queued.prompt_id}`);
    await waitForPromptCompletion(target, queued.prompt_id, state.abortController.signal);
    setStatus("Loading output history...");
    const historyRoot = await getHistory(target, queued.prompt_id, state.abortController.signal);
    const outputs = collectOutputs(state.config, historyRoot[queued.prompt_id], target);

    let importedCount = 0;
    for (const output of outputs) {
      const { buffer } = await fetchOutputBytes(output, state.abortController.signal);
      await importBufferAsLayer(buffer, output.filename, selectionInfo);
      importedCount += 1;
    }
    setProgress();
    setStatus(outputs.length
      ? `Completed prompt ${queued.prompt_id}, imported ${importedCount} layer(s)`
      : `Completed prompt ${queued.prompt_id}, no output images found`);
  } catch (error) {
    setProgress();
    setStatus(`Run failed: ${error.message}`);
    console.error(error);
  } finally {
    els.runBtn.disabled = false;
    els.cancelBtn.disabled = true;
    state.abortController = null;
    state.activePromptId = null;
    state.activeRunningHubTaskId = null;
    state.running = false;
  }
}

async function cancelRun() {
  try {
    if (!state.abortController && !state.activePromptId) {
      setStatus("No active request to cancel");
      return;
    }
    state.abortController?.abort();
    state.activeWebSocket?.close();
    if (isRunningHubAppMode() || isRunningHubWfMode()) {
      setStatus(state.activeRunningHubTaskId
        ? `Cancelled local wait for RunningHub task ${state.activeRunningHubTaskId}`
        : "Cancelled RunningHub request");
      return;
    }
    const target = normalizeComfyTarget(state.settings.serverUrl);
    await fetch(`${target.httpBase}/interrupt`, {
      method: "POST",
      headers: { "content-type": "application/json", ...target.headers },
      body: "{}"
    });
    setStatus(state.activePromptId ? `Interrupt requested for prompt ${state.activePromptId}` : "Global interrupt requested");
  } catch (error) {
    setStatus(`Cancel failed: ${error.message}`);
  }
}

function startRunFromUi(event) {
  event?.preventDefault?.();
  const now = Date.now();
  if (now - state.lastRunEventAt < 400) return;
  state.lastRunEventAt = now;
  runWorkflow().catch(error => {
    console.error(error);
    setStatus(`Run failed: ${error.message}`);
    els.runBtn.disabled = false;
    els.cancelBtn.disabled = true;
    state.abortController = null;
    state.activePromptId = null;
    state.running = false;
  });
}

function safeBind(element, eventName, handler, label) {
  try {
    element?.addEventListener?.(eventName, handler);
  } catch (error) {
    console.warn(`Cannot bind ${label || eventName}`, error);
  }
}

function createField(labelText, control) {
  const field = document.createElement("label");
  field.className = "field";
  const label = document.createElement("span");
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function findSettingsSection() {
  const serverInput = byId("serverUrlInput");
  let node = serverInput?.parentElement || null;
  while (node && node !== document.body) {
    if (node.classList?.contains("section")) return node;
    node = node.parentElement;
  }
  return document.querySelector(".section");
}

function findServerRow() {
  const serverInput = byId("serverUrlInput");
  let node = serverInput?.parentElement || null;
  while (node && node !== document.body) {
    if (node.classList?.contains("inputWithBtn")) return node;
    node = node.parentElement;
  }
  return serverInput?.parentElement || null;
}

function findTemplateSection() {
  const templateSelect = byId("templateSelect");
  let node = templateSelect?.parentElement || null;
  while (node && node !== document.body) {
    if (node.classList?.contains("section")) return node;
    node = node.parentElement;
  }
  return null;
}

function ensureSettingsBody() {
  const settingsSection = findSettingsSection();
  const serverRow = findServerRow();
  if (!settingsSection || !serverRow) return null;

  let body = byId("settingsBody");
  if (!body) {
    body = document.createElement("div");
    body.id = "settingsBody";
    body.className = "settingsBody";
    const header = settingsSection.querySelector(".sectionHeader");
    const firstBodyNode = header?.nextSibling || settingsSection.firstChild;
    settingsSection.insertBefore(body, firstBodyNode);
    let node = body.nextSibling;
    while (node) {
      const next = node.nextSibling;
      body.append(node);
      node = next;
    }
  }

  let toggle = byId("settingsToggleBtn");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.id = "settingsToggleBtn";
    toggle.className = "secondary compactButton";
    toggle.type = "button";
    const header = settingsSection.querySelector(".sectionHeader");
    if (header) header.append(toggle);
    else settingsSection.insertBefore(toggle, body);
  }
  return body;
}

function ensureLocalWorkflowSettings(settingsBody) {
  if (!settingsBody) return;
  let wrap = byId("localWorkflowSettings");
  const templateSelect = byId("templateSelect");
  const folderBtn = byId("chooseTemplateFolderBtn");
  if (!templateSelect || !folderBtn) return;

  const oldSection = findTemplateSection();
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "localWorkflowSettings";
    wrap.className = "localWorkflowSettings";
  }

  if (wrap.parentElement !== settingsBody) {
    const serverRow = findServerRow();
    if (serverRow?.nextSibling) settingsBody.insertBefore(wrap, serverRow.nextSibling);
    else settingsBody.append(wrap);
  }

  let header = wrap.querySelector(".compactHeader");
  if (!header) {
    header = document.createElement("div");
    header.className = "sectionHeader compactHeader";
    const title = document.createElement("h2");
    header.append(title);
    wrap.insertBefore(header, wrap.firstChild);
  }
  const title = header.querySelector("h2") || document.createElement("h2");
  title.textContent = "Workflow";
  if (!title.parentElement) header.insertBefore(title, header.firstChild);
  if (folderBtn.parentElement !== header) header.append(folderBtn);

  const templateField = templateSelect.closest?.(".field") || templateSelect.parentElement;
  if (templateField && templateField.parentElement !== wrap) wrap.append(templateField);

  if (oldSection && oldSection !== findSettingsSection() && !oldSection.contains(templateSelect) && !oldSection.contains(folderBtn)) {
    oldSection.remove();
  }
}

function setSettingsCollapsed(collapsed) {
  if (!els.settingsBody || !els.settingsToggleBtn) return;
  els.settingsBody.hidden = collapsed;
  els.settingsBody.style.display = collapsed ? "none" : "";
  els.settingsToggleBtn.textContent = collapsed ? "Show" : "Hide";
  localStorage.setItem(SETTINGS_COLLAPSED_KEY, collapsed ? "1" : "0");
}

function toggleSettings() {
  setSettingsCollapsed(!els.settingsBody.hidden);
}

function ensureSettingsControls() {
  const serverRow = findServerRow();
  const settingsSection = findSettingsSection();
  if (!settingsSection || !serverRow) {
    console.warn("Cannot install RunningHub controls: settings section not found");
    return;
  }
  const settingsBody = ensureSettingsBody() || settingsSection;
  ensureLocalWorkflowSettings(settingsBody);
  byId("apixVersionMarker")?.remove?.();

  if (!byId("executionModeSelect")) {
    const modeSelect = document.createElement("select");
    modeSelect.id = "executionModeSelect";
    modeSelect.innerHTML = `
      <option value="local">ComfyUI Local</option>
      <option value="runninghub-app">RunningHub AI App</option>
      <option value="runninghub-wf">RunningHub Workflow</option>
    `;
    settingsBody.insertBefore(createField("Run mode", modeSelect), serverRow);
  }

  let wrap = byId("runningHubSettings");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "runningHubSettings";
    wrap.className = "runningHubSettings";
    wrap.hidden = true;
    if (serverRow.nextSibling) settingsBody.insertBefore(wrap, serverRow.nextSibling);
    else settingsBody.append(wrap);
  }

  if (!byId("runningHubApiKeyInput")) {
    const apiInput = document.createElement("input");
    apiInput.id = "runningHubApiKeyInput";
    apiInput.type = "password";
    apiInput.placeholder = "API key";
    wrap.append(createField("RunningHub API Key", apiInput));
  }

  let appWrap = byId("runningHubAppSettings");
  if (!appWrap) {
    appWrap = document.createElement("div");
    appWrap.id = "runningHubAppSettings";
    appWrap.className = "runningHubAppSettings";
    appWrap.hidden = true;
    wrap.append(appWrap);
  }

  if (byId("runningHubWebappIdInput")) {
    const legacyField = byId("runningHubWebappIdInput").closest?.(".field") || byId("runningHubWebappIdInput").parentElement;
    legacyField?.remove?.();
  }

  if (!byId("runningHubAppSelect")) {
    const appSelect = document.createElement("select");
    appSelect.id = "runningHubAppSelect";
    for (const app of RUNNINGHUB_APP_OPTIONS) {
      const option = document.createElement("option");
      option.value = app.id;
      option.textContent = app.name;
      appSelect.append(option);
    }
    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "Custom WebApp ID";
    appSelect.append(customOption);
    appWrap.append(createField("Web App", appSelect));
  }

  if (!byId("runningHubCustomWebappIdInput")) {
    const customInput = document.createElement("input");
    customInput.id = "runningHubCustomWebappIdInput";
    customInput.type = "text";
    customInput.placeholder = "2039924771751731201";
    const customField = createField("Custom WebApp ID", customInput);
    customField.id = "runningHubCustomWebappField";
    customField.hidden = true;
    appWrap.append(customField);
  } else if (!byId("runningHubCustomWebappField")) {
    const customInput = byId("runningHubCustomWebappIdInput");
    const customField = customInput.parentElement;
    if (customField) customField.id = "runningHubCustomWebappField";
  }

  if (!byId("loadRunningHubNodesBtn")) {
    const loadBtn = document.createElement("button");
    loadBtn.id = "loadRunningHubNodesBtn";
    loadBtn.className = "secondary";
    loadBtn.type = "button";
    loadBtn.textContent = "Load RunningHub Nodes";
    appWrap.append(loadBtn);
  }
}

function bindEvents() {
  safeBind(els.runBtn, "click", startRunFromUi, "run click");
  safeBind(els.runBtn, "pointerup", startRunFromUi, "run pointerup");
  safeBind(els.testConnectionBtn, "click", testConnection, "test click");
  safeBind(els.settingsToggleBtn, "click", toggleSettings, "settings toggle");
  safeBind(els.executionModeSelect, "change", () => switchExecutionMode(els.executionModeSelect.value), "mode change");
  safeBind(els.runningHubApiKeyInput, "input", saveSettings, "runninghub api key");
  safeBind(els.runningHubAppSelect, "change", () => {
    syncRunningHubAppUi();
    saveSettings();
  }, "runninghub app");
  safeBind(els.runningHubCustomWebappIdInput, "input", saveSettings, "runninghub custom webapp id");
  safeBind(els.loadRunningHubNodesBtn, "click", () => loadRunningHubNodes(), "runninghub nodes");
  safeBind(els.refreshTemplatesBtn, "click", loadTemplates, "refresh click");
  safeBind(els.chooseTemplateFolderBtn, "click", chooseTemplateFolder, "folder click");
  safeBind(els.templateSelect, "change", () => selectTemplate(selectedTemplateId()), "template change");
  safeBind(els.cancelBtn, "click", cancelRun, "cancel click");
}

function initElements() {
  ensureSettingsControls();
  [
    "settingsBody",
    "settingsToggleBtn",
    "serverUrlInput",
    "executionModeSelect",
    "runningHubSettings",
    "runningHubAppSettings",
    "runningHubApiKeyInput",
    "runningHubAppSelect",
    "runningHubCustomWebappField",
    "runningHubCustomWebappIdInput",
    "loadRunningHubNodesBtn",
    "localWorkflowSettings",
    "testConnectionBtn",
    "refreshTemplatesBtn",
    "chooseTemplateFolderBtn",
    "templateSelect",
    "workflowTitle",
    "dynamicForm",
    "statusText",
    "progressBar",
    "runBtn",
    "cancelBtn"
  ].forEach(id => { els[id] = byId(id); });
  setSettingsCollapsed(localStorage.getItem(SETTINGS_COLLAPSED_KEY) === "1");
}

document.addEventListener("DOMContentLoaded", async () => {
  initElements();
  state.settings = readSettings();
  applySettingsToUi();
  bindEvents();
  await loadTemplates();
  renderActiveForm();
  if (isRunningHubAppMode() && state.settings.runningHub.apiKey) {
    loadRunningHubNodes().catch(error => setStatus(`RunningHub load failed: ${error.message}`));
  }
});
