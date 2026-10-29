// Read / write Adobe Camera Raw & Lightroom preset files (.xmp, crs namespace).
// Format only — mapping to aPix adjustments lives in src/lib/cameraRawPresets.js.

export const XMP_MAX_BYTES = 2 * 1024 * 1024;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) => {
    if (code[0] === "#") {
      const value = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Nested structures we do not interpret but must not misread as top-level
// settings (a Look carries its own crs:Name/ProcessVersion; masks carry local values).
const OPAQUE_BLOCK = /<crs:(Look|MaskGroupBasedCorrections|GradientBasedCorrections|CircularGradientBasedCorrections|PaintBasedCorrections|RetouchInfo|RedEyeInfo|LensBlur|PointColors)\b[\s\S]*?<\/crs:\1>/g;

/**
 * Parse a Camera Raw / Lightroom .xmp preset.
 * @returns {{ name: string, group: string, uuid: string, settings: Record<string,string>, sequences: Record<string,string[]>, blocks: string[] }}
 */
export function parseCameraRawXmp(text) {
  const source = String(text || "");
  if (source.length > XMP_MAX_BYTES) throw new Error("File XMP quá lớn.");
  if (!/camera-raw-settings\/1\.0/.test(source)) {
    throw new Error("Không phải preset Camera Raw/Lightroom (thiếu namespace crs).");
  }

  const blocks = [];
  let body = source.replace(OPAQUE_BLOCK, match => {
    blocks.push(match);
    return "";
  });

  const alt = {};
  body = body.replace(/<crs:(\w+)>\s*<rdf:Alt>([\s\S]*?)<\/rdf:Alt>\s*<\/crs:\1>/g, (_, key, inner) => {
    const preferred = inner.match(/<rdf:li[^>]*xml:lang="x-default"[^>]*>([\s\S]*?)<\/rdf:li>/)
      || inner.match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
    alt[key] = preferred ? decodeEntities(preferred[1].trim()) : "";
    return "";
  });

  const sequences = {};
  body = body.replace(/<crs:(\w+)>\s*<rdf:(?:Seq|Bag)>([\s\S]*?)<\/rdf:(?:Seq|Bag)>\s*<\/crs:\1>/g, (_, key, inner) => {
    sequences[key] = [...inner.matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g)].map(item => decodeEntities(item[1].trim()));
    return "";
  });

  const settings = {};
  for (const match of body.matchAll(/crs:(\w+)="([^"]*)"/g)) settings[match[1]] = decodeEntities(match[2]);
  for (const match of body.matchAll(/<crs:(\w+)>([^<]*)<\/crs:\1>/g)) settings[match[1]] = decodeEntities(match[2].trim());

  const name = alt.Name || settings.PresetName || alt.ShortName || "";
  const group = alt.Group || "";
  const uuid = settings.UUID || "";
  for (const key of ["Name", "ShortName", "SortName", "Group", "Description"]) delete alt[key];
  for (const [key, value] of Object.entries(alt)) settings[key] = value;
  delete settings.PresetName;
  delete settings.UUID;

  if (!Object.keys(settings).length && !Object.keys(sequences).length) {
    throw new Error("Preset XMP không có thiết lập nào.");
  }
  return { name, group, uuid, settings, sequences, blocks };
}

/** Points of a tone-curve sequence ("x, y" strings) → [{x, y}] (0–255). */
export function parseCurveSequence(items) {
  if (!Array.isArray(items)) return null;
  const points = items
    .map(item => item.split(",").map(part => Number(part.trim())))
    .filter(pair => pair.length === 2 && pair.every(Number.isFinite))
    .map(([x, y]) => ({ x: Math.max(0, Math.min(255, Math.round(x))), y: Math.max(0, Math.min(255, Math.round(y))) }))
    .sort((a, b) => a.x - b.x);
  return points.length >= 2 ? points : null;
}

function randomUuid() {
  const hex = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < 32; i++) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

const HEADER_DEFAULTS = {
  PresetType: "Normal",
  Cluster: "",
  SupportsAmount: "False",
  SupportsColor: "True",
  SupportsMonochrome: "True",
  SupportsHighDynamicRange: "True",
  SupportsNormalDynamicRange: "True",
  SupportsSceneReferred: "True",
  SupportsOutputReferred: "True",
  CameraModelRestriction: "",
  Copyright: "",
  ContactInfo: "",
  Version: "15.0",
  ProcessVersion: "11.0"
};

/** Write a preset Lightroom Classic / Lightroom / Camera Raw can import. */
export function serializeCameraRawXmp({ name, group = "", uuid, settings = {}, sequences = {}, blocks = [] }) {
  const attrs = { ...HEADER_DEFAULTS, UUID: uuid || randomUuid(), ...settings, HasSettings: "True" };
  const attrLines = Object.entries(attrs).map(([key, value]) => `   crs:${key}="${escapeXml(value)}"`);
  const altTag = (key, value) => [
    `   <crs:${key}>`,
    "    <rdf:Alt>",
    `     <rdf:li xml:lang="x-default">${escapeXml(value)}</rdf:li>`,
    "    </rdf:Alt>",
    `   </crs:${key}>`
  ];
  const children = [
    ...altTag("Name", name || "aPix preset"),
    ...altTag("ShortName", ""),
    ...altTag("SortName", ""),
    ...altTag("Group", group),
    ...altTag("Description", "")
  ];
  for (const [key, items] of Object.entries(sequences)) {
    children.push(`   <crs:${key}>`, "    <rdf:Seq>");
    for (const item of items) children.push(`     <rdf:li>${escapeXml(item)}</rdf:li>`);
    children.push("    </rdf:Seq>", `   </crs:${key}>`);
  }
  for (const block of blocks) children.push(`   ${block}`);

  return [
    "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"aPix Builder\">",
    " <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">",
    "  <rdf:Description rdf:about=\"\"",
    "    xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\"",
    `${attrLines.join("\n")}>`,
    ...children,
    "  </rdf:Description>",
    " </rdf:RDF>",
    "</x:xmpmeta>",
    ""
  ].join("\n");
}
