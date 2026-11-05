import { mediaKindFromFilename } from "../../shared/outputMedia.js";

/**
 * Kind of an output from its url / file name: "image" | "video" | "audio" | "model3d" | "text".
 * Handles query urls: /api/output-image?name=x.mp4&v=1, /api/comfy-view?filename=x.mp4&subfolder=…
 */
export function mediaKindFromUrl(url = "") {
  const value = String(url || "");
  const dataMatch = value.match(/^data:([a-z]+)\//i);
  if (dataMatch) {
    const type = dataMatch[1].toLowerCase();
    if (type === "video" || type === "audio") return type;
    if (type === "text") return "text";
    if (type === "model") return "model3d";
    return "image";
  }
  const queryIndex = value.indexOf("?");
  if (queryIndex >= 0) {
    try {
      const params = new URLSearchParams(value.slice(queryIndex + 1).split("#")[0]);
      const named = params.get("name") || params.get("filename") || params.get("file");
      if (named) return mediaKindFromFilename(named);
    } catch {
      // Fall through to the path.
    }
  }
  return mediaKindFromFilename(value.split(/[?#]/)[0]);
}

/** Kind of a history / run output item (server sets `kind`; older items only have a url). */
export function outputMediaKind(output) {
  if (!output) return "image";
  if (typeof output === "string") return mediaKindFromUrl(output);
  return output.kind || mediaKindFromUrl(output.url || output.filename || "");
}

export function isPlayableMedia(url = "") {
  const kind = mediaKindFromUrl(url);
  return kind === "video" || kind === "audio";
}

/** Only images can be colour-adjusted, edited, compared or used as image inputs. */
export function isImageOutput(output) {
  return outputMediaKind(output) === "image";
}
