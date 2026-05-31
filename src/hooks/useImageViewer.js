import { useEffect, useRef, useState } from "react";

const MIN_IMAGE_SCALE = 0.5;
const MAX_IMAGE_SCALE = 10;

export function useImageViewer(heroImage, canCompare) {
  const [imageScale, setImageScale] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [imageFitSize, setImageFitSize] = useState({ width: 0, height: 0 });
  const [outputImageSize, setOutputImageSize] = useState({ width: 0, height: 0 });
  const [draggingImage, setDraggingImage] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [compareDividerX, setCompareDividerX] = useState(50);
  const imageDragRef = useRef(null);
  const previewAreaRef = useRef(null);
  const imageElementRef = useRef(null);

  function resetImageView() {
    setImageScale(1);
    setImagePan({ x: 0, y: 0 });
  }

  function updateImageFitSize() {
    const area = previewAreaRef.current;
    const image = imageElementRef.current;
    if (!area || !image || !image.naturalWidth || !image.naturalHeight) return;
    const areaWidth = area.clientWidth;
    const areaHeight = area.clientHeight;
    if (!areaWidth || !areaHeight) return;
    const fitScale = Math.min(areaWidth / image.naturalWidth, areaHeight / image.naturalHeight);
    setImageFitSize({
      width: Math.max(1, Math.floor(image.naturalWidth * fitScale)),
      height: Math.max(1, Math.floor(image.naturalHeight * fitScale))
    });
    setCompareDividerX(areaWidth / 2);
  }

  function handleResultImageLoad() {
    const image = imageElementRef.current;
    if (image?.naturalWidth && image?.naturalHeight) {
      setOutputImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    }
    updateImageFitSize();
  }

  useEffect(() => {
    if (!heroImage) {
      setImageFitSize({ width: 0, height: 0 });
      setOutputImageSize({ width: 0, height: 0 });
      setCompareMode(false);
      return;
    }
    setOutputImageSize({ width: 0, height: 0 });
    const frame = requestAnimationFrame(updateImageFitSize);
    window.addEventListener("resize", updateImageFitSize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateImageFitSize);
    };
  }, [heroImage]);

  useEffect(() => {
    if (!canCompare) setCompareMode(false);
  }, [canCompare]);

  function handlePreviewWheel(event) {
    if (!heroImage) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    setImageScale(current => Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, Number((current + delta).toFixed(2)))));
  }

  function updateComparePosition(event) {
    const image = imageElementRef.current;
    if (!image) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width) return;
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(100, Math.max(0, Number(next.toFixed(2))));
    setComparePosition(clamped);
    setCompareDividerX(rect.left - event.currentTarget.getBoundingClientRect().left + rect.width * (clamped / 100));
  }

  function handlePreviewPointerDown(event) {
    if (!heroImage || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".outputNavButton, .outputRail")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    imageDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: imagePan.x,
      panY: imagePan.y
    };
    setDraggingImage(true);
  }

  function handlePreviewPointerMove(event) {
    if (compareMode && !imageDragRef.current) {
      updateComparePosition(event);
      return;
    }
    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (compareMode) updateComparePosition(event);
    setImagePan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY
    });
  }

  function handlePreviewPointerUp(event) {
    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    imageDragRef.current = null;
    setDraggingImage(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return {
    imageScale, imagePan, imageFitSize, outputImageSize,
    draggingImage, compareMode, setCompareMode,
    comparePosition, compareDividerX,
    previewAreaRef, imageElementRef,
    resetImageView, handleResultImageLoad,
    handlePreviewWheel,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    handlePreviewPointerUp
  };
}
