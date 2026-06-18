import { useCallback, useEffect, useRef, useState } from "react";
import { localizeRuntimeMessage, useI18n } from "../i18n/I18nContext";
import {
  buildDefaultRhApps,
  DEFAULT_RH_WEBAPP_ID,
  DEFAULT_RH_WEBAPP_IDS,
  fetchDefaultRhApps,
  fetchSavedRhApps,
  listRhAppOptions,
  persistSavedRhApps,
  refreshDefaultRhApps,
  removeSavedRhAppFromList,
  isDefaultRhWebapp,
  upsertSavedRhAppList
} from "../lib/rhSavedApps.js";
import {
  getPrimaryRhApiKey,
  hasRhApiKey,
  normalizeRhSettings,
  syncPrimaryApiKey
} from "../lib/rhTokenPool.js";
import { getSetting, isSettingsReady, setSetting } from "../lib/appSettings.js";

export { DEFAULT_RH_WEBAPP_ID } from "../lib/rhSavedApps.js";
export const DEFAULT_RH_WF_ID = "2064644362323189762";

export function loadExecutionMode() {
  const stored = getSetting("execution.mode", "local");
  if (stored === "runninghub") return "runninghub-app";
  if (stored === "runninghub-app" || stored === "runninghub-wf") return stored;
  return "local";
}

export function isRunningHubMode(mode) {
  return mode === "runninghub-app" || mode === "runninghub-wf";
}

export function loadRunningHubSettings() {
  try {
    const parsed = getSetting("runningHub", {});
    const normalized = normalizeRhSettings({
      ...parsed,
      webappId: parsed.webappId || DEFAULT_RH_WEBAPP_ID
    });
    return {
      ...normalized,
      webappId: normalized.webappId || DEFAULT_RH_WEBAPP_ID
    };
  } catch {
    return normalizeRhSettings({ webappId: DEFAULT_RH_WEBAPP_ID });
  }
}

export { hasRhApiKey, getPrimaryRhApiKey };

export function nodeFieldKey(node) {
  return `${node.nodeId}|${node.fieldName}`;
}

export function buildNodeDefaults(nodes = []) {
  const values = {};
  for (const node of nodes) {
    values[nodeFieldKey(node)] = node.fieldValue ?? "";
  }
  return values;
}

export function buildWebappInfo(data = {}, webappId = "") {
  return {
    webappId: String(webappId || data.webappId || "").trim(),
    webappName: String(data.webappName || "").trim(),
    accessEncrypted: Boolean(data.accessEncrypted),
    statisticsInfo: data.statisticsInfo && typeof data.statisticsInfo === "object"
      ? data.statisticsInfo
      : null,
    covers: Array.isArray(data.covers) ? data.covers : [],
    tags: Array.isArray(data.tags) ? data.tags : []
  };
}

export function useRunningHub() {
  const { locale, t } = useI18n();
  const [settings, setSettings] = useState(loadRunningHubSettings);
  const [savedWebapps, setSavedWebapps] = useState([]);
  const [defaultApps, setDefaultApps] = useState(() => buildDefaultRhApps());
  const [savedAppsReady, setSavedAppsReady] = useState(false);
  const [savedAppsError, setSavedAppsError] = useState("");
  const savedWebappsRef = useRef([]);
  const [nodes, setNodes] = useState([]);
  const [webappInfo, setWebappInfo] = useState(null);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState("");
  const webappOptions = listRhAppOptions(defaultApps, savedWebapps);

  useEffect(() => {
    savedWebappsRef.current = savedWebapps;
  }, [savedWebapps]);

  const updateSettings = useCallback((patch) => {
    setSettings(current => {
      const next = syncPrimaryApiKey({ ...current, ...patch });
      if (isSettingsReady()) {
        setSetting("runningHub", next);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const apps = await fetchDefaultRhApps();
        if (!cancelled) setDefaultApps(apps);
      } catch (error) {
        console.error("Failed to load default RH apps:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const apiKey = getPrimaryRhApiKey(settings);
    if (!apiKey?.trim()) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const apps = await refreshDefaultRhApps(apiKey);
        if (!cancelled) setDefaultApps(apps);
      } catch (error) {
        console.warn("Failed to refresh default RH app names:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let apps = await fetchSavedRhApps();
        const hadDefaultBookmarks = apps.some(app => isDefaultRhWebapp(app.id));
        apps = apps.filter(app => !isDefaultRhWebapp(app.id));
        if (hadDefaultBookmarks) {
          apps = await persistSavedRhApps(apps);
        }
        if (!cancelled) {
          setSavedWebapps(apps);
          setSavedAppsError("");
          setSavedAppsReady(true);
        }
      } catch (error) {
        console.error("Failed to load RH saved apps from server:", error);
        if (!cancelled) {
          setSavedWebapps([]);
          setSavedAppsError(t("rh.appStorageUnavailable"));
          setSavedAppsReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const persistApps = useCallback(async (nextApps) => {
    const persisted = await persistSavedRhApps(nextApps);
    setSavedWebapps(persisted);
    setSavedAppsError("");
    return persisted;
  }, []);

  const restoreNodes = useCallback((nextNodes = []) => {
    setNodes(Array.isArray(nextNodes) ? nextNodes : []);
    setNodesError("");
  }, []);

  const restoreWebappInfo = useCallback((nextInfo = null) => {
    if (!nextInfo) {
      setWebappInfo(null);
      return;
    }
    setWebappInfo(buildWebappInfo(nextInfo, nextInfo.webappId));
  }, []);

  const fetchNodes = useCallback(async (override = {}) => {
    const apiKey = override.apiKey ?? getPrimaryRhApiKey(settings);
    const webappId = override.webappId ?? settings.webappId;
    const shouldThrow = override.throwOnError === true;
    if (!apiKey?.trim()) {
      const message = t("rh.noApiKey");
      setNodesError(message);
      setNodes([]);
      setWebappInfo(null);
      if (shouldThrow) throw new Error(message);
      return [];
    }
    if (!webappId?.trim()) {
      const message = t("rh.noWebappId");
      setNodesError(message);
      setNodes([]);
      setWebappInfo(null);
      if (shouldThrow) throw new Error(message);
      return [];
    }

    setNodesLoading(true);
    setNodesError("");
    try {
      const response = await fetch("/api/runninghub/nodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), webappId: webappId.trim() })
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {
        throw new Error(text || t("rh.noJsonNodes"));
      }
      if (!response.ok) throw new Error(localizeRuntimeMessage(data.error || data.msg, locale) || t("rh.loadNodesFailed"));
      const trimmedId = webappId.trim();
      const nextNodes = data.nodes || [];
      setNodes(nextNodes);
      setWebappInfo(buildWebappInfo(data, trimmedId));
      const scannedName = String(data.webappName || "").trim();
      if (scannedName && DEFAULT_RH_WEBAPP_IDS.includes(trimmedId)) {
        setDefaultApps(current => current.map(app => (
          app.id === trimmedId ? { ...app, name: scannedName } : app
        )));
        refreshDefaultRhApps(apiKey).then(setDefaultApps).catch(() => {});
      }
      return nextNodes;
    } catch (error) {
      const message = localizeRuntimeMessage(error.message, locale);
      setNodesError(message);
      setNodes([]);
      setWebappInfo(null);
      if (shouldThrow) throw new Error(message);
      return [];
    } finally {
      setNodesLoading(false);
    }
  }, [locale, settings, t]);

  const saveCurrentWebapp = useCallback(async () => {
    if (!savedAppsReady) {
      return { ok: false, error: t("rh.appStorageLoading") };
    }
    const id = settings.webappId?.trim();
    if (!id) {
      return { ok: false, error: t("rh.noWebappId") };
    }
    if (isDefaultRhWebapp(id)) {
      return { ok: false, error: t("rh.defaultAppNoBookmark") };
    }

    const currentApps = savedWebappsRef.current;
    if (currentApps.some(app => app.id === id)) {
      try {
        const next = removeSavedRhAppFromList(currentApps, id);
        await persistApps(next);
        return { ok: true, removed: true };
      } catch (error) {
        console.error("Failed to remove RH saved app:", error);
        return { ok: false, error: t("rh.appSaveFailed") };
      }
    }

    const name = webappInfo?.webappName?.trim();
    if (!name || webappInfo?.webappId !== id) {
      return { ok: false, error: t("rh.saveAppNeedReload") };
    }

    try {
      const next = upsertSavedRhAppList(currentApps, { id, name });
      await persistApps(next);
      return { ok: true, removed: false, app: { id, name } };
    } catch (error) {
      console.error("Failed to save RH app:", error);
      return { ok: false, error: t("rh.appSaveFailed") };
    }
  }, [persistApps, savedAppsReady, settings.webappId, t, webappInfo]);

  return {
    settings,
    updateSettings,
    savedWebapps,
    savedAppsReady,
    savedAppsError,
    webappOptions,
    saveCurrentWebapp,
    nodes,
    webappInfo,
    restoreNodes,
    restoreWebappInfo,
    nodesLoading,
    nodesError,
    fetchNodes
  };
}
