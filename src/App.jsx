import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCode2,
  Image as ImageIcon,
  Loader2
} from "lucide-react";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DynamicField } from "./components/DynamicField";
import { OutputGallery } from "./components/OutputGallery";
import { RunControls } from "./components/RunControls";
import { TemplateSelector } from "./components/TemplateSelector";
import { downloadImage } from "./lib/download";
import { buildDefaults, flattenInputs, normalizeId, requestPayload } from "./lib/template";

export default function App() {
  const [config, setConfig] = useState(null);
  const [rawYaml, setRawYaml] = useState("");
  const [values, setValues] = useState({});
  const [status, setStatus] = useState("Đang tải cấu hình YAML...");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [comfyAddress, setComfyAddress] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [activeRunId, setActiveRunId] = useState("");

  const inputs = useMemo(() => flattenInputs(config?.input), [config]);
  const outputs = useMemo(() => Object.values(config?.output || {}), [config]);
  const app = config?.app || {};
  const serverAddress = config?.server?.address || config?.sever?.address || "";

  async function loadConfig(templateId) {
    const suffix = templateId ? `?template=${encodeURIComponent(templateId)}` : "";
    setStatus("Đang tải cấu hình YAML...");
    setError("");
    setResult(null);
    return fetch(`/api/config${suffix}`)
      .then(response => response.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setConfig(data.config);
        setRawYaml(data.raw);
        setValues(buildDefaults(flattenInputs(data.config?.input)));
        setSelectedTemplate(data.template?.id || templateId || "");
        setComfyAddress(current => current || data.server?.address || "");
        setStatus(`YAML đã sẵn sàng: ${data.template?.name || data.template?.id || "Default"}`);
      })
      .catch(err => {
        setError(err.message);
        setStatus("Không đọc được YAML");
      });
  }

  useEffect(() => {
    fetch("/api/templates")
      .then(response => response.json())
      .then(data => {
        setTemplates(data.templates || []);
        return loadConfig(data.default);
      })
      .catch(() => loadConfig(""));
  }, []);

  async function runWorkflow() {
    const runId = crypto.randomUUID();
    setActiveRunId(runId);
    setRunning(true);
    setError("");
    setResult(null);
    setStatus("Đang gửi workflow tới ComfyUI...");
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          template: selectedTemplate,
          address: comfyAddress,
          values: requestPayload(inputs, values)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Run failed");
      setResult(data);
      setStatus(`Hoàn tất prompt ${data.promptId}`);
    } catch (err) {
      setError(err.message);
      setStatus("Request thất bại");
    } finally {
      setRunning(false);
      setActiveRunId("");
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

  async function handleDownload(output) {
    try {
      await downloadImage(output);
    } catch (err) {
      setError(err.message);
      setStatus("Không tải được ảnh");
    }
  }

  const primaryOutput = result?.outputs?.[0];
  const heroImage = primaryOutput?.url;

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark"><ImageIcon size={20} /></div>
          <div>
            <h1>{app.name || "ComfyUI YAML App"}</h1>
            <p>{app.info || "Tạo giao diện từ YAML và gửi workflow tới ComfyUI."}</p>
          </div>
        </div>

        <ConnectionPanel
          comfyAddress={comfyAddress}
          serverAddress={serverAddress}
          onAddressChange={setComfyAddress}
        />

        <TemplateSelector
          templates={templates}
          selectedTemplate={selectedTemplate}
          onChange={loadConfig}
        />

        <section className="formStack">
          {inputs.map(item => (
            <DynamicField
              key={item.key}
              item={item}
              value={values[normalizeId(item.id)]}
              onChange={next => setValues(current => ({ ...current, [normalizeId(item.id)]: next }))}
            />
          ))}
        </section>

        <RunControls
          running={running}
          canRun={Boolean(config)}
          canCancel={Boolean(running && activeRunId)}
          onRun={runWorkflow}
          onCancel={cancelWorkflow}
        />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>Kết quả tạo ảnh</h2>
            <p>Template: <strong>{templates.find(item => item.id === selectedTemplate)?.name || selectedTemplate}</strong> · Target: <strong>{result?.address || comfyAddress || serverAddress}</strong></p>
          </div>
          <div className={`status ${error ? "bad" : result ? "good" : ""}`}>
            {error ? <AlertCircle size={17} /> : result ? <CheckCircle2 size={17} /> : <FileCode2 size={17} />}
            <span>{status}</span>
          </div>
        </header>

        <div className="previewArea">
          {heroImage ? (
            <>
              <button className="downloadButton previewDownload" onClick={() => handleDownload(primaryOutput)} title="Tải ảnh xuống">
                <Download size={17} />
                <span>Tải ảnh</span>
              </button>
              <img className="resultImage" src={heroImage} alt={outputs[0]?.ui?.label || "Ảnh kết quả"} />
            </>
          ) : (
            <div className="emptyState">
              {running ? <Loader2 className="spin" size={42} /> : <ImageIcon size={42} />}
              <h3>{running ? "ComfyUI đang xử lý" : "Chưa có ảnh kết quả"}</h3>
              <p>{running ? "App đang chờ websocket báo workflow hoàn tất." : "Điền input bên trái rồi chạy workflow để xem output."}</p>
            </div>
          )}
        </div>

        <div className="bottomPanels">
          <OutputGallery outputs={result?.outputs || []} onDownload={handleDownload} />
          <section className="panel log">
            <h3>Request log</h3>
            {error ? <pre className="errorText">{error}</pre> : <pre>{JSON.stringify({ template: selectedTemplate, address: comfyAddress, values: result?.request || requestPayload(inputs, values) }, null, 2)}</pre>}
          </section>
          <section className="panel yaml">
            <h3>YAML loaded</h3>
            <pre>{rawYaml.slice(0, 1400)}</pre>
          </section>
        </div>
      </section>
    </main>
  );
}
