import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext.jsx";
import { useZoomableImage } from "../hooks/useZoomableImage.js";
import { downloadImage } from "../lib/download.js";

export function ImageLightboxOverlay({ open, image, title, onClose, zoomable = true }) {
  const { t } = useI18n();
  const zoom = useZoomableImage({
    enabled: zoomable,
    imageKey: image?.url || "",
    open
  });

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !image?.url) return null;

  async function handleDownload(event) {
    event.stopPropagation();
    await downloadImage({
      url: image.url,
      filename: image.filename || image.name || title || "image.png"
    });
  }

  return createPortal(
    <div
      className="imageLightbox"
      role="presentation"
      onClick={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`imageLightboxFrame${zoom.isPanning ? " isPanning" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title || image.name || t("field.viewImage")}
        onClick={event => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <div className="imageLightboxActions">
          <button
            type="button"
            className="imageLightboxAction"
            onClick={handleDownload}
            title={t("preview.download")}
          >
            <Download size={17} />
          </button>
          <button
            type="button"
            className="imageLightboxClose"
            onClick={() => onClose?.()}
            title={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>
        <div
          className="imageLightboxStage"
          style={zoom.stageStyle}
          {...zoom.stageProps}
        >
          <img src={image.url} alt={image.name || title || ""} />
        </div>
      </div>
    </div>,
    document.body
  );
}
