import { RefreshCcw, Upload } from "lucide-react";

const inputTypes = new Set(["text", "image", "image_mask", "slider", "dropdown", "seed", "checkbox", "number", "radio", "file", "colorpicker", "date", "json"]);

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function StaticBlock({ item }) {
  const ui = item.ui || {};
  if (ui.type === "markdown") {
    return <div className="note">{ui.value}</div>;
  }
  if (ui.type === "html") {
    return <div className="note" dangerouslySetInnerHTML={{ __html: ui.value }} />;
  }
  return null;
}

export function DynamicField({ item, value, onChange }) {
  const ui = item.ui || {};
  const label = ui.label || item.key;

  if (!inputTypes.has(ui.type)) return <StaticBlock item={item} />;
  if (ui.type === "seed") {
    return (
      <label className="field compact">
        <span>Seed</span>
        <div className="inlineControl">
          <input value={value} onChange={event => onChange(event.target.value)} />
          <button type="button" className="iconButton" onClick={() => onChange("random_seed")} title="Random seed">
            <RefreshCcw size={16} />
          </button>
        </div>
      </label>
    );
  }
  if (ui.type === "text") {
    return (
      <label className="field">
        <span>{label}</span>
        <textarea
          rows={ui.lines || 3}
          placeholder={ui.placeholder || ""}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      </label>
    );
  }
  if (ui.type === "image" || ui.type === "image_mask" || ui.type === "file") {
    return (
      <label className="field">
        <span>{label}</span>
        <div className="dropzone">
          <Upload size={18} />
          <strong>{value ? "Đã chọn tệp" : "Tải ảnh hoặc tệp lên"}</strong>
          <small>{ui.type === "image_mask" ? "Mask trong React bản này dùng ảnh chính; có thể mở rộng canvas mask sau." : "Ảnh sẽ được upload trực tiếp lên ComfyUI target khi chạy."}</small>
          <input
            type="file"
            accept={ui.type === "file" ? undefined : "image/*"}
            onChange={async event => {
              const file = event.target.files?.[0];
              onChange(file ? await fileToDataUrl(file) : "");
            }}
          />
        </div>
        {value?.startsWith?.("data:image") ? <img className="uploadPreview" src={value} alt="" /> : null}
      </label>
    );
  }
  if (ui.type === "slider") {
    return (
      <label className="field">
        <span>{label}<b>{value}</b></span>
        <input
          type="range"
          min={ui.minimum}
          max={ui.maximum}
          step={ui.step || 1}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
        />
      </label>
    );
  }
  if (ui.type === "dropdown") {
    return (
      <label className="field">
        <span>{label}</span>
        <select value={value} onChange={event => onChange(event.target.value)}>
          {(ui.choices || []).map(choice => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      </label>
    );
  }
  if (ui.type === "radio") {
    return (
      <fieldset className="field radioGroup">
        <legend>{label}</legend>
        {(ui.choices || []).map(choice => (
          <label key={choice}>
            <input type="radio" checked={value === choice} onChange={() => onChange(choice)} />
            {choice}
          </label>
        ))}
      </fieldset>
    );
  }
  if (ui.type === "checkbox") {
    return (
      <label className="checkField">
        <input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }
  if (ui.type === "number") {
    return (
      <label className="field compact">
        <span>{label}</span>
        <input type="number" value={value} onChange={event => onChange(Number(event.target.value))} />
      </label>
    );
  }
  if (ui.type === "colorpicker") {
    return (
      <label className="field compact colorField">
        <span>{label}</span>
        <input type="color" value={value || "#10b981"} onChange={event => onChange(event.target.value)} />
      </label>
    );
  }
  if (ui.type === "date") {
    return (
      <label className="field compact">
        <span>{label}</span>
        <input type="date" value={value || ""} onChange={event => onChange(event.target.value)} />
      </label>
    );
  }
  if (ui.type === "json") {
    return (
      <label className="field">
        <span>{label}</span>
        <textarea rows={5} value={value} onChange={event => onChange(event.target.value)} />
      </label>
    );
  }
}
