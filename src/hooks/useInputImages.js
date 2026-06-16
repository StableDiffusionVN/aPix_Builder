import { useState } from "react";

export function useInputImages() {
  const [inputImages, setInputImages] = useState([]);

  async function refreshInputImages() {
    try {
      const res = await fetch("/api/input-images");
      if (!res.ok) return [];
      const data = await res.json();
      const images = data.images || [];
      setInputImages(images);
      return images;
    } catch {
      setInputImages([]);
      return [];
    }
  }

  return { inputImages, setInputImages, refreshInputImages };
}
