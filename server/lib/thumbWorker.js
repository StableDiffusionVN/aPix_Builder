// Worker thread: decode a large output image and write a small JPEG thumbnail.
// Runs off the main thread because the server lives in Electron's main process —
// decoding a 4K PNG there would freeze the whole app.
import { parentPort } from "node:worker_threads";
import { rename, writeFile } from "node:fs/promises";

let jimpModule;

parentPort.on("message", async ({ id, src, dest, size }) => {
  try {
    jimpModule ||= await import("jimp");
    const image = await jimpModule.Jimp.read(src);
    const { width, height } = image.bitmap;
    const scale = Math.min(1, size / Math.min(width, height));
    if (scale < 1) {
      image.resize({ w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) });
    }
    const buffer = await image.getBuffer("image/jpeg", { quality: 82 });
    const tmp = `${dest}.${process.pid}.tmp`;
    await writeFile(tmp, buffer);
    await rename(tmp, dest);
    parentPort.postMessage({ id, ok: true });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
});
