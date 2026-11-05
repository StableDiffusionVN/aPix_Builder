import { describe, expect, it } from "vitest";
import { collectNodeMedia, extensionFromFileType, mediaKindFromFilename, mimeForFilename } from "../shared/outputMedia.js";
import { mediaKindFromUrl, outputMediaKind } from "../src/lib/mediaKind.js";
import { collectOutputs } from "../server/lib/workflowPatcher.js";

// history.outputs[nodeId] shapes as ComfyUI returns them (comfy_api/latest/_ui.py + VHS).
const NODES = {
  saveImage: { images: [{ filename: "ComfyUI_00001_.png", subfolder: "", type: "output" }] },
  animatedWebp: { images: [{ filename: "ComfyUI_00002_.webp", subfolder: "", type: "output" }], animated: [true] },
  saveVideo: { images: [{ filename: "ComfyUI_00003_.mp4", subfolder: "video", type: "output" }], animated: [true] },
  saveWebm: { images: [{ filename: "clip_00001_.webm", subfolder: "", type: "output" }], animated: [true] },
  vhs: { gifs: [{ filename: "AnimateDiff_00001.mp4", subfolder: "", type: "output", format: "video/h264-mp4" }] },
  saveAudio: { audio: [{ filename: "ComfyUI_00001_.flac", subfolder: "audio", type: "output" }] },
  saveMp3: { audio: [{ filename: "song_00001_.mp3", subfolder: "audio", type: "output" }] },
  saveGlb: { "3d": [{ filename: "mesh_00001_.glb", subfolder: "3d", type: "output" }], camera_info: [null] },
  preview3d: { result: ["3d/mesh_00002_.obj", null, "temp/bg.png"] },
  previewAny: { text: ["a cat sitting on a sofa"] }
};

describe("ComfyUI output kinds", () => {
  it("collects image, video, audio, 3D and text outputs", () => {
    const kinds = Object.fromEntries(Object.entries(NODES).map(([name, node]) => [name, collectNodeMedia(node).map(item => item.kind)]));
    expect(kinds).toEqual({
      saveImage: ["image"],
      animatedWebp: ["image"],
      saveVideo: ["video"],
      saveWebm: ["video"],
      vhs: ["video"],
      saveAudio: ["audio"],
      saveMp3: ["audio"],
      saveGlb: ["model3d"],
      preview3d: ["model3d"],
      previewAny: ["text"]
    });
    expect(collectNodeMedia(NODES.preview3d)[0]).toMatchObject({ filename: "mesh_00002_.obj", subfolder: "3d" });
    expect(collectNodeMedia(NODES.previewAny)[0].text).toBe("a cat sitting on a sofa");
  });

  it("builds run outputs for every kind (server collectOutputs)", () => {
    const config = { output: { video: { id: "1" }, audio: { id: "2" }, text: { id: "3" } } };
    const history = { outputs: { 1: NODES.vhs, 2: NODES.saveAudio, 3: NODES.previewAny } };
    const outputs = collectOutputs(config, history, { proxyAddress: "http://127.0.0.1:8188" });
    expect(outputs.map(item => item.kind)).toEqual(["video", "audio", "text"]);
    expect(outputs[0].url).toContain("filename=AnimateDiff_00001.mp4");
    expect(outputs[2].text).toBe("a cat sitting on a sofa");
  });

  it("detects kinds from app urls with extra query params", () => {
    expect(mediaKindFromUrl("/api/output-image?name=1_run_0_clip.mp4&v=1700000000")).toBe("video");
    expect(mediaKindFromUrl("/api/comfy-view?address=x&filename=a.flac&subfolder=audio&type=output")).toBe("audio");
    expect(mediaKindFromUrl("/api/output-image?name=m.glb")).toBe("model3d");
    expect(mediaKindFromUrl("/api/output-image?name=t.txt")).toBe("text");
    expect(mediaKindFromUrl("/api/output-image?name=p.png&v=2")).toBe("image");
    expect(mediaKindFromUrl("https://cdn.example.com/out.mkv")).toBe("video");
    expect(outputMediaKind({ kind: "audio", url: "/x?name=a.bin" })).toBe("audio");
  });

  it("maps RunningHub file types and MIME types", () => {
    expect(extensionFromFileType("mp4", "")).toBe("mp4");
    expect(extensionFromFileType("video/mp4", "")).toBe("mp4");
    expect(extensionFromFileType("audio/mpeg", "")).toBe("mp3");
    expect(extensionFromFileType("", "https://rh.cn/a/b.wav?sig=1")).toBe("wav");
    expect(extensionFromFileType("", "https://rh.cn/a/b")).toBe("png");
    expect(mediaKindFromFilename("x.MOV")).toBe("video");
    expect(mimeForFilename("x.mkv")).toBe("video/x-matroska");
    expect(mimeForFilename("x.flac")).toBe("audio/flac");
  });
});
