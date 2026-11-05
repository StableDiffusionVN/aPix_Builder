import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext.jsx";
import { clampCropRect, cropInpaintSource, cropInpaintUrl } from "../../shared/cropInpaint.js";
import { loadCropImage, saveCropInpaint } from "../lib/cropInpaint.js";
import "../styles/cropInpaint.css";

export function CropInpaintModal({ value, onClose, onSave, updateInputImages }) {
  const { locale } = useI18n();
  const vi = locale === "vi";
  const titleId = useId();
  const shadeId = useId().replace(/:/g, "");
  const svgRef = useRef(null);
  const closeRef = useRef(null);
  const dragRef = useRef(null);
  const [size, setSize] = useState(null);
  const [rect, setRect] = useState(null);
  const [blend, setBlend] = useState(value?.cropInpaint?.blendPixels ?? 16);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const source = cropInpaintUrl(value);

  useEffect(() => {
    let cancelled = false;
    loadCropImage(source).then(image => {
      if (cancelled) return;
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      setSize({ width, height });
      setRect(clampCropRect(value?.cropInpaint?.rect || {
        x: width / 4, y: height / 4, width: width / 2, height: height / 2
      }, width, height));
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [source, value]);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, []);

  function point(event) {
    const bounds = svgRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(size.width, (event.clientX - bounds.left) * size.width / bounds.width)),
      y: Math.max(0, Math.min(size.height, (event.clientY - bounds.top) * size.height / bounds.height))
    };
  }

  function startDrag(event) {
    if (busy || !rect || event.button !== 0) return;
    event.preventDefault();
    svgRef.current.setPointerCapture(event.pointerId);
    const mode = event.target.dataset.mode || "draw";
    dragRef.current = { mode, start: point(event), rect };
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = point(event);
    let next;
    if (drag.mode === "move") {
      next = { ...drag.rect,
        x: Math.max(0, Math.min(size.width - drag.rect.width, drag.rect.x + p.x - drag.start.x)),
        y: Math.max(0, Math.min(size.height - drag.rect.height, drag.rect.y + p.y - drag.start.y)) };
    } else {
      const anchor = drag.mode === "resize" ? { x: drag.rect.x, y: drag.rect.y } : drag.start;
      next = { x: Math.min(anchor.x, p.x), y: Math.min(anchor.y, p.y),
        width: Math.max(1, Math.abs(p.x - anchor.x)), height: Math.max(1, Math.abs(p.y - anchor.y)) };
    }
    setRect(clampCropRect(next, size.width, size.height));
  }

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const next = await saveCropInpaint(value, rect, blend, updateInputImages);
      await onSave(next);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalBackdrop cropInpaintBackdrop" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="cropInpaintModal" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === "Escape" && !busy) onClose();
          if (event.key === "Tab") {
            const elements = [...event.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
            const first = elements[0];
            const last = elements.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <header className="modalHeader">
          <div><h2 id={titleId}>Crop Inpaint</h2><p>{vi
            ? "Kéo để chọn vùng, kéo bên trong để di chuyển. Kết quả sẽ được ghép về ảnh gốc."
            : "Drag to select a region or move the selection. Results are stitched back into the original."}</p></div>
          <button type="button" className="modalClose" ref={closeRef} disabled={busy} onClick={onClose} aria-label={vi ? "Đóng" : "Close"}><X size={18} /></button>
        </header>
        <div className="cropInpaintStage">
          {size && rect ? (
            <svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`}
              style={{ aspectRatio: `${size.width} / ${size.height}`, width: `min(100%, ${57 * size.width / size.height}dvh)` }}
              aria-label={vi ? "Vùng crop inpaint" : "Crop inpaint region"}
              onPointerDown={startDrag} onPointerMove={moveDrag}
              onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
              <defs><mask id={shadeId}><rect width={size.width} height={size.height} fill="white" />
                <rect {...rect} fill="black" /></mask></defs>
              <image href={source} width={size.width} height={size.height} />
              <rect width={size.width} height={size.height} fill="rgba(0,0,0,.6)" mask={`url(#${shadeId})`} />
              <rect {...rect} fill="transparent" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" data-mode="move" className="cropInpaintSelection" />
              <circle cx={rect.x + rect.width} cy={rect.y + rect.height} r={Math.max(size.width, size.height) / 65}
                fill="white" stroke="#222" strokeWidth="1" vectorEffect="non-scaling-stroke" data-mode="resize" className="cropInpaintResize" />
            </svg>
          ) : !error ? <Loader2 className="spin" /> : null}
        </div>
        {rect && size ? <div className="cropInpaintControls">
          {[["x", "X"], ["y", "Y"], ["width", vi ? "Rộng" : "Width"], ["height", vi ? "Cao" : "Height"]].map(([key, label]) => (
            <label key={key}>{label}<input type="number" step="1" min={key === "x" || key === "y" ? 0 : 1}
              max={key === "x" ? size.width - 1 : key === "y" ? size.height - 1 : key === "width" ? size.width - rect.x : size.height - rect.y}
              value={rect[key]} disabled={busy}
              onChange={event => setRect(clampCropRect({ ...rect, [key]: event.target.value }, size.width, size.height))} /></label>
          ))}
          <label>{vi ? "Mềm viền (px)" : "Feather (px)"}<input type="number" min="0" max="256" value={blend} disabled={busy}
            onChange={event => setBlend(Math.max(0, Math.min(256, Number(event.target.value) || 0)))} /></label>
          <span>{size.width} × {size.height} → {rect.width} × {rect.height}</span>
        </div> : null}
        {error ? <p className="cropInpaintError" role="alert">{error}</p> : null}
        <footer className="maskFooter cropInpaintFooter">
          {value?.cropInpaint ? <button type="button" className="downloadButton maskCancel cropInpaintReset" disabled={busy} onClick={() => { onSave(cropInpaintSource(value)); onClose(); }}>
            <RotateCcw size={15} />{vi ? "Tắt crop, dùng ảnh gốc" : "Remove crop, use original"}</button> : <span />}
          <button type="button" className="downloadButton maskCancel" disabled={busy} onClick={onClose}>{vi ? "Hủy" : "Cancel"}</button>
          <button type="button" className="maskSave" disabled={!rect || busy} onClick={apply}>
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}{vi ? "Áp dụng vùng crop" : "Apply crop"}
          </button>
        </footer>
      </section>
    </div>
  );
}
