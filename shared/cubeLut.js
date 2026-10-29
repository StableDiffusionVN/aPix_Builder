// Adobe/Resolve .cube 3D LUT — parse, serialise, sample.
// Data layout follows the spec: red varies fastest, then green, then blue.

export const CUBE_MAX_SIZE = 65;
export const CUBE_MAX_BYTES = 12 * 1024 * 1024;

export function parseCubeLut(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("File .cube rỗng");
  if (text.length > CUBE_MAX_BYTES) throw new Error("File .cube quá lớn");
  let title = "";
  let size = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  let data = null;
  let count = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const upper = line.slice(0, 16).toUpperCase();
    if (upper.startsWith("TITLE")) {
      title = line.replace(/^TITLE\s*/i, "").replace(/^"|"$/g, "").trim();
      continue;
    }
    if (upper.startsWith("LUT_1D_SIZE")) throw new Error("Chỉ hỗ trợ LUT 3D (.cube có LUT_3D_SIZE)");
    if (upper.startsWith("LUT_3D_SIZE")) {
      size = Number.parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isInteger(size) || size < 2 || size > CUBE_MAX_SIZE) {
        throw new Error(`LUT_3D_SIZE không hợp lệ (2–${CUBE_MAX_SIZE})`);
      }
      data = new Float32Array(size * size * size * 3);
      continue;
    }
    if (upper.startsWith("DOMAIN_MIN")) {
      domainMin = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (upper.startsWith("DOMAIN_MAX")) {
      domainMax = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (/^[A-Z_]/i.test(line)) continue; // unknown keyword (LUT_IN_VIDEO_RANGE…)
    if (!data) throw new Error("Thiếu LUT_3D_SIZE trước dữ liệu");
    const parts = line.split(/\s+/);
    if (parts.length < 3) throw new Error("Dòng dữ liệu LUT không hợp lệ");
    if (count >= data.length) throw new Error("LUT có nhiều dòng hơn LUT_3D_SIZE");
    for (let c = 0; c < 3; c++) {
      const value = Number(parts[c]);
      if (!Number.isFinite(value)) throw new Error("Giá trị LUT không phải số");
      data[count++] = value;
    }
  }

  if (!data) throw new Error("Thiếu LUT_3D_SIZE");
  if (count !== data.length) throw new Error(`LUT thiếu dữ liệu (${count / 3}/${data.length / 3} điểm)`);
  if ([...domainMin, ...domainMax].some(v => !Number.isFinite(v))
    || domainMax.some((v, i) => v <= domainMin[i])) {
    throw new Error("DOMAIN_MIN/DOMAIN_MAX không hợp lệ");
  }
  return { title, size, domainMin, domainMax, data };
}

export function serializeCubeLut({ title = "aPix", size, data }) {
  const lines = [
    "# Created by aPix Builder",
    `TITLE "${String(title).replace(/"/g, "'")}"`,
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0"
  ];
  for (let i = 0; i < data.length; i += 3) {
    lines.push(`${data[i].toFixed(6)} ${data[i + 1].toFixed(6)} ${data[i + 2].toFixed(6)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Trilinear sample of an encoded-RGB 3D LUT; inputs are clamped to the domain. */
export function sampleCubeLut(lut, r, g, b, out) {
  const { size, data, domainMin, domainMax } = lut;
  const max = size - 1;
  const fr = clampUnit((r - domainMin[0]) / (domainMax[0] - domainMin[0])) * max;
  const fg = clampUnit((g - domainMin[1]) / (domainMax[1] - domainMin[1])) * max;
  const fb = clampUnit((b - domainMin[2]) / (domainMax[2] - domainMin[2])) * max;
  const r0 = Math.min(max - 1, fr | 0);
  const g0 = Math.min(max - 1, fg | 0);
  const b0 = Math.min(max - 1, fb | 0);
  const tr = fr - r0;
  const tg = fg - g0;
  const tb = fb - b0;
  const sG = size * 3;
  const sB = size * size * 3;
  const base = b0 * sB + g0 * sG + r0 * 3;
  for (let c = 0; c < 3; c++) {
    const i = base + c;
    const c00 = data[i] + (data[i + 3] - data[i]) * tr;
    const c10 = data[i + sG] + (data[i + sG + 3] - data[i + sG]) * tr;
    const c01 = data[i + sB] + (data[i + sB + 3] - data[i + sB]) * tr;
    const c11 = data[i + sB + sG] + (data[i + sB + sG + 3] - data[i + sB + sG]) * tr;
    const c0 = c00 + (c10 - c00) * tg;
    const c1 = c01 + (c11 - c01) * tg;
    out[c] = c0 + (c1 - c0) * tb;
  }
  return out;
}

function clampUnit(value) {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}
