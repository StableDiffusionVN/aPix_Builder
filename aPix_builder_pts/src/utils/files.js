const { storage } = require("uxp");

export async function readUxFileAsDataUrl(file) {
  const bytes = await file.read({ format: storage.formats.binary });
  const ext = String(file.name || "").toLowerCase();
  const mime = ext.endsWith(".jpg") || ext.endsWith(".jpeg")
    ? "image/jpeg"
    : ext.endsWith(".webp")
      ? "image/webp"
      : "image/png";
  let binary = "";
  const buffer = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer || bytes);
  for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}
