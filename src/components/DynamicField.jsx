import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Folder, Images, Link, Loader2, Pencil, Scissors, Upload, X } from "lucide-react";
import { ImageEditorModal } from "./lazyModals";
import { MaskEditorModal } from "./MaskEditorModal";
import { defaultValue, getActiveSubInputs, isMenuSub, normalizeId } from "../lib/template";
import { menuChoiceOptions, parseMenuChoices, resolveMenuStoredValue } from "../../shared/menuChoices.js";
import { DYNAMIC_FIELD_TYPES, canonicalDynamicType, dynamicFieldChoices, isDynamicFieldType } from "../lib/dynamicTypes";
import { localizeRuntimeMessage, useI18n } from "../i18n/I18nContext";
import { clearPickedFolderFiles, registerPickedFolderFiles } from "../lib/folderFileCache.js";
import { isHttpImageUrl, readLocalFolderValue } from "../lib/localImageFolder.js";
import { isInputImagesCacheFresh } from "../lib/inputImagesCache.js";
import {
  deleteInputImage,
  fileToDataUrl,
  getFavoriteInputImages,
  loadInputImageFromUrl,
  makeInputImageValue,
  saveEditedInputImage,
  toggleInputImageFavorite,
  uploadInputImageDataUrl,
  uploadInputImageFile
} from "../lib/inputImageActions.js";
import { StaticFieldBlock } from "../features/fields/StaticFieldBlock.jsx";
import { renderBasicField } from "../features/fields/basicFieldRegistry.jsx";
import { areDynamicFieldPropsEqual } from "../features/fields/fieldMemo.js";
import { InputLibraryModal } from "./InputLibraryModal.jsx";
import { ImageLightboxOverlay } from "./ImageLightboxOverlay.jsx";
import { ImageMaskOverlay } from "./ImageMaskOverlay.jsx";

function readImageFieldValue(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function buildInputImageValue(item, libraryImage) {
  return makeInputImageValue(libraryImage, item.maskDataUrl ? { maskDataUrl: item.maskDataUrl } : {});
}

function resolveSelectedImages(rawValue, libraryReady, libraryImages) {
  const availableByName = new Map(libraryImages.map(image => [image.name, image]));
  return readImageFieldValue(rawValue).flatMap(item => {
    if (item?.startsWith?.("data:image")) return [item];
    if (item?.kind !== "input-image") return [];
    if (!libraryReady) return [];
    const libraryImage = availableByName.get(item.name);
    if (!libraryImage) return [];
    return [buildInputImageValue(item, libraryImage)];
  });
}

function pruneInvalidImageValue(rawValue, libraryImages) {
  const availableByName = new Map(libraryImages.map(image => [image.name, image]));
  const next = [];
  let changed = false;

  const single = Array.isArray(rawValue) ? null : rawValue;
  if (single?.kind === "local-folder" || single?.kind === "local-folder-picked") {
    return { next: single, changed: false };
  }

  for (const item of readImageFieldValue(rawValue)) {
    if (item?.startsWith?.("data:image")) {
      next.push(item);
      continue;
    }
    if (item?.kind === "local-folder" || item?.kind === "local-folder-picked") {
      return { next: item, changed: false };
    }
    if (item?.kind === "input-image") {
      const libraryImage = availableByName.get(item.name);
      if (!libraryImage) {
        changed = true;
        continue;
      }
      const refreshed = buildInputImageValue(item, libraryImage);
      if (JSON.stringify(refreshed) !== JSON.stringify(item)) changed = true;
      next.push(refreshed);
      continue;
    }
    changed = true;
  }

  return { next, changed };
}

const inputTypes = new Set([
  "string",
  "text",
  "image",
  "image_mask",
  "slider",
  "dropdown",
  "menu",
  ...DYNAMIC_FIELD_TYPES,
  "Checkpoints",
  "checkpoint",
  "Loras",
  "lora",
  "controlnet",
  "control_net",
  "upscale_model",
  "sampler",
  "scheduler",
  "unets",
  "diffusion_models",
  "style_model",
  "embedding",
  "clips",
  "clip_vision",
  "seed",
  "checkbox",
  "boolean",
  "number",
  "int",
  "float",
  "radio",
  "file",
  "colorpicker",
  "date",
  "json"
]);

export { StaticFieldBlock as StaticBlock };

const DynamicFieldInner = memo(function DynamicFieldInner({
  item,
  value,
  onChange,
  allValues = null,
  onValueChange = null,
  inputImages = [],
  onRefreshInputImages,
  onUpdateInputImages,
  discovery = null,
  discoveryLoading = false
}) {
  const { locale, t } = useI18n();
  const ui = item.ui || {};
  const label = ui.label || item.key;
  const description = ui.description || ui.help || "";
  const display = ui.display || ui.variant || ui.widget || "";
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [libraryTimeFilter, setLibraryTimeFilter] = useState("all");
  const [libraryFavoritesOnly, setLibraryFavoritesOnly] = useState(false);
  const [favoriteInputImages, setFavoriteInputImages] = useState(getFavoriteInputImages);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryMultiSelect, setLibraryMultiSelect] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageUrlLoading, setImageUrlLoading] = useState(false);
  const [imageUrlError, setImageUrlError] = useState("");
  const folderPickerRef = useRef(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageSizes, setImageSizes] = useState({});
  const [inputLibraryReady, setInputLibraryReady] = useState(false);
  const reorderDragRef = useRef(null);
  const supportsMultipleImages = ui.type === "image" || ui.type === "image_mask";
  const isImageField = ui.type === "image" || ui.type === "image_mask" || ui.type === "file";
  const folderValue = useMemo(() => readLocalFolderValue(value), [value]);
  const selectedImages = useMemo(
    () => (folderValue ? [] : resolveSelectedImages(value, inputLibraryReady, inputImages)),
    [folderValue, value, inputLibraryReady, inputImages]
  );
  const activeImage = selectedImages[Math.min(activeImageIndex, Math.max(0, selectedImages.length - 1))] || null;
  const selectedInputName = activeImage?.kind === "input-image" ? activeImage.name : "";
  const selectedImageUrl = activeImage?.startsWith?.("data:image")
    ? activeImage
    : activeImage?.kind === "input-image" ? activeImage.url : "";
  const maskDataUrl = activeImage?.kind === "input-image" ? (activeImage.maskDataUrl || "") : "";
  const isNumberType = ui.type === "number" || ui.type === "int" || ui.type === "float";
  const canResetNumber = isNumberType || ui.type === "slider";
  const resetValue = canResetNumber ? defaultValue(item) : undefined;
  const isAtResetValue = canResetNumber && Number(value) === Number(resetValue);
  const dynamicKind = canonicalDynamicType(ui.type);
  const isDynamicList = isDynamicFieldType(ui.type);
  const parseNumber = inputValue => {
    if (inputValue === "") return "";
    const next = Number(inputValue);
    return ui.type === "int" ? Math.trunc(next) : next;
  };

  const setInputImages = (images) => {
    if (onUpdateInputImages) {
      onUpdateInputImages(images);
    }
  };

  const refreshInputImages = useCallback(async (options = {}) => {
    if (onRefreshInputImages) {
      await onRefreshInputImages(options);
    }
  }, [onRefreshInputImages]);

  useEffect(() => {
    if (!isImageField) return undefined;
    let cancelled = false;
    const hasCached = inputImages.length > 0;
    if (hasCached) {
      setInputLibraryReady(true);
    } else {
      setInputLibraryReady(false);
    }
    (async () => {
      await refreshInputImages(hasCached && isInputImagesCacheFresh() ? { force: false } : {});
      if (!cancelled) setInputLibraryReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [inputImages.length, isImageField, refreshInputImages]);

  useEffect(() => {
    if (!inputLibraryReady || !isImageField) return;
    const { next, changed } = pruneInvalidImageValue(value, inputImages);
    if (!changed) return;
    if (next?.kind === "local-folder" || next?.kind === "local-folder-picked") {
      onChange(next);
      return;
    }
    const sanitized = Array.isArray(next) ? next.filter(Boolean) : [next].filter(Boolean);
    if (!sanitized.length) {
      onChange("");
      return;
    }
    if (supportsMultipleImages && sanitized.length > 1) {
      onChange(sanitized);
      return;
    }
    onChange(sanitized[0]);
  }, [inputLibraryReady, inputImages, value, isImageField, supportsMultipleImages, onChange]);

  useEffect(() => {
    if (!isDynamicList) return;
    const choices = dynamicFieldChoices(discovery, dynamicKind);
    if (!choices.length) return;
    const defaultChoice = choices.includes(ui.value) ? ui.value : choices[0];
    if (!choices.includes(value)) onChange(defaultChoice);
  }, [isDynamicList, dynamicKind, discovery, ui.value, value, onChange]);

  useEffect(() => {
    if (activeImageIndex >= selectedImages.length) {
      setActiveImageIndex(Math.max(0, selectedImages.length - 1));
    }
  }, [activeImageIndex, selectedImages.length]);

  function commitSelectedImages(images) {
    const next = images.filter(Boolean);
    if (!next.length) {
      onChange("");
    } else if (supportsMultipleImages && next.length > 1) {
      onChange(next);
    } else {
      onChange(next[0]);
    }
  }

  async function uploadPickedFile(file) {
    if (!file || (ui.type !== "file" && !file.type.startsWith("image/"))) return null;
    return uploadInputImageFile(file, { updateInputImages: setInputImages });
  }

  async function handlePickedFiles(files) {
    const pickedFiles = [...(files || [])];
    if (!pickedFiles.length) return;
    const acceptedFiles = supportsMultipleImages ? pickedFiles : pickedFiles.slice(0, 1);
    const uploaded = [];
    for (const file of acceptedFiles) {
      const image = await uploadPickedFile(file);
      if (image) uploaded.push(image);
    }
    if (!uploaded.length) return;
    const next = supportsMultipleImages ? [...selectedImages, ...uploaded] : uploaded;
    commitSelectedImages(next);
    setActiveImageIndex(Math.max(0, next.length - uploaded.length));
  }

  async function handlePickedImageUrl(url, filename = "output.png") {
    if (!url) return;
    const response = await fetch(url);
    if (!response.ok) return;
    const blob = await response.blob();
    const dataUrl = await fileToDataUrl(blob);
    try {
      const nextImage = await uploadInputImageDataUrl(dataUrl, {
        filename,
        updateInputImages: setInputImages
      });
      if (nextImage) {
        commitSelectedImages(supportsMultipleImages ? [...selectedImages, nextImage] : [nextImage]);
      }
    } catch {
      commitSelectedImages(supportsMultipleImages ? [...selectedImages, dataUrl] : [dataUrl]);
    }
  }

  async function loadImageFromUrl(sourceUrl, { clearInput = false } = {}) {
    if (!sourceUrl) return;
    setImageUrlLoading(true);
    setImageUrlError("");
    try {
      const nextImage = await loadInputImageFromUrl(sourceUrl, {
        updateInputImages: setInputImages,
        errorMessage: t("field.urlError")
      });
      commitSelectedImages(supportsMultipleImages ? [...selectedImages, nextImage] : [nextImage]);
      if (clearInput) setImageUrlInput("");
    } catch (error) {
      setImageUrlError(localizeRuntimeMessage(error.message, locale) || t("field.urlError"));
    } finally {
      setImageUrlLoading(false);
    }
  }

  async function handlePickLocalFolder(event) {
    const fileList = [...(event.target.files || [])];
    event.target.value = "";
    if (!fileList.length) return;
    setImageUrlLoading(true);
    setImageUrlError("");
    try {
      const previous = readLocalFolderValue(value);
      if (previous?.kind === "local-folder-picked" && previous.sessionId) {
        clearPickedFolderFiles(previous.sessionId);
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
      setImageUrlInput("");
    } catch (error) {
      setImageUrlError(localizeRuntimeMessage(error.message, locale) || t("field.folderError"));
    } finally {
      setImageUrlLoading(false);
    }
  }

  async function handleLoadImageFromUrl(event) {
    event.preventDefault();
    const source = imageUrlInput.trim();
    if (!source) return;
    if (!isHttpImageUrl(source)) {
      setImageUrlError(t("field.urlOnlyRequired"));
      return;
    }
    await loadImageFromUrl(source, { clearInput: true });
  }

  function firstDroppedUri(dataTransfer) {
    const uriList = dataTransfer.getData("text/uri-list");
    if (!uriList) return "";
    return uriList
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !line.startsWith("#")) || "";
  }

  async function handleImageDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
    const payload = event.dataTransfer.getData("application/x-comfy-output-image");
    if (payload) {
      try {
        const image = JSON.parse(payload);
        await handlePickedImageUrl(image.url, image.filename);
        return;
      } catch {
        // Fall through to file handling.
      }
    }
    const uri = firstDroppedUri(event.dataTransfer);
    if (uri) {
      const source = uri.split("\n")[0].trim();
      if (isHttpImageUrl(source)) {
        await loadImageFromUrl(source);
      }
      return;
    }
    await handlePickedFiles(event.dataTransfer.files);
  }

  async function openInputLibrary() {
    setLibraryMultiSelect(false);
    setLibraryOpen(true);
    setLibraryLoading(true);
    try {
      await refreshInputImages({ force: true });
    } finally {
      setLibraryLoading(false);
    }
  }

  function handleInputImageSelect(name) {
    if (!name) return;
    const image = inputImages.find(item => item.name === name);
    if (image) {
      const nextImage = makeInputImageValue(image);
      const alreadySelected = selectedImages.some(item => item?.kind === "input-image" && item.name === name);
      if (supportsMultipleImages && libraryMultiSelect) {
        const next = alreadySelected
          ? selectedImages.filter(item => !(item?.kind === "input-image" && item.name === name))
          : [...selectedImages, nextImage];
        commitSelectedImages(next);
      } else {
        commitSelectedImages([nextImage]);
        setLibraryOpen(false);
      }
    }
  }

  function removeSelectedImage(index) {
    const next = selectedImages.filter((_, imageIndex) => imageIndex !== index);
    commitSelectedImages(next);
    setActiveImageIndex(current => Math.min(current, Math.max(0, next.length - 1)));
  }

  function moveSelectedImage(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...selectedImages];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    commitSelectedImages(next);
    setActiveImageIndex(toIndex);
  }

  function openLightbox(image) {
    if (!image?.url) return;
    setLightboxImage(image);
    setLightboxOpen(true);
  }

  function toggleInputFavorite(name) {
    toggleInputImageFavorite(name, setFavoriteInputImages);
  }

  async function handleSaveEditedInput(dataUrl) {
    try {
      const nextImage = await saveEditedInputImage(dataUrl, {
        selectedName: selectedInputName,
        updateInputImages: setInputImages
      });
      if (nextImage) {
        const next = [...selectedImages];
        next[activeImageIndex] = nextImage;
        commitSelectedImages(next);
        return;
      }
    } catch {
      // Server unavailable — fall back to raw dataUrl
    }
    const next = [...selectedImages];
    next[activeImageIndex] = dataUrl;
    commitSelectedImages(next);
  }

  function handleSaveMask(nextMaskDataUrl) {
    if (activeImage?.kind !== "input-image") return;
    const next = [...selectedImages];
    if (nextMaskDataUrl) {
      next[activeImageIndex] = { ...activeImage, maskDataUrl: nextMaskDataUrl };
    } else {
      const rest = { ...activeImage };
      delete rest.maskDataUrl;
      next[activeImageIndex] = rest;
    }
    commitSelectedImages(next);
  }

  async function handleDeleteInputImage(image) {
    if (!image?.name) return;
    const images = await deleteInputImage(image, { updateInputImages: setInputImages });
    if (!images) return;
    const next = selectedImages.filter(item => !(item?.kind === "input-image" && item.name === image.name));
    if (next.length !== selectedImages.length) commitSelectedImages(next);
  }

  if (isMenuSub(item)) {
    const choices = ui.choices || [];
    const menuOpts = menuChoiceOptions(ui);
    const parsedChoices = parseMenuChoices(choices, menuOpts);
    const menuValue = resolveMenuStoredValue(value ?? defaultValue(item), choices, menuOpts);
    const activeSubs = getActiveSubInputs(item, menuValue);
    const valuesMap = allValues || {};
    const patchValue = onValueChange || ((key, next) => onChange(next));
    const selectedChoice = parsedChoices.find(choice => choice.value === menuValue);

    return (
      <section className="menuSubField">
        <label
          className={`field ${description ? "fieldWithTooltip" : ""}`}
          data-field-tooltip={description || undefined}
        >
          <span>{label}</span>
          <div className="fieldSelectWrap">
            <select value={menuValue} onChange={event => onChange(event.target.value)}>
              {parsedChoices.length === 0 ? <option value="">{t("field.noChoices")}</option> : null}
              {parsedChoices.map(choice => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
          </div>
        </label>
        {activeSubs.length ? (
          <div className="menuSubInputs">
            {activeSubs.map(subItem => (
              <DynamicField
                key={subItem.key}
                item={subItem}
                value={valuesMap[normalizeId(subItem.id)]}
                onChange={next => patchValue(normalizeId(subItem.id), next)}
                allValues={valuesMap}
                onValueChange={onValueChange}
                inputImages={inputImages}
                onRefreshInputImages={onRefreshInputImages}
                onUpdateInputImages={onUpdateInputImages}
                discovery={discovery}
                discoveryLoading={discoveryLoading}
              />
            ))}
          </div>
        ) : (
          <div className="menuSubEmpty">{t("field.noInputs", { name: selectedChoice?.label || menuValue })}</div>
        )}
      </section>
    );
  }
  if (!inputTypes.has(ui.type) && !isDynamicFieldType(ui.type)) return <StaticFieldBlock item={item} />;
  const basicField = renderBasicField({
    item,
    ui,
    label,
    description,
    display,
    value,
    onChange,
    discovery,
    discoveryLoading,
    parseNumber,
    resetValue,
    isAtResetValue,
    t
  });
  if (basicField) return basicField;
  if (ui.type === "image" || ui.type === "image_mask" || ui.type === "file") {
    const acceptsImageUrl = ui.type === "image" || ui.type === "image_mask";

    return (
      <>
        <label
          className={`field ${description ? "fieldWithTooltip" : ""}`}
          data-field-tooltip={description || undefined}
        >
          <span>{label}</span>
          <div
            className={`multiImageDropzone ${isDraggingFile ? "isDragging" : ""}`}
            onDragEnter={event => {
              event.preventDefault();
              if (!reorderDragRef.current) setIsDraggingFile(true);
            }}
            onDragOver={event => {
              event.preventDefault();
              event.dataTransfer.dropEffect = reorderDragRef.current ? "move" : "copy";
            }}
            onDragLeave={event => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingFile(false);
            }}
            onDrop={event => {
              if (event.dataTransfer.types.includes("application/x-apix-image-index")) return;
              handleImageDrop(event);
            }}
          >
            {folderValue ? (
              <div className="localFolderSelection">
                <div className="localFolderSelectionIcon">
                  {imageUrlLoading ? <Loader2 size={18} className="spin" /> : <Folder size={18} />}
                </div>
                <div className="localFolderSelectionBody">
                  <strong>
                    {imageUrlLoading
                      ? t("field.folderLoading")
                      : t("field.folderReady", { count: folderValue.imageCount || 0 })}
                  </strong>
                  <small>
                    {folderValue.kind === "local-folder-picked"
                      ? folderValue.folderName
                      : folderValue.folderPath}
                  </small>
                  <small>
                    {folderValue.kind === "local-folder-picked"
                      ? t("field.folderPickedHint")
                      : t("field.folderRunHint")}
                  </small>
                </div>
                <button
                  type="button"
                  className="localFolderSelectionRemove"
                  onClick={() => {
                    if (folderValue?.kind === "local-folder-picked" && folderValue.sessionId) {
                      clearPickedFolderFiles(folderValue.sessionId);
                    }
                    onChange("");
                  }}
                  title={t("field.removeFolder")}
                  aria-label={t("field.removeFolder")}
                >
                  <X size={14} />
                </button>
              </div>
            ) : selectedImages.length ? (
              <div className="multiImageGrid">
                {selectedImages.map((image, index) => {
                  const imageUrl = image?.startsWith?.("data:image")
                    ? image
                    : image?.kind === "input-image" ? image.url : "";
                  const imageName = image?.kind === "input-image" ? image.name : `${label} ${index + 1}`;
                  const imageHasMask = Boolean(image?.kind === "input-image" && image.maskDataUrl);
                  const imageSizeKey = imageUrl || imageName;
                  const imageSize = imageSizes[imageSizeKey];
                  return (
                    <article
                      key={`${imageName}-${index}`}
                      className={`multiImageItem ${index === activeImageIndex ? "isActive" : ""}`}
                      draggable={supportsMultipleImages && selectedImages.length > 1}
                      onDragStart={event => {
                        reorderDragRef.current = index;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-apix-image-index", String(index));
                      }}
                      onDragEnd={() => {
                        reorderDragRef.current = null;
                        setIsDraggingFile(false);
                      }}
                      onDragOver={event => {
                        if (!event.dataTransfer.types.includes("application/x-apix-image-index")) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={event => {
                        const transferredIndex = Number(event.dataTransfer.getData("application/x-apix-image-index"));
                        const fromIndex = Number.isInteger(transferredIndex)
                          ? transferredIndex
                          : reorderDragRef.current;
                        if (fromIndex == null) return;
                        event.preventDefault();
                        event.stopPropagation();
                        moveSelectedImage(fromIndex, index);
                        reorderDragRef.current = null;
                      }}
                      onClick={() => setActiveImageIndex(index)}
                    >
                      <img
                        src={imageUrl}
                        alt={imageName}
                        onLoad={event => {
                          const { naturalWidth, naturalHeight } = event.currentTarget;
                          if (!naturalWidth || !naturalHeight) return;
                          setImageSizes(prev => ({
                            ...prev,
                            [imageSizeKey]: { width: naturalWidth, height: naturalHeight }
                          }));
                        }}
                        onError={() => removeSelectedImage(index)}
                      />
                      {imageHasMask ? (
                        <ImageMaskOverlay maskDataUrl={image.maskDataUrl} fit="cover" />
                      ) : null}
                      <span className="multiImageOrder">{index + 1}</span>
                      {imageSize?.width && imageSize?.height ? (
                        <div className="imageSizeBadge">
                          {imageSize.width} x {imageSize.height}
                        </div>
                      ) : null}
                      <div className="multiImageActions">
                        <button
                          type="button"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setActiveImageIndex(index);
                            openLightbox({ name: imageName, url: imageUrl });
                          }}
                          title={t("field.openFull")}
                        >
                          <Eye size={13} />
                        </button>
                        {image?.kind === "input-image" ? (
                          <button
                            type="button"
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              setActiveImageIndex(index);
                              setMaskEditorOpen(true);
                            }}
                            title={imageHasMask ? t("field.editMask") : t("field.paintMask")}
                          >
                            <Scissors size={13} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setActiveImageIndex(index);
                            setEditorOpen(true);
                          }}
                          title="Image Editor"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            removeSelectedImage(index);
                          }}
                          title={t("field.removeUpload")}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}
                {supportsMultipleImages ? (
                  <div className="multiImageAdd">
                    <Upload size={18} />
                    <strong>{t("field.addImages")}</strong>
                    <small>{t("field.multiUploadHint")}</small>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={event => {
                        handlePickedFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="multiImageEmpty">
                <Upload size={18} />
                <strong>{isDraggingFile ? t("field.drop") : t("field.upload")}</strong>
                <small>{supportsMultipleImages ? t("field.multiUploadHint") : t("field.uploadHint")}</small>
                <input
                  type="file"
                  accept={ui.type === "file" ? undefined : "image/*"}
                  multiple={supportsMultipleImages}
                  onChange={event => {
                    handlePickedFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
            )}
          </div>
          {supportsMultipleImages && selectedImages.length > 1 ? (
            <small className="multiImageCount">{t("field.selectedImages", { count: selectedImages.length })}</small>
          ) : null}
          {acceptsImageUrl ? (
            <form className="imageUrlLoader" onSubmit={handleLoadImageFromUrl}>
              <div className="imageUrlInputRow">
                <span className="imageUrlInputIcon" aria-hidden="true">
                  <Link size={14} />
                </span>
                <input
                  type="text"
                  value={imageUrlInput}
                  placeholder={t("field.urlPlaceholder")}
                  onChange={event => {
                    setImageUrlInput(event.target.value);
                    if (imageUrlError) setImageUrlError("");
                  }}
                />
                <div className="imageUrlInputActions">
                  <button
                    type="submit"
                    className="imageUrlActionButton"
                    disabled={imageUrlLoading || !imageUrlInput.trim()}
                    title={t("field.loadUrl")}
                    aria-label={t("field.loadUrl")}
                  >
                    {imageUrlLoading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                  </button>
                  <button
                    type="button"
                    className="imageUrlActionButton inputFolderButton"
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      folderPickerRef.current?.click();
                    }}
                    title={t("field.pickLocalFolder")}
                    aria-label={t("field.pickLocalFolder")}
                    disabled={imageUrlLoading}
                  >
                    <Folder size={14} />
                  </button>
                  <button
                    type="button"
                    className="imageUrlActionButton imageUrlInputLibraryButton"
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      openInputLibrary();
                    }}
                    title={t("field.chooseInput")}
                    aria-label={t("field.chooseInput")}
                  >
                    <Images size={14} />
                    <span>Input</span>
                  </button>
                </div>
                <input
                  ref={folderPickerRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="srOnly"
                  webkitdirectory=""
                  directory=""
                  onChange={handlePickLocalFolder}
                />
              </div>
              {imageUrlError ? <small className="imageUrlStatus bad">{imageUrlError}</small> : null}
            </form>
          ) : null}
          {!acceptsImageUrl ? (
            <button
              type="button"
              className="inputLibraryButton"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                openInputLibrary();
              }}
            >
              <Images size={14} />
              <span>{t("field.chooseInput")}</span>
            </button>
          ) : null}
        </label>
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
          supportsMultipleImages={supportsMultipleImages}
          multiSelect={libraryMultiSelect}
          onMultiSelectChange={setLibraryMultiSelect}
          selectedImages={selectedImages}
          onSelectImage={handleInputImageSelect}
          onToggleFavorite={toggleInputFavorite}
          onViewImage={openLightbox}
          onDeleteImage={handleDeleteInputImage}
        />
        <ImageLightboxOverlay
          open={lightboxOpen}
          image={lightboxImage}
          title={label}
          onClose={() => setLightboxOpen(false)}
        />
        {editorOpen && selectedImageUrl ? createPortal(
          <Suspense fallback={null}>
            <ImageEditorModal
              source={selectedImageUrl}
              title={`${label} - Image Editor`}
              onClose={() => setEditorOpen(false)}
              onSave={handleSaveEditedInput}
            />
          </Suspense>,
          document.body
        ) : null}
        {maskEditorOpen && selectedImageUrl ? createPortal(
          <MaskEditorModal
            source={selectedImageUrl}
            initialMask={maskDataUrl}
            title={`${label} - ${t("mask.title")}`}
            onClose={() => setMaskEditorOpen(false)}
            onSave={handleSaveMask}
          />,
          document.body
        ) : null}
      </>
    );
  }
  return null;
}, areDynamicFieldPropsEqual);

const DynamicField = DynamicFieldInner;

export { DynamicField };
