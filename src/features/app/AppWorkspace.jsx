import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import {
  CheckCircle2,
  Coins,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Settings2,
  Wifi,
  WifiOff,
  X
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
import { SettingsModal } from "../../components/SettingsModal";
import { ImageEditorModal, TemplateEditorModal } from "../../components/lazyModals";
import { formatOutputTimingLabel, formatRhCoins } from "../../lib/runLog";
import { PresetBar } from "../../components/PresetBar";
import { RunControls } from "../../components/RunControls";
import { TemplateSelector } from "../../components/TemplateSelector";
import { downloadImage } from "../../lib/download";
import { canonicalDynamicType, dynamicFieldChoices } from "../../lib/dynamicTypes";
import {
  expandImageBatchByKeys,
  expandImageBatchValues,
  extractImageValueUrl,
  findCompareInputImage,
  flattenInputs,
  itemValueKey,
  normalizeId,
  requestPayload
} from "../../lib/template";
import { useDiscovery } from "../../hooks/useDiscovery";
import { useHistory } from "../../hooks/useHistory";
import { useInputImages } from "../../hooks/useInputImages";
import { usePresets } from "../../hooks/usePresets";
import { useServerList } from "../../hooks/useServerList";
import { useWorkspace, sanitizeWorkspaceValues } from "../../hooks/useWorkspace";
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
  buildRhRunAuth,
  getEnabledRhTokens,
  getPrimaryRhApiKey,
  hasRhApiKey,
  RH_TOKEN_POLICY
} from "../../lib/rhTokenPool.js";
import { expandFolderImageValues } from "../../lib/localImageFolder.js";
import { rhWfWorkspaceKey } from "../../lib/runningHubTemplate";
import { ExecutionModeToggle, RunningHubPanel } from "../../components/RunningHubPanel";
import { SidebarLayoutHandles } from "../../components/SidebarLayoutHandles";
import { SdvnWaterLogo } from "../../components/SdvnWaterLogo";
import { ComfyUiLogomark } from "../../components/icons/ComfyUiIcon";
import { RunningHubLogomark } from "../../components/icons/RunningHubIcon";
import { localizeRuntimeMessage, useI18n } from "../../i18n/I18nContext";
import { MAIN_FONT_OPTIONS, THEME_OPTIONS } from "../../constants/appearance";
import { getSetting, setSetting } from "../../lib/appSettings";
import { APP_VERSION_LABEL } from "../../constants/app";
import { isTextEntryTarget, isTypingTarget, releaseGlobalShortcutFocus } from "../../lib/keyboard";
import { useColorAdjustContext } from "../../providers/ColorAdjustProvider.jsx";
import { useExecutionContext } from "../../providers/ExecutionProvider.jsx";
import { useHistoryContext } from "../../providers/HistoryProvider.jsx";
import {
  DEFAULT_COMFY_SERVER,
  useWorkspaceLayoutContext
} from "../../providers/WorkspaceLayoutProvider.jsx";
import {
  SettingsModalProvider
} from "../../providers/SettingsModalProvider.jsx";
import { useTemplateWorkspaceActions } from "../templates/useTemplateWorkspaceActions.js";

function loadRhWfLastTemplate() {
  return getSetting("execution.rhWfSelectedTemplate", "");
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
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

function isLogToggleKey(event) {
  if (event.code === "Backquote" || event.code === "IntlBackslash") return true;
  return event.key === "`" || event.key === "~";
}

export function AppWorkspace() {
  const { locale, preference: languagePreference, setPreference: setLanguagePreference, t } = useI18n();
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
    addServerOpen, setAddServerOpen
  } = useWorkspaceLayoutContext();
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

  const { discovery, discoveryLoading } = useDiscovery(executionMode === "local" ? comfyAddress : "");
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
  const { history, setHistory, loadOutputHistory, deleteHistoryItem } = useHistory();
  const { inputImages, setInputImages, refreshInputImages } = useInputImages();
  const { workspaceRef, getStoredValues, saveValues, getLastTemplate } = useWorkspace();
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
    running, activeRunId, activeJob, activeTaskId, taskStatus, runQueue,
    status, setStatus, error, setError,
    result, setResult, progress,
    runWorkflow, cancelWorkflow, runStep,
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
    if (!runLogOpen || !running) return;
    const timer = window.setInterval(() => {
      refreshRunLogSessions();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [runLogOpen, running, refreshRunLogSessions]);

  const isRunningHub = isRunningHubMode(executionMode);
  const isRunningHubApp = executionMode === "runninghub-app";
  const isRunningHubWf = executionMode === "runninghub-wf";
  const healthStatus = discoveryLoading ? "loading" : discovery ? "online" : "offline";

  const inputs = useMemo(() => flattenInputs(config?.input), [config]);
  const rhWfInputs = useMemo(() => flattenInputs(rhWfConfig?.input), [rhWfConfig]);
  const outputs = useMemo(() => Object.values(config?.output || {}), [config]);
  const currentPresets = useMemo(() => getPresets(selectedTemplate), [getPresets, selectedTemplate, presetsVersion]);
  const rhWfPresets = useMemo(
    () => getPresets(rhWfWorkspaceKey(rhWfSelectedTemplate)),
    [getPresets, rhWfSelectedTemplate, presetsVersion]
  );
  const app = config?.app || {};
  const serverAddress = config?.server?.address || config?.sever?.address || "";
  const rhPrimaryApiKey = getPrimaryRhApiKey(rhSettings);
  const rhEnabledTokenCount = getEnabledRhTokens(rhSettings).length;
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
  const topBarServerLabel = isRunningHubWf
    ? "RunningHub Workflow"
    : isRunningHubApp
      ? selectedRunningHubName
      : activeServer?.label || formatServerName(comfyAddress);
  const topBarServerStatus = isRunningHub
    ? !hasRhApiKey(rhSettings)
      ? "offline"
      : rhAccountLoading
        ? "loading"
        : rhAccountError
          ? "offline"
          : rhAccount
            ? "online"
            : "loading"
    : healthStatus;
  const topBarServerTitle = useMemo(() => {
    if (!isRunningHub) return topBarServerLabel;
    const parts = [topBarServerLabel];
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
  }, [colorAdjustTarget, history, selectedOutput]);
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
  const showStatus = Boolean(error || result || running || activeRunId || runQueue.length);

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
    reloadTemplates
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
    defaultComfyServer: DEFAULT_COMFY_SERVER
  });

  const handleHealingBridgeChange = useCallback((bridge) => {
    setHealingBridge(bridge);
  }, []);
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
  }, [history, result?.runId]);

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
  }, [applyColorAdjustState, colorAdjustTarget]);

  const handleOpenColorSync = useCallback((sourceState) => {
    pendingColorSyncSourceRef.current = sourceState;
    setColorSyncOpen(true);
  }, []);

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
    document.documentElement.style.setProperty("--main-font", selectedMainFont.family);
    setSetting("appearance.mainFont", mainFont);
  }, [mainFont, selectedMainFont.family]);

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
    if (executionMode !== "runninghub-app" || !hasRhApiKey(rhSettings)) return;
    if (!String(rhSettings.webappId || "").trim()) return;
    const timer = window.setTimeout(() => {
      fetchRhNodes().then(nextNodes => {
        if (nextNodes.length) setRhValues(current => ({ ...buildNodeDefaults(nextNodes), ...current }));
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [executionMode, rhSettings, rhSettings.webappId, fetchRhNodes]);

  useEffect(() => {
    if (!settingsOpen || settingsTab !== "runninghub" || !hasRhApiKey(rhSettings)) return;
    if (rhAccount || rhAccountLoading || rhAccountError) return;
    handleRhAccountRefresh();
  }, [settingsOpen, settingsTab, rhSettings, rhAccount, rhAccountLoading, rhAccountError]);

  useEffect(() => {
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
  }, [isRunningHubWf, rhWfTemplates.length]);

  // Persist workspace on every change
  useEffect(() => {
    if (!selectedTemplate || !config) return;
    saveValues(selectedTemplate, values);
  }, [config, selectedTemplate, values]);

  useEffect(() => {
    if (!rhWfSelectedTemplate || !rhWfConfig) return;
    saveValues(rhWfWorkspaceKey(rhWfSelectedTemplate), rhWfValues);
    setSetting("execution.rhWfSelectedTemplate", rhWfSelectedTemplate);
  }, [rhWfConfig, rhWfSelectedTemplate, rhWfValues]);

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
  }, [themeMenuOpen]);

  // Execution mode shortcuts (Alt/Option + 1/2/3)
  useEffect(() => {
    const MODE_BY_CODE = {
      Digit1: "local",
      Digit2: "runninghub-wf",
      Digit3: "runninghub-app"
    };

    function handleExecutionModeShortcut(event) {
      const mode = MODE_BY_CODE[event.code];
      if (!mode) return;
      if (!event.altKey) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
      setExecutionMode(mode);
    }

    window.addEventListener("keydown", handleExecutionModeShortcut, true);
    return () => window.removeEventListener("keydown", handleExecutionModeShortcut, true);
  }, [setExecutionMode]);

  // Settings modal shortcut (Cmd/Ctrl + ,)
  useEffect(() => {
    function handleSettingsShortcut(event) {
      if (event.key !== "," && event.code !== "Comma") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setInfoOpen(false);
      setSettingsOpen(current => !current);
    }
    window.addEventListener("keydown", handleSettingsShortcut, true);
    return () => window.removeEventListener("keydown", handleSettingsShortcut, true);
  }, []);

  // Info modal shortcut (Cmd/Ctrl + /)
  useEffect(() => {
    function handleInfoShortcut(event) {
      if (event.key === "Escape" && infoOpen) { setInfoOpen(false); return; }
      if (event.key !== "/") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen(false);
      setInfoOpen(true);
    }
    window.addEventListener("keydown", handleInfoShortcut, true);
    return () => window.removeEventListener("keydown", handleInfoShortcut, true);
  }, [infoOpen]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
  }, []);

  // Fullscreen shortcut (Cmd/Ctrl + Shift + F)
  useEffect(() => {
    function handleFullscreenShortcut(event) {
      if (event.key.toLowerCase() !== "f") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (!event.shiftKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      void toggleFullscreen();
    }
    window.addEventListener("keydown", handleFullscreenShortcut, true);
    return () => window.removeEventListener("keydown", handleFullscreenShortcut, true);
  }, [toggleFullscreen]);

  // Log panel shortcut (` or Ctrl+`; Cmd+` is reserved by macOS window switching)
  useEffect(() => {
    function handleLogShortcut(event) {
      if (!isLogToggleKey(event)) return;
      if (event.metaKey || event.altKey) return;
      const bareBacktick = !event.ctrlKey && !event.shiftKey;
      const ctrlBacktick = event.ctrlKey && !event.shiftKey;
      if (!bareBacktick && !ctrlBacktick) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setRunLogOpen(current => !current);
    }
    window.addEventListener("keydown", handleLogShortcut, true);
    return () => window.removeEventListener("keydown", handleLogShortcut, true);
  }, []);

  // Keyboard: space reset, S compare
  useEffect(() => {
    function hasActiveEditorModal() {
      return Boolean(document.querySelector(".imageEditorModal, .maskEditorModal"));
    }
    function handleSpaceReset(event) {
      if (event.code !== "Space") return;
      if (isTypingTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      event.preventDefault();
      event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
      if (healingBridgeRef.current?.suspendToolsForSpace?.()) return;
      if (heroImage) resetImageView();
    }
    function handleSpaceKeyUp(event) {
      if (event.code !== "Space") return;
      if (isTypingTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      healingBridgeRef.current?.resumeToolsAfterSpace?.();
    }
    function handleCompareToggle(event) {
      if (!canCompare || event.key.toLowerCase() !== "s") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      event.preventDefault(); event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
      setCompareMode(current => !current);
    }
    function preventSpaceClick(event) {
      if (event.code !== "Space") return;
      if (isTypingTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      if (!heroImage) return;
      event.preventDefault();
      event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
    }
    window.addEventListener("keydown", handleSpaceReset, true);
    window.addEventListener("keydown", handleCompareToggle, true);
    window.addEventListener("keyup", handleSpaceKeyUp, true);
    window.addEventListener("keyup", preventSpaceClick, true);
    return () => {
      window.removeEventListener("keydown", handleSpaceReset, true);
      window.removeEventListener("keydown", handleCompareToggle, true);
      window.removeEventListener("keyup", handleSpaceKeyUp, true);
      window.removeEventListener("keyup", preventSpaceClick, true);
    };
  }, [canCompare, heroImage]);

  // Keyboard: arrow navigate outputs
  useEffect(() => {
    function handleOutputNavigation(event) {
      if (!heroImage || resultOutputs.length < 2) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector(".imageEditorModal")) return;
      event.preventDefault(); event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
      stepOutput(event.key === "ArrowRight" ? 1 : -1);
    }
    window.addEventListener("keydown", handleOutputNavigation, true);
    return () => window.removeEventListener("keydown", handleOutputNavigation, true);
  }, [heroImage, resultOutputs.length]);

  // Reset output index when result changes
  useEffect(() => {
    if (selectedOutputIndex >= resultOutputs.length) setSelectedOutputIndex(0);
  }, [resultOutputs.length, selectedOutputIndex]);

  // Khi không còn chạy và hết hàng chờ, tắt màn hình chờ để xem được ảnh
  useEffect(() => {
    if (!running && !runQueue.length) setShowWaitScreen(false);
  }, [running, runQueue.length]);

  // Auto-fill dynamic choices from discovery
  useEffect(() => {
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
  }, [inputs, discovery]);

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

  async function handleRunClick() {
    setShowWaitScreen(true);
    setError("");
    try {
      if (isRunningHubApp) {
        if (!hasRhApiKey(rhSettings)) {
          setError(t("error.rhMissingApiKey"));
          setStatus(t("error.rhMissingConfig"));
          setShowWaitScreen(false);
          return;
        }
        if (!rhNodes.length) {
          setError(t("error.rhMissingNodes"));
          setStatus(t("error.rhMissingAppNodes"));
          setShowWaitScreen(false);
          return;
        }
        const rhAuth = buildRhRunAuth(rhSettings);
        const imageKeys = rhNodes
          .filter(node => String(node.fieldType || "").toUpperCase() === "IMAGE")
          .map(nodeFieldKey);
        const expandedRhValues = await expandFolderImageValues(rhValues, imageKeys);
        for (const batchValues of expandImageBatchByKeys(expandedRhValues, imageKeys)) {
          runStep({
            ...rhAuth,
            webappId: rhSettings.webappId.trim(),
            nodes: rhNodes,
            values: batchValues
          });
        }
        return;
      }
      if (isRunningHubWf) {
        const workflowId = String(rhWfConfig?.runninghub?.workflowId || "").trim();
        if (!hasRhApiKey(rhSettings)) {
          setError(t("error.rhMissingApiKey"));
          setStatus(t("error.rhMissingConfig"));
          setShowWaitScreen(false);
          return;
        }
        if (!rhWfConfig || !rhWfInputs.length) {
          setError(t("error.rhWfMissingTemplate"));
          setStatus(t("error.rhWfMissingTemplateShort"));
          setShowWaitScreen(false);
          return;
        }
        if (!workflowId) {
          setError(t("error.rhMissingWorkflowId"));
          setStatus(t("error.rhMissingWorkflowIdShort"));
          setShowWaitScreen(false);
          return;
        }
        const rhAuth = buildRhRunAuth(rhSettings);
        const expandedRhWfValues = await expandFolderImageValues(rhWfValues);
        for (const batchValues of expandImageBatchValues(rhWfInputs, expandedRhWfValues)) {
          runStep({
            ...rhAuth,
            templateId: rhWfSelectedTemplate,
            values: batchValues
          });
        }
        return;
      }
      const expandedValues = await expandFolderImageValues(values);
      for (const batchValues of expandImageBatchValues(inputs, expandedValues)) {
        runStep({
          template: selectedTemplate,
          address: comfyAddress,
          values: requestPayload(inputs, batchValues)
        });
      }
    } catch (err) {
      const message = localizeRuntimeMessage(err.message, locale);
      setError(message);
      setStatus(message);
      setShowWaitScreen(false);
    }
  }

  async function handleRhAccountRefresh() {
    const tokens = getEnabledRhTokens(rhSettings);
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
    if (!isRunningHub || !hasRhApiKey(rhSettings)) {
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
  }, [isRunningHub, rhSettings]);

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

  // Compute progress percentage
  const progressPct = progress?.max > 0 ? Math.round((progress.value / progress.max) * 100) : null;
  // Màn hình chờ chỉ chiếm preview khi đang chạy VÀ người dùng đang xem nó
  const showRunningScreen = running && showWaitScreen;

  const canRun = isRunningHubApp
    ? Boolean(rhNodes.length && hasRhApiKey(rhSettings))
    : isRunningHubWf
      ? Boolean(rhWfConfig && rhWfInputs.length && hasRhApiKey(rhSettings) && String(rhWfConfig?.runninghub?.workflowId || "").trim())
      : Boolean(config);

  const handleRunClickRef = useRef(handleRunClick);
  handleRunClickRef.current = handleRunClick;

  const handleColorPanelToggleRef = useRef(handleColorPanelToggle);
  handleColorPanelToggleRef.current = handleColorPanelToggle;

  useEffect(() => {
    function hasBlockingOverlay() {
      return Boolean(document.querySelector(
        ".imageEditorModal, .maskEditorModal, .templateEditorModal, .modalBackdrop"
      ));
    }
    function handleColorPanelShortcut(event) {
      if (event.key !== "Tab") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (hasBlockingOverlay()) return;
      if (!colorPanelOpen && (!heroImage || showRunningScreen)) return;
      event.preventDefault();
      event.stopPropagation();
      handleColorPanelToggleRef.current();
    }
    window.addEventListener("keydown", handleColorPanelShortcut, true);
    return () => window.removeEventListener("keydown", handleColorPanelShortcut, true);
  }, [heroImage, showRunningScreen, colorPanelOpen]);

  useEffect(() => {
    function hasBlockingOverlay() {
      return Boolean(document.querySelector(
        ".imageEditorModal, .maskEditorModal, .templateEditorModal, .modalBackdrop"
      ));
    }
    function handleRunShortcut(event) {
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;
      if (hasBlockingOverlay()) return;
      if (!canRun) return;
      event.preventDefault();
      event.stopPropagation();
      handleRunClickRef.current();
    }
    window.addEventListener("keydown", handleRunShortcut, true);
    return () => window.removeEventListener("keydown", handleRunShortcut, true);
  }, [canRun]);

  return (
    <main
      className={`appShell ${isRunningHub ? "is-runninghub" : ""}${sidebarSide === "right" ? " sidebar-right" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` }}
    >
      <header className="appTopBar">
        <div className="appTopBarIdentity">
          <div className="appTopBarBrand">
            <div className="appTopBarMark" role="img" aria-label="SDVN" />
            <h1 className="title-font">aPix Builder</h1>
          </div>

          <ExecutionModeToggle mode={executionMode} onChange={setExecutionMode} />
        </div>

        <div className="appTopBarActions">
          <button
            type="button"
            className={`appTopBarServer${isRunningHub ? " is-runninghub" : ""}`}
            onClick={() => {
              setInfoOpen(false);
              setSettingsTab(isRunningHub ? "runninghub" : "comfy");
              setSettingsOpen(true);
            }}
            title={topBarServerTitle}
            aria-label={topBarServerTitle}
          >
            {isRunningHub
              ? <RunningHubLogomark size={11} aria-hidden="true" />
              : <ComfyUiLogomark size={14} aria-hidden="true" />}
            <span
              className={`appTopBarStatus health-${topBarServerStatus}`}
              title={
                topBarServerStatus === "online"
                  ? t("rh.keyValid")
                  : topBarServerStatus === "loading"
                    ? t("rh.loadingAccount")
                    : isRunningHub && rhAccountError
                      ? rhAccountError
                      : t("rh.disconnected")
              }
              aria-hidden="true"
            />
            <span className="appTopBarServerLabel">{topBarServerLabel}</span>
            {isRunningHub ? (
              rhAccountLoading && hasRhApiKey(rhSettings) ? (
                <span className="appTopBarCoinBadge isLoading" aria-hidden="true">
                  <Loader2 size={10} className="spin" />
                </span>
              ) : rhDisplayCoins != null ? (
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

          <button className="appTopBarButton" onClick={() => { setInfoOpen(false); setSettingsOpen(true); }} title={`${t("settings.open")} (Cmd/Ctrl + ,)`} aria-label={t("settings.open")} aria-keyshortcuts="Meta+Comma Control+Comma">
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
          <button className="appTopBarButton" onClick={() => { setSettingsOpen(false); setInfoOpen(true); }} title={`${t("info.open")} (Cmd/Ctrl + /)`} aria-label={t("info.open")} aria-keyshortcuts="Meta+/ Control+/">
            <Info size={15} />
          </button>
        </div>
      </header>

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
                <span className={`healthDot health-${rhWfConfig ? "online" : "offline"}`} title={
                  rhWfConfig ? t("health.rhWfReady") : t("health.noTemplate")
                }>
                  {rhWfConfig ? <Wifi size={10} /> : <WifiOff size={10} />}
                </span>
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
          queueCount={runQueue.length}
          onRun={handleRunClick}
          onCancel={cancelWorkflow}
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
          onDownload={handleDownload}
          onItemClick={handleHistoryItemClick}
          onRestore={restoreHistory}
          selectedIds={selectedHistoryIds}
          activeId={activeHistoryId}
          onDelete={handleDeleteHistoryItem}
          pending={running || runQueue.length > 0}
          pendingActive={showRunningScreen}
          pendingLabel={progress?.label || status}
          pendingProgressPct={progressPct}
          queueCount={runQueue.length}
          onShowWaiting={() => setShowWaitScreen(true)}
        />
      </section>

      <SettingsModalProvider value={{
        open: settingsOpen,
        onClose: () => setSettingsOpen(false),
        settingsTab,
        setSettingsTab,
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
        setRhAccountError
      }}>
        <SettingsModal />
      </SettingsModalProvider>

      {infoOpen ? (
        <div className="modalBackdrop infoBackdrop" role="presentation" onMouseDown={() => setInfoOpen(false)}>
          <section className="settingsModal infoModal" role="dialog" aria-modal="true" aria-label={t("info.dialog")} onMouseDown={event => event.stopPropagation()}>
            <div className="modalHeader infoModalHeader">
              <div>
                <h2 className="infoModalTitle">
                  aPix Builder <span className="infoVersion">{APP_VERSION_LABEL}</span>
                </h2>
                <p>{t("info.description")}</p>
              </div>
              <button className="modalClose" onClick={() => setInfoOpen(false)} title={t("common.close")}><X size={18} /></button>
            </div>

            <div className="infoModalBody">
              <div className="infoIntro" aria-label={t("info.summary")}>
                <div><span>{t("info.version")}</span><b>{APP_VERSION_LABEL}</b></div>
                <div><span>{t("info.mode")}</span><b>{infoModeLabel}</b></div>
                <div><span>{t("info.currentTemplate")}</span><b>{infoTemplateLabel}</b></div>
                <div><span>{t("info.target")}</span><b>{infoTargetLabel}</b></div>
              </div>

              <div className="infoNotice">
                <b>{t("info.update")}</b>
                <span>{t("info.updateText")}</span>
              </div>

              <section className="infoCredits" aria-label={t("info.creatorSection")}>
                <h3>{t("info.project")}</h3>
                <div className="infoCreditsGrid">
                  <div>
                    <span>{t("info.creator")}</span>
                    <a href="https://www.facebook.com/phamhungd/" target="_blank" rel="noreferrer">© Phạm Hưng</a>
                  </div>
                  <div>
                    <span>{t("info.contact")}</span>
                    <a href="https://zalo.me/0355873687" target="_blank" rel="noreferrer">0355873687</a>
                  </div>
                  <div>
                    <span>{t("info.community")}</span>
                    <a href="https://www.facebook.com/groups/stablediffusion.vn" target="_blank" rel="noreferrer">SDVN - Cộng đồng AI Art</a>
                  </div>
                  <div>
                    <span>GitHub</span>
                    <a href="https://github.com/StableDiffusionVN/" target="_blank" rel="noreferrer">StableDiffusionVN</a>
                  </div>
                  <div>
                    <span>HuggingFace</span>
                    <a href="https://huggingface.co/StableDiffusionVN/" target="_blank" rel="noreferrer">StableDiffusionVN</a>
                  </div>
                </div>
                <div className="infoLinkGroup">
                  <span>Website</span>
                  <a href="https://sdvn.vn" target="_blank" rel="noreferrer">sdvn.vn</a>
                  <a href="https://hungdiffusion.com" target="_blank" rel="noreferrer">hungdiffusion.com</a>
                  <a href="https://trainlora.vn" target="_blank" rel="noreferrer">trainlora.vn</a>
                  <a href="https://stablediffusion.vn" target="_blank" rel="noreferrer">stablediffusion.vn</a>
                  <a href="https://comfy.vn" target="_blank" rel="noreferrer">comfy.vn</a>
                </div>
                <div className="infoLinkGroup">
                  <span>{t("info.learnMore")}</span>
                  <a href="https://aistudio.google.com/app/u/0/apps/d798af97-ec18-4946-bce4-3b5b0e7d403e?showPreview=true&showAssistant=true&fullscreenApplet=true" target="_blank" rel="noreferrer">aPix Google Studio</a>
                  <a href="https://github.com/StableDiffusionVN/sdvn_apix_python" target="_blank" rel="noreferrer">aPix Python</a>
                  <a href="https://github.com/StableDiffusionVN/sdvn_apix_react" target="_blank" rel="noreferrer">aPix React</a>
                  <a href="https://sdvn.me" target="_blank" rel="noreferrer">Colab SDVN</a>
                </div>
              </section>

              <div className="infoGrid">
                <section className="infoSection">
                  <h3>{t("info.shortcutsGeneral")}</h3>
                  <p>{t("info.shortcutsGeneralDesc")}</p>
                  <div className="shortcutList">
                    <ShortcutRow label={t("info.shortcutSettings")} keys={["Cmd/Ctrl", ","]} />
                    <ShortcutRow label={t("info.shortcutModeComfy")} keys={["Alt/Option", "1"]} />
                    <ShortcutRow label={t("info.shortcutModeRhWf")} keys={["Alt/Option", "2"]} />
                    <ShortcutRow label={t("info.shortcutModeRhApp")} keys={["Alt/Option", "3"]} />
                    <ShortcutRow label={t("info.shortcutHelp")} keys={["Cmd/Ctrl", "/"]} />
                    <ShortcutRow label={t("info.shortcutFullscreen")} keys={["Cmd/Ctrl", "Shift", "F"]} />
                    <ShortcutRow label={t("info.shortcutRun")} keys={["Cmd/Ctrl", "Enter"]} />
                    <ShortcutRow label={t("info.shortcutLog")} keys={["F1"]} />
                    <ShortcutRow label={t("info.shortcutClose")} keys={["Esc"]} />
                    <ShortcutRow label={t("info.shortcutResetZoom")} keys={["Space"]} />
                    <ShortcutRow label={t("info.shortcutCompare")} keys={["S"]} />
                    <ShortcutRow label={t("info.shortcutOutputNav")} keys={["←", "→"]} />
                  </div>
                </section>
                <section className="infoSection">
                  <h3>{t("info.shortcutsPreview")}</h3>
                  <p>{t("info.shortcutsPreviewDesc")}</p>
                  <div className="shortcutList">
                    <ShortcutRow label={t("info.shortcutZoom")} keys={[t("info.mouseWheel")]} />
                    <ShortcutRow label={t("info.shortcutPan")} keys={[t("info.dragImage")]} />
                    <ShortcutRow label={t("info.shortcutResetView")} keys={["Space"]} />
                    <ShortcutRow label={t("info.shortcutCompareImages")} keys={["S"]} />
                    <ShortcutRow label={t("info.shortcutChangeOutput")} keys={["←", "→"]} />
                  </div>
                </section>
                <section className="infoSection">
                  <h3>{t("info.shortcutsEditor")}</h3>
                  <p>{t("info.shortcutsEditorDesc")}</p>
                  <div className="shortcutList">
                    <ShortcutRow label={t("info.shortcutBeforeAfter")} keys={["S"]} />
                    <ShortcutRow label={t("info.shortcutResetAdjustments")} keys={["Cmd/Ctrl", "Shift", "R"]} />
                    <ShortcutRow label={t("info.shortcutTempPan")} keys={[t("info.holdSpace")]} />
                    <ShortcutRow label={t("info.shortcutCancelAction")} keys={["Esc"]} />
                    <ShortcutRow label={t("info.shortcutSaveOutput")} keys={["Save"]} />
                  </div>
                </section>
                <section className="infoSection">
                  <h3>{t("info.tips")}</h3>
                  <ul className="tipsList">
                    <li>{t("info.tipDrag")}</li>
                    <li>{t("info.tipLibrary")}</li>
                    <li>{t("info.tipCompare")}</li>
                    <li>{t("info.tipProgress")}</li>
                  </ul>
                </section>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {templateEditorOpen ? (
        <Suspense fallback={null}>
          <TemplateEditorModal
            selectedTemplate={selectedTemplate}
            discovery={discovery}
            onClose={() => setTemplateEditorOpen(false)}
            onSaved={reloadTemplates}
          />
        </Suspense>
      ) : null}

      {rhWfTemplateEditorOpen ? (
        <Suspense fallback={null}>
          <TemplateEditorModal
            mode="runninghub-wf"
            selectedTemplate={rhWfSelectedTemplate}
            apiKey={rhPrimaryApiKey}
            onClose={() => setRhWfTemplateEditorOpen(false)}
            onSaved={reloadRhWfTemplates}
          />
        </Suspense>
      ) : null}

      {outputEditorOpen && heroImage ? (
        <Suspense fallback={null}>
          <ImageEditorModal
            source={heroImage}
            title="Output - Image Editor"
            onClose={() => setOutputEditorOpen(false)}
            onSave={handleSaveEditedOutput}
          />
        </Suspense>
      ) : null}
    </main>
  );
}

function ShortcutRow({ label, keys }) {
  return (
    <div className="shortcutRow">
      <span>{label}</span>
      <span className="keyGroup">{keys.map(key => <kbd key={key}>{key}</kbd>)}</span>
    </div>
  );
}

function RunningState({ progress, status, progressPct }) {
  const { t } = useI18n();
  const phase =
    !progress || progress.type === "start" ? 1
    : progress.type === "cached" || progress.type === "executing" || progress.type === "progress" || progress.type === "executed" ? 2
    : 1;

  const detail = progress?.label || status || t("running.waiting");

  return (
    <div className="runningState">
      <SdvnWaterLogo
        percent={progressPct}
        indeterminate={progressPct === null}
        tone="accent"
        title={t("running.comfy")}
      />

      <p className="runningTitle">{t("running.comfy")}</p>

      <div className="runPhases">
        <RunPhase label={t("running.submit")} active={phase === 1} done={phase > 1} />
        <span className="runPhaseSep" aria-hidden="true" />
        <RunPhase label={t("running.nodes")} active={phase === 2} done={phase > 2} />
        <span className="runPhaseSep" aria-hidden="true" />
        <RunPhase label={t("running.save")} active={phase === 3} done={false} />
      </div>

      <p className="runDetail">{detail}</p>
    </div>
  );
}

function RunPhase({ label, active, done }) {
  return (
    <span className={`runPhase ${active ? "active" : ""} ${done ? "done" : ""}`}>
      {done ? <CheckCircle2 size={11} /> : active ? <Loader2 size={11} className="spin" /> : null}
      {label}
    </span>
  );
}
