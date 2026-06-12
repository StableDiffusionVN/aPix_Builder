const pickedFolderCache = new Map();

function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || "").startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic|heif)$/i.test(String(file.name || ""));
}

export function registerPickedFolderFiles(fileList = []) {
  const files = [...fileList]
    .filter(isImageFile)
    .sort((a, b) => String(a.webkitRelativePath || a.name).localeCompare(
      String(b.webkitRelativePath || b.name),
      undefined,
      { sensitivity: "base" }
    ));
  const sessionId = crypto.randomUUID();
  pickedFolderCache.set(sessionId, files);
  return { sessionId, files, imageCount: files.length };
}

export function getPickedFolderFiles(sessionId) {
  return pickedFolderCache.get(sessionId) || [];
}

export function clearPickedFolderFiles(sessionId) {
  if (sessionId) pickedFolderCache.delete(sessionId);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function pickedFolderFilesToValues(sessionId) {
  const files = getPickedFolderFiles(sessionId);
  return Promise.all(files.map(file => fileToDataUrl(file)));
}
