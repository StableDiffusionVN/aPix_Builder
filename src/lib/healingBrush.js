export const DEFAULT_HEALING_BRUSH_SIZE = 28;

export function snapshotColorAdjustState(adjustments, healingStrokes) {
  return {
    adjustments: JSON.parse(JSON.stringify(adjustments)),
    healingStrokes: JSON.parse(JSON.stringify(healingStrokes))
  };
}

// ---------------------------------------------------------------------------
// Healing brush (Photoshop-style): for every part of the stroke find a nearby
// source area whose surroundings match, copy its pixels (keeps skin texture,
// grain, pores), then fix colour / lighting with a membrane (Laplace) correction
// so the patch blends into the destination edge. The old version averaged the
// border pixels, which removed the blemish but left a smooth, detail-less smear.
// ---------------------------------------------------------------------------

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

/** Splits the stroke polyline (pixel coords) into chunks of about `length` px. */
function strokeChunks(points, length) {
  const chunks = [];
  let current = [points[0]];
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const point = points[i];
    run += Math.hypot(point.x - prev.x, point.y - prev.y);
    current.push(point);
    if (run >= length && i < points.length - 1) {
      chunks.push(current);
      current = [point];
      run = 0;
    }
  }
  chunks.push(current);
  return chunks;
}

/**
 * Heals one stroke in place.
 * pixels: RGBA of a w×h region; stroke points / radius are in that region's pixels.
 * fixedOffset: { ox, oy } in pixels — the source the user picked with Alt+click
 * (every part of the stroke copies from that offset); omitted → found automatically.
 * Exported for tests (no DOM needed).
 */
export function healRegion(pixels, w, h, points, radius, fixedOffset = null) {
  if (!points.length || radius <= 0) return;
  const total = w * h;
  const original = new Uint8ClampedArray(pixels);
  const holeLimit = radius + 1;

  // Distance to the stroke + which chunk each hole pixel belongs to.
  const chunkLength = Math.max(radius * 4, 12);
  const chunks = strokeChunks(points.length === 1 ? [points[0], { x: points[0].x + 0.01, y: points[0].y + 0.01 }] : points, chunkLength);
  const dist = new Float32Array(total).fill(Infinity);
  const owner = new Int16Array(total).fill(-1);
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  chunks.forEach((chunk, chunkIndex) => {
    for (let i = 0; i < chunk.length - 1 || i === 0; i++) {
      const a = chunk[i];
      const b = chunk[Math.min(i + 1, chunk.length - 1)];
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - holeLimit - 1));
      const x1 = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x) + holeLimit + 1));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - holeLimit - 1));
      const y1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y) + holeLimit + 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = distanceToSegment(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y);
          const index = y * w + x;
          if (d < dist[index]) {
            dist[index] = d;
            owner[index] = chunkIndex;
          }
        }
      }
      if (chunk.length < 2) break;
    }
  });
  const hole = new Uint8Array(total);
  for (let index = 0; index < total; index++) {
    if (dist[index] <= holeLimit) {
      hole[index] = 1;
      const x = index % w;
      const y = (index - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      owner[index] = -1;
    }
  }
  if (minX > maxX) return;

  // Source offset per chunk: try offsets around the chunk (perpendicular first) and
  // keep the one whose border band best matches the destination border band.
  const band = Math.max(2, Math.round(radius * 0.6));
  const offsets = fixedOffset ? chunks.map(() => ({ ox: Math.round(fixedOffset.ox), oy: Math.round(fixedOffset.oy), score: 0 })) : chunks.map(chunk => {
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const dirX = last.x - first.x;
    const dirY = last.y - first.y;
    const dirLen = Math.hypot(dirX, dirY);
    const baseAngle = dirLen > 1 ? Math.atan2(dirY, dirX) + Math.PI / 2 : 0;
    const cx = (first.x + last.x) / 2;
    const cy = (first.y + last.y) / 2;
    const reach = dirLen / 2 + holeLimit + band;
    // Border band of this chunk (pixels just outside the hole, near the chunk).
    const ring = [];
    const rx0 = Math.max(0, Math.floor(cx - reach));
    const rx1 = Math.min(w - 1, Math.ceil(cx + reach));
    const ry0 = Math.max(0, Math.floor(cy - reach));
    const ry1 = Math.min(h - 1, Math.ceil(cy + reach));
    const step = Math.max(1, Math.round(radius / 6));
    for (let y = ry0; y <= ry1; y += step) {
      for (let x = rx0; x <= rx1; x += step) {
        const index = y * w + x;
        if (hole[index]) continue;
        let near = Infinity;
        for (let i = 0; i < chunk.length - 1 || i === 0; i++) {
          const a = chunk[i];
          const b = chunk[Math.min(i + 1, chunk.length - 1)];
          near = Math.min(near, distanceToSegment(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y));
          if (chunk.length < 2) break;
        }
        if (near <= holeLimit + band) ring.push(index);
      }
    }
    // Hole pixels near this chunk — the source must not land in a hole.
    const own = [];
    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0; x <= rx1; x++) {
        const index = y * w + x;
        if (hole[index]) own.push(index);
      }
    }
    let best = null;
    const distances = [1.25, 1.75, 2.5, 3.5].map(f => f * radius * 2);
    const angles = [0, Math.PI, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI / 2, -Math.PI / 2];
    for (const distance of distances) {
      for (const angle of angles) {
        const ox = Math.round(Math.cos(baseAngle + angle) * distance);
        const oy = Math.round(Math.sin(baseAngle + angle) * distance);
        if (!ox && !oy) continue;
        let valid = true;
        for (const index of own) {
          const x = (index % w) + ox;
          const y = ((index - (index % w)) / w) + oy;
          if (x < 0 || y < 0 || x >= w || y >= h || hole[y * w + x]) {
            valid = false;
            break;
          }
        }
        if (!valid) continue;
        let cost = 0;
        let count = 0;
        for (const index of ring) {
          const x = (index % w) + ox;
          const y = ((index - (index % w)) / w) + oy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const source = (y * w + x) * 4;
          if (hole[y * w + x]) {
            cost += 3 * 255 * 255;
            count++;
            continue;
          }
          const dest = index * 4;
          // Compare structure, not brightness: the Laplace step fixes the colour.
          const dr = original[dest] - original[source];
          const dg = original[dest + 1] - original[source + 1];
          const db = original[dest + 2] - original[source + 2];
          cost += dr * dr + dg * dg + db * db;
          count++;
        }
        if (!count) continue;
        // Prefer close sources a little (similar lighting / texture scale).
        const score = (cost / count) * (1 + distance / (radius * 40));
        if (!best || score < best.score) best = { ox, oy, score };
      }
    }
    return best || { ox: Math.round(radius * 3), oy: 0, score: Infinity };
  });

  // Copy the source texture, then solve D = dest − source on the hole with Laplace
  // (D is fixed on the hole's outer border), and set result = source + D.
  // Neighbouring chunks use different offsets: cross-fade their sources over about
  // one brush radius so the copied texture has no hard seam.
  const chunkDistance = (x, y, chunk) => {
    let d = Infinity;
    for (let i = 0; i < chunk.length - 1 || i === 0; i++) {
      const a = chunk[i];
      const b = chunk[Math.min(i + 1, chunk.length - 1)];
      d = Math.min(d, distanceToSegment(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y));
      if (chunk.length < 2) break;
    }
    return d;
  };
  const sigma = Math.max(1.5, radius);
  const sourceValue = new Float32Array(total * 3);
  const sourceReady = new Uint8Array(total);
  const computeSource = index => {
    if (sourceReady[index]) return;
    sourceReady[index] = 1;
    const x = index % w;
    const y = (index - x) / w;
    const ds = chunks.map(chunk => chunkDistance(x, y, chunk));
    const dMin = Math.min(...ds);
    let wSum = 0;
    const acc = [0, 0, 0];
    ds.forEach((d, k) => {
      if (d > dMin + 3 * sigma) return;
      const { ox, oy } = offsets[k];
      const sx = Math.min(w - 1, Math.max(0, x + ox));
      const sy = Math.min(h - 1, Math.max(0, y + oy));
      if (!fixedOffset && hole[sy * w + sx]) return; // never copy from the area being healed
      const weight = Math.exp(-((d - dMin) ** 2) / (2 * sigma * sigma));
      const base = (sy * w + sx) * 4;
      for (let c = 0; c < 3; c++) acc[c] += original[base + c] * weight;
      wSum += weight;
    });
    for (let c = 0; c < 3; c++) {
      sourceValue[index * 3 + c] = wSum > 0 ? acc[c] / wSum : original[index * 4 + c];
    }
  };
  const holeIndices = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (hole[y * w + x]) holeIndices.push(y * w + x);
    }
  }
  const neighbours = [-1, 1, -w, w];
  const diff = new Float32Array(total * 3);
  // Border values: D at pixels next to the hole, using the neighbouring chunk's offset.
  for (const index of holeIndices) {
    const x = index % w;
    for (const delta of neighbours) {
      const n = index + delta;
      if (n < 0 || n >= total || hole[n]) continue;
      if ((delta === -1 && x === 0) || (delta === 1 && x === w - 1)) continue;
      computeSource(n);
      for (let c = 0; c < 3; c++) diff[n * 3 + c] = original[n * 4 + c] - sourceValue[n * 3 + c];
    }
  }
  const iterations = Math.min(600, Math.max(40, Math.round(radius * 6)));
  const omega = 1.85;
  for (let iteration = 0; iteration < iterations; iteration++) {
    let change = 0;
    for (const index of holeIndices) {
      const x = index % w;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let count = 0;
        for (const delta of neighbours) {
          const n = index + delta;
          if (n < 0 || n >= total) continue;
          if ((delta === -1 && x === 0) || (delta === 1 && x === w - 1)) continue;
          sum += diff[n * 3 + c];
          count++;
        }
        if (!count) continue;
        const slot = index * 3 + c;
        const next = diff[slot] + omega * (sum / count - diff[slot]);
        change = Math.max(change, Math.abs(next - diff[slot]));
        diff[slot] = next;
      }
    }
    if (change < 0.05) break;
  }

  for (const index of holeIndices) {
    computeSource(index);
    // 1px soft edge against the untouched image.
    const alpha = Math.min(1, Math.max(0, holeLimit - dist[index]));
    const base = index * 4;
    for (let c = 0; c < 3; c++) {
      const healed = sourceValue[index * 3 + c] + diff[index * 3 + c];
      pixels[base + c] = original[base + c] + (healed - original[base + c]) * alpha;
    }
    pixels[base + 3] = original[base + 3];
  }
}

export function applyHealingStroke(ctx, stroke, scale) {
  if (!stroke.points || !stroke.points.length) return;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const strokeSize = Math.max(2, stroke.size * scale);
  const radius = strokeSize / 2;

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
  // Room for the source search (up to 3.5 × the brush size away) and its border band,
  // or for the Alt+clicked source however far it is.
  const sourcePad = Number.isFinite(stroke.source?.dx) && Number.isFinite(stroke.source?.dy)
    ? Math.max(Math.abs(stroke.source.dx * width), Math.abs(stroke.source.dy * height)) + radius + 4
    : 0;
  const pad = Math.ceil(Math.max(radius * 9 + 8, sourcePad));
  const x0 = Math.max(0, Math.floor(minX - pad));
  const y0 = Math.max(0, Math.floor(minY - pad));
  const x1 = Math.min(width - 1, Math.ceil(maxX + pad));
  const y1 = Math.min(height - 1, Math.ceil(maxY + pad));
  const boxW = x1 - x0 + 1;
  const boxH = y1 - y0 + 1;
  if (boxW <= 0 || boxH <= 0) return;

  let imageData;
  try {
    imageData = ctx.getImageData(x0, y0, boxW, boxH);
  } catch {
    return;
  }
  const points = stroke.points.map(point => ({ x: point.x * width - x0, y: point.y * height - y0 }));
  // stroke.source: { dx, dy } normalized offset to the Alt+clicked source point.
  const fixedOffset = Number.isFinite(stroke.source?.dx) && Number.isFinite(stroke.source?.dy)
    ? { ox: stroke.source.dx * width, oy: stroke.source.dy * height }
    : null;
  healRegion(imageData.data, boxW, boxH, points, radius, fixedOffset);
  ctx.putImageData(imageData, x0, y0);
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
