import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, Filter, Images, Pencil, RefreshCcw, Scissors, Star, Trash2, Upload, X } from "lucide-react";
import { ImageEditorModal } from "./ImageEditorModal";
import { MaskEditorModal } from "./MaskEditorModal";
import { defaultValue } from "../lib/template";
import { DYNAMIC_FIELD_TYPES, canonicalDynamicType, dynamicFieldChoices, isDynamicFieldType } from "../lib/dynamicTypes";

const INPUT_FAVORITES_KEY = "comfyui-build:input-image-favorites:v1";

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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readStoredSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

function writeStoredSet(key, value) {
  localStorage.setItem(key, JSON.stringify([...value]));
}

function inferImageDate(image) {
  if (image?.createdAt) return new Date(image.createdAt);
  const match = /(\d{13})/.exec(image?.name || "");
  if (match) return new Date(Number(match[1]));
  return null;
}

function matchesTimeFilter(value, filter) {
  if (filter === "all") return true;
  const date = value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
  if (!date) return false;
  const now = new Date();
  if (filter === "day") {
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }
  if (filter === "month") {
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth();
  }
  if (filter === "year") {
    return date.getFullYear() === now.getFullYear();
  }
  return true;
}

export function StaticBlock({ item }) {
  const ui = item.ui || {};
  if (ui.type === "markdown") {
    return <div className="note">{ui.value}</div>;
  }
  if (ui.type === "html") {
    return <div className="note" dangerouslySetInnerHTML={{ __html: ui.value }} />;
  }
  return null;
}

export function DynamicField({ item, value, onChange, inputImages = [], onRefreshInputImages, onUpdateInputImages, discovery = null, discoveryLoading = false }) {
  const ui = item.ui || {};
  const label = ui.label || item.key;
  const description = ui.description || ui.help || "";
  const display = ui.display || ui.variant || ui.widget || "";
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [libraryTimeFilter, setLibraryTimeFilter] = useState("all");
  const [libraryFavoritesOnly, setLibraryFavoritesOnly] = useState(false);
  const [favoriteInputImages, setFavoriteInputImages] = useState(() => readStoredSet(INPUT_FAVORITES_KEY));
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [uploadImageSize, setUploadImageSize] = useState({ width: 0, height: 0 });
  const [lightboxScale, setLightboxScale] = useState(1);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const [isPanningLightbox, setIsPanningLightbox] = useState(false);
  const lightboxDragRef = useRef(null);
  const selectedInputName = value?.kind === "input-image" ? value.name : "";
  const selectedImageUrl = value?.startsWith?.("data:image") ? value : value?.kind === "input-image" ? value.url : "";
  const maskDataUrl = value?.kind === "input-image" ? (value.maskDataUrl || "") : "";
  const canMask = value?.kind === "input-image" && Boolean(selectedImageUrl);
  const isNumberType = ui.type === "number" || ui.type === "int" || ui.type === "float";
  const isSlider = ui.type === "slider" || (isNumberType && display === "slider");
  const canResetNumber = isNumberType || ui.type === "slider";
  const resetValue = canResetNumber ? defaultValue(item) : undefined;
  const isAtResetValue = canResetNumber && Number(value) === Number(resetValue);
  const dynamicKind = canonicalDynamicType(ui.type);
  const isDynamicList = isDynamicFieldType(ui.type);
  const isDropdown = ui.type === "dropdown" || ui.type === "menu" || isDynamicList;
  const isBoolean = ui.type === "checkbox" || ui.type === "boolean";
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

  const refreshInputImages = async () => {
    if (onRefreshInputImages) {
      await onRefreshInputImages();
    }
  };

  useEffect(() => {
    if (ui.type === "image" || ui.type === "image_mask" || ui.type === "file") {
      refreshInputImages();
    }
  }, [ui.type]);

  useEffect(() => {
    if (!isDynamicList) return;
    const choices = dynamicFieldChoices(discovery, dynamicKind);
    if (!choices.length) return;
    const defaultChoice = choices.includes(ui.value) ? ui.value : choices[0];
    if (!choices.includes(value)) onChange(defaultChoice);
  }, [isDynamicList, dynamicKind, discovery, ui.value, value]);

  useEffect(() => {
    setUploadImageSize({ width: 0, height: 0 });
  }, [selectedImageUrl]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    setLightboxScale(1);
    setLightboxPan({ x: 0, y: 0 });
    function handleKeyDown(event) {
      if (event.key === "Escape") setLightboxOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, lightboxImage?.url]);

  useEffect(() => {
    if (!libraryOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setLibraryOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [libraryOpen]);

  async function handlePickedFile(file) {
    if (!file) {
      onChange("");
      return;
    }
    if (ui.type !== "file" && !file.type.startsWith("image/")) return;
    const dataUrl = await fileToDataUrl(file);
    onChange(dataUrl);
    try {
      const response = await fetch("/api/input-images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, dataUrl })
      });
      if (response.ok) {
        const data = await response.json();
        setInputImages(data.images || []);
        if (data.image) {
          onChange({ kind: "input-image", ...data.image });
        }
      }
    } catch {
      // Direct upload still works even if the local input library is unavailable.
    }
  }

  async function handlePickedImageUrl(url, filename = "output.png") {
    if (!url) return;
    const response = await fetch(url);
    if (!response.ok) return;
    const blob = await response.blob();
    const dataUrl = await fileToDataUrl(blob);
    try {
      const uploadResponse = await fetch("/api/input-images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename, dataUrl })
      });
      if (uploadResponse.ok) {
        const data = await uploadResponse.json();
        setInputImages(data.images || []);
        if (data.image) onChange({ kind: "input-image", ...data.image });
      }
    } catch {
      onChange(dataUrl);
    }
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
      await handlePickedImageUrl(uri.split("\n")[0]);
      return;
    }
    await handlePickedFile(event.dataTransfer.files?.[0]);
  }

  function handleInputImageSelect(name) {
    if (!name) return;
    const image = inputImages.find(item => item.name === name);
    if (image) {
      onChange({ kind: "input-image", ...image });
      setLibraryOpen(false);
    }
  }

  function openLightbox(image) {
    if (!image?.url) return;
    setLightboxImage(image);
    setLightboxOpen(true);
  }

  function toggleInputFavorite(name) {
    if (!name) return;
    setFavoriteInputImages(current => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      writeStoredSet(INPUT_FAVORITES_KEY, next);
      return next;
    });
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
        setInputImages(data.images || []);
        if (data.image) {
          onChange({ kind: "input-image", ...data.image });
          return;
        }
      }
    } catch {
      // Server unavailable — fall back to raw dataUrl
    }
    onChange(dataUrl);
  }

  function handleSaveMask(nextMaskDataUrl) {
    if (value?.kind !== "input-image") return;
    if (nextMaskDataUrl) {
      onChange({ ...value, maskDataUrl: nextMaskDataUrl });
    } else {
      const { maskDataUrl: _omit, ...rest } = value;
      onChange(rest);
    }
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
    setInputImages(data.images || []);
    if (selectedInputName === image.name) onChange("");
  }

  function handleLightboxWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.18 : 0.18;
    setLightboxScale(current => {
      const next = Math.min(6, Math.max(1, Number((current + delta).toFixed(2))));
      if (next === 1) setLightboxPan({ x: 0, y: 0 });
      return next;
    });
  }

  function handleLightboxPointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    lightboxDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: lightboxPan.x,
      panY: lightboxPan.y
    };
    setIsPanningLightbox(true);
  }

  function handleLightboxPointerMove(event) {
    const drag = lightboxDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setLightboxPan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY
    });
  }

  function handleLightboxPointerUp(event) {
    const drag = lightboxDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    lightboxDragRef.current = null;
    setIsPanningLightbox(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!inputTypes.has(ui.type) && !isDynamicFieldType(ui.type)) return <StaticBlock item={item} />;
  if (ui.type === "seed") {
    const isRandomSeed = value === "random_seed" || value === "";
    const handleSeedChange = event => {
      const inputValue = event.target.value;
      if (inputValue === "") {
        onChange("random_seed");
        return;
      }
      const next = Math.max(ui.minimum ?? 0, Math.trunc(Number(inputValue)));
      onChange(Number.isFinite(next) ? next : "random_seed");
    };

    return (
      <label className="field compact">
        <span>{label}</span>
        <div className="inlineControl">
          <input
            type="number"
            min={ui.minimum ?? 0}
            max={ui.maximum}
            step={ui.step ?? 1}
            placeholder={isRandomSeed ? "Random mỗi lần run" : ""}
            value={isRandomSeed ? "" : value}
            onChange={handleSeedChange}
          />
          <button type="button" className="iconButton" onClick={() => onChange("random_seed")} title="Random seed mỗi lần run">
            <RefreshCcw size={16} />
          </button>
        </div>
      </label>
    );
  }
  if (ui.type === "text") {
    return (
      <label className="field">
        <span>{label}</span>
        <textarea
          rows={ui.lines || 3}
          placeholder={ui.placeholder || ""}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
  if (ui.type === "string") {
    const multiline = display === "multiline" || ui.multiline === true || Number(ui.lines || ui.rows || 1) > 1;
    return (
      <label className="field">
        <span>{label}</span>
        {multiline ? (
          <textarea
            rows={ui.lines || ui.rows || 3}
            placeholder={ui.placeholder || ""}
            value={value}
            onChange={event => onChange(event.target.value)}
          />
        ) : (
          <input
            type="text"
            placeholder={ui.placeholder || ""}
            value={value}
            onChange={event => onChange(event.target.value)}
          />
        )}
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
  if (ui.type === "image" || ui.type === "image_mask" || ui.type === "file") {
    const visibleInputImages = inputImages.filter(image => {
      if (libraryFavoritesOnly && !favoriteInputImages.has(image.name)) return false;
      return matchesTimeFilter(inferImageDate(image), libraryTimeFilter);
    });

    return (
      <>
        <label className="field">
          <span>{label}</span>
          {selectedImageUrl ? (
            <div
              className={`uploadFrame ${isDraggingFile ? "isDragging" : ""}`}
              onDragEnter={event => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragOver={event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setIsDraggingFile(true);
              }}
              onDragLeave={event => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingFile(false);
              }}
              onDrop={handleImageDrop}
            >
              <img
                className="uploadPreview"
                src={selectedImageUrl}
                alt=""
                onLoad={event => setUploadImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                })}
              />
              <div className="uploadActions">
                <button
                  type="button"
                  className="uploadView"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    openLightbox({ name: selectedInputName || label, url: selectedImageUrl });
                  }}
                  title="Mở ảnh đầy đủ"
                >
                  <Eye size={14} />
                </button>
                {canMask ? (
                  <button
                    type="button"
                    className="uploadView"
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMaskEditorOpen(true);
                    }}
                    title={maskDataUrl ? "Sửa mask (đã có mask)" : "Tô mask cho ảnh"}
                  >
                    <Scissors size={14} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="uploadView"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    setEditorOpen(true);
                  }}
                  title="Image Editor"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="uploadClear"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange("");
                  }}
                  title="Xóa ảnh đã tải lên"
                >
                  <X size={14} />
                </button>
              </div>
              {uploadImageSize.width && uploadImageSize.height ? (
                <div className="imageSizeBadge">
                  {uploadImageSize.width} x {uploadImageSize.height}
                </div>
              ) : null}
              {maskDataUrl ? (
                <div className="maskBadge" title="Ảnh đã có mask">
                  <Scissors size={11} /> Mask
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className={`dropzone ${isDraggingFile ? "isDragging" : ""}`}
              onDragEnter={event => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragOver={event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setIsDraggingFile(true);
              }}
              onDragLeave={event => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsDraggingFile(false);
                }
              }}
              onDrop={async event => {
                await handleImageDrop(event);
              }}
            >
              <Upload size={18} />
              <strong>{isDraggingFile ? "Thả tệp vào đây" : "Tải ảnh hoặc tệp lên"}</strong>
              <small>{ui.type === "image_mask" ? "Mask trong React bản này dùng ảnh chính; có thể mở rộng canvas mask sau." : "Kéo-thả hoặc bấm để chọn ảnh."}</small>
              <input
                type="file"
                accept={ui.type === "file" ? undefined : "image/*"}
                onDragEnter={event => {
                  event.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragOver={event => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setIsDraggingFile(true);
                }}
                onDragLeave={event => {
                  event.preventDefault();
                  if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
                    setIsDraggingFile(false);
                  }
                }}
                onDrop={handleImageDrop}
                onChange={event => handlePickedFile(event.target.files?.[0])}
              />
            </div>
          )}
          <button
            type="button"
            className="inputLibraryButton"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              refreshInputImages();
              setLibraryOpen(true);
            }}
          >
            <Images size={14} />
            <span>Chọn ảnh từ thư mục input</span>
          </button>
          {description ? <small className="fieldDescription">{description}</small> : null}
        </label>
        {libraryOpen ? createPortal(
          <div className="inputLibraryModal" role="presentation" onMouseDown={() => setLibraryOpen(false)}>
            <section className="inputLibraryPanel" role="dialog" aria-modal="true" aria-label="Thư viện ảnh input" onMouseDown={event => event.stopPropagation()}>
              <div className="inputLibraryHeader">
                <div>
                  <h3>Ảnh trong thư mục input</h3>
                  <p>{visibleInputImages.length} / {inputImages.length} ảnh</p>
                </div>
                <div className="inputLibraryHeaderTools">
                  <label className={`historyIconFilter ${libraryTimeFilter !== "all" ? "active" : ""}`} title="Lọc thời gian">
                    <Filter size={14} />
                    <select value={libraryTimeFilter} onChange={event => setLibraryTimeFilter(event.target.value)} aria-label="Lọc thời gian thư viện ảnh">
                      <option value="all">Tất cả thời gian</option>
                      <option value="day">Hôm nay</option>
                      <option value="month">Tháng này</option>
                      <option value="year">Năm này</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={`historyIconButton ${libraryFavoritesOnly ? "active" : ""}`}
                    onClick={() => setLibraryFavoritesOnly(current => !current)}
                    title="Chỉ xem favourite"
                  >
                    <Star size={14} />
                  </button>
                  <button type="button" className="imageLightboxClose inPanel" onClick={() => setLibraryOpen(false)} title="Đóng">
                    <X size={18} />
                  </button>
                </div>
              </div>
              {visibleInputImages.length > 0 ? (
                <div className="inputLibraryGrid">
                  {visibleInputImages.map(image => (
                    <article key={image.name} className={`inputLibraryItem ${selectedInputName === image.name ? "isSelected" : ""}`}>
                      <button type="button" className="inputLibraryThumb" onClick={() => handleInputImageSelect(image.name)} title="Chọn ảnh này">
                        <img src={image.url} alt={image.name} />
                      </button>
                      <div className="inputLibraryActions">
                        <button
                          type="button"
                          className={favoriteInputImages.has(image.name) ? "isFavorite" : ""}
                          onClick={() => toggleInputFavorite(image.name)}
                          title={favoriteInputImages.has(image.name) ? "Bỏ favourite" : "Favourite ảnh"}
                        >
                          <Star size={15} />
                        </button>
                        <button type="button" onClick={() => handleInputImageSelect(image.name)} title="Chọn">
                          <Check size={15} />
                        </button>
                        <button type="button" onClick={() => openLightbox(image)} title="Xem ảnh">
                          <Eye size={15} />
                        </button>
                        <button type="button" onClick={() => handleDeleteInputImage(image)} title="Xóa ảnh">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="inputLibraryEmpty">
                  <Images size={34} />
                  <strong>{inputImages.length ? "Không có ảnh khớp bộ lọc" : "Chưa có ảnh trong thư mục input"}</strong>
                </div>
              )}
            </section>
          </div>,
          document.body
        ) : null}
        {lightboxOpen && lightboxImage?.url ? createPortal(
          <div className="imageLightbox" role="presentation" onClick={event => {
            if (event.target === event.currentTarget) setLightboxOpen(false);
          }}>
            <div
              className={`imageLightboxFrame ${isPanningLightbox ? "isPanning" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              onClick={event => {
                if (event.target === event.currentTarget) setLightboxOpen(false);
              }}
              onWheel={handleLightboxWheel}
            >
              <button type="button" className="imageLightboxClose" onClick={() => setLightboxOpen(false)} title="Đóng">
                <X size={18} />
              </button>
              <div
                className="imageLightboxStage"
                style={{
                  "--lightbox-scale": lightboxScale,
                  "--lightbox-pan-x": `${lightboxPan.x}px`,
                  "--lightbox-pan-y": `${lightboxPan.y}px`
                }}
                onPointerDown={handleLightboxPointerDown}
                onPointerMove={handleLightboxPointerMove}
                onPointerUp={handleLightboxPointerUp}
                onPointerCancel={handleLightboxPointerUp}
              >
                <img src={lightboxImage.url} alt={lightboxImage.name || label} draggable="false" />
              </div>
            </div>
          </div>,
          document.body
        ) : null}
        {editorOpen && selectedImageUrl ? createPortal(
          <ImageEditorModal
            source={selectedImageUrl}
            title={`${label} - Image Editor`}
            onClose={() => setEditorOpen(false)}
            onSave={handleSaveEditedInput}
          />,
          document.body
        ) : null}
        {maskEditorOpen && selectedImageUrl ? createPortal(
          <MaskEditorModal
            source={selectedImageUrl}
            initialMask={maskDataUrl}
            title={`${label} - Tô Mask`}
            onClose={() => setMaskEditorOpen(false)}
            onSave={handleSaveMask}
          />,
          document.body
        ) : null}
      </>
    );
  }
  if (isSlider) {
    return (
      <label className="field">
        <span className="fieldValueHeader">
          <span>{label}</span>
          <span className="fieldValueTools">
            <b>{value}</b>
            <button
              type="button"
              className="fieldResetButton"
              onClick={event => {
                event.preventDefault();
                onChange(resetValue);
              }}
              disabled={isAtResetValue}
              title="Reset về mặc định"
            >
              <RefreshCcw size={13} />
            </button>
          </span>
        </span>
        <input
          type="range"
          min={ui.minimum}
          max={ui.maximum}
          step={ui.step || 1}
          value={value}
          onChange={event => onChange(parseNumber(event.target.value))}
        />
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
  if (isDropdown) {
    const choices = isDynamicList ? dynamicFieldChoices(discovery, dynamicKind) : ui.choices || [];
    return (
      <label className="field">
        <span>{label}</span>
        <select value={isDynamicList ? (choices.includes(value) ? value : "") : value} onChange={event => onChange(event.target.value)} disabled={isDynamicList && discoveryLoading}>
          {isDynamicList && choices.length === 0 ? (
            <option value="">{discoveryLoading ? "Đang quét server..." : "Không tìm thấy dữ liệu"}</option>
          ) : null}
          {choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
        </select>
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
  if (ui.type === "radio") {
    return (
      <fieldset className="field radioGroup">
        <legend>{label}</legend>
        {(ui.choices || []).map(choice => (
          <label key={choice}>
            <input type="radio" checked={value === choice} onChange={() => onChange(choice)} />
            {choice}
          </label>
        ))}
        {description ? <small className="fieldDescription">{description}</small> : null}
      </fieldset>
    );
  }
  if (isBoolean) {
    return (
      <fieldset className="field booleanField">
        <legend>{label}</legend>
        <div className="booleanToggle">
          <button type="button" className={value === true ? "active" : ""} onClick={() => onChange(true)}>True</button>
          <button type="button" className={value === false ? "active" : ""} onClick={() => onChange(false)}>False</button>
        </div>
        {description ? <small className="fieldDescription">{description}</small> : null}
      </fieldset>
    );
  }
  if (isNumberType) {
    return (
      <label className="field compact">
        <span>{label}</span>
        <div className="inlineControl">
          <input
            type="number"
            min={ui.minimum}
            max={ui.maximum}
            step={ui.step || (ui.type === "float" ? 0.1 : 1)}
            value={value}
            onChange={event => onChange(parseNumber(event.target.value))}
          />
          <button
            type="button"
            className="iconButton"
            onClick={() => onChange(resetValue)}
            disabled={isAtResetValue}
            title="Reset về mặc định"
          >
            <RefreshCcw size={16} />
          </button>
        </div>
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
  if (ui.type === "colorpicker") {
    return (
      <label className="field compact colorField">
        <span>{label}</span>
        <input type="color" value={value || "#10b981"} onChange={event => onChange(event.target.value)} />
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
  if (ui.type === "date") {
    return (
      <label className="field compact">
        <span>{label}</span>
        <input type="date" value={value || ""} onChange={event => onChange(event.target.value)} />
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
  if (ui.type === "json") {
    return (
      <label className="field">
        <span>{label}</span>
        <textarea rows={5} value={value} onChange={event => onChange(event.target.value)} />
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
}
