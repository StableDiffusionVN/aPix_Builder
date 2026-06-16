import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Images, Link, Loader2, Pencil, Scissors, Upload, X } from "lucide-react";
import { InputLibraryModal } from "../../components/InputLibraryModal.jsx";
import { ImageLightboxOverlay } from "../../components/ImageLightboxOverlay.jsx";
import { ImageEditorModal } from "../../components/lazyModals.js";
import { MaskEditorModal } from "../../components/MaskEditorModal.jsx";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { getSetting, setSetting } from "../../lib/appSettings.js";
import { isHttpImageUrl } from "../../lib/localImageFolder.js";
import { getInputImageUrl } from "../../lib/inputImageUtils.js";
import { imageDisplayUrl } from "./canvasModel.js";
import { useCanvasActions } from "./canvasContext.js";

export { imageDisplayUrl };

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadToInputLibrary(file, updateInputImages) {
  const dataUrl = await readFileAsDataUrl(file);
  try {
    const response = await fetch("/api/input-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, dataUrl })
    });
    if (response.ok) {
      const data = await response.json();
      updateInputImages?.(data.images || []);
      if (data.image) return { kind: "input-image", ...data.image };
    }
  } catch {}
  return dataUrl;
}

async function loadUrlToInputLibrary(sourceUrl, updateInputImages) {
  const response = await fetch("/api/input-images/from-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: sourceUrl })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Không tải được URL");
  updateInputImages?.(data.images || []);
  if (data.image) return { kind: "input-image", ...data.image };
  throw new Error("Không tải được URL");
}

export function CanvasImageField({ label, value, onChange, onContextMenu }) {
  const { t } = useI18n();
  const { inputImages, refreshInputImages, updateInputImages } = useCanvasActions();
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryTimeFilter, setLibraryTimeFilter] = useState("all");
  const [libraryFavoritesOnly, setLibraryFavoritesOnly] = useState(false);
  const [favoriteInputImages, setFavoriteInputImages] = useState(
    () => new Set(getSetting("favorites.inputImages", []))
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [previewSize, setPreviewSize] = useState(null);

  const preview = previewBroken ? "" : imageDisplayUrl(value);
  const inputImageValue = value?.kind === "input-image" ? value : null;
  const selectedImages = inputImageValue ? [inputImageValue] : [];
  const imageHasMask = Boolean(inputImageValue?.maskDataUrl);
  const selectedInputName = inputImageValue?.name || "";
  const maskDataUrl = inputImageValue?.maskDataUrl || "";

  useEffect(() => {
    setPreviewBroken(false);
    setPreviewSize(null);
  }, [value]);

  const reloadInputLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      await refreshInputImages?.();
    } finally {
      setLibraryLoading(false);
    }
  }, [refreshInputImages]);

  async function commitImage(next) {
    onChange(next || "");
  }

  async function handleFiles(files) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUrlError("");
    const next = await uploadToInputLibrary(file, updateInputImages);
    await commitImage(next);
  }

  async function handleUrlSubmit(event) {
    event.preventDefault();
    const source = urlInput.trim();
    if (!source) return;
    if (!isHttpImageUrl(source)) {
      setUrlError(t("field.urlOnlyRequired"));
      return;
    }
    setUrlLoading(true);
    setUrlError("");
    try {
      const next = await loadUrlToInputLibrary(source, updateInputImages);
      await commitImage(next);
      setUrlInput("");
    } catch (error) {
      setUrlError(error.message || t("field.urlError"));
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    const uriList = event.dataTransfer.getData("text/uri-list");
    const uri = uriList
      ?.split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !line.startsWith("#"));
    if (uri && isHttpImageUrl(uri)) {
      setUrlInput(uri);
      setUrlLoading(true);
      setUrlError("");
      try {
        const next = await loadUrlToInputLibrary(uri, updateInputImages);
        await commitImage(next);
        setUrlInput("");
      } catch (error) {
        setUrlError(error.message || t("field.urlError"));
      } finally {
        setUrlLoading(false);
      }
      return;
    }
    await handleFiles(event.dataTransfer.files);
  }

  function selectInputImage(name) {
    const image = inputImages.find(item => item.name === name);
    if (!image) return;
    commitImage({ kind: "input-image", ...image, url: getInputImageUrl(image) });
    setLibraryOpen(false);
  }

  async function openInputLibrary() {
    setLibraryOpen(true);
    await reloadInputLibrary();
  }

  function toggleInputFavorite(name) {
    if (!name) return;
    setFavoriteInputImages(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSetting("favorites.inputImages", [...next]);
      return next;
    });
  }

  async function handleDeleteInputImage(image) {
    if (!image?.name) return;
    const response = await fetch("/api/input-images/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: image.name })
    });
    if (!response.ok) return;
    const data = await response.json();
    updateInputImages?.(data.images || []);
    if (inputImageValue?.name === image.name) commitImage("");
  }

  function openLightboxFromLibrary(image) {
    if (!image) return;
    const url = getInputImageUrl(image);
    if (!url) return;
    setLightboxImage({ name: image.name || label, url });
    setLightboxOpen(true);
  }

  function openPreviewLightbox() {
    if (!preview) return;
    setLightboxImage({ name: inputImageValue?.name || label, url: preview });
    setLightboxOpen(true);
  }

  async function handleSaveEditedInput(dataUrl) {
    try {
      const baseName = selectedInputName
        ? selectedInputName.replace(/(\.[^.]+)?$/, "_edited.png")
        : "edited.png";
      const response = await fetch("/api/input-images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: baseName, dataUrl })
      });
      if (response.ok) {
        const data = await response.json();
        updateInputImages?.(data.images || []);
        if (data.image) {
          commitImage({ kind: "input-image", ...data.image, url: getInputImageUrl(data.image) });
          return;
        }
      }
    } catch {}
    commitImage(dataUrl);
  }

  function handleSaveMask(nextMaskDataUrl) {
    if (!inputImageValue) return;
    if (nextMaskDataUrl) {
      commitImage({ ...inputImageValue, maskDataUrl: nextMaskDataUrl });
      return;
    }
    const { maskDataUrl: _omit, ...rest } = inputImageValue;
    commitImage(rest);
  }

  return (
    <div className="canvasField">
      <span className="canvasFieldLabel">{label}</span>
      <div
        className={`canvasImageField nodrag ${dragging ? "isDragging" : ""}`}
        onContextMenu={onContextMenu}
        onDragEnter={event => { event.preventDefault(); setDragging(true); }}
        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={event => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        {preview ? (
          <div className="canvasImageThumb">
            <img
              src={preview}
              alt={label}
              draggable="false"
              onLoad={event => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                setPreviewSize(naturalWidth && naturalHeight
                  ? { width: naturalWidth, height: naturalHeight }
                  : null);
              }}
              onError={() => {
                setPreviewBroken(true);
                setPreviewSize(null);
                commitImage("");
              }}
            />
            {previewSize ? (
              <div className="imageSizeBadge" title={`${label}: ${previewSize.width} x ${previewSize.height}`}>
                {previewSize.width} x {previewSize.height}
              </div>
            ) : null}
            {imageHasMask ? (
              <span className="multiImageMask" title={t("field.hasMask")}><Scissors size={11} /></span>
            ) : null}
            <div className="multiImageActions">
              <button
                type="button"
                className="nodrag"
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  openPreviewLightbox();
                }}
                title={t("field.openFull")}
              >
                <Eye size={13} />
              </button>
              {inputImageValue ? (
                <button
                  type="button"
                  className="nodrag"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMaskEditorOpen(true);
                  }}
                  title={imageHasMask ? t("field.editMask") : t("field.paintMask")}
                >
                  <Scissors size={13} />
                </button>
              ) : null}
              <button
                type="button"
                className="nodrag"
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  setEditorOpen(true);
                }}
                title="Image Editor"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className="nodrag"
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  commitImage("");
                }}
                title={t("field.removeUpload")}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="canvasUploadBtn" onClick={() => fileRef.current?.click()}>
            <Upload size={12} /> {dragging ? t("field.drop") : t("field.uploadHint")}
          </button>
        )}

        <form className="canvasImageUrlForm" onSubmit={handleUrlSubmit}>
          <span className="canvasImageUrlIcon" aria-hidden="true"><Link size={12} /></span>
          <input
            type="text"
            className="canvasImageUrlInput"
            value={urlInput}
            placeholder={t("field.urlPlaceholder")}
            onChange={event => {
              setUrlInput(event.target.value);
              if (urlError) setUrlError("");
            }}
          />
          <button type="submit" className="canvasImageUrlBtn" disabled={urlLoading || !urlInput.trim()} title={t("field.loadUrl")}>
            {urlLoading ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
          </button>
          <button
            type="button"
            className="canvasImageUrlBtn library"
            onClick={() => { void openInputLibrary(); }}
            title={t("field.chooseInput")}
          >
            <Images size={12} />
            <span>Input</span>
          </button>
        </form>
        {urlError ? <p className="canvasImageUrlError">{urlError}</p> : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async event => {
            await handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <InputLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        loading={libraryLoading}
        inputImages={inputImages}
        favoriteInputImages={favoriteInputImages}
        timeFilter={libraryTimeFilter}
        onTimeFilterChange={setLibraryTimeFilter}
        favoritesOnly={libraryFavoritesOnly}
        onFavoritesOnlyChange={setLibraryFavoritesOnly}
        selectedImages={selectedImages}
        onSelectImage={selectInputImage}
        onToggleFavorite={toggleInputFavorite}
        onViewImage={openLightboxFromLibrary}
        onDeleteImage={handleDeleteInputImage}
        overlayClassName="canvasInputLibraryModal"
      />

      <ImageLightboxOverlay
        open={lightboxOpen}
        image={lightboxImage}
        title={label}
        onClose={() => {
          setLightboxOpen(false);
          setLightboxImage(null);
        }}
      />

      {editorOpen && preview ? createPortal(
        <Suspense fallback={null}>
          <ImageEditorModal
            source={preview}
            title={`${label} - Image Editor`}
            onClose={() => setEditorOpen(false)}
            onSave={async dataUrl => {
              await handleSaveEditedInput(dataUrl);
              setEditorOpen(false);
            }}
          />
        </Suspense>,
        document.body
      ) : null}

      {maskEditorOpen && preview ? createPortal(
        <MaskEditorModal
          source={preview}
          initialMask={maskDataUrl}
          title={`${label} - ${t("mask.title")}`}
          onClose={() => setMaskEditorOpen(false)}
          onSave={nextMask => {
            handleSaveMask(nextMask);
            setMaskEditorOpen(false);
          }}
        />,
        document.body
      ) : null}
    </div>
  );
}
