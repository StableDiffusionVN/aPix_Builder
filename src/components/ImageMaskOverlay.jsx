import { useEffect, useRef } from "react";

const MASK_PREVIEW_MAX_SIZE = 1024;

export function ImageMaskOverlay({ maskDataUrl, fit = "contain" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !maskDataUrl) return undefined;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const naturalWidth = image.naturalWidth || 1;
      const naturalHeight = image.naturalHeight || 1;
      const scale = Math.min(1, MASK_PREVIEW_MAX_SIZE / Math.max(naturalWidth, naturalHeight));
      canvas.width = Math.max(1, Math.round(naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(naturalHeight * scale));

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const isPainted = pixels.data[index + 3] < 128;
        pixels.data[index] = 255;
        pixels.data[index + 1] = 0;
        pixels.data[index + 2] = 0;
        pixels.data[index + 3] = isPainted ? 255 : 0;
      }
      context.putImageData(pixels, 0, 0);
    };
    image.src = maskDataUrl;

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [maskDataUrl]);

  if (!maskDataUrl) return null;

  return (
    <canvas
      ref={canvasRef}
      className={`imageMaskOverlay is-${fit}`}
      aria-hidden="true"
    />
  );
}
