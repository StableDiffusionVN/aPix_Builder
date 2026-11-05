// Output media kinds aPix understands, matching what ComfyUI nodes return:
//   images  — SaveImage / PreviewImage (png…), SaveAnimatedWEBP/PNG ("animated")
//   video   — SaveVideo / SaveWEBM / PreviewVideo (mp4 · mkv · webm · mov, under
//             "images" + animated), VideoHelperSuite VHS_VideoCombine ("gifs"), "videos"
//   audio   — SaveAudio (flac) · SaveAudioMP3 · SaveAudioOpus · PreviewAudio ("audio")
//   model3d — SaveGLB / Preview3D ("3d", "result"): glb gltf obj fbx stl ply splat…
//   text    — PreviewAny / show-text nodes ("text")

export const MEDIA_KINDS = ["image", "video", "audio", "model3d", "text"];

const EXTENSIONS = {
  video: ["mp4", "m4v", "mkv", "webm", "mov", "avi"],
  audio: ["mp3", "wav", "flac", "opus", "ogg", "m4a", "aac"],
  model3d: ["glb", "gltf", "obj", "fbx", "stl", "ply", "splat", "ksplat", "spz", "usdz"],
  text: ["txt", "json", "md"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "avif", "apng"]
};

const MIME = {
  mp4: "video/mp4", m4v: "video/mp4", mkv: "video/x-matroska", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo",
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", opus: "audio/ogg", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac",
  glb: "model/gltf-binary", gltf: "model/gltf+json", obj: "model/obj", fbx: "application/octet-stream", stl: "model/stl",
  ply: "application/octet-stream", splat: "application/octet-stream", ksplat: "application/octet-stream", spz: "application/octet-stream", usdz: "model/vnd.usdz+zip",
  txt: "text/plain; charset=utf-8", json: "application/json; charset=utf-8", md: "text/markdown; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
  tif: "image/tiff", tiff: "image/tiff", avif: "image/avif", apng: "image/apng"
};

export function fileExtension(name = "") {
  const clean = String(name || "").split(/[?#]/)[0];
  const match = clean.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

/** "image" | "video" | "audio" | "model3d" | "text" from a file name (default image). */
export function mediaKindFromFilename(name = "") {
  const ext = fileExtension(name);
  for (const kind of ["video", "audio", "model3d", "text", "image"]) {
    if (EXTENSIONS[kind].includes(ext)) return kind;
  }
  return "image";
}

export function mimeForFilename(name = "", fallback = "application/octet-stream") {
  return MIME[fileExtension(name)] || fallback;
}

/** File extension for a RunningHub fileType ("mp4", "video/mp4", ".MP3") or a URL. */
export function extensionFromFileType(fileType = "", url = "") {
  const raw = String(fileType || "").trim().toLowerCase().replace(/^\./, "");
  if (raw) {
    const fromMime = Object.entries(MIME).find(([, mime]) => mime.split(";")[0] === raw);
    const candidate = fromMime ? fromMime[0] : raw.includes("/") ? raw.split("/").pop().replace(/^x-/, "") : raw;
    const known = Object.values(EXTENSIONS).flat();
    if (known.includes(candidate)) return candidate;
    if (candidate === "mpeg") return raw.startsWith("audio") ? "mp3" : "mp4";
    if (candidate === "quicktime") return "mov";
    if (candidate === "matroska") return "mkv";
  }
  const fromUrl = fileExtension(String(url || "").split("?")[0]);
  return fromUrl || "png";
}

const FILE_KEYS = ["images", "gifs", "videos", "video", "audio", "3d", "result"];

/**
 * Every file / text a ComfyUI output node produced (history.outputs[nodeId]).
 * Returns [{ kind, filename, subfolder, type } | { kind: "text", text }].
 */
export function collectNodeMedia(nodeOutput) {
  if (!nodeOutput || typeof nodeOutput !== "object") return [];
  const items = [];
  const seen = new Set();
  for (const key of FILE_KEYS) {
    const raw = Array.isArray(nodeOutput[key]) ? nodeOutput[key] : [];
    // Preview3D "result" = [model_file, camera_info, bg_image]: only the model counts.
    const list = key === "result" ? raw.slice(0, 1) : raw;
    for (const entry of list) {
      const file = typeof entry === "string"
        ? (key === "result" || key === "3d" ? { filename: entry.split("/").pop(), subfolder: entry.includes("/") ? entry.split("/").slice(0, -1).join("/") : "", type: "output" } : null)
        : entry;
      if (!file?.filename) continue;
      const id = `${file.type || "output"}/${file.subfolder || ""}/${file.filename}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const byName = mediaKindFromFilename(file.filename);
      const kind = key === "audio" ? "audio"
        : key === "3d" || key === "result" ? (byName === "image" ? "model3d" : byName)
          : byName;
      items.push({ kind, filename: file.filename, subfolder: file.subfolder || "", type: file.type || "output", ...(file.format ? { format: file.format } : {}) });
    }
  }
  const texts = Array.isArray(nodeOutput.text) ? nodeOutput.text : typeof nodeOutput.text === "string" ? [nodeOutput.text] : [];
  for (const text of texts) {
    const value = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    if (value.trim()) items.push({ kind: "text", text: value });
  }
  return items;
}
