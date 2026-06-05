import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  GitCompare,
  Image as ImageIcon,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  Settings2,
  ChevronsUpDown,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { ConnectionPanel, SavedServerList, AddServerForm } from "./components/ConnectionPanel";
import { DynamicField } from "./components/DynamicField";
import { ImageEditorModal } from "./components/ImageEditorModal";
import { OutputGallery } from "./components/OutputGallery";
import { PresetBar } from "./components/PresetBar";
import { RunControls } from "./components/RunControls";
import { TemplateEditorModal } from "./components/TemplateEditorModal";
import { TemplateSelector } from "./components/TemplateSelector";
import { downloadImage } from "./lib/download";
import { canonicalDynamicType, dynamicFieldChoices } from "./lib/dynamicTypes";
import { buildDefaults, flattenInputs, itemValueKey, normalizeId, requestPayload } from "./lib/template";
import { useDiscovery } from "./hooks/useDiscovery";
import { useHistory } from "./hooks/useHistory";
import { useInputImages } from "./hooks/useInputImages";
import { usePresets } from "./hooks/usePresets";
import { useServerList } from "./hooks/useServerList";
import { useWorkspace, sanitizeWorkspaceValues } from "./hooks/useWorkspace";
import { useImageViewer } from "./hooks/useImageViewer";
import { useExecution } from "./hooks/useExecution";

const SERVER_STORAGE_KEY = "comfyui-build:server:v2";
const THEME_STORAGE_KEY = "comfyui-build:theme";
const MAIN_FONT_STORAGE_KEY = "comfyui-build:main-font";
const NOTIFY_STORAGE_KEY = "comfyui-build:notify:v1";
const DEFAULT_COMFY_SERVER = "http://127.0.0.1:8188";
const THEME_OPTIONS = [
  { id: "dark", label: "Dark", swatch: "#121212" },
  { id: "light", label: "Light", swatch: "#f5f5f5" },
  { id: "sdvn", label: "SDVN", swatch: "linear-gradient(to bottom, #5858e6, #151523)" },
  { id: "vietnam", label: "Việt Nam", swatch: "radial-gradient(ellipse at bottom, #c62921, #a21a14)" },
  { id: "skyline", label: "Skyline", swatch: "linear-gradient(to right, #6FB1FC, #4364F7, #0052D4)" },
  { id: "hidden-jaguar", label: "Hidden Jaguar", swatch: "linear-gradient(to top, #0fd850 0%, #f9f047 100%)" },
  { id: "wide-matrix", label: "Wide Matrix", swatch: "linear-gradient(to top, #fcc5e4 0%, #fda34b 15%, #ff7882 35%, #c8699e 52%, #7046aa 71%, #0c1db8 87%, #020f75 100%)" },
  { id: "rainbow", label: "RainBow", swatch: "linear-gradient(to right, #0575E6, #00F260)" },
  { id: "soundcloud", label: "SoundCloud", swatch: "linear-gradient(to right, #f83600, #fe8c00)" },
  { id: "amin", label: "Amin", swatch: "linear-gradient(to right, #4A00E0, #8E2DE2)" },
  { id: "emerald", label: "Emerald Lab", swatch: "radial-gradient(circle at 15% 20%, #34d399 0%, #10231d 58%, #030b08 100%)" },
  { id: "violet", label: "Violet Studio", swatch: "radial-gradient(circle at 15% 20%, #a78bfa 0%, #1b1730 58%, #05030b 100%)" }
];
const MAIN_FONT_OPTIONS = [
  { id: "be-vietnam", label: "Be Vietnam Pro", family: "\"Be Vietnam Pro\"" },
  { id: "inter", label: "Inter", family: "\"Inter\"" },
  { id: "manrope", label: "Manrope", family: "\"Manrope\"" },
  { id: "jakarta", label: "Plus Jakarta Sans", family: "\"Plus Jakarta Sans\"" },
  { id: "noto", label: "Noto Sans", family: "\"Noto Sans\"" },
  { id: "system", label: "System UI", family: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\"" }
];

function loadTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) || "";
  if (stored === "minimal") return "dark";
  return THEME_OPTIONS.some(option => option.id === stored) ? stored : "dark";
}

function loadMainFont() {
  const stored = localStorage.getItem(MAIN_FONT_STORAGE_KEY) || "";
  return MAIN_FONT_OPTIONS.some(option => option.id === stored) ? stored : "be-vietnam";
}

function loadServerAddress() {
  const stored = localStorage.getItem(SERVER_STORAGE_KEY) || "";
  return stored || DEFAULT_COMFY_SERVER;
}

function loadNotifyEnabled() {
  try { return JSON.parse(localStorage.getItem(NOTIFY_STORAGE_KEY)) === true; } catch { return false; }
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

function isTextEntryTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [values, setValues] = useState({});
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [comfyAddress, setComfyAddress] = useState(loadServerAddress);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showServerDetails, setShowServerDetails] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [mainFont, setMainFont] = useState(loadMainFont);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [outputEditorOpen, setOutputEditorOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [selectedOutputIndex, setSelectedOutputIndex] = useState(0);
  const [showWaitScreen, setShowWaitScreen] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(loadNotifyEnabled);
  const [addServerOpen, setAddServerOpen] = useState(false);

  const { discovery, discoveryLoading } = useDiscovery(comfyAddress);
  const { history, setHistory, loadOutputHistory, deleteHistoryItem } = useHistory();
  const { inputImages, setInputImages, refreshInputImages } = useInputImages();
  const { workspaceRef, getStoredValues, saveValues, getLastTemplate } = useWorkspace();
  const { getPresets, savePreset, updatePreset, deletePreset, presetsVersion } = usePresets();
  const { getServers, addServer, removeServer } = useServerList();

  const {
    running, activeRunId, runQueue,
    status, setStatus, error, setError,
    result, setResult, progress,
    runWorkflow, cancelWorkflow
  } = useExecution({
    onComplete: (historyItem) => {
      if (historyItem) setHistory(current => [historyItem, ...current]);
      setSelectedOutputIndex(0);
      if (notifyEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("aPix Builder", { body: "Workflow đã hoàn thành!", icon: "/sdvn-icon.png" });
      }
    }
  });

  const inputs = useMemo(() => flattenInputs(config?.input), [config]);
  const outputs = useMemo(() => Object.values(config?.output || {}), [config]);
  const currentPresets = useMemo(() => getPresets(selectedTemplate), [getPresets, selectedTemplate, presetsVersion]);
  const app = config?.app || {};
  const serverAddress = config?.server?.address || config?.sever?.address || "";
  const selectedTemplateName = templates.find(item => item.id === selectedTemplate)?.name || selectedTemplate || "Default";
  const resultOutputs = result?.outputs || [];
  const selectedOutput = resultOutputs[selectedOutputIndex] || resultOutputs[0];
  const outputLabel = selectedOutput?.label || outputs[0]?.ui?.label || "Ảnh kết quả";
  const heroImage = selectedOutput?.url;
  const resultTiming = result?.historyItem || result || {};
  const showStatus = Boolean(error || result || running || activeRunId || runQueue.length);

  const compareInputImage = useMemo(() => {
    for (const item of inputs) {
      const type = item.ui?.type;
      if (type !== "image" && type !== "image_mask") continue;
      const value = values[normalizeId(item.id)];
      if (typeof value === "string" && value.startsWith("data:image")) return value;
      if (value?.kind === "input-image" && value.url) return value.url;
    }
    return "";
  }, [inputs, values]);

  const canCompare = Boolean(heroImage && compareInputImage);
  const discoverySystem = discovery?.system?.system || discovery?.system || null;
  const discoveryDevice = discovery?.system?.devices?.[0] || null;
  const selectedThemeOption = THEME_OPTIONS.find(option => option.id === theme) || THEME_OPTIONS[0];
  const selectedMainFont = MAIN_FONT_OPTIONS.find(option => option.id === mainFont) || MAIN_FONT_OPTIONS[0];

  // Health indicator: online/loading/offline
  const healthStatus = discoveryLoading ? "loading" : discovery ? "online" : "offline";

  const serverDetailRows = discovery ? [
    ["Address", discovery.address || comfyAddress],
    ["Fetched at", discovery.fetchedAt || ""],
    ["Cache", discovery.cached ? "Đang dùng cache" : "Dữ liệu mới"],
    ["ComfyUI", discoverySystem?.comfyui_version || ""],
    ["Frontend", discoverySystem?.required_frontend_version || ""],
    ["Python", discoverySystem?.python_version || ""],
    ["PyTorch", discoverySystem?.pytorch_version || ""],
    ["OS", discoverySystem?.os || ""],
    ["RAM total", formatBytes(discoverySystem?.ram_total)],
    ["RAM free", formatBytes(discoverySystem?.ram_free)],
    ["Device", discoveryDevice?.name || discoveryDevice?.type || ""],
    ["VRAM total", formatBytes(discoveryDevice?.vram_total)],
    ["VRAM free", formatBytes(discoveryDevice?.vram_free)],
    ["Node types", discovery.nodeTypes?.length || 0],
    ["Model folders", discovery.modelFolders?.length || 0],
    ["Checkpoints", discovery.dynamicChoices?.checkpoints?.length || 0],
    ["LoRAs", discovery.dynamicChoices?.loras?.length || 0],
    ["ControlNets", discovery.dynamicChoices?.controlnets?.length || 0],
    ["Samplers", discovery.dynamicChoices?.samplers?.length || 0],
    ["Schedulers", discovery.dynamicChoices?.schedulers?.length || 0],
    ["VAE", discovery.dynamicChoices?.vae?.length || 0],
    ["UNET", discovery.dynamicChoices?.unet?.length || 0],
    ["Style models", discovery.dynamicChoices?.style_models?.length || 0],
    ["Embeddings", discovery.dynamicChoices?.embeddings?.length || 0]
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined) : [];

  const {
    imageScale, imagePan, imageFitSize, outputImageSize,
    draggingImage, isWheeling, compareMode, setCompareMode,
    comparePosition, compareDividerX,
    previewAreaRef, imageElementRef,
    resetImageView, handleResultImageLoad,
    handlePreviewWheel, handlePreviewPointerDown,
    handlePreviewPointerMove, handlePreviewPointerUp
  } = useImageViewer(heroImage, canCompare);

  // Persist theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Persist font
  useEffect(() => {
    document.documentElement.style.setProperty("--main-font", selectedMainFont.family);
    localStorage.setItem(MAIN_FONT_STORAGE_KEY, mainFont);
  }, [mainFont, selectedMainFont.family]);

  // Persist server address
  useEffect(() => {
    if (comfyAddress) localStorage.setItem(SERVER_STORAGE_KEY, comfyAddress);
  }, [comfyAddress]);

  // Persist notification preference
  useEffect(() => {
    localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(notifyEnabled));
  }, [notifyEnabled]);

  // Persist workspace on every change
  useEffect(() => {
    if (!selectedTemplate || !config) return;
    saveValues(selectedTemplate, values);
  }, [config, selectedTemplate, values]);

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

  // Info modal shortcut
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

  // Keyboard: space reset, S compare
  useEffect(() => {
    function hasActiveEditorModal() {
      return Boolean(document.querySelector(".imageEditorModal, .maskEditorModal"));
    }
    function handleSpaceReset(event) {
      if (!heroImage || event.code !== "Space") return;
      if (isTextEntryTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      event.preventDefault(); event.stopPropagation();
      resetImageView();
    }
    function handleCompareToggle(event) {
      if (!canCompare || event.key.toLowerCase() !== "s") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      event.preventDefault(); event.stopPropagation();
      setCompareMode(current => !current);
    }
    function preventSpaceClick(event) {
      if (!heroImage || event.code !== "Space") return;
      if (isTextEntryTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      event.preventDefault(); event.stopPropagation();
    }
    window.addEventListener("keydown", handleSpaceReset, true);
    window.addEventListener("keydown", handleCompareToggle, true);
    window.addEventListener("keyup", preventSpaceClick, true);
    return () => {
      window.removeEventListener("keydown", handleSpaceReset, true);
      window.removeEventListener("keydown", handleCompareToggle, true);
      window.removeEventListener("keyup", preventSpaceClick, true);
    };
  }, [canCompare, heroImage]);

  // Keyboard: arrow navigate outputs
  useEffect(() => {
    function handleOutputNavigation(event) {
      if (!heroImage || resultOutputs.length < 2) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (document.querySelector(".imageEditorModal")) return;
      event.preventDefault(); event.stopPropagation();
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

  async function loadTemplateConfig(templateId) {
    const suffix = templateId ? `?template=${encodeURIComponent(templateId)}` : "";
    const response = await fetch(`/api/config${suffix}`);
    if (!response.ok) throw new Error("Không đọc được cấu hình template từ API");
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function loadTemplateRegistry() {
    const response = await fetch("/api/templates");
    if (!response.ok) throw new Error("Không đọc được danh sách template từ API");
    return response.json();
  }

  async function loadConfig(templateId, options = {}) {
    setStatus("Đang tải cấu hình YAML...");
    setError("");
    if (!options.keepResult) {
      setResult(null);
      setSelectedOutputIndex(0);
      resetImageView();
    }
    return loadTemplateConfig(templateId)
      .then(data => {
        const nextTemplateId = data.template?.id || templateId || "";
        const defaults = buildDefaults(flattenInputs(data.config?.input));
        const storedValues = nextTemplateId ? getStoredValues(nextTemplateId) : null;
        setConfig(data.config);
        setValues(options.values || { ...defaults, ...(storedValues || {}) });
        setSelectedTemplate(nextTemplateId);
        if (!options.preserveServerAddress) {
          setComfyAddress(current => options.address || current || data.server?.address || DEFAULT_COMFY_SERVER);
        }
        setStatus(`YAML đã sẵn sàng: ${data.template?.name || data.template?.id || "Default"}`);
      })
      .catch(err => {
        setError(err.message);
        setStatus("Không đọc được YAML");
      });
  }

  async function reloadTemplates(nextTemplateId) {
    const registry = await loadTemplateRegistry();
    setTemplates(registry.templates || []);
    await loadConfig(nextTemplateId || registry.default);
  }

  // Initial load
  useEffect(() => {
    loadOutputHistory();
    refreshInputImages();
    loadTemplateRegistry()
      .then(data => {
        setTemplates(data.templates || []);
        const storedTemplate = getLastTemplate();
        const hasStoredTemplate = (data.templates || []).some(t => t.id === storedTemplate);
        return loadConfig(hasStoredTemplate ? storedTemplate : data.default);
      })
      .catch(() => loadConfig(""));
  }, []);

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

  function makeRunJob() {
    return {
      runId: crypto.randomUUID(),
      template: selectedTemplate,
      address: comfyAddress,
      values: requestPayload(inputs, values),
      queuedAt: new Date().toISOString()
    };
  }

  function handleRunClick() {
    setShowWaitScreen(true);
    runWorkflow(makeRunJob());
  }

  async function restoreHistory(item) {
    if (!item) return;
    setError("");
    setShowWaitScreen(false);
    resetImageView();
    setSelectedOutputIndex(0);
    const restoredResult = item.result || {
      runId: item.id,
      promptId: item.promptId,
      template: item.templateId,
      address: item.address,
      submittedAt: item.submittedAt,
      completedAt: item.completedAt || item.createdAt,
      durationMs: item.durationMs,
      outputs: item.outputs || []
    };
    setResult(restoredResult);
    if (item.templateId === "image-editor") { setStatus("Đã mở ảnh từ Image Editor"); return; }
    await loadConfig(item.templateId, { values: item.values, keepResult: true, preserveServerAddress: true });
    setStatus("Đã mở lại lịch sử");
  }

  async function handleDeleteHistoryItem(id) {
    await deleteHistoryItem(id);
    if (result?.runId === id) {
      setResult(null);
      setSelectedOutputIndex(0);
      resetImageView();
      setStatus("Đã xóa ảnh khỏi lịch sử");
    }
  }

  async function handleDownload(output) {
    try { await downloadImage(output); }
    catch (err) { setError(err.message); setStatus("Không tải được ảnh"); }
  }

  async function handleSaveEditedOutput(dataUrl) {
    const response = await fetch("/api/output-history/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl, sourceFilename: selectedOutput?.filename, address: comfyAddress })
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(text || "Backend không trả về JSON khi lưu ảnh"); }
    if (!response.ok) throw new Error(data.error || "Không lưu được ảnh đã sửa");
    if (!data.historyItem) throw new Error("Backend chưa trả về ảnh đã lưu. Hãy restart backend rồi thử lại.");
    const historyItem = data.historyItem;
    setResult(historyItem.result || historyItem);
    setSelectedOutputIndex(0);
    setHistory(current => data.history || (historyItem ? [historyItem, ...current] : current));
    resetImageView();
    setStatus("Đã lưu ảnh Image Editor vào output");
  }

  // Compute progress percentage
  const progressPct = progress?.max > 0 ? Math.round((progress.value / progress.max) * 100) : null;
  // Màn hình chờ chỉ chiếm preview khi đang chạy VÀ người dùng đang xem nó
  const showRunningScreen = running && showWaitScreen;

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark"><img src="/sdvn-icon.png" alt="SDVN" /></div>
          <div>
            <h1 className="title-font">aPix Builder</h1>
            <p>{selectedTemplateName}</p>
          </div>
          <div className="brandActions">
            <button className="settingsButton" onClick={() => { setInfoOpen(false); setSettingsOpen(true); }} title="Mở settings" aria-label="Mở settings">
              <Settings2 size={18} />
            </button>
            <button className="settingsButton" onClick={() => { setSettingsOpen(false); setInfoOpen(true); }} title="Thông tin ứng dụng (Cmd/Ctrl + /)" aria-label="Thông tin ứng dụng">
              <Info size={18} />
            </button>
          </div>
        </div>

        <section className="settingsGroup">
          <div className="settingsHeader">
            <Settings2 size={16} />
            <h2>API Workflow</h2>
            <span className={`healthDot health-${healthStatus}`} title={
              healthStatus === "online" ? `ComfyUI online · ${discoverySystem?.comfyui_version || ""}` :
              healthStatus === "loading" ? "Đang kết nối..." : "Không kết nối được ComfyUI"
            } aria-label={healthStatus === "online" ? "Online" : healthStatus === "loading" ? "Đang kết nối" : "Offline"}>
              {healthStatus === "loading" ? <Loader2 size={10} className="spin" /> :
               healthStatus === "online" ? <Wifi size={10} /> : <WifiOff size={10} />}
            </span>
          </div>
          <TemplateSelector
            templates={templates}
            selectedTemplate={selectedTemplate}
            onChange={loadConfig}
            onEdit={() => setTemplateEditorOpen(true)}
          />
          <PresetBar
            templateId={selectedTemplate}
            presets={currentPresets}
            onLoad={nextValues => setValues(current => ({ ...current, ...nextValues }))}
            onSave={name => savePreset(selectedTemplate, name, values)}
            onUpdate={id => updatePreset(selectedTemplate, id, values)}
            onDelete={id => deletePreset(selectedTemplate, id)}
          />
        </section>

        <section className="settingsGroup workflowSettings">
          <div className="settingsHeader">
            <Settings2 size={16} />
            <h2>Workflow settings</h2>
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

        <RunControls
          running={running}
          canRun={Boolean(config)}
          canCancel={Boolean(running && activeRunId)}
          queueCount={runQueue.length}
          onRun={handleRunClick}
          onCancel={cancelWorkflow}
        />
      </aside>

      <section className="workspace">
        <section className="previewPanel">
          <div className="panelTitle">
            <h3>{outputLabel}{resultOutputs.length > 1 ? ` (${selectedOutputIndex + 1}/${resultOutputs.length})` : ""}</h3>
            <div className="previewActions">
              {showStatus ? (
                <div className={`status ${error ? "bad" : result ? "good" : ""}`}>
                  {error ? <AlertCircle size={17} /> : result ? <CheckCircle2 size={17} /> : running ? <Loader2 className="spin" size={17} /> : <ImageIcon size={17} />}
                  <span>{status}</span>
                </div>
              ) : null}
              {selectedOutput ? (
                <>
                  {canCompare ? (
                    <button
                      className={`downloadButton compareButton ${compareMode ? "active" : ""}`}
                      onClick={() => setCompareMode(current => !current)}
                      title={compareMode ? "Tắt so sánh (S)" : "Bật so sánh input/output (S)"}
                    >
                      <GitCompare size={14} />
                    </button>
                  ) : null}
                  <button className="downloadButton" onClick={resetImageView} title="Đặt lại zoom (Space)"><RotateCcw size={14} /></button>
                  <button className="downloadButton" onClick={() => setOutputEditorOpen(true)} title="Image Editor"><Pencil size={14} /></button>
                  <button className="downloadButton" onClick={() => handleDownload(selectedOutput)} title="Tải ảnh xuống"><Download size={14} /></button>
                </>
              ) : null}
            </div>
          </div>

          <div className="outputViewer">
            <div
              className={`previewArea ${heroImage && !showRunningScreen ? "isInteractive" : ""} ${resultOutputs.length > 1 ? "hasOutputRail" : ""} ${compareMode ? "isCompareMode" : ""} ${draggingImage || isWheeling ? "isDragging" : ""}`}
              ref={previewAreaRef}
              onWheel={handlePreviewWheel}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
            >
              {showRunningScreen ? (
                <div className="emptyState">
                  <RunningState progress={progress} status={status} progressPct={progressPct} />
                </div>
              ) : heroImage ? (
                <div
                  className={`imageStage ${compareMode && canCompare ? "isCompare" : ""}`}
                  style={{
                    "--image-scale": imageScale,
                    "--image-pan-x": `${imagePan.x}px`,
                    "--image-pan-y": `${imagePan.y}px`,
                    "--image-fit-width": imageFitSize.width ? `${imageFitSize.width}px` : "100%",
                    "--image-fit-height": imageFitSize.height ? `${imageFitSize.height}px` : "100%",
                    "--compare-position": `${comparePosition}%`,
                    "--compare-divider-x": `${compareDividerX}px`
                  }}
                >
                  {compareMode && canCompare ? (
                    <>
                      <img className="resultImage compareInputImage" src={compareInputImage} alt="Ảnh input" draggable="false" />
                      <img ref={imageElementRef} className="resultImage compareOutputImage" src={heroImage} alt={outputLabel} draggable="false" onLoad={handleResultImageLoad} />
                    </>
                  ) : (
                    <img ref={imageElementRef} className="resultImage" src={heroImage} alt={outputLabel} draggable="false" onLoad={handleResultImageLoad} />
                  )}
                </div>
              ) : (
                <div className="emptyState">
                  <ImageIcon size={42} />
                  <h3>Chưa có ảnh kết quả</h3>
                  <p>Điền input bên trái rồi chạy workflow để xem output.</p>
                </div>
              )}

              {heroImage && resultOutputs.length > 1 ? (
                <>
                  <button type="button" className="outputNavButton previous" onClick={event => { event.stopPropagation(); stepOutput(-1); }} title="Ảnh trước (←)" aria-label="Ảnh trước">
                    <ChevronLeft size={20} />
                  </button>
                  <button type="button" className="outputNavButton next" onClick={event => { event.stopPropagation(); stepOutput(1); }} title="Ảnh tiếp theo (→)" aria-label="Ảnh tiếp theo">
                    <ChevronRight size={20} />
                  </button>
                </>
              ) : null}

              {heroImage && resultOutputs.length > 1 ? (
                <div className="outputRail" aria-label="Danh sách ảnh output">
                  {resultOutputs.map((output, index) => (
                    <button
                      type="button"
                      key={`${output.url || output.filename || "output"}-${index}`}
                      className={`outputThumb ${index === selectedOutputIndex ? "active" : ""}`}
                      onClick={() => selectOutput(index)}
                      title={`Xem output ${index + 1}`}
                      aria-label={`Xem output ${index + 1}`}
                      aria-pressed={index === selectedOutputIndex}
                    >
                      <img src={output.url} alt={output.filename || `Output ${index + 1}`} draggable="false" />
                    </button>
                  ))}
                </div>
              ) : null}

              {heroImage && compareMode && canCompare ? (
                <div className="compareDivider" style={{ "--compare-divider-x": `${compareDividerX}px` }} aria-hidden="true" />
              ) : null}
              {heroImage && outputImageSize.width && outputImageSize.height ? (
                <div className="outputSizeBadge">{outputImageSize.width} x {outputImageSize.height}</div>
              ) : null}
              {heroImage && resultTiming.durationMs ? (
                <div className="outputTimingBadge">Hoàn thành trong {formatDuration(resultTiming.durationMs)}</div>
              ) : null}
            </div>
          </div>
        </section>

        <OutputGallery
          history={history}
          onDownload={handleDownload}
          onRestore={restoreHistory}
          onDelete={handleDeleteHistoryItem}
          pending={running || runQueue.length > 0}
          pendingActive={showRunningScreen}
          pendingLabel={progress?.label || status}
          pendingProgressPct={progressPct}
          queueCount={runQueue.length}
          onShowWaiting={() => setShowWaitScreen(true)}
        />
      </section>

      {settingsOpen ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settingsModal" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={event => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <h2>Settings</h2>
                <p>Thiết lập giao diện và Comfy Server.</p>
              </div>
              <button className="modalClose" onClick={() => setSettingsOpen(false)} title="Đóng"><X size={18} /></button>
            </div>

            <div className="field themeSelectField">
              <span>Theme</span>
              <div className={`themeSelectWrap ${themeMenuOpen ? "open" : ""}`} style={{ "--theme-swatch": selectedThemeOption.swatch }}>
                <button type="button" className="themeSelectButton" onClick={() => setThemeMenuOpen(current => !current)} aria-haspopup="listbox" aria-expanded={themeMenuOpen}>
                  <span className="themeSwatch" aria-hidden="true" />
                  <span>{selectedThemeOption.label}</span>
                  <ChevronsUpDown size={17} />
                </button>
                {themeMenuOpen ? (
                  <div className="themeMenu" role="listbox" aria-label="Theme">
                    {THEME_OPTIONS.map(option => (
                      <button key={option.id} type="button" role="option" aria-selected={theme === option.id}
                        className={`themeMenuItem ${theme === option.id ? "active" : ""}`}
                        style={{ "--theme-swatch": option.swatch }}
                        onClick={() => { setTheme(option.id); setThemeMenuOpen(false); }}>
                        <span className="themeSwatch" aria-hidden="true" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <label className="field">
              <span>Main font</span>
              <select value={mainFont} onChange={event => setMainFont(event.target.value)}>
                {MAIN_FONT_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className="modalSection">
              <div className="modalSectionTitle">
                <h3>Comfy Server</h3>
                <div className={`healthBadge health-${healthStatus}`}>
                  {healthStatus === "loading" ? <Loader2 size={11} className="spin" /> :
                   healthStatus === "online" ? <Wifi size={11} /> : <WifiOff size={11} />}
                  <span>{healthStatus === "online" ? "Online" : healthStatus === "loading" ? "Đang kết nối..." : "Offline"}</span>
                </div>
                <label className="serverDetailToggle">
                  <input type="checkbox" checked={showServerDetails} onChange={event => setShowServerDetails(event.target.checked)} />
                  <span>Hiện chi tiết</span>
                </label>
                <label className="serverDetailToggle" title={typeof Notification !== "undefined" && Notification.permission === "denied" ? "Trình duyệt đã chặn thông báo — mở lại trong Site Settings" : "Nhận thông báo khi workflow hoàn thành"}>
                  <input
                    type="checkbox"
                    checked={notifyEnabled}
                    onChange={async event => {
                      const next = event.target.checked;
                      if (next && typeof Notification !== "undefined" && Notification.permission !== "granted") {
                        const perm = await Notification.requestPermission();
                        if (perm !== "granted") return;
                      }
                      setNotifyEnabled(next);
                    }}
                  />
                  <span>Thông báo</span>
                </label>
              </div>
              <ConnectionPanel comfyAddress={comfyAddress} serverAddress={serverAddress} onAddressChange={setComfyAddress} />
              <div className="note serverDiscoverySummary">
                {discoveryLoading ? (
                  <span>Đang quét ComfyUI server...</span>
                ) : discovery ? (
                  <span>
                    ComfyUI {discoverySystem?.comfyui_version || "unknown"} · {discoveryDevice?.type || "device unknown"}
                    {discoveryDevice?.vram_free ? ` · VRAM trống ${formatBytes(discoveryDevice.vram_free)}` : ""}
                    {discovery.cached ? " · cache" : ""}
                    <br />
                    {discovery.nodeTypes?.length || 0} node · {discovery.dynamicChoices?.checkpoints?.length || 0} checkpoints · {discovery.dynamicChoices?.loras?.length || 0} loras · {discovery.dynamicChoices?.controlnets?.length || 0} controlnets
                  </span>
                ) : (
                  <span>Chưa quét được ComfyUI server.</span>
                )}
              </div>
              {showServerDetails ? (
                <div className="serverDetailTable" role="table" aria-label="Thông tin ComfyUI server">
                  {serverDetailRows.length ? serverDetailRows.map(([label, value]) => (
                    <div className="serverDetailRow" role="row" key={label}>
                      <span role="cell">{label}</span>
                      <b role="cell">{String(value)}</b>
                    </div>
                  )) : (
                    <div className="serverDetailEmpty">Chưa có dữ liệu server để hiển thị.</div>
                  )}
                </div>
              ) : null}

              <SavedServerList
                servers={getServers()}
                currentAddress={comfyAddress}
                onSwitch={addr => { setComfyAddress(addr); }}
                onRemove={removeServer}
              />
              {addServerOpen ? (
                <AddServerForm
                  onAdd={(label, address) => { addServer(label, address); setAddServerOpen(false); }}
                  onCancel={() => setAddServerOpen(false)}
                />
              ) : (
                <button className="addServerToggleBtn" onClick={() => setAddServerOpen(true)}>
                  + Lưu địa chỉ server
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {infoOpen ? (
        <div className="modalBackdrop infoBackdrop" role="presentation" onMouseDown={() => setInfoOpen(false)}>
          <section className="settingsModal infoModal" role="dialog" aria-modal="true" aria-label="Thông tin ứng dụng" onMouseDown={event => event.stopPropagation()}>
            <div className="modalHeader infoModalHeader">
              <div>
                <h2>aPix Builder</h2>
                <p>Ứng dụng dựng workflow ComfyUI bằng template YAML, tối ưu cho tạo ảnh và chỉnh ảnh nhanh.</p>
              </div>
              <button className="modalClose" onClick={() => setInfoOpen(false)} title="Đóng"><X size={18} /></button>
            </div>

            <div className="infoIntro">
              <div><span>Template hiện tại</span><b>{selectedTemplateName}</b></div>
              <div><span>Comfy Server</span><b>{comfyAddress || serverAddress || "Chưa cấu hình"}</b></div>
              <div><span>Phiên bản</span><b>beta v1.0</b></div>
            </div>

            <div className="infoNotice">
              <b>Cập nhật</b>
              <span>Hỗ trợ real-time progress bar, nhiều template, thư viện ảnh input/output, so sánh ảnh, Image Editor và tự quét model từ ComfyUI.</span>
            </div>

            <section className="infoCredits" aria-label="Thông tin người tạo dự án">
              <h3>Dự án & liên hệ</h3>
              <div className="infoCreditsGrid">
                <div>
                  <span>Người tạo</span>
                  <a href="https://www.facebook.com/phamhungd/" target="_blank" rel="noreferrer">© Phạm Hưng</a>
                </div>
                <div>
                  <span>Liên hệ</span>
                  <a href="https://zalo.me/0355873687" target="_blank" rel="noreferrer">0355873687</a>
                </div>
                <div>
                  <span>Cộng đồng</span>
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
                <span>Tìm hiểu thêm</span>
                <a href="https://aistudio.google.com/app/u/0/apps/d798af97-ec18-4946-bce4-3b5b0e7d403e?showPreview=true&showAssistant=true&fullscreenApplet=true" target="_blank" rel="noreferrer">aPix Google Studio</a>
                <a href="https://github.com/StableDiffusionVN/sdvn_apix_python" target="_blank" rel="noreferrer">aPix Python</a>
                <a href="https://github.com/StableDiffusionVN/sdvn_apix_react" target="_blank" rel="noreferrer">aPix React</a>
                <a href="https://sdvn.me" target="_blank" rel="noreferrer">Colab SDVN</a>
              </div>
            </section>

            <div className="infoGrid">
              <section className="infoSection">
                <h3>Phím tắt chung</h3>
                <p>Hoạt động ở màn hình chính khi bạn không nhập text.</p>
                <div className="shortcutList">
                  <ShortcutRow label="Mở bảng hướng dẫn này" keys={["Cmd/Ctrl", "/"]} />
                  <ShortcutRow label="Đóng popup" keys={["Esc"]} />
                  <ShortcutRow label="Đặt lại zoom/vị trí ảnh" keys={["Space"]} />
                  <ShortcutRow label="Bật/tắt so sánh input/output" keys={["S"]} />
                  <ShortcutRow label="Ảnh output trước/sau" keys={["←", "→"]} />
                </div>
              </section>
              <section className="infoSection">
                <h3>Canvas preview</h3>
                <p>Các thao tác chính trong vùng xem ảnh kết quả.</p>
                <div className="shortcutList">
                  <ShortcutRow label="Zoom ảnh" keys={["Cuộn chuột"]} />
                  <ShortcutRow label="Di chuyển ảnh đã zoom" keys={["Kéo ảnh"]} />
                  <ShortcutRow label="Reset khung xem" keys={["Space"]} />
                  <ShortcutRow label="So sánh ảnh" keys={["S"]} />
                  <ShortcutRow label="Chuyển output" keys={["←", "→"]} />
                </div>
              </section>
              <section className="infoSection">
                <h3>Image Editor</h3>
                <p>Các công cụ chỉnh ảnh mở từ input hoặc output.</p>
                <div className="shortcutList">
                  <ShortcutRow label="Bật/tắt so sánh trước/sau" keys={["S"]} />
                  <ShortcutRow label="Tạm chuyển sang công cụ Pan" keys={["Giữ Space"]} />
                  <ShortcutRow label="Thoát thao tác đang sửa" keys={["Esc"]} />
                  <ShortcutRow label="Lưu ảnh đã chỉnh vào output" keys={["Save"]} />
                </div>
              </section>
              <section className="infoSection">
                <h3>Mẹo sử dụng</h3>
                <ul className="tipsList">
                  <li>Kéo thả ảnh vào trường input để nạp ảnh nhanh hơn.</li>
                  <li>Dùng thư viện ảnh input/output để tái sử dụng file giữa các lần chạy.</li>
                  <li>Bật so sánh để kiểm tra khác biệt giữa ảnh đầu vào và ảnh kết quả.</li>
                  <li>Theo dõi progress bar để biết workflow đang chạy đến node nào.</li>
                </ul>
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {templateEditorOpen ? (
        <TemplateEditorModal
          selectedTemplate={selectedTemplate}
          comfyAddress={comfyAddress}
          discovery={discovery}
          onClose={() => setTemplateEditorOpen(false)}
          onSaved={reloadTemplates}
        />
      ) : null}

      {outputEditorOpen && heroImage ? (
        <ImageEditorModal
          source={heroImage}
          title="Output - Image Editor"
          onClose={() => setOutputEditorOpen(false)}
          onSave={handleSaveEditedOutput}
        />
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

const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R;

function RunningState({ progress, status, progressPct }) {
  const phase =
    !progress || progress.type === "start" ? 1
    : progress.type === "cached" || progress.type === "executing" || progress.type === "progress" || progress.type === "executed" ? 2
    : 1;

  const detail = progress?.label || status || "Đang chờ ComfyUI...";

  return (
    <div className="runningState">
      <div className="runningRing">
        <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
          <circle cx="40" cy="40" r={RING_R} stroke="var(--border-strong)" strokeWidth="5" />
          {progressPct !== null ? (
            <circle
              cx="40" cy="40" r={RING_R}
              stroke="var(--accent)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - progressPct / 100)}
              transform="rotate(-90 40 40)"
              style={{ transition: "stroke-dashoffset 0.35s ease" }}
            />
          ) : (
            <circle
              cx="40" cy="40" r={RING_R}
              stroke="var(--accent)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${RING_C * 0.28} ${RING_C * 0.72}`}
              className="runningRingSpin"
            />
          )}
        </svg>
        <span className="runningRingCenter">
          {progressPct !== null
            ? <span className="runningRingPct">{progressPct}%</span>
            : <Loader2 size={20} className="spin runningRingSpinner" />
          }
        </span>
      </div>

      <p className="runningTitle">ComfyUI đang xử lý</p>

      <div className="runPhases">
        <RunPhase label="Gửi workflow" active={phase === 1} done={phase > 1} />
        <span className="runPhaseSep" aria-hidden="true" />
        <RunPhase label="Xử lý nodes" active={phase === 2} done={phase > 2} />
        <span className="runPhaseSep" aria-hidden="true" />
        <RunPhase label="Lưu ảnh" active={phase === 3} done={false} />
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
