import { Workflow } from "lucide-react";

export function TemplateSelector({ templates, selectedTemplate, onChange }) {
  return (
    <label className="field templateField">
      <span>Mẫu API</span>
      <div className="templateSelect">
        <Workflow size={16} />
        <select value={selectedTemplate} onChange={event => onChange(event.target.value)}>
          {templates.map(template => (
            <option key={template.id} value={template.id}>{template.name || template.id}</option>
          ))}
        </select>
      </div>
    </label>
  );
}
