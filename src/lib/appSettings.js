const DEFAULT_SETTINGS = {
  appearance: {
    theme: "dark",
    mainFont: "system",
    language: "auto"
  },
  connection: {
    comfyAddress: "http://127.0.0.1:8188",
    servers: []
  },
  notifications: {
    enabled: false
  },
  execution: {
    mode: "local",
    rhWfSelectedTemplate: ""
  },
  runningHub: {},
  workspace: {
    selectedTemplate: "",
    valuesByTemplate: {},
    view: "form"
  },
  layout: {
    sidebar: { side: "left", width: 430 },
    outputColorPanelWidth: 320,
    runLogHeight: 520
  },
  favorites: {
    history: [],
    inputImages: []
  },
  migration: {
    localStorageImported: false
  }
};

function createSettingsStore() {
  if (import.meta.hot?.data?.apixSettingsStore) {
    return import.meta.hot.data.apixSettingsStore;
  }
  const store = {
    settings: structuredClone(DEFAULT_SETTINGS),
    ready: false,
    loadedFromServer: false,
    persistQueue: Promise.resolve()
  };
  if (import.meta.hot) {
    import.meta.hot.data.apixSettingsStore = store;
  }
  return store;
}

const store = createSettingsStore();

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(base, patch) {
  if (!isObject(patch)) return base;
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = isObject(value) && isObject(base?.[key])
      ? mergeDeep(base[key], value)
      : value;
  }
  return next;
}

function readLegacyJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function legacySettingsSnapshot() {
  const theme = readLegacyValue("comfyui-build:theme");
  const mainFont = readLegacyValue("comfyui-build:main-font");
  const language = readLegacyValue("comfyui-build:language:v1");
  const comfyAddress = readLegacyValue("comfyui-build:server:v2");
  const executionMode = readLegacyValue("comfyui-build:execution-mode");
  const rhWfSelectedTemplate = readLegacyValue("comfyui-build:rh-wf-template:v1");
  const sidebar = readLegacyJson("comfyui-build:sidebar-layout", null);
  const outputColorPanelWidth = Number(readLegacyValue("comfyui-build:output-color-panel-width"));
  const runLogHeight = Number(readLegacyValue("comfyui-build:run-log-height"));
  const servers = readLegacyJson("comfyui-build:servers:v1", null);
  const notifyEnabled = readLegacyJson("comfyui-build:notify:v1", null);
  const runningHub = readLegacyJson("comfyui-build:runninghub:v1", null);
  const workspace = readLegacyJson("comfyui-build:workspace:v1", null);
  const historyFavorites = readLegacyJson("comfyui-build:history-favorites:v1", null);
  const inputImageFavorites = readLegacyJson("comfyui-build:input-image-favorites:v1", null);

  return {
    appearance: {
      ...(theme ? { theme } : {}),
      ...(mainFont ? { mainFont } : {}),
      ...(language ? { language } : {})
    },
    connection: {
      ...(comfyAddress ? { comfyAddress } : {}),
      ...(Array.isArray(servers) ? { servers } : {})
    },
    notifications: notifyEnabled == null ? {} : { enabled: notifyEnabled === true },
    execution: {
      ...(executionMode ? { mode: executionMode === "runninghub" ? "runninghub-app" : executionMode } : {}),
      ...(rhWfSelectedTemplate ? { rhWfSelectedTemplate } : {})
    },
    ...(isObject(runningHub) ? { runningHub } : {}),
    ...(isObject(workspace) ? { workspace } : {}),
    layout: {
      ...(sidebar ? { sidebar } : {}),
      ...(Number.isFinite(outputColorPanelWidth) ? { outputColorPanelWidth } : {}),
      ...(Number.isFinite(runLogHeight) ? { runLogHeight } : {})
    },
    favorites: {
      ...(Array.isArray(historyFavorites) ? { history: historyFavorites } : {}),
      ...(Array.isArray(inputImageFavorites) ? { inputImages: inputImageFavorites } : {})
    }
  };
}

function readLegacyValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function mergeListsById(primary, secondary) {
  const result = Array.isArray(primary) ? [...primary] : [];
  const seen = new Set(result.map(item => item?.id).filter(Boolean));
  for (const item of Array.isArray(secondary) ? secondary : []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function mergeWorkflowPresets(primary, secondary) {
  const result = isObject(primary) ? { ...primary } : {};
  for (const [templateId, presets] of Object.entries(isObject(secondary) ? secondary : {})) {
    result[templateId] = mergeListsById(result[templateId], presets);
  }
  return result;
}

async function migrateLegacyStore({ key, endpoint, responseKey, merge }) {
  const legacy = readLegacyJson(key, null);
  if (legacy == null) return;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Could not load ${endpoint}: HTTP ${response.status}`);
  const current = (await response.json())[responseKey];
  const merged = merge(current, legacy);
  const saveResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ [responseKey]: merged })
  });
  if (!saveResponse.ok) throw new Error(`Could not migrate ${endpoint}: HTTP ${saveResponse.status}`);
}

async function migrateLegacyFileStores() {
  await migrateLegacyStore({
    key: "comfyui-build:presets:v1",
    endpoint: "/api/workflow-presets",
    responseKey: "presets",
    merge: mergeWorkflowPresets
  });
  await migrateLegacyStore({
    key: "image-editor-custom-presets",
    endpoint: "/api/presets",
    responseKey: "presets",
    merge: mergeListsById
  });
  await migrateLegacyStore({
    key: "comfyui-build:runninghub-saved-apps:v1",
    endpoint: "/api/runninghub/saved-apps",
    responseKey: "apps",
    merge: mergeListsById
  });
}

async function migrateCanvasProjectOffSettings(project) {
  if (!project || typeof project !== "object") return;
  const nodes = Array.isArray(project.nodes) ? project.nodes : [];
  const edges = Array.isArray(project.edges) ? project.edges : [];
  if (!nodes.length && !edges.length) return;
  try {
    await fetch("/api/canvas-project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes, edges })
    });
  } catch (error) {
    console.warn("Could not migrate canvas project out of app-settings:", error);
  }
}

async function persistSettings() {
  if (!store.ready || !store.loadedFromServer) return store.persistQueue;
  const snapshot = structuredClone(store.settings);
  store.persistQueue = store.persistQueue
    .catch(() => {})
    .then(async () => {
      const response = await fetch("/api/app-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: snapshot })
      });
      if (!response.ok) throw new Error(`Could not save app settings: HTTP ${response.status}`);
    })
    .catch(error => console.error(error));
  return store.persistQueue;
}

export function isSettingsReady() {
  return store.ready && store.loadedFromServer;
}

export async function initializeAppSettings() {
  let strippedCanvasKey = false;
  try {
    const response = await fetch("/api/app-settings");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    let serverSettings = data.settings && typeof data.settings === "object" ? data.settings : {};
    if (serverSettings.canvas?.project) {
      strippedCanvasKey = true;
      await migrateCanvasProjectOffSettings(serverSettings.canvas.project);
      const { canvas, ...rest } = serverSettings;
      serverSettings = rest;
    }
    store.settings = mergeDeep(DEFAULT_SETTINGS, serverSettings);
    store.loadedFromServer = true;
  } catch (error) {
    console.error("Could not load app settings:", error);
    if (!store.loadedFromServer) {
      store.settings = mergeDeep(DEFAULT_SETTINGS, store.settings);
    }
  }

  store.ready = true;

  if (strippedCanvasKey && store.loadedFromServer) {
    await persistSettings();
  }

  if (!store.settings.migration?.localStorageImported) {
    store.settings = mergeDeep(store.settings, legacySettingsSnapshot());
    if (store.loadedFromServer) await persistSettings();
    try {
      await migrateLegacyFileStores();
      store.settings = {
        ...store.settings,
        migration: { ...store.settings.migration, localStorageImported: true }
      };
      if (store.loadedFromServer) await persistSettings();
      window.localStorage.clear();
    } catch (error) {
      console.error("Could not migrate legacy browser data:", error);
    }
  }
  if (store.settings.migration?.localStorageImported) window.localStorage.clear();
}

export function getSetting(path, fallback) {
  const keys = String(path).split(".");
  let value = store.settings;
  for (const key of keys) {
    if (!isObject(value) && !Array.isArray(value)) return fallback;
    value = value[key];
  }
  return value === undefined ? fallback : value;
}

export function setSetting(path, value) {
  const keys = String(path).split(".");
  const next = structuredClone(store.settings);
  let target = next;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(target[key])) target[key] = {};
    target = target[key];
  }
  target[keys.at(-1)] = value;
  store.settings = next;
  void persistSettings();
}
