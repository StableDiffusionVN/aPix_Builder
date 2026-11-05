import { describe, expect, it } from "vitest";
import { healRegion } from "../src/lib/healingBrush.js";

// Deterministic "skin": mid tone + fine noise texture + a soft gradient.
function texture(w, h, seed = 7) {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = 150 + (x / w) * 30;
      const noise = (rand() - 0.5) * 40;
      const i = (y * w + x) * 4;
      px[i] = base + noise;
      px[i + 1] = base * 0.8 + noise;
      px[i + 2] = base * 0.7 + noise;
      px[i + 3] = 255;
    }
  }
  return px;
}

const distToSegment = (x, y, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
};

function stats(px, w, h, select) {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!select(x, y)) continue;
      const v = px[(y * w + x) * 4];
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return { mean, std: Math.sqrt(sum2 / n - mean * mean) };
}

const W = 200;
const H = 160;
const A = { x: 40, y: 80 };
const B = { x: 160, y: 80 };
const R = 6;
const inHole = (x, y) => distToSegment(x + 0.5, y + 0.5, A, B) <= R - 1;
const around = (x, y) => {
  const d = distToSegment(x + 0.5, y + 0.5, A, B);
  return d > R + 3 && d < R + 14;
};

function withWrinkle() {
  const px = texture(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (distToSegment(x + 0.5, y + 0.5, A, B) < R * 0.6) for (let c = 0; c < 3; c++) px[(y * W + x) * 4 + c] *= 0.5;
    }
  }
  return px;
}

describe("healing brush", () => {
  it("removes the blemish and keeps the surrounding texture (auto source)", () => {
    const px = withWrinkle();
    healRegion(px, W, H, [A, B], R);
    const inside = stats(px, W, H, inHole);
    const ring = stats(px, W, H, around);
    expect(Math.abs(inside.mean - ring.mean)).toBeLessThan(6);
    // A border average would leave std ≈ 0; copied texture keeps most of it.
    expect(inside.std).toBeGreaterThan(ring.std * 0.6);
  });

  it("copies from the Alt+clicked source offset", () => {
    const px = withWrinkle();
    const clean = texture(W, H);
    healRegion(px, W, H, [A, B], R, { ox: 0, oy: -40 });
    // Texture inside follows the source rows (40 px up), corrected for tone.
    let match = 0;
    let n = 0;
    for (let x = 50; x < 150; x++) {
      const healed = px[(80 * W + x) * 4] - px[(80 * W + x - 1) * 4];
      const source = clean[(40 * W + x) * 4] - clean[(40 * W + x - 1) * 4];
      if (Math.sign(healed) === Math.sign(source)) match++;
      n++;
    }
    expect(match / n).toBeGreaterThan(0.8);
    const inside = stats(px, W, H, inHole);
    const ring = stats(px, W, H, around);
    expect(Math.abs(inside.mean - ring.mean)).toBeLessThan(6);
  });

  it("does not pick a smooth area to copy from when the surroundings are textured", () => {
    const px = withWrinkle();
    // A smooth band right where a perpendicular source would land (below the stroke).
    for (let y = 88; y < 130; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        px[i] = 165;
        px[i + 1] = 132;
        px[i + 2] = 115;
      }
    }
    healRegion(px, W, H, [A, B], R);
    const inside = stats(px, W, H, inHole);
    const ring = stats(px, W, H, (x, y) => around(x, y) && y < 80);
    expect(inside.std).toBeGreaterThan(ring.std * 0.7);
  });

  it("keeps detail along a curved stroke (no blending between parts)", () => {
    const px = texture(W, H);
    const curve = Array.from({ length: 20 }, (_, i) => ({ x: 30 + i * 7, y: 80 + 25 * Math.sin(i / 3) }));
    healRegion(px, W, H, curve, R);
    const near = (x, y) => {
      let d = Infinity;
      for (let i = 0; i < curve.length - 1; i++) d = Math.min(d, distToSegment(x + 0.5, y + 0.5, curve[i], curve[i + 1]));
      return d;
    };
    const inside = stats(px, W, H, (x, y) => near(x, y) <= R - 1);
    const ring = stats(px, W, H, (x, y) => near(x, y) > R + 3 && near(x, y) < R + 14);
    expect(inside.std).toBeGreaterThan(ring.std * 0.85);
  });

  it("leaves pixels outside the stroke untouched", () => {
    const px = withWrinkle();
    const before = new Uint8ClampedArray(px);
    healRegion(px, W, H, [A, B], R);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (distToSegment(x + 0.5, y + 0.5, A, B) > R + 1.5) expect(px[(y * W + x) * 4]).toBe(before[(y * W + x) * 4]);
      }
    }
  });
});
