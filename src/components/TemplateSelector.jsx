import { FilePenLine, Workflow } from "lucide-react";

export function TemplateSelector({ templates, selectedTemplate, onChange, onEdit }) {
  return (
    <label className="field templateField">
      <span>Mẫu API</span>
      <div className="templateSelectRow">
        <div className="templateSelect">
          <Workflow size={16} />
          <select value={selectedTemplate} onChange={event => onChange(event.target.value)}>
            {templates.map(template => (
              <option key={template.id} value={template.id}>{template.name || template.id}</option>
            ))}
          </select>
        </div>
        <button type="button" className="templateEditButton" onClick={onEdit} title="Tạo / sửa YAML, JSON">
          <FilePenLine size={16} />
        </button>
      </div>
    </label>
  );
}
