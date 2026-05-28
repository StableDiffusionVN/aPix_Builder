import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Settings2,
  X
} from "lucide-react";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DynamicField } from "./components/DynamicField";
import { OutputGallery } from "./components/OutputGallery";
import { RunControls } from "./components/RunControls";
import { TemplateSelector } from "./components/TemplateSelector";
import { downloadImage } from "./lib/download";
import { buildDefaults, flattenInputs, normalizeId, requestPayload } from "./lib/template";

const SERVER_STORAGE_KEY = "comfyui-build:server:v2";
const THEME_STORAGE_KEY = "comfyui-build:theme";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [imageScale, setImageScale] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [imageFitSize, setImageFitSize] = useState({ width: 0, height: 0 });
  const [outputImageSize, setOutputImageSize] = useState({ width: 0, height: 0 });
  const [draggingImage, setDraggingImage] = useState(false);
  const imageDragRef = useRef(null);
  const previewAreaRef = useRef(null);
  const imageElementRef = useRef(null);
  const runQueueRef = useRef([]);

  const inputs = useMemo(() => flattenInputs(config?.input), [config]);
  const outputs = useMemo(() => Object.values(config?.output || {}), [config]);
  const app = config?.app || {};
  const serverAddress = config?.server?.address || config?.sever?.address || "";
  const selectedTemplateName = templates.find(item => item.id === selectedTemplate)?.name || selectedTemplate || "Default";
  const primaryOutput = result?.outputs?.[0];
  const heroImage = primaryOutput?.url;
  const resultTiming = result?.historyItem || result || {};

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (comfyAddress) localStorage.setItem(SERVER_STORAGE_KEY, comfyAddress);
  }, [comfyAddress]);

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

  function resetImageView() {
    setImageScale(1);
    setImagePan({ x: 0, y: 0 });
  }

  useEffect(() => {
    function handleSpaceReset(event) {
      if (!heroImage || event.code !== "Space") return;
      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement && (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
      );
      if (isTypingTarget) return;
      event.preventDefault();
      resetImageView();
    }

    window.addEventListener("keydown", handleSpaceReset);
    return () => window.removeEventListener("keydown", handleSpaceReset);
  }, [heroImage]);

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

  async function loadConfig(templateId, options = {}) {
    setStatus("Đang tải cấu hình YAML...");
    setError("");
    if (!options.keepResult) {
      setResult(null);
      resetImageView();
    }
    return loadTemplateConfig(templateId)
      .then(data => {
        setConfig(data.config);
        setValues(options.values || buildDefaults(flattenInputs(data.config?.input)));
        setSelectedTemplate(data.template?.id || templateId || "");
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
    loadTemplateRegistry()
      .then(data => {
        setTemplates(data.templates || []);
        return loadConfig(data.default);
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
    setResult(item.result || {
      runId: item.id,
      promptId: item.promptId,
      template: item.templateId,
      address: item.address,
      submittedAt: item.submittedAt,
      completedAt: item.completedAt || item.createdAt,
      durationMs: item.durationMs,
      outputs: item.outputs || []
    });
    setComfyAddress(item.address || "");
    await loadConfig(item.templateId, {
      values: item.values,
      address: item.address,
      keepResult: true
    });
    setStatus(`Đã gọi lại prompt ${item.promptId || "trước đó"}`);
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

  function handlePreviewPointerDown(event) {
    if (!heroImage || event.button !== 0) return;
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
    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
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
            <h3>{outputs[0]?.ui?.label || "Ảnh kết quả"}</h3>
            <div className="previewActions">
              <div className={`status ${error ? "bad" : result ? "good" : ""}`}>
            {error ? <AlertCircle size={17} /> : result ? <CheckCircle2 size={17} /> : running ? <Loader2 className="spin" size={17} /> : <ImageIcon size={17} />}
                <span>{status}</span>
              </div>
              {primaryOutput ? (
                <>
                <button className="downloadButton" onClick={resetImageView} title="Đặt zoom và vị trí về mặc định (Space)">
                  <RotateCcw size={16} />
                  <span>{Math.round(imageScale * 100)}%</span>
                </button>
                <button className="downloadButton" onClick={() => handleDownload(primaryOutput)} title="Tải ảnh xuống">
                  <Download size={17} />
                  <span>Tải ảnh</span>
                </button>
                </>
              ) : null}
            </div>
          </div>
          <div
            className={`previewArea ${heroImage ? "isInteractive" : ""} ${draggingImage ? "isDragging" : ""}`}
            ref={previewAreaRef}
            onWheel={handlePreviewWheel}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={handlePreviewPointerUp}
          >
            {heroImage ? (
              <div
                className="imageStage"
                style={{
                  "--image-scale": imageScale,
                  "--image-pan-x": `${imagePan.x}px`,
                  "--image-pan-y": `${imagePan.y}px`,
                  "--image-fit-width": imageFitSize.width ? `${imageFitSize.width}px` : "100%",
                  "--image-fit-height": imageFitSize.height ? `${imageFitSize.height}px` : "100%"
                }}
              >
                <img
                  ref={imageElementRef}
                  className="resultImage"
                  src={heroImage}
                  alt={outputs[0]?.ui?.label || "Ảnh kết quả"}
                  draggable="false"
                  onLoad={handleResultImageLoad}
                />
              </div>
            ) : (
              <div className="emptyState">
                {running ? <Loader2 className="spin" size={42} /> : <ImageIcon size={42} />}
                <h3>{running ? "ComfyUI đang xử lý" : "Chưa có ảnh kết quả"}</h3>
                <p>{running ? "App đang chờ workflow hoàn tất." : "Điền input bên trái rồi chạy workflow để xem output."}</p>
              </div>
            )}
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
    </main>
  );
}
