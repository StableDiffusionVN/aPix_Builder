import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  GitCompare,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RotateCcw,
  Settings2,
  X
} from "lucide-react";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DynamicField } from "./components/DynamicField";
import { ImageEditorModal } from "./components/ImageEditorModal";
import { OutputGallery } from "./components/OutputGallery";
import { RunControls } from "./components/RunControls";
import { TemplateEditorModal } from "./components/TemplateEditorModal";
import { TemplateSelector } from "./components/TemplateSelector";
import { downloadImage } from "./lib/download";
import { buildDefaults, flattenInputs, normalizeId, requestPayload } from "./lib/template";

const SERVER_STORAGE_KEY = "comfyui-build:server:v2";
const THEME_STORAGE_KEY = "comfyui-build:theme";
const WORKSPACE_STORAGE_KEY = "comfyui-build:workspace:v1";
const MIN_IMAGE_SCALE = 0.5;
const MAX_IMAGE_SCALE = 10;
const DEFAULT_COMFY_SERVER = "http://127.0.0.1:8188";

function loadTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || "gold";
}

function loadServerAddress() {
  const stored = localStorage.getItem(SERVER_STORAGE_KEY) || "";
  return stored || DEFAULT_COMFY_SERVER;
}

function loadStoredWorkspace() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || "{}");
    return {
      selectedTemplate: typeof parsed.selectedTemplate === "string" ? parsed.selectedTemplate : "",
      valuesByTemplate: parsed.valuesByTemplate && typeof parsed.valuesByTemplate === "object" ? parsed.valuesByTemplate : {}
    };
  } catch {
    return { selectedTemplate: "", valuesByTemplate: {} };
  }
}

function sanitizeWorkspaceValue(value) {
  if (typeof value === "string") {
    return value.startsWith("data:") || value.length > 200000 ? "" : value;
  }
  if (Array.isArray(value)) return value.map(sanitizeWorkspaceValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitizeWorkspaceValue(nested)]));
  }
  return value;
}

function sanitizeWorkspaceValues(values = {}) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, sanitizeWorkspaceValue(value)]));
}

function saveStoredWorkspace(workspace) {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    // Large temporary image data can exceed localStorage; keep the app usable.
  }
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [values, setValues] = useState({});
  const [status, setStatus] = useState("Đang tải cấu hình YAML...");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [comfyAddress, setComfyAddress] = useState(loadServerAddress);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [activeRunId, setActiveRunId] = useState("");
  const [runQueue, setRunQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [inputImages, setInputImages] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [outputEditorOpen, setOutputEditorOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [selectedOutputIndex, setSelectedOutputIndex] = useState(0);
  const [imageScale, setImageScale] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [imageFitSize, setImageFitSize] = useState({ width: 0, height: 0 });
  const [outputImageSize, setOutputImageSize] = useState({ width: 0, height: 0 });
  const [draggingImage, setDraggingImage] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [compareDividerX, setCompareDividerX] = useState(50);
  const imageDragRef = useRef(null);
  const previewAreaRef = useRef(null);
  const imageElementRef = useRef(null);
  const runQueueRef = useRef([]);
  const workspaceRef = useRef(loadStoredWorkspace());

  const inputs = useMemo(() => flattenInputs(config?.input), [config]);
  const outputs = useMemo(() => Object.values(config?.output || {}), [config]);
  const app = config?.app || {};
  const serverAddress = config?.server?.address || config?.sever?.address || "";
  const selectedTemplateName = templates.find(item => item.id === selectedTemplate)?.name || selectedTemplate || "Default";
  const resultOutputs = result?.outputs || [];
  const selectedOutput = resultOutputs[selectedOutputIndex] || resultOutputs[0];
  const outputLabel = selectedOutput?.label || outputs[0]?.ui?.label || "Ảnh kết quả";
  const heroImage = selectedOutput?.url;
  const resultTiming = result?.historyItem || result || {};
  const showStatus = Boolean(error || result || running || activeRunId || runQueue.length || status === "Đang tải cấu hình YAML...");
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (comfyAddress) localStorage.setItem(SERVER_STORAGE_KEY, comfyAddress);
  }, [comfyAddress]);

  useEffect(() => {
    if (!selectedTemplate || !config) return;
    const nextWorkspace = {
      ...workspaceRef.current,
      selectedTemplate,
      valuesByTemplate: {
        ...workspaceRef.current.valuesByTemplate,
        [selectedTemplate]: sanitizeWorkspaceValues(values)
      }
    };
    workspaceRef.current = nextWorkspace;
    saveStoredWorkspace(nextWorkspace);
  }, [config, selectedTemplate, values]);

  async function loadOutputHistory() {
    try {
      const response = await fetch("/api/output-history");
      if (!response.ok) return;
      const data = await response.json();
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    }
  }

  async function refreshInputImages() {
    try {
      const response = await fetch("/api/input-images");
      if (!response.ok) return;
      const data = await response.json();
      setInputImages(data.images || []);
    } catch {
      setInputImages([]);
    }
  }

  async function loadTemplateRegistry() {
    const response = await fetch("/api/templates");
    if (!response.ok) throw new Error("Không đọc được danh sách template từ API");
    return response.json();
  }

  async function loadTemplateConfig(templateId) {
    const suffix = templateId ? `?template=${encodeURIComponent(templateId)}` : "";
    const response = await fetch(`/api/config${suffix}`);
    if (!response.ok) throw new Error("Không đọc được cấu hình template từ API");
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function reloadTemplates(nextTemplateId) {
    const registry = await loadTemplateRegistry();
    setTemplates(registry.templates || []);
    await loadConfig(nextTemplateId || registry.default);
  }

  function resetImageView() {
    setImageScale(1);
    setImagePan({ x: 0, y: 0 });
  }

  function selectOutput(index) {
    if (!resultOutputs.length) return;
    const nextIndex = Math.min(resultOutputs.length - 1, Math.max(0, index));
    setSelectedOutputIndex(nextIndex);
    resetImageView();
  }

  function stepOutput(direction) {
    if (resultOutputs.length < 2) return;
    setSelectedOutputIndex(current => {
      const nextIndex = (current + direction + resultOutputs.length) % resultOutputs.length;
      return nextIndex;
    });
    resetImageView();
  }

  function isTextEntryTarget(target) {
    return target instanceof HTMLElement && (
      target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );
  }

  useEffect(() => {
    function handleSpaceReset(event) {
      if (!heroImage || event.code !== "Space") return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      resetImageView();
    }

    function handleCompareToggle(event) {
      if (!canCompare || event.key.toLowerCase() !== "s") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (document.querySelector(".imageEditorModal")) return;
      event.preventDefault();
      event.stopPropagation();
      setCompareMode(current => !current);
    }

    function preventSpaceClick(event) {
      if (!heroImage || event.code !== "Space") return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
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

  useEffect(() => {
    function handleOutputNavigation(event) {
      if (!heroImage || resultOutputs.length < 2) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (document.querySelector(".imageEditorModal")) return;
      event.preventDefault();
      event.stopPropagation();
      stepOutput(event.key === "ArrowRight" ? 1 : -1);
    }

    window.addEventListener("keydown", handleOutputNavigation, true);
    return () => window.removeEventListener("keydown", handleOutputNavigation, true);
  }, [heroImage, resultOutputs.length]);

  function updateImageFitSize() {
    const area = previewAreaRef.current;
    const image = imageElementRef.current;
    if (!area || !image || !image.naturalWidth || !image.naturalHeight) return;
    const areaWidth = area.clientWidth;
    const areaHeight = area.clientHeight;
    if (!areaWidth || !areaHeight) return;
    const fitScale = Math.min(areaWidth / image.naturalWidth, areaHeight / image.naturalHeight);
    setImageFitSize({
      width: Math.max(1, Math.floor(image.naturalWidth * fitScale)),
      height: Math.max(1, Math.floor(image.naturalHeight * fitScale))
    });
    setCompareDividerX(areaWidth / 2);
  }

  function handleResultImageLoad() {
    const image = imageElementRef.current;
    if (image?.naturalWidth && image?.naturalHeight) {
      setOutputImageSize({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    }
    updateImageFitSize();
  }

  useEffect(() => {
    if (!heroImage) {
      setImageFitSize({ width: 0, height: 0 });
      setOutputImageSize({ width: 0, height: 0 });
      setCompareMode(false);
      return undefined;
    }
    setOutputImageSize({ width: 0, height: 0 });
    const frame = requestAnimationFrame(updateImageFitSize);
    window.addEventListener("resize", updateImageFitSize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateImageFitSize);
    };
  }, [heroImage]);

  useEffect(() => {
    if (!canCompare) setCompareMode(false);
  }, [canCompare]);

  useEffect(() => {
    if (selectedOutputIndex >= resultOutputs.length) {
      setSelectedOutputIndex(0);
    }
  }, [resultOutputs.length, selectedOutputIndex]);

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
        const storedValues = nextTemplateId ? workspaceRef.current.valuesByTemplate?.[nextTemplateId] : null;
        setConfig(data.config);
        setValues(options.values || { ...defaults, ...(storedValues || {}) });
        setSelectedTemplate(nextTemplateId);
        setComfyAddress(current => options.address || current || data.server?.address || DEFAULT_COMFY_SERVER);
        setStatus(`YAML đã sẵn sàng: ${data.template?.name || data.template?.id || "Default"}`);
      })
      .catch(err => {
        setError(err.message);
        setStatus("Không đọc được YAML");
      });
  }

  useEffect(() => {
    loadOutputHistory();
    refreshInputImages();
    loadTemplateRegistry()
      .then(data => {
        setTemplates(data.templates || []);
        const storedTemplate = workspaceRef.current.selectedTemplate;
        const hasStoredTemplate = (data.templates || []).some(template => template.id === storedTemplate);
        return loadConfig(hasStoredTemplate ? storedTemplate : data.default);
      })
      .catch(() => loadConfig(""));
  }, []);

  function makeRunJob() {
    return {
      runId: crypto.randomUUID(),
      template: selectedTemplate,
      address: comfyAddress,
      values: requestPayload(inputs, values),
      queuedAt: new Date().toISOString()
    };
  }

  function setQueue(nextQueue) {
    runQueueRef.current = nextQueue;
    setRunQueue(nextQueue);
  }

  function runWorkflow() {
    const job = makeRunJob();
    if (running) {
      setQueue([...runQueueRef.current, job]);
      setStatus(`Đã thêm vào hàng chờ (${runQueueRef.current.length} request)`);
      return;
    }
    executeRun(job);
  }

  async function executeRun(job) {
    setActiveRunId(job.runId);
    setRunning(true);
    setError("");
    setResult(null);
    setSelectedOutputIndex(0);
    resetImageView();
    const clientSubmittedAt = new Date().toISOString();
    setStatus(runQueueRef.current.length ? `Đang chạy request, còn ${runQueueRef.current.length} trong hàng chờ...` : "Đang gửi workflow tới ComfyUI...");
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: job.runId,
          template: job.template,
          address: job.address,
          values: job.values,
          queuedAt: job.queuedAt
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Run failed");
      const clientCompletedAt = new Date().toISOString();
      const clientDurationMs = new Date(clientCompletedAt).getTime() - new Date(clientSubmittedAt).getTime();
      const timedHistoryItem = data.historyItem ? {
        ...data.historyItem,
        submittedAt: data.historyItem.submittedAt || data.submittedAt || clientSubmittedAt,
        completedAt: data.historyItem.completedAt || data.completedAt || clientCompletedAt,
        durationMs: data.historyItem.durationMs ?? data.durationMs ?? clientDurationMs
      } : null;
      const timedResult = {
        ...data,
        submittedAt: data.submittedAt || timedHistoryItem?.submittedAt || clientSubmittedAt,
        completedAt: data.completedAt || timedHistoryItem?.completedAt || clientCompletedAt,
        durationMs: data.durationMs ?? timedHistoryItem?.durationMs ?? clientDurationMs,
        historyItem: timedHistoryItem
      };
      setResult(timedResult);
      setSelectedOutputIndex(0);
      setHistory(current => timedHistoryItem ? [timedHistoryItem, ...current] : current);
      setStatus(`Hoàn tất prompt ${data.promptId}${timedResult.durationMs ? ` trong ${formatDuration(timedResult.durationMs)}` : ""}`);
    } catch (err) {
      setError(err.message);
      setStatus("Request thất bại");
    } finally {
      setActiveRunId("");
      const [nextJob, ...remaining] = runQueueRef.current;
      setQueue(remaining);
      if (nextJob) {
        setStatus(`Đang lấy request tiếp theo, còn ${remaining.length} trong hàng chờ...`);
        executeRun(nextJob);
      } else {
        setRunning(false);
      }
    }
  }

  async function cancelWorkflow() {
    if (!activeRunId) return;
    setStatus("Đang ngắt request...");
    try {
      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: activeRunId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cancel failed");
      setStatus(data.warning ? `Đã yêu cầu ngắt, cảnh báo: ${data.warning}` : "Đã gửi lệnh ngắt request");
    } catch (err) {
      setError(err.message);
      setStatus("Không gửi được lệnh ngắt");
    }
  }

  async function restoreHistory(item) {
    if (!item) return;
    setError("");
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
    setComfyAddress(item.address || "");
    if (item.templateId === "image-editor") {
      setStatus("Đã mở ảnh từ Image Editor");
      return;
    }
    await loadConfig(item.templateId, {
      values: item.values,
      address: item.address,
      keepResult: true
    });
    setStatus("Đã gọi lại prompt");
  }

  async function deleteHistoryItem(id) {
    try {
      const response = await fetch("/api/output-history/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await response.json();
      if (response.ok) {
        setHistory(data.history || []);
      } else {
        setHistory(current => current.filter(item => item.id !== id));
      }
    } catch {
      setHistory(current => current.filter(item => item.id !== id));
    }
    if (result?.runId === id) {
      setResult(null);
      setSelectedOutputIndex(0);
      resetImageView();
      setStatus("Đã xóa ảnh khỏi lịch sử");
    }
  }

  function handlePreviewWheel(event) {
    if (!heroImage) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    setImageScale(current => Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, Number((current + delta).toFixed(2)))));
  }

  function updateComparePosition(event) {
    const image = imageElementRef.current;
    if (!image) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width) return;
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(100, Math.max(0, Number(next.toFixed(2))));
    setComparePosition(clamped);
    setCompareDividerX(rect.left - event.currentTarget.getBoundingClientRect().left + rect.width * (clamped / 100));
  }

  function handlePreviewPointerDown(event) {
    if (!heroImage || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".outputNavButton, .outputRail")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    imageDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: imagePan.x,
      panY: imagePan.y
    };
    setDraggingImage(true);
  }

  function handlePreviewPointerMove(event) {
    if (compareMode && !imageDragRef.current) {
      updateComparePosition(event);
      return;
    }
    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (compareMode) updateComparePosition(event);
    setImagePan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY
    });
  }

  function handlePreviewPointerUp(event) {
    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    imageDragRef.current = null;
    setDraggingImage(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function handleDownload(output) {
    try {
      await downloadImage(output);
    } catch (err) {
      setError(err.message);
      setStatus("Không tải được ảnh");
    }
  }

  async function handleSaveEditedOutput(dataUrl) {
    const response = await fetch("/api/output-history/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        sourceFilename: selectedOutput?.filename,
        address: comfyAddress
      })
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(text || "Backend không trả về JSON khi lưu ảnh");
    }
    if (!response.ok) throw new Error(data.error || "Không lưu được ảnh đã sửa");
    if (!data.historyItem) throw new Error("Backend chưa trả về ảnh đã lưu. Hãy restart backend rồi thử lại.");

    const historyItem = data.historyItem;
    setResult(historyItem.result || historyItem);
    setSelectedOutputIndex(0);
    setHistory(current => data.history || (historyItem ? [historyItem, ...current] : current));
    resetImageView();
    setStatus("Đã lưu ảnh Image Editor vào output");
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark"><img src="/sdvn-icon.png" alt="SDVN" /></div>
          <div>
            <h1>SDVN ComfyUI Builder</h1>
            <p>{selectedTemplateName}</p>
          </div>
          <button className="settingsButton" onClick={() => setSettingsOpen(true)} title="Mở settings">
            <Settings2 size={18} />
          </button>
        </div>

        <section className="settingsGroup">
          <div className="settingsHeader">
            <Settings2 size={16} />
            <h2>API Workflow</h2>
          </div>
          <TemplateSelector
            templates={templates}
            selectedTemplate={selectedTemplate}
            onChange={loadConfig}
            onEdit={() => setTemplateEditorOpen(true)}
          />
        </section>

        <section className="settingsGroup workflowSettings">
          <div className="settingsHeader">
            <Settings2 size={16} />
            <h2>Workflow settings</h2>
          </div>
          <div className="formStack">
          {inputs.map(item => (
            <DynamicField
              key={item.key}
              item={item}
              value={values[normalizeId(item.id)]}
              onChange={next => setValues(current => ({ ...current, [normalizeId(item.id)]: next }))}
              inputImages={inputImages}
              onRefreshInputImages={refreshInputImages}
              onUpdateInputImages={setInputImages}
            />
          ))}
          </div>
        </section>

        <RunControls
          running={running}
          canRun={Boolean(config)}
          canCancel={Boolean(running && activeRunId)}
          queueCount={runQueue.length}
          onRun={runWorkflow}
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
                    title={compareMode ? "Tắt so sánh ảnh input và output (S)" : "Bật so sánh ảnh input và output (S)"}
                  >
                    <GitCompare size={14} />
                  </button>
                ) : null}
                <button className="downloadButton" onClick={resetImageView} title="Đặt zoom và vị trí về mặc định (Space)">
                  <RotateCcw size={14} />
                </button>
                <button className="downloadButton" onClick={() => setOutputEditorOpen(true)} title="Image Editor">
                  <Pencil size={14} />
                </button>
                <button className="downloadButton" onClick={() => handleDownload(selectedOutput)} title="Tải ảnh xuống">
                  <Download size={14} />
                </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="outputViewer">
            <div
              className={`previewArea ${heroImage ? "isInteractive" : ""} ${resultOutputs.length > 1 ? "hasOutputRail" : ""} ${compareMode ? "isCompareMode" : ""} ${draggingImage ? "isDragging" : ""}`}
              ref={previewAreaRef}
              onWheel={handlePreviewWheel}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
            >
              {heroImage ? (
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
                      <img
                        className="resultImage compareInputImage"
                        src={compareInputImage}
                        alt="Ảnh input"
                        draggable="false"
                      />
                      <img
                        ref={imageElementRef}
                        className="resultImage compareOutputImage"
                        src={heroImage}
                        alt={outputLabel}
                        draggable="false"
                        onLoad={handleResultImageLoad}
                      />
                    </>
                  ) : (
                    <img
                      ref={imageElementRef}
                      className="resultImage"
                      src={heroImage}
                      alt={outputLabel}
                      draggable="false"
                      onLoad={handleResultImageLoad}
                    />
                  )}
                </div>
              ) : (
                <div className="emptyState">
                  {running ? <Loader2 className="spin" size={42} /> : <ImageIcon size={42} />}
                  <h3>{running ? "ComfyUI đang xử lý" : "Chưa có ảnh kết quả"}</h3>
                  <p>{running ? "App đang chờ workflow hoàn tất." : "Điền input bên trái rồi chạy workflow để xem output."}</p>
                </div>
              )}
              {heroImage && resultOutputs.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="outputNavButton previous"
                    onClick={event => {
                      event.stopPropagation();
                      stepOutput(-1);
                    }}
                    title="Ảnh trước (←)"
                    aria-label="Ảnh trước"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    className="outputNavButton next"
                    onClick={event => {
                      event.stopPropagation();
                      stepOutput(1);
                    }}
                    title="Ảnh tiếp theo (→)"
                    aria-label="Ảnh tiếp theo"
                  >
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
                <div
                  className="compareDivider"
                  style={{ "--compare-divider-x": `${compareDividerX}px` }}
                  aria-hidden="true"
                />
              ) : null}
              {heroImage && outputImageSize.width && outputImageSize.height ? (
                <div className="outputSizeBadge">
                  {outputImageSize.width} x {outputImageSize.height}
                </div>
              ) : null}
              {heroImage && resultTiming.durationMs ? (
                <div className="outputTimingBadge">
                  Hoàn thành trong {formatDuration(resultTiming.durationMs)}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <OutputGallery history={history} onDownload={handleDownload} onRestore={restoreHistory} onDelete={deleteHistoryItem} />
      </section>

      {settingsOpen ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settingsModal" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={event => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <h2>Settings</h2>
                <p>Thiết lập giao diện và Comfy Server.</p>
              </div>
              <button className="modalClose" onClick={() => setSettingsOpen(false)} title="Đóng">
                <X size={18} />
              </button>
            </div>

            <label className="field">
              <span>Theme</span>
              <select value={theme} onChange={event => setTheme(event.target.value)}>
                <option value="gold">Midnight Gold</option>
                <option value="emerald">Emerald Lab</option>
                <option value="violet">Violet Studio</option>
              </select>
            </label>

            <div className="modalSection">
              <h3>Comfy Server</h3>
              <ConnectionPanel
                comfyAddress={comfyAddress}
                serverAddress={serverAddress}
                onAddressChange={setComfyAddress}
              />
            </div>
          </section>
        </div>
      ) : null}

      {templateEditorOpen ? (
        <TemplateEditorModal
          selectedTemplate={selectedTemplate}
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
