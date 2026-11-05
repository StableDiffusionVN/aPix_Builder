import { lazy, Suspense, useEffect, useState } from "react";
import { Box, FileText, Music } from "lucide-react";
import { outputMediaKind } from "../lib/mediaKind.js";
import "../styles/outputMedia.css";

const Model3DViewer = lazy(() => import("./Model3DViewer.jsx"));

/** Text output: inline text from the run, or fetched from its .txt file. */
function TextOutput({ output, compact }) {
  const [text, setText] = useState(output?.text || "");
  useEffect(() => {
    if (output?.text || !output?.url) return undefined;
    let cancelled = false;
    fetch(output.url).then(response => (response.ok ? response.text() : "")).then(value => {
      if (!cancelled) setText(value);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [output?.text, output?.url]);
  return <pre className={`outputTextView${compact ? " isCompact" : ""}`}>{text || "…"}</pre>;
}

/**
 * Full view of a non-image output (video · audio · 3D model · text).
 * Images keep their existing <img> pipelines (colour panel, compare, zoom…).
 */
export function OutputMediaView({ output, url, className = "", compact = false }) {
  const item = output || { url };
  const src = item.url || url || "";
  const kind = outputMediaKind(item);
  if (kind === "video") {
    return <video key={src} className={`outputMediaVideo ${className}`} src={src} controls playsInline preload="metadata" />;
  }
  if (kind === "audio") {
    return (
      <div className={`outputMediaAudio ${className}`}>
        <Music size={compact ? 18 : 34} />
        <audio key={src} src={src} controls preload="metadata" />
      </div>
    );
  }
  if (kind === "model3d") {
    return (
      <div className={`outputMedia3d ${className}`}>
        <Suspense fallback={<span className="model3dStatus">Đang tải trình xem 3D…</span>}>
          <Model3DViewer url={src} />
        </Suspense>
      </div>
    );
  }
  if (kind === "text") return <TextOutput output={item} compact={compact} />;
  return null;
}

/** Small thumbnail for history lists / rails (no 3D render, no autoplay). */
export function OutputMediaThumb({ output, url, className = "" }) {
  const item = output || { url };
  const src = item.url || url || "";
  const kind = outputMediaKind(item);
  if (kind === "video") return <video className={`outputMediaThumb ${className}`} src={src} muted playsInline preload="metadata" />;
  const Icon = kind === "audio" ? Music : kind === "model3d" ? Box : FileText;
  const label = kind === "audio" ? "Audio" : kind === "model3d" ? "3D" : "Text";
  return (
    <div className={`outputMediaThumb isIcon kind-${kind} ${className}`}>
      <Icon size={18} />
      <span>{label}</span>
    </div>
  );
}
