import { useState } from "react";
import { FilePenLine, Trash2, Workflow } from "lucide-react";

export function TemplateSelector({
  templates,
  selectedTemplate,
  onChange,
  onEdit,
  onDelete,
  deleteScope = "local"
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const selected = templates.find(template => template.id === selectedTemplate);
  const canDelete = Boolean(selected && !selected.isDefault && onDelete);

  async function handleConfirmDelete() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(selectedTemplate, deleteScope);
      setConfirmOpen(false);
      setDeleteError("");
    } catch (error) {
      setDeleteError(error?.message || "Không xóa được template");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
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
          <button
            type="button"
            className="templateDeleteButton"
            onClick={() => {
              setDeleteError("");
              setConfirmOpen(true);
            }}
            disabled={!canDelete}
            title={selected?.isDefault ? "Không thể xóa template mặc định" : "Xóa template"}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </label>

      {confirmOpen ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => !deleting && setConfirmOpen(false)}>
          <section
            className="settingsModal templateDeleteModal"
            role="dialog"
            aria-modal="true"
            aria-label="Xác nhận xóa template"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <h2>Xóa template?</h2>
                <p>
                  Bạn có chắc muốn xóa <b>{selected?.name || selectedTemplate}</b>?
                  Thư mục template và file YAML/JSON sẽ bị xóa vĩnh viễn.
                </p>
              </div>
            </div>
            {deleteError ? <p className="templateDeleteError">{deleteError}</p> : null}
            <div className="templateDeleteActions">
              <button type="button" className="secondaryActionButton" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                Hủy
              </button>
              <button type="button" className="dangerActionButton" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? "Đang xóa..." : "Xóa template"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
