export const BUILTIN_TEMPLATES = [
  "klein-edit-image",
  "fashion-flatlay",
  "mask-upscale",
  "test-2output",
  "upscale-klein"
];
export const BUILTIN_RH_TEMPLATES = [
  "klein-edit-image-lora"
];
import {
  DEFAULT_RH_WEBAPP_ID,
  RUNNINGHUB_APP_OPTIONS,
  loadExecutionMode,
  loadRunningHubSettings,
  saveExecutionMode,
  saveRunningHubSettings
} from "./services/runninghub.js";

export const SETTINGS_KEY = "apix-builder:settings:v1";
export const TEMPLATE_FOLDER_KEY = "apix-builder:template-folder:v1";
export const DEFAULT_SERVER = "http://127.0.0.1:8188";

export const state = {
  settings: {
    serverUrl: DEFAULT_SERVER,
    executionMode: "local",
    runningHub: { apiKey: "", webappId: DEFAULT_RH_WEBAPP_ID, workflowId: "" }
  },
  templates: [],
  selectedTemplate: null,
  config: null,
  workflow: null,
  values: {},
  localValues: {},
  imageValues: {},
  imageSources: {},
  imagePreviews: {},
  serverChoices: {},
  runningHubNodes: [],
  runningHubNodeValues: {},
  runningHubNodesLoading: false,
  runningHubNodesError: "",
  abortController: null,
  activeWebSocket: null,
  activePromptId: null,
  activeRunningHubTaskId: null,
  running: false,
  lastRunEventAt: 0
};

export const els = {};

export function byId(id) {
  return document.getElementById(id);
}

export function setStatus(message) {
  els.statusText.textContent = message;
}

export function setProgress(value, max) {
  if (Number.isFinite(value) && Number.isFinite(max) && max > 0) {
    els.progressBar.hidden = false;
    els.progressBar.max = max;
    els.progressBar.value = value;
  } else {
    els.progressBar.hidden = true;
    els.progressBar.value = 0;
  }
}

export function setImageInputValue(key, dataUrl, source) {
  state.values[key] = dataUrl;
  state.imageValues[key] = dataUrl;
  state.imageSources[key] = source;
  const preview = state.imagePreviews[key];
  if (preview) {
    preview.src = dataUrl;
    preview.hidden = false;
  }
}

export function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      serverUrl: DEFAULT_SERVER,
      ...parsed,
      executionMode: loadExecutionMode(),
      runningHub: loadRunningHubSettings()
    };
  } catch {
    return {
      serverUrl: DEFAULT_SERVER,
      executionMode: loadExecutionMode(),
      runningHub: loadRunningHubSettings()
    };
  }
}

export function saveSettings() {
  state.settings.serverUrl = els.serverUrlInput.value.trim() || DEFAULT_SERVER;
  const mode = els.executionModeSelect?.value || "local";
  state.settings.executionMode = mode === "runninghub-app" || mode === "runninghub-wf" ? mode : "local";
  const selectedWebapp = els.runningHubAppSelect?.value || DEFAULT_RH_WEBAPP_ID;
  const isDefaultWebapp = RUNNINGHUB_APP_OPTIONS.some(app => app.id === selectedWebapp);
  const webappId = isDefaultWebapp
    ? selectedWebapp
    : (els.runningHubCustomWebappIdInput?.value.trim() || DEFAULT_RH_WEBAPP_ID);
  state.settings.runningHub = {
    apiKey: els.runningHubApiKeyInput?.value.trim() || "",
    webappId
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  saveExecutionMode(state.settings.executionMode);
  saveRunningHubSettings(state.settings.runningHub);
  setStatus("Saved settings");
}

export function normalizeId(id) {
  return Array.isArray(id) ? id.join("|") : String(id);
}
