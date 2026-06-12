export const DEFAULT_HEALING_BRUSH_SIZE = 28;

export function snapshotColorAdjustState(adjustments, healingStrokes) {
  return {
    adjustments: JSON.parse(JSON.stringify(adjustments)),
    healingStrokes: JSON.parse(JSON.stringify(healingStrokes))
  };
}

export function applyHealingStroke(ctx, stroke, scale) {
  if (!stroke.points || !stroke.points.length) return;

  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const strokeSize = Math.max(2, stroke.size * scale);

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  stroke.points.forEach(point => {
    const x = point.x * width;
    const y = point.y * height;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  const pad = Math.ceil(strokeSize * 1.5);
  minX = Math.max(0, Math.floor(minX - pad));
  maxX = Math.min(width - 1, Math.ceil(maxX + pad));
  minY = Math.max(0, Math.floor(minY - pad));
  maxY = Math.min(height - 1, Math.ceil(maxY + pad));

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  if (boxW <= 0 || boxH <= 0) return;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = boxW;
  maskCanvas.height = boxH;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.fillStyle = "black";
  maskCtx.fillRect(0, 0, boxW, boxH);

  maskCtx.strokeStyle = "white";
  maskCtx.lineWidth = strokeSize;
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";

  maskCtx.beginPath();
  const first = stroke.points[0];
  maskCtx.moveTo(first.x * width - minX, first.y * height - minY);
  stroke.points.slice(1).forEach(point => {
    maskCtx.lineTo(point.x * width - minX, point.y * height - minY);
  });
  if (stroke.points.length === 1) {
    maskCtx.lineTo(first.x * width - minX + 0.01, first.y * height - minY + 0.01);
  }
  maskCtx.stroke();

  let imageData;
  try {
    imageData = ctx.getImageData(minX, minY, boxW, boxH);
  } catch {
    return;
  }
  const maskData = maskCtx.getImageData(0, 0, boxW, boxH);

  const pixels = imageData.data;
  const maskPixels = maskData.data;
  const sourcePixels = new Uint8ClampedArray(pixels);
  const maxSearch = Math.max(30, Math.round(strokeSize * 2));

  const dirs = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1]
  ];

  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const idx = (y * boxW + x) * 4;
      if (maskPixels[idx] <= 128) continue;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let wSum = 0;
      for (let d = 0; d < 8; d++) {
        const dx = dirs[d][0];
        const dy = dirs[d][1];
        let step = 1;
        while (step <= maxSearch) {
          const sx = x + dx * step;
          const sy = y + dy * step;
          if (sx < 0 || sx >= boxW || sy < 0 || sy >= boxH) break;
          const sourceIdx = (sy * boxW + sx) * 4;
          if (maskPixels[sourceIdx] <= 128) {
            const weight = 1 / (step * step);
            rSum += sourcePixels[sourceIdx] * weight;
            gSum += sourcePixels[sourceIdx + 1] * weight;
            bSum += sourcePixels[sourceIdx + 2] * weight;
            wSum += weight;
            break;
          }
          step++;
        }
      }
      if (wSum > 0) {
        pixels[idx] = rSum / wSum;
        pixels[idx + 1] = gSum / wSum;
        pixels[idx + 2] = bSum / wSum;
        pixels[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(imageData, minX, minY);
}

export function drawHealingOverlay(ctx, stroke, width, height, scale) {
  if (!stroke?.points?.length) return;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(239, 68, 68, 0.75)";
  ctx.lineWidth = Math.max(2, stroke.size * scale);

  ctx.beginPath();
  const first = stroke.points[0];
  ctx.moveTo(first.x * width, first.y * height);
  stroke.points.slice(1).forEach(point => ctx.lineTo(point.x * width, point.y * height));
  if (stroke.points.length === 1) {
    ctx.lineTo(first.x * width + 0.01, first.y * height + 0.01);
  }
  ctx.stroke();
  ctx.restore();
}

export function applyHealingStrokes(ctx, strokes, scale) {
  strokes.filter(stroke => stroke.tool === "healing").forEach(stroke => {
    applyHealingStroke(ctx, stroke, scale);
  });
}
