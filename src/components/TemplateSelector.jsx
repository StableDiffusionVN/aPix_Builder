import { useState } from "react";
import { FilePenLine, Trash2, Workflow } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

export function TemplateSelector({
  templates,
  selectedTemplate,
  onChange,
  onEdit,
  onDelete,
  deleteScope = "local"
}) {
  const { t } = useI18n();
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
      setDeleteError(error?.message || t("template.deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <label className="field templateField">
        <span>{t("template.label")}</span>
        <div className="templateSelectRow">
          <div className="templateSelect">
            <Workflow size={16} />
            <select value={selectedTemplate} onChange={event => onChange(event.target.value)}>
              {templates.map(template => (
                <option key={template.id} value={template.id}>{template.name || template.id}</option>
              ))}
            </select>
          </div>
          <button type="button" className="templateEditButton" onClick={onEdit} title={t("template.edit")}>
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
            title={selected?.isDefault ? t("template.cannotDelete") : t("template.delete")}
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
            aria-label={t("template.deleteTitle")}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <h2>{t("template.deleteTitle")}</h2>
                <p>{t("template.deleteConfirm", { name: selected?.name || selectedTemplate })}</p>
              </div>
            </div>
            {deleteError ? <p className="templateDeleteError">{deleteError}</p> : null}
            <div className="templateDeleteActions">
              <button type="button" className="secondaryActionButton" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                {t("common.cancel")}
              </button>
              <button type="button" className="dangerActionButton" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? t("template.deleting") : t("template.delete")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
