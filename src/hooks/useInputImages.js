import { useState } from "react";

export function useInputImages() {
  const [inputImages, setInputImages] = useState([]);

  async function refreshInputImages() {
    try {
      const res = await fetch("/api/input-images");
      if (!res.ok) return;
      const data = await res.json();
      setInputImages(data.images || []);
    } catch { setInputImages([]); }
  }

  return { inputImages, setInputImages, refreshInputImages };
}
