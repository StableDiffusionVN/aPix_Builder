import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext.jsx";

export function ImageLightboxOverlay({ open, image, title, onClose }) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !image?.url) return null;

  return createPortal(
    <div
      className="imageLightbox"
      role="presentation"
      onClick={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="imageLightboxFrame"
        role="dialog"
        aria-modal="true"
        aria-label={title || image.name || t("field.viewImage")}
        onClick={event => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <button
          type="button"
          className="imageLightboxClose"
          onClick={() => onClose?.()}
          title={t("common.close")}
        >
          <X size={18} />
        </button>
        <div className="imageLightboxStage">
          <img src={image.url} alt={image.name || title || ""} draggable="false" />
        </div>
      </div>
    </div>,
    document.body
  );
}
