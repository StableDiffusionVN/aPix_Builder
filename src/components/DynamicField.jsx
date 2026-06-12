import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, Filter, Folder, Images, Link, ListChecks, Loader2, Pencil, RefreshCcw, Scissors, Star, Trash2, Upload, X } from "lucide-react";
import { ImageEditorModal } from "./lazyModals";
import { MaskEditorModal } from "./MaskEditorModal";
import { defaultValue, getActiveSubInputs, isMenuSub, normalizeId } from "../lib/template";
import { menuChoiceOptions, parseMenuChoices, resolveMenuStoredValue } from "../lib/menuChoices";
import { DYNAMIC_FIELD_TYPES, canonicalDynamicType, dynamicFieldChoices, isDynamicFieldType } from "../lib/dynamicTypes";
import { EditorRange } from "./ImageAdjustmentControls";
import { localizeRuntimeMessage, useI18n } from "../i18n/I18nContext";

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

function safeLinkHref(href = "") {
  const trimmed = String(href).trim();
  return /^(https?:|mailto:|tel:)/i.test(trimmed) ? trimmed : "";
}

function renderInlineMarkdown(text, keyPrefix) {
  const nodes = [];
  const pattern = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(?<!\*)\*([^*\s][^*]*?)\*(?!\*)/g;
  let lastIndex = 0;
  let match;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      nodes.push(<code key={`${keyPrefix}-code-${index}`}>{match[2]}</code>);
    } else if (match[4]) {
      nodes.push(<strong key={`${keyPrefix}-strong-${index}`}>{match[4]}</strong>);
    } else if (match[6]) {
      const href = safeLinkHref(match[7]);
      nodes.push(href
        ? <a key={`${keyPrefix}-link-${index}`} href={href} target="_blank" rel="noreferrer">{match[6]}</a>
        : <span key={`${keyPrefix}-link-${index}`}>{match[6]}</span>);
    } else if (match[8]) {
      nodes.push(<em key={`${keyPrefix}-em-${index}`}>{match[8]}</em>);
    }
    lastIndex = pattern.lastIndex;
    index += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : text;
}

function renderMarkdown(markdown = "") {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^```/.test(line.trim())) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`pre-${index}`}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = `h${Math.min(4, heading[1].length + 2)}`;
      blocks.push(<Tag key={`heading-${index}`}>{renderInlineMarkdown(heading[2], `heading-${index}`)}</Tag>);
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        const item = lines[index].replace(/^\s*[-*]\s+/, "");
        items.push(<li key={`li-${index}`}>{renderInlineMarkdown(item, `li-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items}</ul>);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInlineMarkdown(quote.join(" "), `quote-${index}`)}</blockquote>);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index]) && !/^\s*[-*]\s+/.test(lines[index]) && !/^```/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(paragraph.join(" "), `p-${index}`)}</p>);
  }
  return blocks;
}

export function StaticBlock({ item }) {
  const ui = item.ui || {};
  if (ui.type === "note" || ui.type === "markdown") {
    return (
      <section className="workflowNote">
        <div className="workflowNoteContent">{renderMarkdown(ui.markdown ?? ui.value ?? "")}</div>
      </section>
    );
  }
  if (ui.type === "html") {
    return <div className="note" dangerouslySetInnerHTML={{ __html: ui.value }} />;
  }
  return null;
}

export function DynamicField({
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
  const [favoriteInputImages, setFavoriteInputImages] = useState(() => readStoredSet(INPUT_FAVORITES_KEY));
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryMultiSelect, setLibraryMultiSelect] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageUrlLoading, setImageUrlLoading] = useState(false);
  const [imageUrlError, setImageUrlError] = useState("");
  const [lightboxScale, setLightboxScale] = useState(1);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const [isPanningLightbox, setIsPanningLightbox] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const lightboxDragRef = useRef(null);
  const reorderDragRef = useRef(null);
  const supportsMultipleImages = ui.type === "image" || ui.type === "image_mask";
  const selectedImages = (Array.isArray(value) ? value : value ? [value] : [])
    .filter(image => image?.startsWith?.("data:image") || image?.kind === "input-image");
  const activeImage = selectedImages[Math.min(activeImageIndex, Math.max(0, selectedImages.length - 1))] || null;
  const selectedInputName = activeImage?.kind === "input-image" ? activeImage.name : "";
  const selectedImageUrl = activeImage?.startsWith?.("data:image")
    ? activeImage
    : activeImage?.kind === "input-image" ? activeImage.url : "";
  const maskDataUrl = activeImage?.kind === "input-image" ? (activeImage.maskDataUrl || "") : "";
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
    if (activeImageIndex >= selectedImages.length) {
      setActiveImageIndex(Math.max(0, selectedImages.length - 1));
    }
  }, [activeImageIndex, selectedImages.length]);

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
    const dataUrl = await fileToDataUrl(file);
    try {
      const response = await fetch("/api/input-images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, dataUrl })
      });
      if (response.ok) {
        const data = await response.json();
        setInputImages(data.images || []);
        if (data.image) return { kind: "input-image", ...data.image };
      }
    } catch {
      // Direct upload still works even if the local input library is unavailable.
    }
    return dataUrl;
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
      const uploadResponse = await fetch("/api/input-images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename, dataUrl })
      });
      if (uploadResponse.ok) {
        const data = await uploadResponse.json();
        setInputImages(data.images || []);
        if (data.image) {
          const nextImage = { kind: "input-image", ...data.image };
          commitSelectedImages(supportsMultipleImages ? [...selectedImages, nextImage] : [nextImage]);
        }
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
      const response = await fetch("/api/input-images/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: sourceUrl })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(localizeRuntimeMessage(data.error, locale) || t("field.urlError"));
      setInputImages(data.images || []);
      if (data.image) {
        const nextImage = { kind: "input-image", ...data.image };
        commitSelectedImages(supportsMultipleImages ? [...selectedImages, nextImage] : [nextImage]);
        if (clearInput) setImageUrlInput("");
      }
    } catch (error) {
      setImageUrlError(localizeRuntimeMessage(error.message, locale) || t("field.urlError"));
    } finally {
      setImageUrlLoading(false);
    }
  }

  async function handleLoadImageFromUrl(event) {
    event.preventDefault();
    await loadImageFromUrl(imageUrlInput.trim(), { clearInput: true });
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
      await loadImageFromUrl(uri.split("\n")[0]);
      return;
    }
    await handlePickedFiles(event.dataTransfer.files);
  }

  function openInputLibrary() {
    refreshInputImages();
    setLibraryMultiSelect(false);
    setLibraryOpen(true);
  }

  function handleInputImageSelect(name) {
    if (!name) return;
    const image = inputImages.find(item => item.name === name);
    if (image) {
      const nextImage = { kind: "input-image", ...image };
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
          const next = [...selectedImages];
          next[activeImageIndex] = { kind: "input-image", ...data.image };
          commitSelectedImages(next);
          return;
        }
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
      const { maskDataUrl: _omit, ...rest } = activeImage;
      next[activeImageIndex] = rest;
    }
    commitSelectedImages(next);
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
    const next = selectedImages.filter(item => !(item?.kind === "input-image" && item.name === image.name));
    if (next.length !== selectedImages.length) commitSelectedImages(next);
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
        <label className="field">
          <span>{label}</span>
          <div className="fieldSelectWrap">
            <select value={menuValue} onChange={event => onChange(event.target.value)}>
              {parsedChoices.length === 0 ? <option value="">{t("field.noChoices")}</option> : null}
              {parsedChoices.map(choice => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
          </div>
          {description ? <small className="fieldDescription">{description}</small> : null}
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
            placeholder={isRandomSeed ? t("field.randomSeed") : ""}
            value={isRandomSeed ? "" : value}
            onChange={handleSeedChange}
          />
          <button type="button" className="fieldResetButton" onClick={() => onChange("random_seed")} title={t("field.randomSeed")}>
            <RefreshCcw size={13} />
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
    const acceptsImageUrl = ui.type === "image" || ui.type === "image_mask";
    const visibleInputImages = inputImages.filter(image => {
      if (libraryFavoritesOnly && !favoriteInputImages.has(image.name)) return false;
      return matchesTimeFilter(inferImageDate(image), libraryTimeFilter);
    });

    return (
      <>
        <label className="field">
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
            {selectedImages.length ? (
              <div className="multiImageGrid">
                {selectedImages.map((image, index) => {
                  const imageUrl = image?.startsWith?.("data:image")
                    ? image
                    : image?.kind === "input-image" ? image.url : "";
                  const imageName = image?.kind === "input-image" ? image.name : `${label} ${index + 1}`;
                  const imageHasMask = Boolean(image?.kind === "input-image" && image.maskDataUrl);
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
                      <img src={imageUrl} alt={imageName} />
                      <span className="multiImageOrder">{index + 1}</span>
                      {imageHasMask ? (
                        <span className="multiImageMask" title={t("field.hasMask")}><Scissors size={11} /></span>
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
                <Link size={14} />
                <input
                  type="url"
                  value={imageUrlInput}
                  placeholder={t("field.urlPlaceholder")}
                  onChange={event => {
                    setImageUrlInput(event.target.value);
                    if (imageUrlError) setImageUrlError("");
                  }}
                />
                <button type="submit" disabled={imageUrlLoading || !imageUrlInput.trim()}>
                  {imageUrlLoading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                  <span>{t("field.loadUrl")}</span>
                </button>
                <button
                  type="button"
                  className="inputFolderButton"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    openInputLibrary();
                  }}
                  title={t("field.chooseInput")}
                >
                  <Folder size={14} />
                  <span>Input</span>
                </button>
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
          {description ? <small className="fieldDescription">{description}</small> : null}
        </label>
        {libraryOpen ? createPortal(
          <div className="inputLibraryModal" role="presentation" onMouseDown={() => setLibraryOpen(false)}>
            <section className="inputLibraryPanel" role="dialog" aria-modal="true" aria-label={t("field.inputLibrary")} onMouseDown={event => event.stopPropagation()}>
              <div className="inputLibraryHeader">
                <div>
                  <h3>{t("field.inputLibrary")}</h3>
                  <p>{t("field.imageCount", { visible: visibleInputImages.length, total: inputImages.length })}</p>
                </div>
                <div className="inputLibraryHeaderTools">
                  <label className={`historyIconFilter ${libraryTimeFilter !== "all" ? "active" : ""}`} title={t("history.filterTime")}>
                    <Filter size={14} />
                    <select value={libraryTimeFilter} onChange={event => setLibraryTimeFilter(event.target.value)} aria-label={t("history.filterTime")}>
                      <option value="all">{t("history.allTime")}</option>
                      <option value="day">{t("history.today")}</option>
                      <option value="month">{t("history.month")}</option>
                      <option value="year">{t("history.year")}</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={`historyIconButton ${libraryFavoritesOnly ? "active" : ""}`}
                    onClick={() => setLibraryFavoritesOnly(current => !current)}
                    title={t("history.favoritesOnly")}
                  >
                    <Star size={14} />
                  </button>
                  {supportsMultipleImages ? (
                    <button
                      type="button"
                      className={`historyIconButton ${libraryMultiSelect ? "active" : ""}`}
                      onClick={() => setLibraryMultiSelect(current => !current)}
                      title={libraryMultiSelect ? t("field.multiSelectOff") : t("field.multiSelectOn")}
                      aria-pressed={libraryMultiSelect}
                    >
                      <ListChecks size={14} />
                    </button>
                  ) : null}
                  <button type="button" className="imageLightboxClose inPanel" onClick={() => setLibraryOpen(false)} title={t("common.close")}>
                    <X size={18} />
                  </button>
                </div>
              </div>
              {visibleInputImages.length > 0 ? (
                <div className="inputLibraryGrid">
                  {visibleInputImages.map(image => {
                    const isLibrarySelected = selectedImages.some(
                      item => item?.kind === "input-image" && item.name === image.name
                    );
                    return (
                    <article
                      key={image.name}
                      className={`inputLibraryItem${
                        isLibrarySelected ? " isSelected" : ""
                      }${libraryMultiSelect ? " isMultiSelectMode" : ""}`}
                    >
                      <button
                        type="button"
                        className="inputLibraryThumb"
                        onClick={() => handleInputImageSelect(image.name)}
                        title={libraryMultiSelect ? t("field.toggleImage") : t("field.chooseImage")}
                      >
                        <img src={image.url} alt={image.name} />
                      </button>
                      {libraryMultiSelect && isLibrarySelected ? (
                        <span className="inputLibrarySelectedBadge" aria-hidden="true">
                          <Check size={14} strokeWidth={2.8} />
                        </span>
                      ) : null}
                      <div className="inputLibraryActions">
                        <button
                          type="button"
                          className={favoriteInputImages.has(image.name) ? "isFavorite" : ""}
                          onClick={() => toggleInputFavorite(image.name)}
                          title={favoriteInputImages.has(image.name) ? t("history.unfavorite") : t("history.favorite")}
                        >
                          <Star size={15} />
                        </button>
                        <button type="button" onClick={() => handleInputImageSelect(image.name)} title={t("field.select")}>
                          <Check size={15} />
                        </button>
                        <button type="button" onClick={() => openLightbox(image)} title={t("field.viewImage")}>
                          <Eye size={15} />
                        </button>
                        <button type="button" onClick={() => handleDeleteInputImage(image)} title={t("field.deleteImage")}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                    );
                  })}
                </div>
              ) : (
                <div className="inputLibraryEmpty">
                  <Images size={34} />
                  <strong>{inputImages.length ? t("field.noMatchingImages") : t("field.noInputImages")}</strong>
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
              <button type="button" className="imageLightboxClose" onClick={() => setLightboxOpen(false)} title={t("common.close")}>
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
  if (isSlider) {
    return (
      <div className="field">
        <EditorRange
          label={label}
          value={value}
          min={ui.minimum}
          max={ui.maximum}
          step={ui.step || 1}
          resetValue={resetValue}
          onChange={next => onChange(parseNumber(next))}
        />
        {description ? <small className="fieldDescription">{description}</small> : null}
      </div>
    );
  }
  if (isDropdown) {
    const rawChoices = isDynamicList ? dynamicFieldChoices(discovery, dynamicKind) : ui.choices || [];
    const menuOpts = menuChoiceOptions(ui);
    const parsedChoices = isDynamicList
      ? rawChoices.map(choice => ({ label: choice, value: choice, raw: choice }))
      : parseMenuChoices(rawChoices, menuOpts);
    const selectValue = isDynamicList
      ? (rawChoices.includes(value) ? value : "")
      : resolveMenuStoredValue(value, rawChoices, menuOpts);
    return (
      <label className="field">
        <span>{label}</span>
        <div className="fieldSelectWrap">
          <select value={selectValue} onChange={event => onChange(event.target.value)} disabled={isDynamicList && discoveryLoading}>
            {isDynamicList && rawChoices.length === 0 ? (
              <option value="">{discoveryLoading ? t("field.scanning") : t("field.noData")}</option>
            ) : null}
            {parsedChoices.map(choice => (
              <option key={choice.value} value={choice.value}>{choice.label}</option>
            ))}
          </select>
        </div>
        {description ? <small className="fieldDescription">{description}</small> : null}
      </label>
    );
  }
  if (ui.type === "radio") {
    const menuOpts = menuChoiceOptions(ui);
    const parsedChoices = parseMenuChoices(ui.choices || [], menuOpts);
    const radioValue = resolveMenuStoredValue(value, ui.choices, menuOpts);
    return (
      <fieldset className="field radioGroup">
        <legend>{label}</legend>
        {parsedChoices.map(choice => (
          <label key={choice.value}>
            <input type="radio" checked={radioValue === choice.value} onChange={() => onChange(choice.value)} />
            {choice.label}
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
            className="fieldResetButton"
            onClick={() => onChange(resetValue)}
            disabled={isAtResetValue}
            title={t("field.reset")}
          >
            <RefreshCcw size={13} />
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
