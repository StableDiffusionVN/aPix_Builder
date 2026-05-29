import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Upload, X } from "lucide-react";

const FIELD_TYPES = ["image", "seed", "int", "float", "string", "menu", "checkbox", "boolean"];
const DISPLAY_TYPES = ["input", "slider"];
const STRING_DISPLAY_TYPES = ["input", "multiline"];

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
    value: defaultValueForType(type, fieldValue),
    choicesText: ""
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

function rowFromConfig(item, workflow, fallbackKey) {
  const [nodeId, ...fieldParts] = String(item.id || "").split("-");
  const field = fieldParts[fieldParts[0] === "inputs" ? 1 : 0] || "";
  const value = workflow?.[nodeId]?.inputs?.[field];
  const ui = item.ui || {};
  const type = ui.type === "text" ? "string" : ui.type || inferType(value);
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

function buildConfig({ appName, inputRows, outputRows }) {
  const usedInputKeys = new Set();
  const input = {};
  for (const row of inputRows) {
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function TemplateEditorModal({ selectedTemplate, onClose, onSaved }) {
  const [templateId, setTemplateId] = useState("");
  const [appName, setAppName] = useState("");
  const [workflow, setWorkflow] = useState(null);
  const [inputRows, setInputRows] = useState([]);
  const [outputRows, setOutputRows] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const nodes = useMemo(() => workflowNodes(workflow), [workflow]);
  const saveNodes = useMemo(() => nodes.filter(node => node.classType.toLowerCase().includes("save")), [nodes]);

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

  async function handleJsonUpload(file) {
    if (!file) return;
    setError("");
    try {
      const nextWorkflow = await readJsonFile(file);
      setWorkflow(nextWorkflow);
      const name = file.name.replace(/\.json$/i, "");
      setTemplateId(name);
      setAppName(current => current || name);
      setInputRows([]);
      const nextNodes = workflowNodes(nextWorkflow);
      const firstSave = nextNodes.find(node => node.classType.toLowerCase().includes("save"));
      setOutputRows(firstSave ? [{ rowId: crypto.randomUUID(), nodeId: firstSave.id, label: "Ảnh kết quả" }] : []);
    } catch (err) {
      setError(`JSON không hợp lệ: ${err.message}`);
    }
  }

  function addInputRow() {
    const firstNode = nodes.find(node => node.fields.length > 0);
    const field = firstNode?.fields?.[0] || "";
    const value = firstNode ? workflow?.[firstNode.id]?.inputs?.[field] : "";
    const typeDefaults = defaultsForType(inferType(value), value);
    setInputRows(current => [...current, {
      rowId: crypto.randomUUID(),
      nodeId: firstNode?.id || "",
      field,
      label: field || "Input",
      ...typeDefaults
    }]);
  }

  function updateInputRow(rowId, patch) {
    setInputRows(current => current.map(row => {
      if (row.rowId !== rowId) return row;
      const next = { ...row, ...patch };
      if (patch.nodeId) {
        const field = nodes.find(node => node.id === patch.nodeId)?.fields?.[0] || "";
        next.field = field;
        next.label = field || next.label;
      }
      if (patch.field) {
        const value = workflow?.[next.nodeId]?.inputs?.[patch.field];
        next.label = next.label || patch.field;
        Object.assign(next, defaultsForType(inferType(value), value));
      }
      if (patch.type) {
        const value = workflow?.[next.nodeId]?.inputs?.[next.field];
        Object.assign(next, defaultsForType(patch.type, value));
      }
      return next;
    }));
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
          <label className="uploadJsonButton">
            <Upload size={16} />
            <span>Upload JSON API</span>
            <input type="file" accept=".json,application/json" onChange={event => handleJsonUpload(event.target.files?.[0])} />
          </label>
          <label className="field">
            <span>Template ID</span>
            <input value={templateId} onChange={event => setTemplateId(event.target.value)} placeholder="fashion-flatlay" />
          </label>
          <label className="field">
            <span>Tên ứng dụng</span>
            <input value={appName} onChange={event => setAppName(event.target.value)} placeholder="Fashion Flatlay" />
          </label>
        </div>

        <div className="templateEditorContent">
          <section className="editorSection">
            <div className="editorSectionHeader">
              <h3>Input</h3>
              <button type="button" className="smallActionButton" onClick={addInputRow} disabled={!workflow}>
                <Plus size={15} />
                <span>Thêm input</span>
              </button>
            </div>
            <div className="editorRows">
              {inputRows.map(row => {
                const selectedNode = nodes.find(node => node.id === row.nodeId);
                return (
                  <div className={`editorRow inputEditorRow ${row.type === "menu" ? "isMenuRow" : ""}`} key={row.rowId}>
                    <label className="field">
                      <span>ID node</span>
                      <select value={row.nodeId} onChange={event => updateInputRow(row.rowId, { nodeId: event.target.value })}>
                        {nodes.map(node => (
                          <option key={node.id} value={node.id}>{node.id} - {node.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Trường</span>
                      <select value={row.field} onChange={event => updateInputRow(row.rowId, { field: event.target.value })}>
                        {(selectedNode?.fields || []).map(field => (
                          <option key={field} value={field}>{field}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Kiểu dữ liệu</span>
                      <select value={row.type} onChange={event => updateInputRow(row.rowId, { type: event.target.value })}>
                        {FIELD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Hiển thị</span>
                      <select value={row.display} onChange={event => updateInputRow(row.rowId, { display: event.target.value })} disabled={row.type !== "int" && row.type !== "float" && row.type !== "string"}>
                        {(row.type === "string" ? STRING_DISPLAY_TYPES : DISPLAY_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Tên hiển thị</span>
                      <input value={row.label} onChange={event => updateInputRow(row.rowId, { label: event.target.value })} />
                    </label>
                    {(row.type === "int" || row.type === "float" || row.type === "seed") ? (
                      <>
                        <label className="field">
                          <span>Min</span>
                          <input type="number" value={row.minimum} onChange={event => updateInputRow(row.rowId, { minimum: event.target.value })} />
                        </label>
                        <label className="field">
                          <span>Max</span>
                          <input type="number" value={row.maximum} onChange={event => updateInputRow(row.rowId, { maximum: event.target.value })} />
                        </label>
                        <label className="field">
                          <span>Step</span>
                          <input type="number" value={row.step} onChange={event => updateInputRow(row.rowId, { step: event.target.value })} />
                        </label>
                      </>
                    ) : null}
                    {row.type === "menu" ? (
                      <label className="field editorWide menuChoicesField">
                        <span>Menu choices, mỗi dòng một lựa chọn</span>
                        <textarea rows={3} value={row.choicesText} onChange={event => updateInputRow(row.rowId, { choicesText: event.target.value })} />
                      </label>
                    ) : null}
                    {row.type !== "image" ? (
                      <label className="field defaultValueField">
                        <span>Mặc định</span>
                        {(row.type === "checkbox" || row.type === "boolean") ? (
                          <select value={String(booleanValue(row.value))} onChange={event => updateInputRow(row.rowId, { value: event.target.value === "true" })}>
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        ) : (
                          <input value={row.value} onChange={event => updateInputRow(row.rowId, { value: event.target.value })} placeholder={row.type === "seed" ? "random_seed" : ""} />
                        )}
                      </label>
                    ) : null}
                    <button type="button" className="rowDeleteButton" onClick={() => setInputRows(current => current.filter(item => item.rowId !== row.rowId))} title="Xóa input">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              {inputRows.length === 0 ? <div className="editorEmpty">Chưa có input. Upload JSON rồi bấm thêm input.</div> : null}
            </div>
          </section>

          <section className="editorSection">
            <div className="editorSectionHeader">
              <h3>Output</h3>
              <button type="button" className="smallActionButton" onClick={addOutputRow} disabled={!workflow}>
                <Plus size={15} />
                <span>Thêm output</span>
              </button>
            </div>
            <div className="editorRows">
              {outputRows.map(row => (
                <div className="editorRow outputEditorRow" key={row.rowId}>
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
          <button type="button" className="smallActionButton secondary" onClick={onClose}>Hủy</button>
          <button type="button" className="saveTemplateButton" onClick={saveTemplate} disabled={saving || !workflow}>
            <Save size={16} />
            <span>{saving ? "Đang lưu..." : "Save"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
