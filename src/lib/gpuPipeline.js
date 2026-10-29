// WebGL2 implementation of applyColorPipeline (imageAdjustments.js).
// The two per-pixel stages arrive baked as 3D LUTs (prepareGpuPipeline); the
// spatial work — guided-filter base layer, texture blur, vignette, grain — runs
// as shader passes mirroring the CPU code. Returns null whenever WebGL2 or float
// render targets are unavailable so callers fall back to the CPU pipeline.
import { prepareGpuPipeline } from "./imageAdjustments.js";

const TONE_TABLE_SIZE = 4096;

const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
float encode1(float c) { c = clamp(c, 0.0, 1.0); return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
float decode1(float c) { c = clamp(c, 0.0, 1.0); return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
vec3 decode3(vec3 c) { return vec3(decode1(c.r), decode1(c.g), decode1(c.b)); }
vec3 encode3(vec3 c) { return vec3(encode1(c.r), encode1(c.g), encode1(c.b)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 lutSample(sampler3D t, float n, vec3 c) { return texture(t, (clamp(c, 0.0, 1.0) * (n - 1.0) + 0.5) / n).rgb; }
uniform sampler3D u_baseLut;
uniform bool u_hasBase;
uniform float u_baseSize;
vec3 baseStage(vec3 encoded) { return u_hasBase ? lutSample(u_baseLut, u_baseSize, encoded) : decode3(encoded); }
`;

// Full-resolution perceptual lightness after the base stage.
const LIGHTNESS = `${COMMON}
uniform sampler2D u_src;
out vec4 o;
void main() {
  vec3 px = baseStage(texelFetch(u_src, ivec2(gl_FragCoord.xy), 0).rgb);
  o = vec4(encode1(lum(px)), 0.0, 0.0, 1.0);
}`;

// Block average (downsamplePlane).
const DOWNSAMPLE = `${COMMON}
uniform sampler2D u_in;
uniform int u_factor;
uniform ivec2 u_inSize;
out vec4 o;
void main() {
  ivec2 origin = ivec2(gl_FragCoord.xy) * u_factor;
  float sum = 0.0;
  float count = 0.0;
  for (int y = 0; y < 64; y++) {
    if (y >= u_factor) break;
    for (int x = 0; x < 64; x++) {
      if (x >= u_factor) break;
      ivec2 p = origin + ivec2(x, y);
      if (p.x < u_inSize.x && p.y < u_inSize.y) { sum += texelFetch(u_in, p, 0).r; count += 1.0; }
    }
  }
  o = vec4(sum / max(count, 1.0), 0.0, 0.0, 1.0);
}`;

// Separable box mean with exact edge normalisation (boxMean). u_square feeds (I, I²).
const BOX = `${COMMON}
uniform sampler2D u_in;
uniform ivec2 u_dir;
uniform int u_radius;
uniform ivec2 u_size;
uniform bool u_square;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 sum = vec2(0.0);
  float count = 0.0;
  for (int i = -256; i <= 256; i++) {
    if (i < -u_radius) continue;
    if (i > u_radius) break;
    ivec2 q = p + u_dir * i;
    if (q.x < 0 || q.y < 0 || q.x >= u_size.x || q.y >= u_size.y) continue;
    vec2 v = texelFetch(u_in, q, 0).rg;
    sum += u_square ? vec2(v.x, v.x * v.x) : v;
    count += 1.0;
  }
  o = vec4(sum / max(count, 1.0), 0.0, 1.0);
}`;

// Guided-filter coefficients from (meanI, meanII).
const COEF = `${COMMON}
uniform sampler2D u_in;
uniform float u_eps;
out vec4 o;
void main() {
  vec2 m = texelFetch(u_in, ivec2(gl_FragCoord.xy), 0).rg;
  float variance = max(0.0, m.y - m.x * m.x);
  float a = variance / (variance + u_eps);
  o = vec4(a, m.x - a * m.x, 0.0, 1.0);
}`;

const MAIN = `${COMMON}
uniform sampler2D u_src;
uniform ivec2 u_size;
uniform bool u_local;
uniform bool u_hasBaseLayer;
uniform sampler2D u_meanAB;
uniform float u_factor;
uniform vec2 u_lowSize;
uniform bool u_hasTone;
uniform sampler2D u_tone;
uniform float u_clarity;
uniform float u_texture;
uniform sampler2D u_texBase;
uniform bool u_hasColor;
uniform sampler3D u_colorLut;
uniform float u_colorSize;
uniform float u_vignette;
uniform bool u_invert;
uniform float u_grain;
uniform float u_grainCell;
uniform float u_roughness;
uniform uint u_seed;
out vec4 o;

vec3 fitGamut(vec3 p) {
  float y = lum(p);
  if (y >= 1.0) return vec3(1.0);
  if (y <= 0.0) return vec3(0.0);
  float t = 1.0;
  for (int c = 0; c < 3; c++) {
    if (p[c] > 1.0) t = min(t, (1.0 - y) / (p[c] - y));
    else if (p[c] < 0.0) t = min(t, y / (y - p[c]));
  }
  return t < 1.0 ? vec3(y) + (p - vec3(y)) * t : p;
}

float tone(float v) {
  if (!(v > 0.0)) return texelFetch(u_tone, ivec2(0, 0), 0).r;
  if (v >= 1.0) return texelFetch(u_tone, ivec2(${TONE_TABLE_SIZE}, 0), 0).r;
  float pos = v * ${TONE_TABLE_SIZE}.0;
  int i = int(pos);
  float a = texelFetch(u_tone, ivec2(i, 0), 0).r;
  float b = texelFetch(u_tone, ivec2(i + 1, 0), 0).r;
  return a + (b - a) * (pos - float(i));
}

float hashNoise(uint x, uint y, uint seed) {
  uint h = (x * 374761393u) ^ (y * 668265263u) ^ (seed * 2246822519u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) / 4294967296.0 * 2.0 - 1.0;
}

void main() {
  // Output row 0 is the bottom of the framebuffer; textures are top-down.
  ivec2 tp = ivec2(int(gl_FragCoord.x), u_size.y - 1 - int(gl_FragCoord.y));
  vec4 src = texelFetch(u_src, tp, 0);
  vec3 px = baseStage(src.rgb);

  if (u_local) {
    float light = encode1(lum(px));
    float target = light;
    if (u_hasBaseLayer) {
      vec2 ab = texture(u_meanAB, ((vec2(tp) + 0.5) / u_factor) / u_lowSize).rg;
      float baseValue = ab.x * light + ab.y;
      float detail = light - baseValue;
      if (u_hasTone) target = tone(baseValue) + detail;
      if (u_clarity != 0.0) target += u_clarity * 4.0 * light * (1.0 - light) * detail;
    }
    if (u_texture != 0.0) {
      float textureBase = texelFetch(u_texBase, tp, 0).r;
      target += u_texture * (0.4 + 2.4 * light * (1.0 - light)) * (light - textureBase);
    }
    if (target != light) {
      float y = lum(px);
      float nextY = decode1(target);
      px = y > 1e-6 ? px * (nextY / y) : vec3(nextY);
      px = fitGamut(px);
    }
  }

  if (u_hasColor) px = lutSample(u_colorLut, u_colorSize, encode3(px));

  if (u_vignette != 0.0) {
    vec2 c = vec2(u_size) * 0.5;
    vec2 d = (vec2(tp) + 0.5 - c) / c;
    float dist = length(d) / sqrt(2.0);
    px *= 1.0 + u_vignette * 0.7 * smoothstep(0.35, 1.0, dist);
  }

  px = fitGamut(px);
  if (u_invert) px = 1.0 - px;
  vec3 v = floor(encode3(px) * 255.0 + 0.5);

  if (u_grain != 0.0) {
    vec2 g = vec2(tp) / u_grainCell;
    vec2 cell0 = floor(g);
    vec2 t = g - cell0;
    vec2 s = t * t * (3.0 - 2.0 * t);
    uint x0 = uint(cell0.x);
    uint y0 = uint(cell0.y);
    float n00 = hashNoise(x0, y0, u_seed);
    float n10 = hashNoise(x0 + 1u, y0, u_seed);
    float n01 = hashNoise(x0, y0 + 1u, u_seed);
    float n11 = hashNoise(x0 + 1u, y0 + 1u, u_seed);
    float top = n00 + (n10 - n00) * s.x;
    float coarse = top + ((n01 + (n11 - n01) * s.x) - top) * s.y;
    float fine = hashNoise(uint(tp.x), uint(tp.y), u_seed ^ 1540483477u);
    float noise = coarse * u_roughness + fine * (1.0 - u_roughness * 0.5);
    float luma = dot(v, vec3(0.2126, 0.7152, 0.0722)) / 255.0;
    float delta = noise * u_grain * 0.75 * 0.35 * (0.35 + 0.65 * (4.0 * luma * (1.0 - luma)));
    v = clamp(v + delta * vec3(1.0, 0.92, 0.88), 0.0, 255.0);
  }
  o = vec4(v / 255.0, src.a);
}`;

let state = null;
let broken = false;

function disabledByUser() {
  try {
    return localStorage.getItem("apix.gpuPipeline") === "off";
  } catch {
    return false;
  }
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`GPU pipeline shader: ${log}`);
  }
  return shader;
}

function program(gl, fragment) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`GPU pipeline link: ${gl.getProgramInfoLog(prog)}`);
  const uniforms = new Map();
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i);
    uniforms.set(info.name, gl.getUniformLocation(prog, info.name));
  }
  return { prog, uniforms };
}

function init() {
  if (broken || typeof document === "undefined") return null;
  if (state) return state;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
      broken = true;
      return null;
    }
    const floatLinear = Boolean(gl.getExtension("OES_texture_float_linear"));
    canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      broken = true;
      state = null;
    });
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    state = {
      canvas,
      gl,
      floatFormat: floatLinear ? { internal: gl.RG32F, rgb: gl.RGB32F } : { internal: gl.RG16F, rgb: gl.RGB16F },
      programs: {
        lightness: program(gl, LIGHTNESS),
        downsample: program(gl, DOWNSAMPLE),
        box: program(gl, BOX),
        coef: program(gl, COEF),
        main: program(gl, MAIN)
      },
      targets: new Map(),
      luts: new WeakMap(),
      tone: { table: null, texture: gl.createTexture() },
      source: gl.createTexture(),
      framebuffer: gl.createFramebuffer(),
      maxSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
    };
    return state;
  } catch (error) {
    console.warn("GPU colour pipeline unavailable, using CPU", error);
    broken = true;
    state = null;
    return null;
  }
}

function setSampling(gl, target, linear) {
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
}

// Reusable float render target, keyed by role.
function renderTarget(s, name, width, height) {
  const { gl } = s;
  let target = s.targets.get(name);
  if (!target || target.width !== width || target.height !== height) {
    if (target) gl.deleteTexture(target.texture);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, s.floatFormat.internal, width, height, 0, gl.RG, gl.FLOAT, null);
    setSampling(gl, gl.TEXTURE_2D, true);
    target = { texture, width, height };
    s.targets.set(name, target);
  }
  return target;
}

function lutTexture(s, lut) {
  if (!lut) return null;
  let texture = s.luts.get(lut);
  if (texture) return texture;
  const { gl } = s;
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, s.floatFormat.rgb, lut.size, lut.size, lut.size, 0, gl.RGB, gl.FLOAT, lut.data);
  setSampling(gl, gl.TEXTURE_3D, true);
  s.luts.set(lut, texture);
  return texture;
}

function toneTexture(s, table) {
  const { gl } = s;
  if (table && s.tone.table !== table) {
    gl.bindTexture(gl.TEXTURE_2D, s.tone.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, table.length, 1, 0, gl.RED, gl.FLOAT, table);
    setSampling(gl, gl.TEXTURE_2D, false);
    s.tone.table = table;
  }
  return s.tone.texture;
}

function bind(gl, unit, target, texture) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target, texture);
  return unit;
}

// Fixed texture unit per sampler: an unassigned sampler defaults to unit 0, and
// a 2D and a 3D sampler sharing a unit makes the draw call fail.
const SAMPLER_UNITS = { u_src: 0, u_in: 0, u_baseLut: 1, u_meanAB: 2, u_tone: 3, u_texBase: 4, u_colorLut: 5 };

function draw(s, prog, output, width, height, setUniforms) {
  const { gl } = s;
  gl.useProgram(prog.prog);
  for (const [name, unit] of Object.entries(SAMPLER_UNITS)) {
    const location = prog.uniforms.get(name);
    if (location) gl.uniform1i(location, unit);
  }
  if (output) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output.texture, 0);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  gl.viewport(0, 0, width, height);
  setUniforms(prog.uniforms);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function setBase(gl, u, baseTex, baseLut, unit) {
  gl.uniform1i(u.get("u_hasBase"), baseTex ? 1 : 0);
  gl.uniform1f(u.get("u_baseSize"), baseLut ? baseLut.size : 1);
  if (u.get("u_baseLut")) gl.uniform1i(u.get("u_baseLut"), unit);
}

/**
 * Run the colour pipeline of `source` (a canvas at its working resolution) on
 * the GPU. Returns the GL canvas holding the result, or null to use the CPU path.
 */
export function runColorPipelineGpu(source, adjustments, { scale = 1, seed = 1, interactive = false } = {}) {
  if (disabledByUser()) return null;
  const s = init();
  if (!s) return null;
  const width = source.width;
  const height = source.height;
  if (!width || !height || width > s.maxSize || height > s.maxSize) return null;
  const { gl } = s;

  try {
    const plan = prepareGpuPipeline(adjustments, { interactive });
    if (s.canvas.width !== width || s.canvas.height !== height) {
      s.canvas.width = width;
      s.canvas.height = height;
    }

    gl.bindTexture(gl.TEXTURE_2D, s.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    setSampling(gl, gl.TEXTURE_2D, false);

    const baseTex = lutTexture(s, plan.baseLut);
    const colorTex = lutTexture(s, plan.colorLut);
    const hasBaseLayer = Boolean(plan.toneTable) || plan.clarityAmount !== 0;
    const local = hasBaseLayer || plan.textureAmount !== 0;
    const longEdge = Math.max(width, height);
    let meanAB = null;
    let texBase = null;
    let factor = 1;
    let low = { width, height };

    if (local) {
      const lightness = renderTarget(s, "lightness", width, height);
      draw(s, s.programs.lightness, lightness, width, height, u => {
        gl.uniform1i(u.get("u_src"), bind(gl, 0, gl.TEXTURE_2D, s.source));
        if (baseTex) bind(gl, 1, gl.TEXTURE_3D, baseTex);
        setBase(gl, u, baseTex, plan.baseLut, 1);
      });

      const box = (input, output, w, h, dir, radius, square) => {
        draw(s, s.programs.box, output, w, h, u => {
          gl.uniform1i(u.get("u_in"), bind(gl, 0, gl.TEXTURE_2D, input.texture));
          gl.uniform2i(u.get("u_dir"), dir[0], dir[1]);
          gl.uniform1i(u.get("u_radius"), radius);
          gl.uniform2i(u.get("u_size"), w, h);
          gl.uniform1i(u.get("u_square"), square ? 1 : 0);
        });
      };

      if (hasBaseLayer) {
        // guidedFilterSelf: solve on a ≤ workEdge plane, then sample bilinearly.
        factor = Math.max(1, Math.ceil(longEdge / plan.workEdge));
        let plane = lightness;
        if (factor > 1) {
          low = { width: Math.max(1, Math.ceil(width / factor)), height: Math.max(1, Math.ceil(height / factor)) };
          plane = renderTarget(s, "low", low.width, low.height);
          draw(s, s.programs.downsample, plane, low.width, low.height, u => {
            gl.uniform1i(u.get("u_in"), bind(gl, 0, gl.TEXTURE_2D, lightness.texture));
            gl.uniform1i(u.get("u_factor"), factor);
            gl.uniform2i(u.get("u_inSize"), width, height);
          });
        }
        const r = Math.min(256, Math.max(1, Math.round(Math.max(2, Math.round(longEdge * 0.02)) / factor)));
        const tmp = renderTarget(s, "boxTmp", low.width, low.height);
        const means = renderTarget(s, "means", low.width, low.height);
        box(plane, tmp, low.width, low.height, [1, 0], r, true);
        box(tmp, means, low.width, low.height, [0, 1], r, false);
        const coef = renderTarget(s, "coef", low.width, low.height);
        draw(s, s.programs.coef, coef, low.width, low.height, u => {
          gl.uniform1i(u.get("u_in"), bind(gl, 0, gl.TEXTURE_2D, means.texture));
          gl.uniform1f(u.get("u_eps"), 0.012);
        });
        meanAB = renderTarget(s, "meanAB", low.width, low.height);
        box(coef, tmp, low.width, low.height, [1, 0], r, false);
        box(tmp, meanAB, low.width, low.height, [0, 1], r, false);
      }

      if (plan.textureAmount !== 0) {
        const rt = Math.min(256, Math.max(1, Math.round(longEdge * 0.002)));
        const tmp = renderTarget(s, "texTmp", width, height);
        texBase = renderTarget(s, "texBase", width, height);
        box(lightness, tmp, width, height, [1, 0], rt, false);
        box(tmp, texBase, width, height, [0, 1], rt, false);
      }
    }

    // Upload before binding: uploading binds on the active unit.
    const toneTex = plan.toneTable ? toneTexture(s, plan.toneTable) : null;
    draw(s, s.programs.main, null, width, height, u => {
      gl.uniform1i(u.get("u_src"), bind(gl, 0, gl.TEXTURE_2D, s.source));
      if (baseTex) bind(gl, 1, gl.TEXTURE_3D, baseTex);
      setBase(gl, u, baseTex, plan.baseLut, 1);
      gl.uniform2i(u.get("u_size"), width, height);
      gl.uniform1i(u.get("u_local"), local ? 1 : 0);
      gl.uniform1i(u.get("u_hasBaseLayer"), meanAB ? 1 : 0);
      if (meanAB) gl.uniform1i(u.get("u_meanAB"), bind(gl, 2, gl.TEXTURE_2D, meanAB.texture));
      gl.uniform1f(u.get("u_factor"), factor);
      gl.uniform2f(u.get("u_lowSize"), low.width, low.height);
      gl.uniform1i(u.get("u_hasTone"), plan.toneTable ? 1 : 0);
      if (toneTex) bind(gl, 3, gl.TEXTURE_2D, toneTex);
      gl.uniform1f(u.get("u_clarity"), plan.clarityAmount);
      gl.uniform1f(u.get("u_texture"), plan.textureAmount);
      if (texBase) gl.uniform1i(u.get("u_texBase"), bind(gl, 4, gl.TEXTURE_2D, texBase.texture));
      gl.uniform1i(u.get("u_hasColor"), colorTex ? 1 : 0);
      if (colorTex) gl.uniform1i(u.get("u_colorLut"), bind(gl, 5, gl.TEXTURE_3D, colorTex));
      gl.uniform1f(u.get("u_colorSize"), plan.colorLut ? plan.colorLut.size : 1);
      gl.uniform1f(u.get("u_vignette"), plan.vignette);
      gl.uniform1i(u.get("u_invert"), plan.invert ? 1 : 0);
      gl.uniform1f(u.get("u_grain"), plan.grain.amount);
      gl.uniform1f(u.get("u_grainCell"), Math.max(0.05, (0.5 + (plan.grain.size / 100) * 1.5) * scale));
      gl.uniform1f(u.get("u_roughness"), plan.grain.roughness / 100);
      gl.uniform1ui(u.get("u_seed"), seed >>> 0);
    });
    if (gl.isContextLost()) return null;
    return s.canvas;
  } catch (error) {
    console.warn("GPU colour pipeline failed, using CPU", error);
    broken = true;
    return null;
  }
}

/** Run the GPU pipeline in place on a 2D canvas; false when the CPU path must be used. */
export function applyColorPipelineGpuToCanvas(canvas, adjustments, options) {
  const result = runColorPipelineGpu(canvas, adjustments, options);
  if (!result) return false;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.save();
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(result, 0, 0);
  ctx.restore();
  return true;
}
