import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coins,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Settings2,
  Wifi,
  WifiOff
} from "lucide-react";
import { DynamicField } from "../../components/DynamicField";
import { OutputGallery } from "../../components/OutputGallery";
import { ColorSyncModal } from "../../components/ColorSyncModal";
import { OutputColorPanel } from "../../components/OutputColorPanel";
import {
  buildPersistedColorState,
  getOutputColorAdjust,
  makeColorAdjustKey,
  mergeColorAdjustGroups,
  patchHistoryItemOutput
} from "../../lib/colorAdjustPersistence";
import { cloneDefaultAdjustments } from "../../lib/imageAdjustments";
import { DEFAULT_HEALING_BRUSH_SIZE } from "../../lib/healingBrush";
import { PreviewPanel } from "../../components/PreviewPanel";
import { preloadSettingsModal } from "../../components/lazyModals";
import { formatOutputTimingLabel, formatRhCoins } from "../../lib/runLog";
import { PresetBar } from "../../components/PresetBar";
import { RunControls } from "../../components/RunControls";
import { TemplateSelector } from "../../components/TemplateSelector";
import { downloadImage } from "../../lib/download";
import { canonicalDynamicType, dynamicFieldChoices } from "../../lib/dynamicTypes";
import {
  extractImageValueUrl,
  findCompareInputImage,
  flattenInputs,
  itemValueKey,
  normalizeId
} from "../../lib/template";
import { useDiscovery } from "../../hooks/useDiscovery";
import { useHistory } from "../../hooks/useHistory";
import { useInputImages } from "../../hooks/useInputImages";
import { usePresets } from "../../hooks/usePresets";
import { useServerList } from "../../hooks/useServerList";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useImageViewer } from "../../hooks/useImageViewer";
import { useRunOrchestration } from "../../hooks/useRunOrchestration";
import { useSidebarLayout } from "../../hooks/useSidebarLayout";
import { useRunLogHistory } from "../../hooks/useRunLogHistory";
import {
  buildNodeDefaults,
  isRunningHubMode,
  nodeFieldKey,
  useRunningHub
} from "../../hooks/useRunningHub";
import {
  advanceRhRotateIndex,
  getEnabledRhTokens,
  getPrimaryRhApiKey,
  hasRhApiKey,
  RH_TOKEN_POLICY
} from "../../lib/rhTokenPool.js";
import { rhWfWorkspaceKey } from "../../lib/runningHubTemplate";
import { buildRunningHubAppShortcutConfig } from "../../lib/runningHubShortcut";
import { ExecutionModeToggle, RunningHubPanel } from "../../components/RunningHubPanel";
import { SidebarLayoutHandles } from "../../components/SidebarLayoutHandles";
import { AppUpdateBanner } from "../../components/AppUpdateBanner";
import { ComfyUiLogomark } from "../../components/icons/ComfyUiIcon";
import { RunningHubLogomark } from "../../components/icons/RunningHubIcon";
import { AppleShortcutsIcon } from "../../components/icons/AppleShortcutsIcon";
import { localizeRuntimeMessage, useI18n } from "../../i18n/I18nContext";
import { MAIN_FONT_OPTIONS, syncMainFontStylesheet, THEME_OPTIONS } from "../../constants/appearance";
import { getSetting, setSetting } from "../../lib/appSettings";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { useColorAdjustContext } from "../../providers/ColorAdjustProvider.jsx";
import { useExecutionContext } from "../../providers/ExecutionProvider.jsx";
import { useHistoryContext } from "../../providers/HistoryProvider.jsx";
import {
  DEFAULT_COMFY_SERVER,
  useWorkspaceLayoutContext
} from "../../providers/WorkspaceLayoutProvider.jsx";
import { useTemplateWorkspaceActions } from "../templates/useTemplateWorkspaceActions.js";
import { useBatchImageState } from "./useBatchImageState.js";
import { useWorkspaceModals } from "./useWorkspaceModals.js";
import { useShortcutActionRefs, useWorkspaceShortcuts } from "./useWorkspaceShortcuts.js";
import { RunningState } from "./AppWorkspaceRunningUi.jsx";
import { WorkspaceModals } from "./WorkspaceModals.jsx";

const InfiniteCanvas = lazy(() => import("../canvas/InfiniteCanvas.jsx").then(module => ({ default: module.InfiniteCanvas })));

const CANVAS_RUNTIME_IDLE = {
  running: false,
  queueCount: 0,
  activeKind: null,
  activeLabel: null,
  hasRhNodes: false,
  hasLocalNodes: false
};

function loadRhWfLastTemplate() {
  return getSetting("execution.rhWfSelectedTemplate", "");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatServerName(address) {
  if (!address) return "ComfyUI";
  try {
    const url = new URL(address);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return address;
  }
}

export function AppWorkspace() {
  const { locale, preference: languagePreference, setPreference: setLanguagePreference, t } = useI18n();
  const {
    update: availableUpdate,
    checking: updateChecking,
    checkError: updateCheckError,
    upToDate: updateUpToDate,
    isDesktop,
    dismissUpdate,
    downloadUpdate,
    checkForUpdates
  } = useAppUpdate();
  const { side: sidebarSide, width: sidebarWidth, startMove: startSidebarMove, startResize: startSidebarResize } = useSidebarLayout();
  const {
    config, setConfig,
    values, setValues,
    templates, setTemplates,
    selectedTemplate, setSelectedTemplate,
    comfyAddress, setComfyAddress,
    settingsOpen, setSettingsOpen,
    settingsTab, setSettingsTab,
    infoOpen, setInfoOpen,
    isFullscreen, setIsFullscreen,
    showServerDetails, setShowServerDetails,
    themeMenuOpen, setThemeMenuOpen,
    mainFont, setMainFont,
    templateEditorOpen, setTemplateEditorOpen,
    rhWfTemplateEditorOpen, setRhWfTemplateEditorOpen,
    rhWfConfig, setRhWfConfig,
    rhWfTemplates, setRhWfTemplates,
    rhWfSelectedTemplate, setRhWfSelectedTemplate,
    outputEditorOpen, setOutputEditorOpen,
    theme, setTheme,
    notifyEnabled, setNotifyEnabled,
    addServerOpen, setAddServerOpen,
    workspaceView, setWorkspaceView
  } = useWorkspaceLayoutContext();
  const isCanvasView = workspaceView === "canvas";
  const [canvasSmartGuide, setCanvasSmartGuide] = useState(() => getSetting("canvas.smartGuide", true));
  const [canvasSnapGrid, setCanvasSnapGrid] = useState(() => getSetting("canvas.snapGrid", false));
  const [canvasSnapGridSize, setCanvasSnapGridSize] = useState(() => getSetting("canvas.snapGridSize", 15));
  const [maxHistoryDisplay, setMaxHistoryDisplay] = useState(() => getSetting("history.maxDisplay", 100));

  useEffect(() => {
    setSetting("canvas.smartGuide", canvasSmartGuide);
  }, [canvasSmartGuide]);

  useEffect(() => {
    setSetting("canvas.snapGrid", canvasSnapGrid);
  }, [canvasSnapGrid]);

  useEffect(() => {
    setSetting("canvas.snapGridSize", canvasSnapGridSize);
  }, [canvasSnapGridSize]);

  useEffect(() => {
    const clamped = Math.min(1000, Math.max(1, Math.floor(Number(maxHistoryDisplay) || 100)));
    if (clamped !== maxHistoryDisplay) {
      setMaxHistoryDisplay(clamped);
      return;
    }
    setSetting("history.maxDisplay", clamped);
  }, [maxHistoryDisplay]);

  const [workflowToolbarHost, setWorkflowToolbarHost] = useState(null);
  const handleWorkflowToolbarHost = useCallback((node) => {
    setWorkflowToolbarHost(node);
  }, []);
  const [canvasRuntime, setCanvasRuntime] = useState(CANVAS_RUNTIME_IDLE);
  const handleCanvasRuntimeChange = useCallback((next) => {
    setCanvasRuntime(current => {
      if (
        current.running === next.running
        && current.queueCount === next.queueCount
        && current.activeKind === next.activeKind
        && current.activeLabel === next.activeLabel
        && current.hasRhNodes === next.hasRhNodes
        && current.hasLocalNodes === next.hasLocalNodes
      ) {
        return current;
      }
      return next;
    });
  }, []);
  const {
    executionMode, setExecutionMode,
    rhValues, setRhValues,
    rhWfValues, setRhWfValues,
    rhTestResult, setRhTestResult,
    rhTesting, setRhTesting,
    rhAccount, setRhAccount,
    rhAccountLoading, setRhAccountLoading,
    rhAccountError, setRhAccountError,
    rhTokenAccounts, setRhTokenAccounts
  } = useExecutionContext();
  const {
    selectedOutputIndex, setSelectedOutputIndex,
    showWaitScreen, setShowWaitScreen,
    runLogOpen, setRunLogOpen,
    selectedHistoryIds, setSelectedHistoryIds,
    historySelectionAnchor, setHistorySelectionAnchor
  } = useHistoryContext();
  const {
    colorPanelOpen, setColorPanelOpen,
    colorPreviewUrl, setColorPreviewUrl,
    colorUpdating, setColorUpdating,
    colorPanelWidth, setColorPanelWidth,
    healingBridge, setHealingBridge,
    colorSyncOpen, setColorSyncOpen,
    colorSyncing, setColorSyncing,
    colorAdjustCacheRef,
    pendingColorSyncSourceRef,
    colorAdjustReloadToken, setColorAdjustReloadToken
  } = useColorAdjustContext();

  const { discovery, discoveryLoading } = useDiscovery(
    !isCanvasView && executionMode === "local" ? comfyAddress : ""
  );
  const {
    settings: rhSettings,
    updateSettings: updateRhSettings,
    nodes: rhNodes,
    webappInfo: rhWebappInfo,
    savedWebapps: rhSavedWebapps,
    savedAppsError: rhSavedAppsError,
    webappOptions: rhWebappOptions,
    saveCurrentWebapp,
    restoreNodes: restoreRhNodes,
    restoreWebappInfo: restoreRhWebappInfo,
    nodesLoading: rhNodesLoading,
    nodesError: rhNodesError,
    fetchNodes: fetchRhNodes
  } = useRunningHub();
  const [shortcutExporting, setShortcutExporting] = useState(false);
  const { history, setHistory, loadOutputHistory, deleteHistoryItem } = useHistory();
  const { inputImages, setInputImages, refreshInputImages } = useInputImages();
  const { getStoredValues, saveValues, getLastTemplate } = useWorkspace();
  const { getPresets, savePreset, updatePreset, deletePreset, presetsVersion, presetsStorageWarning } = usePresets();
  const { getServers, addServer, removeServer } = useServerList();

  const runLogHistory = useRunLogHistory();

  const onRunComplete = (historyItem) => {
    if (historyItem) {
      setHistory(current => [historyItem, ...current]);
      setSelectedHistoryIds(new Set([historyItem.id]));
      setHistorySelectionAnchor(historyItem.id);
    }
    if (isRunningHubMode(executionMode) && rhSettings.tokenPolicy === RH_TOKEN_POLICY.ROTATE) {
      updateRhSettings({ rotateIndex: advanceRhRotateIndex(rhSettings) });
    }
    setSelectedOutputIndex(0);
    if (notifyEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const body = isRunningHubMode(executionMode)
        ? t("notify.rhComplete")
        : t("notify.workflowComplete");
      new Notification("aPix Builder", { body, icon: "/favicon.png" });
    }
  };

  const {
    running, activeRunId, runQueue,
    status, setStatus, error, setError,
    result, setResult, progress,
    cancelWorkflow, clearQueue, stopAllWorkflow, runStep,
    localExecution, rhExecution
  } = useRunOrchestration({ onComplete: onRunComplete, runLog: runLogHistory, executionMode });

  const {
    sessions: runLogSessions,
    deleteSession: deleteRunLogSession,
    clearHistory: clearRunLogHistory,
    updateSession: updateRunLogSession,
    refreshSessions: refreshRunLogSessions
  } = runLogHistory;

  useEffect(() => {
    if (!runLogOpen) return;
    refreshRunLogSessions();
  }, [runLogOpen, refreshRunLogSessions]);

  useEffect(() => {
    refreshRunLogSessions();
  }, [executionMode, isCanvasView, refreshRunLogSessions]);

  const isRunningHub = isRunningHubMode(executionMode);
  const isRunningHubApp = executionMode === "runninghub-app";
  const isRunningHubWf = executionMode === "runninghub-wf";
  const shortcutExportAvailable = !(isDesktop && window.apixDesktop?.platform === "win32");
  const healthStatus = discoveryLoading ? "loading" : discovery ? "online" : "offline";

  const inputs = useMemo(() => flattenInputs(config?.input), [config]);
  const rhWfInputs = useMemo(() => flattenInputs(rhWfConfig?.input), [rhWfConfig]);
  const { runWithBatchExpansion } = useBatchImageState({
    locale,
    t,
    executionMode,
    inputs,
    values,
    selectedTemplate,
    comfyAddress,
    rhSettings,
    rhNodes,
    rhValues,
    rhWfConfig,
    rhWfInputs,
    rhWfValues,
    rhWfSelectedTemplate,
    runStep,
    setError,
    setStatus,
    setShowWaitScreen
  });
  const handleRunClick = runWithBatchExpansion;
  const outputs = useMemo(() => Object.values(config?.output || {}), [config]);
  const currentPresets = useMemo(() => {
    void presetsVersion;
    return getPresets(selectedTemplate);
  }, [getPresets, selectedTemplate, presetsVersion]);
  const rhWfPresets = useMemo(
    () => {
      void presetsVersion;
      return getPresets(rhWfWorkspaceKey(rhWfSelectedTemplate));
    },
    [getPresets, rhWfSelectedTemplate, presetsVersion]
  );
  const app = config?.app || {};
  const serverAddress = config?.server?.address || config?.sever?.address || "";
  const rhPrimaryApiKey = getPrimaryRhApiKey(rhSettings);
  const rhEnabledTokens = getEnabledRhTokens(rhSettings);
  const rhEnabledTokenCount = rhEnabledTokens.length;
  const rhAccountTokenSignature = rhEnabledTokens
    .map(token => `${token.id}:${token.apiKey}`)
    .join("|");
  const rhTotalCoins = useMemo(() => {
    const values = rhTokenAccounts
      .map(entry => entry.account?.remainCoins)
      .filter(value => value != null && Number.isFinite(Number(value)));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + Number(value), 0);
  }, [rhTokenAccounts]);
  const rhDisplayCoins = rhEnabledTokenCount > 1
    ? rhTotalCoins
    : rhAccount?.remainCoins ?? rhTotalCoins;
  const selectedRunningHubApp = rhWebappOptions.find(app => app.id === rhSettings.webappId);
  const selectedRunningHubName = rhWebappInfo?.webappName
    || selectedRunningHubApp?.name
    || (rhSettings.webappId ? `RunningHub ${rhSettings.webappId}` : "RunningHub App");
  const infoModeLabel = useMemo(() => {
    if (executionMode === "local") return t("info.modeLocal");
    if (executionMode === "runninghub-app") return t("info.modeRhApp");
    if (executionMode === "runninghub-wf") return t("info.modeRhWf");
    return t("info.notConfigured");
  }, [executionMode, t]);
  const infoTemplateLabel = useMemo(() => {
    if (isRunningHubApp) return selectedRunningHubName;
    if (isRunningHubWf) {
      return rhWfConfig?.app?.name || rhWfSelectedTemplate || t("info.notConfigured");
    }
    return app.name || selectedTemplate || t("info.notConfigured");
  }, [
    app.name,
    isRunningHubApp,
    isRunningHubWf,
    rhWfConfig,
    rhWfSelectedTemplate,
    selectedRunningHubName,
    selectedTemplate,
    t
  ]);
  const infoTargetLabel = useMemo(() => {
    if (isRunningHubApp) {
      return rhSettings.webappId ? `ID ${rhSettings.webappId}` : t("info.notConfigured");
    }
    if (isRunningHubWf) {
      const workflowId = String(rhWfConfig?.runninghub?.workflowId || "").trim();
      return workflowId ? `ID ${workflowId}` : t("info.notConfigured");
    }
    return comfyAddress || serverAddress || t("info.notConfigured");
  }, [
    comfyAddress,
    isRunningHubApp,
    isRunningHubWf,
    rhSettings.webappId,
    rhWfConfig,
    serverAddress,
    t
  ]);
  const activeServer = getServers().find(server => server.address === comfyAddress);
  const formTopBarServerLabel = isRunningHubWf
    ? "RunningHub Workflow"
    : isRunningHubApp
      ? selectedRunningHubName
      : activeServer?.label || formatServerName(comfyAddress);
  const rhIdleStatus = !hasRhApiKey(rhSettings)
    ? "offline"
    : rhAccountLoading
      ? "loading"
      : rhAccountError
        ? "offline"
        : rhAccount
          ? "online"
          : "loading";
  const formTopBarServerStatus = isRunningHub ? rhIdleStatus : healthStatus;
  const canvasTopBarRh = canvasRuntime.hasRhNodes
    || canvasRuntime.activeKind === "runninghub-app"
    || canvasRuntime.activeKind === "runninghub-wf";
  const canvasTopBarLocal = canvasRuntime.hasLocalNodes || canvasRuntime.activeKind === "local";
  const topBarShowsRh = isCanvasView
    ? canvasRuntime.activeKind === "runninghub-app"
      || canvasRuntime.activeKind === "runninghub-wf"
      || (canvasTopBarRh && canvasRuntime.activeKind !== "local")
    : isRunningHub;
  const topBarServerLabel = isCanvasView
    ? (canvasRuntime.running || canvasRuntime.queueCount > 0
      ? (canvasRuntime.activeLabel || t("canvas.pipeline"))
      : t("canvas.label"))
    : formTopBarServerLabel;
  const topBarServerStatus = isCanvasView
    ? (canvasRuntime.running
      ? "running"
      : canvasRuntime.queueCount > 0
        ? "loading"
        : canvasTopBarRh && !canvasTopBarLocal
          ? rhIdleStatus
          : canvasTopBarLocal && !canvasTopBarRh
            ? healthStatus
            : canvasTopBarRh && canvasTopBarLocal
              ? (rhIdleStatus === "offline" || healthStatus === "offline"
                ? "offline"
                : rhIdleStatus === "loading" || healthStatus === "loading"
                  ? "loading"
                  : "online")
              : "")
    : formTopBarServerStatus;
  const topBarServerTitle = useMemo(() => {
    if (isCanvasView) {
      const parts = [topBarServerLabel];
      if (canvasRuntime.running) {
        parts.push(t("canvas.running"));
      } else if (canvasRuntime.queueCount > 0) {
        parts.push(t("canvas.queued", { count: canvasRuntime.queueCount }));
      } else if (canvasTopBarRh && canvasTopBarLocal) {
        if (rhDisplayCoins != null) {
          const coinLabel = rhEnabledTokenCount > 1 ? t("rh.totalCoinBalance") : t("rh.coinBalance");
          parts.push(`${coinLabel}: ${formatRhCoins(rhDisplayCoins)}`);
        }
        if (rhAccountError) parts.push(rhAccountError);
        else if (rhAccount) parts.push(t("canvas.rhReady"));
        if (healthStatus === "online") parts.push(t("canvas.comfyReady"));
        else if (healthStatus === "offline") parts.push(t("rh.disconnected"));
      } else if (canvasTopBarRh) {
        if (rhDisplayCoins != null) {
          const coinLabel = rhEnabledTokenCount > 1 ? t("rh.totalCoinBalance") : t("rh.coinBalance");
          parts.push(`${coinLabel}: ${formatRhCoins(rhDisplayCoins)}`);
        }
        if (rhEnabledTokenCount > 1) {
          parts.push(t("rh.tokenCount", { count: rhEnabledTokenCount }));
        }
        if (rhAccountError) parts.push(rhAccountError);
        else if (rhAccount) parts.push(t("rh.keyValid"));
        else if (!hasRhApiKey(rhSettings)) parts.push(t("rh.noKey"));
        else if (rhAccountLoading) parts.push(t("rh.loadingAccount"));
      } else if (canvasTopBarLocal) {
        if (healthStatus === "online") parts.push(t("canvas.comfyReady"));
        else if (healthStatus === "loading") parts.push(t("rh.loadingAccount"));
        else parts.push(t("rh.disconnected"));
      } else {
        parts.push(t("canvas.empty"));
      }
      return parts.join(" · ");
    }
    if (!isRunningHub) return formTopBarServerLabel;
    const parts = [formTopBarServerLabel];
    if (rhDisplayCoins != null) {
      const coinLabel = rhEnabledTokenCount > 1 ? t("rh.totalCoinBalance") : t("rh.coinBalance");
      parts.push(`${coinLabel}: ${formatRhCoins(rhDisplayCoins)}`);
    }
    if (rhEnabledTokenCount > 1) {
      parts.push(t("rh.tokenCount", { count: rhEnabledTokenCount }));
    }
    if (rhAccountError) parts.push(rhAccountError);
    else if (rhAccount) parts.push(t("rh.keyValid"));
    else if (!hasRhApiKey(rhSettings)) parts.push(t("rh.noKey"));
    else if (rhAccountLoading) parts.push(t("rh.loadingAccount"));
    return parts.join(" · ");
  }, [
    canvasRuntime.queueCount,
    canvasRuntime.running,
    canvasTopBarLocal,
    canvasTopBarRh,
    formTopBarServerLabel,
    healthStatus,
    isCanvasView,
    isRunningHub,
    rhAccount,
    rhAccountError,
    rhAccountLoading,
    rhDisplayCoins,
    rhEnabledTokenCount,
    rhSettings,
    t,
    topBarServerLabel
  ]);
  const resultOutputs = result?.outputs || [];
  const selectedOutput = resultOutputs[selectedOutputIndex] || resultOutputs[0];
  const outputLabel = selectedOutput?.label || (isRunningHub
    ? t("preview.rhResult")
    : outputs[0]?.ui?.label || t("preview.result"));
  const heroImage = selectedOutput?.url;
  const activeHistoryId = result?.runId || result?.historyItem?.id || null;
  const lastColorPanelSourceRef = useRef(null);
  if (heroImage) lastColorPanelSourceRef.current = heroImage;
  const colorPanelSource = heroImage || lastColorPanelSourceRef.current;
  const displayImage = colorPreviewUrl || heroImage;
  const colorAdjustTarget = useMemo(() => {
    const historyId = activeHistoryId;
    const outputIndex = selectedOutputIndex;
    const filename = selectedOutput?.filename || null;
    const baseKey = makeColorAdjustKey(historyId, outputIndex, filename);
    return {
      historyId,
      outputIndex,
      filename,
      key: baseKey ? `${baseKey}:${colorAdjustReloadToken}` : null
    };
  }, [activeHistoryId, selectedOutputIndex, selectedOutput?.filename, colorAdjustReloadToken]);
  const persistedColorState = useMemo(() => {
    const { historyId, outputIndex, filename, key } = colorAdjustTarget;
    if (!key) return null;
    if (colorAdjustCacheRef.current[key]) {
      return colorAdjustCacheRef.current[key];
    }
    if (historyId) {
      const item = history.find(entry => entry.id === historyId);
      const output = item?.outputs?.[outputIndex];
      if (output?.filename === filename) {
        return getOutputColorAdjust(output);
      }
    }
    return getOutputColorAdjust(selectedOutput);
  }, [colorAdjustCacheRef, colorAdjustTarget, history, selectedOutput]);
  const colorSyncTargetCount = useMemo(() => {
    if (!activeHistoryId) return selectedHistoryIds.size;
    return [...selectedHistoryIds].filter(id => id !== activeHistoryId).length;
  }, [selectedHistoryIds, activeHistoryId]);
  const resultTiming = useMemo(() => {
    const base = result?.historyItem || result || {};
    return {
      ...base,
      provider: result?.provider || base.provider,
      durationMs: result?.durationMs ?? base.durationMs,
      rhCoins: result?.rhCoins ?? base.rhCoins ?? null
    };
  }, [result]);
  const outputTimingLabel = formatOutputTimingLabel({
    durationMs: resultTiming.durationMs,
    provider: resultTiming.provider || (isRunningHub ? "runninghub" : undefined),
    rhCoins: resultTiming.rhCoins
  });
  const backendFormQueueCount = useMemo(() => (
    (runLogSessions || []).filter(session => (
      session.status === "queued"
      && session.runKind === "form"
      && !runQueue.some(job => job.runId === session.runId)
    )).length
  ), [runLogSessions, runQueue]);
  const formQueueCount = runQueue.length + backendFormQueueCount;
  const showStatus = Boolean(error || result || running || activeRunId || formQueueCount);

  const compareInputImage = useMemo(() => {
    if (isRunningHubApp) {
      for (const node of rhNodes) {
        if (String(node.fieldType).toUpperCase() !== "IMAGE") continue;
        const url = extractImageValueUrl(rhValues[`${node.nodeId}|${node.fieldName}`]);
        if (url) return url;
      }
      return "";
    }
    const compareItems = isRunningHubWf ? rhWfInputs : inputs;
    const compareValues = isRunningHubWf ? rhWfValues : values;
    return findCompareInputImage(compareItems, compareValues);
  }, [isRunningHubApp, isRunningHubWf, rhNodes, rhValues, rhWfInputs, rhWfValues, inputs, values]);

  const canCompare = Boolean(heroImage && compareInputImage);
  const discoverySystem = discovery?.system?.system || discovery?.system || null;
  const discoveryDevice = discovery?.system?.devices?.[0] || null;
  const selectedThemeOption = THEME_OPTIONS.find(option => option.id === theme) || THEME_OPTIONS[0];
  const selectedMainFont = MAIN_FONT_OPTIONS.find(option => option.id === mainFont)
    || MAIN_FONT_OPTIONS.find(option => option.id === "system");

  const serverDetailRows = useMemo(() => discovery ? [
    [t("serverDetail.address"), discovery.address || comfyAddress],
    [t("serverDetail.fetchedAt"), discovery.fetchedAt || ""],
    [t("serverDetail.comfyui"), discoverySystem?.comfyui_version || ""],
    [t("serverDetail.frontend"), discoverySystem?.required_frontend_version || ""],
    [t("serverDetail.python"), discoverySystem?.python_version || ""],
    [t("serverDetail.pytorch"), discoverySystem?.pytorch_version || ""],
    [t("serverDetail.os"), discoverySystem?.os || ""],
    [t("serverDetail.ramTotal"), formatBytes(discoverySystem?.ram_total)],
    [t("serverDetail.ramFree"), formatBytes(discoverySystem?.ram_free)],
    [t("serverDetail.device"), discoveryDevice?.name || discoveryDevice?.type || ""],
    [t("serverDetail.vramTotal"), formatBytes(discoveryDevice?.vram_total)],
    [t("serverDetail.vramFree"), formatBytes(discoveryDevice?.vram_free)],
    [t("serverDetail.nodeTypes"), discovery.nodeTypes?.length || 0],
    [t("serverDetail.modelFolders"), discovery.modelFolders?.length || 0]
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined) : [], [discovery, comfyAddress, discoverySystem, discoveryDevice, t]);

  const {
    imageScale, imagePan, imageFitSize, outputImageSize,
    draggingImage, isWheeling, compareMode, setCompareMode,
    comparePosition, compareDividerX,
    previewAreaRef, imageElementRef,
    resetImageView, handleResultImageLoad,
    handlePreviewWheel, handlePreviewPointerDown,
    handlePreviewPointerMove, handlePreviewPointerUp
  } = useImageViewer(displayImage, canCompare);

  const {
    deleteTemplate,
    loadConfig,
    loadRhWfConfig,
    loadRhWfTemplateRegistry,
    reloadRhWfTemplates,
    reloadTemplates,
    initializeFormWorkspace
  } = useTemplateWorkspaceActions({
    locale,
    t,
    getLastTemplate,
    getStoredValues,
    loadOutputHistory,
    refreshInputImages,
    resetImageView,
    setComfyAddress,
    setConfig,
    setError,
    setResult,
    setRhWfConfig,
    setRhWfSelectedTemplate,
    setRhWfTemplates,
    setRhWfValues,
    setSelectedOutputIndex,
    setSelectedTemplate,
    setStatus,
    setTemplates,
    setValues,
    defaultComfyServer: DEFAULT_COMFY_SERVER,
    skipInitialConfigLoad: isCanvasView
  });

  const handleHealingBridgeChange = useCallback((bridge) => {
    setHealingBridge(bridge);
  }, [setHealingBridge]);
  const healingBridgeRef = useRef(healingBridge);
  useEffect(() => {
    healingBridgeRef.current = healingBridge;
  }, [healingBridge]);

  const handlePreviewPointerDownWithHealing = useCallback((event) => {
    if (!healingBridge?.spaceToolSuspended && healingBridge?.colorPickTarget && imageElementRef.current) {
      if (healingBridge.handleColorPickPointerDown?.(event, imageElementRef.current)) return;
    }
    if (!healingBridge?.spaceToolSuspended && healingBridge?.active && imageElementRef.current) {
      if (healingBridge.handlePointerDown(event, imageElementRef.current, previewAreaRef.current)) return;
    }
    handlePreviewPointerDown(event);
  }, [healingBridge, handlePreviewPointerDown, imageElementRef, previewAreaRef]);

  const handlePreviewPointerMoveWithHealing = useCallback((event) => {
    if (!healingBridge?.spaceToolSuspended && healingBridge?.colorPickTarget && previewAreaRef.current) {
      if (healingBridge.handleColorPickPointerMove?.(event, imageElementRef.current, previewAreaRef.current)) return;
    }
    if (!healingBridge?.spaceToolSuspended && healingBridge?.active && imageElementRef.current) {
      if (healingBridge.handlePointerMove(event, imageElementRef.current, previewAreaRef.current)) return;
    }
    handlePreviewPointerMove(event);
  }, [healingBridge, handlePreviewPointerMove, imageElementRef, previewAreaRef]);

  const handlePreviewPointerUpWithHealing = useCallback((event) => {
    if (healingBridge?.handlePointerUp?.(event)) return;
    handlePreviewPointerUp(event);
  }, [healingBridge, handlePreviewPointerUp]);

  const handlePreviewPointerLeaveWithHealing = useCallback(() => {
    healingBridge?.clearHealingCursor?.();
    healingBridge?.clearColorPickCursor?.();
  }, [healingBridge]);

  const applyColorAdjustState = useCallback((historyId, outputIndex, colorAdjust) => {
    const filename = historyId
      ? history.find(item => item.id === historyId)?.outputs?.[outputIndex]?.filename
      : null;
    const key = makeColorAdjustKey(historyId, outputIndex, filename);
    if (key) colorAdjustCacheRef.current[key] = colorAdjust;
    setHistory(current => patchHistoryItemOutput(current, historyId, outputIndex, colorAdjust));
    if (result?.runId === historyId) {
      setResult(current => {
        if (!current?.outputs?.[outputIndex]) return current;
        const outputs = [...current.outputs];
        outputs[outputIndex] = { ...outputs[outputIndex], colorAdjust };
        return { ...current, outputs };
      });
    }
  }, [colorAdjustCacheRef, history, result?.runId, setHistory, setResult]);

  const handleColorAdjustPersist = useCallback((colorAdjust) => {
    const { historyId, outputIndex } = colorAdjustTarget;
    if (!colorAdjustTarget.key) return;
    applyColorAdjustState(historyId, outputIndex, colorAdjust);
    if (!historyId) return;
    fetch("/api/output-history/color-adjust", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        historyId,
        outputIndex,
        outputFilename: colorAdjustTarget.filename,
        colorAdjust
      })
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.history)) setHistory(data.history);
      })
      .catch(() => {});
  }, [applyColorAdjustState, colorAdjustTarget, setHistory]);

  const handleOpenColorSync = useCallback((sourceState) => {
    pendingColorSyncSourceRef.current = sourceState;
    setColorSyncOpen(true);
  }, [pendingColorSyncSourceRef, setColorSyncOpen]);

  const handleConfirmColorSync = useCallback(async (groups) => {
    const sourceState = pendingColorSyncSourceRef.current;
    if (!sourceState || !groups?.length) return;
    const targets = [...selectedHistoryIds].filter(id => id !== activeHistoryId);
    if (!targets.length) return;

    setColorSyncing(true);
    try {
      for (const historyId of targets) {
        const item = history.find(entry => entry.id === historyId);
        const outputIndex = 0;
        const output = item?.outputs?.[outputIndex];
        if (!output?.filename) continue;
        const currentState = getOutputColorAdjust(output) || colorAdjustCacheRef.current[
          makeColorAdjustKey(historyId, outputIndex, output.filename)
        ];
        const merged = mergeColorAdjustGroups(currentState, sourceState, groups);
        applyColorAdjustState(historyId, outputIndex, merged);
        const response = await fetch("/api/output-history/color-adjust", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            historyId,
            outputIndex,
            outputFilename: output.filename,
            colorAdjust: merged
          })
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.history)) setHistory(data.history);
        }
      }
      setStatus(t("colorPanel.synced"));
      setColorAdjustReloadToken(token => token + 1);
      setColorSyncOpen(false);
    } catch (err) {
      setError(localizeRuntimeMessage(err.message, locale));
    } finally {
      setColorSyncing(false);
    }
  }, [
    activeHistoryId,
    applyColorAdjustState,
    history,
    locale,
    selectedHistoryIds,
    colorAdjustCacheRef,
    pendingColorSyncSourceRef,
    setColorAdjustReloadToken,
    setColorSyncOpen,
    setColorSyncing,
    setHistory,
    setError,
    setStatus,
    t
  ]);

  // Persist theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setSetting("appearance.theme", theme);
  }, [theme]);

  // Persist font
  useEffect(() => {
    syncMainFontStylesheet(selectedMainFont);
    document.documentElement.style.setProperty("--main-font", selectedMainFont.family);
    setSetting("appearance.mainFont", mainFont);
  }, [mainFont, selectedMainFont]);

  // Persist server address
  useEffect(() => {
    if (comfyAddress) setSetting("connection.comfyAddress", comfyAddress);
  }, [comfyAddress]);

  // Persist notification preference
  useEffect(() => {
    setSetting("notifications.enabled", notifyEnabled);
  }, [notifyEnabled]);

  useEffect(() => {
    setSetting("execution.mode", executionMode);
  }, [executionMode]);

  useEffect(() => {
    setSetting("workspace.view", workspaceView);
  }, [workspaceView]);

  useEffect(() => {
    if (!isCanvasView) setCanvasRuntime(CANVAS_RUNTIME_IDLE);
  }, [isCanvasView]);

  useEffect(() => {
    if (isCanvasView) return;
    initializeFormWorkspace().catch(() => loadConfig(""));
  }, [isCanvasView, initializeFormWorkspace, loadConfig]);

  useEffect(() => {
    if (isCanvasView) return;
    if (executionMode !== "runninghub-app" || !rhPrimaryApiKey) return;
    if (!String(rhSettings.webappId || "").trim()) return;
    const timer = window.setTimeout(() => {
      fetchRhNodes().then(nextNodes => {
        if (nextNodes.length) setRhValues(current => ({ ...buildNodeDefaults(nextNodes), ...current }));
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [executionMode, isCanvasView, rhPrimaryApiKey, rhSettings.webappId, fetchRhNodes, setRhValues]);

  useEffect(() => {
    if (!settingsOpen || settingsTab !== "runninghub" || !rhAccountTokenSignature) return;
    if (rhAccount || rhAccountLoading || rhAccountError) return;
    handleRhAccountRefresh();
  // handleRhAccountRefresh intentionally reads the latest token pool and is
  // recreated with account state; depending on it would refetch in a loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, settingsTab, rhAccountTokenSignature, rhAccount, rhAccountLoading, rhAccountError]);

  useEffect(() => {
    if (isCanvasView) return;
    if (!isRunningHubWf || rhWfTemplates.length) return;
    loadRhWfTemplateRegistry()
      .then(data => {
        setRhWfTemplates(data.templates || []);
        const stored = loadRhWfLastTemplate();
        const hasStored = (data.templates || []).some(item => item.id === stored);
        const nextId = hasStored ? stored : data.default;
        if (nextId) return loadRhWfConfig(nextId);
        setRhWfConfig(null);
        setRhWfValues({});
        setStatus(t("status.rhWfNoTemplate"));
      })
      .catch(err => setError(localizeRuntimeMessage(err.message, locale)));
  }, [isCanvasView, isRunningHubWf, rhWfTemplates.length, loadRhWfConfig, loadRhWfTemplateRegistry, locale, setError, setRhWfConfig, setRhWfTemplates, setRhWfValues, setStatus, t]);

  // Persist workspace on every change
  useEffect(() => {
    if (isCanvasView) return;
    if (!selectedTemplate || !config) return;
    saveValues(selectedTemplate, values);
  }, [config, isCanvasView, selectedTemplate, values, saveValues]);

  useEffect(() => {
    if (isCanvasView) return;
    if (!rhWfSelectedTemplate || !rhWfConfig) return;
    saveValues(rhWfWorkspaceKey(rhWfSelectedTemplate), rhWfValues);
    setSetting("execution.rhWfSelectedTemplate", rhWfSelectedTemplate);
  }, [isCanvasView, rhWfConfig, rhWfSelectedTemplate, rhWfValues, saveValues]);

  // Close theme menu on outside click
  useEffect(() => {
    if (!themeMenuOpen) return undefined;
    function handlePointerDown(event) {
      if (!(event.target instanceof Element) || !event.target.closest(".themeSelectWrap")) setThemeMenuOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setThemeMenuOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [themeMenuOpen, setThemeMenuOpen]);

  // Reset output index when result changes
  useEffect(() => {
    if (selectedOutputIndex >= resultOutputs.length) setSelectedOutputIndex(0);
  }, [resultOutputs.length, selectedOutputIndex, setSelectedOutputIndex]);

  // Khi không còn chạy và hết hàng chờ, tắt màn hình chờ để xem được ảnh
  useEffect(() => {
    if (!running && !formQueueCount) setShowWaitScreen(false);
  }, [running, formQueueCount, setShowWaitScreen]);

  // Auto-fill dynamic choices from discovery
  useEffect(() => {
    if (isCanvasView) return;
    if (!inputs.length) return;
    setValues(current => {
      let changed = false;
      const next = { ...current };
      for (const item of inputs) {
        const kind = canonicalDynamicType(item.ui?.type);
        if (!kind || !item.id) continue;
        const choices = dynamicFieldChoices(discovery, kind);
        if (!choices.length) continue;
        const key = normalizeId(item.id);
        if (choices.includes(next[key])) continue;
        const preferred = choices.includes(item.ui?.value) ? item.ui.value : choices[0];
        next[key] = preferred;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [inputs, discovery, isCanvasView, setValues]);

  function selectOutput(index) {
    if (!resultOutputs.length) return;
    const nextIndex = Math.min(resultOutputs.length - 1, Math.max(0, index));
    setSelectedOutputIndex(nextIndex);
    resetImageView();
  }

  function stepOutput(direction) {
    if (resultOutputs.length < 2) return;
    setSelectedOutputIndex(current => (current + direction + resultOutputs.length) % resultOutputs.length);
    resetImageView();
  }

  function isRunningHubHistoryItem(item) {
    const templateId = String(item?.templateId || item?.result?.template || "");
    return item?.provider === "runninghub"
      || item?.result?.provider === "runninghub"
      || templateId.startsWith("runninghub:")
      || templateId.startsWith("runninghub-app:")
      || templateId.startsWith("runninghub-wf:")
      || templateId.startsWith("runninghub-wf-template:");
  }

  function runningHubHistoryMode(item) {
    if (item?.rhMode === "wf" || item?.result?.rhMode === "wf") return "runninghub-wf";
    const templateId = String(item?.templateId || item?.result?.template || "");
    if (templateId.startsWith("runninghub-wf:") || templateId.startsWith("runninghub-wf-template:")) {
      return "runninghub-wf";
    }
    return "runninghub-app";
  }

  function runningHubValuesFromHistory(item) {
    if (item?.values && Object.keys(item.values).length) return item.values;
    const restoredValues = {};
    for (const node of item?.nodes || []) {
      if (!node?.nodeId || !node?.fieldName) continue;
      restoredValues[nodeFieldKey(node)] = node.fieldValue ?? "";
    }
    return restoredValues;
  }

  async function handleRhAccountRefresh() {
    const tokens = rhEnabledTokens;
    if (!tokens.length) {
      const message = t("error.rhNoApiKey");
      setRhAccount(null);
      setRhTokenAccounts([]);
      setRhAccountError(message);
      return null;
    }

    setRhAccountLoading(true);
    setRhAccountError("");
    try {
      const results = await Promise.all(tokens.map(async token => {
        try {
          const response = await fetch("/api/runninghub/account-status", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ apiKey: token.apiKey.trim() })
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || data.msg || t("error.rhAccountInfo"));
          }
          return {
            tokenId: token.id,
            account: data.account || null,
            error: ""
          };
        } catch (err) {
          return {
            tokenId: token.id,
            account: null,
            error: localizeRuntimeMessage(err.message, locale)
          };
        }
      }));
      setRhTokenAccounts(results);
      const primary = results[0];
      setRhAccount(primary?.account || null);
      if (primary?.error) {
        setRhAccountError(primary.error);
        return null;
      }
      if (!primary?.account) {
        const message = t("error.rhAccountInfo");
        setRhAccountError(message);
        return null;
      }
      setRhAccountError("");
      return primary.account;
    } finally {
      setRhAccountLoading(false);
    }
  }

  useEffect(() => {
    const needsRhAccount = hasRhApiKey(rhSettings) && (
      (!isCanvasView && isRunningHub) || (isCanvasView && canvasRuntime.hasRhNodes)
    );
    if (!needsRhAccount) {
      setRhAccount(null);
      setRhTokenAccounts([]);
      setRhAccountError("");
      setRhAccountLoading(false);
      return undefined;
    }
    handleRhAccountRefresh();
    const timer = window.setInterval(() => {
      handleRhAccountRefresh();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  // handleRhAccountRefresh mutates the account state it reads; keeping this
  // interval keyed to mode/token identity avoids refreshes for unrelated RH settings.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunningHub, isCanvasView, canvasRuntime.hasRhNodes, rhAccountTokenSignature, setRhAccount, setRhAccountError, setRhAccountLoading, setRhTokenAccounts]);

  async function handleRhTestConnection() {
    setRhTesting(true);
    setRhTestResult(null);
    try {
      const nextNodes = await fetchRhNodes({
        apiKey: rhPrimaryApiKey,
        webappId: rhSettings.webappId,
        throwOnError: true
      });
      if (!nextNodes.length) throw new Error(t("error.rhZeroNodes"));
      setRhValues(current => ({ ...buildNodeDefaults(nextNodes), ...current }));
      setRhTestResult({ ok: true, message: t("error.rhConnectionOk", { count: nextNodes.length }) });
      await handleRhAccountRefresh();
    } catch (err) {
      setRhTestResult({ ok: false, message: localizeRuntimeMessage(err.message, locale) });
    } finally {
      setRhTesting(false);
    }
  }

  async function handleRefreshRhNodes() {
    try {
      const nextNodes = await fetchRhNodes({
        apiKey: rhPrimaryApiKey,
        webappId: rhSettings.webappId,
        throwOnError: true
      });
      if (nextNodes.length) setRhValues(current => ({ ...buildNodeDefaults(nextNodes), ...current }));
    } catch (err) {
      setRhTestResult({ ok: false, message: localizeRuntimeMessage(err.message, locale) });
    }
  }

  function handleHistoryItemClick(item, event) {
    if (!item?.id) return;
    const id = item.id;
    if (event.shiftKey && historySelectionAnchor) {
      const ids = history.map(entry => entry.id);
      const anchorIndex = ids.indexOf(historySelectionAnchor);
      const targetIndex = ids.indexOf(id);
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const [start, end] = anchorIndex < targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
        setSelectedHistoryIds(new Set(ids.slice(start, end + 1)));
      }
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedHistoryIds(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setHistorySelectionAnchor(id);
      return;
    }
    setSelectedHistoryIds(new Set([id]));
    setHistorySelectionAnchor(id);
    restoreHistory(item);
  }

  async function restoreHistory(item) {
    if (!item) return;
    localExecution.setError("");
    rhExecution.setError("");
    setShowWaitScreen(false);
    resetImageView();
    setSelectedOutputIndex(0);
    const restoredResult = {
      ...(item.result || {
        runId: item.id,
        promptId: item.promptId,
        template: item.templateId,
        address: item.address,
        submittedAt: item.submittedAt,
        completedAt: item.completedAt || item.createdAt,
        durationMs: item.durationMs,
        outputs: item.outputs || []
      }),
      provider: item.provider || item.result?.provider,
      rhCoins: item.rhCoins ?? item.result?.rhCoins ?? null,
      durationMs: item.durationMs ?? item.result?.durationMs,
      submittedAt: item.submittedAt ?? item.result?.submittedAt,
      completedAt: item.completedAt || item.createdAt || item.result?.completedAt,
      outputs: item.outputs || item.result?.outputs || []
    };
    if (isRunningHubHistoryItem(item)) {
      const historyMode = runningHubHistoryMode(item);
      const templateId = String(item.templateId || item.result?.template || "");
      const webappId = item.webappId || item.result?.webappId || templateId.replace(/^runninghub(-app)?:/, "");
      const workflowId = item.workflowId || item.result?.workflowId || templateId.replace(/^runninghub-wf:/, "");
      setExecutionMode(historyMode);
      rhExecution.setResult(restoredResult);
      rhExecution.setStatus(t("status.rhHistoryRestored"));
      if (historyMode === "runninghub-wf") {
        const rhWfTemplateId = item.rhWfTemplateId || item.result?.rhWfTemplateId
          || String(item.templateId || "").replace(/^runninghub-wf-template:/, "");
        if (rhWfTemplateId) {
          await loadRhWfConfig(rhWfTemplateId, {
            values: item.values,
            keepResult: true
          });
        } else if (workflowId) {
          setRhWfValues(item.values || {});
          rhExecution.setStatus(t("status.rhWfHistoryNoTemplate"));
        }
        return;
      }
      if (webappId) updateRhSettings({ webappId });
      if (Array.isArray(item.nodes) && item.nodes.length) {
        restoreRhNodes(item.nodes);
        setRhValues({ ...buildNodeDefaults(item.nodes), ...runningHubValuesFromHistory(item) });
      } else {
        setRhValues({});
        if (rhPrimaryApiKey && webappId) {
          rhExecution.setStatus(t("status.rhAppReloadNodes"));
          const nextNodes = await fetchRhNodes({ apiKey: rhPrimaryApiKey, webappId });
          if (nextNodes.length) {
            setRhValues(buildNodeDefaults(nextNodes));
            rhExecution.setStatus(t("status.rhAppHistoryNoValues"));
          } else {
            rhExecution.setStatus(t("status.rhAppHistoryNoMeta"));
          }
        } else {
          rhExecution.setStatus(t("status.rhAppHistoryNoMeta"));
        }
      }
      return;
    }
    setExecutionMode("local");
    localExecution.setResult(restoredResult);
    if (item.templateId === "image-editor") {
      localExecution.setStatus(t("status.imageFromEditor"));
      return;
    }
    await loadConfig(item.templateId, { values: item.values, keepResult: true, preserveServerAddress: true });
    localExecution.setStatus(t("status.historyRestored"));
  }

  async function handleDeleteHistoryItem(id) {
    await deleteHistoryItem(id);
    if (result?.runId === id) {
      setResult(null);
      setSelectedOutputIndex(0);
      resetImageView();
      setStatus(t("status.historyDeleted"));
    }
  }

  async function handleDownload(output) {
    try { await downloadImage(output); }
    catch (err) { setError(localizeRuntimeMessage(err.message, locale)); setStatus(t("error.downloadFailed")); }
  }

  async function handleReplaceOutputImage(dataUrl, statusKey = "colorPanel.updated") {
    const historyId = result?.runId || result?.historyItem?.id;
    const outputFilename = selectedOutput?.filename;
    if (!historyId && !outputFilename) throw new Error(t("error.saveNoHistoryItem"));

    const response = await fetch("/api/output-history/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        replace: true,
        historyId,
        outputIndex: selectedOutputIndex,
        outputFilename
      })
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(text || t("error.saveNoJson")); }
    if (!response.ok) {
      const serverError = localizeRuntimeMessage(data.error, locale);
      if (serverError === "Not found") throw new Error(t("error.replaceOutputBackendStale"));
      throw new Error(serverError || t("error.saveEditedFailed"));
    }
    if (!data.historyItem) throw new Error(t("error.saveNoHistoryItem"));
    const historyItem = data.historyItem;
    setResult(current => ({
      ...(historyItem.result || historyItem),
      provider: current?.provider ?? historyItem.provider,
      rhCoins: current?.rhCoins ?? historyItem.rhCoins
    }));
    setHistory(data.history || []);
    resetImageView();
    setStatus(t(statusKey));
  }

  async function handleSaveEditedOutput(dataUrl, statusKey = "status.editorSaved") {
    const response = await fetch("/api/output-history/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl, sourceFilename: selectedOutput?.filename, address: comfyAddress })
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(text || t("error.saveNoJson")); }
    if (!response.ok) throw new Error(localizeRuntimeMessage(data.error, locale) || t("error.saveEditedFailed"));
    if (!data.historyItem) throw new Error(t("error.saveNoHistoryItem"));
    const historyItem = data.historyItem;
    setResult(historyItem.result || historyItem);
    setSelectedOutputIndex(0);
    setHistory(current => data.history || (historyItem ? [historyItem, ...current] : current));
    resetImageView();
    setStatus(t(statusKey));
  }

  async function handleColorPanelUpdate(dataUrl) {
    setColorUpdating(true);
    try {
      await handleReplaceOutputImage(dataUrl);
      const clearedState = buildPersistedColorState(
        cloneDefaultAdjustments(),
        [],
        DEFAULT_HEALING_BRUSH_SIZE
      );
      handleColorAdjustPersist(clearedState);
      setColorAdjustReloadToken(token => token + 1);
      setColorPreviewUrl(null);
    } catch (err) {
      setError(localizeRuntimeMessage(err.message, locale));
      setStatus(t("error.saveEditedFailed"));
      throw err;
    } finally {
      setColorUpdating(false);
    }
  }

  function handleColorPanelToggle() {
    setColorPanelOpen(current => {
      if (current) setColorPreviewUrl(null);
      return !current;
    });
  }

  async function handleExportRunningHubShortcut(kind) {
    if (!shortcutExportAvailable) {
      setError(t("rh.exportShortcutWindowsDisabled"));
      return;
    }
    const apiKey = getPrimaryRhApiKey(rhSettings);
    if (!apiKey) {
      setError(t("rh.noApiKey"));
      return;
    }
    const isWorkflow = kind === "workflow";
    const configToExport = isWorkflow
      ? rhWfConfig
      : buildRunningHubAppShortcutConfig({
          webappId: rhSettings.webappId,
          appName: selectedRunningHubName,
          nodes: rhNodes,
          values: rhValues
        });
    if (!configToExport || !Object.keys(configToExport.input || {}).length) {
      setError(isWorkflow ? t("error.rhWfMissingTemplateShort") : t("error.rhMissingAppNodes"));
      return;
    }

    setShortcutExporting(true);
    setError("");
    setStatus(t("rh.exportShortcutSigning"));
    try {
      const payload = {
        kind,
        resourceId: isWorkflow
          ? String(rhWfConfig?.runninghub?.workflowId || "").trim()
          : String(rhSettings.webappId || "").trim(),
        name: isWorkflow
          ? rhWfConfig?.app?.name || rhWfSelectedTemplate
          : selectedRunningHubName,
        config: configToExport,
        apiKey
      };
      let response;
      if (typeof window.apixDesktop?.exportRunningHubShortcut === "function") {
        response = await window.apixDesktop.exportRunningHubShortcut(payload);
      } else {
        const exportResponse = await fetch("/api/runninghub/export-shortcut", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!exportResponse.ok) {
          const errorBody = await exportResponse.json().catch(() => ({}));
          throw new Error(errorBody.error || t("rh.exportShortcutFailed"));
        }
        const blob = await exportResponse.blob();
        const disposition = exportResponse.headers.get("content-disposition") || "";
        const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || `${payload.name || "RunningHub-Shortcut"}.shortcut`;
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(downloadUrl);
        response = {
          ok: true,
          kind: exportResponse.headers.get("x-runninghub-shortcut-kind") || kind,
          resourceId: exportResponse.headers.get("x-runninghub-resource-id") || payload.resourceId,
          mapping: decodeURIComponent(exportResponse.headers.get("x-runninghub-mapping") || "")
            .split(",")
            .filter(Boolean)
        };
      }
      if (response?.canceled) {
        setStatus(t("rh.exportShortcutCanceled"));
        return;
      }
      if (!response?.ok) throw new Error(response?.error || t("rh.exportShortcutFailed"));
      setStatus(t("rh.exportShortcutDoneDetail", {
        kind: response.kind || kind,
        id: response.resourceId || payload.resourceId,
        mapping: (response.mapping || []).join(", ")
      }));
    } catch (err) {
      setError(localizeRuntimeMessage(err.message, locale));
      setStatus(t("rh.exportShortcutFailed"));
    } finally {
      setShortcutExporting(false);
    }
  }

  // Compute progress percentage
  const progressPct = progress?.max > 0 ? Math.round((progress.value / progress.max) * 100) : null;
  // Màn hình chờ chỉ chiếm preview khi đang chạy VÀ người dùng đang xem nó
  const showRunningScreen = running && showWaitScreen;

  const canRun = isRunningHubApp
    ? Boolean(rhNodes.length && hasRhApiKey(rhSettings))
    : isRunningHubWf
      ? Boolean(rhWfConfig && rhWfInputs.length && hasRhApiKey(rhSettings) && String(rhWfConfig?.runninghub?.workflowId || "").trim())
      : Boolean(config);

  const {
    openSettings,
    toggleSettings,
    openInfo,
    closeInfo,
    settingsModalProviderValue
  } = useWorkspaceModals({
    setSettingsOpen,
    setInfoOpen,
    setSettingsTab,
    settingsOpen,
    settingsTab,
    theme,
    setTheme,
    themeMenuOpen,
    setThemeMenuOpen,
    selectedThemeOption,
    mainFont,
    setMainFont,
    languagePreference,
    setLanguagePreference,
    healthStatus,
    showServerDetails,
    setShowServerDetails,
    notifyEnabled,
    setNotifyEnabled,
    comfyAddress,
    setComfyAddress,
    serverAddress,
    discovery,
    discoveryLoading,
    discoverySystem,
    discoveryDevice,
    serverDetailRows,
    formatBytes,
    getServers,
    addServer,
    removeServer,
    addServerOpen,
    setAddServerOpen,
    rhSettings,
    updateRhSettings,
    handleRhTestConnection,
    rhTesting,
    rhTestResult,
    rhAccount,
    rhAccountLoading,
    rhAccountError,
    handleRhAccountRefresh,
    rhTokenAccounts,
    rhTotalCoins,
    setRhTestResult,
    setRhAccount,
    setRhAccountError,
    canvasSmartGuide,
    setCanvasSmartGuide,
    canvasSnapGrid,
    setCanvasSnapGrid,
    canvasSnapGridSize,
    setCanvasSnapGridSize,
    maxHistoryDisplay,
    setMaxHistoryDisplay
  });

  const handleRunClickRef = useShortcutActionRefs(handleRunClick);
  const handleColorPanelToggleRef = useShortcutActionRefs(handleColorPanelToggle);
  const stepOutputRef = useShortcutActionRefs(stepOutput);

  const { toggleFullscreen } = useWorkspaceShortcuts({
    isCanvasView,
    infoOpen,
    setInfoOpen,
    setSettingsOpen,
    setExecutionMode,
    setWorkspaceView,
    setIsFullscreen,
    setRunLogOpen,
    heroImage,
    canCompare,
    resetImageView,
    setCompareMode,
    healingBridgeRef,
    resultOutputsLength: resultOutputs.length,
    stepOutputRef,
    colorPanelOpen,
    showRunningScreen,
    handleColorPanelToggleRef,
    canRun,
    handleRunClickRef
  });

  return (
    <main
      className={`appShell${isCanvasView ? " is-canvas-view" : ""} ${isRunningHub ? "is-runninghub" : ""}${sidebarSide === "right" ? " sidebar-right" : ""}${availableUpdate ? " hasUpdateBanner" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` }}
    >
      <header className="appTopBar">
        <div className="appTopBarIdentity">
          <div className="appTopBarBrand">
            <div className="appTopBarMark" role="img" aria-label="SDVN" />
            <h1 className="title-font">aPix Builder</h1>
          </div>

          <div className={`appTopBarModeCluster${isCanvasView ? " is-canvas-view" : ""}`}>
            <ExecutionModeToggle
              mode={executionMode}
              onChange={(nextMode) => {
                setExecutionMode(nextMode);
                if (isCanvasView) setWorkspaceView("form");
              }}
              canvasActive={isCanvasView}
              onCanvasToggle={() => setWorkspaceView(isCanvasView ? "form" : "canvas")}
            >
              <div
                ref={handleWorkflowToolbarHost}
                className="appTopBarWorkflowHost"
                aria-hidden={!isCanvasView}
              />
            </ExecutionModeToggle>
          </div>
        </div>

        <div className="appTopBarActions">
          <button
            type="button"
            className={`appTopBarServer${topBarShowsRh ? " is-runninghub" : ""}`}
            onPointerEnter={preloadSettingsModal}
            onFocus={preloadSettingsModal}
            onClick={() => {
              openSettings(
                isCanvasView
                  ? (canvasTopBarLocal && !canvasTopBarRh ? "comfy" : "runninghub")
                  : (isRunningHub ? "runninghub" : "comfy")
              );
            }}
            title={topBarServerTitle}
            aria-label={topBarServerTitle}
          >
            {topBarShowsRh
              ? <RunningHubLogomark size={11} aria-hidden="true" />
              : <ComfyUiLogomark size={14} aria-hidden="true" />}
            {topBarServerStatus ? (
              <span
                className={`appTopBarStatus health-${topBarServerStatus}`}
                title={
                  topBarServerStatus === "running"
                    ? t("canvas.running")
                    : topBarServerStatus === "online"
                      ? (topBarShowsRh ? t("rh.keyValid") : t("canvas.comfyReady"))
                      : topBarServerStatus === "loading"
                        ? (canvasRuntime.queueCount > 0 && !canvasRuntime.running
                          ? t("canvas.queued", { count: canvasRuntime.queueCount })
                          : t("rh.loadingAccount"))
                        : isRunningHub && rhAccountError
                          ? rhAccountError
                          : t("rh.disconnected")
                }
                aria-hidden="true"
              />
            ) : (
              <span className="appTopBarStatus" title={t("canvas.empty")} aria-hidden="true" />
            )}
            <span className="appTopBarServerLabel">{topBarServerLabel}</span>
            {topBarShowsRh ? (
              rhAccountLoading && hasRhApiKey(rhSettings) && !canvasRuntime.running ? (
                <span className="appTopBarCoinBadge isLoading" aria-hidden="true">
                  <Loader2 size={10} className="spin" />
                </span>
              ) : rhDisplayCoins != null && !canvasRuntime.running ? (
                <span
                  className="appTopBarCoinBadge"
                  title={rhEnabledTokenCount > 1 ? t("rh.totalCoinBalance") : t("rh.coinBalance")}
                >
                  <Coins size={10} aria-hidden="true" />
                  <span>{formatRhCoins(rhDisplayCoins)}</span>
                </span>
              ) : null
            ) : null}
          </button>

          <button
            className="appTopBarButton"
            onPointerEnter={preloadSettingsModal}
            onFocus={preloadSettingsModal}
            onClick={toggleSettings}
            title={`${t("settings.open")} (Cmd/Ctrl + ,)`}
            aria-label={t("settings.open")}
            aria-keyshortcuts="Meta+Comma Control+Comma"
          >
            <Settings2 size={15} />
          </button>
          <button
            type="button"
            className="appTopBarButton"
            onClick={toggleFullscreen}
            title={isFullscreen ? `${t("fullscreen.exit")} (Cmd/Ctrl + Shift + F)` : `${t("fullscreen.enter")} (Cmd/Ctrl + Shift + F)`}
            aria-label={isFullscreen ? t("fullscreen.exit") : t("fullscreen.enter")}
            aria-pressed={isFullscreen}
            aria-keyshortcuts="Meta+Shift+f Control+Shift+f"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button className="appTopBarButton" onClick={openInfo} title={`${t("info.open")} (Cmd/Ctrl + /)`} aria-label={t("info.open")} aria-keyshortcuts="Meta+/ Control+/">
            <Info size={15} />
          </button>
        </div>
      </header>

      <AppUpdateBanner
        update={availableUpdate}
        onDownload={downloadUpdate}
        onDismiss={dismissUpdate}
      />

      {isCanvasView ? (
        <Suspense fallback={<div className="canvasView" />}>
          <InfiniteCanvas
            rhSettings={rhSettings}
            inputImages={inputImages}
            refreshInputImages={refreshInputImages}
            updateInputImages={setInputImages}
            outputHistory={history}
            refreshOutputHistory={loadOutputHistory}
            runLogSessions={runLogHistory.sessions}
            refreshRunLogSessions={refreshRunLogSessions}
            runLogStartSession={runLogHistory.startSession}
            runLogAppendLog={runLogHistory.appendLog}
            runLogEndSession={runLogHistory.endSession}
            runLogClearHistory={clearRunLogHistory}
            runLogOpen={runLogOpen}
            setRunLogOpen={setRunLogOpen}
            deleteRunLogSession={deleteRunLogSession}
            updateRunLogSession={updateRunLogSession}
            restoreHistory={restoreHistory}
            logRhApiKey={rhPrimaryApiKey}
            onRuntimeStateChange={handleCanvasRuntimeChange}
            workflowToolbarHost={workflowToolbarHost}
            smartGuide={canvasSmartGuide}
            snapGrid={canvasSnapGrid}
            snapGridSize={canvasSnapGridSize}
            maxHistoryDisplay={maxHistoryDisplay}
          />
        </Suspense>
      ) : (
      <>
      <aside className="sidebar">
        <SidebarLayoutHandles onMoveStart={startSidebarMove} onResizeStart={startSidebarResize} />

        {isRunningHubApp ? (
          <RunningHubPanel
            settings={rhSettings}
            webappOptions={rhWebappOptions}
            savedWebapps={rhSavedWebapps}
            savedAppsError={rhSavedAppsError}
            onSaveWebapp={saveCurrentWebapp}
            onSettingsChange={patch => {
              updateRhSettings(patch);
              setRhTestResult(null);
              restoreRhWebappInfo(null);
            }}
            nodes={rhNodes}
            webappInfo={rhWebappInfo}
            values={rhValues}
            onValuesChange={setRhValues}
            nodesLoading={rhNodesLoading}
            nodesError={rhNodesError}
            onRefreshNodes={handleRefreshRhNodes}
            onExportShortcut={() => handleExportRunningHubShortcut("app")}
            shortcutExporting={shortcutExporting}
            shortcutExportAvailable={shortcutExportAvailable && Boolean(rhNodes.length && rhSettings.webappId?.trim() && rhPrimaryApiKey)}
            inputImages={inputImages}
            onRefreshInputImages={refreshInputImages}
            onUpdateInputImages={setInputImages}
          />
        ) : isRunningHubWf ? (
          <>
            <section className="settingsGroup">
              <div className="settingsHeader">
                <Settings2 size={16} />
                <h2>RunningHub Workflow</h2>
                <button
                  type="button"
                  className="rhWebappActionBtn rhExportShortcutBtn"
                  onClick={() => handleExportRunningHubShortcut("workflow")}
                  disabled={!shortcutExportAvailable || shortcutExporting || !rhWfConfig || !rhPrimaryApiKey}
                  title={shortcutExportAvailable ? t("rh.exportShortcut") : t("rh.exportShortcutWindowsDisabled")}
                  aria-label={t("rh.exportShortcut")}
                >
                  {shortcutExporting ? <Loader2 size={14} className="spin" /> : <AppleShortcutsIcon size={16} />}
                </button>
              </div>
              <TemplateSelector
                templates={rhWfTemplates}
                selectedTemplate={rhWfSelectedTemplate}
                onChange={loadRhWfConfig}
                onEdit={() => setRhWfTemplateEditorOpen(true)}
                onDelete={deleteTemplate}
                deleteScope="runninghub-wf"
              />
              <PresetBar
                templateId={rhWfWorkspaceKey(rhWfSelectedTemplate)}
                presets={rhWfPresets}
                onLoad={nextValues => setRhWfValues(current => ({ ...current, ...nextValues }))}
                onSave={name => savePreset(rhWfWorkspaceKey(rhWfSelectedTemplate), name, rhWfValues)}
                onUpdate={id => updatePreset(rhWfWorkspaceKey(rhWfSelectedTemplate), id, rhWfValues)}
                onDelete={id => deletePreset(rhWfWorkspaceKey(rhWfSelectedTemplate), id)}
                storageWarning={presetsStorageWarning}
              />
            </section>

            <section className="settingsGroup workflowSettings">
              <div className="settingsHeader">
                <Settings2 size={16} />
                <h2>{t("workflow.settings")}</h2>
              </div>
              <div className="formStack">
                {rhWfInputs.map(item => {
                  const valueKey = itemValueKey(item);
                  return (
                    <DynamicField
                      key={item.key}
                      item={item}
                      value={valueKey ? rhWfValues[valueKey] : rhWfValues[normalizeId(item.id)]}
                      onChange={next => {
                        const key = valueKey || normalizeId(item.id);
                        setRhWfValues(current => ({ ...current, [key]: next }));
                      }}
                      allValues={rhWfValues}
                      onValueChange={(key, next) => setRhWfValues(current => ({ ...current, [key]: next }))}
                      inputImages={inputImages}
                      onRefreshInputImages={refreshInputImages}
                      onUpdateInputImages={setInputImages}
                    />
                  );
                })}
                {!rhWfInputs.length ? (
                  <div className="rhPanelEmpty">
                    <p>{t("workflow.empty")}</p>
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="settingsGroup">
              <div className="settingsHeader">
                <Settings2 size={16} />
                <h2>API Workflow</h2>
                <span className={`healthDot health-${healthStatus}`} title={
                  healthStatus === "online" ? `ComfyUI online · ${discoverySystem?.comfyui_version || ""}` :
                  healthStatus === "loading" ? t("health.connecting") : t("health.comfyOffline")
                } aria-label={healthStatus === "online" ? "Online" : healthStatus === "loading" ? t("health.connectingShort") : "Offline"}>
                  {healthStatus === "loading" ? <Loader2 size={10} className="spin" /> :
                   healthStatus === "online" ? <Wifi size={10} /> : <WifiOff size={10} />}
                </span>
              </div>
              <TemplateSelector
                templates={templates}
                selectedTemplate={selectedTemplate}
                onChange={loadConfig}
                onEdit={() => setTemplateEditorOpen(true)}
                onDelete={deleteTemplate}
              />
              <PresetBar
                templateId={selectedTemplate}
                presets={currentPresets}
                onLoad={nextValues => setValues(current => ({ ...current, ...nextValues }))}
                onSave={name => savePreset(selectedTemplate, name, values)}
                onUpdate={id => updatePreset(selectedTemplate, id, values)}
                onDelete={id => deletePreset(selectedTemplate, id)}
                storageWarning={presetsStorageWarning}
              />
            </section>

            <section className="settingsGroup workflowSettings">
              <div className="settingsHeader">
                <Settings2 size={16} />
                <h2>{t("workflow.settings")}</h2>
              </div>
              <div className="formStack">
                {inputs.map(item => {
                  const valueKey = itemValueKey(item);
                  return (
                    <DynamicField
                      key={item.key}
                      item={item}
                      value={valueKey ? values[valueKey] : values[normalizeId(item.id)]}
                      onChange={next => {
                        const key = valueKey || normalizeId(item.id);
                        setValues(current => ({ ...current, [key]: next }));
                      }}
                      allValues={values}
                      onValueChange={(key, next) => setValues(current => ({ ...current, [key]: next }))}
                      inputImages={inputImages}
                      onRefreshInputImages={refreshInputImages}
                      onUpdateInputImages={setInputImages}
                      discovery={discovery}
                      discoveryLoading={discoveryLoading}
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}

        <RunControls
          running={running}
          canRun={canRun}
          canCancel={Boolean(running && activeRunId)}
          queueCount={formQueueCount}
          onRun={handleRunClick}
          onCancel={cancelWorkflow}
          onClearQueue={clearQueue}
          onStopAll={stopAllWorkflow}
          runLabel={isRunningHub ? "Run" : undefined}
        />
      </aside>

      <section
        className={`workspace color-panel-${sidebarSide === "right" ? "left" : "right"}${colorPanelOpen ? " hasColorPanel" : ""}`}
        style={colorPanelOpen ? { "--output-color-panel-width": `${colorPanelWidth}px` } : undefined}
      >
        <PreviewPanel
          outputLabel={outputLabel}
          resultOutputs={resultOutputs}
          selectedOutputIndex={selectedOutputIndex}
          showStatus={showStatus}
          error={error}
          result={result}
          running={running}
          status={status}
          selectedOutput={selectedOutput}
          canCompare={canCompare}
          compareMode={compareMode}
          setCompareMode={setCompareMode}
          resetImageView={resetImageView}
          onOpenEditor={() => setOutputEditorOpen(true)}
          onDownload={handleDownload}
          showRunningScreen={showRunningScreen}
          isRunningHub={isRunningHub}
          progress={progress}
          progressPct={progressPct}
          heroImage={heroImage}
          displayImage={displayImage}
          compareInputImage={compareInputImage}
          imageScale={imageScale}
          imagePan={imagePan}
          imageFitSize={imageFitSize}
          outputImageSize={outputImageSize}
          outputTimingLabel={outputTimingLabel}
          draggingImage={draggingImage}
          isWheeling={isWheeling}
          comparePosition={comparePosition}
          compareDividerX={compareDividerX}
          previewAreaRef={previewAreaRef}
          imageElementRef={imageElementRef}
          handleResultImageLoad={handleResultImageLoad}
          handlePreviewWheel={handlePreviewWheel}
          handlePreviewPointerDown={handlePreviewPointerDownWithHealing}
          handlePreviewPointerMove={handlePreviewPointerMoveWithHealing}
          handlePreviewPointerUp={handlePreviewPointerUpWithHealing}
          handlePreviewPointerLeave={handlePreviewPointerLeaveWithHealing}
          healingActive={Boolean(healingBridge?.active) && !healingBridge?.spaceToolSuspended}
          healingCursor={healingBridge?.spaceToolSuspended ? null : (healingBridge?.cursor ?? null)}
          healingBrushDiameter={healingBridge?.brushDiameter ?? 0}
          colorPickTarget={healingBridge?.spaceToolSuspended ? null : (healingBridge?.colorPickTarget ?? null)}
          colorPickCursor={healingBridge?.spaceToolSuspended ? null : (healingBridge?.colorPickCursor ?? null)}
          stepOutput={stepOutput}
          selectOutput={selectOutput}
          RunningState={RunningState}
          runLogOpen={runLogOpen}
          setRunLogOpen={setRunLogOpen}
          runLogSessions={runLogSessions}
          history={history}
          deleteRunLogSession={deleteRunLogSession}
          clearRunLogHistory={clearRunLogHistory}
          refreshRunLogSessions={refreshRunLogSessions}
          restoreHistory={restoreHistory}
          rhApiKey={rhPrimaryApiKey}
          updateRunLogSession={updateRunLogSession}
          runQueue={runQueue}
          activeRunId={activeRunId}
          colorPanelOpen={colorPanelOpen}
          onColorPanelToggle={handleColorPanelToggle}
          colorUpdating={colorUpdating}
          colorPanelAlign={sidebarSide === "right" ? "left" : "right"}
        />

        <OutputColorPanel
          open={colorPanelOpen}
          source={colorPanelSource}
          persistKey={colorAdjustTarget.key}
          persistedState={persistedColorState}
          onPersist={handleColorAdjustPersist}
          onPreviewChange={setColorPreviewUrl}
          onUpdate={handleColorPanelUpdate}
          onWidthChange={setColorPanelWidth}
          onHealingBridgeChange={handleHealingBridgeChange}
          onSyncClick={handleOpenColorSync}
          syncDisabled={colorSyncTargetCount === 0}
          syncing={colorSyncing}
          updating={colorUpdating}
          disabled={!heroImage || showRunningScreen}
          align={sidebarSide === "right" ? "left" : "right"}
        />

        <ColorSyncModal
          open={colorSyncOpen}
          targetCount={colorSyncTargetCount}
          onClose={() => setColorSyncOpen(false)}
          onConfirm={handleConfirmColorSync}
        />

        <OutputGallery
          history={history}
          maxHistoryDisplay={maxHistoryDisplay}
          onDownload={handleDownload}
          onItemClick={handleHistoryItemClick}
          onRestore={restoreHistory}
          selectedIds={selectedHistoryIds}
          activeId={activeHistoryId}
          onDelete={handleDeleteHistoryItem}
          pending={running || formQueueCount > 0}
          pendingActive={showRunningScreen}
          pendingLabel={progress?.label || status}
          pendingProgressPct={progressPct}
          queueCount={formQueueCount}
          onShowWaiting={() => setShowWaitScreen(true)}
        />
      </section>
      </>
      )}

      <WorkspaceModals
        settingsOpen={settingsOpen}
        settingsModalProviderValue={settingsModalProviderValue}
        infoOpen={infoOpen}
        closeInfo={closeInfo}
        infoModeLabel={infoModeLabel}
        infoTemplateLabel={infoTemplateLabel}
        infoTargetLabel={infoTargetLabel}
        isDesktop={isDesktop}
        updateChecking={updateChecking}
        updateCheckError={updateCheckError}
        updateUpToDate={updateUpToDate}
        availableUpdate={availableUpdate}
        checkForUpdates={checkForUpdates}
        downloadUpdate={downloadUpdate}
        templateEditorOpen={templateEditorOpen}
        setTemplateEditorOpen={setTemplateEditorOpen}
        selectedTemplate={selectedTemplate}
        discovery={discovery}
        reloadTemplates={reloadTemplates}
        rhWfTemplateEditorOpen={rhWfTemplateEditorOpen}
        setRhWfTemplateEditorOpen={setRhWfTemplateEditorOpen}
        rhWfSelectedTemplate={rhWfSelectedTemplate}
        rhPrimaryApiKey={rhPrimaryApiKey}
        reloadRhWfTemplates={reloadRhWfTemplates}
        outputEditorOpen={outputEditorOpen}
        setOutputEditorOpen={setOutputEditorOpen}
        heroImage={heroImage}
        handleSaveEditedOutput={handleSaveEditedOutput}
      />

    </main>
  );
}

