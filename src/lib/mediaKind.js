const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|opus)(\?|#|$)/i;

/** Phân loại output theo đuôi file/url: "video" | "audio" | "image". */
export function mediaKindFromUrl(url = "") {
  const value = String(url || "");
  if (VIDEO_EXT.test(value) || value.startsWith("data:video/")) return "video";
  if (AUDIO_EXT.test(value) || value.startsWith("data:audio/")) return "audio";
  return "image";
}

export function isPlayableMedia(url = "") {
  return mediaKindFromUrl(url) !== "image";
}
