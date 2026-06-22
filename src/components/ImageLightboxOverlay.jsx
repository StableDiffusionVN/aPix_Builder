import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext.jsx";
import { useZoomableImage } from "../hooks/useZoomableImage.js";
import { downloadImage } from "../lib/download.js";

export function ImageLightboxOverlay({ open, image, images, title, onClose, zoomable = true }) {
  const { t } = useI18n();
  const imageList = useMemo(() => {
    const list = Array.isArray(images) && images.length ? images : (image ? [image] : []);
    return list.filter(item => item?.url);
  }, [image, images]);
  const imageListKey = imageList.map(item => item.url).join("|");
  const [activeIndex, setActiveIndex] = useState(0);
  const currentImage = imageList[Math.min(activeIndex, Math.max(0, imageList.length - 1))];
  const canNavigate = imageList.length > 1;
  const zoom = useZoomableImage({
    enabled: zoomable,
    imageKey: currentImage?.url || "",
    open
  });

  useEffect(() => {
    setActiveIndex(0);
  }, [imageListKey, open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (!canNavigate) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex(current => (current - 1 + imageList.length) % imageList.length);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex(current => (current + 1) % imageList.length);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canNavigate, imageList.length, open, onClose]);

  if (!open || !currentImage?.url) return null;

  async function handleDownload(event) {
    event.stopPropagation();
    await downloadImage({
      url: currentImage.url,
      filename: currentImage.filename || currentImage.name || title || "image.png"
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
      <div className="imageLightboxActions">
        <button
          type="button"
          className="imageLightboxAction"
          onClick={handleDownload}
          title={t("preview.download")}
          aria-label={t("preview.download")}
        >
          <Download size={11} />
        </button>
        <button
          type="button"
          className="imageLightboxClose"
          onClick={() => onClose?.()}
          title={t("common.close")}
          aria-label={t("common.close")}
        >
          <X size={12} />
        </button>
      </div>
      <div
        className={`imageLightboxFrame${zoom.isPanning ? " isPanning" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title || currentImage.name || t("field.viewImage")}
        onClick={event => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <div
          className="imageLightboxStage"
          style={zoom.stageStyle}
          {...zoom.stageProps}
        >
          <img src={currentImage.url} alt={currentImage.name || title || ""} />
        </div>
        {canNavigate ? (
          <>
            <button
              type="button"
              className="imageLightboxNav previous"
              onClick={() => setActiveIndex(current => (current - 1 + imageList.length) % imageList.length)}
              title="Ảnh trước (←)"
              aria-label="Ảnh trước"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className="imageLightboxNav next"
              onClick={() => setActiveIndex(current => (current + 1) % imageList.length)}
              title="Ảnh tiếp theo (→)"
              aria-label="Ảnh tiếp theo"
            >
              <ChevronRight size={22} />
            </button>
            <div className="imageLightboxCounter">{activeIndex + 1} / {imageList.length}</div>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
