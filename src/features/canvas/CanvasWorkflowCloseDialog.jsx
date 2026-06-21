import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";

export function CanvasWorkflowCloseDialog({
  open,
  workflowName = "Workflow",
  librarySaved = false,
  busy = false,
  onCancel,
  onDiscard,
  onSaveAndClose
}) {
  const { t } = useI18n();
  if (!open) return null;

  return createPortal(
    <div
      className="modalBackdrop canvasWorkflowCloseBackdrop"
      role="presentation"
      onMouseDown={() => {
        if (!busy) onCancel?.();
      }}
    >
      <section
        className="settingsModal canvasWorkflowCloseDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvasWorkflowCloseTitle"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modalHeader">
          <div>
            <h2 id="canvasWorkflowCloseTitle">{t("canvas.close.title")}</h2>
            {librarySaved ? (
              <p>
                <strong>{workflowName}</strong> {t("canvas.close.modified")}
              </p>
            ) : (
              <p>
                <strong>{workflowName}</strong> {t("canvas.close.notSaved")}
              </p>
            )}
          </div>
        </div>
        <div className="canvasWorkflowCloseActions">
          <button
            type="button"
            className="secondaryActionButton"
            disabled={busy}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="dangerActionButton"
            disabled={busy}
            onClick={onDiscard}
          >
            {t("canvas.close.discard")}
          </button>
          <button
            type="button"
            className="primaryActionButton"
            disabled={busy}
            onClick={onSaveAndClose}
          >
            {busy ? <Loader2 size={14} className="spin" /> : null}
            {t("canvas.close.save")}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
