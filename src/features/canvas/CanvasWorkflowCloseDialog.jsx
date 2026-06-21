import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

export function CanvasWorkflowCloseDialog({
  open,
  workflowName = "Workflow",
  librarySaved = false,
  busy = false,
  onCancel,
  onDiscard,
  onSaveAndClose
}) {
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
            <h2 id="canvasWorkflowCloseTitle">Đóng workflow</h2>
            {librarySaved ? (
              <p>
                <strong>{workflowName}</strong> có thay đổi chưa lưu vào thư viện <code>workflows/</code>.
                Đóng không lưu sẽ giữ nguyên bản đã có trong thư viện.
              </p>
            ) : (
              <p>
                <strong>{workflowName}</strong> chưa lưu vào thư mục <code>workflows/</code>.
                Bạn muốn lưu trước khi đóng tab?
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
            Hủy
          </button>
          <button
            type="button"
            className="dangerActionButton"
            disabled={busy}
            onClick={onDiscard}
          >
            Đóng không lưu
          </button>
          <button
            type="button"
            className="primaryActionButton"
            disabled={busy}
            onClick={onSaveAndClose}
          >
            {busy ? <Loader2 size={14} className="spin" /> : null}
            Lưu và đóng
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
