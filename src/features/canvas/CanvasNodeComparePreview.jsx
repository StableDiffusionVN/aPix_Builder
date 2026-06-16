import { Suspense, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useViewport } from "@xyflow/react";
import { Maximize2, Wand2 } from "lucide-react";
import { ImageLightboxOverlay } from "../../components/ImageLightboxOverlay.jsx";
import { ImageEditorModal } from "../../components/lazyModals.js";

function PreviewImage({ src, alt, className = "", onSize }) {
  return (
    <img
      src={src}
      alt={alt}
      draggable="false"
      className={className}
      onLoad={event => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth && naturalHeight) onSize?.(src, naturalWidth, naturalHeight);
      }}
    />
  );
}

function SizeBadge({ label, size, side, timingLabel = "" }) {
  if (!size?.width || !size?.height) return null;
  if (side === "output") {
    return (
      <div className="canvasPreviewMetaStack is-output">
        <div className="canvasPreviewSizeBadge" title={`${label}: ${size.width} x ${size.height}`}>
          {size.width} x {size.height}
        </div>
        {timingLabel ? <div className="canvasPreviewTimingBadge">{timingLabel}</div> : null}
      </div>
    );
  }
  return (
    <div
      className={`canvasPreviewSizeBadge is-${side}`}
      title={`${label}: ${size.width} x ${size.height}`}
    >
      {size.width} x {size.height}
    </div>
  );
}

async function saveOutputToInputLibrary(dataUrl) {
  try {
    await fetch("/api/input-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: `output_edited_${Date.now()}.png`, dataUrl })
    });
  } catch {}
}

export function CanvasNodeComparePreview({ inputUrl, outputUrl, outputTimingLabel = "", onContextMenu }) {
  const [comparePosition, setComparePosition] = useState(50);
  const [isHovering, setIsHovering] = useState(false);
  const [imageSizes, setImageSizes] = useState({});
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const { zoom } = useViewport();

  const canCompare = Boolean(inputUrl && outputUrl);
  const inputSize = imageSizes[inputUrl];
  const outputSize = imageSizes[outputUrl];
  const compareSize = outputSize || inputSize;

  const rememberImageSize = useCallback((url, width, height) => {
    setImageSizes(current => {
      const previous = current[url];
      if (previous?.width === width && previous?.height === height) return current;
      return { ...current, [url]: { width, height } };
    });
  }, []);

  const updateComparePosition = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    setComparePosition(Math.min(100, Math.max(0, Number(next.toFixed(2)))));
  }, []);

  const handlePointerEnter = useCallback((event) => {
    setIsHovering(true);
    updateComparePosition(event);
  }, [updateComparePosition]);

  const handlePointerLeave = useCallback(() => {
    setIsHovering(false);
    setComparePosition(50);
  }, []);

  const handleContextMenu = useCallback((event) => {
    let imageUrl = outputUrl;
    let imageKind = "output";
    if (isHovering && canCompare) {
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerPosition = rect.width
        ? ((event.clientX - rect.left) / rect.width) * 100
        : 0;
      if (pointerPosition > comparePosition) {
        imageUrl = inputUrl;
        imageKind = "input";
      }
    }
    onContextMenu?.(event, { imageUrl, imageKind });
  }, [canCompare, comparePosition, inputUrl, isHovering, onContextMenu, outputUrl]);

  if (!outputUrl) return null;

  if (!canCompare) {
    return (
      <div className="canvasNodePreview" onContextMenu={handleContextMenu}>
        <div className="canvasNodePreviewStage">
          <PreviewImage src={outputUrl} alt="output" onSize={rememberImageSize} />
          <SizeBadge label="Output" size={outputSize} side="output" timingLabel={outputTimingLabel} />
          <div className="canvasPreviewToolbar nodrag">
            <button
              type="button"
              onClick={event => { event.preventDefault(); event.stopPropagation(); setLightboxOpen(true); }}
              title="View full size"
            >
              <Maximize2 size={12} />
            </button>
            <button
              type="button"
              onClick={event => { event.preventDefault(); event.stopPropagation(); setEditorOpen(true); }}
              title="Open in Image Editor"
            >
              <Wand2 size={12} />
            </button>
          </div>
        </div>
        <ImageLightboxOverlay
          open={lightboxOpen}
          image={lightboxOpen ? { url: outputUrl, name: "Output" } : null}
          title="Output"
          onClose={() => setLightboxOpen(false)}
        />
        {editorOpen ? createPortal(
          <Suspense fallback={null}>
            <ImageEditorModal
              source={outputUrl}
              title="Output — Image Editor"
              onClose={() => setEditorOpen(false)}
              onSave={async dataUrl => {
                await saveOutputToInputLibrary(dataUrl);
                setEditorOpen(false);
              }}
            />
          </Suspense>,
          document.body
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`canvasNodePreview canvasNodePreviewCompare nodrag${isHovering ? " isCompareActive" : ""}`}
      onContextMenu={handleContextMenu}
    >
      <div
        className={`canvasNodePreviewStage canvasNodeCompareStage${isHovering ? " isCompareActive" : ""}`}
      >
        <div
          className={`canvasCompareImageFrame${isHovering ? " isCompareActive" : ""}`}
          style={{
            ...(compareSize ? { aspectRatio: `${compareSize.width} / ${compareSize.height}` } : {}),
            "--compare-position": `${isHovering ? comparePosition : 0}%`,
            "--canvas-zoom": Math.max(zoom, 0.01)
          }}
          onPointerEnter={handlePointerEnter}
          onPointerMove={isHovering ? updateComparePosition : undefined}
          onPointerLeave={handlePointerLeave}
        >
          <PreviewImage
            src={outputUrl}
            alt="output"
            className="canvasCompareBase"
            onSize={rememberImageSize}
          />
          <PreviewImage
            src={inputUrl}
            alt="input"
            className="canvasCompareOutput"
            onSize={rememberImageSize}
          />
          {isHovering ? <div className="canvasCompareDivider" aria-hidden="true" /> : null}
        </div>
        <SizeBadge label="Output" size={outputSize} side="output" timingLabel={outputTimingLabel} />
        {isHovering ? <SizeBadge label="Input" size={inputSize} side="input" /> : null}
        {!isHovering ? (
          <div className="canvasPreviewToolbar nodrag">
            <button
              type="button"
              onClick={event => { event.preventDefault(); event.stopPropagation(); setLightboxOpen(true); }}
              title="View full size"
            >
              <Maximize2 size={12} />
            </button>
            <button
              type="button"
              onClick={event => { event.preventDefault(); event.stopPropagation(); setEditorOpen(true); }}
              title="Open in Image Editor"
            >
              <Wand2 size={12} />
            </button>
          </div>
        ) : null}
      </div>
      <ImageLightboxOverlay
        open={lightboxOpen}
        image={lightboxOpen ? { url: outputUrl, name: "Output" } : null}
        title="Output"
        onClose={() => setLightboxOpen(false)}
      />
      {editorOpen ? createPortal(
        <Suspense fallback={null}>
          <ImageEditorModal
            source={outputUrl}
            title="Output — Image Editor"
            onClose={() => setEditorOpen(false)}
            onSave={async dataUrl => {
              await saveOutputToInputLibrary(dataUrl);
              setEditorOpen(false);
            }}
          />
        </Suspense>,
        document.body
      ) : null}
    </div>
  );
}
