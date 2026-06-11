export async function downloadImage(output) {
  if (!output?.url) return;
  const response = await fetch(output.url);
  if (!response.ok) {
    throw new Error(document.documentElement.lang === "vi"
      ? `Không tải được ảnh: ${response.status}`
      : `Could not download the image: ${response.status}`);
  }
  const blob = await response.blob();
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = output.filename || "comfyui-output.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
