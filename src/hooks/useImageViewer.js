import { useEffect, useRef, useState } from "react";

const MIN_IMAGE_SCALE = 0.5;
const MAX_IMAGE_SCALE = 100;

export function useImageViewer(heroImage, canCompare) {
  const [imageScale, setImageScale] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [imageFitSize, setImageFitSize] = useState({ width: 0, height: 0 });
  const [outputImageSize, setOutputImageSize] = useState({ width: 0, height: 0 });
  const [draggingImage, setDraggingImage] = useState(false);
  const [isWheeling, setIsWheeling] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [compareDividerX, setCompareDividerX] = useState(50);

  const imageDragRef = useRef(null);
  const imageScaleRef = useRef(1);
  const imagePanRef = useRef({ x: 0, y: 0 });
  const wheelTimerRef = useRef(null);
  const previewAreaRef = useRef(null);
  const imageElementRef = useRef(null);

  // Keep refs in sync so wheel handler always reads latest values
  useEffect(() => {
    imageScaleRef.current = imageScale;
    imagePanRef.current = imagePan;
  });

  function resetImageView() {
    const next = { scale: 1, pan: { x: 0, y: 0 } };
    imageScaleRef.current = next.scale;
    imagePanRef.current = next.pan;
    setImageScale(next.scale);
    setImagePan(next.pan);
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
    if (isPreviewOverlayTarget(event.target)) return;
    event.preventDefault();

    const area = previewAreaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    // Mouse position relative to preview area center
    const mouseX = event.clientX - rect.left - rect.width / 2;
    const mouseY = event.clientY - rect.top - rect.height / 2;

    const factor = event.deltaY > 0 ? 1 / 1.15 : 1.15;
    const prevScale = imageScaleRef.current;
    const prevPan = imagePanRef.current;
    const newScale = Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, Number((prevScale * factor).toFixed(4))));
    if (newScale === prevScale) return;

    const ratio = newScale / prevScale;
    const newPan = {
      x: mouseX + (prevPan.x - mouseX) * ratio,
      y: mouseY + (prevPan.y - mouseY) * ratio
    };

    imageScaleRef.current = newScale;
    imagePanRef.current = newPan;

    // Disable CSS transition while wheeling to prevent lag accumulation
    setIsWheeling(true);
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(() => setIsWheeling(false), 150);

    setImageScale(newScale);
    setImagePan(newPan);
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

  function isPreviewOverlayTarget(target) {
    return target instanceof Element && target.closest(".outputLogDock, .outputNavButton, .outputRail, .outputMetaStack");
  }

  function handlePreviewPointerDown(event) {
    if (!heroImage || event.button !== 0) return;
    if (isPreviewOverlayTarget(event.target)) return;
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
    if (isPreviewOverlayTarget(event.target)) return;
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
    draggingImage, isWheeling, compareMode, setCompareMode,
    comparePosition, compareDividerX,
    previewAreaRef, imageElementRef,
    resetImageView, handleResultImageLoad,
    handlePreviewWheel,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    handlePreviewPointerUp
  };
}
