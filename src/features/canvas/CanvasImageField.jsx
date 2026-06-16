import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Images, Link, Loader2, Upload, X } from "lucide-react";
import { isHttpImageUrl } from "../../lib/localImageFolder.js";
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
  const { inputImages, refreshInputImages, updateInputImages } = useCanvasActions();
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [previewSize, setPreviewSize] = useState(null);

  const preview = previewBroken ? "" : imageDisplayUrl(value);

  useEffect(() => {
    setPreviewBroken(false);
    setPreviewSize(null);
  }, [value]);

  useEffect(() => {
    refreshInputImages?.();
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
      setUrlError("URL phải bắt đầu bằng http:// hoặc https://");
      return;
    }
    setUrlLoading(true);
    setUrlError("");
    try {
      const next = await loadUrlToInputLibrary(source, updateInputImages);
      await commitImage(next);
      setUrlInput("");
    } catch (error) {
      setUrlError(error.message || "Không tải được URL");
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
        setUrlError(error.message || "Không tải được URL");
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
    commitImage({ kind: "input-image", ...image });
    setLibraryOpen(false);
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
              <span
                className="canvasImageSizeBadge"
                title={`${label}: ${previewSize.width} x ${previewSize.height}`}
              >
                {previewSize.width} x {previewSize.height}
              </span>
            ) : null}
            <button type="button" className="canvasImageClear" onClick={() => commitImage("")} title="Xóa">
              <X size={11} />
            </button>
          </div>
        ) : (
          <button type="button" className="canvasUploadBtn" onClick={() => fileRef.current?.click()}>
            <Upload size={12} /> {dragging ? "Thả ảnh vào đây" : "Kéo thả hoặc tải ảnh"}
          </button>
        )}

        <form className="canvasImageUrlForm" onSubmit={handleUrlSubmit}>
          <span className="canvasImageUrlIcon" aria-hidden="true"><Link size={12} /></span>
          <input
            type="text"
            className="canvasImageUrlInput"
            value={urlInput}
            placeholder="URL ảnh (http…)"
            onChange={event => {
              setUrlInput(event.target.value);
              if (urlError) setUrlError("");
            }}
          />
          <button type="submit" className="canvasImageUrlBtn" disabled={urlLoading || !urlInput.trim()} title="Tải từ URL">
            {urlLoading ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
          </button>
          <button
            type="button"
            className="canvasImageUrlBtn library"
            onClick={() => { refreshInputImages?.(); setLibraryOpen(true); }}
            title="Chọn từ Input"
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

      {libraryOpen ? createPortal(
        <div className="inputLibraryModal" role="presentation" onMouseDown={() => setLibraryOpen(false)}>
          <section
            className="inputLibraryPanel"
            role="dialog"
            aria-modal="true"
            aria-label="Thư viện Input"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="inputLibraryHeader">
              <div>
                <h3>Thư viện Input</h3>
                <p>{inputImages.length} ảnh</p>
              </div>
              <button type="button" className="imageLightboxClose inPanel" onClick={() => setLibraryOpen(false)} title="Đóng">
                <X size={18} />
              </button>
            </div>
            {inputImages.length ? (
              <div className="inputLibraryGrid">
                {inputImages.map(image => (
                  <article key={image.name} className="inputLibraryItem">
                    <button
                      type="button"
                      className="inputLibraryThumb"
                      onClick={() => selectInputImage(image.name)}
                      title={image.name}
                    >
                      <img src={image.url} alt={image.name} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="canvasImageLibraryEmpty">Chưa có ảnh trong Input. Tải ảnh lên hoặc chạy workflow trước.</p>
            )}
          </section>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
