import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Folder, Images, Link, Loader2, Pencil, Scissors, Upload, X } from "lucide-react";
import { InputLibraryModal } from "../../components/InputLibraryModal.jsx";
import { ImageLightboxOverlay } from "../../components/ImageLightboxOverlay.jsx";
import { ImageEditorModal } from "../../components/lazyModals.js";
import { MaskEditorModal } from "../../components/MaskEditorModal.jsx";
import { ImageMaskOverlay } from "../../components/ImageMaskOverlay.jsx";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { clearPickedFolderFiles, registerPickedFolderFiles } from "../../lib/folderFileCache.js";
import { isHttpImageUrl, readLocalFolderValue } from "../../lib/localImageFolder.js";
import { getInputImageUrl } from "../../lib/inputImageUtils.js";
import {
  deleteInputImage,
  loadInputImageFromUrl,
  makeInputImageValue,
  saveEditedInputImage,
  uploadInputImageFile
} from "../../lib/inputImageActions.js";
import { useInputImageField } from "../../hooks/useInputImageField.js";
import { imageDisplayUrl } from "./canvasModel.js";
import { useCanvasActions } from "./canvasContext.js";

export { imageDisplayUrl };

function readCanvasImageValues(value) {
  if (readLocalFolderValue(value)) return [];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter(item => imageDisplayUrl(item));
}

export function CanvasImageField({ label, value, onChange, onContextMenu }) {
  const { t } = useI18n();
  const { inputImages, refreshInputImages, updateInputImages } = useCanvasActions();
  const fileRef = useRef(null);
  const folderPickerRef = useRef(null);
  const reorderDragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const inputField = useInputImageField({ inputImages, refreshInputImages });
  const [previewBroken, setPreviewBroken] = useState(false);
  const [previewSize, setPreviewSize] = useState(null);
  const {
    urlInput,
    setUrlInput,
    urlLoading,
    setUrlLoading,
    urlError,
    setUrlError,
    libraryOpen,
    libraryLoading,
    libraryTimeFilter,
    setLibraryTimeFilter,
    libraryFavoritesOnly,
    setLibraryFavoritesOnly,
    libraryMultiSelect,
    setLibraryMultiSelect,
    favoriteInputImages,
    openInputLibrary,
    closeInputLibrary,
    toggleInputFavorite,
    lightboxOpen,
    lightboxImage,
    openLightbox,
    closeLightbox,
    editorOpen,
    setEditorOpen,
    maskEditorOpen,
    setMaskEditorOpen
  } = inputField;

  const folderValue = readLocalFolderValue(value);
  const selectedImages = readCanvasImageValues(value);
  const activeImage = selectedImages[Math.min(activeImageIndex, Math.max(0, selectedImages.length - 1))] || null;
  const preview = previewBroken ? "" : imageDisplayUrl(activeImage);
  const inputImageValue = activeImage?.kind === "input-image" ? activeImage : null;
  const imageHasMask = Boolean(activeImage && typeof activeImage === "object" && activeImage.maskDataUrl);
  const selectedInputName = inputImageValue?.name || "";
  const maskDataUrl = activeImage && typeof activeImage === "object" ? (activeImage.maskDataUrl || "") : "";

  useEffect(() => {
    setPreviewBroken(false);
    setPreviewSize(null);
  }, [activeImage]);

  useEffect(() => {
    if (activeImageIndex >= selectedImages.length) {
      setActiveImageIndex(Math.max(0, selectedImages.length - 1));
    }
  }, [activeImageIndex, selectedImages.length]);

  async function commitImage(next) {
    onChange(next || "");
  }

  function commitImages(images) {
    const next = images.filter(Boolean);
    if (!next.length) {
      onChange("");
    } else if (next.length === 1) {
      onChange(next[0]);
    } else {
      onChange(next);
    }
  }

  async function handleFiles(files) {
    const pickedFiles = [...(files || [])].filter(file => file?.type?.startsWith("image/"));
    if (!pickedFiles.length) return;
    setUrlError("");
    const uploaded = [];
    for (const file of pickedFiles) {
      const image = await uploadInputImageFile(file, { updateInputImages });
      if (image) uploaded.push(image);
    }
    if (!uploaded.length) return;
    const next = [...selectedImages, ...uploaded];
    commitImages(next);
    setActiveImageIndex(Math.max(0, next.length - uploaded.length));
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
      const next = await loadInputImageFromUrl(source, {
        updateInputImages,
        errorMessage: t("field.urlError")
      });
      commitImages([...selectedImages, next]);
      setActiveImageIndex(selectedImages.length);
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
        const next = await loadInputImageFromUrl(uri, {
          updateInputImages,
          errorMessage: t("field.urlError")
        });
        commitImages([...selectedImages, next]);
        setActiveImageIndex(selectedImages.length);
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
    const nextImage = makeInputImageValue(image);
    const alreadySelected = selectedImages.some(item => item?.kind === "input-image" && item.name === name);
    if (libraryMultiSelect) {
      const next = alreadySelected
        ? selectedImages.filter(item => !(item?.kind === "input-image" && item.name === name))
        : [...selectedImages, nextImage];
      commitImages(next);
      setActiveImageIndex(Math.max(0, next.length - 1));
      return;
    }
    commitImage(nextImage);
    closeInputLibrary();
  }

  async function handlePickLocalFolder(event) {
    const fileList = [...(event.target.files || [])];
    event.target.value = "";
    if (!fileList.length) return;
    setUrlLoading(true);
    setUrlError("");
    try {
      if (folderValue?.kind === "local-folder-picked" && folderValue.sessionId) {
        clearPickedFolderFiles(folderValue.sessionId);
      }
      const { sessionId, imageCount, files } = registerPickedFolderFiles(fileList);
      if (!imageCount) throw new Error(t("field.folderNoImages"));
      const folderName = files[0]?.webkitRelativePath?.split("/")?.[0]
        || files[0]?.name
        || t("field.folderDefaultName");
      onChange({
        kind: "local-folder-picked",
        sessionId,
        folderName,
        imageCount
      });
      setActiveImageIndex(0);
      setUrlInput("");
    } catch (error) {
      setUrlError(error.message || t("field.folderError"));
    } finally {
      setUrlLoading(false);
    }
  }

  function removeSelectedImage(index) {
    const next = selectedImages.filter((_, imageIndex) => imageIndex !== index);
    commitImages(next);
    setActiveImageIndex(current => Math.min(current, Math.max(0, next.length - 1)));
  }

  function moveSelectedImage(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...selectedImages];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    commitImages(next);
    setActiveImageIndex(toIndex);
  }

  async function handleDeleteInputImage(image) {
    if (!image?.name) return;
    const images = await deleteInputImage(image, { updateInputImages });
    if (!images) return;
    const next = selectedImages.filter(item => !(item?.kind === "input-image" && item.name === image.name));
    if (next.length !== selectedImages.length) commitImages(next);
  }

  function openLightboxFromLibrary(image) {
    if (!image) return;
    const url = getInputImageUrl(image);
    if (!url) return;
    openLightbox({ name: image.name || label, url });
  }

  function openPreviewLightbox() {
    if (!preview) return;
    openLightbox({ name: inputImageValue?.name || label, url: preview });
  }

  async function handleSaveEditedInput(dataUrl) {
    try {
      const nextImage = await saveEditedInputImage(dataUrl, {
        selectedName: selectedInputName,
        updateInputImages
      });
      if (nextImage) {
        const next = [...selectedImages];
        next[activeImageIndex] = nextImage;
        commitImages(next);
        return;
      }
    } catch {}
    const next = [...selectedImages];
    next[activeImageIndex] = dataUrl;
    commitImages(next);
  }

  function handleSaveMask(nextMaskDataUrl) {
    const imageValue = activeImage && typeof activeImage === "object"
      ? activeImage
      : { kind: "input-image", url: preview };
    const next = [...selectedImages];
    if (nextMaskDataUrl) {
      next[activeImageIndex] = { ...imageValue, maskDataUrl: nextMaskDataUrl };
      commitImages(next);
      return;
    }
    const rest = { ...imageValue };
    delete rest.maskDataUrl;
    next[activeImageIndex] = rest;
    commitImages(next);
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
        {folderValue ? (
          <div className="canvasFolderSelection localFolderSelection">
            <div className="localFolderSelectionIcon">
              {urlLoading ? <Loader2 size={18} className="spin" /> : <Folder size={18} />}
            </div>
            <div className="localFolderSelectionBody">
              <strong>
                {urlLoading
                  ? t("field.folderLoading")
                  : t("field.folderReady", { count: folderValue.imageCount || 0 })}
              </strong>
              <small>{folderValue.folderName || folderValue.folderPath}</small>
              <small>{t("field.folderPickedHint")}</small>
            </div>
            <button
              type="button"
              className="localFolderSelectionRemove"
              onClick={() => {
                if (folderValue?.kind === "local-folder-picked" && folderValue.sessionId) {
                  clearPickedFolderFiles(folderValue.sessionId);
                }
                commitImage("");
              }}
              title={t("field.removeFolder")}
              aria-label={t("field.removeFolder")}
            >
              <X size={14} />
            </button>
          </div>
        ) : preview ? (
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
                removeSelectedImage(activeImageIndex);
              }}
            />
            {imageHasMask ? (
              <ImageMaskOverlay maskDataUrl={maskDataUrl} fit="contain" />
            ) : null}
            {previewSize ? (
              <div className="imageSizeBadge" title={`${label}: ${previewSize.width} x ${previewSize.height}`}>
                {previewSize.width} x {previewSize.height}
              </div>
            ) : null}
            {selectedImages.length > 1 ? (
              <span className="canvasMultiImageCount">
                {activeImageIndex + 1}/{selectedImages.length}
              </span>
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
                  removeSelectedImage(activeImageIndex);
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
        {!folderValue && selectedImages.length > 1 ? (
          <div className="canvasSelectedImageStrip" aria-label={t("field.selectedImages", { count: selectedImages.length })}>
            {selectedImages.map((image, index) => {
              const imageUrl = imageDisplayUrl(image);
              const imageName = image?.kind === "input-image" ? image.name : `${label} ${index + 1}`;
              return (
                <button
                  key={`${imageUrl || imageName}-${index}`}
                  type="button"
                  className={`canvasSelectedImageThumb${index === activeImageIndex ? " isActive" : ""}`}
                  draggable
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    setActiveImageIndex(index);
                  }}
                  onDragStart={event => {
                    reorderDragRef.current = index;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-apix-canvas-image-index", String(index));
                  }}
                  onDragOver={event => {
                    if (!event.dataTransfer.types.includes("application/x-apix-canvas-image-index")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={event => {
                    const transferredIndex = Number(event.dataTransfer.getData("application/x-apix-canvas-image-index"));
                    const fromIndex = Number.isInteger(transferredIndex)
                      ? transferredIndex
                      : reorderDragRef.current;
                    if (fromIndex == null) return;
                    event.preventDefault();
                    event.stopPropagation();
                    moveSelectedImage(fromIndex, index);
                    reorderDragRef.current = null;
                  }}
                  onDragEnd={() => {
                    reorderDragRef.current = null;
                  }}
                  title={`${index + 1}. ${imageName || t("field.chooseImage")}`}
                  aria-pressed={index === activeImageIndex}
                >
                  <img src={imageUrl} alt="" draggable="false" />
                  <span>{index + 1}</span>
                </button>
              );
            })}
          </div>
        ) : null}

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
            className="canvasImageUrlBtn folder"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              folderPickerRef.current?.click();
            }}
            disabled={urlLoading}
            title={t("field.pickLocalFolder")}
            aria-label={t("field.pickLocalFolder")}
          >
            <Folder size={12} />
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
          multiple
          hidden
          onChange={async event => {
            await handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={folderPickerRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          webkitdirectory=""
          directory=""
          onChange={handlePickLocalFolder}
        />
      </div>

      <InputLibraryModal
        open={libraryOpen}
        onClose={closeInputLibrary}
        loading={libraryLoading}
        inputImages={inputImages}
        favoriteInputImages={favoriteInputImages}
        timeFilter={libraryTimeFilter}
        onTimeFilterChange={setLibraryTimeFilter}
        favoritesOnly={libraryFavoritesOnly}
        onFavoritesOnlyChange={setLibraryFavoritesOnly}
        supportsMultipleImages
        multiSelect={libraryMultiSelect}
        onMultiSelectChange={setLibraryMultiSelect}
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
          closeLightbox();
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
