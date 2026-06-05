import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Dices,
  FileText,
  GripVertical,
  Hash,
  Image as ImageIcon,
  List,
  Plus,
  Save,
  ToggleLeft,
  Trash2,
  Type,
  Upload,
  X
} from "lucide-react";
import YAML from "yaml";
import { DYNAMIC_FIELD_TYPES, canonicalDynamicType, inferDynamicTypeFromField } from "../lib/dynamicTypes";

const FIELD_TYPES = ["image", ...DYNAMIC_FIELD_TYPES, "seed", "int", "float", "string", "menu", "checkbox", "boolean"];
const DISPLAY_TYPES = ["input", "slider"];
const STRING_DISPLAY_TYPES = ["input", "multiline"];

function inputRowIcon(row) {
  if (row.kind === "note") return FileText;
  const icons = {
    image: ImageIcon,
    int: Hash,
    float: Hash,
    seed: Dices,
    string: Type,
    menu: List,
    checkbox: ToggleLeft,
    boolean: ToggleLeft
  };
  return icons[row.type] || Box;
}

function inputRowLabel(row) {
  if (row.kind === "note") {
    const firstLine = String(row.markdown || "").split("\n").find(line => line.trim()) || "";
    return firstLine.replace(/^#+\s*/, "").trim() || "Chú thích";
  }
  return row.label || row.field || "Input";
}

function inputRowMeta(row, nodes) {
  if (row.kind === "note") return "Markdown · chú thích";
  const node = nodes.find(item => item.id === row.nodeId);
  const nodeLabel = node ? `${row.nodeId} · ${node.title}` : row.nodeId || "—";
  return `${nodeLabel} · ${row.field || "—"}`;
}

function InputDetailPanel({ row, nodes, onUpdate, onDelete }) {
  if (!row) {
    return (
      <div className="inputDetailEmpty">
        <p>Chọn một input bên trái để chỉnh chi tiết.</p>
        <small>Hoặc bấm <b>Thêm input</b> sau khi đã upload workflow JSON.</small>
      </div>
    );
  }

  const selectedNode = nodes.find(node => node.id === row.nodeId);
  const Icon = inputRowIcon(row);

  if (row.kind === "note") {
    return (
      <div className="inputDetailPanel">
        <div className="inputDetailHeader">
          <div className="inputDetailTitle">
            <span className={`typeBadge typeBadge--note`}><FileText size={14} /></span>
            <div>
              <h4>Chú thích Markdown</h4>
              <p>Hiển thị hướng dẫn trong form, không gửi sang ComfyUI.</p>
            </div>
          </div>
          <button type="button" className="rowDeleteButton" onClick={onDelete} title="Xóa chú thích">
            <Trash2 size={16} />
          </button>
        </div>
        <label className="field inputDetailFieldWide">
          <span>Nội dung Markdown</span>
          <textarea rows={12} value={row.markdown} onChange={event => onUpdate({ markdown: event.target.value })} />
        </label>
      </div>
    );
  }

  return (
    <div className="inputDetailPanel">
      <div className="inputDetailHeader">
        <div className="inputDetailTitle">
          <span className={`typeBadge typeBadge--${row.type || "string"}`}><Icon size={14} /></span>
          <div>
            <h4>{row.label || row.field || "Input"}</h4>
            <p>{inputRowMeta(row, nodes)}</p>
          </div>
        </div>
        <button type="button" className="rowDeleteButton" onClick={onDelete} title="Xóa input">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="inputDetailForm">
        <label className="field">
          <span>ID node</span>
          <select value={row.nodeId} onChange={event => onUpdate({ nodeId: event.target.value })}>
            {nodes.map(node => (
              <option key={node.id} value={node.id}>{node.id} - {node.title}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Trường</span>
          <select value={row.field} onChange={event => onUpdate({ field: event.target.value })}>
            {(selectedNode?.fields || []).map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Kiểu dữ liệu</span>
          <select value={row.type} onChange={event => onUpdate({ type: event.target.value })}>
            {FIELD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Hiển thị</span>
          <select
            value={row.display}
            onChange={event => onUpdate({ display: event.target.value })}
            disabled={row.type !== "int" && row.type !== "float" && row.type !== "string"}
          >
            {(row.type === "string" ? STRING_DISPLAY_TYPES : DISPLAY_TYPES).map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="field inputDetailFieldWide">
          <span>Tên hiển thị</span>
          <input value={row.label} onChange={event => onUpdate({ label: event.target.value })} />
        </label>
        {(row.type === "int" || row.type === "float" || row.type === "seed") ? (
          <div className="inputDetailNumericGrid">
            <label className="field">
              <span>Min</span>
              <input type="number" value={row.minimum} onChange={event => onUpdate({ minimum: event.target.value })} />
            </label>
            <label className="field">
              <span>Max</span>
              <input type="number" value={row.maximum} onChange={event => onUpdate({ maximum: event.target.value })} />
            </label>
            <label className="field">
              <span>Step</span>
              <input type="number" value={row.step} onChange={event => onUpdate({ step: event.target.value })} />
            </label>
          </div>
        ) : null}
        {row.type === "menu" ? (
          <label className="field inputDetailFieldWide">
            <span>Menu choices, mỗi dòng một lựa chọn</span>
            <textarea rows={4} value={row.choicesText} onChange={event => onUpdate({ choicesText: event.target.value })} />
          </label>
        ) : null}
        {row.type !== "image" ? (
          <label className="field">
            <span>Mặc định</span>
            {(row.type === "checkbox" || row.type === "boolean") ? (
              <select value={String(booleanValue(row.value))} onChange={event => onUpdate({ value: event.target.value === "true" })}>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : (
              <input value={row.value} onChange={event => onUpdate({ value: event.target.value })} placeholder={row.type === "seed" ? "random_seed" : ""} />
            )}
          </label>
        ) : null}
      </div>
    </div>
  );
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";
}

function uniqueKey(base, used) {
  let key = slugify(base);
  let index = 2;
  while (used.has(key)) {
    key = `${slugify(base)}_${index}`;
    index += 1;
  }
  used.add(key);
  return key;
}

function workflowNodes(workflow) {
  return Object.entries(workflow || {}).map(([id, node]) => ({
    id,
    title: node?._meta?.title || node?.class_type || id,
    classType: node?.class_type || "",
    fields: Object.keys(node?.inputs || {})
  }));
}

function defaultValueForType(type, fieldValue) {
  if (type === "image") return "";
  if (type === "seed") return "random_seed";
  if (type === "checkbox" || type === "boolean") return Boolean(fieldValue);
  if (type === "int" || type === "float") return Number.isFinite(Number(fieldValue)) ? Number(fieldValue) : 0;
  if (type === "json") return "{}";
  return typeof fieldValue === "string" ? fieldValue : "";
}

function defaultsForType(type, fieldValue) {
  return {
    type,
    display: "input",
    minimum: type === "float" ? 0 : 0,
    maximum: type === "float" ? 1 : "",
    step: type === "float" ? 0.1 : 1,
    value: type === "menu" && Array.isArray(fieldValue) ? fieldValue[0] || "" : defaultValueForType(type, fieldValue),
    choicesText: type === "menu" && Array.isArray(fieldValue) ? fieldValue.join("\n") : ""
  };
}

function numericValue(value) {
  if (value === "") return "";
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "";
}

function booleanValue(value) {
  return value === true || value === "true";
}

function inferType(value) {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (Array.isArray(value)) return "string";
  return "string";
}

function inferRowType({ field, nodeClass, value }) {
  const dynamicType = inferDynamicTypeFromField(field, nodeClass);
  if (dynamicType) return dynamicType;
  if (Array.isArray(value)) return "menu";
  return inferType(value);
}

function rowFromConfig(item, workflow, fallbackKey) {
  const ui = item.ui || {};
  if (ui.type === "note" || ui.type === "markdown") {
    return {
      rowId: crypto.randomUUID(),
      kind: "note",
      markdown: ui.markdown ?? ui.value ?? ""
    };
  }
  const [nodeId, ...fieldParts] = String(item.id || "").split("-");
  const field = fieldParts[fieldParts[0] === "inputs" ? 1 : 0] || "";
  const value = workflow?.[nodeId]?.inputs?.[field];
  const dynamicType = canonicalDynamicType(ui.type);
  const type = dynamicType || (ui.type === "text" ? "string" : ui.type || inferType(value));
  return {
    rowId: crypto.randomUUID(),
    nodeId,
    field,
    label: ui.label || fallbackKey,
    type,
    display: ui.type === "text" ? "multiline" : ui.display === "slider" ? "slider" : "input",
    minimum: ui.minimum ?? (type === "float" ? 0 : 0),
    maximum: ui.maximum ?? (type === "float" ? 1 : ""),
    step: ui.step ?? (type === "float" ? 0.1 : 1),
    value: type === "image" ? "" : ui.value ?? defaultValueForType(ui.type, value),
    choicesText: (ui.choices || []).join("\n")
  };
}

function outputFromConfig(item) {
  return {
    rowId: crypto.randomUUID(),
    nodeId: String(item.id || ""),
    label: item.ui?.label || "Ảnh kết quả"
  };
}

function moveRow(rows, rowId, direction) {
  const index = rows.findIndex(row => row.rowId === rowId);
  if (index < 0) return rows;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function reorderRows(rows, draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return rows;
  const draggedIndex = rows.findIndex(row => row.rowId === draggedId);
  const targetIndex = rows.findIndex(row => row.rowId === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return rows;
  const next = [...rows];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function buildConfig({ appName, inputRows, outputRows }) {
  const usedInputKeys = new Set();
  const input = {};
  for (const row of inputRows) {
    if (row.kind === "note") {
      const key = uniqueKey("note", usedInputKeys);
      input[key] = {
        ui: {
          type: "note",
          markdown: row.markdown || ""
        }
      };
      continue;
    }
    if (!row.nodeId || !row.field || !row.type) continue;
    const key = uniqueKey(row.label || `${row.nodeId}_${row.field}`, usedInputKeys);
    const ui = {
      type: row.type === "string" && row.display === "multiline" ? "text" : row.type,
      label: row.label || row.field
    };
    if ((row.type === "int" || row.type === "float" || row.type === "seed") && row.minimum !== "") {
      ui.minimum = numericValue(row.minimum);
    }
    if ((row.type === "int" || row.type === "float") && row.maximum !== "") {
      ui.maximum = numericValue(row.maximum);
    }
    if ((row.type === "int" || row.type === "float" || row.type === "seed") && row.step !== "") {
      ui.step = numericValue(row.step);
    }
    if ((row.type === "int" || row.type === "float") && row.display === "slider") {
      ui.display = "slider";
    }
    if (row.type === "menu") {
      ui.choices = row.choicesText.split("\n").map(item => item.trim()).filter(Boolean);
      ui.value = ui.choices.includes(row.value) ? row.value : ui.choices[0] || "";
    } else if (row.type === "seed") {
      ui.value = row.value === "" ? "random_seed" : row.value;
    } else if (row.type === "checkbox" || row.type === "boolean") {
      ui.value = booleanValue(row.value);
    } else if (row.type !== "image" && row.value !== "") {
      ui.value = row.type === "int" || row.type === "float" ? numericValue(row.value) : row.value;
    }
    input[key] = {
      id: `${row.nodeId}-${row.field}`,
      ui
    };
  }

  const usedOutputKeys = new Set();
  const output = {};
  for (const row of outputRows) {
    if (!row.nodeId) continue;
    const key = uniqueKey(row.label || row.nodeId, usedOutputKeys);
    output[key] = {
      id: row.nodeId,
      ui: {
        type: "image",
        label: row.label || "Ảnh kết quả"
      }
    };
  }

  return {
    app: { name: appName || "Untitled Template" },
    input,
    output
  };
}

function readJsonFile(file) {
  return readTextFile(file).then(text => JSON.parse(text));
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function isJsonFile(file) {
  return /\.json$/i.test(file?.name || "");
}

function isYamlFile(file) {
  return /\.(ya?ml)$/i.test(file?.name || "");
}

function preferredFile(files, names, matcher) {
  return files.find(file => names.includes((file.webkitRelativePath || file.name).split("/").pop()?.toLowerCase()))
    || files.find(matcher);
}

function templateIdFromFile(file) {
  const relative = file?.webkitRelativePath || file?.name || "";
  const firstFolder = relative.includes("/") ? relative.split("/")[0] : "";
  const baseName = (firstFolder || file?.name || "template").replace(/\.[^.]+$/, "");
  return baseName;
}

export function TemplateEditorModal({ selectedTemplate, discovery, onClose, onSaved }) {
  const [templateId, setTemplateId] = useState("");
  const [appName, setAppName] = useState("");
  const [workflow, setWorkflow] = useState(null);
  const [inputRows, setInputRows] = useState([]);
  const [outputRows, setOutputRows] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draggingInputId, setDraggingInputId] = useState("");
  const [draggingOutputId, setDraggingOutputId] = useState("");
  const [selectedInputId, setSelectedInputId] = useState("");

  const nodes = useMemo(() => workflowNodes(workflow), [workflow]);
  const saveNodes = useMemo(() => nodes.filter(node => node.classType.toLowerCase().includes("save")), [nodes]);
  const selectedInputRow = useMemo(
    () => inputRows.find(row => row.rowId === selectedInputId) || null,
    [inputRows, selectedInputId]
  );

  useEffect(() => {
    if (!inputRows.length) {
      setSelectedInputId("");
      return;
    }
    if (!inputRows.some(row => row.rowId === selectedInputId)) {
      setSelectedInputId(inputRows[0].rowId);
    }
  }, [inputRows, selectedInputId]);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrentTemplate() {
      if (!selectedTemplate) return;
      setError("");
      try {
        const response = await fetch(`/api/template-editor?template=${encodeURIComponent(selectedTemplate)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không đọc được template");
        if (cancelled) return;
        setTemplateId(data.template?.id || selectedTemplate);
        setAppName(data.config?.app?.name || data.template?.name || "");
        setWorkflow(data.workflow || null);
        setInputRows(Object.entries(data.config?.input || {}).map(([key, item]) => rowFromConfig(item, data.workflow, key)));
        setOutputRows(Object.values(data.config?.output || {}).map(outputFromConfig));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    loadCurrentTemplate();
    return () => {
      cancelled = true;
    };
  }, [selectedTemplate]);

  async function applyWorkflow(nextWorkflow, sourceName, nextConfig = null) {
    setWorkflow(nextWorkflow);
    const name = sourceName.replace(/\.(json|ya?ml)$/i, "");
    setTemplateId(slugify(nextConfig?.template?.id || nextConfig?.app?.id || name));
    setAppName(nextConfig?.app?.name || nextConfig?.name || name);
    const nextNodes = workflowNodes(nextWorkflow);
    if (nextConfig) {
      setInputRows(Object.entries(nextConfig.input || {}).map(([key, item]) => rowFromConfig(item, nextWorkflow, key)));
      setOutputRows(Object.values(nextConfig.output || {}).map(outputFromConfig));
      return;
    }
    setInputRows([]);
    const firstSave = nextNodes.find(node => node.classType.toLowerCase().includes("save"));
    setOutputRows(firstSave ? [{ rowId: crypto.randomUUID(), nodeId: firstSave.id, label: "Ảnh kết quả" }] : []);
  }

  async function handleTemplateUpload(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError("");
    try {
      const yamlFile = preferredFile(files, ["app_build.yaml", "app_build.yml"], isYamlFile);
      const jsonFile = preferredFile(files, ["api.json", "workflow.json"], isJsonFile);
      if (!jsonFile) throw new Error("Không tìm thấy workflow JSON hợp lệ");
      const nextWorkflow = JSON.parse(await readTextFile(jsonFile));
      const nextConfig = yamlFile ? YAML.parse(await readTextFile(yamlFile)) : null;
      if (nextConfig && (!nextConfig.input || !nextConfig.output)) {
        throw new Error("YAML thiếu input hoặc output");
      }
      setTemplateId(slugify(nextConfig?.template?.id || nextConfig?.app?.id || templateIdFromFile(yamlFile || jsonFile)));
      await applyWorkflow(nextWorkflow, jsonFile.name, nextConfig);
    } catch (err) {
      setError(`Không đọc được tệp upload: ${err.message}`);
    }
  }

  async function handleJsonUpload(file) {
    if (!file) return;
    setError("");
    try {
      const nextWorkflow = await readJsonFile(file);
      await applyWorkflow(nextWorkflow, file.name);
    } catch (err) {
      setError(`JSON không hợp lệ: ${err.message}`);
    }
  }

  function addInputRow() {
    const firstNode = nodes.find(node => node.fields.length > 0);
    const field = firstNode?.fields?.[0] || "";
    const value = firstNode ? workflow?.[firstNode.id]?.inputs?.[field] : "";
    const typeDefaults = defaultsForType(inferRowType({ field, nodeClass: firstNode?.classType, value }), value);
    const rowId = crypto.randomUUID();
    setInputRows(current => [...current, {
      rowId,
      nodeId: firstNode?.id || "",
      field,
      label: field || "Input",
      ...typeDefaults
    }]);
    setSelectedInputId(rowId);
  }

  function addNoteRow() {
    const rowId = crypto.randomUUID();
    setInputRows(current => [...current, {
      rowId,
      kind: "note",
      markdown: "### Ghi chú\n\nNhập nội dung **Markdown** tại đây."
    }]);
    setSelectedInputId(rowId);
  }

  function deleteInputRow(rowId) {
    setInputRows(current => current.filter(item => item.rowId !== rowId));
  }

  function updateInputRow(rowId, patch) {
    setInputRows(current => current.map(row => {
      if (row.rowId !== rowId) return row;
      const next = { ...row, ...patch };
      if (patch.nodeId) {
        const node = nodes.find(node => node.id === patch.nodeId);
        const field = node?.fields?.[0] || "";
        const value = workflow?.[patch.nodeId]?.inputs?.[field];
        next.field = field;
        next.label = field || next.label;
        Object.assign(next, defaultsForType(inferRowType({ field, nodeClass: node?.classType, value }), value));
      }
      if (patch.field) {
        const node = nodes.find(node => node.id === next.nodeId);
        const value = workflow?.[next.nodeId]?.inputs?.[patch.field];
        next.label = next.label || patch.field;
        Object.assign(next, defaultsForType(inferRowType({ field: patch.field, nodeClass: node?.classType, value }), value));
      }
      if (patch.type) {
        const value = workflow?.[next.nodeId]?.inputs?.[next.field];
        Object.assign(next, defaultsForType(patch.type, value));
      }
      return next;
    }));
  }

  function moveInputRow(rowId, direction) {
    setInputRows(current => moveRow(current, rowId, direction));
  }

  function addOutputRow() {
    const first = saveNodes[0] || nodes[0];
    setOutputRows(current => [...current, {
      rowId: crypto.randomUUID(),
      nodeId: first?.id || "",
      label: "Ảnh kết quả"
    }]);
  }

  function updateOutputRow(rowId, patch) {
    setOutputRows(current => current.map(row => row.rowId === rowId ? { ...row, ...patch } : row));
  }

  function moveOutputRow(rowId, direction) {
    setOutputRows(current => moveRow(current, rowId, direction));
  }

  async function saveTemplate() {
    if (!workflow) {
      setError("Cần upload hoặc load workflow JSON trước khi Save");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const config = buildConfig({ appName, inputRows, outputRows });
      const response = await fetch("/api/templates/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId, workflow, config })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được template");
      await onSaved(data.template.id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modalBackdrop templateEditorBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="settingsModal templateEditorModal" role="dialog" aria-modal="true" aria-label="Tạo hoặc sửa template" onMouseDown={event => event.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <h2>Tạo / sửa YAML, JSON</h2>
            <p>Upload workflow JSON hoặc chỉnh template đang chọn, sau đó lưu thành API template.</p>
          </div>
          <button className="modalClose" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="templateEditorToolbar">
          <div className="templateEditorUploadZone">
            <label className="uploadJsonButton uploadJsonButton--primary">
              <Upload size={18} />
              <span>Upload JSON/YAML</span>
              <input type="file" accept=".json,.yaml,.yml,application/json" multiple onChange={event => handleTemplateUpload(event.target.files)} />
            </label>
            <label className="uploadJsonButton">
              <Upload size={16} />
              <span>Upload thư mục</span>
              <input type="file" multiple webkitdirectory="" directory="" onChange={event => handleTemplateUpload(event.target.files)} />
            </label>
          </div>
          <div className="templateEditorMetaCard">
            <label className="field">
              <span>Template ID</span>
              <input value={templateId} onChange={event => setTemplateId(event.target.value)} placeholder="fashion-flatlay" />
            </label>
            <label className="field">
              <span>Tên ứng dụng</span>
              <input value={appName} onChange={event => setAppName(event.target.value)} placeholder="Fashion Flatlay" />
            </label>
          </div>
        </div>

        <div className="templateEditorContent">
          <section className="editorSection inputMasterDetailSection">
            <div className="editorSectionHeader">
              <h3>Input <span className="editorSectionCount">{inputRows.length}</span></h3>
              <div className="editorHeaderActions">
                <button type="button" className="smallActionButton" onClick={addInputRow} disabled={!workflow}>
                  <Plus size={15} />
                  <span>Thêm input</span>
                </button>
                <button type="button" className="smallActionButton" onClick={addNoteRow} disabled={!workflow}>
                  <FileText size={15} />
                  <span>Thêm chú thích</span>
                </button>
              </div>
            </div>
            <div className="inputMasterDetailBody">
              <div className="inputListPane">
                <div className="inputListRows">
                  {inputRows.map((row, index) => {
                    const Icon = inputRowIcon(row);
                    const isSelected = selectedInputId === row.rowId;
                    return (
                      <div
                        className={`inputListItem ${isSelected ? "isSelected" : ""} ${draggingInputId === row.rowId ? "isDragging" : ""}`}
                        key={row.rowId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedInputId(row.rowId)}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedInputId(row.rowId);
                          }
                        }}
                        onDragOver={event => {
                          if (!draggingInputId || draggingInputId === row.rowId) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={event => {
                          event.preventDefault();
                          setInputRows(current => reorderRows(current, draggingInputId, row.rowId));
                          setDraggingInputId("");
                        }}
                      >
                        <button
                          type="button"
                          className="rowDragHandle"
                          draggable
                          onClick={event => event.stopPropagation()}
                          onDragStart={event => {
                            setDraggingInputId(row.rowId);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", row.rowId);
                          }}
                          onDragEnd={() => setDraggingInputId("")}
                          onKeyDown={event => {
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveInputRow(row.rowId, -1);
                            }
                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveInputRow(row.rowId, 1);
                            }
                          }}
                          title="Kéo để đổi thứ tự. Có thể dùng ↑/↓ khi đang focus."
                          aria-label={`Di chuyển ${row.kind === "note" ? "chú thích" : "input"} ${index + 1}`}
                        >
                          <GripVertical size={16} />
                        </button>
                        <span className={`typeBadge typeBadge--${row.kind === "note" ? "note" : row.type || "string"}`}>
                          <Icon size={14} />
                        </span>
                        <div className="inputListItemMain">
                          <span className="inputListItemLabel">{inputRowLabel(row)}</span>
                          <span className="inputListItemMeta">{inputRowMeta(row, nodes)}</span>
                        </div>
                        {row.kind !== "note" ? (
                          <span className="inputListItemType">{row.type}</span>
                        ) : null}
                      </div>
                    );
                  })}
                  {inputRows.length === 0 ? (
                    <div className="editorEmpty inputListEmpty">
                      <p>Chưa có input.</p>
                      <small>Upload workflow JSON rồi bấm <b>Thêm input</b>.</small>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="inputDetailPane">
                <InputDetailPanel
                  row={selectedInputRow}
                  nodes={nodes}
                  onUpdate={patch => selectedInputRow && updateInputRow(selectedInputRow.rowId, patch)}
                  onDelete={() => selectedInputRow && deleteInputRow(selectedInputRow.rowId)}
                />
              </div>
            </div>
          </section>

          <section className="editorSection outputSectionCompact">
            <div className="editorSectionHeader">
              <h3>Output <span className="editorSectionCount">{outputRows.length}</span></h3>
              <div className="editorHeaderActions">
                <button type="button" className="smallActionButton" onClick={addOutputRow} disabled={!workflow}>
                  <Plus size={15} />
                  <span>Thêm output</span>
                </button>
              </div>
            </div>
            <div className="editorRows outputRowsCompact">
              {outputRows.map((row, index) => (
                <div
                  className={`editorRow outputEditorRow ${draggingOutputId === row.rowId ? "isDragging" : ""}`}
                  key={row.rowId}
                  onDragOver={event => {
                    if (!draggingOutputId || draggingOutputId === row.rowId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    setOutputRows(current => reorderRows(current, draggingOutputId, row.rowId));
                    setDraggingOutputId("");
                  }}
                >
                  <button
                    type="button"
                    className="rowDragHandle"
                    draggable
                    onClick={event => event.preventDefault()}
                    onDragStart={event => {
                      setDraggingOutputId(row.rowId);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", row.rowId);
                    }}
                    onDragEnd={() => setDraggingOutputId("")}
                    onKeyDown={event => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveOutputRow(row.rowId, -1);
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveOutputRow(row.rowId, 1);
                      }
                    }}
                    title="Kéo để đổi thứ tự output. Có thể dùng ↑/↓ khi đang focus."
                    aria-label={`Di chuyển output ${index + 1}`}
                  >
                    <GripVertical size={16} />
                  </button>
                  <label className="field">
                    <span>ID node Save</span>
                    <select value={row.nodeId} onChange={event => updateOutputRow(row.rowId, { nodeId: event.target.value })}>
                      {(saveNodes.length ? saveNodes : nodes).map(node => (
                        <option key={node.id} value={node.id}>{node.id} - {node.title}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Tên output</span>
                    <input value={row.label} onChange={event => updateOutputRow(row.rowId, { label: event.target.value })} />
                  </label>
                  <button type="button" className="rowDeleteButton" onClick={() => setOutputRows(current => current.filter(item => item.rowId !== row.rowId))} title="Xóa output">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {outputRows.length === 0 ? <div className="editorEmpty">Chưa có output. Chọn node có class_type chứa "Save".</div> : null}
            </div>
          </section>
        </div>

        {error ? <div className="editorError">{error}</div> : null}
        <div className="templateEditorFooter">
          <span className="templateEditorStatus">
            {workflow
              ? `${nodes.length} nodes · ${inputRows.length} input · ${outputRows.length} output`
              : "Chưa có workflow — upload JSON để bắt đầu"}
          </span>
          <div className="templateEditorFooterActions">
            <button type="button" className="smallActionButton secondary" onClick={onClose}>Hủy</button>
            <button type="button" className="saveTemplateButton" onClick={saveTemplate} disabled={saving || !workflow}>
              <Save size={16} />
              <span>{saving ? "Đang lưu..." : "Lưu template"}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
